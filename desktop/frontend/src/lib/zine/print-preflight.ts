import { toFrameDelta } from './geometry'
import { getProjectSpreadSize } from './page-sizes'
import { collectLowResSlots, getProjectBleedMm, SAFE_MARGIN_MM } from './print'
import { calculateImagePlacement } from './slot-render'
import type { ImageSlot, Slot, ZineAsset, ZineProject } from './types'

export type ZinePrintIssueCode = 'resolution' | 'empty-image' | 'safe-margin' | 'bleed' | 'text-overflow' | 'text-layout' | 'invalid-geometry'

export interface ZinePrintIssue {
  code: ZinePrintIssueCode
  severity: 'warning' | 'error'
  spreadIndex: number
  slotId: string
  detail?: string
  effectiveDpi?: number
  critical?: boolean
}

type Point = readonly [number, number]
const EPSILON_MM = 0.05
const PT_PER_MM = 72 / 25.4

function rotatePoint(point: Point, center: Point, degrees: number): Point {
  const [x, y] = toFrameDelta(point[0] - center[0], point[1] - center[1], -degrees)
  return [center[0] + x, center[1] + y]
}

function rectangle(x: number, y: number, w: number, h: number, rotation = 0): Point[] {
  return ([[x, y], [x + w, y], [x + w, y + h], [x, y + h]] as Point[])
    .map((point) => rotatePoint(point, [x + w / 2, y + h / 2], rotation))
}

function side(point: Point, a: Point, b: Point) {
  return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0])
}

/** Clip the placed photo to its frame, including independent frame/photo rotation. */
function visibleImagePolygon(slot: ImageSlot, asset: ZineAsset): Point[] {
  const placement = calculateImagePlacement(slot.w, slot.h, asset.width, asset.height, slot.imageTransform)
  let polygon = rectangle(placement.left, placement.top, placement.width, placement.height, placement.rotation)
  const frame = rectangle(0, 0, slot.w, slot.h)
  for (let index = 0; index < frame.length; index += 1) {
    const a = frame[index]
    const b = frame[(index + 1) % frame.length]
    const input = polygon
    polygon = []
    for (let offset = 0; offset < input.length; offset += 1) {
      const current = input[offset]
      const previous = input[(offset + input.length - 1) % input.length]
      const currentSide = side(current, a, b)
      const previousSide = side(previous, a, b)
      if ((currentSide >= 0) !== (previousSide >= 0)) {
        const ratio = previousSide / (previousSide - currentSide)
        polygon.push([previous[0] + (current[0] - previous[0]) * ratio, previous[1] + (current[1] - previous[1]) * ratio])
      }
      if (currentSide >= 0) polygon.push(current)
    }
  }
  return polygon.map(([x, y]) => rotatePoint([slot.x + x, slot.y + y], [slot.x + slot.w / 2, slot.y + slot.h / 2], slot.rotation))
}

function lineInterval(polygon: Point[], axis: 0 | 1, position: number): [number, number] | null {
  const intersections: number[] = []
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]
    const b = polygon[(index + 1) % polygon.length]
    if (Math.abs(a[axis] - position) < 0.0001) intersections.push(a[1 - axis])
    if ((a[axis] < position) !== (b[axis] < position)) {
      const ratio = (position - a[axis]) / (b[axis] - a[axis])
      intersections.push(a[1 - axis] + (b[1 - axis] - a[1 - axis]) * ratio)
    }
  }
  return intersections.length > 1 ? [Math.min(...intersections), Math.max(...intersections)] : null
}

function coveredByIntervals(target: [number, number], intervals: Array<[number, number]>) {
  let coveredTo = target[0]
  for (const [start, end] of intervals.sort((a, b) => a[0] - b[0])) {
    if (end < coveredTo) continue
    if (start > coveredTo + EPSILON_MM) break
    coveredTo = Math.max(coveredTo, end)
    if (coveredTo >= target[1] - EPSILON_MM) return true
  }
  return false
}

