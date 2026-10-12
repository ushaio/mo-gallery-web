import type { CSSProperties } from 'react'
import { galleryColumns, normalizeGalleryLayout } from './media'
import type { GalleryLayout } from './media'

/**
 * 拼图的网格行列数——**唯一的几何来源**：正文卡片、编辑弹窗预览、弹窗里
 * 「拼图样式」的线框缩略图都由它推出来，三处不会各算各的。
 */
export function galleryGridShape(count: number, value?: GalleryLayout): { columns: number; rows: number } {
  const layout = normalizeGalleryLayout(value)
  const columns = layout === 'stack' ? 1 : layout === 'grid' ? galleryColumns(count) : 2
  const rows = Math.max(1, layout === 'hero-top' ? 1 + Math.ceil((count - 1) / 2)
    : layout === 'hero-left' ? count - 1 : Math.ceil(count / columns))
  return { columns, rows }
}

/** Shared geometry: the dialog must show the same crop windows as the article. */
export function galleryGridStyle(count: number, value?: GalleryLayout): CSSProperties {
  const { columns, rows } = galleryGridShape(count, value)
  return {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    aspectRatio: `${columns * 4} / ${rows * 3}`,
  }
}

export function galleryTileStyle(index: number, count: number, layout?: GalleryLayout): CSSProperties {
  if (count === 1) return { gridColumn: '1 / -1' }
  if (index !== 0) return {}
  if (layout === 'hero-top') return { gridColumn: '1 / -1' }
  if (layout === 'hero-left') return { gridRow: `1 / span ${Math.max(1, count - 1)}` }
  return {}
}
