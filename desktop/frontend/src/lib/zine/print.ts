import type { Spread, ZinePageNumberPosition, ZineProject } from './types'

/** 默认出血 3mm：国内外印刷通行标准 */
export const DEFAULT_BLEED_MM = 3
/** 出血外侧预留的裁切角线区宽度 */
export const CROP_MARK_AREA_MM = 5
/** 安全边距：文字等关键内容与成品边缘的建议最小距离 */
export const SAFE_MARGIN_MM = 5
/** 低于该有效 DPI 的图片在打印时明显发糊 */
export const MIN_PRINT_DPI = 150

/** 页码基线距成品底边的距离与字号 */
export const PAGE_NUMBER_BOTTOM_MM = 9
export const PAGE_NUMBER_FONT_PT = 8

/** 页码在页内的对齐：居中，或书籍式外侧（左页靠左、右页靠右） */
export function getPageNumberAlign(side: 'left' | 'right', position: ZinePageNumberPosition): 'left' | 'center' | 'right' {
  if (position === 'bottom-center') return 'center'
  return side === 'left' ? 'left' : 'right'
}

export function getProjectBleedMm(project: Pick<ZineProject, 'bleedMm'>): number {
  const bleed = project.bleedMm
  return typeof bleed === 'number' && Number.isFinite(bleed) && bleed >= 0 ? bleed : DEFAULT_BLEED_MM
}

export function isCoverSpread(spread: Pick<Spread, 'role'>): boolean {
  return spread.role === 'cover'
}

export function hasCoverSpread(project: Pick<ZineProject, 'spreads'>): boolean {
  return project.spreads.some(isCoverSpread)
}

export function getContentSpreads(project: Pick<ZineProject, 'spreads'>): Spread[] {
  return project.spreads.filter((spread) => !isCoverSpread(spread))
}

/**
 * 总页数：内页每跨页 2 页；含封面时封面跨页贡献封面 + 封底 2 页。
 * 自封面骑马钉装订要求总页数为 4 的倍数。
 */
export function getTotalPageCount(project: Pick<ZineProject, 'spreads'>): number {
  return project.spreads.length * 2
}

export function isSaddleStitchReady(project: Pick<ZineProject, 'spreads'>): boolean {
  return getTotalPageCount(project) % 4 === 0
}

export interface PrintPageRef {
  /** 阅读顺序页码，从 1 开始 */
  pageNumber: number
  /** 在 project.spreads 中的下标 */
  spreadIndex: number
  side: 'left' | 'right'
  role: 'cover-front' | 'cover-back' | 'content'
}

/**
 * 印刷单页导出的阅读顺序（自封面装订）：
 * 封面（封面跨页右半）→ 内页从左到右 → 封底（封面跨页左半）。
 * 无封面跨页时即内页顺序。封面跨页仅识别第一个，多余的按内页处理。
 */
export function buildPrintPageSequence(project: Pick<ZineProject, 'spreads'>): PrintPageRef[] {
  const coverIndex = project.spreads.findIndex(isCoverSpread)
  const pages: PrintPageRef[] = []

  if (coverIndex >= 0) {
    pages.push({ pageNumber: pages.length + 1, spreadIndex: coverIndex, side: 'right', role: 'cover-front' })
  }
  project.spreads.forEach((spread, spreadIndex) => {
    if (spreadIndex === coverIndex) return
    pages.push({ pageNumber: pages.length + 1, spreadIndex, side: 'left', role: 'content' })
    pages.push({ pageNumber: pages.length + 1, spreadIndex, side: 'right', role: 'content' })
  })
  if (coverIndex >= 0) {
    pages.push({ pageNumber: pages.length + 1, spreadIndex: coverIndex, side: 'left', role: 'cover-back' })
  }

  return pages
}

/**
 * 页面导航条/画布角标用：某个跨页对应的页码标注。
 * 封面跨页显示为封底·封面；内页按阅读顺序推算（含封面时封面为 P1）。
 */
export function getSpreadPageNumbers(project: Pick<ZineProject, 'spreads'>, spreadIndex: number): { left: number; right: number } | 'cover' {
  const coverIndex = project.spreads.findIndex(isCoverSpread)
  if (spreadIndex === coverIndex) return 'cover'

  const contentOrder = project.spreads.slice(0, spreadIndex).filter((_, index) => index !== coverIndex).length
  const base = coverIndex >= 0 ? 2 : 1
  const left = base + contentOrder * 2
  return { left, right: left + 1 }
}

/**
 * 有效打印分辨率。图片以 object-fit: cover 铺满槽位后再按用户缩放放大，
 * 因此每毫米的源像素随铺满比例与缩放同步下降。
 */
export function calculateEffectiveDpi(assetWidthPx: number, assetHeightPx: number, slotWmm: number, slotHmm: number, imageScale = 1): number {
  if (assetWidthPx <= 0 || assetHeightPx <= 0 || slotWmm <= 0 || slotHmm <= 0) return 0
  const mmPerSourcePx = Math.max(slotWmm / assetWidthPx, slotHmm / assetHeightPx)
  const scale = imageScale > 0 ? imageScale : 1
  return 25.4 / (mmPerSourcePx * scale)
}

export interface LowResSlotWarning {
  spreadIndex: number
  slotId: string
  assetFileName: string
  effectiveDpi: number
}

/** 汇总项目中所有低于 MIN_PRINT_DPI 的图片槽位（跳过空槽与像素信息缺失的素材） */
export function collectLowResSlots(project: Pick<ZineProject, 'spreads' | 'assets'>): LowResSlotWarning[] {
  const warnings: LowResSlotWarning[] = []

  project.spreads.forEach((spread, spreadIndex) => {
    for (const slot of spread.slots) {
      if (slot.kind !== 'image' || !slot.assetId) continue
      const asset = project.assets.find((item) => item.id === slot.assetId)
      if (!asset || asset.width <= 0 || asset.height <= 0) continue

      const effectiveDpi = calculateEffectiveDpi(asset.width, asset.height, slot.w, slot.h, slot.imageTransform.scale)
      if (effectiveDpi > 0 && effectiveDpi < MIN_PRINT_DPI) {
        warnings.push({ spreadIndex, slotId: slot.id, assetFileName: asset.fileName, effectiveDpi: Math.round(effectiveDpi) })
      }
    }
  })

  return warnings
}