export function collectZinePrintIssues(project: ZineProject, variant: 'spread' | 'print'): ZinePrintIssue[] {
  const issues: ZinePrintIssue[] = collectLowResSlots(project).map((warning) => ({
    code: 'resolution', severity: 'warning', spreadIndex: warning.spreadIndex, slotId: warning.slotId,
    detail: warning.assetFileName, effectiveDpi: warning.effectiveDpi, critical: warning.critical,
  }))
  const { pageW, pageH, spreadW } = getProjectSpreadSize(project)
  const bleed = getProjectBleedMm(project)
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]))

  project.spreads.forEach((spread, spreadIndex) => {
    const photos: Array<{ slot: ImageSlot; polygon: Point[] }> = []
    for (const slot of spread.slots) {
      const issue = { spreadIndex, slotId: slot.id }
      if (![slot.x, slot.y, slot.w, slot.h, slot.rotation].every(Number.isFinite) || slot.w <= 0 || slot.h <= 0) {
        issues.push({ ...issue, code: 'invalid-geometry', severity: 'error' })
        continue
      }
      if (slot.kind === 'image') {
        const asset = slot.assetId ? assets.get(slot.assetId) : undefined
        if (!asset) issues.push({ ...issue, code: 'empty-image', severity: slot.assetId ? 'error' : 'warning' })
        else if (![slot.imageTransform.scale, slot.imageTransform.offsetX, slot.imageTransform.offsetY, slot.imageTransform.rotation].every(Number.isFinite)
          || slot.imageTransform.scale <= 0) issues.push({ ...issue, code: 'invalid-geometry', severity: 'error' })
        else photos.push({ slot, polygon: visibleImagePolygon(slot, asset) })
      } else if (!Number.isFinite(slot.fontSize) || slot.fontSize <= 0 || !Number.isFinite(slot.lineHeight) || slot.lineHeight <= 0) {
        issues.push({ ...issue, code: 'invalid-geometry', severity: 'error' })
      } else if (slot.content.trim() && variant === 'print') {
        const points = rectangle(slot.x, slot.y, slot.w, slot.h, slot.rotation)
        const minX = Math.min(...points.map(([x]) => x))
        const maxX = Math.max(...points.map(([x]) => x))
        if (minX < SAFE_MARGIN_MM || maxX > spreadW - SAFE_MARGIN_MM
          || points.some(([, y]) => y < SAFE_MARGIN_MM || y > pageH - SAFE_MARGIN_MM)
          || (minX < pageW + SAFE_MARGIN_MM && maxX > pageW - SAFE_MARGIN_MM)) {
          issues.push({ ...issue, code: 'safe-margin', severity: 'warning', detail: slot.content.slice(0, 32) })
        }
      }
    }
    if (variant !== 'print' || bleed <= 0) return
    const edges: Array<{ axis: 0 | 1; trim: number; outer: number; length: number }> = [
      { axis: 0, trim: 0, outer: -bleed, length: pageH },
      { axis: 0, trim: spreadW, outer: spreadW + bleed, length: pageH },
      { axis: 1, trim: 0, outer: -bleed, length: spreadW },
      { axis: 1, trim: pageH, outer: pageH + bleed, length: spreadW },
    ]
    const warned = new Set<string>()
    for (const edge of edges) {
      const intervals = photos.flatMap(({ polygon }) => {
        const interval = lineInterval(polygon, edge.axis, edge.outer)
        return interval ? [interval] : []
      })
      for (const { slot, polygon } of photos) {
        const interval = lineInterval(polygon, edge.axis, edge.trim)
        if (!interval) continue
        const target: [number, number] = [Math.max(0, interval[0]), Math.min(edge.length, interval[1])]
        if (target[1] - target[0] > EPSILON_MM && !coveredByIntervals(target, [...intervals]) && !warned.has(slot.id)) {
          warned.add(slot.id)
          issues.push({ code: 'bleed', severity: 'warning', spreadIndex, slotId: slot.id, detail: assets.get(slot.assetId ?? '')?.fileName })
        }
      }
    }
  })
  return issues
}

export function pdfTextNodeId(slot: Pick<Slot, 'id'>) {
  return `zine-text-${encodeURIComponent(slot.id)}`
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function hasClippedText(content: string, lines: Array<Record<string, unknown> | null>) {
  // Line layout may truncate BEFORE drawing. Compare code-point counts as well
  // as dimensions; bidi reordering and inserted hyphens must not look like loss.
  const visible = new Map<string, number>()
  const ignored = /[\s\p{Default_Ignorable_Code_Point}]/u
  for (const line of lines) {
    for (const character of typeof line?.string === 'string' ? line.string : '') {
      if (!ignored.test(character)) visible.set(character, (visible.get(character) ?? 0) + 1)
    }
  }
  for (const character of content) {
    if (ignored.test(character)) continue
    const remaining = visible.get(character) ?? 0
    if (remaining === 0) return true
    visible.set(character, remaining - 1)
  }
  return false
}

/** Inspect actual renderer lines, including content discarded by fixed-height layout. */
export function collectPdfTextIssues(project: ZineProject, layout: unknown): ZinePrintIssue[] {
  const expected = new Map<string, { slot: Extract<Slot, { kind: 'text' }>; spreadIndex: number }>()
  project.spreads.forEach((spread, spreadIndex) => spread.slots.forEach((slot) => {
    if (slot.kind === 'text' && slot.content.trim()) expected.set(pdfTextNodeId(slot), { slot, spreadIndex })
  }))
  const seen = new Set<string>()
  const issues = new Map<string, ZinePrintIssue>()
  function walk(value: unknown) {
    const node = record(value)
    if (!node) return
    const id = record(node.props)?.id
    const target = typeof id === 'string' ? expected.get(id) : undefined
    if (target && typeof id === 'string') {
      const box = record(node.box)
      const lines = Array.isArray(node.lines) ? node.lines.map(record) : []
      if (box && Array.isArray(node.lines) && lines.every((line) => typeof record(line?.box)?.height === 'number' && typeof line?.string === 'string')) {
        seen.add(id)
        const height = lines.reduce((sum, line) => sum + Number(record(line?.box)?.height ?? 0), 0)
        const width = Math.max(0, ...lines.map((line) => Number(line?.xAdvance ?? 0)))
        if (height > target.slot.h * PT_PER_MM + 0.1 || width > target.slot.w * PT_PER_MM + 0.1
          || Number(box.top) < -0.1 || hasClippedText(target.slot.content, lines)) {
          issues.set(id, { code: 'text-overflow', severity: 'warning', spreadIndex: target.spreadIndex, slotId: target.slot.id, detail: target.slot.content.slice(0, 32) })
        }
      }
    }
    if (Array.isArray(node.children)) node.children.forEach(walk)
  }
  walk(record(layout)?._INTERNAL__LAYOUT__DATA_ ?? layout)
  for (const [id, { slot, spreadIndex }] of expected) {
    if (!seen.has(id)) issues.set(id, { code: 'text-layout', severity: 'error', spreadIndex, slotId: slot.id, detail: slot.content.slice(0, 32) })
  }
  return [...issues.values()]
}
