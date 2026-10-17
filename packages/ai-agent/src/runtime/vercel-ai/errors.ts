export function createAbortError(reason?: unknown): Error {
  const message = typeof reason === 'string' && reason.trim()
    ? reason
    : 'AI generation was aborted'
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

/**
 * AI 调用失败时的错误整理。
 *
 * Vercel AI SDK 有三个行为会把真实原因藏起来：
 * 1. 重试耗尽后抛 `RetryError`，message 是
 *    "Failed after 3 attempts. Last error: ..."，里层错误被文字包住；
 * 2. 上游（自建网关或 nginx）如果回的不是 JSON，APICallError 的 message 会退化成
 *    HTTP 状态文本，于是界面只剩一句 "AI_APICallError: Bad Gateway"；
 * 3. 消息数组里有 SDK 不接受的值时抛 `InvalidPromptError`，message 只有
 *    "Invalid prompt: The messages do not match the ModelMessage[] schema."，
 *    既不说哪条消息、也不说为什么（真正的原因藏在 cause 链的 ZodError 里）。
 *
 * 这里做三件事：拆掉重试包装，取真正失败的那次错误；若它是 API 调用错误且响应体里
 * 有可读原因（而 message 没带上），就把响应体补进 message；若它是消息校验错误，就补上
 * 出错的消息下标与 role。目的只有一个——让用户看到「为什么失败」，而不是「失败了」。
 */

/** SDK 的重试包装错误名，见 @ai-sdk/provider-utils 的 createRetryError。 */
const RETRY_ERROR_NAME = 'AI_RetryError'

/** SDK 的消息校验错误名，见 @ai-sdk/provider-utils 的 InvalidPromptError。 */
const INVALID_PROMPT_ERROR_NAME = 'AI_InvalidPromptError'

/** 重试包装最多套几层，防御异常结构导致的死循环。 */
const MAX_UNWRAP_DEPTH = 4

/** 沿 cause 链找 zod 校验结果时最多走几层（InvalidPromptError → TypeValidationError → ZodError）。 */
const MAX_CAUSE_DEPTH = 4

/** 补进 message 的响应体片段长度上限。 */
const RESPONSE_DETAIL_MAX_CHARS = 240

/**
 * 消息校验失败时最可能的成因提示。宿主工具（Wails 绑定、MCP）的返回值会被 SDK 原样
 * 写进下一轮消息，而 modelMessageSchema 只接受纯 JSON；shared 层已统一净化（tool-output.ts），
 * 这里再写一句是为了让漏网的情况一眼能看出方向。
 */
const TOOL_OUTPUT_HINT = '工具返回值必须是纯 JSON（Date、BigInt、NaN、数组中的 undefined、class 实例都不行）'

/** 逐层取 JSON 里的原因字段，覆盖 OpenAI 兼容体与常见网关体。 */
const MESSAGE_KEYS = ['message', 'detail', 'error_description', 'msg'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 从重试错误里取出真正失败的那次（RetryError.lastError）。 */
function unwrapRetryError(error: Error): Error {
  let current = error
  for (let depth = 0; depth < MAX_UNWRAP_DEPTH; depth += 1) {
    if (current.name !== RETRY_ERROR_NAME) break
    const lastError = isRecord(current) ? current.lastError : undefined
    if (!(lastError instanceof Error)) break
    current = lastError
  }
  return current
}

/** 递归读 JSON 里的原因字段（`{error:{message}}` / `{error:"..."}` / `{message}`）。 */
function readJsonDetail(value: unknown, depth = 0): string {
  if (depth > 3 || !isRecord(value)) return ''
  for (const key of MESSAGE_KEYS) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  const nested = value.error
  if (typeof nested === 'string' && nested.trim()) return nested.trim()
  return readJsonDetail(nested, depth + 1)
}

/** 响应体里的人类可读原因：JSON 取字段，纯文本（含 HTML 错误页）去标签后截断。 */
function extractResponseDetail(responseBody: unknown): string {
  const body = typeof responseBody === 'string' ? responseBody.trim() : ''
  if (!body) return ''

  let detail = ''
  if (body.startsWith('{') || body.startsWith('[')) {
    try {
      detail = readJsonDetail(JSON.parse(body) as unknown)
    } catch {
      detail = ''
    }
  }
  if (!detail) {
    detail = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  return detail.length > RESPONSE_DETAIL_MAX_CHARS
    ? `${detail.slice(0, RESPONSE_DETAIL_MAX_CHARS)}…`
    : detail
}

/** APICallError（或任何带 HTTP 状态码的错误）才值得去翻响应体。 */
function looksLikeApiCallError(error: Error): boolean {
  return error.name === 'AI_APICallError' || typeof (error as { statusCode?: unknown }).statusCode === 'number'
}

/** 沿 cause 链取第一个带该字段的节点：InvalidPromptError 自身没有，TypeValidationError 有 value、ZodError 有 issues。 */
function findCauseValue(error: Error, key: string): unknown {
  let node: unknown = error
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (!isRecord(node)) return undefined
    if (node[key] !== undefined) return node[key]
    node = node.cause
  }
  return undefined
}

/**
 * 定位「哪条消息不合 schema」。
 *
 * zod 只在最外层 issue 的 path 里留下数组下标（数组元素校验失败时 path 就是 [index]），
 * 里层 union 的叶子 path 是相对该消息的（如 ["role"]），所以只读顶层。
 * 拿不到下标时返回空串，让调用方保持原有 message。
 */
function describeInvalidPrompt(failure: Error): string {
  const issues = findCauseValue(failure, 'issues')
  if (!Array.isArray(issues) || issues.length === 0) return ''
  const first = issues[0]
  const path = isRecord(first) && Array.isArray(first.path) ? first.path : []
  const index = path[0]
  if (typeof index !== 'number') return ''

  const messages = findCauseValue(failure, 'value')
  const entry = Array.isArray(messages) ? messages[index] : undefined
  const role = isRecord(entry) && typeof entry.role === 'string' ? entry.role : ''

  const parts = [`messages[${index}]`]
  if (role) parts.push(`role "${role}"`)
  // 只有工具消息才附上成因提示，避免在别的分支上误导
  if (role === 'tool') parts.push(TOOL_OUTPUT_HINT)
  return parts.join(' · ')
}

function withCause(error: Error, cause: unknown): Error {
  if (cause !== error) (error as { cause?: unknown }).cause = cause
  return error
}

/**
 * 整理 AI 调用错误：拆重试包装、补齐响应体原因、定位不合 schema 的消息。
 * 与本次失败无关的错误原样返回，避免破坏 AbortError 等调用方依赖的语义。
 */
export function normalizeAiError(error: unknown): Error {
  if (!(error instanceof Error)) return new Error(String(error))

  const failure = unwrapRetryError(error)
  const fromRetry = failure !== error
  const invalidPrompt = error.name === INVALID_PROMPT_ERROR_NAME
    || failure.name === INVALID_PROMPT_ERROR_NAME
  if (!fromRetry && !invalidPrompt && !looksLikeApiCallError(error)) return error

  const statusCode = (failure as { statusCode?: unknown }).statusCode
  const detail = extractResponseDetail((failure as { responseBody?: unknown }).responseBody)
  const baseMessage = (failure.message || error.message || '').trim() || 'AI 请求失败'

  let message = baseMessage
  if (detail && !baseMessage.includes(detail)) {
    message = typeof statusCode === 'number'
      ? `${baseMessage} (HTTP ${statusCode}): ${detail}`
      : `${baseMessage}: ${detail}`
  }
  if (invalidPrompt) {
    const hint = describeInvalidPrompt(failure)
    if (hint) message = `${message} (${hint})`
  }

  if (!fromRetry && message === error.message) return error

  const normalized = new Error(message)
  normalized.name = failure.name
  return withCause(normalized, error)
}
