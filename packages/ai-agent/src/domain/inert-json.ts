import type { JsonValue } from './json'

// Bounds recursive descriptor traversal well below typical JavaScript stack limits.
export const MAX_INERT_JSON_DEPTH = 128

export interface InertJsonValidationOptions {
  maxDepth?: number
  sharedReferences: 'allow-validated' | 'reject'
  rejectString?: (value: string) => boolean
}

export function isDescriptorSafeInertJson(
  value: unknown,
  options: InertJsonValidationOptions,
): value is JsonValue {
  const maxDepth = options.maxDepth ?? MAX_INERT_JSON_DEPTH
  const ancestors = new Set<object>()
  const validated = new WeakSet<object>()

  function visit(candidate: unknown, depth: number): boolean {
    if (candidate === null || typeof candidate === 'boolean') return true
    if (typeof candidate === 'string') return options.rejectString?.(candidate) !== true
    if (typeof candidate === 'number') return Number.isFinite(candidate)
    if (typeof candidate !== 'object') return false

    // Check the deterministic bound before inspecting or descending into this container.
    if (depth > maxDepth) return false
    if (ancestors.has(candidate)) return false
    if (validated.has(candidate)) return options.sharedReferences === 'allow-validated'

    if (Array.isArray(candidate)) {
      if (Object.getPrototypeOf(candidate) !== Array.prototype) return false
      const lengthDescriptor = Object.getOwnPropertyDescriptor(candidate, 'length')
      if (
        lengthDescriptor === undefined
        || !('value' in lengthDescriptor)
        || lengthDescriptor.enumerable
        || lengthDescriptor.value !== candidate.length
        || Reflect.ownKeys(candidate).length !== candidate.length + 1
      ) {
        return false
      }

      ancestors.add(candidate)
      for (let index = 0; index < candidate.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, String(index))
        if (
          descriptor === undefined
          || !descriptor.enumerable
          || !('value' in descriptor)
          || !visit(descriptor.value, depth + 1)
        ) {
          ancestors.delete(candidate)
          return false
        }
      }
      ancestors.delete(candidate)
      validated.add(candidate)
      return true
    }

    const prototype = Object.getPrototypeOf(candidate)
    if (prototype !== Object.prototype && prototype !== null) return false

    ancestors.add(candidate)
    for (const key of Reflect.ownKeys(candidate)) {
      if (typeof key !== 'string') {
        ancestors.delete(candidate)
        return false
      }
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key)
      if (
        descriptor === undefined
        || !descriptor.enumerable
        || !('value' in descriptor)
        || !visit(descriptor.value, depth + 1)
      ) {
        ancestors.delete(candidate)
        return false
      }
    }
    ancestors.delete(candidate)
    validated.add(candidate)
    return true
  }

  try {
    return visit(value, 0)
  } catch {
    // Proxy traps and other hostile reflective behavior are invalid JSON input.
    return false
  }
}

export function cloneDescriptorSafeJsonTree(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(cloneDescriptorSafeJsonTree)

  const clone: Record<string, JsonValue> = {}
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    const clonedValue = cloneDescriptorSafeJsonTree(descriptor!.value as JsonValue)
    Object.defineProperty(clone, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: clonedValue,
    })
  }
  return clone
}
