function decodeBytes(value: number[]): string | null {
  if (!value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
    return null
  }

  try {
    return new TextDecoder().decode(new Uint8Array(value))
  } catch {
    return null
  }
}

export function normalizeDominantColors(value: unknown): string[] {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'string')) {
      return value.filter((item) => item.trim().length > 0)
    }

    if (value.every((item) => typeof item === 'number')) {
      const decoded = decodeBytes(value)
      return decoded ? normalizeDominantColors(decoded) : []
    }

    return []
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []

    try {
      return normalizeDominantColors(JSON.parse(trimmed))
    } catch {
      return []
    }
  }

  if (value && typeof value === 'object' && 'data' in value) {
    return normalizeDominantColors((value as { data?: unknown }).data)
  }

  return []
}
