import { FONT_FAMILIES, normalizeTextStyle } from './text-style'
import type { TextStyleAttributes } from './text-style'

export function legacyRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function legacyString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function legacyCss(value: unknown): Record<string, string> {
  return Object.fromEntries(legacyString(value).split(';').flatMap((declaration) => {
    const separator = declaration.indexOf(':')
    return separator < 0 ? [] : [[declaration.slice(0, separator).trim().toLowerCase(), declaration.slice(separator + 1).trim()]]
  }))
}

function legacyFont(value: unknown): string | undefined {
  const family = legacyString(value).toLowerCase()
  if (FONT_FAMILIES.some((font) => font.value === family)) return family
  if (/optima/.test(family)) return 'optima'
  if (/kaiti|stkaiti|楷体/.test(family)) return 'kai'
  if (/simsun|stsong|songti|noto serif sc|宋体/.test(family)) return 'song'
  if (/pingfang|yahei|heiti|noto sans sc|黑体|微软雅黑/.test(family)) return 'hei'
  if (/monospace|mono|consolas|menlo|courier/.test(family)) return 'mono'
  if (/sans-serif|system-ui|arial|helvetica/.test(family)) return 'sans'
  if (/serif|times/.test(family)) return 'song'
  return undefined
}

function legacySize(value: unknown, base: number): string | undefined {
  const match = String(value ?? '').trim().match(/^(\d+(?:\.\d+)?)(px|pt|rem|em|%)?$/i)
  if (!match) return undefined
  const scale = { px: 1, pt: 4 / 3, rem: 16, em: base, '%': base / 100 }[match[2]?.toLowerCase() || 'px'] ?? 1
  const size = Math.round(Number(match[1]) * scale)
  return size >= 8 && size <= 96 ? String(size) : undefined
}

export function legacyTextStyle(value: unknown, inherited: TextStyleAttributes = { font: null, size: null }): TextStyleAttributes {
  const attrs = legacyRecord(value)
  const css = legacyCss(attrs.pastedStyle ?? attrs.style)
  const style = normalizeTextStyle({
    font: legacyFont(attrs.fontFamily ?? css['font-family']),
    size: legacySize(attrs.fontSize ?? css['font-size'], Number(inherited.size) || 16),
    color: attrs.color ?? css.color,
    background: attrs.backgroundColor ?? css['background-color'],
    underline: /underline/.test(css['text-decoration'] ?? '') ? 'true' : undefined,
  })
  return { ...inherited, ...Object.fromEntries(Object.entries(style).filter(([, entry]) => entry)) }
}
