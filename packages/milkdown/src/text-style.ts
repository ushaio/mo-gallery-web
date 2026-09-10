import { walkMarkdown } from './media'
import type { MarkdownTree } from './media'

export const FONT_FAMILIES = [
  { value: 'sans', zh: '无衬线', en: 'Sans serif', css: 'ui-sans-serif, system-ui, sans-serif' },
  { value: 'song', zh: '宋体', en: 'Songti', css: '"SimSun", "STSong", "Songti SC", "Noto Serif SC", serif' },
  { value: 'hei', zh: '黑体', en: 'Heiti', css: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif' },
  { value: 'pingfang', zh: '苹方', en: 'PingFang', css: '"PingFang SC", "PingFang TC", "Hiragino Sans GB", sans-serif' },
  { value: 'kai', zh: '楷体', en: 'Kaiti', css: '"KaiTi", "STKaiti", "Kaiti SC", serif' },
  { value: 'mono', zh: '等宽', en: 'Monospace', css: 'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace' },
  { value: 'optima', zh: 'Optima', en: 'Optima', css: '"Optima", "Optima-Regular", "PingFang TC", "Helvetica Neue", sans-serif' },
] as const

export const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72] as const

/** The document default: the first family and the editor's base font size. */
export const DEFAULT_FONT_FAMILY = FONT_FAMILIES[0].value
export const DEFAULT_FONT_SIZE = 16
export const MIN_FONT_SIZE = 8
export const MAX_FONT_SIZE = 96

export interface TextStyleAttributes {
  font: string | null
  size: string | null
  color?: string
  background?: string
  underline?: 'true'
}

export const TEXT_STYLE_FIELDS = ['font', 'size', 'color', 'background', 'underline'] as const

function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const color = value.trim()
  return /^(?:#[\da-f]{3}|#[\da-f]{4}|#[\da-f]{6}|#[\da-f]{8}|[a-z]{1,32}|(?:rgba?|hsla?)\([\d.% ,/+-]+\))$/i.test(color) ? color : undefined
}

/** Each saved style has a validated value; raw CSS declarations are never used. */
export function normalizeTextStyle(value: unknown): TextStyleAttributes {
  const attrs = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const font = FONT_FAMILIES.find((entry) => entry.value === attrs.font)?.value ?? null
  const size = typeof attrs.size === 'string' && /^\d{1,2}$/.test(attrs.size) && Number(attrs.size) >= MIN_FONT_SIZE && Number(attrs.size) <= MAX_FONT_SIZE
    ? String(Number(attrs.size))
    : null
  const color = normalizeColor(attrs.color)
  const background = normalizeColor(attrs.background)
  return { font, size, ...(color ? { color } : {}), ...(background ? { background } : {}), ...(attrs.underline === 'true' ? { underline: 'true' } : {}) }
}

export function textStyleToAttributes(value: unknown): Record<string, string> {
  const attrs = normalizeTextStyle(value)
  return Object.fromEntries(TEXT_STYLE_FIELDS.flatMap((key) => attrs[key] ? [[key, attrs[key]]] : []))
}

export function textStyleDomAttributes(value: unknown): Record<string, string> {
  const normalized = normalizeTextStyle(value)
  const { font, size, color, background, underline } = normalized
  const attrs: Record<string, string> = { 'data-milkdown-text-style': '' }
  const declarations: string[] = []
  const family = FONT_FAMILIES.find((entry) => entry.value === font)
  if (family) {
    attrs['data-milkdown-font'] = family.value
    declarations.push(`font-family: ${family.css}`)
  }
  if (size) {
    attrs['data-milkdown-size'] = size
    declarations.push(`font-size: ${size}px`)
  }
  if (color) declarations.push(`color: ${color}`)
  if (background) declarations.push(`background-color: ${background}`)
  if (underline) declarations.push('text-decoration: underline')
  for (const key of TEXT_STYLE_FIELDS) if (normalized[key]) attrs[`data-milkdown-${key}`] = normalized[key]
  if (declarations.length) attrs.style = declarations.join('; ')
  return attrs
}

/** Keep published content and editor DOM on the same typography contract. */
export function remarkTextStyles() {
  return (tree: MarkdownTree) => {
    walkMarkdown(tree, (node) => {
      if (node.type !== 'textDirective' || node.name !== 'text-style') return
      node.data = { ...node.data, hName: 'span', hProperties: textStyleDomAttributes(node.attributes) }
    })
  }
}
