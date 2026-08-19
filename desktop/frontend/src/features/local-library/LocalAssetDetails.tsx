import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera, Check, ChevronDown, ExternalLink, EyeOff, FileText, FolderInput,
  Heart, ImageOff, Info, Loader2, Maximize2, Pencil, Plus, RefreshCw,
  RotateCcw, Star, Tag as TagIcon, Trash2, Upload, X,
} from 'lucide-react'
import { isPhotoAsset } from './types'
import type { LocalAsset, LocalCollection, LocalTag } from './types'
import type { LocalLibraryCopy } from './copy'

interface Props {
  asset: LocalAsset | null
  copy: LocalLibraryCopy
  saving: boolean
  maintenanceBusy: boolean
  tags: LocalTag[]
  collections: LocalCollection[]
  organizationBusy: boolean
  onSave: (assetId: string, patch: Pick<LocalAsset, 'displayTitle' | 'notes' | 'rating' | 'colorLabel' | 'isFavorite'>) => Promise<void>
  onPreview: (asset: LocalAsset) => void
  onOpenSystem: (asset: LocalAsset) => void
  onMove: (asset: LocalAsset) => void
  onDelete: (asset: LocalAsset) => void
  onRestore: (asset: LocalAsset) => void
  onRetryPreview: (asset: LocalAsset) => void
  onRecheckMissing: (asset: LocalAsset) => void
  onRemoveMissing: (asset: LocalAsset) => void
  onSetTags: (assetId: string, tagIds: string[]) => Promise<void>
  onCreateTag: (name: string) => Promise<LocalTag | undefined>
  onSetCollections: (assetId: string, collectionIds: string[]) => Promise<void>
}

const COLOR_SWATCHES: Array<{ value: string; bg: string; label: string; nameKey?: 'red' | 'yellow' | 'green' | 'blue' | 'purple' }> = [
  { value: 'red', bg: '#EF4444', label: 'Red', nameKey: 'red' },
  { value: 'orange', bg: '#F97316', label: 'Orange' },
  { value: 'yellow', bg: '#EAB308', label: 'Yellow', nameKey: 'yellow' },
  { value: 'green', bg: '#22C55E', label: 'Green', nameKey: 'green' },
  { value: 'blue', bg: '#3B82F6', label: 'Blue', nameKey: 'blue' },
  { value: 'purple', bg: '#A855F7', label: 'Purple', nameKey: 'purple' },
]

const TAG_PREVIEW_COUNT = 8

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

