import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, FileText, FolderInput, Heart, ImageOff, Loader2, Maximize2, Pencil, Plus, RefreshCw, RotateCcw, Star, Trash2, X } from 'lucide-react'
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

const colors = ['', 'red', 'orange', 'yellow', 'green', 'blue', 'purple']

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

function SectionLabel({ label }: { label: string }) {
  return (
    <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
  )
}

export function LocalAssetDetails(props: Props) {
  return <LocalAssetDetailsContent key={props.asset?.id ?? 'none'} {...props} />
}

function LocalAssetDetailsContent({ asset, copy, saving, maintenanceBusy, tags, collections, organizationBusy, onSave, onPreview, onOpenSystem, onMove, onDelete, onRestore, onRetryPreview, onRecheckMissing, onRemoveMissing, onSetTags, onCreateTag, onSetCollections }: Props) {
  const [title, setTitle] = useState(asset?.displayTitle || '')
  const [notes, setNotes] = useState(asset?.notes || '')
  const [rating, setRating] = useState(asset?.rating || 0)
  const [color, setColor] = useState(asset?.colorLabel || '')
  const [favorite, setFavorite] = useState(Boolean(asset?.isFavorite))
  const [editingInfo, setEditingInfo] = useState(false)
  const [tagQuery, setTagQuery] = useState('')
  const [tagMenuOpen, setTagMenuOpen] = useState(false)
  const [assignedTagIds, setAssignedTagIds] = useState<string[]>(() => asset?.tags.map((tag) => tag.id) || [])
  const infoEditorRef = useRef<HTMLDivElement>(null)

  const saveCurrent = useCallback((overrides: Partial<Pick<LocalAsset, 'displayTitle' | 'notes' | 'rating' | 'colorLabel' | 'isFavorite'>> = {}) => {
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

  const finishInfoEditing = useCallback(() => {
    if (!editingInfo) return
    setEditingInfo(false)
    if (!asset || (title === (asset.displayTitle || '') && notes === (asset.notes || ''))) return
    void saveCurrent()
  }, [asset, editingInfo, notes, saveCurrent, title])

  useEffect(() => {
    if (!editingInfo) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!infoEditorRef.current?.contains(event.target as Node)) finishInfoEditing()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [editingInfo, finishInfoEditing])

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
  }

  if (!asset) {
    return <aside className="hidden h-full w-[292px] shrink-0 items-center justify-center border-l p-6 text-center xl:flex" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }} data-local-library-guide="details"><div><ImageOff size={26} className="mx-auto mb-3" /><p className="text-xs">{copy.noSelection}</p></div></aside>
  }

  const previewPending = asset.previewStatus === 'pending' || asset.previewStatus === 'generating'
  const unavailable = asset.previewStatus === 'unavailable'
  const missing = asset.availability === 'missing'
  const trashed = asset.availability === 'trashed'
  const isPhoto = isPhotoAsset(asset)
  return (
    <aside className="custom-scrollbar hidden h-full w-[292px] shrink-0 overflow-y-auto border-l bg-card xl:block" style={{ borderColor: 'var(--border)' }} data-local-library-guide="details">
      <div className="border-b p-3" style={{ borderColor: 'var(--border)' }}>
        <button type="button" onClick={() => onPreview(asset)} disabled={previewPending || missing || trashed} className="group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-secondary disabled:cursor-not-allowed">
          {asset.previewStatus === 'ready' && isPhoto ? (
            <img src={asset.previewUrl} alt="" className="h-full w-full object-contain" />
          ) : previewPending && isPhoto ? (
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--muted-foreground)' }} />
          ) : isPhoto ? (
            <ImageOff size={28} style={{ color: 'var(--muted-foreground)' }} />
          ) : (
            <span className="flex flex-col items-center gap-2" style={{ color: 'var(--muted-foreground)' }}>
              <FileText size={30} strokeWidth={1.4} />
              <span className="max-w-[80%] truncate text-[10px] uppercase tracking-wider">{asset.format}</span>
            </span>
          )}
          {!previewPending && !missing && !trashed && <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white opacity-0 transition group-hover:opacity-100"><Maximize2 size={15} /></span>}
        </button>
        {previewPending && isPhoto && <p className="mt-2 text-[10px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{copy.generatingPreview}</p>}
        {missing && <p className="mt-2 text-[10px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{copy.missingHint}</p>}
        {trashed && asset.trashEntryKind === 'folder' && <p className="mt-2 rounded-md border border-amber-500/35 bg-amber-500/10 px-2.5 py-2 text-[10px] leading-4 text-amber-700 dark:text-amber-300">{copy.folderBatchHint}</p>}
        {!missing && unavailable && isPhoto && (
          <div className="mt-2 space-y-2 text-[10px] leading-4" style={{ color: 'var(--muted-foreground)' }}>
            <p>{copy.unavailablePreview}</p>
            {asset.previewError && <p className="line-clamp-3 break-words"><span className="font-medium">{copy.previewFailureReason}:</span> {asset.previewError}</p>}
          </div>
        )}
      </div>

      <div className="space-y-5 p-4">
        {/* 标题信息块：双击或点击铅笔编辑 */}
        <div ref={infoEditorRef} onDoubleClick={() => setEditingInfo(true)} className="rounded-md border border-transparent p-1 transition hover:border-border">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>{copy.details}</span>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                title={copy.autoSaveHint}
                aria-label={copy.autoSaveHint}
                onClick={() => setEditingInfo(true)}
                className="flex size-8 items-center justify-center rounded-md hover:bg-secondary"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                title={favorite ? copy.unmarkFavorite : copy.markFavorite}
                aria-label={favorite ? copy.unmarkFavorite : copy.markFavorite}
                onClick={() => {
                  const next = !favorite
                  setFavorite(next)
                  void saveCurrent({ isFavorite: next })
                }}
                className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-secondary"
              >
                <Heart size={17} fill={favorite ? 'currentColor' : 'none'} style={{ color: favorite ? 'var(--primary)' : 'var(--muted-foreground)' }} />
              </button>
            </div>
          </div>
          <p className="mt-1 break-all text-[10px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{asset.relativePath}</p>
          {editingInfo ? (
            <div className="mt-3 space-y-3" onKeyDown={(event) => {
              if (event.key !== 'Enter' || (event.target instanceof HTMLTextAreaElement && event.shiftKey)) return
              event.preventDefault()
              finishInfoEditing()
            }}>
              <label className="block text-xs"><span className="mb-1.5 block" style={{ color: 'var(--muted-foreground)' }}>{copy.titleField}</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-md border bg-input px-2.5 py-2 outline-none focus:ring-1" /></label>
              <label className="block text-xs"><span className="mb-1.5 block" style={{ color: 'var(--muted-foreground)' }}>{copy.notes}</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} className="w-full resize-none rounded-md border bg-input px-2.5 py-2 outline-none focus:ring-1" /></label>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={finishInfoEditing}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
                >
                  {copy.save}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-2 text-xs">
              <h2 className="break-words font-sans text-sm font-semibold leading-5">{title || asset.fileName}</h2>
              {notes && <p className="whitespace-pre-wrap leading-5" style={{ color: 'var(--muted-foreground)' }}>{notes}</p>}
            </div>
          )}
          <div className="mt-2 flex min-h-4 items-center gap-1.5 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
            {saving && <Loader2 size={10} className="animate-spin" />}
            {saving ? copy.autoSaving : copy.autoSaveHint}
          </div>
        </div>

        {/* 标签 */}
        <div>
          <SectionLabel label={copy.tags} />
          <div className="flex flex-wrap gap-1.5">
            {assignedTags.map((tag) => <span key={tag.id} className="flex max-w-full items-center gap-1 rounded border bg-secondary px-1.5 py-1 text-[10px]"><span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color || 'var(--muted-foreground)' }} /><span className="truncate">{tag.name}</span><button type="button" disabled={organizationBusy} aria-label={copy.remove} onClick={() => void updateTags(assignedTagIds.filter((id) => id !== tag.id))} className="rounded p-0.5 hover:bg-background disabled:opacity-50"><X size={10} /></button></span>)}
          </div>
          <div className="relative mt-2">
            <div className="flex items-center rounded-md border bg-input focus-within:ring-1 focus-within:ring-ring">
              <input value={tagQuery} disabled={organizationBusy} onFocus={() => setTagMenuOpen(true)} onBlur={() => window.setTimeout(() => setTagMenuOpen(false), 0)} onChange={(event) => { setTagQuery(event.target.value); setTagMenuOpen(true) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addTag() } }} placeholder={copy.tagInputPlaceholder} className="h-8 min-w-0 flex-1 bg-transparent px-2.5 text-xs outline-none" />
              <button type="button" disabled={organizationBusy || !tagQuery.trim()} title={copy.add} aria-label={copy.add} onClick={() => void addTag()} className="flex size-8 items-center justify-center disabled:opacity-40"><Plus size={13} /></button>
            </div>
            {tagMenuOpen && (matchingTags.length > 0 || tagQuery.trim()) && <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-44 overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">
              {matchingTags.map((tag) => <button key={tag.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void addTag(tag)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] hover:bg-secondary"><span className="size-2 rounded-full" style={{ backgroundColor: tag.color || 'var(--muted-foreground)' }} /><span className="truncate">{tag.name}</span></button>)}
              {tagQuery.trim() && !tags.some((tag) => tag.name.toLocaleLowerCase() === tagQuery.trim().toLocaleLowerCase()) && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void addTag()} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] hover:bg-secondary"><Plus size={12} />{copy.createTagFromInput.replace('{name}', tagQuery.trim())}</button>}
            </div>}
          </div>
        </div>

        {/* 集合 */}
        <div>
          <SectionLabel label={copy.collections} />
          <div className="custom-scrollbar max-h-28 space-y-1 overflow-y-auto rounded-md border p-2">
            {collections.length === 0 ? <p className="text-[10px] text-muted-foreground">{copy.noCollections}</p> : collections.map((collection) => {
              const checked = asset.collections.some((item) => item.id === collection.id)
              return <label key={collection.id} className="flex cursor-pointer items-center gap-2 text-[11px]"><input type="checkbox" disabled={organizationBusy} checked={checked} onChange={() => void onSetCollections(asset.id, checked ? asset.collections.filter((item) => item.id !== collection.id).map((item) => item.id) : [...asset.collections.map((item) => item.id), collection.id])} /><span className="truncate">{collection.name}</span></label>
            })}
          </div>
        </div>

        {/* 评分 + 颜色标记 */}
        {isPhoto && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <SectionLabel label={copy.rating} />
            <div className="flex gap-0.5">{[1,2,3,4,5].map((value) => <button key={value} type="button" title={`${value}★`} onClick={() => { const next = rating === value ? 0 : value; setRating(next); void saveCurrent({ rating: next }) }} className="p-0.5"><Star size={16} fill={value <= rating ? 'currentColor' : 'none'} style={{ color: value <= rating ? 'var(--primary)' : 'var(--muted-foreground)' }} /></button>)}</div>
          </div>
          <div>
            <SectionLabel label={copy.color} />
            <div className="flex flex-wrap gap-2">{colors.map((value) => <button key={value || 'none'} type="button" title={value || copy.noColor} onClick={() => { setColor(value); void saveCurrent({ colorLabel: value }) }} className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110" style={{ background: value || 'transparent', borderColor: color === value ? 'var(--foreground)' : 'var(--border)' }} />)}</div>
          </div>
        </div>
        )}

        {/* 主色 */}
        {isPhoto && asset.dominantColors && asset.dominantColors.length > 0 && <div>
          <SectionLabel label={copy.dominantColors} />
          <div className="flex h-7 overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)' }}>
            {asset.dominantColors.map((value) => <span key={value} title={value} className="min-w-0 flex-1" style={{ backgroundColor: value }} />)}
          </div>
        </div>}

        {/* 文件信息 */}
        <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-2 border-t pt-4 text-[11px]" style={{ borderColor: 'var(--border)' }}>
          {isPhoto && <><dt style={{ color: 'var(--muted-foreground)' }}>{copy.dimensions}</dt><dd>{asset.width && asset.height ? `${asset.width} \u00d7 ${asset.height}` : '\u2014'}</dd></>}
          <dt style={{ color: 'var(--muted-foreground)' }}>{copy.format}</dt><dd className="uppercase">{asset.format}</dd>
          <dt style={{ color: 'var(--muted-foreground)' }}>{copy.fileSize}</dt><dd>{formatBytes(asset.byteSize)}</dd>
          {isPhoto && <><dt style={{ color: 'var(--muted-foreground)' }}>{copy.captured}</dt><dd>{formatDate(asset.capturedAt)}</dd></>}
          <dt style={{ color: 'var(--muted-foreground)' }}>{copy.modified}</dt><dd>{formatDate(asset.modifiedAtNs)}</dd>
          <dt style={{ color: 'var(--muted-foreground)' }}>{copy.originalPath}</dt><dd className="break-all font-mono text-[10px]">{asset.relativePath}</dd>
        </dl>

        {/* 操作 */}
        <div className="space-y-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          {missing ? (
            <>
              <button type="button" disabled={maintenanceBusy} onClick={() => onRecheckMissing(asset)} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:cursor-wait disabled:opacity-50"><RefreshCw size={14} className={maintenanceBusy ? 'animate-spin' : ''} />{copy.recheckMissing}</button>
              <button type="button" disabled={maintenanceBusy} onClick={() => onRemoveMissing(asset)} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs text-destructive hover:bg-secondary disabled:opacity-50"><Trash2 size={14} />{copy.removeMissingRecord}</button>
            </>
          ) : (
            <>
              {asset.availability === 'active' && unavailable && isPhoto && (
                <button type="button" disabled={maintenanceBusy} onClick={() => onRetryPreview(asset)} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:cursor-wait disabled:opacity-50"><RefreshCw size={14} className={maintenanceBusy ? 'animate-spin' : ''} />{copy.retryPreview}</button>
              )}
              {trashed ? (
                <>
                  <button type="button" onClick={() => onRestore(asset)} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-secondary"><RotateCcw size={14} />{copy.restoreTrashedAsset}</button>
                  <button type="button" onClick={() => onDelete(asset)} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs text-destructive hover:bg-secondary"><Trash2 size={14} />{copy.permanentTrashedAsset}</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => onOpenSystem(asset)} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-secondary"><ExternalLink size={14} />{copy.openSystem}</button>
                  <button type="button" onClick={() => onMove(asset)} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-secondary"><FolderInput size={14} />{copy.moveAssetsToFolder}</button>
                  <button type="button" onClick={() => onDelete(asset)} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs text-destructive hover:bg-secondary"><Trash2 size={14} />{copy.delete}</button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
