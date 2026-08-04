import { getSpreadSize } from './page-sizes'
import type { Slot, ZineProject } from './types'

export const ZINE_GEOMETRY_VERSION = 2 as const

export interface SlotGeometry {
  x: number
  y: number
  w: number
  h: number
  rotation: number
}

export function getSlotSpreadX(slot: Slot) {
  return slot.x
}

export function getSlotLocalX(slot: Slot, pageWmm: number) {
  return slot.page === 'right' ? slot.x - pageWmm : slot.x
}

export function getSlotPageSide(slot: Slot, pageWmm: number): 'left' | 'right' {
  const centerX = slot.x + slot.w / 2
  return centerX >= pageWmm ? 'right' : 'left'
}

export function normalizeSlotGeometry(slot: Slot, pageWmm: number): Slot {
  if (slot.page !== 'right' || slot.x >= pageWmm) return slot
  return { ...slot, x: slot.x + pageWmm }
}

export function migrateProjectGeometry(project: ZineProject): ZineProject {
  if (project.geometryVersion === ZINE_GEOMETRY_VERSION) return project

  const { pageW } = getSpreadSize(project.pageSize, project.pageOrientation, project.customSizeMm)
  return {
    ...project,
    geometryVersion: ZINE_GEOMETRY_VERSION,
    spreads: project.spreads.map((spread) => ({
      ...spread,
      slots: spread.slots.map((slot) => normalizeSlotGeometry(slot, pageW)),
    })),
  }
}

export function toSlotGeometry(slot: Slot): SlotGeometry {
  return { x: slot.x, y: slot.y, w: slot.w, h: slot.h, rotation: slot.rotation }
}

export function geometryEqual(left: SlotGeometry, right: SlotGeometry) {
  return left.x === right.x && left.y === right.y && left.w === right.w && left.h === right.h && left.rotation === right.rotation
}
