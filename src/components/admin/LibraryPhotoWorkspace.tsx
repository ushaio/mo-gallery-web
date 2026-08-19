'use client'

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  CheckSquare,
  Columns3,
  Eye,
  EyeOff,
  Film,
  Filter,
  ImageOff,
  Images,
  LayoutGrid,
  Loader2,
  Maximize2,
  Pencil,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import {
  ApiUnauthorizedError,
  batchDeletePhotos,
  batchUpdatePhotoShowFlag,
  batchUpdatePhotoTakenAt,
  batchUpdatePhotoType,
  checkPhotosStories,
  deletePhoto,
  getAdminAlbum,
  getAdminPhotos,
  getAdminPhotoStory,
  resolveAssetUrl,
  updatePhoto,
} from '@/lib/api'
import type { AlbumDto, AdminSettingsDto, PhotoDto, PhotoWithStories } from '@/lib/api/types'
import { AdminButton } from '@/components/admin/AdminButton'
import { BatchPhotoActionDialog, type BatchPhotoActionInput } from '@/components/admin/BatchPhotoActionDialog'
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog'
import { LibraryPhotoInfoSidebar } from '@/components/admin/LibraryPhotoInfoSidebar'
import { PhotoDetailPanel } from '@/components/admin/PhotoDetailPanel'
import { PhotoPreviewOverlay } from '@/components/admin/PhotoPreviewOverlay'
import { useAdminPreferenceStore, type ResourceLibraryPhotoViewMode } from '@/lib/admin-preferences'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 100
const MASONRY_COLUMN_GAP = 6
const MASONRY_CARD_MARGIN = 6
const PHOTO_FORMATS = ['jpg', 'png', 'webp', 'avif', 'gif', 'tiff', 'heic'] as const

export interface LibraryPhotoFilters {
  categoryFilter?: string
  photoTypeFilter?: string
  fileFormats?: string[]
  albumFilter?: string
  onlyFeatured?: boolean
}

interface LibraryPhotoWorkspaceProps {
  token: string | null
  categories: string[]
  albums: AlbumDto[]
  settings: AdminSettingsDto | null
  initialFilters?: LibraryPhotoFilters
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  onUnauthorized: (error?: unknown) => void
}

type SortField = 'createdAt' | 'takenAt'
type SortOrder = 'asc' | 'desc'

type ContextMenuState = { photo: PhotoDto; x: number; y: number }
type EditorState = { photo: PhotoDto; tab: 'info' | 'story' }
type DeleteRequest = { ids: string[]; isBulk: boolean }

