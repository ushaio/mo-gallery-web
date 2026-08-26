import { useState } from 'react'
import { Check, ChevronDown, FolderInput, Heart, Minus, Plus, Star, Tag as TagIcon, X } from 'lucide-react'
import type { BatchAssetOrganizationUpdate, LocalCollection, LocalTag } from '../types'
import type { LocalLibraryCopy } from '../copy'

interface Props {
  selectedCount: number
  tags: LocalTag[]
  collections: LocalCollection[]
  copy: LocalLibraryCopy
  busy: boolean
  canMove: boolean
  onClear: () => void
  onMove: () => void
  onUpdate: (update: Omit<BatchAssetOrganizationUpdate, 'assetIds'>) => void
  floating?: boolean
}

const COLOR_SWATCHES: Array<{ value: string; bg: string; label: string; nameKey?: 'red' | 'yellow' | 'green' | 'blue' | 'purple' }> = [
  { value: 'red', bg: '#EF4444', label: 'Red', nameKey: 'red' },
  { value: 'orange', bg: '#F97316', label: 'Orange' },
  { value: 'yellow', bg: '#EAB308', label: 'Yellow', nameKey: 'yellow' },
  { value: 'green', bg: '#22C55E', label: 'Green', nameKey: 'green' },
  { value: 'blue', bg: '#3B82F6', label: 'Blue', nameKey: 'blue' },
  { value: 'purple', bg: '#A855F7', label: 'Purple', nameKey: 'purple' },
]

function BatchRow({
  icon: Icon, label, addLabel, removeLabel, onAdd, onRemove, disabled, dotColor,
}: {
  icon: typeof TagIcon
  label: string
  addLabel: string
  removeLabel: string
  onAdd: () => void
  onRemove: () => void
  disabled?: boolean
  dotColor?: string
}) {
  return (
    <div
      className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] transition-colors hover:bg-secondary"
    >
      {dotColor
        ? <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
        : <Icon size={11} className="shrink-0" style={{ color: 'var(--muted-foreground)' }} />}
      <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--foreground)' }}>{label}</span>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          disabled={disabled}
          title={addLabel}
          aria-label={`${addLabel}: ${label}`}
          onClick={onAdd}
          className="flex size-5 items-center justify-center rounded transition-colors hover:bg-primary/10 disabled:opacity-50"
          style={{ color: 'var(--primary)' }}
        >
          <Plus size={11} />
        </button>
        <button
          type="button"
          disabled={disabled}
          title={removeLabel}
          aria-label={`${removeLabel}: ${label}`}
          onClick={onRemove}
          className="flex size-5 items-center justify-center rounded transition-colors hover:bg-destructive/10 disabled:opacity-50"
          style={{ color: 'var(--destructive)' }}
        >
          <Minus size={11} />
        </button>
      </div>
    </div>
  )
}

/* ─── 折叠区块 ─── */

