import type { JsonValue } from '../../domain/json'

/**
 * 工具返回值净化：把宿主工具结果转成纯 JSON。
 *
 * AI SDK 会把工具返回值原样放进下一轮的模型消息（tool-result 的 output），而
 * `modelMessageSchema` 只接受 null / string / number / boolean / 数组 / 纯对象。
 * 宿主工具经常返回非纯 JSON：Wails v3 绑定返回的是 class 实例
 * （`AiArticleDetailDTO` 里的 `assets` 是 `AiArticleAssetDTO[]`），MCP 结果里可能带
 * Date、BigInt、NaN、数组中的 undefined。只要漏一个进去，SDK 下一步校验就会抛
 * `Invalid prompt: The messages do not match the ModelMessage[] schema.`，
 * 用户只能看到一个和真实原因无关的报错。因此所有宿主工具结果都必须先过这里。
 */
export const MAX_TOOL_OUTPUT_DEPTH = 12

/** 表示「这个键值不能出现在 JSON 里」，由对象分支丢弃（数组分支写成 null 以保下标）。 */
const DROP = Symbol('mo-gallery.tool-output.drop')

type Sanitized = JsonValue | typeof DROP

/**
 * 深拷贝净化：Date → ISO 字符串，BigInt → 字符串，NaN/Infinity → null，
 * 函数与 symbol → 丢弃（对象键）或 null（数组元素），class 实例 → 普通对象，
 * Error → { name, message }，二进制 → 描述对象，循环引用与超深结构 → 占位字符串。
 */
export function toJsonSafeValue(value: unknown): JsonValue {
  return unwrap(toSafeValue(value, 0, new Set<object>()))
}

function unwrap(value: Sanitized): JsonValue {
  return value === DROP ? null : value
}

function toSafeValue(value: unknown, depth: number, seen: Set<object>): Sanitized {
  if (value === null) return null
  // undefined 与 JSON.stringify 保持一致：对象里丢掉这个键，数组里写成 null（保下标）
  if (value === undefined) return DROP

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value
    case 'number':
      // JSON 没有 NaN / ±Infinity：既过不了 schema，早期版本还会在序列化时直接抛错
      return Number.isFinite(value) ? value : null
    case 'bigint':
      return value.toString()
    case 'function':
    case 'symbol':
      return DROP
    case 'object':
      break
    default:
      return DROP
  }

  const target = value as object
  if (seen.has(target)) return '[循环引用]'
  if (depth >= MAX_TOOL_OUTPUT_DEPTH) return '[层级过深]'

  if (target instanceof Date) {
    return Number.isFinite(target.getTime()) ? target.toISOString() : null
  }
  if (target instanceof Error) {
    return { name: target.name || 'Error', message: target.message || '' }
  }
  if (target instanceof Uint8Array) {
    return { type: 'binary', byteLength: target.byteLength }
  }

  seen.add(target)
  try {
    if (Array.isArray(target)) {
      return target.map(item => unwrap(toSafeValue(item, depth + 1, seen)))
    }
    if (target instanceof Map) {
      return [...target.entries()].map(([key, item]) => [
        unwrap(toSafeValue(key, depth + 1, seen)),
        unwrap(toSafeValue(item, depth + 1, seen)),
      ])
    }
    if (target instanceof Set) {
      return [...target.values()].map(item => unwrap(toSafeValue(item, depth + 1, seen)))
    }

    // 注意：只按自有可枚举属性重建，正是这一步把 Wails 的 class 实例变成普通对象
    const result: Record<string, JsonValue> = {}
    for (const [key, item] of Object.entries(target as Record<string, unknown>)) {
      const safe = toSafeValue(item, depth + 1, seen)
      if (safe !== DROP) result[key] = safe
    }
    return result
  } finally {
    seen.delete(target)
  }
}
