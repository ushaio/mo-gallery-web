import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronLeft,
  Eye,
  EyeOff,
  Image as ImageIcon,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'

import { CardGridSkeleton, ListSkeleton } from '@/components/admin/Skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { resolveAssetUrl } from '@/lib/api'
import { invalidateDesktopCache } from '@/lib/app-cache'
import { loadPersistentResource } from '@/lib/persistent-cache'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import type { Album, Photo } from '@/types'

import {
  appApi,
  errorMessage,
  newDraftAlbum,
  normalizeAlbum,
  type AlbumPayload,
  type DetailTab,
} from './helpers'
import { AlbumOverview } from './AlbumOverview'
import { AlbumPhotoSelector, AlbumPhotos } from './AlbumPhotos'

interface CloudAlbumsProps {
  initialAlbumId?: string | null
  initialTab?: DetailTab
  createMode?: boolean
  onBackToBrowser?: () => void
  onAlbumsChanged?: () => void
}

export function CloudAlbums({
  initialAlbumId = null,
  initialTab = 'photos',
  createMode = false,
  onBackToBrowser,
  onAlbumsChanged,
}: CloudAlbumsProps = {}) {
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

  const fetchAlbums = useCallback(async (force = false) => {
    setLoading(true)
    try {
      const result = await loadPersistentResource('albums', () => appApi().GetAlbums(), { force })
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
      await fetchAlbums(true)
      invalidateDesktopCache(['overview'])
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
      await fetchAlbums(true)
      invalidateDesktopCache(['overview', 'photos'])
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    }
  }, [currentAlbum?.id, fetchAlbums, language])

  const togglePublished = useCallback(async (album: Album) => {
    try {
      const updated = normalizeAlbum(await appApi().UpdateAlbum(album.id, { isPublished: !album.isPublished }))
      await fetchAlbums(true)
      invalidateDesktopCache(['overview'])
      if (currentAlbum?.id === updated.id) {
        setCurrentAlbum(current => current ? { ...current, isPublished: updated.isPublished } : current)
      }
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    }
  }, [currentAlbum?.id, fetchAlbums, language])

  const handleAddPhotos = useCallback(async () => {
    if (!currentAlbum?.id || selectedPhotoIds.size === 0) return
    setSaving(true)
    try {
      const updated = normalizeAlbum(await appApi().AddPhotosToAlbum(currentAlbum.id, Array.from(selectedPhotoIds)))
      setCurrentAlbum(updated)
      setSelectedPhotoIds(new Set())
      setShowPhotoSelector(false)
      setPhotoSelectorSearch('')
      await fetchAlbums(true)
      invalidateDesktopCache(['photos'])
      toast.success(t('admin.photos_added', language))
      onAlbumsChanged?.()
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    } finally {
      setSaving(false)
    }
  }, [currentAlbum?.id, fetchAlbums, language, onAlbumsChanged, selectedPhotoIds])

  const handleRemovePhoto = useCallback(async (photoId: string) => {
    if (!currentAlbum?.id) return
    try {
      const updated = normalizeAlbum(await appApi().RemovePhotoFromAlbum(currentAlbum.id, photoId))
      setCurrentAlbum(updated)
      await fetchAlbums(true)
      invalidateDesktopCache(['photos'])
      toast.success(t('admin.photo_removed', language))
      onAlbumsChanged?.()
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    }
  }, [currentAlbum?.id, fetchAlbums, language, onAlbumsChanged])

  const handleSetCover = useCallback(async (photoId: string) => {
    if (!currentAlbum?.id) return
    try {
      const updated = normalizeAlbum(await appApi().SetAlbumCover(currentAlbum.id, photoId))
      setCurrentAlbum(updated)
      await fetchAlbums(true)
      toast.success(t('admin.cover_set', language))
      onAlbumsChanged?.()
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    }
  }, [currentAlbum?.id, fetchAlbums, language, onAlbumsChanged])

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
