import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { toast } from 'sonner'
import {
  Check,
  ChevronLeft,
  Eye,
  EyeOff,
  Image as ImageIcon,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react'

import { CardGridSkeleton, ListSkeleton } from '@/components/admin/Skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { resolveAssetUrl } from '@/lib/api'
import { usePreferences } from '@/store/preferences'
import { t, type Locale } from '@/lib/i18n'
import type { Album, Photo } from '@/types'

type DetailTab = 'overview' | 'photos'

interface AlbumPayload {
  name: string
  description?: string
  coverUrl?: string
  location?: string
  isPublished: boolean
  sortOrder: number
}

interface AlbumAppAPI {
  GetAlbums(): Promise<Album[]>
  GetAlbum(id: string): Promise<Album>
  CreateAlbum(params: AlbumPayload): Promise<Album>
  UpdateAlbum(id: string, params: Partial<AlbumPayload>): Promise<Album>
  DeleteAlbum(id: string): Promise<void>
  AddPhotosToAlbum(id: string, photoIds: string[]): Promise<Album>
  RemovePhotoFromAlbum(albumId: string, photoId: string): Promise<Album>
  SetAlbumCover(albumId: string, photoId: string): Promise<Album>
  GetAllPhotos(): Promise<Photo[]>
}

function appApi(): AlbumAppAPI {
  const bridge = (window as unknown as { go?: { main?: { App?: AlbumAppAPI } } }).go?.main?.App
  if (!bridge) throw new Error('Wails API is not available')
  return bridge
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function inputStyle(): CSSProperties {
  return {
    borderColor: 'var(--border)',
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
  }
}

function normalizeAlbum(album: Album): Album {
  const photos = album.photos ?? []
  return {
    ...album,
    description: album.description ?? '',
    coverUrl: album.coverUrl ?? '',
    location: album.location ?? '',
    photos,
    photoCount: album.photoCount ?? photos.length,
  }
}

function newDraftAlbum(sortOrder: number): Album {
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

function isCoverPhoto(album: Album, photo: Photo) {
  if (!album.coverUrl) return false
  const coverUrl = resolveAssetUrl(album.coverUrl)
  return [photo.url, photo.thumbnailUrl]
    .filter((url): url is string => Boolean(url))
    .some(url => resolveAssetUrl(url) === coverUrl)
}

interface AlbumsPageProps {
  initialAlbumId?: string | null
  initialTab?: DetailTab
  createMode?: boolean
  onBackToBrowser?: () => void
  onAlbumsChanged?: () => void
}

export function AlbumsPage({
  initialAlbumId = null,
  initialTab = 'photos',
  createMode = false,
  onBackToBrowser,
  onAlbumsChanged,
}: AlbumsPageProps = {}) {
  const { language } = usePreferences()
  const [albums, setAlbums] = useState<Album[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingCurrentAlbum, setLoadingCurrentAlbum] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentAlbum, setCurrentAlbum] = useState<Album | null>(null)
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')
  const [showPhotoSelector, setShowPhotoSelector] = useState(false)
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set())
  const [photoSelectorSearch, setPhotoSelectorSearch] = useState('')
  const currentAlbumRequestIdRef = useRef(0)
  const handledExternalIntentRef = useRef('')

  const fetchAlbums = useCallback(async () => {
    setLoading(true)
    try {
      const result = await appApi().GetAlbums()
      setAlbums((result ?? []).map(normalizeAlbum))
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    } finally {
      setLoading(false)
    }
  }, [language])

  const fetchPhotos = useCallback(async () => {
    try {
      setPhotos(await appApi().GetAllPhotos())
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    }
  }, [language])

  useEffect(() => {
    void fetchAlbums()
    void fetchPhotos()
  }, [fetchAlbums, fetchPhotos])

  const openAlbum = useCallback(async (album: Album, tab: DetailTab = 'photos') => {
    const requestId = ++currentAlbumRequestIdRef.current
    setCurrentAlbum(normalizeAlbum(album))
    setActiveTab(tab)
    setShowPhotoSelector(false)
    setSelectedPhotoIds(new Set())
    setPhotoSelectorSearch('')
    setLoadingCurrentAlbum(true)

    try {
      const fullAlbum = normalizeAlbum(await appApi().GetAlbum(album.id))
      if (requestId !== currentAlbumRequestIdRef.current) return
      setCurrentAlbum(fullAlbum)
      setAlbums(current => current.map(item => item.id === fullAlbum.id ? fullAlbum : item))
    } catch (error) {
      if (requestId !== currentAlbumRequestIdRef.current) return
      toast.error(errorMessage(error, t('common.error', language)))
    } finally {
      if (requestId === currentAlbumRequestIdRef.current) setLoadingCurrentAlbum(false)
    }
  }, [language])

  const handleCreateAlbum = useCallback(() => {
    currentAlbumRequestIdRef.current += 1
    setCurrentAlbum(newDraftAlbum(albums.length))
    setActiveTab('overview')
    setShowPhotoSelector(false)
    setSelectedPhotoIds(new Set())
    setPhotoSelectorSearch('')
    setLoadingCurrentAlbum(false)
  }, [albums.length])

  useEffect(() => {
    const intentKey = createMode ? 'create' : initialAlbumId ? `${initialAlbumId}:${initialTab}` : ''
    if (!intentKey) {
      handledExternalIntentRef.current = ''
      return
    }
    if (loading || handledExternalIntentRef.current === intentKey) return

    handledExternalIntentRef.current = intentKey
    if (createMode) {
      handleCreateAlbum()
      return
    }

    const target = albums.find(album => album.id === initialAlbumId)
    if (target) void openAlbum(target, initialTab)
  }, [albums, createMode, handleCreateAlbum, initialAlbumId, initialTab, loading, openAlbum])

  const handleBackToList = useCallback(() => {
    const isUnsavedDraft = !currentAlbum?.id && Boolean(
      currentAlbum?.name.trim() || currentAlbum?.description?.trim() || currentAlbum?.location?.trim(),
    )
    if (isUnsavedDraft && !confirm(t('admin.discard_album_confirm', language))) return
    currentAlbumRequestIdRef.current += 1
    setCurrentAlbum(null)
    if (onBackToBrowser) onBackToBrowser()
    else void fetchAlbums()
  }, [currentAlbum, fetchAlbums, language, onBackToBrowser])

  const handleSave = useCallback(async () => {
    if (!currentAlbum) return
    const name = currentAlbum.name.trim()
    if (!name) {
      toast.error(t('admin.album_name_required', language))
      return
    }

    setSaving(true)
    try {
      const payload: AlbumPayload = {
        name,
        description: currentAlbum.description?.trim() || undefined,
        coverUrl: currentAlbum.coverUrl || undefined,
        location: currentAlbum.location?.trim() || '',
        isPublished: currentAlbum.isPublished,
        sortOrder: currentAlbum.sortOrder,
      }
      const wasExisting = Boolean(currentAlbum.id)
      const saved = wasExisting
        ? await appApi().UpdateAlbum(currentAlbum.id, payload)
        : await appApi().CreateAlbum(payload)
      const fullAlbum = normalizeAlbum(await appApi().GetAlbum(saved.id))

      setCurrentAlbum(fullAlbum)
      setActiveTab('photos')
      toast.success(t(wasExisting ? 'admin.album_updated' : 'admin.album_created', language))
      await fetchAlbums()
      onAlbumsChanged?.()
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    } finally {
      setSaving(false)
    }
  }, [currentAlbum, fetchAlbums, language, onAlbumsChanged])

  const handleDelete = useCallback(async (album: Album) => {
    if (!confirm(t('admin.album_delete_confirm', language))) return
    try {
      await appApi().DeleteAlbum(album.id)
      if (currentAlbum?.id === album.id) setCurrentAlbum(null)
      toast.success(t('common.deleted', language))
      await fetchAlbums()
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    }
  }, [currentAlbum?.id, fetchAlbums, language])

  const togglePublished = useCallback(async (album: Album) => {
    try {
      const updated = normalizeAlbum(await appApi().UpdateAlbum(album.id, { isPublished: !album.isPublished }))
      setAlbums(current => current.map(item => item.id === updated.id ? updated : item))
      if (currentAlbum?.id === updated.id) {
        setCurrentAlbum(current => current ? { ...current, isPublished: updated.isPublished } : current)
      }
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    }
  }, [currentAlbum?.id, language])

  const handleAddPhotos = useCallback(async () => {
    if (!currentAlbum?.id || selectedPhotoIds.size === 0) return
    setSaving(true)
    try {
      const updated = normalizeAlbum(await appApi().AddPhotosToAlbum(currentAlbum.id, Array.from(selectedPhotoIds)))
      setCurrentAlbum(updated)
      setSelectedPhotoIds(new Set())
      setShowPhotoSelector(false)
      setPhotoSelectorSearch('')
      setAlbums(current => current.map(item => item.id === updated.id ? updated : item))
      toast.success(t('admin.photos_added', language))
      onAlbumsChanged?.()
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    } finally {
      setSaving(false)
    }
  }, [currentAlbum?.id, language, onAlbumsChanged, selectedPhotoIds])

  const handleRemovePhoto = useCallback(async (photoId: string) => {
    if (!currentAlbum?.id) return
    try {
      const updated = normalizeAlbum(await appApi().RemovePhotoFromAlbum(currentAlbum.id, photoId))
      setCurrentAlbum(updated)
      setAlbums(current => current.map(item => item.id === updated.id ? updated : item))
      toast.success(t('admin.photo_removed', language))
      onAlbumsChanged?.()
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    }
  }, [currentAlbum?.id, language, onAlbumsChanged])

  const handleSetCover = useCallback(async (photoId: string) => {
    if (!currentAlbum?.id) return
    try {
      const updated = normalizeAlbum(await appApi().SetAlbumCover(currentAlbum.id, photoId))
      setCurrentAlbum(updated)
      setAlbums(current => current.map(item => item.id === updated.id ? updated : item))
      toast.success(t('admin.cover_set', language))
      onAlbumsChanged?.()
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    }
  }, [currentAlbum?.id, language, onAlbumsChanged])

  const availablePhotos = useMemo(() => {
    const currentPhotoIds = new Set(currentAlbum?.photos?.map(photo => photo.id) ?? [])
    const query = photoSelectorSearch.trim().toLowerCase()
    return photos.filter(photo => {
      if (currentPhotoIds.has(photo.id)) return false
      if (!query) return true
      return [photo.title, photo.category].some(value => value?.toLowerCase().includes(query))
    })
  }, [currentAlbum?.photos, photoSelectorSearch, photos])

  if (currentAlbum) {
    return (
      <>
        <PageHeader
          title={currentAlbum.name || t('admin.new_album', language)}
          description={`${currentAlbum.photoCount} ${t('admin.photos', language)}`}
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={handleBackToList}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border"
                style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
              >
                <ChevronLeft size={14} /> {t('admin.back_list', language)}
              </button>
              {activeTab === 'overview' && (
                <button
                  onClick={handleSave}
                  disabled={saving || !currentAlbum.name.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md disabled:opacity-50"
                  style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
                >
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  {t('common.save', language)}
                </button>
              )}
            </div>
          }
        />

        <div className="flex-1 overflow-auto p-6">
          <div className="flex gap-4 mb-6 border-b" style={{ borderColor: 'var(--border)' }}>
            {(['overview', 'photos'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="pb-2 text-sm transition-colors relative"
                style={{ color: activeTab === tab ? 'var(--foreground)' : 'var(--muted-foreground)' }}
              >
                {tab === 'overview' ? t('admin.overview', language) : t('admin.manage_photos', language)}
                {activeTab === tab && <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: 'var(--primary)' }} />}
              </button>
            ))}
          </div>

          {activeTab === 'overview' ? (
            <AlbumOverview album={currentAlbum} onChange={setCurrentAlbum} language={language} autoFocus={!currentAlbum.id} />
          ) : !currentAlbum.id ? (
            <div className="flex flex-col items-center justify-center h-56 border border-dashed rounded-lg" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
              <ImageIcon size={32} className="mb-3 opacity-40" />
              <p className="text-sm mb-4">{t('admin.save_first_hint', language)}</p>
              <button onClick={handleSave} disabled={saving || !currentAlbum.name.trim()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md disabled:opacity-50" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                <Save size={14} /> {t('common.save', language)}
              </button>
            </div>
          ) : loadingCurrentAlbum ? (
            <ListSkeleton count={4} />
          ) : showPhotoSelector ? (
            <AlbumPhotoSelector
              photos={availablePhotos}
              selectedIds={selectedPhotoIds}
              search={photoSelectorSearch}
              saving={saving}
              onSearchChange={setPhotoSelectorSearch}
              onToggle={photoId => setSelectedPhotoIds(current => {
                const next = new Set(current)
                if (next.has(photoId)) next.delete(photoId)
                else next.add(photoId)
                return next
              })}
              onConfirm={handleAddPhotos}
              onClose={() => {
                setShowPhotoSelector(false)
                setSelectedPhotoIds(new Set())
                setPhotoSelectorSearch('')
              }}
              language={language}
            />
          ) : (
            <AlbumPhotos
              album={currentAlbum}
              onRemovePhoto={handleRemovePhoto}
              onSetCover={handleSetCover}
              onShowSelector={() => setShowPhotoSelector(true)}
              language={language}
            />
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={t('admin.page_albums', language)}
        description={`${albums.length} albums`}
        actions={
          <button
            onClick={handleCreateAlbum}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <Plus size={14} /> {t('admin.create_album', language)}
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <CardGridSkeleton count={8} cols={4} />
        ) : albums.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border border-dashed rounded-lg" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
            <ImageIcon size={32} className="mb-3 opacity-40" />
            <p className="text-sm mb-4">{t('admin.no_albums', language)}</p>
            <button onClick={handleCreateAlbum} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border" style={{ borderColor: 'var(--border)' }}>
              <Plus size={14} /> {t('admin.create_first_album', language)}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {albums.map(album => (
              <div
                key={album.id}
                role="button"
                tabIndex={0}
                onClick={() => void openAlbum(album)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    void openAlbum(album)
                  }
                }}
                className="rounded-lg border overflow-hidden group cursor-pointer transition-opacity hover:opacity-90"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
              >
                <div className="aspect-video relative"
                  style={{ backgroundColor: 'var(--muted)' }}>
                  {album.coverUrl ? (
                    <img src={resolveAssetUrl(album.coverUrl)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full" style={{ color: 'var(--muted-foreground)' }}><ImageIcon size={28} /></div>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-medium truncate">{album.name}</h3>
                    <span className="text-xs px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: album.isPublished ? 'var(--accent)' : 'var(--muted)',
                        color: album.isPublished ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                      }}>
                      {album.isPublished ? t('admin.albums_status_published', language) : t('admin.albums_status_draft', language)}
                    </span>
                  </div>
                  {album.location && (
                    <p className="mb-1 flex items-center gap-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      <MapPin size={12} className="shrink-0" />
                      <span className="truncate">{album.location}</span>
                    </p>
                  )}
                  <p className="text-xs mb-2" style={{ color: 'var(--muted-foreground)' }}>
                    {album.photoCount} {t('admin.photos', language)}
                  </p>
                  <div className="flex items-center gap-1">
                    <button onClick={event => { event.stopPropagation(); void togglePublished(album) }}
                      className="p-1 rounded hover:opacity-80" style={{ color: 'var(--muted-foreground)' }}>
                      {album.isPublished ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button onClick={event => { event.stopPropagation(); void handleDelete(album) }}
                      className="p-1 rounded hover:opacity-80" style={{ color: 'var(--destructive)' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function AlbumOverview({ album, onChange, language, autoFocus }: {
  album: Album
  onChange: (album: Album) => void
  language: Locale
  autoFocus?: boolean
}) {
  const [nameTouched, setNameTouched] = useState(false)
  const update = (patch: Partial<Album>) => onChange({ ...album, ...patch })
  const nameEmpty = !album.name.trim()

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-5">
        <section className="rounded-lg border p-5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
          <h3 className="mb-4 text-sm font-medium">{t('admin.album_basic_info', language)}</h3>
          <div className="space-y-4">
            <Field label={t('admin.album_name', language)} required>
              <input
                autoFocus={autoFocus}
                value={album.name}
                onChange={event => update({ name: event.target.value })}
                onBlur={() => setNameTouched(true)}
                placeholder={t('admin.album_name_placeholder', language)}
                maxLength={60}
                className="w-full px-3 py-2 text-sm rounded-lg border outline-none transition-colors"
                style={{ ...inputStyle(), borderColor: nameTouched && nameEmpty ? 'var(--destructive)' : 'var(--border)' }}
              />
              {nameTouched && nameEmpty && (
                <p className="mt-1.5 text-xs" style={{ color: 'var(--destructive)' }}>
                  {t('admin.album_name_required', language)}
                </p>
              )}
            </Field>
            <Field label={t('admin.album_location', language)}>
              <div className="relative">
                <MapPin size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
                <input
                  value={album.location ?? ''}
                  onChange={event => update({ location: event.target.value })}
                  placeholder={t('admin.album_location_placeholder', language)}
                  maxLength={80}
                  className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none"
                  style={inputStyle()}
                />
              </div>
            </Field>
            <Field label={t('admin.description', language)}>
              <textarea
                value={album.description ?? ''}
                onChange={event => update({ description: event.target.value })}
                placeholder={t('admin.description_placeholder', language)}
                rows={4}
                maxLength={300}
                className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none"
                style={inputStyle()}
              />
              <p className="mt-1 text-right text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                {(album.description ?? '').length}/300
              </p>
            </Field>
          </div>
        </section>

        <section className="rounded-lg border p-5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
          <h3 className="mb-4 text-sm font-medium">{t('admin.album_display_settings', language)}</h3>
          <div className="space-y-4">
            <Field label={t('admin.sort_order', language)}>
              <input
                type="number"
                value={album.sortOrder}
                onChange={event => update({ sortOrder: Number(event.target.value) || 0 })}
                className="w-40 px-3 py-2 text-sm rounded-lg border outline-none"
                style={inputStyle()}
              />
              <p className="mt-1.5 text-xs" style={{ color: 'var(--muted-foreground)' }}>{t('admin.sort_order_hint', language)}</p>
            </Field>
            <label className="flex items-start gap-3 p-4 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}>
              <input type="checkbox" checked={album.isPublished} onChange={event => update({ isPublished: event.target.checked })} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">{t('admin.publish', language)}</span>
                <span className="block mt-0.5 text-xs" style={{ color: 'var(--muted-foreground)' }}>{t('admin.publish_hint', language)}</span>
              </span>
            </label>
          </div>
        </section>
      </div>

      <div className="lg:sticky lg:top-0">
        <p className="mb-2 text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
          {t('admin.album_preview', language)}
        </p>
        <AlbumPreviewCard album={album} language={language} />
      </div>
    </div>
  )
}

function AlbumPreviewCard({ album, language }: { album: Album; language: Locale }) {
  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
      <div className="aspect-video relative" style={{ backgroundColor: 'var(--muted)' }}>
        {album.coverUrl ? (
          <img src={resolveAssetUrl(album.coverUrl)} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-1.5" style={{ color: 'var(--muted-foreground)' }}>
            <ImageIcon size={24} className="opacity-40" />
            <span className="text-[10px]">{t('admin.no_cover', language)}</span>
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-sm font-medium truncate">{album.name.trim() || t('admin.untitled_album', language)}</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
            style={{
              backgroundColor: album.isPublished ? 'var(--accent)' : 'var(--muted)',
              color: album.isPublished ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
            }}>
            {album.isPublished ? t('admin.albums_status_published', language) : t('admin.albums_status_draft', language)}
          </span>
        </div>
        {album.location && (
          <p className="mb-1 flex items-center gap-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
            <MapPin size={12} className="shrink-0" />
            <span className="truncate">{album.location}</span>
          </p>
        )}
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          {album.photoCount} {t('admin.photos', language)}
        </p>
      </div>
    </div>
  )
}

function AlbumPhotos({ album, onRemovePhoto, onSetCover, onShowSelector, language }: {
  album: Album
  onRemovePhoto: (photoId: string) => void
  onSetCover: (photoId: string) => void
  onShowSelector: () => void
  language: Locale
}) {
  const albumPhotos = album.photos ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{albumPhotos.length} {t('admin.photos', language)}</span>
        <button onClick={onShowSelector} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          <Plus size={14} /> {t('admin.add_photos', language)}
        </button>
      </div>

      {albumPhotos.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          {albumPhotos.map(photo => {
            const cover = isCoverPhoto(album, photo)
            return (
              <div key={photo.id} className="relative group rounded-lg overflow-hidden border" style={{ borderColor: cover ? 'var(--primary)' : 'var(--border)', backgroundColor: 'var(--muted)' }}>
                <div className="aspect-square">
                  <img src={resolveAssetUrl(photo.thumbnailUrl || photo.url)} alt={photo.title} className="w-full h-full object-cover" />
                </div>
                <div className="absolute inset-x-0 bottom-0 px-2 pt-6 pb-2 bg-gradient-to-t from-black/80 to-transparent">
                  <p className="text-[11px] text-white truncate">{photo.title}</p>
                </div>
                {cover && (
                  <span className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/65 text-[10px] text-white">
                    <Star size={10} fill="currentColor" /> {t('admin.cover', language)}
                  </span>
                )}
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!cover && (
                    <button onClick={() => onSetCover(photo.id)} title={t('admin.set_cover', language)} className="p-1.5 rounded-md" style={{ backgroundColor: 'rgba(0,0,0,0.65)', color: 'white' }}>
                      <Star size={12} />
                    </button>
                  )}
                  <button onClick={() => onRemovePhoto(photo.id)} title={t('admin.remove', language)} className="p-1.5 rounded-md" style={{ backgroundColor: 'rgba(0,0,0,0.65)', color: 'white' }}>
                    <X size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-52 border border-dashed rounded-lg" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
          <ImageIcon size={32} className="mb-3 opacity-40" />
          <p className="text-sm mb-4">{t('admin.album_empty', language)}</p>
          <button onClick={onShowSelector} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border" style={{ borderColor: 'var(--border)' }}>
            <Plus size={14} /> {t('admin.add_photos', language)}
          </button>
        </div>
      )}
    </div>
  )
}

function AlbumPhotoSelector({ photos, selectedIds, search, saving, onSearchChange, onToggle, onConfirm, onClose, language }: {
  photos: Photo[]
  selectedIds: Set<string>
  search: string
  saving: boolean
  onSearchChange: (value: string) => void
  onToggle: (photoId: string) => void
  onConfirm: () => void
  onClose: () => void
  language: Locale
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={onClose} className="p-1.5 rounded-md border" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}><X size={14} /></button>
          <span className="text-sm">{selectedIds.size} {t('admin.selected', language)}</span>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
            <input value={search} onChange={event => onSearchChange(event.target.value)} placeholder={t('common.search', language)} className="w-56 pl-8 pr-3 py-1.5 text-xs rounded-md border outline-none" style={inputStyle()} />
          </div>
        </div>
        <button onClick={onConfirm} disabled={saving || selectedIds.size === 0} className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md disabled:opacity-50" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
          {t('admin.confirm_add', language)} ({selectedIds.size})
        </button>
      </div>

      {photos.length === 0 ? (
        <div className="flex items-center justify-center h-48 border border-dashed rounded-lg" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
          <p className="text-sm">{t('admin.no_photos_available', language)}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-5 xl:grid-cols-7 gap-2">
          {photos.map(photo => (
            <button key={photo.id} onClick={() => onToggle(photo.id)} className="relative aspect-square rounded-md overflow-hidden border-2 transition-all" style={{ borderColor: selectedIds.has(photo.id) ? 'var(--primary)' : 'transparent', backgroundColor: 'var(--muted)' }}>
              <img src={resolveAssetUrl(photo.thumbnailUrl || photo.url)} alt={photo.title} className="w-full h-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 px-1.5 pt-5 pb-1.5 text-left text-[10px] text-white truncate bg-gradient-to-t from-black/75 to-transparent">{photo.title}</span>
              {selectedIds.has(photo.id) && <span className="absolute top-1.5 right-1.5 flex items-center justify-center w-5 h-5 rounded-full" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}><Check size={12} /></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block mb-1.5 text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
        {label}
        {required && <span className="ml-0.5" style={{ color: 'var(--destructive)' }}>*</span>}
      </span>
      {children}
    </label>
  )
}
