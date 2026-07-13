import type { JsonValue } from './json'

export type StructuredRevisionNamespace = 'narrative' | 'zine'

function hashFnv1a(value: string): string {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function canonicalizeJson(value: JsonValue): string {
  if (value === undefined) {
    throw new TypeError('Cannot canonicalize undefined as JSON')
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('Cannot canonicalize a non-finite JSON number')
  }

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new TypeError('Cannot canonicalize an array with a non-standard prototype as JSON')
    }
    if (Object.prototype.hasOwnProperty.call(value, 'map')) {
      throw new TypeError('Cannot canonicalize an array with a custom map method as JSON')
    }
    const entries = new Array<string>(value.length)
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (descriptor === undefined) {
        throw new TypeError(`Cannot canonicalize a sparse array as JSON (missing index ${index})`)
      }
      if (!('value' in descriptor)) {
        throw new TypeError(`Cannot canonicalize an array accessor as JSON (index ${index})`)
      }
      entries[index] = canonicalizeJson(descriptor.value)
    }
    return `[${entries.join(',')}]`
  }

  if (value !== null && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Cannot canonicalize a non-JSON object')
    }
    const entries = Object.keys(value)
      .sort()
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (descriptor === undefined || !('value' in descriptor)) {
          throw new TypeError(`Cannot canonicalize an object accessor as JSON (property ${key})`)
        }
        return `${JSON.stringify(key)}:${canonicalizeJson(descriptor.value)}`
      })
    return `{${entries.join(',')}}`
  }

  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || typeof value === 'number'
  ) {
    return JSON.stringify(value)
  }

  throw new TypeError(`Cannot canonicalize ${typeof value} as JSON`)
}

export function createStructuredRevision(
  namespace: StructuredRevisionNamespace,
  value: JsonValue,
): string {
  const canonicalValue = canonicalizeJson(value)
  return `${namespace}-fnv1a-${hashFnv1a(canonicalValue)}-${canonicalValue.length}`
}

export function createTextRevision(value: string): string {
  return `fnv1a-${hashFnv1a(value)}-${value.length}`
}
