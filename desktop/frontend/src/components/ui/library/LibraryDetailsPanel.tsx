import type { ComponentType, HTMLAttributes, ReactNode } from 'react'
import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown, Loader2, Maximize2, Star } from 'lucide-react'
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

/* 参考稿（desktop-library-ui.html）.inspector 固定 320px。 */
const PANEL_BASE_CLASS = 'hidden h-full w-[320px] shrink-0 flex-col border-l bg-background xl:flex'

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

/**
 * 折叠区块：图标 + 标题 + 可选计数 + 旋转箭头，标题整行可点击。
 * 标题行对齐参考稿 `.sec-h`：约 40px 高、12.5px 常规大小写粗体。
 */
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
          className="flex flex-1 items-center gap-2.5 py-2.5 text-left"
        >
          <Icon size={14} strokeWidth={1.8} style={{ color: 'var(--muted-foreground)' }} />
          <span
            className="flex-1 text-[12.5px] font-semibold"
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

/* ─── 键值行网格（参考稿 .kv） ─── */

/**
 * 参考稿「基本信息」用的键值行网格：固定 76px 标签列 + 值列，值左对齐、
 * 超长省略。与两列卡片网格（`LibraryMetaRow card`）互补——逐行字段用这个，
 * 短参数组用卡片。
 */
export function LibraryKvList({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <dl
      className={`grid grid-cols-[76px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 ${className ?? ''}`}
    >
      {children}
    </dl>
  )
}

/**
 * 键值行：`LibraryKvList` 的一个 dt/dd 对。`action`（复制按钮等）挂在值右侧，
 * 由调用方控制显隐（参考稿是 hover 时浮现）。
 */
export function LibraryKvItem({
  label,
  value,
  mono,
  action,
}: {
  label: string
  value: ReactNode
  mono?: boolean
  action?: ReactNode
}) {
  return (
    <>
      <dt className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
        {label}
      </dt>
      <dd className="group/kv flex min-w-0 items-center gap-1.5">
        <span
          className={`min-w-0 flex-1 truncate text-[11px] ${mono ? 'font-mono tabular-nums' : ''}`}
          title={typeof value === 'string' ? value : undefined}
          style={{ color: 'var(--foreground)' }}
        >
          {value}
        </span>
        {action}
      </dd>
    </>
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

/* ─── 云端同步状态卡片 ─── */

/**
 * 云端同步状态卡片：图标方块 + 粗体标题 + 等宽路径副标题 + 尾部操作。
 *
 * 对应参考稿（desktop-library-ui.html）信息栏里预览卡片下方的 `.sync` 区块：
 * 云端显示「S3 · 已同步 + 路径」，本地显示「已上传到云端 / 未上传 + 上传按钮」。
 * `ok` 表示已同步态（图标方块用主色底），默认态为中性灰底（未上传）。
 * `trailing` 由调用方传入（状态徽标 / 下载按钮 / 上传按钮等），不参与布局对齐以外的样式。
 */
export function LibraryDetailsSyncCard({
  icon: Icon,
  title,
  subtitle,
  ok = false,
  trailing,
}: {
  icon: LibraryStatusIcon
  title: string
  subtitle?: string
  ok?: boolean
  trailing?: ReactNode
}) {
  return (
    <div
      className="mx-4 my-3 flex items-center gap-2.5 rounded-lg border px-3 py-2.5"
      style={{ borderColor: 'var(--border)' }}
    >
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-md"
        style={
          ok
            ? { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }
            : { backgroundColor: 'var(--secondary)', color: 'var(--muted-foreground)' }
        }
      >
        <Icon size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium leading-tight" style={{ color: 'var(--foreground)' }}>
          {title}
        </span>
        {subtitle && (
          <span
            className="mt-0.5 block truncate font-mono text-[10px] leading-tight"
            style={{ color: 'var(--muted-foreground)' }}
            title={subtitle}
          >
            {subtitle}
          </span>
        )}
      </span>
      {trailing}
    </div>
  )
}

/* ─── 快捷操作行（参考稿 .quick） ─── */

/**
 * 参考稿信息栏标题卡片下方的快捷操作行骨架：
 * `[收藏 ♥] [★×5] [颜色圆点] —— 弹性空隙 —— [隐藏] [更多]`，单行排布。
 * 云端与本地可用的标记不同（本地有评分/颜色，云端有隐藏），但按钮规格
 * 在这里统一，保证两侧视觉一致；调用方按骨架顺序拼装即可。
 */

/** 快捷标记按钮：28px 幽灵图标按钮，激活时浅色底、图标着色。 */
export function LibraryQuickMark({
  icon: Icon,
  active,
  onClick,
  title,
  filled = true,
  danger = false,
}: {
  icon: ComponentType<{
    size?: number | string
    fill?: string
    strokeWidth?: number | string
  }>
  active: boolean
  onClick: () => void
  title: string
  /** 激活时是否填充图标（♥/★ 填充；眼睛类线性图标传 false）。 */
  filled?: boolean
  /** 激活态用危险色（隐藏），默认前景色（收藏/精选）。 */
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className="flex size-8 shrink-0 items-center justify-center rounded-lg transition-all active:scale-90"
      style={{
        backgroundColor: active ? 'var(--secondary)' : 'transparent',
        color: active
          ? danger
            ? 'var(--destructive)'
            : 'var(--foreground)'
          : 'var(--muted-foreground)',
      }}
      onMouseEnter={(event) => {
        if (!active) event.currentTarget.style.backgroundColor = 'var(--secondary)'
      }}
      onMouseLeave={(event) => {
        if (!active) event.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      <Icon
        size={15}
        fill={filled && active ? 'currentColor' : 'none'}
        {...(filled ? { strokeWidth: active ? 2 : 1.6 } : {})}
      />
    </button>
  )
}

/** 五星评分：点同星清零，悬停预览；激活星用前景色（参考稿 .stars）。 */
export function LibraryQuickStars({
  value,
  onChange,
  label,
}: {
  value: number
  onChange: (value: number) => void
  label: string
}) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= (hover || value)
        return (
          <button
            key={star}
            type="button"
            title={`${label}: ${star}`}
            aria-label={`${label}: ${star}`}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(value === star ? 0 : star)}
            className="rounded p-0.5 transition-transform hover:scale-110 active:scale-95"
          >
            <Star
              size={13}
              fill={active ? 'currentColor' : 'none'}
              strokeWidth={active ? 2 : 1.6}
              style={{
                color: active ? 'var(--foreground)' : 'var(--border)',
                transition: 'all 0.12s ease',
              }}
            />
          </button>
        )
      })}
    </div>
  )
}

