import { getDesignServerUrl } from './remote'
import type { CanvasElement, CanvasProject } from './types'

interface NormalizedSlot {
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

function getToken() {
  try { return localStorage.getItem('mo-gallery-token') }
  catch { return null }
}

function clampNormalized(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum))
}

function toNormalizedSlot(element: CanvasElement, index: number, project: CanvasProject): NormalizedSlot {
  const pageWidth = project.width / 2
  const page: 'left' | 'right' = element.x + element.width / 2 >= pageWidth ? 'right' : 'left'
  const pageOffset = page === 'right' ? pageWidth : 0
  const base = {
    page,
    x: clampNormalized((element.x - pageOffset) / pageWidth, -0.5, 1.5),
    y: clampNormalized(element.y / project.height, -0.5, 1.5),
    w: clampNormalized(element.width / pageWidth, 0.01, 1.5),
    h: clampNormalized(element.height / project.height, 0.01, 1.5),
    zIndex: index + 1,
  }
  if (element.type === 'text') return { ...base, kind: 'text', align: element.align, fontSize: element.fontSize / project.height, color: element.color }
  if (element.type === 'shape') return { ...base, kind: 'shape', shape: element.shape === 'ellipse' ? 'ellipse' : 'rect', fill: element.fill }
  return { ...base, kind: 'image', mask: element.radius > 0 ? 'rounded' : 'none' }
}

export async function shareCanvasTemplate(project: CanvasProject): Promise<void> {
  const token = getToken()
  if (!token) throw new Error('LOGIN_REQUIRED')
  const response = await fetch(`${await getDesignServerUrl()}/api/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: project.title.trim() || 'Untitled design',
      description: `Shared from MO Gallery ${project.kind} canvas`,
      pageLayout: 'two-up',
      isPublic: true,
      layout: { slots: project.elements.map((element, index) => toNormalizedSlot(element, index, project)) },
    }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body.success === false) throw new Error(body.error ?? `Share request failed (${response.status})`)
}
