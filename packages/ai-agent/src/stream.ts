/**
 * 基于 Vercel AI SDK 的文本生成执行层。
 *
 * 同一份项目 API 在两种环境运行：
 * - desktop：Wails WebView 调用本地 Go OpenAI 兼容代理；
 * - web：服务端直连上游，或浏览器经 Hono 安全代理。
 */

import {
  generateVercelAiText,
  streamVercelAiText,
} from './runtime/vercel-ai/text'
import type { EditorAiChatMessage, EditorAiEndpoint } from './types'

export interface EditorAiRuntimeToolExecutionContext {
  signal?: AbortSignal
  toolCallId?: string
}

export interface EditorAiRuntimeTool {
  description?: string
  inputSchema: Record<string, unknown>
  execute: (input: unknown, context?: EditorAiRuntimeToolExecutionContext) => Promise<unknown>
}

export type EditorAiReasoningEffort = 'low' | 'medium' | 'high'

export interface EditorAiUsage {
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  cacheReadTokens?: number
}

export type EditorAiStreamEvent =
  | { type: 'response-start'; id: string }
  | { type: 'response-end'; id: string }
  | { type: 'text-delta'; id: string; text: string }
  | { type: 'reasoning-delta'; id: string; text: string }
  | { type: 'tool-input-start'; id: string; name: string }
  | { type: 'tool-input-delta'; id: string; delta: string }
  | { type: 'tool-call'; id: string; name: string; input?: unknown }
  | { type: 'tool-result'; id: string; name: string; input?: unknown; output: unknown }
  | { type: 'tool-error'; id: string; name: string; input?: unknown; error: string }

export type EditorAiTraceBlock =
  | { type: 'activity'; id: string; status: 'waiting' }
  | { type: 'text'; id: string; text: string }
  /**
   * 思考段。`startedAt` / `endedAt` 是本进程内的 `performance.now()` 读数，只在
   * 「这段思考想了多久」这一个用途上存在：起点在第一个 reasoning-delta 打，终点在
   * 正文或工具开始流出时补。落在块上而不是单独一个 metadata 字段，是为了让同一条
   * 消息里多次思考各算各的，也省得每个流式消费者各自再记一份计时。
   */
  | { type: 'reasoning'; id: string; text: string; startedAt?: number; endedAt?: number }
  | {
    type: 'tool'
    id: string
    name: string
    status: 'preparing' | 'running' | 'completed' | 'failed'
    inputText?: string
    input?: unknown
    output?: unknown
    error?: string
  }

export interface EditorAiAssistantTraceMetadata {
  type: 'assistant_trace'
  blocks: EditorAiTraceBlock[]
}

function appendTraceTextBlock(
  blocks: EditorAiTraceBlock[],
  type: 'text' | 'reasoning',
  id: string,
  text: string,
  at: number,
): EditorAiTraceBlock[] {
  if (!text) return blocks
  const index = blocks.findIndex(block => block.type === type && block.id === id)
  if (index < 0) return [...blocks, type === 'reasoning' ? { type, id, text, startedAt: at } : { type, id, text }]
  const current = blocks[index]
  if (!current || current.type !== type) return blocks
  const next = blocks.slice()
  next[index] = { ...current, text: current.text + text }
  return next
}

/** 思考结束：正文或工具开始流出时，把还开着的思考段封口（之后再来 delta 就不再计时）。 */
function closeReasoningBlocks(blocks: EditorAiTraceBlock[], at: number): EditorAiTraceBlock[] {
  let changed = false
  const next = blocks.map((block) => {
    if (block.type !== 'reasoning' || block.endedAt !== undefined || block.startedAt === undefined) return block
    changed = true
    return { ...block, endedAt: at }
  })
  return changed ? next : blocks
}

function updateTraceToolBlock(
  blocks: EditorAiTraceBlock[],
  id: string,
  create: () => Extract<EditorAiTraceBlock, { type: 'tool' }>,
  update: (block: Extract<EditorAiTraceBlock, { type: 'tool' }>) => Extract<EditorAiTraceBlock, { type: 'tool' }>,
): EditorAiTraceBlock[] {
  const index = blocks.findIndex(block => block.type === 'tool' && block.id === id)
  if (index < 0) return [...blocks, create()]
  const current = blocks[index]
  if (!current || current.type !== 'tool') return blocks
  const next = blocks.slice()
  next[index] = update(current)
  return next
}