/** 颜色标记圆点：未选半透明、选中带描边环，点当前色 = 取消（参考稿 .labels）。 */
export function LibraryQuickDots({
  colors,
  value,
  onChange,
  label,
}: {
  colors: Array<{ value: string, bg: string, label: string }>
  value?: string
  onChange: (value: string) => void
  label: string
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      {colors.map((swatch) => {
        const selected = value === swatch.value
        return (
          <button
            key={swatch.value}
            type="button"
            title={`${label}: ${swatch.label}`}
            aria-label={`${label}: ${swatch.label}`}
            aria-pressed={selected}
            onClick={() => onChange(selected ? '' : swatch.value)}
            className="size-3.5 shrink-0 rounded-full transition-all hover:scale-110 active:scale-95"
            style={{
              backgroundColor: swatch.bg,
              opacity: selected ? 1 : 0.35,
              boxShadow: selected
                ? '0 0 0 2px var(--background), 0 0 0 3.5px var(--foreground)'
                : 'none',
            }}
          />
        )
      })}
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
 * `compact` 用于贴底操作区与删除等图标按钮并排的场景：更小的字号与内边距、
 * 文案不换行，保证单行按钮高度一致（参考稿 `.ins-foot .btn.sm`）。
 */
export function LibraryDetailsAction({
  icon: Icon,
  label,
  onClick,
  primary,
  destructive,
  disabled,
  loading,
  compact,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  primary?: boolean
  destructive?: boolean
  disabled?: boolean
  loading?: boolean
  compact?: boolean
}) {
  const sizing = compact
    ? 'gap-1.5 px-2 text-[11px] whitespace-nowrap'
    : 'gap-2 px-3 text-xs'
  if (primary) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex w-full items-center justify-center rounded-lg py-2 font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${sizing}`}
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
      className={`flex w-full items-center justify-center rounded-lg border py-2 font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${sizing}`}
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
 * 信息栏顶部预览缩略图：4:3 圆角框 + 右下角放大按钮（参考稿 `.preview .zoomin`），
 * 点击进入大图预览。
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
      className="group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg transition-opacity disabled:cursor-not-allowed"
      style={{ backgroundColor: 'var(--muted)' }}
    >
      {children}

      {!disabled && (
        <span
          className="absolute bottom-2 right-2 flex size-6 items-center justify-center rounded-md border opacity-0 transition-opacity group-hover:opacity-100"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--background)',
            color: 'var(--foreground)',
          }}
        >
          <Maximize2 size={12} />
        </span>
      )}

    </button>
  )
}

/* ─── 顶部合并卡片 ─── */

interface LibraryDetailsHeaderProps {
  /** 预览图区域，通常是一个 `LibraryDetailsPreview`。 */
  preview?: ReactNode
  /** 标题区域（标题、ID、分类/胶卷等标识信息）。 */
  title?: ReactNode
  /** 标记工具条区域（精选 / 隐藏 / 评分等标记按钮与状态胶囊）。 */
  marks?: ReactNode
}

/**
 * 信息栏顶部：预览图 + 标题（同一段内边距，段间只留间距），标记工具条
 * （参考稿 `.quick`）作为通栏一行接在下方并自带下边框。
 *
 * 此前三段之间用分隔线拆成三块，与参考稿「预览 + 标题连续排版、快捷行通栏」
 * 的结构不符。缺省的段不渲染。
 */
export function LibraryDetailsHeader({ preview, title, marks }: LibraryDetailsHeaderProps) {
  return (
    <>
      {(preview || title) && (
        <div className="px-4 pt-3.5 pb-3">
          {preview}
          {preview && title && <div className="mt-3">{title}</div>}
          {!preview && title}
        </div>
      )}
      {marks && (
        <div
          className="flex items-center border-b px-3 py-2.5"
          style={{ borderColor: 'var(--border)' }}
        >
          {marks}
        </div>
      )}
    </>
  )
}

/* ─── 贴底操作区（参考稿 .ins-foot） ─── */

/**
 * 信息栏底部操作区：粘性贴底、上边框分隔，内容随滚动保持在视口内。
 * 参考稿中它与滚动区分离（`.ins-foot`），这里用 `sticky bottom-0` 达到同样效果，
 * 面板内容不足一屏时 `mt-auto` 把它压到底部。
 */
export function LibraryDetailsFooter({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky bottom-0 mt-auto border-t px-3 py-2.5"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}
    >
      {children}
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
