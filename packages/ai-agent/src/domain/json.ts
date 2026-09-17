export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (Array.isArray(value)) return value.map(toJsonValue)
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toJsonValue(entry)]),
    )
  }
  return String(value)
}
