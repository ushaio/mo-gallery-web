import { buildQuery } from '@/lib/api/core'
import type { Slot, Spread } from '@/lib/zine/types'

/**
 * 创意广场（官方站）模板客户端。
 *
 * 官方站以归一化坐标（0-1，相对单页宽高）存储模板布局，
 * 这里按当前项目的页面尺寸（毫米）换算成桌面端 Slot，实现模板套用。
 */

export interface PlazaSlot {
  kind: 'image' | 'text'
  page: 'left' | 'right'
  x: number
  y: number
  w: number
  h: number
  zIndex: number
  align?: 'left' | 'center' | 'right'
  fontSize?: number
  color?: string
}

export interface PlazaTemplate {
  id: string
  title: string
  description: string
  layout: { slots: PlazaSlot[] }
  pageLayout: string
  usageCount: number
  createdAt: string
  author: { id: string; username: string }
}

const PLAZA_URL_KEY = 'mo-gallery-plaza-url'
const DEFAULT_PLAZA_URL = 'http://localhost:3001'

export function getPlazaUrl(): string {
  const stored = localStorage.getItem(PLAZA_URL_KEY)?.trim()
  return (stored || DEFAULT_PLAZA_URL).replace(/\/+$/, '')
}

export function setPlazaUrl(url: string) {
  localStorage.setItem(PLAZA_URL_KEY, url.trim().replace(/\/+$/, ''))
}

export async function fetchPlazaTemplates(params: { page?: number; q?: string } = {}): Promise<{
  items: PlazaTemplate[]
  total: number
}> {
  const query = buildQuery({ page: params.page ?? 1, pageSize: 30, q: params.q })
  const res = await fetch(`${getPlazaUrl()}/api/templates${query}`)
  if (!res.ok) throw new Error(`Plaza request failed (${res.status})`)
  const body = await res.json()
  if (body.success === false) throw new Error(body.error ?? 'Plaza request failed')
  return { items: body.data.items ?? [], total: body.data.total ?? 0 }
}

export async function fetchPlazaTemplate(id: string): Promise<PlazaTemplate> {
  const res = await fetch(`${getPlazaUrl()}/api/templates/${id}`)
  if (!res.ok) throw new Error(`Plaza template request failed (${res.status})`)
  const body = await res.json()
  if (body.success === false) throw new Error(body.error ?? 'Plaza template request failed')
  return body.data
}

/** 套用成功后上报计数（失败不影响套用流程） */
export function reportPlazaTemplateUse(id: string) {
  void fetch(`${getPlazaUrl()}/api/templates/${id}/use`, { method: 'POST' }).catch(() => undefined)
}

function createId() {
  return crypto.randomUUID?.() ?? `plaza_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

/**
 * 将归一化布局换算为当前页面尺寸下的 Spread。
 * 与内置模板一致：右页 slot 的 x 相对跨页原点（加上 pageW）。
 */
export function buildSpreadFromPlazaTemplate(
  template: PlazaTemplate,
  pageW: number,
  pageH: number,
): Spread {
  const slots: Slot[] = template.layout.slots.map((slot) => {
    const x = (slot.page === 'right' ? pageW : 0) + slot.x * pageW
    const y = slot.y * pageH
    const w = slot.w * pageW
    const h = slot.h * pageH

    if (slot.kind === 'text') {
      return {
        id: createId(),
        kind: 'text' as const,
        page: slot.page,
        x,
        y,
        w,
        h,
        rotation: 0,
        zIndex: slot.zIndex,
        content: '',
        align: slot.align ?? 'left',
        verticalAlign: 'top' as const,
        // fontSize 为相对页高的比例；桌面端字号单位为 pt（1mm ≈ 2.835pt）
        fontSize: Math.max(6, (slot.fontSize ?? 0.05) * pageH * 2.835),
        lineHeight: 1.25,
        color: slot.color ?? '#111111',
        fontFamily: 'serif',
      }
    }

    return {
      id: createId(),
      kind: 'image' as const,
      page: slot.page,
      x,
      y,
      w,
      h,
      rotation: 0,
      zIndex: slot.zIndex,
      assetId: null,
      imageTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 },
    }
  })

  return { id: createId(), templateId: `plaza:${template.id}`, slots }
}
