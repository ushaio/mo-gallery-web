'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Check,
  ChevronLeft,
  EyeOff,
  FolderOpen,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  MapPin,
  Plus,
  Save,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react'
import {
  addPhotosToAlbum,
  ApiUnauthorizedError,
  createAlbum,
  deleteAlbum,
  getAdminAlbum,
  getAdminAlbums,
  removePhotoFromAlbum,
  resolveAssetUrl,
  setAlbumCover,
  updateAlbum,
} from '@/lib/api'
import type { AlbumDto, PhotoDto } from '@/lib/api/types'
import { AdminButton } from '@/components/admin/AdminButton'
import { CustomInput } from '@/components/ui/CustomInput'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'

type AlbumTab = 'overview' | 'photos'

interface LibraryAlbumsWorkspaceProps {
  token: string | null
  photos: PhotoDto[]
  cdnDomain?: string
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  onUnauthorized: () => void
  onPreview: (photo: PhotoDto) => void
  onAlbumsChanged: () => Promise<void>
  createSignal?: number
  openRequest?: { albumId: string | null; tab: AlbumTab; requestId: number }
  onOpenRequestHandled?: (requestId: number) => void
}

function draftAlbum(sortOrder: number): AlbumDto {
  const now = new Date().toISOString()
  return {
    id: '',
    name: '',
    description: '',
    coverUrl: '',
    location: '',
    isPublished: false,
    sortOrder,
    photoCount: 0,
    photos: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function LibraryAlbumsWorkspace({
  token,
  photos,
  cdnDomain,
  t,
  notify,
  onUnauthorized,
  onPreview,
  onAlbumsChanged,
  createSignal = 0,
  openRequest,
  onOpenRequestHandled,
}: LibraryAlbumsWorkspaceProps) {
  const [albums, setAlbums] = useState<AlbumDto[]>([])
  const [loading, setLoading] = useState(true)
  const [currentAlbum, setCurrentAlbum] = useState<AlbumDto | null>(null)
  const [activeTab, setActiveTab] = useState<AlbumTab>('overview')
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [showPhotoSelector, setShowPhotoSelector] = useState(false)
  const [photoSearch, setPhotoSearch] = useState('')
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<AlbumDto | null>(null)
  const requestIdRef = useRef(0)
  const handledCreateSignalRef = useRef(0)
  const handledOpenRequestRef = useRef(0)

  const loadAlbums = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      setAlbums(await getAdminAlbums(token))
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) onUnauthorized()
      else notify(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      setLoading(false)
    }
  }, [notify, onUnauthorized, t, token])

  useEffect(() => { void loadAlbums() }, [loadAlbums])

  useEffect(() => {
    if (!createSignal || handledCreateSignalRef.current === createSignal) return
    handledCreateSignalRef.current = createSignal
    requestIdRef.current += 1
    setCurrentAlbum(draftAlbum(albums.length))
    setActiveTab('overview')
    setShowPhotoSelector(false)
    setSelectedPhotoIds(new Set())
  }, [albums.length, createSignal])

  const sortedAlbums = useMemo(() => (
    [...albums]
      .filter((album) => {
        const query = search.trim().toLowerCase()
        return !query || [album.name, album.location, album.description].some((value) => value?.toLowerCase().includes(query))
      })
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
  ), [albums, search])

  const availablePhotos = useMemo(() => {
    const usedIds = new Set(currentAlbum?.photos.map((photo) => photo.id) ?? [])
    const query = photoSearch.trim().toLowerCase()
    return photos.filter((photo) => {
      if (usedIds.has(photo.id)) return false
      return !query || photo.title.toLowerCase().includes(query) || photo.category.toLowerCase().includes(query)
    })
  }, [currentAlbum?.photos, photoSearch, photos])

  const openAlbum = useCallback(async (album: AlbumDto, tab: AlbumTab = 'photos') => {
    if (!token) return
    const requestId = ++requestIdRef.current
    setCurrentAlbum(album)
    setActiveTab(tab)
    setLoadingDetail(true)
    setShowPhotoSelector(false)
    setSelectedPhotoIds(new Set())
    try {
      const full = await getAdminAlbum(token, album.id)
      if (requestId !== requestIdRef.current) return
      setCurrentAlbum(full)
      setAlbums((current) => current.map((item) => item.id === full.id ? full : item))
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) onUnauthorized()
      else notify(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      if (requestId === requestIdRef.current) setLoadingDetail(false)
    }
  }, [notify, onUnauthorized, t, token])

  const closeDetail = useCallback(() => {
    requestIdRef.current += 1
    setCurrentAlbum(null)
    setShowPhotoSelector(false)
    setSelectedPhotoIds(new Set())
  }, [])

  useEffect(() => {
    if (!openRequest || handledOpenRequestRef.current === openRequest.requestId) return

    if (!openRequest.albumId) {
      handledOpenRequestRef.current = openRequest.requestId
      closeDetail()
      void loadAlbums()
      onOpenRequestHandled?.(openRequest.requestId)
      return
    }

    const album = albums.find((item) => item.id === openRequest.albumId)
    if (!album) return

    handledOpenRequestRef.current = openRequest.requestId
    void openAlbum(album, openRequest.tab)
    onOpenRequestHandled?.(openRequest.requestId)
  }, [albums, closeDetail, loadAlbums, onOpenRequestHandled, openAlbum, openRequest])

  const saveAlbum = async () => {
    if (!token || !currentAlbum) return
    if (!currentAlbum.name.trim()) {
      notify(t('admin.album_name_required'), 'error')
      return
    }
    setSaving(true)
    try {
      const data = {
        name: currentAlbum.name.trim(),
        description: currentAlbum.description?.trim() || undefined,
        coverUrl: currentAlbum.coverUrl || undefined,
        location: currentAlbum.location?.trim() || null,
        isPublished: currentAlbum.isPublished,
        sortOrder: currentAlbum.sortOrder,
      }
      const saved = currentAlbum.id
        ? await updateAlbum(token, currentAlbum.id, data)
        : await createAlbum(token, data)
      const full = await getAdminAlbum(token, saved.id)
      setCurrentAlbum(full)
      setActiveTab('photos')
      setAlbums((current) => current.some((item) => item.id === full.id)
        ? current.map((item) => item.id === full.id ? full : item)
        : [...current, full])
      notify(t(currentAlbum.id ? 'admin.album_updated' : 'admin.album_created'), 'success')
      await onAlbumsChanged()
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) onUnauthorized()
      else notify(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const updateCurrentAlbum = (patch: Partial<AlbumDto>) => {
    setCurrentAlbum((current) => current ? { ...current, ...patch } : current)
  }

  const addSelectedPhotos = async () => {
    if (!token || !currentAlbum?.id || selectedPhotoIds.size === 0) return
    setSaving(true)
    try {
      const updated = await addPhotosToAlbum(token, currentAlbum.id, Array.from(selectedPhotoIds))
      setCurrentAlbum(updated)
      setAlbums((current) => current.map((item) => item.id === updated.id ? updated : item))
      setSelectedPhotoIds(new Set())
      setPhotoSearch('')
      setShowPhotoSelector(false)
      notify(t('admin.photos_added'), 'success')
      await onAlbumsChanged()
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) onUnauthorized()
      else notify(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const removePhoto = async (photoId: string) => {
    if (!token || !currentAlbum?.id) return
    try {
      const updated = await removePhotoFromAlbum(token, currentAlbum.id, photoId)
      setCurrentAlbum(updated)
      setAlbums((current) => current.map((item) => item.id === updated.id ? updated : item))
      notify(t('admin.photo_removed'), 'success')
      await onAlbumsChanged()
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) onUnauthorized()
      else notify(error instanceof Error ? error.message : t('common.error'), 'error')
    }
  }

  const chooseCover = async (photoId: string) => {
    if (!token || !currentAlbum?.id) return
    try {
      const updated = await setAlbumCover(token, currentAlbum.id, photoId)
      setCurrentAlbum(updated)
      setAlbums((current) => current.map((item) => item.id === updated.id ? updated : item))
      notify(t('admin.cover_set'), 'success')
      await onAlbumsChanged()
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) onUnauthorized()
      else notify(error instanceof Error ? error.message : t('common.error'), 'error')
    }
  }

  const confirmDelete = async () => {
    if (!token || !pendingDelete) return
    try {
      await deleteAlbum(token, pendingDelete.id)
      setAlbums((current) => current.filter((album) => album.id !== pendingDelete.id))
      if (currentAlbum?.id === pendingDelete.id) closeDetail()
      setPendingDelete(null)
      notify(t('common.deleted'), 'success')
      await onAlbumsChanged()
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) onUnauthorized()
      else notify(error instanceof Error ? error.message : t('common.error'), 'error')
    }
  }

  if (!currentAlbum) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <WorkspaceToolbar
          count={sortedAlbums.length}
          label={t('admin.albums')}
          search={search}
          onSearchChange={setSearch}
          onRefresh={() => void loadAlbums()}
          refreshing={loading}
          actionLabel={t('admin.new_album')}
          searchPlaceholder={t('common.search')}
          refreshLabel={t('common.refresh')}
          onAction={() => {
            setCurrentAlbum(draftAlbum(albums.length))
            setActiveTab('overview')
          }}
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading ? <AlbumSkeleton /> : sortedAlbums.length === 0 ? (
            <EmptyState icon={FolderOpen} label={search ? t('admin.no_albums_match_filters') : t('admin.no_albums')} actionLabel={t('admin.create_first_album')} onAction={() => setCurrentAlbum(draftAlbum(albums.length))} />
          ) : (
            <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {sortedAlbums.map((album) => {
                const cover = album.coverUrl || album.photos[0]?.thumbnailUrl || album.photos[0]?.url
                return (
                  <button key={album.id} type="button" onClick={() => void openAlbum(album)} className="group min-w-0 text-left">
                    <div className="relative pt-3">
                      <span className="absolute left-3 top-0 h-5 w-20 rounded-t-md border border-b-0 border-border bg-muted" />
                      <span className="relative block aspect-[4/3] overflow-hidden rounded-md rounded-tl-sm border border-border bg-muted shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                        {cover ? <img src={resolveAssetUrl(cover, cdnDomain)} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-muted-foreground"><FolderOpen className="h-8 w-8" /></span>}
                        <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/50 to-transparent" />
                        <span className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2 text-white"><span className="truncate text-xs font-medium">{album.name}</span><span className="rounded bg-black/45 px-1.5 py-0.5 text-[9px] tabular-nums">{album.photoCount}</span></span>
                        {!album.isPublished && <span className="absolute right-2 top-2 rounded bg-black/50 p-1 text-white"><EyeOff className="h-3 w-3" /></span>}
                      </span>
                    </div>
                    <span className="mt-2 block min-w-0 px-1"><span className="block truncate text-xs font-medium">{album.name}</span><span className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground">{album.location ? <><MapPin className="h-3 w-3 shrink-0" />{album.location}</> : `${album.photoCount} ${t('admin.photos')}`}</span></span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <SimpleDeleteDialog isOpen={pendingDelete !== null} title={t('admin.delete_album')} message={pendingDelete?.name || ''} onConfirm={confirmDelete} onCancel={() => setPendingDelete(null)} t={t} />
      </div>
    )
  }

  const albumPhotos = currentAlbum.photos ?? []
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-5">
        <div className="flex min-w-0 items-center gap-2">
          <AdminButton onClick={closeDetail} adminVariant="icon" size="xs" className="p-1.5" title={t('admin.back_list')}><ChevronLeft className="h-4 w-4" /></AdminButton>
          <div className="min-w-0"><h2 className="truncate text-sm font-semibold">{currentAlbum.name || t('admin.new_album')}</h2><p className="text-[11px] text-muted-foreground">{currentAlbum.photoCount} {t('admin.photos')}</p></div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {currentAlbum.id && <AdminButton onClick={() => setPendingDelete(currentAlbum)} adminVariant="iconDestructive" size="sm" className="p-2" title={t('admin.delete_album')}><Trash2 className="h-3.5 w-3.5" /></AdminButton>}
          {activeTab === 'overview' ? <AdminButton onClick={() => void saveAlbum()} disabled={saving} adminVariant="primary" size="sm" className="gap-1.5"><Save className="h-3.5 w-3.5" />{saving ? t('common.loading') : t('common.save')}</AdminButton> : currentAlbum.id ? <AdminButton onClick={() => setShowPhotoSelector(true)} adminVariant="primary" size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" />{t('admin.add_photos')}</AdminButton> : null}
        </div>
      </header>
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-3">
        <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={Settings} label={t('admin.overview')} />
        {currentAlbum.id && <TabButton active={activeTab === 'photos'} onClick={() => setActiveTab('photos')} icon={LayoutGrid} label={`${t('admin.photos')} (${albumPhotos.length})`} />}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {activeTab === 'overview' ? (
          <div className="max-w-2xl space-y-5">
            <Field label={t('admin.album_name')}><CustomInput variant="config" value={currentAlbum.name} onChange={(event) => updateCurrentAlbum({ name: event.target.value })} /></Field>
            <Field label={t('admin.album_location')}><CustomInput variant="config" value={currentAlbum.location || ''} onChange={(event) => updateCurrentAlbum({ location: event.target.value })} /></Field>
            <Field label={t('admin.description')}><textarea value={currentAlbum.description || ''} onChange={(event) => updateCurrentAlbum({ description: event.target.value })} className="h-28 w-full resize-none border border-border bg-background p-3 text-sm outline-none focus:border-primary" /></Field>
            <label className="flex items-center gap-3 border border-border bg-muted/30 p-3 text-sm"><input type="checkbox" checked={currentAlbum.isPublished} onChange={(event) => updateCurrentAlbum({ isPublished: event.target.checked })} className="size-4 accent-primary" />{currentAlbum.isPublished ? t('admin.published') : t('admin.draft')}</label>
          </div>
        ) : loadingDetail ? <LoadingState /> : showPhotoSelector ? (
          <PhotoPicker photos={availablePhotos} selectedIds={selectedPhotoIds} search={photoSearch} saving={saving} t={t} cdnDomain={cdnDomain} onSearchChange={setPhotoSearch} onToggle={(id) => setSelectedPhotoIds((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next })} onConfirm={() => void addSelectedPhotos()} onClose={() => { setShowPhotoSelector(false); setSelectedPhotoIds(new Set()); setPhotoSearch('') }} />
        ) : albumPhotos.length === 0 ? <EmptyState icon={ImageIcon} label={t('admin.album_empty')} actionLabel={t('admin.add_photos')} onAction={() => setShowPhotoSelector(true)} /> : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-8">{albumPhotos.map((photo) => {
            const isCover = Boolean(currentAlbum.coverUrl && [photo.url, photo.thumbnailUrl].filter(Boolean).some((url) => resolveAssetUrl(url!, cdnDomain) === resolveAssetUrl(currentAlbum.coverUrl!, cdnDomain)))
            return <div key={photo.id} className="group relative aspect-square cursor-pointer overflow-hidden bg-muted" onClick={() => onPreview(photo)}><img src={resolveAssetUrl(photo.thumbnailUrl || photo.url, cdnDomain)} alt={photo.title} className="h-full w-full object-cover" />{isCover && <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[8px] text-primary-foreground">{t('admin.cover')}</span>}<div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">{!isCover && <AdminButton onClick={(event) => { event.stopPropagation(); void chooseCover(photo.id) }} adminVariant="iconOnDark" size="xs" title={t('admin.set_cover')}><Check className="h-3.5 w-3.5" /></AdminButton>}<AdminButton onClick={(event) => { event.stopPropagation(); void removePhoto(photo.id) }} adminVariant="iconOnDarkDanger" size="xs" title={t('admin.remove')}><Trash2 className="h-3.5 w-3.5" /></AdminButton></div></div>
          })}</div>
        )}
      </div>
      <SimpleDeleteDialog isOpen={pendingDelete !== null} title={t('admin.delete_album')} message={pendingDelete?.name || ''} onConfirm={confirmDelete} onCancel={() => setPendingDelete(null)} t={t} />
    </div>
  )
}

