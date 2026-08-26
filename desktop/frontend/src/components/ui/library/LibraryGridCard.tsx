import type { CSSProperties } from 'react'
import { Check } from 'lucide-react'

/**
 * 资源库网格卡片的共享外观与选择交互。
 *
 * 云端照片卡（PhotosPage.PhotoGridCard）与本地资产卡（LocalAssetGrid.AssetCard）
 * 的卡壳、选中描边、缩略图适配（裁切 / 适应 / 瀑布流）和左上角复选框此前是两份
 * 逐字重复的实现。卡片内部的角标与右键菜单仍属各自领域，保留在原组件中。
 */

export type LibraryCardViewMode = 'crop' | 'fit' | 'masonry'

/** 卡壳形状类：瀑布流为行内块并自带底部间距，网格为等高纵向 flex。 */
export function libraryCardShellClassName(viewMode: LibraryCardViewMode) {
  return viewMode === 'masonry'
    ? 'group mb-1.5 inline-block w-full min-w-0 overflow-hidden rounded-sm border align-top text-left transition focus:outline-none'
    : 'group flex h-full min-w-0 flex-col overflow-hidden rounded-lg border text-left transition focus:outline-none'
}

/**
 * 卡壳选中/聚焦描边：选中或键盘聚焦时统一用主色描边 + accent 底色。
 * 瀑布流未选中时描边透明，避免密排时出现网格线噪点。
 */
export function libraryCardSurfaceStyle({
  selected,
  focused,
  viewMode,
}: {
  selected: boolean
  focused: boolean
  viewMode: LibraryCardViewMode
}): CSSProperties {
  const highlighted = selected || focused
  return {
    borderColor: highlighted
      ? 'var(--primary)'
      : viewMode === 'masonry'
        ? 'transparent'
        : 'var(--border)',
    backgroundColor: highlighted ? 'var(--accent)' : 'transparent',
    boxShadow: highlighted ? '0 0 0 1px var(--primary)' : undefined,
  }
}

/** 缩略图适配类：裁切填充 / 完整比例 / 瀑布流三种视图的统一表现。 */
export function libraryThumbnailClassName(viewMode: LibraryCardViewMode) {
  const fit =
    viewMode === 'masonry'
      ? 'block h-full object-cover group-hover:scale-[1.015]'
      : viewMode === 'fit'
        ? 'h-full object-contain p-1'
        : 'h-full object-cover group-hover:scale-[1.025]'
  return `w-full transition-[transform,opacity] duration-300 ${fit}`
}

/**
 * 卡片左上角选择复选框。
 *
 * 用 `span[role=checkbox]` 而非 `button`，因为本地卡壳本身就是 `<button>`，
 * 嵌套按钮是非法结构；云端卡壳是 `div`，同样兼容。
 */
export function LibraryCardCheckbox({
  selected,
  onToggle,
  label,
  disabled = false,
}: {
  selected: boolean
  onToggle: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <span
      role="checkbox"
      aria-checked={selected}
      aria-label={label}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={(event) => {
        event.stopPropagation()
        if (!disabled) onToggle()
      }}
      onKeyDown={(event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return
        event.preventDefault()
        event.stopPropagation()
        if (!disabled) onToggle()
      }}
      className={`absolute left-2 top-2 z-30 flex h-5 w-5 items-center justify-center rounded border transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      style={{
        backgroundColor: selected ? 'var(--primary)' : 'rgba(0,0,0,0.4)',
        borderColor: selected ? 'var(--primary)' : 'rgba(255,255,255,0.7)',
      }}
    >
      {selected && <Check size={12} className="text-white" />}
    </span>
  )
}