function formatDate(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '—'
  const date = typeof value === 'number' ? new Date(value / 1e6) : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function formatExposure(seconds?: number) {
  if (!seconds || seconds <= 0) return null
  if (seconds >= 1) return `${seconds.toFixed(1)}s`
  return `1/${Math.round(1 / seconds)}s`
}

function formatFocalLength(mm?: number) {
  if (!mm) return null
  return `${Math.round(mm)}mm`
}

function formatAperture(value?: number) {
  if (!value) return null
  return `f/${value.toFixed(value >= 10 ? 0 : 1)}`
}

/* ─── 折叠区块：图标 + 标题 + 计数 + 旋转箭头，整行可点击 ─── */

function Section({
  label, icon: Icon, open, onToggle, count, children,
}: {
  label: string
  icon: typeof Camera
  open: boolean
  onToggle: () => void
  count?: number
  children: React.ReactNode
}) {
  return (
    <section className="border-b px-5 py-1" style={{ borderColor: 'var(--border)' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 py-2.5 text-left"
      >
        <Icon size={14} strokeWidth={1.8} style={{ color: 'var(--muted-foreground)' }} />
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--foreground)' }}>
          {label}
        </span>
        {count !== undefined && count > 0 && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold tabular-nums"
            style={{ backgroundColor: 'var(--secondary)', color: 'var(--muted-foreground)' }}
          >
            {count}
          </span>
        )}
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

/* ─── 元数据行：左标签右值 ─── */

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3 py-1.5">
      <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
        {label}
      </span>
      <span
        className={`min-w-0 truncate text-left text-[11px] font-medium ${mono ? 'font-mono tabular-nums' : ''}`}
        title={value}
        style={{ color: 'var(--foreground)' }}
      >
        {value}
      </span>
    </div>
  )
}

/* ─── 操作按钮 ─── */

function ActionButton({
  icon: Icon, label, onClick, disabled, destructive, loading,
}: {
  icon: typeof Star
  label: string
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
  loading?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      style={destructive
        ? { borderColor: 'color-mix(in srgb, var(--destructive) 35%, transparent)', color: 'var(--destructive)' }
        : { borderColor: 'var(--border)', color: 'var(--foreground)' }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = destructive ? 'color-mix(in srgb, var(--destructive) 8%, transparent)' : 'var(--secondary)' }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      <Icon size={13} className={loading ? 'animate-spin' : ''} />
      {label}
    </button>
  )
}

/* ─── 空状态 ─── */

function EmptyState({ copy }: { copy: LocalLibraryCopy }) {
  return (
    <aside
      className="hidden h-full w-[340px] shrink-0 flex-col items-center justify-center border-l px-8 xl:flex"
      style={{ borderColor: 'var(--border)' }}
      data-local-library-guide="details"
    >
      <ImageOff size={28} strokeWidth={1.2} style={{ color: 'var(--muted-foreground)' }} />
      <p className="mt-4 text-xs" style={{ color: 'var(--muted-foreground)' }}>{copy.noSelection}</p>
    </aside>
  )
}

/* ─── 主组件 ─── */

export function LocalAssetDetails(props: Props) {
  return <LocalAssetDetailsContent key={props.asset?.id ?? 'none'} {...props} />
}

function LocalAssetDetailsContent({
  asset, copy, saving, maintenanceBusy, tags, collections, organizationBusy,
  onSave, onPreview, onOpenSystem, onMove, onDelete, onRestore,
  onRetryPreview, onRecheckMissing, onRemoveMissing,
  onSetTags, onCreateTag, onSetCollections,
}: Props) {
  const [title, setTitle] = useState(asset?.displayTitle || '')
  const [notes, setNotes] = useState(asset?.notes || '')
  const [rating, setRating] = useState(asset?.rating || 0)
  const [color, setColor] = useState(asset?.colorLabel || '')
  const [favorite, setFavorite] = useState(Boolean(asset?.isFavorite))
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [tagQuery, setTagQuery] = useState('')
  const [tagMenuOpen, setTagMenuOpen] = useState(false)
  const [tagsExpanded, setTagsExpanded] = useState(true)
  const [organizationOpen, setOrganizationOpen] = useState(true)
  const [shootingOpen, setShootingOpen] = useState(true)
  const [fileInfoOpen, setFileInfoOpen] = useState(true)
  const [hoverRating, setHoverRating] = useState(0)
  const [assignedTagIds, setAssignedTagIds] = useState<string[]>(() => asset?.tags.map((tag) => tag.id) || [])
  const notesEditorRef = useRef<HTMLDivElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  const savePatch = useCallback((overrides: Partial<Pick<LocalAsset, 'displayTitle' | 'notes' | 'rating' | 'colorLabel' | 'isFavorite'>> = {}) => {
    if (!asset) return Promise.resolve()
    return onSave(asset.id, {
      displayTitle: title,
      notes,
      rating,
      colorLabel: color,
      isFavorite: favorite,
      ...overrides,
    })
  }, [asset, color, favorite, notes, onSave, rating, title])

  /* 标题：原位编辑，Enter/失焦保存，Esc 取消 */
  const commitTitle = useCallback(() => {
    setEditingTitle(false)
    if (!asset || title === (asset.displayTitle || '')) return
    void savePatch({ displayTitle: title })
  }, [asset, savePatch, title])

  /* 备注：原位编辑，按钮或外部点击保存 */
  const commitNotes = useCallback(() => {
    setEditingNotes(false)
    if (!asset || notes === (asset.notes || '')) return
    void savePatch({ notes })
  }, [asset, notes, savePatch])

  useEffect(() => {
    if (!editingNotes) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!notesEditorRef.current?.contains(event.target as Node)) commitNotes()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [editingNotes, commitNotes])

  const assignedTags = useMemo(() => {
    const source = new Map([...tags, ...(asset?.tags || [])].map((tag) => [tag.id, tag]))
    return assignedTagIds.flatMap((id) => source.get(id) ? [source.get(id)!] : [])
  }, [asset?.tags, assignedTagIds, tags])

  const matchingTags = useMemo(() => {
    const query = tagQuery.trim().toLocaleLowerCase()
    return tags.filter((tag) => !assignedTagIds.includes(tag.id) && (!query || tag.name.toLocaleLowerCase().includes(query))).slice(0, 8)
  }, [assignedTagIds, tagQuery, tags])

  const updateTags = async (nextIds: string[]) => {
    if (!asset) return
    setAssignedTagIds(nextIds)
    await onSetTags(asset.id, nextIds)
  }

  const addTag = async (tag?: LocalTag) => {
    const name = tagQuery.trim()
    const selected = tag || tags.find((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase()) || (name ? await onCreateTag(name) : undefined)
    if (!selected || assignedTagIds.includes(selected.id)) return
    await updateTags([...assignedTagIds, selected.id])
    setTagQuery('')
    setTagMenuOpen(false)
    tagInputRef.current?.focus()
  }

  const toggleCollection = async (collectionId: string) => {
    if (!asset) return
    const currentIds = asset.collections.map((c) => c.id)
    const nextIds = currentIds.includes(collectionId)
      ? currentIds.filter((id) => id !== collectionId)
      : [...currentIds, collectionId]
    await onSetCollections(asset.id, nextIds)
  }

  if (!asset) return <EmptyState copy={copy} />

  const previewPending = asset.previewStatus === 'pending' || asset.previewStatus === 'generating'
  const unavailable = asset.previewStatus === 'unavailable'
  const missing = asset.availability === 'missing'
  const trashed = asset.availability === 'trashed'
  const isPhoto = isPhotoAsset(asset)
  const exif = asset.exif
  const cameraLabel = [exif?.cameraMake, exif?.cameraModel].filter(Boolean).join(' ')
  const exposureParts = [formatAperture(exif?.aperture), formatExposure(exif?.shutterSeconds), exif?.iso ? `ISO ${exif.iso}` : null, formatFocalLength(exif?.focalLengthMm)].filter(Boolean)
  const hasExif = isPhoto && Boolean(cameraLabel || exif?.lensModel || exposureParts.length > 0)
  const dimensionLabel = asset.width && asset.height ? `${asset.width} × ${asset.height}` : null
  const uploaded = asset.uploadStatus === 'uploaded' || asset.isUploaded
  const visibleTags = tagsExpanded ? assignedTags : assignedTags.slice(0, TAG_PREVIEW_COUNT)
  const hiddenTagCount = assignedTags.length - visibleTags.length
  const hasCustomTitle = Boolean(title) && title !== asset.fileName

  return (
    <aside
      className="custom-scrollbar hidden h-full w-[340px] shrink-0 flex-col overflow-y-auto border-l bg-background xl:flex"
      style={{ borderColor: 'var(--border)' }}
      data-local-library-guide="details"
    >
      {/* ── 预览图 ── */}
      <div className="px-4 pt-4">
        <button
          type="button"
          onClick={() => onPreview(asset)}
          disabled={previewPending || missing || trashed}
          className="group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)' }}
        >
          {asset.previewStatus === 'ready' && isPhoto ? (
            <img src={asset.previewUrl} alt="" className="h-full w-full object-cover" />
          ) : previewPending && isPhoto ? (
            <div className="flex flex-col items-center gap-2.5" style={{ color: 'var(--muted-foreground)' }}>
              <Loader2 size={22} className="animate-spin" />
              <span className="text-[10px]">{copy.generatingPreview}</span>
            </div>
          ) : isPhoto ? (
            <ImageOff size={26} strokeWidth={1.2} style={{ color: 'var(--muted-foreground)' }} />
          ) : (
            <span className="flex flex-col items-center gap-2" style={{ color: 'var(--muted-foreground)' }}>
              <FileText size={28} strokeWidth={1.2} />
              <span className="text-[10px] font-bold uppercase tracking-widest">{asset.format}</span>
            </span>
          )}

          {/* hover 放大提示 */}
          {!previewPending && !missing && !trashed && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
                <Maximize2 size={15} />
              </span>
            </span>
          )}

          {/* 格式角标 */}
          <span
            className="absolute left-2 top-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          >
            {asset.format}
          </span>

          {/* 尺寸/大小角标 */}
          {(dimensionLabel || asset.byteSize > 0) && (
            <span
              className="absolute bottom-2 left-2 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white"
              style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
            >
              {dimensionLabel}
              {dimensionLabel && asset.byteSize > 0 && ' · '}
              {asset.byteSize > 0 ? formatBytes(asset.byteSize) : ''}
            </span>
          )}
        </button>

        {/* 异常状态提示（仅异常时出现） */}
        {missing && (
          <div
            className="mt-2.5 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[10px] leading-relaxed"
            style={{
              borderColor: 'color-mix(in srgb, #F59E0B 30%, transparent)',
              backgroundColor: 'color-mix(in srgb, #F59E0B 8%, transparent)',
              color: '#B45309',
            }}
          >
            <Info size={11} className="mt-0.5 shrink-0" />
            <span>{copy.missingHint}</span>
          </div>
        )}
        {trashed && asset.trashEntryKind === 'folder' && (
          <div
            className="mt-2.5 rounded-lg border px-3 py-2.5 text-[10px] leading-relaxed"
            style={{
              borderColor: 'color-mix(in srgb, #F59E0B 30%, transparent)',
              backgroundColor: 'color-mix(in srgb, #F59E0B 8%, transparent)',
              color: '#B45309',
            }}
          >
            {copy.folderBatchHint}
          </div>
        )}
        {!missing && unavailable && isPhoto && (
          <div
            className="mt-2.5 space-y-1 rounded-lg px-3 py-2.5 text-[10px] leading-relaxed"
            style={{ backgroundColor: 'var(--secondary)', color: 'var(--muted-foreground)' }}
          >
            <p className="flex items-center gap-1.5 font-medium" style={{ color: 'var(--foreground)' }}>
              <EyeOff size={11} />{copy.unavailablePreview}
            </p>
            {asset.previewError && (
              <p className="line-clamp-3 break-words pl-5">
                {copy.previewFailureReason}: {asset.previewError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── 标题：原位编辑 ── */}
      <div className="px-5 pb-3 pt-4">
        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={asset.fileName}
            className="w-full rounded-md border bg-input px-2.5 py-1.5 text-sm font-semibold outline-none focus:ring-1"
            style={{ borderColor: 'var(--primary)', color: 'var(--foreground)' }}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitTitle() }
              if (e.key === 'Escape') { e.preventDefault(); setTitle(asset.displayTitle || ''); setEditingTitle(false) }
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingTitle(true)}
            title={title ? `${copy.titleField}: ${title}` : copy.titleField}
            className="group flex w-full items-start gap-1.5 rounded text-left"
          >
            <h2 className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug" style={{ color: 'var(--foreground)' }}>
              {title || asset.fileName}
            </h2>
            <Pencil size={11} className="mt-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: 'var(--muted-foreground)' }} />
          </button>
        )}
        {/* 文件名副标题：仅当自定义标题存在且不同于文件名时显示 */}
        {hasCustomTitle && !editingTitle && (
          <p className="mt-1 truncate text-[10px]" style={{ color: 'var(--muted-foreground)' }} title={asset.fileName}>
            {asset.fileName}
          </p>
        )}
      </div>

      {/* ── 标记工具栏：收藏 / 评分 / 颜色（都是“给照片打标记”，聚在一起） ── */}
      <div className="space-y-2.5 border-y px-5 py-3.5" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-1">
          {/* 收藏 */}
          <button
            type="button"
            title={favorite ? copy.unmarkFavorite : copy.markFavorite}
            aria-label={favorite ? copy.unmarkFavorite : copy.markFavorite}
            aria-pressed={favorite}
            onClick={() => {
              const next = !favorite
              setFavorite(next)
              void savePatch({ isFavorite: next })
            }}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg transition-all active:scale-90"
            style={{ backgroundColor: favorite ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent', color: favorite ? 'var(--primary)' : 'var(--muted-foreground)' }}
            onMouseEnter={(e) => { if (!favorite) e.currentTarget.style.backgroundColor = 'var(--secondary)' }}
            onMouseLeave={(e) => { if (!favorite) e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <Heart size={15} fill={favorite ? 'currentColor' : 'none'} strokeWidth={favorite ? 2 : 1.6} />
          </button>

          <span className="mx-1 h-5 w-px shrink-0" style={{ backgroundColor: 'var(--border)' }} />

          {/* 评分：点击同星级 = 清除，无需额外按钮 */}
          {isPhoto ? (
            <div className="flex items-center gap-0.5" role="group" aria-label={copy.rating}>
              {[1, 2, 3, 4, 5].map((value) => {
                const isActive = value <= (hoverRating || rating)
                return (
                  <button
                    key={value}
                    type="button"
                    title={`${copy.rating}: ${value}`}
                    aria-label={`${copy.rating}: ${value}`}
                    onMouseEnter={() => setHoverRating(value)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => {
                      const next = rating === value ? 0 : value
                      setRating(next)
                      void savePatch({ rating: next })
                    }}
                    className="rounded p-0.5 transition-transform hover:scale-110 active:scale-95"
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
          ) : <span className="flex-1" />}

          {/* 上传状态（仅已上传时显示） */}
          {uploaded && (
            <span
              className="ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium"
              style={{ color: '#16A34A', backgroundColor: 'color-mix(in srgb, #22C55E 10%, transparent)' }}
            >
              <Upload size={9} />
              {copy.filterUploaded}
            </span>
          )}
        </div>

        {/* 颜色标记：点击当前选中色 = 取消，无需额外按钮 */}
        {isPhoto && (
          <div className="flex items-center gap-1.5" role="group" aria-label={copy.color}>
            {COLOR_SWATCHES.map((swatch) => {
              const selected = color === swatch.value
              const name = swatch.nameKey ? copy[swatch.nameKey] : swatch.label
              return (
                <button
                  key={swatch.value}
                  type="button"
                  title={`${copy.color}: ${name}${selected ? `（${copy.noColor}）` : ''}`}
                  aria-label={`${copy.color}: ${name}`}
                  aria-pressed={selected}
                  onClick={() => {
                    const next = selected ? '' : swatch.value
                    setColor(next)
                    void savePatch({ colorLabel: next })
                  }}
                  className="size-5 rounded-full transition-all hover:scale-110 active:scale-95"
                  style={{
                    backgroundColor: swatch.bg,
                    boxShadow: selected
                      ? '0 0 0 2px var(--background), 0 0 0 3.5px var(--foreground)'
                      : '0 0 0 1px color-mix(in srgb, var(--foreground) 12%, transparent)',
                  }}
                />
              )
            })}
            {color && (
              <span className="ml-1 text-[9px] uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                {COLOR_SWATCHES.find((s) => s.value === color)?.nameKey
                  ? copy[COLOR_SWATCHES.find((s) => s.value === color)!.nameKey as 'red']
                  : copy.color}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── 备注：原位编辑 ── */}
      <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--border)' }} ref={notesEditorRef}>
        {editingNotes ? (
          <div>
            <textarea
              autoFocus
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder={copy.notes}
              className="w-full resize-none rounded-lg border bg-input px-3 py-2 text-[11px] leading-relaxed outline-none focus:ring-1"
              style={{ borderColor: 'var(--primary)' }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.preventDefault(); setNotes(asset.notes || ''); setEditingNotes(false) }
              }}
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setNotes(asset.notes || ''); setEditingNotes(false) }}
                className="rounded-md px-3 py-1.5 text-[11px] transition-colors hover:bg-secondary"
                style={{ color: 'var(--muted-foreground)' }}
              >
                {copy.cancelAction}
              </button>
              <button
                type="button"
                onClick={commitNotes}
                className="flex items-center gap-1 rounded-md px-3 py-1.5 text-[11px] font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                <Check size={11} />{copy.save}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingNotes(true)}
            className="group block w-full text-left"
          >
            <span className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--muted-foreground)' }}>
              {copy.notes}
              <Pencil size={9} className="opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
            {notes ? (
              <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed" style={{ color: 'var(--foreground)' }}>{notes}</p>
            ) : (
              <p className="text-[11px] italic" style={{ color: 'var(--muted-foreground)' }}>—</p>
            )}
          </button>
        )}
        {saving && !editingNotes && (
          <p className="mt-1.5 flex items-center gap-1 text-[9px]" style={{ color: 'var(--muted-foreground)' }}>
            <Loader2 size={9} className="animate-spin" />{copy.autoSaving}
          </p>
        )}
      </div>

      {/* ── 标签与集合 ── */}
      <Section
        label={`${copy.tags} / ${copy.collections}`}
        icon={TagIcon}
        open={organizationOpen}
        onToggle={() => setOrganizationOpen((v) => !v)}
        count={assignedTags.length + asset.collections.length}
      >
        <div className="space-y-4">
          {/* 已打标签 */}
          <div>
            {assignedTags.length === 0 ? (
              <p className="text-[10px] italic" style={{ color: 'var(--muted-foreground)' }}>—</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {visibleTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="group/chip inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
                    style={{ borderColor: 'var(--border)', backgroundColor: 'var(--secondary)' }}
                  >
                    <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color || 'var(--muted-foreground)' }} />
                    <span className="truncate">{tag.name}</span>
                    <button
                      type="button"
                      disabled={organizationBusy}
                      aria-label={`${copy.remove} ${tag.name}`}
                      onClick={() => void updateTags(assignedTagIds.filter((id) => id !== tag.id))}
                      className="flex size-3.5 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity hover:bg-destructive/15 group-hover/chip:opacity-100 disabled:opacity-50"
                      style={{ color: 'var(--destructive)' }}
                    >
                      <X size={8} />
                    </button>
                  </span>
                ))}
                {hiddenTagCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setTagsExpanded(!tagsExpanded)}
                    className="rounded-full border px-2 py-0.5 text-[10px] transition-colors hover:bg-secondary"
                    style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                  >
                    {tagsExpanded ? copy.collapse : `+${hiddenTagCount}`}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 添加标签输入框 */}
          <div className="relative">
            <div
              className="flex items-center rounded-lg border transition-colors focus-within:border-primary"
              style={{ borderColor: 'var(--border)' }}
            >
              <input
                ref={tagInputRef}
                value={tagQuery}
                disabled={organizationBusy}
                onFocus={() => setTagMenuOpen(true)}
                onBlur={() => window.setTimeout(() => setTagMenuOpen(false), 150)}
                onChange={(e) => { setTagQuery(e.target.value); setTagMenuOpen(true) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addTag() } }}
                placeholder={copy.tagInputPlaceholder}
                className="h-8 min-w-0 flex-1 bg-transparent px-3 text-[11px] outline-none"
                style={{ color: 'var(--foreground)' }}
              />
              <button
                type="button"
                disabled={organizationBusy || !tagQuery.trim()}
                title={copy.add}
                aria-label={copy.add}
                onClick={() => void addTag()}
                className="flex size-8 items-center justify-center rounded-r-lg transition-colors hover:bg-secondary disabled:opacity-40"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <Plus size={13} />
              </button>
            </div>
            {tagMenuOpen && (matchingTags.length > 0 || tagQuery.trim()) && (
              <div
                className="absolute inset-x-0 top-full z-20 mt-1 max-h-44 overflow-y-auto rounded-lg border p-1 shadow-lg"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--popover)' }}
              >
                {matchingTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void addTag(tag)}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-secondary"
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: tag.color || 'var(--muted-foreground)' }} />
                    <span className="truncate">{tag.name}</span>
                  </button>
                ))}
                {tagQuery.trim() && !tags.some((tag) => tag.name.toLocaleLowerCase() === tagQuery.trim().toLocaleLowerCase()) && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void addTag()}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors hover:bg-secondary"
                    style={{ color: 'var(--primary)' }}
                  >
                    <Plus size={11} />
                    {copy.createTagFromInput.replace('{name}', tagQuery.trim())}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 集合勾选列表 */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--muted-foreground)' }}>
              {copy.collections}
            </p>
            {collections.length === 0 ? (
              <p className="text-[10px] italic" style={{ color: 'var(--muted-foreground)' }}>{copy.noCollections}</p>
            ) : (
              <div className="custom-scrollbar max-h-36 space-y-0.5 overflow-y-auto">
                {collections.map((collection) => {
                  const checked = asset.collections.some((item) => item.id === collection.id)
                  return (
                    <label
                      key={collection.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[11px] transition-colors hover:bg-secondary"
                    >
                      <span
                        className="flex size-4 shrink-0 items-center justify-center rounded border transition-colors"
                        style={{
                          borderColor: checked ? 'var(--primary)' : 'var(--border)',
                          backgroundColor: checked ? 'var(--primary)' : 'transparent',
                        }}
                      >
                        {checked && <Check size={10} style={{ color: 'var(--primary-foreground)' }} />}
                      </span>
                      <input
                        type="checkbox"
                        disabled={organizationBusy}
                        checked={checked}
                        onChange={() => void toggleCollection(collection.id)}
                        className="sr-only"
                      />
                      <span className="min-w-0 flex-1 truncate" style={{ color: checked ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                        {collection.name}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* ── 拍摄信息（有 EXIF 才显示） ── */}
      {hasExif && (
        <Section label={copy.filterCamera} icon={Camera} open={shootingOpen} onToggle={() => setShootingOpen((v) => !v)}>
          <div className="space-y-2">
            {cameraLabel && (
              <p className="truncate text-[11px] font-semibold" title={cameraLabel} style={{ color: 'var(--foreground)' }}>
                {cameraLabel}
              </p>
            )}
            {exif?.lensModel && (
              <p className="truncate text-[10px]" style={{ color: 'var(--muted-foreground)' }} title={exif.lensModel}>
                {exif.lensModel}
              </p>
            )}
            {exposureParts.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {exposureParts.map((part) => (
                  <span
                    key={part}
                    className="rounded border px-1.5 py-0.5 text-[10px] font-mono font-medium tabular-nums"
                    style={{ borderColor: 'var(--border)', backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}
                  >
                    {part}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── 文件信息（默认展开） ── */}
      <Section label={copy.details} icon={FileText} open={fileInfoOpen} onToggle={() => setFileInfoOpen((v) => !v)}>
        <div>
          {isPhoto && asset.capturedAt && <MetaRow label={copy.captured} value={formatDate(asset.capturedAt)} />}
          <MetaRow label={copy.modified} value={formatDate(asset.modifiedAtNs)} />
          {dimensionLabel && <MetaRow label={copy.dimensions} value={dimensionLabel} mono />}
          {asset.byteSize > 0 && <MetaRow label={copy.fileSize} value={formatBytes(asset.byteSize)} />}
          <MetaRow label={copy.format} value={asset.format.toUpperCase()} />
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3 py-1.5">
            <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
              {copy.filterUploadStatus}
            </span>
            <span
              className="flex min-w-0 items-center gap-1 text-left text-[11px] font-medium"
              style={{ color: uploaded ? '#16A34A' : 'var(--muted-foreground)' }}
            >
              <Upload size={9} />
              {uploaded ? copy.filterUploaded : copy.filterNotUploaded}
            </span>
          </div>

          {/* 主色 */}
          {isPhoto && asset.dominantColors && asset.dominantColors.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                {copy.dominantColors}
              </p>
              <div className="flex h-6 overflow-hidden rounded" style={{ border: '1px solid var(--border)' }}>
                {asset.dominantColors.map((value, i) => (
                  <span key={i} title={value} className="min-w-0 flex-1" style={{ backgroundColor: value }} />
                ))}
              </div>
            </div>
          )}

          {/* 路径 */}
          <div className="mt-2">
            <p className="mb-1 text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
              {copy.originalPath}
            </p>
            <p
              className="break-all rounded border px-2.5 py-1.5 font-mono text-[10px] leading-relaxed"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--secondary)', color: 'var(--muted-foreground)' }}
            >
              {asset.relativePath}
            </p>
          </div>
        </div>
      </Section>

      {/* ── 操作区（常驻，不折叠） ── */}
      <div className="mt-auto space-y-2 px-5 pb-5 pt-4">
        {missing ? (
          <>
            <ActionButton
              icon={RefreshCw}
              label={copy.recheckMissing}
              onClick={() => onRecheckMissing(asset)}
              disabled={maintenanceBusy}
              loading={maintenanceBusy}
            />
            <ActionButton
              icon={Trash2}
              label={copy.removeMissingRecord}
              onClick={() => onRemoveMissing(asset)}
              disabled={maintenanceBusy}
              destructive
            />
          </>
        ) : trashed ? (
          <>
            <button
              type="button"
              onClick={() => onRestore(asset)}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              <RotateCcw size={13} />
              {copy.restoreTrashedAsset}
            </button>
            <ActionButton
              icon={Trash2}
              label={copy.permanentTrashedAsset}
              onClick={() => onDelete(asset)}
              destructive
            />
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton icon={ExternalLink} label={copy.openSystem} onClick={() => onOpenSystem(asset)} />
              <ActionButton icon={FolderInput} label={copy.moveAssetsToFolder} onClick={() => onMove(asset)} />
            </div>
            {asset.availability === 'active' && unavailable && isPhoto && (
              <ActionButton
                icon={RefreshCw}
                label={copy.retryPreview}
                onClick={() => onRetryPreview(asset)}
                disabled={maintenanceBusy}
                loading={maintenanceBusy}
              />
            )}
            <div className="h-px" style={{ backgroundColor: 'var(--border)' }} />
            <ActionButton icon={Trash2} label={copy.delete} onClick={() => onDelete(asset)} destructive />
          </>
        )}
      </div>
    </aside>
  )
}
