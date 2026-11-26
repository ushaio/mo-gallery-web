export function sanitizeContentStyleValue(property: string, rawValue: unknown): string | null {
  if (typeof rawValue !== 'string') return null
  const value = rawValue.trim().replace(/\s+/g, ' ')
  if (!value || /expression\(|javascript:|url\(/i.test(value)) return null
  if (property === 'font-size' && !/^\d+(\.\d+)?(px|em|rem|%)$/i.test(value)) return null
  if (property === 'font-family' && /[;{}<>]/.test(value)) return null
  return value
}

const STYLE_PROPERTIES = {
  color: 'color',
  'background-color': 'backgroundColor',
  'font-size': 'fontSize',
  'font-family': 'fontFamily',
} as const

export function contentInlineStyle(attrs: Record<string, unknown> | undefined): Record<string, string> {
  const style: Record<string, string> = {}
  for (const [property, key] of Object.entries(STYLE_PROPERTIES)) {
    const value = sanitizeContentStyleValue(property, attrs?.[key])
    if (value) style[key] = value
  }
  return style
}

export function contentBlockStyle(attrs: Record<string, unknown> | undefined): Record<string, string> {
  const style: Record<string, string> = {}
  if (typeof attrs?.pastedStyle === 'string') {
    for (const declaration of attrs.pastedStyle.split(';')) {
      const separator = declaration.indexOf(':')
      if (separator < 0) continue
      const property = declaration.slice(0, separator).trim().toLowerCase()
      if (!Object.hasOwn(STYLE_PROPERTIES, property)) continue
      const value = sanitizeContentStyleValue(property, declaration.slice(separator + 1))
      if (value) style[STYLE_PROPERTIES[property as keyof typeof STYLE_PROPERTIES]] = value
    }
  }
  if (typeof attrs?.textAlign === 'string' && ['left', 'center', 'right', 'justify'].includes(attrs.textAlign)) {
    style.textAlign = attrs.textAlign
  }
  return style
}
