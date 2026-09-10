/**
 * 配色方案（Accent）— 以胶片品牌命名，与产品 Emulsion（胶片乳剂）呼应。
 * 主色只影响主按钮、导航选中态、勾选框/开关、焦点环、Tab 高亮；
 * 语义状态色（成功/警告/危险）不随配色变化，保持语义稳定。
 */
export const ACCENTS = [
  { id: 'silver', name: '银盐', color: '#18181b' },
  { id: 'kodak', name: '柯达', color: '#c9860a' },
  { id: 'fuji', name: '富士', color: '#0f7a5c' },
  { id: 'agfa', name: '爱克发', color: '#c2410c' },
  { id: 'ilford', name: '依尔福', color: '#3b5b8a' },
  { id: 'polaroid', name: '宝丽来', color: '#5b5bd6' },
  { id: 'sakura', name: '樱花', color: '#c2497a' },
] as const

export type AccentId = (typeof ACCENTS)[number]['id']

export const DEFAULT_ACCENT: AccentId = 'silver'

export function isAccentId(value: unknown): value is AccentId {
  return typeof value === 'string' && ACCENTS.some((accent) => accent.id === value)
}
