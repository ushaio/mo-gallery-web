import { DEFAULT_BLEED_MM } from './print'
import type { ImageSlot, TemplateDef, TextSlot, ZineSpreadRole } from './types'

function createZineId() {
  return crypto.randomUUID?.() ?? `zine_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

const margin = 12
const gap = 8

function imageSlot(page: 'left' | 'right', x: number, y: number, w: number, h: number, zIndex: number): ImageSlot {
  return { id: createZineId(), kind: 'image', page, x, y, w, h, rotation: 0, zIndex, assetId: null, imageTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 } }
}

function textSlot(page: 'left' | 'right', x: number, y: number, w: number, h: number, zIndex: number): TextSlot {
  return { id: createZineId(), kind: 'text', page, x, y, w, h, rotation: 0, zIndex, content: '', align: 'left', fontSize: 18, lineHeight: 1.25, color: '#111111', fontFamily: 'serif' }
}

// 供编辑器"添加图片框/文本框"使用：在指定页居中放置一个默认尺寸的槽位
export function createImageSlot(page: 'left' | 'right', pageW: number, pageH: number, zIndex: number): ImageSlot {
  const w = Math.min(80, pageW - margin * 2)
  const h = Math.min(60, pageH - margin * 2)
  return imageSlot(page, (pageW - w) / 2, (pageH - h) / 2, w, h, zIndex)
}

export function createTextSlot(page: 'left' | 'right', pageW: number, pageH: number, zIndex: number): TextSlot {
  const w = Math.min(90, pageW - margin * 2)
  const slot = textSlot(page, (pageW - w) / 2, pageH / 2 - 12, w, 24, zIndex)
  return { ...slot, content: '' }
}

// 满版/封面类模板把图片延伸进出血区，裁切后才不会留白边
export const ZINE_TEMPLATES: TemplateDef[] = [
  { id: 'single-photo-full', nameKey: 'admin.zine_template_single_full', pageLayout: 'single', buildSlots: (w, h) => [imageSlot('left', margin, margin, w - margin * 2, h - margin * 2, 1), imageSlot('right', margin, margin, w - margin * 2, h - margin * 2, 2)] },
  { id: 'spread-full-bleed', nameKey: 'admin.zine_template_full_bleed', pageLayout: 'single', buildSlots: (w, h, bleed = DEFAULT_BLEED_MM) => [imageSlot('left', -bleed, -bleed, w * 2 + bleed * 2, h + bleed * 2, 1)] },
  { id: 'two-up', nameKey: 'admin.zine_template_two_up', pageLayout: 'two-up', buildSlots: (w, h) => [imageSlot('left', margin, margin, w - margin * 2, (h - margin * 2 - gap) / 2, 1), imageSlot('left', margin, margin + (h - margin * 2 + gap) / 2, w - margin * 2, (h - margin * 2 - gap) / 2, 2), imageSlot('right', margin, margin, w - margin * 2, (h - margin * 2 - gap) / 2, 3), imageSlot('right', margin, margin + (h - margin * 2 + gap) / 2, w - margin * 2, (h - margin * 2 - gap) / 2, 4)] },
  { id: 'triptych', nameKey: 'admin.zine_template_triptych', pageLayout: 'two-up', buildSlots: (w, h) => [imageSlot('left', margin, margin, w - margin * 2, h - margin * 2, 1), imageSlot('right', margin, margin, w - margin * 2, (h - margin * 2 - gap) / 2, 2), imageSlot('right', margin, margin + (h - margin * 2 + gap) / 2, w - margin * 2, (h - margin * 2 - gap) / 2, 3)] },
  { id: 'text-left-photo-right', nameKey: 'admin.zine_template_text_photo', pageLayout: 'text-photo', buildSlots: (w, h) => [textSlot('left', margin, margin, w - margin * 2, 56, 1), imageSlot('right', margin, margin, w - margin * 2, h - margin * 2, 2)] },
]

// 封面模板不进入"新增跨页"模板库，仅由添加封面动作使用：
// 右半=封面（满版图 + 标题），左半=封底（底部落款）
export const ZINE_COVER_TEMPLATE: TemplateDef = {
  id: 'cover-title',
  nameKey: 'admin.zine_template_cover',
  pageLayout: 'cover',
  buildSlots: (w, h, bleed = DEFAULT_BLEED_MM) => [
    imageSlot('right', -bleed, -bleed, w + bleed * 2, h + bleed * 2, 1),
    { ...textSlot('right', margin, h * 0.62, w - margin * 2, 30, 2), align: 'center' as const, fontSize: 28, color: '#ffffff' },
    { ...textSlot('left', margin, h - margin - 16, w - margin * 2, 16, 3), align: 'center' as const, fontSize: 11, color: '#111111' },
  ],
}

export function buildSpreadFromTemplate(templateId: string, pageW: number, pageH: number, options: { role?: ZineSpreadRole; bleedMm?: number } = {}) {
  const template = templateId === ZINE_COVER_TEMPLATE.id ? ZINE_COVER_TEMPLATE : ZINE_TEMPLATES.find((item) => item.id === templateId) ?? ZINE_TEMPLATES[0]
  const role = options.role ?? (template.pageLayout === 'cover' ? 'cover' : undefined)
  return { id: createZineId(), templateId: template.id, ...(role ? { role } : {}), slots: template.buildSlots(pageW, pageH, options.bleedMm) }
}
