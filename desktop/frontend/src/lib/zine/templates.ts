import type { ImageSlot, TemplateDef, TextSlot } from './types'

function createZineId() {
  return crypto.randomUUID?.() ?? `zine_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

const margin = 12
const gap = 8

function imageSlot(page: 'left' | 'right', x: number, y: number, w: number, h: number, zIndex: number): ImageSlot {
  return { id: createZineId(), kind: 'image', page, x, y, w, h, rotation: 0, zIndex, assetId: null, imageTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 } }
}

function textSlot(page: 'left' | 'right', x: number, y: number, w: number, h: number, zIndex: number): TextSlot {
  return { id: createZineId(), kind: 'text', page, x, y, w, h, rotation: 0, zIndex, content: 'Untitled Zine', align: 'left', fontSize: 18, lineHeight: 1.25, color: '#111111', fontFamily: 'serif' }
}

export const ZINE_TEMPLATES: TemplateDef[] = [
  { id: 'single-photo-full', nameKey: 'admin.zine_template_single_full', pageLayout: 'single', buildSlots: (w, h) => [imageSlot('left', margin, margin, w - margin * 2, h - margin * 2, 1), imageSlot('right', margin, margin, w - margin * 2, h - margin * 2, 2)] },
  { id: 'two-up', nameKey: 'admin.zine_template_two_up', pageLayout: 'two-up', buildSlots: (w, h) => [imageSlot('left', margin, margin, w - margin * 2, (h - margin * 2 - gap) / 2, 1), imageSlot('left', margin, margin + (h - margin * 2 + gap) / 2, w - margin * 2, (h - margin * 2 - gap) / 2, 2), imageSlot('right', margin, margin, w - margin * 2, (h - margin * 2 - gap) / 2, 3), imageSlot('right', margin, margin + (h - margin * 2 + gap) / 2, w - margin * 2, (h - margin * 2 - gap) / 2, 4)] },
  { id: 'text-left-photo-right', nameKey: 'admin.zine_template_text_photo', pageLayout: 'text-photo', buildSlots: (w, h) => [textSlot('left', margin, margin, w - margin * 2, 56, 1), imageSlot('right', margin, margin, w - margin * 2, h - margin * 2, 2)] },
]

export function buildSpreadFromTemplate(templateId: string, pageW: number, pageH: number) {
  const template = ZINE_TEMPLATES.find((item) => item.id === templateId) ?? ZINE_TEMPLATES[0]
  return { id: createZineId(), templateId: template.id, slots: template.buildSlots(pageW, pageH) }
}
