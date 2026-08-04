import type { ZineImageTransform } from './types'

const MIN_SCALE = 0.1
const MAX_SCALE = 8

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export class CropSession {
  readonly initial: ZineImageTransform
  private draft: ZineImageTransform

  constructor(initial: ZineImageTransform) {
    this.initial = { ...initial }
    this.draft = { ...initial }
  }

  pan(deltaXpx: number, deltaYpx: number, widthPx: number, heightPx: number) {
    this.draft = {
      ...this.draft,
      offsetX: this.draft.offsetX + (deltaXpx / Math.max(1, widthPx)) * 100,
      offsetY: this.draft.offsetY + (deltaYpx / Math.max(1, heightPx)) * 100,
    }
    return this.draft
  }

  zoom(deltaY: number, step = 1.08) {
    const factor = deltaY < 0 ? step : 1 / step
    this.draft = { ...this.draft, scale: clamp(this.draft.scale * factor, MIN_SCALE, MAX_SCALE) }
    return this.draft
  }

  reset() {
    this.draft = { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 }
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