export function reduceEditorAiTrace(
  blocks: EditorAiTraceBlock[],
  event: EditorAiStreamEvent,
): EditorAiTraceBlock[] {
  // 计时只在两个位置用到：思考段出生、思考段结束。取同一时刻的读数，
  // 免得一条事件里两处差出几微秒（数值上无所谓，纯为可读）。
  const now = performance.now()
  if (event.type === 'response-start') {
    return blocks.some(block => block.type === 'activity' && block.id === event.id)
      ? blocks
      : [...blocks, { type: 'activity', id: event.id, status: 'waiting' }]
  }
  if (event.type === 'response-end') {
    return closeReasoningBlocks(
      blocks.filter(block => block.type !== 'activity' || block.id !== event.id),
      now,
    )
  }

  const visibleBlocks = blocks.filter(block => block.type !== 'activity')
  if (event.type === 'text-delta' || event.type === 'reasoning-delta') {
    return appendTraceTextBlock(
      event.type === 'text-delta' ? closeReasoningBlocks(visibleBlocks, now) : visibleBlocks,
      event.type === 'text-delta' ? 'text' : 'reasoning',
      event.id,
      event.text,
      now,
    )
  }
  // 工具开始动 = 思考已经结束（下一段思考会开新的块）。
  const closedBlocks = closeReasoningBlocks(visibleBlocks, now)
  if (event.type === 'tool-input-start') {
    return updateTraceToolBlock(
      closedBlocks,
      event.id,
      () => ({ type: 'tool', id: event.id, name: event.name, status: 'preparing' }),
      block => ({ ...block, name: event.name }),
    )
  }
  if (event.type === 'tool-input-delta') {
    return updateTraceToolBlock(
      closedBlocks,
      event.id,
      () => ({ type: 'tool', id: event.id, name: '', status: 'preparing', inputText: event.delta }),
      block => ({ ...block, inputText: (block.inputText ?? '') + event.delta }),
    )
  }
  if (event.type === 'tool-call') {
    return updateTraceToolBlock(
      closedBlocks,
      event.id,
      () => ({ type: 'tool', id: event.id, name: event.name, status: 'running', input: event.input }),
      block => ({ ...block, name: event.name, status: 'running', input: event.input }),
    )
  }
  if (event.type === 'tool-result') {
    return updateTraceToolBlock(
      closedBlocks,
      event.id,
      () => ({
        type: 'tool', id: event.id, name: event.name, status: 'completed',
        ...(event.input === undefined ? {} : { input: event.input }),
        ...(event.output === undefined ? {} : { output: event.output }),
      }),
      block => {
        const { error: _error, ...withoutError } = block
        return {
          ...withoutError, name: event.name, status: 'completed',
          ...(event.input === undefined ? {} : { input: event.input }),
          ...(event.output === undefined ? {} : { output: event.output }),
        }
      },
    )
  }
  return updateTraceToolBlock(
    closedBlocks,
    event.id,
    () => ({
      type: 'tool', id: event.id, name: event.name, status: 'failed',
      input: event.input, error: event.error,
    }),
    block => ({
      ...block, name: event.name, status: 'failed', input: event.input, error: event.error,
    }),
  )
}

export function readEditorAiAssistantTrace(value: unknown): EditorAiTraceBlock[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const candidate = value as { type?: unknown; blocks?: unknown }
  if (candidate.type !== 'assistant_trace' || !Array.isArray(candidate.blocks)) return []
  return candidate.blocks.filter((block): block is EditorAiTraceBlock => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return false
    const item = block as { type?: unknown; id?: unknown; text?: unknown; name?: unknown; status?: unknown }
    if (typeof item.id !== 'string') return false
    if (item.type === 'activity') return item.status === 'waiting'
    if (item.type === 'text' || item.type === 'reasoning') return typeof item.text === 'string'
    return item.type === 'tool'
      && typeof item.name === 'string'
      && (item.status === 'preparing' || item.status === 'running' || item.status === 'completed' || item.status === 'failed')
  })
}

export interface StreamEditorAiOptions {
  endpoint: EditorAiEndpoint
  model: string
  messages: EditorAiChatMessage[]
  temperature?: number
  reasoningEffort?: EditorAiReasoningEffort
  signal?: AbortSignal
  onChunk: (text: string) => void
  onEvent?: (event: EditorAiStreamEvent) => void
  onUsage?: (usage: EditorAiUsage) => void
  tools?: Record<string, EditorAiRuntimeTool>
}

/** 流式生成：逐段回调 onChunk，结束后返回完整文本。 */
export async function streamEditorAiText(
  options: StreamEditorAiOptions,
): Promise<string> {
  return streamVercelAiText({
    ...options,
    temperature: options.temperature ?? 0.7,
    reasoningEffort: options.reasoningEffort,
    tools: options.tools,
  })
}

export interface GenerateEditorAiOptions {
  endpoint: EditorAiEndpoint
  model: string
  messages: EditorAiChatMessage[]
  temperature?: number
  signal?: AbortSignal
}

/** 非流式生成（标题、提示词润色等短任务）。 */
export async function generateEditorAiText(
  options: GenerateEditorAiOptions,
): Promise<string> {
  const text = await generateVercelAiText({
    ...options,
    temperature: options.temperature ?? 0.4,
  })
  const trimmed = text.trim()
  if (!trimmed) throw new Error('AI generation returned empty content')
  return trimmed
}
