import type { ComponentType, HTMLAttributes, ReactNode } from 'react'
import { Fragment } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown, Loader2, Maximize2 } from 'lucide-react'
import { LIBRARY_EMPTY_VALUE } from './format'

/**
 * 资源库右侧信息栏的共享设计语言。
 *
 * 云端资源库（PhotoInfoSidebar）与本地资源库（LocalAssetDetails /
 * LocalAssetBatchDetails）此前各自复制了同一套面板外壳、折叠区块、元数据行、
 * 操作按钮和状态胶囊，改动一边就会让两边视觉漂移。这里是这些结构的唯一实现。
 *
 * 边界：只负责结构与视觉，不含任何 i18n 与领域逻辑；所有文案由调用方传入，
 * 云端专属（分类编辑、重新分析主色）与本地专属（评分、标签、集合）的业务块
 * 仍留在各自组件内。
 */

const PANEL_BASE_CLASS = 'hidden h-full w-[340px] shrink-0 flex-col border-l bg-background xl:flex'

/* ─── 面板外壳 ─── */

/**
 * 信息栏外壳：固定 340px、`xl` 以下隐藏、自身滚动。
 * spread `...rest` 以保留 `data-local-library-guide` 等引导锚点属性。
 */
export function LibraryDetailsPanel({
  children,
  className,
  style,
  ...rest
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <aside
      {...rest}
      className={`custom-scrollbar overflow-y-auto ${PANEL_BASE_CLASS} ${className ?? ''}`}
      style={{ borderColor: 'var(--border)', ...style }}
    >
      {children}
    </aside>
  )
}

/** 未选中任何资产时的信息栏占位，保持与内容态相同的宽度与边框。 */
export function LibraryDetailsEmpty({
  icon: Icon,
  message,
  className,
  style,
  ...rest
}: HTMLAttributes<HTMLElement> & { icon: LucideIcon, message: string }) {
  return (
    <aside
      {...rest}
      className={`items-center justify-center px-8 ${PANEL_BASE_CLASS} ${className ?? ''}`}
      style={{ borderColor: 'var(--border)', ...style }}
    >
      <Icon size={28} strokeWidth={1.2} style={{ color: 'var(--muted-foreground)' }} />
      <p className="mt-4 text-xs" style={{ color: 'var(--muted-foreground)' }}>
        {message}
      </p>
    </aside>
  )
}

/* ─── 折叠区块 ─── */

interface LibraryDetailsSectionProps {
  label: string
  icon: LucideIcon
  open: boolean
  onToggle: () => void
  /** 区块内条目数（本地标签/集合用），为 0 或 undefined 时不显示。 */
  count?: number
  /** 标题行右侧的额外操作（不参与折叠点击区域）。 */
  action?: ReactNode
  children: ReactNode
}

/** 折叠区块：图标 + 标题 + 可选计数 + 旋转箭头，标题整行可点击。 */
export function LibraryDetailsSection({
  label,
  icon: Icon,
  open,
  onToggle,
  count,
  action,
  children,
}: LibraryDetailsSectionProps) {
  return (
    <section className="border-b px-4 py-0.5" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2.5 py-2 text-left"
        >
          <Icon size={14} strokeWidth={1.8} style={{ color: 'var(--muted-foreground)' }} />
          <span
            className="flex-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: 'var(--foreground)' }}
          >
            {label}
          </span>
          {count !== undefined && count > 0 && (
            <span className="text-[10px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
              {count}
            </span>
          )}
          <ChevronDown
            size={14}
            className="transition-transform duration-200"
            style={{
              color: 'var(--muted-foreground)',
              transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}
          />
        </button>
        {action}
      </div>
      {open && <div className="pb-3">{children}</div>}
    </section>
  )
}

/* ─── 元数据行 ─── */

/**
 * 元数据行：左侧小号大写标签，右侧值（`mono` 用于尺寸等等宽数字）。
 *
 * `card` 改为「标签在上、值在下」的描边卡片，供 `grid grid-cols-2 gap-2` 两列网格
 * 使用：半栏宽度下横向排布会把日期这类长值截断，堆叠后值能占满整格，视觉上也与
 * 拍摄参数的卡片网格统一。
 */
export function LibraryMetaRow({
  label,
  value,
  mono,
  card,
}: {
  label: string
  value: string
  mono?: boolean
  card?: boolean
}) {
  if (card) {
    return (
      <div
        className="min-w-0 rounded-md border px-2.5 py-2"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}
      >
        <p
          className="truncate text-[9px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: 'var(--muted-foreground)' }}
        >
          {label}
        </p>
        <p
          className={`mt-1 truncate text-[11px] font-medium ${mono ? 'font-mono tabular-nums' : ''}`}
          title={value}
          style={{ color: 'var(--foreground)' }}
        >
          {value}
        </p>
      </div>
    )
  }
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span
        className="shrink-0 text-[10px] uppercase tracking-wide"
        style={{ color: 'var(--muted-foreground)' }}
      >
        {label}
      </span>
      <span
        className={`min-w-0 truncate text-right text-[11px] font-medium ${mono ? 'font-mono tabular-nums' : ''}`}
        title={value}
        style={{ color: 'var(--foreground)' }}
      >
        {value}
      </span>
    </div>
  )
}

