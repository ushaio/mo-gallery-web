import type { CSSProperties } from 'react'
import type { PhotoDto, StoryCoverCropValue, StoryDto } from '@/lib/api/types'

export interface StoryCoverCrop {
  x: number
  y: number
  width: number
  height: number
}

const MIN_CROP_SIZE = 0.1
const MAX_CROP_ZOOM = 4
const DEFAULT_FULL_CROP: StoryCoverCrop = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function normalizeStoryCoverCrop(
  crop?: Partial<StoryCoverCrop> | null,
): StoryCoverCrop {
  const width = clamp(crop?.width ?? DEFAULT_FULL_CROP.width, MIN_CROP_SIZE, 1)
  const height = clamp(crop?.height ?? DEFAULT_FULL_CROP.height, MIN_CROP_SIZE, 1)
  const x = clamp(crop?.x ?? DEFAULT_FULL_CROP.x, 0, 1 - width)
  const y = clamp(crop?.y ?? DEFAULT_FULL_CROP.y, 0, 1 - height)

  return { x, y, width, height }
}

export function getStoryCoverCrop(story: Pick<StoryDto, 'coverCrop'>): StoryCoverCrop | null {
  if (!story.coverCrop) {
    return null
  }

  return normalizeStoryCoverCrop(story.coverCrop)
}

export function isDefaultStoryCoverCrop(crop?: StoryCoverCrop | null) {
  if (!crop) return true

  return (
    Math.abs(crop.x) < 0.001 &&
    Math.abs(crop.y) < 0.001 &&
    Math.abs(crop.width - 1) < 0.001 &&
    Math.abs(crop.height - 1) < 0.001
  )
}

export function getStoryCoverPhoto(story: Pick<StoryDto, 'coverPhotoId' | 'photos'>): PhotoDto | null {
  if (!story.photos?.length) {
    return null
  }

  if (story.coverPhotoId) {
    return story.photos.find((photo) => photo.id === story.coverPhotoId) || story.photos[0]
  }

  return story.photos[0]
}

export function getStoryCoverImageStyle(
  story: Pick<StoryDto, 'coverCrop'>,
): CSSProperties | undefined {
  const crop = getStoryCoverCrop(story)
  if (!crop) {
    return undefined
  }

  const centerX = (crop.x + crop.width / 2) * 100
  const centerY = (crop.y + crop.height / 2) * 100
  const zoom = clamp(1 / Math.sqrt(crop.width * crop.height), 1, MAX_CROP_ZOOM)

  return {
    objectPosition: `${centerX}% ${centerY}%`,
    transform: `scale(${zoom})`,
    transformOrigin: 'center center',
  }
}

export function toStoryCoverCropValue(crop: StoryCoverCrop | null | undefined): StoryCoverCropValue | null {
  if (!crop) return null
  const normalized = normalizeStoryCoverCrop(crop)
  return {
    x: normalized.x,
    y: normalized.y,
    width: normalized.width,
    height: normalized.height,
  }
}
