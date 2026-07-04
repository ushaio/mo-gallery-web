import type { ZinePageOrientation, ZinePageSize, ZinePageSizeDef } from './types'

export const PAGE_SIZES: Record<ZinePageSize, ZinePageSizeDef> = {
  a4: { id: 'a4', label: 'A4', widthMm: 210, heightMm: 297 },
  a5: { id: 'a5', label: 'A5', widthMm: 148, heightMm: 210 },
  letter: { id: 'letter', label: 'Letter', widthMm: 216, heightMm: 279 },
  square: { id: 'square', label: 'Square 200', widthMm: 200, heightMm: 200 },
}

export function getPageSize(size: ZinePageSize, orientation: ZinePageOrientation = 'portrait'): ZinePageSizeDef {
  const page = PAGE_SIZES[size]
  return orientation === 'portrait' ? page : { ...page, widthMm: page.heightMm, heightMm: page.widthMm }
}

export function getSpreadSize(size: ZinePageSize, orientation: ZinePageOrientation = 'portrait') {
  const page = getPageSize(size, orientation)
  return { pageW: page.widthMm, pageH: page.heightMm, spreadW: page.widthMm * 2, spreadH: page.heightMm }
}