function Section({
  label, icon: Icon, open, onToggle, children,
}: {
  label: string
  icon: typeof TagIcon
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="border-b px-5 py-1" style={{ borderColor: 'var(--border)' }}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2.5 py-2.5 text-left">
        <Icon size={14} strokeWidth={1.8} style={{ color: 'var(--muted-foreground)' }} />
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--foreground)' }}>
          {label}
        </span>
        <ChevronDown
          size={14}
          className="transition-transform duration-200"
          style={{ color: 'var(--muted-foreground)', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
      </button>
      {open && <div className="pb-4">{children}</div>}
    </section>
  )
}

export function LocalAssetBatchDetails({ selectedCount, tags, collections, copy, busy, canMove, onClear, onMove, onUpdate, floating = false }: Props) {
  const [classificationOpen, setClassificationOpen] = useState(true)
  const [organizationOpen, setOrganizationOpen] = useState(true)
  const [hoverRating, setHoverRating] = useState(0)

  return (
    <aside
      className={floating
        ? 'custom-scrollbar absolute bottom-14 right-3 z-40 flex max-h-[min(680px,calc(100%-7rem))] w-[340px] flex-col overflow-y-auto rounded-xl border bg-background shadow-[0_16px_40px_-20px_rgba(15,23,42,0.72)]'
        : 'custom-scrollbar hidden h-full w-[340px] shrink-0 flex-col overflow-y-auto border-l bg-background xl:flex'}
      style={{ borderColor: 'var(--border)' }}
      data-local-library-guide="batch-details"
    >
      {/* ── 头部：批量整理 + 已选数量 + 清除 ── */}
      <div className="flex items-center gap-2.5 border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{copy.batchEdit}</h2>
          <p className="mt-0.5 text-[11px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
            {selectedCount} {copy.selectedItems}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          title={copy.clearSelection}
          className="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-secondary"
          style={{ color: 'var(--muted-foreground)' }}
        >
          <X size={14} />
        </button>
      </div>

      {/* ── 标记（应用到全部选中） ── */}
      <Section
        label={`${copy.rating} / ${copy.color} / ${copy.favorite}`}
        icon={Star}
        open={classificationOpen}
        onToggle={() => setClassificationOpen((v) => !v)}
      >
        <div className="space-y-3.5">
          {/* 评分：hover 预览，点击应用到所有选中 */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--muted-foreground)' }}>
              {copy.rating}
            </p>
            <div className="flex items-center gap-0.5" role="group" aria-label={copy.rating}>
              {[1, 2, 3, 4, 5].map((value) => {
                const isActive = value <= hoverRating
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={busy}
                    title={`${copy.rating}: ${value}`}
                    aria-label={`${copy.rating}: ${value}`}
                    onMouseEnter={() => setHoverRating(value)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => onUpdate({ rating: value })}
                    className="rounded p-0.5 transition-transform hover:scale-110 active:scale-95 disabled:opacity-50"
                  >
                    <Star
                      size={15}
                      fill={isActive ? 'currentColor' : 'none'}
                      strokeWidth={isActive ? 2 : 1.6}
                      style={{ color: isActive ? '#F59E0B' : 'var(--muted-foreground)', transition: 'all 0.12s ease' }}
                    />
                  </button>
                )
              })}
            </div>
          </div>

          {/* 颜色标记 */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--muted-foreground)' }}>
              {copy.color}
            </p>
            <div className="flex items-center gap-1.5" role="group" aria-label={copy.color}>
              {COLOR_SWATCHES.map((swatch) => {
                const name = swatch.nameKey ? copy[swatch.nameKey] : swatch.label
                return (
                  <button
                    key={swatch.value}
                    type="button"
                    disabled={busy}
                    title={`${copy.color}: ${name}`}
                    aria-label={`${copy.color}: ${name}`}
                    onClick={() => onUpdate({ colorLabel: swatch.value })}
                    className="size-5 rounded-full transition-all hover:scale-110 active:scale-95 disabled:opacity-50"
                    style={{
                      backgroundColor: swatch.bg,
                      boxShadow: '0 0 0 1px color-mix(in srgb, var(--foreground) 12%, transparent)',
                    }}
                  />
                )
              })}
              <button
                type="button"
                disabled={busy}
                title={copy.noColor}
                aria-label={copy.noColor}
                onClick={() => onUpdate({ colorLabel: '' })}
                className="flex size-5 items-center justify-center rounded-full border transition-all hover:scale-110 disabled:opacity-50"
                style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
              >
                <X size={9} />
              </button>
            </div>
          </div>

          {/* 收藏 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onUpdate({ isFavorite: true })}
              className="flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] font-medium transition-all active:scale-[0.98] disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            >
              <Heart size={12} fill="currentColor" style={{ color: '#EF4444' }} />
              {copy.markFavorite}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onUpdate({ isFavorite: false })}
              className="flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] font-medium transition-all active:scale-[0.98] disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
            >
              <Heart size={12} />
              {copy.unmarkFavorite}
            </button>
          </div>
        </div>
      </Section>

      {/* ── 标签与集合（+ 添加 / − 移除） ── */}
      <Section
        label={`${copy.tags} / ${copy.collections}`}
        icon={TagIcon}
        open={organizationOpen}
        onToggle={() => setOrganizationOpen((v) => !v)}
      >
        <div className="space-y-3">
          {tags.length === 0 && collections.length === 0 && (
            <p className="text-[10px] italic" style={{ color: 'var(--muted-foreground)' }}>
              {copy.noTags} · {copy.noCollections}
            </p>
          )}
          {tags.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--muted-foreground)' }}>
                {copy.tags}
              </p>
              <div className="custom-scrollbar max-h-44 space-y-0.5 overflow-y-auto">
                {tags.map((tag) => (
                  <BatchRow
                    key={tag.id}
                    icon={TagIcon}
                    label={tag.name}
                    addLabel={copy.add}
                    removeLabel={copy.remove}
                    dotColor={tag.color || undefined}
                    disabled={busy}
                    onAdd={() => onUpdate({ addTagIds: [tag.id] })}
                    onRemove={() => onUpdate({ removeTagIds: [tag.id] })}
                  />
                ))}
              </div>
            </div>
          )}
          {collections.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--muted-foreground)' }}>
                {copy.collections}
              </p>
              <div className="custom-scrollbar max-h-44 space-y-0.5 overflow-y-auto">
                {collections.map((collection) => (
                  <BatchRow
                    key={collection.id}
                    icon={TagIcon}
                    label={collection.name}
                    addLabel={copy.add}
                    removeLabel={copy.remove}
                    disabled={busy}
                    onAdd={() => onUpdate({ addCollectionIds: [collection.id] })}
                    onRemove={() => onUpdate({ removeCollectionIds: [collection.id] })}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ── 操作区 ── */}
      <div className="mt-auto space-y-2 px-5 pb-5 pt-4">
        <button
          type="button"
          onClick={onMove}
          disabled={busy || !canMove}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          <FolderInput size={13} />
          {copy.moveAssetsToFolder}
        </button>
        {busy && (
          <p className="flex items-center justify-center gap-1.5 text-[9px]" style={{ color: 'var(--muted-foreground)' }}>
            <Check size={9} className="animate-pulse" />
            {copy.autoSaving}
          </p>
        )}
      </div>
    </aside>
  )
}
