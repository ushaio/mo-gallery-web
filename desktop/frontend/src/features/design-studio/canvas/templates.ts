import type { CanvasElement, CanvasProject, CanvasProjectKind } from '@/lib/design-canvas/types'
import { getDesignServerUrl } from '@/lib/design-canvas/remote'

export interface CanvasTemplateDocument {
  schemaVersion: 1
  id: string
  kind: CanvasProjectKind
  titleKey?: string
  descriptionKey?: string
  title?: string
  description?: string
  untitledTitleKey?: string
  tags: string[]
  canvas: { width: number; height: number; background: string }
  elements: CanvasElement[]
}

let templateCache: CanvasTemplateDocument[] | null = null

export const BUILTIN_CANVAS_TEMPLATES: CanvasTemplateDocument[] = [
  { schemaVersion: 1, id: 'builtin-square-grid', kind: 'collage', titleKey: 'admin.canvas_template_square_grid', descriptionKey: 'admin.canvas_template_square_grid_description', untitledTitleKey: 'admin.canvas_untitled_collage', tags: ['collage', 'square', 'grid'], canvas: { width: 2400, height: 2400, background: '#F7F7F5' }, elements: [0, 1, 2, 3].map((index) => ({ id: `builtin-grid-${index}`, type: 'image' as const, assetId: null, fit: 'cover' as const, radius: 0, x: (index % 2) * 1220 + 60, y: Math.floor(index / 2) * 1220 + 60, width: 1100, height: 1100, rotation: 0, opacity: 1 })) },
  { schemaVersion: 1, id: 'builtin-editorial', kind: 'collage', titleKey: 'admin.canvas_template_portrait_editorial', descriptionKey: 'admin.canvas_template_portrait_editorial_description', untitledTitleKey: 'admin.canvas_untitled_collage', tags: ['collage', 'portrait', 'editorial'], canvas: { width: 2400, height: 3200, background: '#F1F0EC' }, elements: [{ id: 'builtin-editorial-main', type: 'image', assetId: null, fit: 'cover', radius: 0, x: 120, y: 140, width: 2160, height: 1840, rotation: 0, opacity: 1 }, { id: 'builtin-editorial-detail', type: 'image', assetId: null, fit: 'cover', radius: 0, x: 680, y: 2140, width: 1120, height: 760, rotation: 0, opacity: 1 }] },
  { schemaVersion: 1, id: 'builtin-triptych', kind: 'collage', titleKey: 'admin.canvas_template_landscape_triptych', descriptionKey: 'admin.canvas_template_landscape_triptych_description', untitledTitleKey: 'admin.canvas_untitled_collage', tags: ['collage', 'landscape', 'triptych'], canvas: { width: 3200, height: 1800, background: '#101010' }, elements: [0, 1, 2].map((index) => ({ id: `builtin-triptych-${index}`, type: 'image' as const, assetId: null, fit: 'cover' as const, radius: 0, x: index * 1040 + 40, y: 40, width: 960, height: 1720, rotation: 0, opacity: 1 })) },
]

interface ServerTemplateSlot {
  kind: 'image' | 'text' | 'shape'
  page: 'left' | 'right'
  x: number
  y: number
  w: number
  h: number
  zIndex: number
  align?: 'left' | 'center' | 'right'
  fontSize?: number
  color?: string
  shape?: 'rect' | 'ellipse'
  fill?: string
  mask?: 'none' | 'rounded' | 'ellipse'
}

interface ServerTemplate {
  id: string
  title: string
  description?: string
  kind?: CanvasProjectKind
  orientation?: 'portrait' | 'landscape' | 'square'
  layout: { slots: ServerTemplateSlot[]; pageSize?: { w: number; h: number } }
}

function normalizeServerTemplate(template: ServerTemplate): CanvasTemplateDocument {
  const width = 2400
  const height = template.orientation === 'portrait' ? 3200 : template.orientation === 'square' ? 2400 : 1600
  const pageWidth = width / 2
  const elements: CanvasElement[] = template.layout.slots.map((slot, index) => {
    const base = {
      id: `${template.id}-${index}`,
      x: (slot.page === 'right' ? pageWidth : 0) + slot.x * pageWidth,
      y: slot.y * height,
      width: slot.w * pageWidth,
      height: slot.h * height,
      rotation: 0,
      opacity: 1,
    }
    if (slot.kind === 'text') {
      return { ...base, type: 'text' as const, text: '', color: slot.color ?? '#111111', fontFamily: 'Montserrat', fontSize: Math.max(24, (slot.fontSize ?? 0.05) * height), fontWeight: 500, align: slot.align ?? 'left' }
    }
    if (slot.kind === 'shape') {
      return { ...base, type: 'shape' as const, shape: slot.shape === 'ellipse' ? 'ellipse' as const : 'rectangle' as const, fill: slot.fill ?? '#D8DEE0', radius: slot.mask === 'rounded' ? 24 : 0 }
    }
    return { ...base, type: 'image' as const, assetId: null, fit: 'cover' as const, radius: slot.mask === 'rounded' ? 24 : 0 }
  })
  return {
    schemaVersion: 1,
    id: `server:${template.id}`,
    kind: template.kind ?? 'collage',
    title: template.title,
    description: template.description ?? '',
    tags: ['server', 'plaza', template.orientation ?? 'landscape'],
    canvas: { width, height, background: '#FFFFFF' },
    elements,
  }
}

export async function loadCanvasTemplates(): Promise<CanvasTemplateDocument[]> {
  if (templateCache) return templateCache
    const response = await fetch(`${getDesignServerUrl()}/api/templates?page=1&pageSize=100`, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error(`Failed to load canvas templates: ${response.status}`)
    const payload: unknown = await response.json()
    const items = (payload as { data?: { items?: unknown[] } })?.data?.items
    if (!Array.isArray(items)) throw new Error('Invalid server canvas template catalog')
    const remoteTemplates = items.filter((item): item is ServerTemplate => Boolean(item && typeof item === 'object' && typeof (item as ServerTemplate).id === 'string' && typeof (item as ServerTemplate).title === 'string' && Array.isArray((item as ServerTemplate).layout?.slots))).map(normalizeServerTemplate)
    templateCache = [...BUILTIN_CANVAS_TEMPLATES, ...remoteTemplates]
  return templateCache
}

export function createCanvasProject(template: CanvasTemplateDocument, title: string): CanvasProject {
  const now = Date.now()
  return {
    version: 1,
    id: crypto.randomUUID?.() ?? `canvas_${now}_${Math.random().toString(36).slice(2)}`,
    kind: template.kind,
    templateId: template.id,
    title,
    width: template.canvas.width,
    height: template.canvas.height,
    background: template.canvas.background,
    elements: template.elements.map((element) => ({
      ...structuredClone(element),
      id: crypto.randomUUID?.() ?? `element_${Math.random().toString(36).slice(2)}`,
    })),
    assets: [],
    createdAt: now,
    updatedAt: now,
  }
}
