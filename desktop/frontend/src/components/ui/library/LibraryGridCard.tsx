import type { CSSProperties, ReactNode } from 'react'
import { Check, Heart } from 'lucide-react'

/**
 * 资源库浏览视图的网格瓦片（参照 desktop/.ui/desktop-library-ui.html 的 .tile）：
 * 无边框、muted 底、6px 圆角的全出血图片瓦片；选中/聚焦时用
 * 「2px 背景色内圈 + 4px 主色外圈」的双层描边标出；文件名与大小以底部
 * 渐变浮层在悬停时显示；角标为深色半透明胶囊。
 */

export type LibraryCardViewMode = 'crop' | 'fit' | 'masonry'

/**
 * 瓦片外壳：muted 底。方形裁切 / 适应 / 瀑布流共用。
 *
 * 选中/聚焦描边不用 box-shadow：inset 阴影会画在子元素（铺满的缩略图）
 * 之下不可见，向外扩展的阴影又会与相邻瓦片互相覆盖；改用
 * `LibraryCardFocusRing` 覆盖层描边，画在图片之上、瓦片边界之内。
 */
export function libraryTileStyle(): CSSProperties {
  return {
    backgroundColor: 'var(--muted)',
  }
}

/** 选中/聚焦描边：2px 主色实线，画在缩略图之上、瓦片边界之内，不外溢。 */
export function LibraryCardFocusRing({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 z-30 rounded-[inherit] border-2"
      style={{ borderColor: 'var(--primary)' }}
    />
  )
}

/** 缩略图适配：裁切 / 完整比例 / 瀑布流均铺满（完整比例的瓦片尺寸与图片比例一致）。 */
export function libraryThumbnailClassName(viewMode: LibraryCardViewMode) {
  return 'h-full w-full object-cover'
}

/**
 * 完整比例（设计稿 .just）视图：瓦片高度固定为 --tile，宽度 = tile × 比例，
 * flex-grow = 比例 × 100，由容器把每行剩余空间按比例分配，实现两端对齐。
 */
export function libraryJustifiedContainerClassName() {
  return 'flex w-full flex-wrap gap-1'
}

/** 完整比例视图的单个瓦片样式；ratio 为宽高比（w/h）。 */
export function libraryJustifiedTileStyle(ratio: number, tile: number): CSSProperties {
  return {
    height: tile,
    width: `calc(${tile}px * ${ratio})`,
    flexGrow: Math.round(ratio * 100),
  }
}

/** 完整比例视图末尾的占位元素：吸收最后一行的剩余空间，保持行左对齐。 */
export function LibraryJustifiedFiller() {
  return <span aria-hidden className="block" style={{ flexGrow: 100000, flexBasis: 0 }} />
}

/**
 * 瓦片左上角选择复选框：16px、4px 圆角，悬停或选中时出现。
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
      className={`absolute left-2 top-2 z-30 flex h-4 w-4 items-center justify-center rounded-[4px] border-[1.5px] shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      style={{
        backgroundColor: selected ? 'var(--primary)' : 'var(--background)',
        borderColor: selected ? 'var(--primary)' : 'var(--border)',
      }}
    >
      {selected && (
        <Check size={10} strokeWidth={3} style={{ color: 'var(--primary-foreground)' }} />
      )}
    </span>
  )
}

/** 右上角状态角标：深色半透明胶囊；warn 为白底深色。color 可覆盖文字色。 */
export function LibraryCardBadge({
  children,
  title,
  warn = false,
  color,
}: {
  children: ReactNode
  title?: string
  warn?: boolean
  color?: string
}) {
  return (
    <span
      title={title}
      className="inline-flex h-5 min-w-5 items-center justify-center gap-[3px] rounded-[5px] px-[5px] text-[10px] font-semibold leading-none backdrop-blur-sm"
      style={{
        backgroundColor: warn ? 'rgba(255,255,255,0.92)' : 'rgba(9,9,11,0.62)',
        color: color ?? (warn ? '#18181b' : '#ffffff'),
      }}
    >
      {children}
    </span>
  )
}

/** 左下角精选心标。 */
export function LibraryCardFavorite() {
  return (
    <Heart
      size={13}
      fill="currentColor"
      aria-hidden
      className="pointer-events-none absolute bottom-2 left-2 z-10 text-white drop-shadow"
    />
  )
}

/** 胶片瓦片的白色内框。 */
export function LibraryCardFilmFrame() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[5] rounded-[inherit] border-2 border-white/35 mix-blend-overlay"
    />
  )
}

/** 底部悬停浮层：渐变背景上显示文件名与大小。 */
export function LibraryCardCaption({
  name,
  meta,
}: {
  name: ReactNode
  meta?: ReactNode
}) {
  return (
    <span
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      style={{
        padding: '22px 8px 7px',
        color: '#ffffff',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.65))',
      }}
    >
      <b className="truncate text-[11px] font-medium">{name}</b>
      {meta != null && (
        <span className="shrink-0 text-[11px] opacity-75">{meta}</span>
      )}
    </span>
  )
}

/** 角标/浮层用的大小文案：MB 一位小数，未知时返回 undefined。 */
export function formatLibraryCardSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return undefined
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
