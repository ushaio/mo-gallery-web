/**
 * 资源库瀑布流分列：云端照片与本地资产此前各有一份完全相同的贪心分列实现。
 * 这里保留单一实现，调用方只需提供宽高比。
 */

/** 列间距（px）：云端与本地网格保持一致。 */
export const MASONRY_COLUMN_GAP = 6

/** 卡片底部外边距（px）：参与高度估算，保证两端列高分布一致。 */
const MASONRY_CARD_MARGIN = 6

const DEFAULT_ASPECT_RATIO = 4 / 3

/**
 * 按「当前最短列优先」把条目分配到各列。
 * `getAspectRatio` 返回 undefined / 非正数时按 4:3 估算，避免无尺寸元数据的
 * 资产（RAW、未解析 EXIF）把某一列拉得过长。
 */
export function distributeMasonryItems<T>(
  items: T[],
  columnCount: number,
  columnWidth: number,
  getAspectRatio: (item: T) => number | undefined,
): T[][] {
  const safeColumnCount = Math.max(1, columnCount)
  const columns = Array.from({ length: safeColumnCount }, () => [] as T[])
  const heights = Array.from({ length: safeColumnCount }, () => 0)

  for (const item of items) {
    let targetColumn = 0
    for (let index = 1; index < heights.length; index += 1) {
      if (heights[index] < heights[targetColumn]) targetColumn = index
    }

    const ratio = getAspectRatio(item)
    const aspectRatio = ratio && ratio > 0 ? ratio : DEFAULT_ASPECT_RATIO
    columns[targetColumn].push(item)
    heights[targetColumn] += Math.round(columnWidth / aspectRatio) + MASONRY_CARD_MARGIN
  }

  return columns
}
