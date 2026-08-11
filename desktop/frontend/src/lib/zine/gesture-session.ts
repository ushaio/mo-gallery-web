import { getSlotPageSide, geometryEqual, type SlotGeometry } from './geometry'
import type { Slot } from './types'

export type GestureKind = 'drag' | 'resize' | 'rotate'
export type MovementAxis = 'x' | 'y'

export function getDominantMovementAxis(deltaX: number, deltaY: number): MovementAxis {
  return Math.abs(deltaX) >= Math.abs(deltaY) ? 'x' : 'y'
}

export function constrainMovementToAxis(deltaX: number, deltaY: number, axis: MovementAxis): readonly [number, number] {
  return axis === 'x' ? [deltaX, 0] : [0, deltaY]
}
export type GestureGuideAxis = 'x' | 'y'
export type GestureGuideKind = 'page-edge' | 'page-center' | 'spine' | 'safe-margin'

export interface GestureGuide {
  axis: GestureGuideAxis
  position: number
  kind: GestureGuideKind
}

export interface GestureBoundary {
  bleed: number
  pageH: number
  spreadW: number
  minVisible?: number
}

export interface GestureSessionOptions {
  kind: GestureKind
  pageW: number
  guides: GestureGuide[]
  snapThreshold: number
  boundary: GestureBoundary
  resizeDirection?: readonly [number, number]
  rotationSnapDegrees?: readonly number[]
  rotationSnapThreshold?: number
}

export interface GestureCommit {
  changed: boolean
  geometry: SlotGeometry
  page: 'left' | 'right'
  activeGuides: GestureGuide[]
  rotationSnapped: boolean
}

const GEOMETRY_PRECISION = 1000
const MIN_SLOT_MM = 5
const DEFAULT_MIN_VISIBLE_MM = 5
const DEFAULT_ROTATION_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315]

