import type { PhotoDto } from '@/lib/api/types'

/**
 * Height of the caption block under a non-immersive masonry card:
 * 16px image margin + 20px title line (text-body * leading-tight) + 6px gap +
 * 18px category line (text-label * inherited 1.5). Title and category are
 * single-line truncated so this stays exact — the pre-seeded positioner cell
 * heights in MasonryView depend on it matching the rendered offsetHeight.
 */
export const MASONRY_CAPTION_HEIGHT = 60

export function photoAspectRatio(photo: Pick<PhotoDto, 'width' | 'height'>): number {
  const width = photo.width > 0 ? photo.width : 4
  const height = photo.height > 0 ? photo.height : 3
  return width / height
}

/**
 * Integer height so the seeded positioner height and the element's measured
 * offsetHeight agree exactly — fractional heights would make every cell report
 * a ResizeObserver correction and reflow the columns below it.
 */
export function masonryImageHeight(columnWidth: number, aspectRatio: number): number {
  return Math.max(1, Math.round(columnWidth / aspectRatio))
}
