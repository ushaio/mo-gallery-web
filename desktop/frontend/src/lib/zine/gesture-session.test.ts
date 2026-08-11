import assert from 'node:assert/strict'

import {
  GestureSession,
  applyGestureBoundary,
  buildGestureGuides,
  constrainMovementToAxis,
  finalizeGestureGeometry,
  getDominantMovementAxis,
  snapGestureRotation,
} from './gesture-session'
import type { ImageSlot } from './types'

const guides = buildGestureGuides(148, 210, 5)
const slot: ImageSlot = {
  id: 'gesture-slot',
  kind: 'image',
  page: 'left',
  x: 20,
  y: 20,
  w: 40,
  h: 30,
  rotation: 0,
  zIndex: 1,
  assetId: null,
  imageTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 },
}

const snapped = finalizeGestureGeometry(
  { x: 73.1, y: 20, w: 40, h: 30, rotation: 44.2 },
  {
    kind: 'drag',
    pageW: 148,
    guides,
    snapThreshold: 2,
    boundary: { bleed: 3, pageH: 210, spreadW: 296 },
  },
)
assert.equal(snapped.geometry.x, 74, 'the slot center snaps to the left-page center')
assert.equal(snapped.geometry.rotation, 45, 'rotation snaps to the nearest configured angle')
assert.equal(snapped.rotationSnapped, true)
assert.equal(snapped.activeGuides[0]?.kind, 'page-center')

const acrossSpine = new GestureSession(slot, {
  kind: 'drag',
  pageW: 148,
  guides,
  snapThreshold: 0.1,
  boundary: { bleed: 3, pageH: 210, spreadW: 296 },
})
acrossSpine.update({ ...slot, x: 151, y: 20, w: 40, h: 30, rotation: 0 })
const committed = acrossSpine.commit(slot)
assert.equal(committed.page, 'right')
assert.equal(committed.geometry.x, 151, 'crossing the spine keeps one spread-space x coordinate')

const bounded = applyGestureBoundary(
  { x: -100, y: 250, w: 40, h: 30, rotation: 0 },
  { bleed: 3, pageH: 210, spreadW: 296 },
)
assert.equal(bounded.x, -38, 'boundary policy keeps a minimum visible area while allowing bleed')
assert.equal(bounded.y, 208, 'boundary policy keeps the slot partially visible at the bottom')

const rotation = snapGestureRotation(-1.5, [0, 45, 90], 3)
assert.equal(rotation.rotation, 0)
assert.equal(rotation.snapped, true)

assert.equal(getDominantMovementAxis(18, 7), 'x', 'Shift drag locks to the dominant horizontal axis')
assert.deepEqual(constrainMovementToAxis(18, 7, 'x'), [18, 0])
assert.equal(getDominantMovementAxis(4, -12), 'y', 'Shift drag locks to the dominant vertical axis')
assert.deepEqual(constrainMovementToAxis(4, -12, 'y'), [0, -12])

console.log('✓ Zine gesture session normalization, snapping, boundary, and cross-spread behavior')