function roundGeometryValue(value: number) {
  return Math.round(value * GEOMETRY_PRECISION) / GEOMETRY_PRECISION
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeRotation(rotation: number) {
  const normalized = rotation % 360
  return roundGeometryValue(normalized < 0 ? normalized + 360 : normalized)
}

function circularDistance(left: number, right: number) {
  const distance = Math.abs(left - right) % 360
  return Math.min(distance, 360 - distance)
}

function uniqueGuides(guides: GestureGuide[]) {
  const seen = new Set<string>()
  return guides.filter((guide) => {
    const key = `${guide.axis}:${guide.position}:${guide.kind}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function buildGestureGuides(pageW: number, pageH: number, safeMargin: number): GestureGuide[] {
  const spreadW = pageW * 2
  return uniqueGuides([
    { axis: 'x', position: 0, kind: 'page-edge' },
    { axis: 'x', position: safeMargin, kind: 'safe-margin' },
    { axis: 'x', position: pageW / 2, kind: 'page-center' },
    { axis: 'x', position: pageW - safeMargin, kind: 'safe-margin' },
    { axis: 'x', position: pageW, kind: 'spine' },
    { axis: 'x', position: pageW + safeMargin, kind: 'safe-margin' },
    { axis: 'x', position: pageW + pageW / 2, kind: 'page-center' },
    { axis: 'x', position: spreadW - safeMargin, kind: 'safe-margin' },
    { axis: 'x', position: spreadW, kind: 'page-edge' },
    { axis: 'y', position: 0, kind: 'page-edge' },
    { axis: 'y', position: safeMargin, kind: 'safe-margin' },
    { axis: 'y', position: pageH / 2, kind: 'page-center' },
    { axis: 'y', position: pageH - safeMargin, kind: 'safe-margin' },
    { axis: 'y', position: pageH, kind: 'page-edge' },
  ])
}

export function normalizeGestureGeometry(geometry: SlotGeometry): SlotGeometry {
  return {
    x: roundGeometryValue(geometry.x),
    y: roundGeometryValue(geometry.y),
    w: Math.max(MIN_SLOT_MM, roundGeometryValue(geometry.w)),
    h: Math.max(MIN_SLOT_MM, roundGeometryValue(geometry.h)),
    rotation: normalizeRotation(geometry.rotation),
  }
}

function nearestGuide(value: number, guides: GestureGuide[], threshold: number) {
  let nearest: GestureGuide | null = null
  let distance = Number.POSITIVE_INFINITY
  for (const guide of guides) {
    const nextDistance = Math.abs(guide.position - value)
    if (nextDistance <= threshold && nextDistance < distance) {
      nearest = guide
      distance = nextDistance
    }
  }
  return nearest
}

function snapDragAxis(start: number, size: number, guides: GestureGuide[], threshold: number) {
  const anchors = [start, start + size / 2, start + size]
  let best: { guide: GestureGuide; offset: number; distance: number } | null = null
  for (const anchor of anchors) {
    const guide = nearestGuide(anchor, guides, threshold)
    if (!guide) continue
    const offset = guide.position - anchor
    const distance = Math.abs(offset)
    if (!best || distance < best.distance) best = { guide, offset, distance }
  }
  return best
}

function snapResizeAxis(start: number, size: number, direction: number, guides: GestureGuide[], threshold: number) {
  if (direction === 0) return null
  const anchor = direction < 0 ? start : start + size
  const guide = nearestGuide(anchor, guides, threshold)
  if (!guide) return null
  const offset = guide.position - anchor
  return { guide, offset, distance: Math.abs(offset) }
}

export function snapGestureGeometry(
  geometry: SlotGeometry,
  guides: GestureGuide[],
  threshold: number,
  kind: GestureKind,
  resizeDirection: readonly [number, number] = [0, 0],
) {
  const next = { ...geometry }
  const activeGuides: GestureGuide[] = []
  const xGuides = guides.filter((guide) => guide.axis === 'x')
  const yGuides = guides.filter((guide) => guide.axis === 'y')
  const xSnap = kind === 'resize'
    ? snapResizeAxis(next.x, next.w, resizeDirection[0], xGuides, threshold)
    : snapDragAxis(next.x, next.w, xGuides, threshold)
  const ySnap = kind === 'resize'
    ? snapResizeAxis(next.y, next.h, resizeDirection[1], yGuides, threshold)
    : snapDragAxis(next.y, next.h, yGuides, threshold)

  if (kind !== 'rotate' && xSnap) {
    if (kind === 'resize' && resizeDirection[0] < 0) {
      next.x += xSnap.offset
      next.w -= xSnap.offset
    } else if (kind === 'resize' && resizeDirection[0] > 0) {
      next.w += xSnap.offset
    } else {
      next.x += xSnap.offset
    }
    activeGuides.push(xSnap.guide)
  }

  if (kind !== 'rotate' && ySnap) {
    if (kind === 'resize' && resizeDirection[1] < 0) {
      next.y += ySnap.offset
      next.h -= ySnap.offset
    } else if (kind === 'resize' && resizeDirection[1] > 0) {
      next.h += ySnap.offset
    } else {
      next.y += ySnap.offset
    }
    activeGuides.push(ySnap.guide)
  }

  return { geometry: normalizeGestureGeometry(next), activeGuides }
}

export function snapGestureRotation(rotation: number, snapDegrees: readonly number[], threshold: number) {
  const normalized = normalizeRotation(rotation)
  const nearest = snapDegrees.reduce<{ value: number; distance: number } | null>((best, value) => {
    const distance = circularDistance(normalized, value)
    return !best || distance < best.distance ? { value, distance } : best
  }, null)
  if (!nearest || nearest.distance > threshold) return { rotation: normalized, snapped: false }
  return { rotation: normalizeRotation(nearest.value), snapped: true }
}

export function applyGestureBoundary(geometry: SlotGeometry, boundary: GestureBoundary): SlotGeometry {
  const minVisible = boundary.minVisible ?? DEFAULT_MIN_VISIBLE_MM
  return {
    ...geometry,
    x: roundGeometryValue(clamp(
      geometry.x,
      -boundary.bleed + minVisible - geometry.w,
      boundary.spreadW + boundary.bleed - minVisible,
    )),
    y: roundGeometryValue(clamp(
      geometry.y,
      -boundary.bleed + minVisible - geometry.h,
      boundary.pageH + boundary.bleed - minVisible,
    )),
  }
}

export function finalizeGestureGeometry(geometry: SlotGeometry, options: GestureSessionOptions) {
  const normalized = normalizeGestureGeometry(geometry)
  const snapped = snapGestureGeometry(
    normalized,
    options.guides,
    options.snapThreshold,
    options.kind,
    options.resizeDirection,
  )
  const rotation = snapGestureRotation(
    snapped.geometry.rotation,
    options.rotationSnapDegrees ?? DEFAULT_ROTATION_SNAPS,
    options.rotationSnapThreshold ?? 3,
  )
  const bounded = applyGestureBoundary({ ...snapped.geometry, rotation: rotation.rotation }, options.boundary)
  return { geometry: bounded, activeGuides: snapped.activeGuides, rotationSnapped: rotation.snapped }
}

export class GestureSession {
  readonly initial: SlotGeometry
  private draft: SlotGeometry

  constructor(initial: SlotGeometry, private readonly options: GestureSessionOptions) {
    this.initial = normalizeGestureGeometry(initial)
    this.draft = this.initial
  }

  update(next: SlotGeometry) {
    this.draft = next
    return this.draft
  }

  getDraft() {
    return this.draft
  }

  commit(slot: Slot): GestureCommit {
    const finalized = finalizeGestureGeometry(this.draft, this.options)
    return {
      changed: !geometryEqual(this.initial, finalized.geometry),
      geometry: finalized.geometry,
      page: getSlotPageSide({ ...slot, ...finalized.geometry }, this.options.pageW),
      activeGuides: finalized.activeGuides,
      rotationSnapped: finalized.rotationSnapped,
    }
  }
}
