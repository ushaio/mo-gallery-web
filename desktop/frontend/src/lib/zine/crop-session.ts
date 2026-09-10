import { toFrameDelta } from './geometry'
import type { ZineImageTransform } from './types'

export const MIN_CROP_SCALE = 0.1
export const MAX_CROP_SCALE = 8

export function createDefaultImageTransform(): ZineImageTransform {
  return { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function clampCropScale(value: number) {
  if (!Number.isFinite(value)) return 1
  return clamp(value, MIN_CROP_SCALE, MAX_CROP_SCALE)
}

export class CropSession {
  readonly initial: ZineImageTransform
  private draft: ZineImageTransform

  constructor(initial: ZineImageTransform) {
    this.initial = { ...initial }
    this.draft = { ...initial }
  }

  pan(deltaXpx: number, deltaYpx: number, widthPx: number, heightPx: number, frameRotation = 0) {
    const [localX, localY] = toFrameDelta(deltaXpx, deltaYpx, frameRotation)
    this.draft = {
      ...this.draft,
      offsetX: this.draft.offsetX + (localX / Math.max(1, widthPx)) * 100,
      offsetY: this.draft.offsetY + (localY / Math.max(1, heightPx)) * 100,
    }
    return this.draft
  }

  zoom(deltaY: number, step = 1.08) {
    if (deltaY === 0) return this.draft
    const factor = deltaY < 0 ? step : 1 / step
    this.draft = { ...this.draft, scale: clampCropScale(this.draft.scale * factor) }
    return this.draft
  }

  reset() {
    this.draft = createDefaultImageTransform()
    return this.draft
  }

  update(next: ZineImageTransform) {
    this.draft = { ...next }
    return this.draft
  }

  getDraft() {
    return this.draft
  }

  cancel() {
    this.draft = { ...this.initial }
    return this.draft
  }

  commit() {
    return { ...this.draft }
  }

  changed() {
    return JSON.stringify(this.initial) !== JSON.stringify(this.draft)
  }
}
