import type { ZineCustomSizeMm, ZinePageOrientation, ZinePageSize, ZinePageSizeDef } from './types'

export const PAGE_SIZES: Record<Exclude<ZinePageSize, 'custom'>, ZinePageSizeDef> = {
  a4: { id: 'a4', label: 'A4', widthMm: 210, heightMm: 297 },
  a5: { id: 'a5', label: 'A5', widthMm: 148, heightMm: 210 },
  b5: { id: 'b5', label: 'B5', widthMm: 176, heightMm: 250 },
  letter: { id: 'letter', label: 'Letter', widthMm: 216, heightMm: 279 },
  square: { id: 'square', label: 'Square 200', widthMm: 200, heightMm: 200 },
}

// 自定义尺寸的允许范围（毫米）：下限避免退化布局，上限覆盖常见大幅面
export const CUSTOM_SIZE_MIN_MM = 60
export const CUSTOM_SIZE_MAX_MM = 500

export function clampCustomSizeMm(size: ZineCustomSizeMm): ZineCustomSizeMm {
  const clamp = (value: number) => Math.min(CUSTOM_SIZE_MAX_MM, Math.max(CUSTOM_SIZE_MIN_MM, Math.round(value)))
  return { width: clamp(size.width), height: clamp(size.height) }
}

export function getPageSize(size: ZinePageSize, orientation: ZinePageOrientation = 'portrait', customSizeMm?: ZineCustomSizeMm): ZinePageSizeDef {
  const page: ZinePageSizeDef =
    size === 'custom'
      ? { id: 'custom', label: 'Custom', widthMm: customSizeMm?.width ?? PAGE_SIZES.a5.widthMm, heightMm: customSizeMm?.height ?? PAGE_SIZES.a5.heightMm }
      : PAGE_SIZES[size]
  return orientation === 'portrait' ? page : { ...page, widthMm: page.heightMm, heightMm: page.widthMm }
}

export function getSpreadSize(size: ZinePageSize, orientation: ZinePageOrientation = 'portrait', customSizeMm?: ZineCustomSizeMm) {
  const page = getPageSize(size, orientation, customSizeMm)
  return { pageW: page.widthMm, pageH: page.heightMm, spreadW: page.widthMm * 2, spreadH: page.heightMm }
}

interface PageSizeSource {
  pageSize: ZinePageSize
  pageOrientation: ZinePageOrientation
  customSizeMm?: ZineCustomSizeMm
}

export function getProjectSpreadSize(project: PageSizeSource) {
  return getSpreadSize(project.pageSize, project.pageOrientation, project.customSizeMm)
}

export function getPageSizeLabel(project: PageSizeSource): string {
  if (project.pageSize === 'custom') {
    const page = getPageSize('custom', 'portrait', project.customSizeMm)
    return `${page.widthMm}×${page.heightMm}mm`
  }
  return PAGE_SIZES[project.pageSize]?.label ?? project.pageSize.toUpperCase()
}