function WorkspaceToolbar({ count, label, search, onSearchChange, onRefresh, refreshing, actionLabel, searchPlaceholder, refreshLabel, onAction }: { count: number; label: string; search: string; onSearchChange: (value: string) => void; onRefresh: () => void; refreshing: boolean; actionLabel: string; searchPlaceholder: string; refreshLabel: string; onAction: () => void }) {
  return <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-5 py-3"><span className="text-sm font-medium text-muted-foreground">{count} {label}</span><div className="relative min-w-[200px] max-w-md flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={searchPlaceholder} className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-8 text-sm outline-none focus:border-primary" />{search && <button type="button" onClick={() => onSearchChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-4 w-4" /></button>}</div><AdminButton onClick={onRefresh} disabled={refreshing} adminVariant="icon" size="sm" className="p-2" title={refreshLabel}>{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</AdminButton><AdminButton onClick={onAction} adminVariant="primary" size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" />{actionLabel}</AdminButton></div>
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Settings; label: string }) {
  return <button type="button" onClick={onClick} className={`flex h-full items-center gap-1.5 border-b-2 px-3 text-xs font-medium ${active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><Icon className="h-3.5 w-3.5" />{label}</button>
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-2 block text-xs text-muted-foreground">{label}</span>{children}</label> }
function LoadingState() { return <div className="flex h-full min-h-48 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> }
function AlbumSkeleton() { return <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-[4/3] animate-pulse rounded-md bg-muted" />)}</div> }
function EmptyState({ icon: Icon, label, actionLabel, onAction }: { icon: typeof FolderOpen; label: string; actionLabel: string; onAction: () => void }) { return <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-muted-foreground"><Icon className="h-9 w-9" /><p className="text-sm">{label}</p><AdminButton onClick={onAction} adminVariant="outline" size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" />{actionLabel}</AdminButton></div> }
function PhotoPicker({ photos, selectedIds, search, saving, t, cdnDomain, onSearchChange, onToggle, onConfirm, onClose }: { photos: PhotoDto[]; selectedIds: Set<string>; search: string; saving: boolean; t: (key: string) => string; cdnDomain?: string; onSearchChange: (value: string) => void; onToggle: (id: string) => void; onConfirm: () => void; onClose: () => void }) { return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-muted/30 p-3"><div className="flex items-center gap-3"><AdminButton onClick={onClose} adminVariant="icon" size="xs" className="p-1.5"><X className="h-4 w-4" /></AdminButton><span className="text-sm">{selectedIds.size} {t('admin.selected')}</span><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={t('common.search')} className="h-8 w-44 border border-border bg-background px-2 text-sm outline-none focus:border-primary" /></div><AdminButton onClick={onConfirm} disabled={selectedIds.size === 0 || saving} adminVariant="primary" size="sm" className="gap-1.5"><Check className="h-3.5 w-3.5" />{t('admin.add')}</AdminButton></div>{photos.length === 0 ? <EmptyState icon={ImageIcon} label={t('admin.no_photos_available')} actionLabel={t('common.close')} onAction={onClose} /> : <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-8">{photos.map((photo) => <button key={photo.id} type="button" onClick={() => onToggle(photo.id)} className={`relative aspect-square overflow-hidden ${selectedIds.has(photo.id) ? 'ring-2 ring-primary' : ''}`}><img src={resolveAssetUrl(photo.thumbnailUrl || photo.url, cdnDomain)} alt={photo.title} className="h-full w-full object-cover" />{selectedIds.has(photo.id) && <span className="absolute inset-0 flex items-center justify-center bg-primary/20"><Check className="h-5 w-5 text-primary" /></span>}</button>)}</div>}</div> }
