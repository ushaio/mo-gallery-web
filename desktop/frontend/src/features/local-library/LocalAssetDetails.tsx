import { useEffect, useRef, useState } from 'react'
import { ExternalLink, FilePenLine, FolderInput, Heart, ImageOff, Loader2, Maximize2, RefreshCw, RotateCcw, Star, Trash2 } from 'lucide-react'
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
  onRename: (asset: LocalAsset) => void
  onMove: (asset: LocalAsset) => void
  onDelete: (asset: LocalAsset) => void
  onRestore: (asset: LocalAsset) => void
  onRetryPreview: (asset: LocalAsset) => void
  onRecheckMissing: (asset: LocalAsset) => void
  onRemoveMissing: (asset: LocalAsset) => void
  onSetTags: (assetId: string, tagIds: string[]) => Promise<void>
  onSetCollections: (assetId: string, collectionIds: string[]) => Promise<void>
}

const colors = ['', 'red', 'orange', 'yellow', 'green', 'blue', 'purple']

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

export function LocalAssetDetails({ asset, copy, saving, maintenanceBusy, tags, collections, organizationBusy, onSave, onPreview, onOpenSystem, onRename, onMove, onDelete, onRestore, onRetryPreview, onRecheckMissing, onRemoveMissing, onSetTags, onSetCollections }: Props) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [rating, setRating] = useState(0)
  const [color, setColor] = useState('')
  const [favorite, setFavorite] = useState(false)
  const pendingSaveRef = useRef<{
    assetId: string
    patch: Pick<LocalAsset, 'displayTitle' | 'notes' | 'rating' | 'colorLabel' | 'isFavorite'>
  } | null>(null)
  const saveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    setTitle(asset?.displayTitle || '')
    setNotes(asset?.notes || '')
    setRating(asset?.rating || 0)
    setColor(asset?.colorLabel || '')
    setFavorite(Boolean(asset?.isFavorite))
  }, [asset?.id])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      const pending = pendingSaveRef.current
      pendingSaveRef.current = null
      if (pending) void onSave(pending.assetId, pending.patch)
    }
  }, [asset?.id, onSave])

  useEffect(() => {
    if (!asset) return
    const patch = {
      displayTitle: title,
      notes,
      rating,
      colorLabel: color,
      isFavorite: favorite,
    }
    const unchanged = patch.displayTitle === (asset.displayTitle || '')
      && patch.notes === (asset.notes || '')
      && patch.rating === (asset.rating || 0)
      && patch.colorLabel === (asset.colorLabel || '')
      && patch.isFavorite === Boolean(asset.isFavorite)
    if (unchanged) {
      pendingSaveRef.current = null
      return
    }

    pendingSaveRef.current = { assetId: asset.id, patch }
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      const pending = pendingSaveRef.current
      pendingSaveRef.current = null
      saveTimerRef.current = null
      if (pending) void onSave(pending.assetId, pending.patch)
    }, 600)
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [asset, color, favorite, notes, onSave, rating, title])

  if (!asset) {
    return <aside className="hidden h-full w-[292px] shrink-0 items-center justify-center border-l p-6 text-center xl:flex" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}><div><ImageOff size={26} className="mx-auto mb-3" /><p className="text-xs">{copy.noSelection}</p></div></aside>
  }

  const previewPending = asset.previewStatus === 'pending' || asset.previewStatus === 'generating'
  const unavailable = asset.previewStatus === 'unavailable'
  const missing = asset.availability === 'missing'
  const trashed = asset.availability === 'trashed'
  return (
    <aside className="custom-scrollbar hidden h-full w-[292px] shrink-0 overflow-y-auto border-l bg-card xl:block" style={{ borderColor: 'var(--border)' }}>
      <div className="border-b p-3" style={{ borderColor: 'var(--border)' }}>
        <button type="button" onClick={() => onPreview(asset)} disabled={previewPending || missing || trashed} className="group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-secondary disabled:cursor-not-allowed">
          {asset.previewStatus === 'ready' ? (
            <img src={asset.previewUrl} alt="" className="h-full w-full object-contain" />
          ) : previewPending ? (
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--muted-foreground)' }} />
          ) : (
            <ImageOff size={28} style={{ color: 'var(--muted-foreground)' }} />
          )}
          {!previewPending && !missing && !trashed && <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white opacity-0 transition group-hover:opacity-100"><Maximize2 size={15} /></span>}
        </button>
        {previewPending && <p className="mt-2 text-[10px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{copy.generatingPreview}</p>}
        {missing && <p className="mt-2 text-[10px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{copy.missingHint}</p>}
        {trashed && asset.trashEntryKind === 'folder' && <p className="mt-2 rounded-md border border-amber-500/35 bg-amber-500/10 px-2.5 py-2 text-[10px] leading-4 text-amber-700 dark:text-amber-300">{copy.folderBatchHint}</p>}
        {!missing && unavailable && (
          <div className="mt-2 space-y-2 text-[10px] leading-4" style={{ color: 'var(--muted-foreground)' }}>
            <p>{copy.unavailablePreview}</p>
            {asset.previewError && <p className="line-clamp-3 break-words"><span className="font-medium">{copy.previewFailureReason}:</span> {asset.previewError}</p>}
          </div>
        )}
      </div>

      <div className="space-y-5 p-4">
        <div>
          <h2 className="font-sans text-sm font-medium">{copy.details}</h2>
          <p className="mt-1 break-all text-[10px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{asset.relativePath}</p>
        </div>
        <label className="block text-xs"><span className="mb-1.5 block" style={{ color: 'var(--muted-foreground)' }}>{copy.titleField}</span><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border bg-input px-2.5 py-2 outline-none focus:ring-1" /></label>
        <label className="block text-xs"><span className="mb-1.5 block" style={{ color: 'var(--muted-foreground)' }}>{copy.notes}</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="w-full resize-none rounded-md border bg-input px-2.5 py-2 outline-none focus:ring-1" /></label>
        <div>
          <span className="mb-1.5 block text-xs" style={{ color: 'var(--muted-foreground)' }}>{copy.tags}</span>
          <div className="max-h-28 space-y-1 overflow-y-auto rounded-md border p-2">
            {tags.length === 0 ? <p className="text-[10px] text-muted-foreground">{copy.noTags}</p> : tags.map((tag) => {
              const checked = asset.tags.some((item) => item.id === tag.id)
              return <label key={tag.id} className="flex cursor-pointer items-center gap-2 text-[11px]"><input type="checkbox" disabled={organizationBusy} checked={checked} onChange={() => void onSetTags(asset.id, checked ? asset.tags.filter((item) => item.id !== tag.id).map((item) => item.id) : [...asset.tags.map((item) => item.id), tag.id])} /><span className="size-2 rounded-full" style={{ backgroundColor: tag.color || 'var(--muted-foreground)' }} /><span className="truncate">{tag.name}</span></label>
            })}
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-xs" style={{ color: 'var(--muted-foreground)' }}>{copy.collections}</span>
          <div className="max-h-28 space-y-1 overflow-y-auto rounded-md border p-2">
            {collections.length === 0 ? <p className="text-[10px] text-muted-foreground">{copy.noCollections}</p> : collections.map((collection) => {
              const checked = asset.collections.some((item) => item.id === collection.id)
              return <label key={collection.id} className="flex cursor-pointer items-center gap-2 text-[11px]"><input type="checkbox" disabled={organizationBusy} checked={checked} onChange={() => void onSetCollections(asset.id, checked ? asset.collections.filter((item) => item.id !== collection.id).map((item) => item.id) : [...asset.collections.map((item) => item.id), collection.id])} /><span className="truncate">{collection.name}</span></label>
            })}
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-xs" style={{ color: 'var(--muted-foreground)' }}>{copy.rating}</span>
          <div className="flex gap-1">{[1,2,3,4,5].map((value) => <button key={value} type="button" onClick={() => setRating(rating === value ? 0 : value)} className="p-0.5"><Star size={18} fill={value <= rating ? 'currentColor' : 'none'} style={{ color: value <= rating ? 'var(--primary)' : 'var(--muted-foreground)' }} /></button>)}</div>
        </div>
        <div>
          <span className="mb-2 block text-xs" style={{ color: 'var(--muted-foreground)' }}>{copy.color}</span>
          <div className="flex gap-2">{colors.map((value) => <button key={value || 'none'} type="button" onClick={() => setColor(value)} className="h-5 w-5 rounded-full border-2" style={{ background: value || 'transparent', borderColor: color === value ? 'var(--foreground)' : 'var(--border)' }} />)}</div>
        </div>
        <label className="flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-xs"><span className="flex items-center gap-2"><Heart size={15} fill={favorite ? 'currentColor' : 'none'} />{copy.favorite}</span><input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} /></label>
        <div className="flex min-h-5 items-center gap-1.5 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
          {saving && <Loader2 size={11} className="animate-spin" />}
          {saving ? copy.autoSaving : copy.autoSaveHint}
        </div>

        <dl className="grid grid-cols-[78px_1fr] gap-x-3 gap-y-2 border-t pt-4 text-[11px]" style={{ borderColor: 'var(--border)' }}>
          <dt style={{ color: 'var(--muted-foreground)' }}>{copy.dimensions}</dt><dd>{asset.width && asset.height ? `${asset.width} \u00d7 ${asset.height}` : '\u2014'}</dd>
          <dt style={{ color: 'var(--muted-foreground)' }}>{copy.format}</dt><dd className="uppercase">{asset.format}</dd>
          <dt style={{ color: 'var(--muted-foreground)' }}>{copy.fileSize}</dt><dd>{formatBytes(asset.byteSize)}</dd>
        </dl>
        <div className="space-y-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          {missing ? (
            <>
              <button type="button" disabled={maintenanceBusy} onClick={() => onRecheckMissing(asset)} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:cursor-wait disabled:opacity-50"><RefreshCw size={14} className={maintenanceBusy ? 'animate-spin' : ''} />{copy.recheckMissing}</button>
              <button type="button" disabled={maintenanceBusy} onClick={() => onRemoveMissing(asset)} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50" style={{ color: 'var(--destructive)' }}><Trash2 size={14} />{copy.removeMissingRecord}</button>
            </>
          ) : (
            <>
              {asset.availability === 'active' && unavailable && (
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
                  <button type="button" onClick={() => onRename(asset)} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-secondary"><FilePenLine size={14} />{copy.renameAsset}</button>
                  <button type="button" onClick={() => onMove(asset)} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-secondary"><FolderInput size={14} />{copy.moveAssetsToFolder}</button>
                  <button type="button" onClick={() => onDelete(asset)} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-secondary" style={{ color: 'var(--destructive)' }}><Trash2 size={14} />{copy.delete}</button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