/* ─── 带标签的字段块 ─── */

/**
 * 带标签的字段块：标签行（可带右侧操作，如「重新分析」/「复制」）+ 内容。
 * 主色条、路径、资源地址等成组字段都用它对齐两端的标签样式。
 */
export function LibraryFieldBlock({
  label,
  action,
  children,
  className,
}: {
  label: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`mt-2 ${className ?? ''}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p
          className="text-[10px] uppercase tracking-wide"
          style={{ color: 'var(--muted-foreground)' }}
        >
          {label}
        </p>
        {action}
      </div>
      {children}
    </div>
  )
}

/** 只读等宽文本框：路径、URL 等长值统一使用。 */
export function LibraryMonoValue({ value }: { value: string }) {
  return (
    <p
      className="break-all rounded border px-2.5 py-1.5 font-mono text-[10px] leading-relaxed"
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'var(--secondary)',
        color: 'var(--muted-foreground)',
      }}
    >
      {value || LIBRARY_EMPTY_VALUE}
    </p>
  )
}

/* ─── 主色条 ─── */

/**
 * 主色条：等宽色块拼接成一条。传入 `onSelect` 时色块可点击（云端用于复制色值），
 * 否则渲染为纯展示色块。
 */
export function LibraryColorStrip({
  colors,
  onSelect,
}: {
  colors: string[]
  onSelect?: (color: string) => void
}) {
  return (
    <div className="flex h-6 overflow-hidden rounded" style={{ border: '1px solid var(--border)' }}>
      {colors.map((color, index) =>
        onSelect ? (
          <button
            key={`${color}-${index}`}
            type="button"
            title={color}
            onClick={() => onSelect(color)}
            className="min-w-0 flex-1 transition-opacity hover:opacity-80"
            style={{ backgroundColor: color }}
          />
        ) : (
          <span
            key={`${color}-${index}`}
            title={color}
            className="min-w-0 flex-1"
            style={{ backgroundColor: color }}
          />
        ),
      )}
    </div>
  )
}

/* ─── 状态胶囊 ─── */

export type LibraryStatusTone = 'neutral' | 'success' | 'warning' | 'danger'

const STATUS_TONE_STYLE: Record<LibraryStatusTone, { color: string, backgroundColor: string }> = {
  neutral: { color: 'var(--muted-foreground)', backgroundColor: 'var(--secondary)' },
  success: { color: '#16A34A', backgroundColor: 'color-mix(in srgb, #22C55E 10%, transparent)' },
  warning: { color: '#B45309', backgroundColor: 'color-mix(in srgb, #F59E0B 12%, transparent)' },
  danger: {
    color: 'var(--destructive)',
    backgroundColor: 'color-mix(in srgb, var(--destructive) 10%, transparent)',
  },
}

/**
 * 胶囊图标：除 lucide 图标外，本地信息栏的上传状态用的是项目自有 SVG
 * （`CloudIcon` / `CloudOffIcon`），两者都只需要 `size`，所以这里放宽到「接受
 * size 的组件」，免得本地为了云图标再复制一份胶囊样式。
 */
type LibraryStatusIcon = ComponentType<{ size?: number | string, fill?: string }>

/**
 * 状态胶囊：标记工具栏右侧的「已上传 / 未上传 / 已隐藏 / 精选」等状态。
 * 传入 `onClick` 时渲染为可点击按钮（本地已上传可查看云端信息）。
 */
export function LibraryStatusPill({
  icon: Icon,
  label,
  tone = 'neutral',
  onClick,
  title,
}: {
  icon: LibraryStatusIcon
  label: string
  tone?: LibraryStatusTone
  onClick?: () => void
  title?: string
}) {
  const className = 'ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium'
  // 只在需要时传 fill：显式传 undefined 会覆盖自有 SVG 自带的 fill="none"。
  const content = (
    <>
      <Icon size={9} {...(tone === 'warning' ? { fill: 'currentColor' } : {})} />
      {label}
    </>
  )
  if (!onClick) {
    return (
      <span className={className} style={STATUS_TONE_STYLE[tone]} title={title}>
        {content}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      className={`${className} transition-opacity hover:opacity-80`}
      style={STATUS_TONE_STYLE[tone]}
    >
      {content}
    </button>
  )
}

/* ─── 操作按钮 ─── */

/**
 * 信息栏底部操作按钮：默认描边、`primary` 实心、`destructive` 危险色。
 * `loading` 只让图标旋转，不改变文案，避免底部操作区高度跳动。
 */
export function LibraryDetailsAction({
  icon: Icon,
  label,
  onClick,
  primary,
  destructive,
  disabled,
  loading,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  primary?: boolean
  destructive?: boolean
  disabled?: boolean
  loading?: boolean
}) {
  if (primary) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
      >
        <Icon size={13} className={loading ? 'animate-spin' : ''} />
        {label}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      style={
        destructive
          ? {
              borderColor: 'color-mix(in srgb, var(--destructive) 35%, transparent)',
              color: 'var(--destructive)',
            }
          : { borderColor: 'var(--border)', color: 'var(--foreground)' }
      }
      onMouseEnter={(event) => {
        if (disabled) return
        event.currentTarget.style.backgroundColor = destructive
          ? 'color-mix(in srgb, var(--destructive) 8%, transparent)'
          : 'var(--secondary)'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      <Icon size={13} className={loading ? 'animate-spin' : ''} />
      {label}
    </button>
  )
}

/* ─── 预览缩略图 ─── */

interface LibraryDetailsPreviewProps {
  /** 点击打开大图预览；不可预览（缺失/回收站/生成中）时传 disabled。 */
  onOpen: () => void
  disabled?: boolean
  title?: string
  /** 打开大图的悬浮提示文案，用于 aria-label。 */
  openLabel?: string
  /** 图像或占位内容。 */
  children: ReactNode
}

/**
 * 信息栏顶部预览缩略图：4:3 圆角框 + hover 放大提示，点击进入大图预览。
 * 两端此前只有云端带 hover 提示，这里统一提供同一套可点击反馈。
 */
export function LibraryDetailsPreview({
  onOpen,
  disabled = false,
  title,
  openLabel,
  children,
}: LibraryDetailsPreviewProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      title={title}
      aria-label={openLabel ?? title}
      className="group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:shadow-none"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)' }}
    >
      {children}

      {!disabled && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
            <Maximize2 size={15} />
          </span>
        </span>
      )}

    </button>
  )
}

/* ─── 顶部合并卡片 ─── */

/** 段间细分隔线：比区块 `border` 更淡，用于同一张卡片内部的视觉分隔。 */
const HEADER_DIVIDER_COLOR = 'color-mix(in srgb, var(--border) 60%, transparent)'

interface LibraryDetailsHeaderProps {
  /** 预览图区域，通常是一个 `LibraryDetailsPreview`。 */
  preview?: ReactNode
  /** 标题区域（标题、ID、分类/胶卷等标识信息）。 */
  title?: ReactNode
  /** 标记工具条区域（精选 / 隐藏 / 评分等标记按钮与状态胶囊）。 */
  marks?: ReactNode
}

/**
 * 信息栏顶部合并卡片：预览图 + 标题 + 标记工具条。
 *
 * 两端此前把这三段拆成三个各自带边框的独立区块，边框叠加让信息栏顶部出现三条
 * 横线、视觉上碎成三块。这里用一次外层 padding 包住三段，段间只留一条更淡的
 * 细线，读起来是一张连续卡片。缺省的段不渲染，也不会留下多余分隔线。
 */
export function LibraryDetailsHeader({ preview, title, marks }: LibraryDetailsHeaderProps) {
  const segments = ([
    ['preview', preview],
    ['title', title],
    ['marks', marks],
  ] as const).filter(([, node]) => node)

  return (
    <div className="border-b px-4 pt-4 pb-3.5" style={{ borderColor: 'var(--border)' }}>
      {segments.map(([key, node], index) => (
        <Fragment key={key}>
          {index > 0 && (
            <div className="my-3 h-px" style={{ backgroundColor: HEADER_DIVIDER_COLOR }} />
          )}
          {node}
        </Fragment>
      ))}
    </div>
  )
}

/** 自动保存提示：本地信息栏在原位编辑后显示，云端批量操作也可复用。 */
export function LibrarySavingHint({ label }: { label: string }) {
  return (
    <p
      className="mt-1.5 flex items-center gap-1 text-[9px]"
      style={{ color: 'var(--muted-foreground)' }}
    >
      <Loader2 size={9} className="animate-spin" />
      {label}
    </p>
  )
}