function getPhotoFileFormat(photo: Pick<PhotoDto, 'path' | 'url'>) {
  const source = photo.path || photo.url
  if (!source) return undefined
  const path = source.split(/[?#]/, 1)[0]
  const extension = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLocaleLowerCase()
  return extension === 'jpeg' ? 'jpg' : extension
}

function PhotoFiltersPopover({ categories, category, photoType, fileFormats, t, onCategoryChange, onPhotoTypeChange, onFileFormatsChange }: {
  categories: string[]
  category: string
  photoType: string
  fileFormats: string[]
  t: (key: string) => string
  onCategoryChange: (value: string) => void
  onPhotoTypeChange: (value: string) => void
  onFileFormatsChange: (value: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const activeCount = (category !== 'all' ? 1 : 0) + (photoType !== 'all' ? 1 : 0) + (fileFormats.length ? 1 : 0)

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node
      if (!buttonRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [open])

  const toggleFileFormat = (format: string) => {
    onFileFormatsChange(fileFormats.includes(format)
      ? fileFormats.filter((item) => item !== format)
      : [...fileFormats, format])
  }
  const optionClass = (active: boolean) => cn(
    'rounded-md border border-border px-2.5 py-1.5 text-[10px] font-medium transition hover:bg-muted',
    active && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
  )

  return (
    <>
      <button ref={buttonRef} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="dialog" className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs hover:bg-muted">
        <Filter size={13} />
        <span>{t('admin.filters')}</span>
        {activeCount > 0 && <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">{activeCount}</span>}
      </button>

      {open && (
        <div ref={panelRef} role="dialog" aria-label={t('admin.filters')} className="absolute left-3 right-3 top-[calc(100%+4px)] z-30 max-h-[min(60vh,32rem)] overflow-auto rounded-md border border-border bg-background p-4 shadow-xl">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div><h2 className="text-sm font-semibold">{t('admin.filters')}</h2><p className="mt-0.5 text-[10px] text-muted-foreground">{t('admin.photo_filter_logic_hint')}</p></div>
            <button type="button" onClick={() => setOpen(false)} aria-label={t('admin.close_filters')} className="rounded-md p-1.5 hover:bg-muted"><X size={15} /></button>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-x-6 gap-y-5">
            <section>
              <h3 className="mb-2 text-[11px] font-semibold">{t('admin.capture_type')}</h3>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => onPhotoTypeChange('all')} className={optionClass(photoType === 'all')}>{t('common.all')}</button>
                <button type="button" onClick={() => onPhotoTypeChange('digital')} className={optionClass(photoType === 'digital')}>{t('admin.upload_type_digital')}</button>
                <button type="button" onClick={() => onPhotoTypeChange('film')} className={optionClass(photoType === 'film')}>{t('admin.upload_type_film')}</button>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-[11px] font-semibold">{t('admin.photo_format')}</h3>
              <div className="flex flex-wrap gap-1.5">{PHOTO_FORMATS.map((format) => <button key={format} type="button" onClick={() => toggleFileFormat(format)} className={optionClass(fileFormats.includes(format))}>{format.toUpperCase()}</button>)}</div>
            </section>

            <section>
              <h3 className="mb-2 text-[11px] font-semibold">{t('admin.category')}</h3>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-auto pr-1">
                <button type="button" onClick={() => onCategoryChange('all')} className={optionClass(category === 'all')}>{t('common.all')}</button>
                {categories.filter((item) => item !== 'all' && item !== '全部').map((item) => <button key={item} type="button" onClick={() => onCategoryChange(item)} className={optionClass(category === item)}>{item}</button>)}
              </div>
            </section>
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-border pt-3">
            <button type="button" disabled={activeCount === 0} onClick={() => { onCategoryChange('all'); onPhotoTypeChange('all'); onFileFormatsChange([]) }} className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[10px] hover:bg-muted disabled:opacity-40"><X size={11} />{t('admin.clear_all_filters')}</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md bg-primary px-4 py-1.5 text-[10px] font-medium text-primary-foreground hover:bg-primary/90">{t('admin.filter_done')}</button>
          </div>
        </div>
      )}
    </>
  )
}

function estimateMasonryPhotoHeight(photo: PhotoDto, columnWidth: number) {
  const aspectRatio = photo.width > 0 && photo.height > 0
    ? photo.width / photo.height
    : 4 / 3

  return Math.round(columnWidth / aspectRatio) + MASONRY_CARD_MARGIN
}

function distributeMasonryPhotos(photos: PhotoDto[], columnCount: number, columnWidth: number) {
  const columns = Array.from({ length: columnCount }, () => [] as PhotoDto[])
  const heights = Array.from({ length: columnCount }, () => 0)

  for (const photo of photos) {
    let targetColumn = 0
    for (let index = 1; index < heights.length; index += 1) {
      if (heights[index] < heights[targetColumn]) targetColumn = index
    }

    columns[targetColumn].push(photo)
    heights[targetColumn] += estimateMasonryPhotoHeight(photo, columnWidth)
  }

  return columns
}

function Thumb({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [loaded, setLoaded] = useState(false)
  return <img src={src} alt={alt} loading="lazy" decoding="async" draggable={false} ref={(node) => { if (node?.complete && node.naturalWidth > 0) setLoaded(true) }} onLoad={() => setLoaded(true)} className={`${className} ${loaded ? 'opacity-100' : 'opacity-0'}`} />
}

interface PhotoCardProps {
  photo: PhotoDto
  selected: boolean
  busy: boolean
  mode: ResourceLibraryPhotoViewMode
  cdnDomain?: string
  t: (key: string) => string
  onClick: (event: React.MouseEvent, photo: PhotoDto) => void
  onDoubleClick: (photo: PhotoDto) => void
  onContextMenu: (event: React.MouseEvent, photo: PhotoDto) => void
  onToggleSelect: (id: string) => void
  onToggleFeatured: (photo: PhotoDto) => void
  onToggleVisibility: (photo: PhotoDto) => void
  onDelete: (photo: PhotoDto) => void
}

const PhotoCard = memo(function PhotoCard({
  photo,
  selected,
  busy,
  mode,
  cdnDomain,
  t,
  onClick,
  onDoubleClick,
  onContextMenu,
  onToggleSelect,
  onToggleFeatured,
  onToggleVisibility,
  onDelete,
}: PhotoCardProps) {
  const masonry = mode === 'masonry'
  const visible = photo.showFlag ?? true
  const assetPath = photo.thumbnailUrl || photo.url

  return (
    <div
      className={cn(
        'group overflow-hidden border text-left transition focus:outline-none',
        masonry ? 'mb-1.5 inline-block w-full rounded-sm align-top' : 'flex h-full min-w-0 flex-col rounded-lg',
        busy ? 'cursor-wait opacity-70' : 'cursor-pointer',
      )}
      style={{
        borderColor: selected ? 'var(--primary)' : masonry ? 'transparent' : 'var(--border)',
        backgroundColor: selected ? 'var(--accent)' : masonry ? 'transparent' : 'var(--card)',
        boxShadow: selected ? '0 0 0 1px var(--primary)' : undefined,
        breakInside: masonry ? 'avoid' : undefined,
      }}
      onClick={(event) => { if (!busy) onClick(event, photo) }}
      onDoubleClick={() => { if (!busy) onDoubleClick(photo) }}
      onContextMenu={(event) => { if (!busy) onContextMenu(event, photo) }}
    >
      <div
        className={cn('relative min-h-0 w-full overflow-hidden bg-muted', !masonry && 'aspect-[5/4]')}
        style={masonry ? { aspectRatio: photo.width > 0 && photo.height > 0 ? `${photo.width} / ${photo.height}` : '4 / 3' } : undefined}
      >
        {assetPath ? (
          <Thumb
            src={resolveAssetUrl(assetPath, cdnDomain)}
            alt={photo.title || ''}
            className={cn(
              'w-full transition-[transform,opacity] duration-300',
              masonry ? 'block h-full object-cover group-hover:scale-[1.015]' : mode === 'fit' ? 'h-full object-contain p-1' : 'h-full object-cover group-hover:scale-[1.025]',
            )}
          />
        ) : (
          <div className="flex h-full min-h-24 items-center justify-center text-muted-foreground" aria-label={t('admin.resource_library_no_photo_selected')}>
            <ImageOff size={28} />
          </div>
        )}

        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onToggleSelect(photo.id) }}
          className={cn('absolute left-2 top-2 z-30 flex size-5 items-center justify-center rounded border transition-opacity', selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
          style={{ backgroundColor: selected ? 'var(--primary)' : 'rgba(0,0,0,0.4)', borderColor: selected ? 'var(--primary)' : 'rgba(255,255,255,0.75)' }}
          aria-label={selected ? t('admin.deselect_photo') : t('admin.select_photos')}
        >
          {selected && <Check size={12} className="text-white" />}
        </button>

        <div className="absolute right-2 top-2 z-20 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button type="button" onClick={(event) => { event.stopPropagation(); onToggleFeatured(photo) }} className="rounded bg-black/60 p-1.5 text-white hover:bg-black/75" title={photo.isFeatured ? t('admin.remove_featured') : t('admin.featured')}><Star size={12} fill={photo.isFeatured ? 'currentColor' : 'none'} /></button>
          <button type="button" onClick={(event) => { event.stopPropagation(); onToggleVisibility(photo) }} className="rounded bg-black/60 p-1.5 text-white hover:bg-black/75" title={visible ? t('admin.hide_in_gallery') : t('admin.show_in_gallery')}>{visible ? <Eye size={12} /> : <EyeOff size={12} />}</button>
          <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(photo) }} className="rounded bg-black/60 p-1.5 text-white hover:bg-red-600/85" title={t('common.delete')}><Trash2 size={12} /></button>
        </div>

        {(photo.isFeatured || !visible || photo.photoType === 'film') && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-1 text-white">
            {photo.isFeatured && <Star size={11} fill="currentColor" />}
            {!visible && <EyeOff size={11} />}
            {photo.photoType === 'film' && <Film size={11} />}
          </div>
        )}

        {busy && <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 text-white"><Loader2 size={20} className="animate-spin" /></div>}
      </div>

      {!masonry && (
        <div className="block w-full px-2.5 py-2">
          <span className="block truncate text-xs font-medium">{photo.title || t('admin.resource_library_untitled_photo')}</span>
          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{photo.width && photo.height ? `${photo.width} × ${photo.height}` : photo.category || '—'}</span>
        </div>
      )}
    </div>
  )
})

export function LibraryPhotoWorkspace({ token, categories, albums, settings, initialFilters = {}, t, notify, onUnauthorized }: LibraryPhotoWorkspaceProps) {
  const router = useRouter()
  const viewMode = useAdminPreferenceStore((state) => state.resourceLibraryPhotoViewMode)
  const setViewMode = useAdminPreferenceStore((state) => state.setResourceLibraryPhotoViewMode)
  const gridSize = useAdminPreferenceStore((state) => state.resourceLibraryPhotoSize)
  const setGridSize = useAdminPreferenceStore((state) => state.setResourceLibraryPhotoSize)

  const [photos, setPhotos] = useState<PhotoDto[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(initialFilters.categoryFilter || 'all')
  const [photoType, setPhotoType] = useState(initialFilters.photoTypeFilter || 'all')
  const [fileFormats, setFileFormats] = useState<string[]>(initialFilters.fileFormats || [])
  const [featured, setFeatured] = useState(initialFilters.onlyFeatured === true)
  const [albumId, setAlbumId] = useState(initialFilters.albumFilter || '')
  const [sortBy, setSortBy] = useState<SortField>('takenAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoDto | null>(null)
  const [previewPhoto, setPreviewPhoto] = useState<PhotoDto | null>(null)
  const [editorState, setEditorState] = useState<EditorState | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set())
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [batchSaving, setBatchSaving] = useState(false)
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null)
  const [deleteDialogLoading, setDeleteDialogLoading] = useState(false)
  const [photosWithStories, setPhotosWithStories] = useState<PhotoWithStories[]>([])
  const [deleteOriginal, setDeleteOriginal] = useState(false)
  const [deleteThumbnail, setDeleteThumbnail] = useState(true)
  const [photoGridWidth, setPhotoGridWidth] = useState(900)

  const pageRef = useRef(1)
  const requestIdRef = useRef(0)
  const loadingRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const anchorIdRef = useRef<string | null>(null)

  const filterKey = JSON.stringify([albumId, category, featured, photoType, fileFormats, search, sortBy, sortOrder])
  const cdnDomain = settings?.cdn_domain?.trim() || undefined
  const masonryColumnCount = Math.max(1, Math.floor((photoGridWidth + MASONRY_COLUMN_GAP) / (gridSize + MASONRY_COLUMN_GAP)))
  const masonryColumnWidth = Math.max(
    1,
    (photoGridWidth - Math.max(0, masonryColumnCount - 1) * MASONRY_COLUMN_GAP) / masonryColumnCount,
  )
  const masonryColumns = useMemo(
    () => distributeMasonryPhotos(photos, masonryColumnCount, masonryColumnWidth),
    [masonryColumnCount, masonryColumnWidth, photos],
  )

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return

    const updateGridWidth = () => {
      const style = window.getComputedStyle(element)
      const horizontalPadding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
      const width = Math.max(1, element.clientWidth - horizontalPadding)
      setPhotoGridWidth((current) => Math.abs(current - width) < 0.5 ? current : width)
    }

    updateGridWidth()
    const observer = new ResizeObserver(updateGridWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const fetchPhotos = useCallback(async (page: number, append: boolean) => {
    if (!token || (append && (loadingRef.current || !hasMore))) return
    const requestId = ++requestIdRef.current
    loadingRef.current = true
    append ? setLoadingMore(true) : setLoading(true)
    setError('')

    try {
      let nextPhotos: PhotoDto[]
      let nextTotal: number
      let nextHasMore: boolean

      if (albumId) {
        const album = await getAdminAlbum(token, albumId)
        const query = search.toLocaleLowerCase()
        nextPhotos = (album.photos || [])
          .filter((photo) => category === 'all' || photo.category?.split(',').includes(category))
          .filter((photo) => photoType === 'all' || (photo.photoType || 'digital') === photoType)
          .filter((photo) => fileFormats.length === 0 || fileFormats.includes(getPhotoFileFormat(photo) || ''))
          .filter((photo) => !featured || photo.isFeatured)
          .filter((photo) => !query || photo.title?.toLocaleLowerCase().includes(query))
          .toSorted((left, right) => {
            const field = sortBy === 'takenAt' ? 'takenAt' : 'createdAt'
            const comparison = new Date(left[field] || 0).getTime() - new Date(right[field] || 0).getTime()
            return sortOrder === 'asc' ? comparison : -comparison
          })
        nextTotal = nextPhotos.length
        nextHasMore = false
      } else {
        const result = await getAdminPhotos(token, {
          category,
          search,
          photoType: photoType === 'digital' || photoType === 'film' ? photoType : undefined,
          formats: fileFormats,
          featured: featured ? true : undefined,
          page,
          pageSize: PAGE_SIZE,
          sortBy,
          sortOrder,
        })
        nextPhotos = result.data
        nextTotal = result.meta.total
        nextHasMore = result.meta.hasMore
      }

      if (requestId !== requestIdRef.current) return
      setPhotos((current) => append ? [...current, ...nextPhotos] : nextPhotos)
      setTotal(nextTotal)
      setHasMore(nextHasMore)
      pageRef.current = page
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      if (err instanceof ApiUnauthorizedError) onUnauthorized(err)
      else setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      if (requestId === requestIdRef.current) {
        loadingRef.current = false
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [albumId, category, featured, fileFormats, hasMore, onUnauthorized, photoType, search, sortBy, sortOrder, t, token])

  useEffect(() => {
    pageRef.current = 1
    setPhotos([])
    setHasMore(true)
    setSelectedIds(new Set())
    setSelectedPhoto(null)
    anchorIdRef.current = null
    scrollRef.current?.scrollTo({ top: 0 })
    void fetchPhotos(1, false)
  // fetchPhotos intentionally follows filterKey; hasMore changes must not restart the query.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, token])

  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel || loading || loadingMore || !hasMore || photos.length === 0) return
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || loadingRef.current) return
      void fetchPhotos(pageRef.current + 1, true)
    }, { root, rootMargin: '360px 0px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [fetchPhotos, hasMore, loading, loadingMore, photos.length, viewMode])

  useEffect(() => {
    if (selectedPhoto && !photos.some((photo) => photo.id === selectedPhoto.id)) setSelectedPhoto(null)
  }, [photos, selectedPhoto])

  const mergePhoto = useCallback((updated: PhotoDto) => {
    setPhotos((current) => current.map((photo) => photo.id === updated.id ? { ...photo, ...updated } : photo))
    setSelectedPhoto((current) => current?.id === updated.id ? { ...current, ...updated } : current)
    setPreviewPhoto((current) => current?.id === updated.id ? { ...current, ...updated } : current)
    setEditorState((current) => current?.photo.id === updated.id ? { ...current, photo: { ...current.photo, ...updated } } : current)
  }, [])

  const toggleSelect = useCallback((id: string) => {
    anchorIdRef.current = id
    setSelectedIds((current) => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const handlePhotoClick = useCallback((event: React.MouseEvent, photo: PhotoDto) => {
    if (event.shiftKey) {
      event.preventDefault()
      const anchorId = anchorIdRef.current
      if (anchorId && anchorId !== photo.id) {
        const start = photos.findIndex((item) => item.id === anchorId)
        const end = photos.findIndex((item) => item.id === photo.id)
        if (start !== -1 && end !== -1) {
          const [from, to] = start < end ? [start, end] : [end, start]
          setSelectedIds((current) => new Set([...current, ...photos.slice(from, to + 1).map((item) => item.id)]))
          return
        }
      }
      toggleSelect(photo.id)
      return
    }
    setSelectedPhoto(photo)
  }, [photos, toggleSelect])

  const runPhotoUpdate = useCallback(async (photo: PhotoDto, patch: { isFeatured?: boolean; showFlag?: boolean }) => {
    if (!token || updatingIds.has(photo.id)) return
    setUpdatingIds((current) => new Set(current).add(photo.id))
    try {
      const updated = await updatePhoto({ token, id: photo.id, patch })
      mergePhoto(updated)
      notify(t('admin.notify_success'))
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) onUnauthorized(err)
      else notify(err instanceof Error ? err.message : t('common.error'), 'error')
    } finally {
      setUpdatingIds((current) => { const next = new Set(current); next.delete(photo.id); return next })
    }
  }, [mergePhoto, notify, onUnauthorized, t, token, updatingIds])

  const openStoryEditor = useCallback(async (photo: PhotoDto) => {
    if (!token) return
    setContextMenu(null)
    try {
      const story = await getAdminPhotoStory(token, photo.id)
      if (story) router.push(`/admin/logs?editStory=${encodeURIComponent(story.id)}`)
      else setEditorState({ photo, tab: 'story' })
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) onUnauthorized(err)
      else notify(err instanceof Error ? err.message : t('common.error'), 'error')
    }
  }, [notify, onUnauthorized, router, t, token])

  const requestDelete = useCallback(async (ids: string[]) => {
    if (!token || ids.length === 0) return
    setContextMenu(null)
    setDeleteRequest({ ids, isBulk: ids.length > 1 })
    setDeleteDialogLoading(true)
    setPhotosWithStories([])
    try {
      const result = await checkPhotosStories(token, ids)
      setPhotosWithStories(result.photosWithStories)
    } catch {
      setPhotosWithStories([])
    } finally {
      setDeleteDialogLoading(false)
    }
  }, [token])

  const confirmDelete = async () => {
    if (!token || !deleteRequest) return
    try {
      if (deleteRequest.isBulk) {
        await batchDeletePhotos({ token, photoIds: deleteRequest.ids, deleteOriginal, deleteThumbnail, force: photosWithStories.length > 0 })
      } else {
        await deletePhoto({ token, id: deleteRequest.ids[0], deleteOriginal, deleteThumbnail, force: photosWithStories.length > 0 })
      }
      const ids = new Set(deleteRequest.ids)
      setPhotos((current) => current.filter((photo) => !ids.has(photo.id)))
      setTotal((current) => Math.max(0, current - ids.size))
      setSelectedIds((current) => { const next = new Set(current); ids.forEach((id) => next.delete(id)); return next })
      setSelectedPhoto((current) => current && ids.has(current.id) ? null : current)
      setPreviewPhoto((current) => current && ids.has(current.id) ? null : current)
      setEditorState((current) => current && ids.has(current.photo.id) ? null : current)
      setDeleteRequest(null)
      setPhotosWithStories([])
      notify(t('admin.notify_photo_deleted'))
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) onUnauthorized(err)
      else notify(err instanceof Error ? err.message : t('common.error'), 'error')
    }
  }

  const confirmBatchAction = async (input: BatchPhotoActionInput) => {
    if (!token || selectedIds.size === 0) return
    const photoIds = Array.from(selectedIds)
    setBatchSaving(true)
    try {
      if (input.action === 'photoType' && input.photoType) await batchUpdatePhotoType({ token, photoIds, photoType: input.photoType, filmRollId: input.filmRollId })
      if (input.action === 'takenAt' && input.takenAt) await batchUpdatePhotoTakenAt({ token, photoIds, takenAt: input.takenAt })
      if (input.action === 'showFlag' && input.showFlag !== undefined) await batchUpdatePhotoShowFlag({ token, photoIds, showFlag: input.showFlag })
      setBatchDialogOpen(false)
      setSelectedIds(new Set())
      await fetchPhotos(1, false)
      notify(t('admin.notify_success'))
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) onUnauthorized(err)
      else notify(err instanceof Error ? err.message : t('common.error'), 'error')
    } finally {
      setBatchSaving(false)
    }
  }

  const batchSetVisibility = async (showFlag: boolean) => {
    if (!token || selectedIds.size === 0 || batchSaving) return
    setBatchSaving(true)
    try {
      await batchUpdatePhotoShowFlag({ token, photoIds: Array.from(selectedIds), showFlag })
      setPhotos((current) => current.map((photo) => selectedIds.has(photo.id) ? { ...photo, showFlag } : photo))
      notify(t('admin.notify_success'))
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) onUnauthorized(err)
      else notify(err instanceof Error ? err.message : t('common.error'), 'error')
    } finally {
      setBatchSaving(false)
    }
  }

  const previewIndex = previewPhoto ? photos.findIndex((photo) => photo.id === previewPhoto.id) : -1

  useEffect(() => {
    if (!previewPhoto || previewIndex < 0 || previewIndex < photos.length - 5 || !hasMore || loadingRef.current) return
    void fetchPhotos(pageRef.current + 1, true)
  }, [fetchPhotos, hasMore, photos.length, previewIndex, previewPhoto])

  const goPreview = (direction: 1 | -1) => {
    if (previewIndex === -1) return
    const nextIndex = previewIndex + direction
    if (nextIndex < 0 || nextIndex >= photos.length) return
    setPreviewPhoto(photos[nextIndex])
    if (direction === 1 && nextIndex >= photos.length - 5 && hasMore && !loadingRef.current) void fetchPhotos(pageRef.current + 1, true)
  }

  const renderPhotoCard = (photo: PhotoDto) => (
    <PhotoCard
      key={photo.id}
      photo={photo}
      selected={selectedIds.has(photo.id)}
      busy={updatingIds.has(photo.id)}
      mode={viewMode}
      cdnDomain={cdnDomain}
      t={t}
      onClick={handlePhotoClick}
      onDoubleClick={setPreviewPhoto}
      onContextMenu={(event, item) => {
        event.preventDefault()
        setContextMenu({
          photo: item,
          x: Math.max(8, Math.min(event.clientX, window.innerWidth - 224)),
          y: Math.max(8, Math.min(event.clientY, window.innerHeight - 330)),
        })
      }}
      onToggleSelect={toggleSelect}
      onToggleFeatured={(item) => void runPhotoUpdate(item, { isFeatured: !item.isFeatured })}
      onToggleVisibility={(item) => void runPhotoUpdate(item, { showFlag: !(item.showFlag ?? true) })}
      onDelete={(item) => void requestDelete([item.id])}
    />
  )

  const collectionTitle = featured
    ? t('admin.featured')
    : albumId
      ? albums.find((album) => album.id === albumId)?.name || t('admin.albums')
      : category !== 'all'
        ? category
        : photoType === 'digital'
          ? t('admin.upload_type_digital')
          : photoType === 'film'
            ? t('admin.upload_type_film')
            : t('admin.resource_library_all_photos')

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="relative flex min-h-13 shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={t('common.search')} className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-8 text-xs outline-none focus:border-primary" />
            {searchInput && <button type="button" onClick={() => setSearchInput('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"><X size={13} /></button>}
          </div>
          <PhotoFiltersPopover categories={categories} category={category} photoType={photoType} fileFormats={fileFormats} t={t} onCategoryChange={setCategory} onPhotoTypeChange={setPhotoType} onFileFormatsChange={setFileFormats} />
          <div className="flex h-8 items-center rounded-md border border-border bg-background p-0.5">
            <ViewButton active={viewMode === 'crop'} icon={LayoutGrid} label={t('admin.resource_library_crop_view')} onClick={() => setViewMode('crop')} />
            <ViewButton active={viewMode === 'fit'} icon={Maximize2} label={t('admin.resource_library_fit_view')} onClick={() => setViewMode('fit')} />
            <ViewButton active={viewMode === 'masonry'} icon={Columns3} label={t('admin.resource_library_masonry_view')} onClick={() => setViewMode('masonry')} />
          </div>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortField)} className="h-8 w-28 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary">
            <option value="createdAt">{t('admin.sort_upload_desc').split(':')[0]}</option>
            <option value="takenAt">{t('admin.resource_library_captured_at')}</option>
          </select>
          <button type="button" onClick={() => setSortOrder((current) => current === 'asc' ? 'desc' : 'asc')} className="flex size-8 items-center justify-center rounded-md border border-border hover:bg-muted" title={sortOrder === 'asc' ? t('admin.resource_library_sort_ascending') : t('admin.resource_library_sort_descending')}>{sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}</button>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-3 pb-4">
          <div className="sticky top-0 z-10 flex h-8 items-center justify-between gap-3 bg-background/90 text-[10px] text-muted-foreground backdrop-blur">
            <div className="flex min-w-0 items-center gap-2"><span className="flex size-5 items-center justify-center rounded bg-muted text-foreground"><Images size={11} /></span><span className="truncate font-medium text-foreground">{collectionTitle}</span></div>
            <span className="rounded bg-muted px-2 py-0.5 tabular-nums">{total.toLocaleString()} {t('admin.photos')}</span>
          </div>

          {loading ? (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridSize}px, 1fr))` }}>{Array.from({ length: 15 }, (_, index) => <div key={index} className="aspect-[5/4] animate-pulse rounded-lg bg-muted" />)}</div>
          ) : error ? (
            <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 text-muted-foreground"><p className="text-sm">{error}</p><AdminButton onClick={() => void fetchPhotos(1, false)} adminVariant="outline" size="sm"><RefreshCw size={14} />{t('common.retry')}</AdminButton></div>
          ) : photos.length === 0 ? (
            <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 text-muted-foreground"><span className="flex size-12 items-center justify-center rounded-lg bg-muted"><ImageOff size={20} /></span><p className="text-sm">{t('admin.no_photos')}</p></div>
          ) : viewMode === 'masonry' ? (
            <div className="flex w-full items-start" style={{ gap: MASONRY_COLUMN_GAP }}>
              {masonryColumns.map((columnPhotos, columnIndex) => (
                <div key={columnIndex} className="min-w-0 flex-1">
                  {columnPhotos.map(renderPhotoCard)}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridSize}px, 1fr))` }}>
              {photos.map(renderPhotoCard)}
            </div>
          )}

          <div ref={sentinelRef} className="flex h-12 items-center justify-center text-xs text-muted-foreground">{loadingMore ? <Loader2 className="size-4 animate-spin" /> : hasMore && photos.length > 0 ? t('common.loading') : null}</div>
        </div>

        <div className="flex h-10 shrink-0 items-center justify-between border-t border-border px-3 text-[10px] text-muted-foreground">
          <span>{photos.length.toLocaleString()} / {total.toLocaleString()}</span>
          <div className="flex items-center gap-2"><span>{Math.round(gridSize / 176 * 100)}%</span><input type="range" min="120" max="280" step="8" value={gridSize} onChange={(event) => setGridSize(Number(event.target.value))} className="h-1 w-28 accent-primary" /></div>
        </div>
      </div>

      <LibraryPhotoInfoSidebar photo={selectedPhoto} token={token} cdnDomain={cdnDomain} t={t} notify={notify} onClose={() => setSelectedPhoto(null)} onOpenPreview={setPreviewPhoto} onOpenEditor={(photo) => setEditorState({ photo, tab: 'info' })} onEditStory={(photo) => void openStoryEditor(photo)} onDelete={(id) => void requestDelete([id])} onToggleFeatured={async (photo) => { await runPhotoUpdate(photo, { isFeatured: !photo.isFeatured }) }} onSave={mergePhoto} onUnauthorized={onUnauthorized} />

      {selectedIds.size > 0 && <div className="absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur">
        <button type="button" onClick={() => setSelectedIds(selectedIds.size === photos.length ? new Set() : new Set(photos.map((photo) => photo.id)))} className="rounded p-1.5 hover:bg-muted" title={t('admin.resource_library_select_loaded')}><CheckSquare size={15} /></button>
        <span className="text-xs font-medium text-primary">{selectedIds.size} {t('admin.selected')}</span>
        <span className="h-5 w-px bg-border" />
        <button type="button" disabled={batchSaving} onClick={() => void batchSetVisibility(true)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Eye size={15} /></button>
        <button type="button" disabled={batchSaving} onClick={() => void batchSetVisibility(false)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><EyeOff size={15} /></button>
        <button type="button" disabled={batchSaving} onClick={() => setBatchDialogOpen(true)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><SlidersHorizontal size={15} /></button>
        <button type="button" disabled={batchSaving} onClick={() => void requestDelete(Array.from(selectedIds))} className="rounded p-1.5 text-destructive hover:bg-destructive/10"><Trash2 size={15} /></button>
        <button type="button" onClick={() => setSelectedIds(new Set())} className="rounded p-1.5 text-muted-foreground hover:bg-muted"><X size={15} /></button>
      </div>}

      {contextMenu && <PhotoContextMenu state={contextMenu} selected={selectedIds.has(contextMenu.photo.id)} busy={updatingIds.has(contextMenu.photo.id)} t={t} onClose={() => setContextMenu(null)} onPreview={() => { setPreviewPhoto(contextMenu.photo); setContextMenu(null) }} onEdit={() => { setEditorState({ photo: contextMenu.photo, tab: 'info' }); setContextMenu(null) }} onEditStory={() => void openStoryEditor(contextMenu.photo)} onToggleSelect={() => { toggleSelect(contextMenu.photo.id); setContextMenu(null) }} onToggleFeatured={() => { void runPhotoUpdate(contextMenu.photo, { isFeatured: !contextMenu.photo.isFeatured }); setContextMenu(null) }} onToggleVisibility={() => { void runPhotoUpdate(contextMenu.photo, { showFlag: !(contextMenu.photo.showFlag ?? true) }); setContextMenu(null) }} onDelete={() => void requestDelete([contextMenu.photo.id])} />}

      {previewPhoto && <PhotoPreviewOverlay key={previewPhoto.id} photo={previewPhoto} cdnDomain={cdnDomain} t={t} onClose={() => setPreviewPhoto(null)} onPrevious={() => goPreview(-1)} onNext={() => goPreview(1)} hasPrevious={previewIndex > 0} hasNext={previewIndex >= 0 && previewIndex < photos.length - 1} />}

      <PhotoDetailPanel photo={editorState?.photo || null} isOpen={editorState !== null} categories={categories} allPhotos={photos} cdnDomain={cdnDomain} token={token} onClose={() => setEditorState(null)} onSave={mergePhoto} onUnauthorized={() => onUnauthorized()} t={t} notify={notify} initialTab={editorState?.tab} />

      <BatchPhotoActionDialog isOpen={batchDialogOpen} count={selectedIds.size} isSubmitting={batchSaving} onConfirm={confirmBatchAction} onCancel={() => { if (!batchSaving) setBatchDialogOpen(false) }} t={t} notify={notify} />

      <DeleteConfirmDialog isOpen={deleteRequest !== null} isBulk={deleteRequest?.isBulk ?? false} count={deleteRequest?.ids.length ?? 0} deleteOriginal={deleteOriginal} setDeleteOriginal={setDeleteOriginal} deleteThumbnail={deleteThumbnail} setDeleteThumbnail={setDeleteThumbnail} onConfirm={confirmDelete} onCancel={() => { setDeleteRequest(null); setPhotosWithStories([]) }} t={t} isLoading={deleteDialogLoading} photosWithStories={photosWithStories} />
    </div>
  )
}

function ViewButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof LayoutGrid; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} title={label} aria-label={label} className={cn('flex size-7 items-center justify-center rounded', active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted')}><Icon size={13} /></button>
}

function PhotoContextMenu({ state, selected, busy, t, onClose, onPreview, onEdit, onEditStory, onToggleSelect, onToggleFeatured, onToggleVisibility, onDelete }: {
  state: ContextMenuState
  selected: boolean
  busy: boolean
  t: (key: string) => string
  onClose: () => void
  onPreview: () => void
  onEdit: () => void
  onEditStory: () => void
  onToggleSelect: () => void
  onToggleFeatured: () => void
  onToggleVisibility: () => void
  onDelete: () => void
}) {
  const { photo, x, y } = state
  useEffect(() => {
    const close = () => onClose()
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('pointerdown', close)
    window.addEventListener('blur', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])

  if (typeof document === 'undefined') return null
  const itemClass = 'flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-default disabled:opacity-50'
  return createPortal(<div role="menu" className="fixed z-[135] min-w-56 border border-border bg-popover p-1 shadow-xl" style={{ left: x, top: y }} onPointerDown={(event) => event.stopPropagation()}>
    <p className="max-w-52 truncate px-2.5 py-2 text-xs font-medium">{photo.title || t('admin.resource_library_untitled_photo')}</p>
    <div className="my-1 h-px bg-border" />
    <button type="button" disabled={busy} onClick={onPreview} className={itemClass}><Maximize2 size={14} />{t('admin.photo_preview')}</button>
    <button type="button" disabled={busy} onClick={onEdit} className={itemClass}><Pencil size={14} />{t('admin.edit_photo')}</button>
    <button type="button" disabled={busy} onClick={onEditStory} className={itemClass}><BookOpen size={14} />{t('admin.edit_story')}</button>
    <div className="my-1 h-px bg-border" />
    <button type="button" disabled={busy} onClick={onToggleSelect} className={itemClass}><CheckSquare size={14} />{selected ? t('admin.deselect_photo') : t('admin.select_photos')}</button>
    <button type="button" disabled={busy} onClick={onToggleFeatured} className={itemClass}><Star size={14} fill={photo.isFeatured ? 'currentColor' : 'none'} />{photo.isFeatured ? t('admin.remove_featured') : t('admin.featured')}</button>
    <button type="button" disabled={busy} onClick={onToggleVisibility} className={itemClass}>{photo.showFlag ?? true ? <EyeOff size={14} /> : <Eye size={14} />}{t(photo.showFlag ?? true ? 'admin.hide_in_gallery' : 'admin.show_in_gallery')}</button>
    <div className="my-1 h-px bg-border" />
    <button type="button" disabled={busy} onClick={onDelete} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2 size={14} />{t('common.delete')}</button>
  </div>, document.body)
}
