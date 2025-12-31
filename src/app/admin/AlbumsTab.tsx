'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  FolderOpen,
  Plus,
  Edit3,
  Trash2,
  ChevronLeft,
  Save,
  Eye,
  EyeOff,
  Image as ImageIcon,
  X,
  Check,
  GripVertical,
} from 'lucide-react'
import {
  getAdminAlbums,
  createAlbum,
  updateAlbum,
  deleteAlbum,
  addPhotosToAlbum,
  removePhotoFromAlbum,
  setAlbumCover,
  type AlbumDto,
  type PhotoDto,
  ApiUnauthorizedError,
} from '@/lib/api'
import { CustomInput } from '@/components/ui/CustomInput'
import { useSettings } from '@/contexts/SettingsContext'
import { resolveAssetUrl } from '@/lib/api'

interface AlbumsTabProps {
  token: string | null
  photos: PhotoDto[]
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  onUnauthorized: () => void
}

export function AlbumsTab({ token, photos, t, notify, onUnauthorized }: AlbumsTabProps) {
  const { settings } = useSettings()
  const cdnDomain = settings?.cdn_domain || ''

  const [albums, setAlbums] = useState<AlbumDto[]>([])
  const [loading, setLoading] = useState(true)
  const [currentAlbum, setCurrentAlbum] = useState<AlbumDto | null>(null)
  const [editMode, setEditMode] = useState<'list' | 'editor' | 'photos'>('list')
  const [saving, setSaving] = useState(false)
  const [showPhotoSelector, setShowPhotoSelector] = useState(false)
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadAlbums()
  }, [token])

  async function loadAlbums() {
    if (!token) return
    try {
      setLoading(true)
      const data = await getAdminAlbums(token)
      setAlbums(data)
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        onUnauthorized()
        return
      }
      console.error('Failed to load albums:', err)
      notify(t('common.error'), 'error')
    } finally {
      setLoading(false)
    }
  }

  function handleCreateAlbum() {
    setCurrentAlbum({
      id: '',
      name: '',
      description: '',
      coverUrl: '',
      isPublished: false,
      sortOrder: albums.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      photos: [],
      photoCount: 0,
    })
    setEditMode('editor')
  }

  function handleEditAlbum(album: AlbumDto) {
    setCurrentAlbum({ ...album })
    setEditMode('editor')
  }

  function handleManagePhotos(album: AlbumDto) {
    setCurrentAlbum({ ...album })
    setEditMode('photos')
  }

  async function handleDeleteAlbum(id: string) {
    if (!token) return
    if (!window.confirm(t('common.confirm') + '?')) return

    try {
      await deleteAlbum(token, id)
      notify(t('admin.notify_success'), 'success')
      await loadAlbums()
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        onUnauthorized()
        return
      }
      console.error('Failed to delete album:', err)
      notify(t('common.error'), 'error')
    }
  }

  async function handleSaveAlbum() {
    if (!token || !currentAlbum) return
    if (!currentAlbum.name.trim()) {
      notify(t('admin.album_name_required') || 'Please enter album name', 'error')
      return
    }

    try {
      setSaving(true)
      const isNew = !currentAlbum.id

      if (isNew) {
        await createAlbum(token, {
          name: currentAlbum.name,
          description: currentAlbum.description || undefined,
          coverUrl: currentAlbum.coverUrl || undefined,
          isPublished: currentAlbum.isPublished,
          sortOrder: currentAlbum.sortOrder,
        })
        notify(t('admin.album_created') || 'Album created', 'success')
      } else {
        await updateAlbum(token, currentAlbum.id, {
          name: currentAlbum.name,
          description: currentAlbum.description || undefined,
          coverUrl: currentAlbum.coverUrl || undefined,
          isPublished: currentAlbum.isPublished,
          sortOrder: currentAlbum.sortOrder,
        })
        notify(t('admin.album_updated') || 'Album updated', 'success')
      }

      setEditMode('list')
      setCurrentAlbum(null)
      await loadAlbums()
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        onUnauthorized()
        return
      }
      console.error('Failed to save album:', err)
      notify(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleTogglePublish(album: AlbumDto) {
    if (!token) return

    try {
      await updateAlbum(token, album.id, {
        isPublished: !album.isPublished,
      })
      notify(t('admin.notify_success'), 'success')
      await loadAlbums()
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        onUnauthorized()
        return
      }
      console.error('Failed to toggle publish:', err)
      notify(t('common.error'), 'error')
    }
  }

  async function handleAddPhotos() {
    if (!token || !currentAlbum || selectedPhotoIds.size === 0) return

    try {
      setSaving(true)
      await addPhotosToAlbum(token, currentAlbum.id, Array.from(selectedPhotoIds))
      notify(t('admin.photos_added') || 'Photos added', 'success')
      setShowPhotoSelector(false)
      setSelectedPhotoIds(new Set())
      await loadAlbums()
      // Update current album
      const updated = await getAdminAlbums(token)
      const refreshed = updated.find(a => a.id === currentAlbum.id)
      if (refreshed) setCurrentAlbum(refreshed)
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        onUnauthorized()
        return
      }
      console.error('Failed to add photos:', err)
      notify(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemovePhoto(photoId: string) {
    if (!token || !currentAlbum) return

    try {
      const updated = await removePhotoFromAlbum(token, currentAlbum.id, photoId)
      setCurrentAlbum(updated)
      // Update album in list without full reload
      setAlbums(prev => prev.map(a => a.id === updated.id ? updated : a))
      notify(t('admin.photo_removed') || 'Photo removed', 'success')
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        onUnauthorized()
        return
      }
      console.error('Failed to remove photo:', err)
      notify(t('common.error'), 'error')
    }
  }

  async function handleSetCover(photoId: string) {
    if (!token || !currentAlbum) return

    try {
      const updated = await setAlbumCover(token, currentAlbum.id, photoId)
      setCurrentAlbum(updated)
      // Update album in list without full reload
      setAlbums(prev => prev.map(a => a.id === updated.id ? updated : a))
      notify(t('admin.cover_set') || 'Cover set', 'success')
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        onUnauthorized()
        return
      }
      console.error('Failed to set cover:', err)
      notify(t('common.error'), 'error')
    }
  }

  // Get photos not in current album
  const availablePhotos = useMemo(() => {
    if (!currentAlbum) return photos
    const albumPhotoIds = new Set(currentAlbum.photos.map(p => p.id))
    return photos.filter(p => !albumPhotoIds.has(p.id))
  }, [photos, currentAlbum])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs font-mono uppercase">
        {t('common.loading')}
      </div>
    )
  }

  // Photo selector modal
  if (showPhotoSelector) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setShowPhotoSelector(false)
                setSelectedPhotoIds(new Set())
              }}
              className="p-2 hover:bg-muted transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="font-serif text-xl">{t('admin.select_photos') || 'Select Photos'}</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {selectedPhotoIds.size} {t('admin.selected') || 'selected'}
            </span>
            <button
              onClick={handleAddPhotos}
              disabled={selectedPhotoIds.size === 0 || saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{t('admin.add') || 'Add'}</span>
            </button>
          </div>
        </div>

        {availablePhotos.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-border">
            <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-sm text-muted-foreground">
              {t('admin.no_photos_available') || 'No photos available'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {availablePhotos.map((photo) => {
              const isSelected = selectedPhotoIds.has(photo.id)
              return (
                <div
                  key={photo.id}
                  onClick={() => {
                    setSelectedPhotoIds(prev => {
                      const next = new Set(prev)
                      if (next.has(photo.id)) next.delete(photo.id)
                      else next.add(photo.id)
                      return next
                    })
                  }}
                  className={`relative aspect-square cursor-pointer group border-2 transition-all ${
                    isSelected ? 'border-primary' : 'border-transparent hover:border-border'
                  }`}
                >
                  <img
                    src={resolveAssetUrl(photo.thumbnailUrl || photo.url, cdnDomain)}
                    alt={photo.title}
                    className="w-full h-full object-cover"
                  />
                  {isSelected && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                        <Check className="w-5 h-5 text-primary-foreground" />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Photos management view
  if (editMode === 'photos' && currentAlbum) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setEditMode('list')
                setCurrentAlbum(null)
              }}
              className="p-2 hover:bg-muted transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="font-serif text-xl">{currentAlbum.name}</h2>
              <p className="text-xs text-muted-foreground uppercase tracking-widest">
                {currentAlbum.photos.length} {t('admin.photos') || 'photos'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowPhotoSelector(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>{t('admin.add_photos') || 'Add Photos'}</span>
          </button>
        </div>

        {currentAlbum.photos.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-border">
            <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-sm text-muted-foreground mb-4">
              {t('admin.album_empty') || 'This album is empty'}
            </p>
            <button
              onClick={() => setShowPhotoSelector(true)}
              className="inline-flex items-center gap-2 px-4 py-2 border border-border text-xs font-bold uppercase tracking-widest hover:bg-muted transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{t('admin.add_photos') || 'Add Photos'}</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {currentAlbum.photos.map((photo) => {
              const isCover = currentAlbum.coverUrl === (photo.thumbnailUrl || photo.url)
              return (
                <div
                  key={photo.id}
                  className="relative aspect-square group border border-border"
                >
                  <img
                    src={resolveAssetUrl(photo.thumbnailUrl || photo.url, cdnDomain)}
                    alt={photo.title}
                    className="w-full h-full object-cover"
                  />
                  {isCover && (
                    <div className="absolute top-2 left-2 px-2 py-1 bg-primary text-primary-foreground text-[10px] font-bold uppercase">
                      {t('admin.cover') || 'Cover'}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    {!isCover && (
                      <button
                        onClick={() => handleSetCover(photo.id)}
                        className="p-2 bg-white/20 hover:bg-white/30 transition-colors"
                        title={t('admin.set_as_cover') || 'Set as cover'}
                      >
                        <ImageIcon className="w-4 h-4 text-white" />
                      </button>
                    )}
                    <button
                      onClick={() => handleRemovePhoto(photo.id)}
                      className="p-2 bg-destructive/80 hover:bg-destructive transition-colors"
                      title={t('admin.remove') || 'Remove'}
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Editor view
  if (editMode === 'editor' && currentAlbum) {
    return (
      <div className="max-w-2xl space-y-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setEditMode('list')
              setCurrentAlbum(null)
            }}
            className="p-2 hover:bg-muted transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="font-serif text-xl">
            {currentAlbum.id ? t('admin.edit_album') || 'Edit Album' : t('admin.new_album') || 'New Album'}
          </h2>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              {t('admin.album_name') || 'Album Name'}
            </label>
            <CustomInput
              variant="config"
              value={currentAlbum.name}
              onChange={(e) => setCurrentAlbum({ ...currentAlbum, name: e.target.value })}
              placeholder={t('admin.album_name_placeholder') || 'Enter album name'}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              {t('admin.description') || 'Description'}
            </label>
            <textarea
              value={currentAlbum.description || ''}
              onChange={(e) => setCurrentAlbum({ ...currentAlbum, description: e.target.value })}
              placeholder={t('admin.description_placeholder') || 'Enter description (optional)'}
              className="w-full p-4 h-32 bg-transparent border border-border focus:border-primary outline-none text-sm transition-colors rounded-none resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              {t('admin.sort_order') || 'Sort Order'}
            </label>
            <CustomInput
              variant="config"
              type="number"
              value={currentAlbum.sortOrder}
              onChange={(e) => setCurrentAlbum({ ...currentAlbum, sortOrder: parseInt(e.target.value) || 0 })}
            />
            <p className="text-[10px] text-muted-foreground">
              {t('admin.sort_order_hint') || 'Lower numbers appear first'}
            </p>
          </div>

          <div className="flex items-center justify-between p-4 border border-border bg-muted/10">
            <div>
              <label className="text-[10px] font-bold text-foreground uppercase tracking-widest">
                {t('admin.publish') || 'Publish'}
              </label>
              <p className="text-[10px] text-muted-foreground mt-1">
                {t('admin.publish_hint') || 'Make this album visible to visitors'}
              </p>
            </div>
            <input
              type="checkbox"
              checked={currentAlbum.isPublished}
              onChange={(e) => setCurrentAlbum({ ...currentAlbum, isPublished: e.target.checked })}
              className="w-5 h-5 accent-primary cursor-pointer"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-border">
          <button
            onClick={() => {
              setEditMode('list')
              setCurrentAlbum(null)
            }}
            className="flex-1 px-6 py-3 border border-border text-foreground text-xs font-bold uppercase tracking-widest hover:bg-muted transition-all"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSaveAlbum}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? t('common.loading') : t('admin.save')}</span>
          </button>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl">{t('admin.albums') || 'Albums'}</h2>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
            {albums.length} {t('admin.total') || 'total'}
          </p>
        </div>
        <button
          onClick={handleCreateAlbum}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>{t('admin.new_album') || 'New Album'}</span>
        </button>
      </div>

      {albums.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-border">
          <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-sm text-muted-foreground mb-4">
            {t('admin.no_albums') || 'No albums yet'}
          </p>
          <button
            onClick={handleCreateAlbum}
            className="inline-flex items-center gap-2 px-4 py-2 border border-border text-xs font-bold uppercase tracking-widest hover:bg-muted transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>{t('admin.create_first_album') || 'Create your first album'}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {albums.map((album) => (
            <div
              key={album.id}
              className="group border border-border hover:border-primary transition-all bg-card/30"
            >
              {/* Cover */}
              <div
                className="relative aspect-[4/3] bg-muted cursor-pointer"
                onClick={() => handleManagePhotos(album)}
              >
                {album.coverUrl ? (
                  <img
                    src={resolveAssetUrl(album.coverUrl, cdnDomain)}
                    alt={album.name}
                    className="w-full h-full object-cover"
                  />
                ) : album.photos.length > 0 ? (
                  <img
                    src={resolveAssetUrl(album.photos[0].thumbnailUrl || album.photos[0].url, cdnDomain)}
                    alt={album.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <FolderOpen className="w-12 h-12 opacity-20" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 text-white text-[10px] font-bold">
                  {album.photoCount} {t('admin.photos') || 'photos'}
                </div>
              </div>

              {/* Info */}
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm uppercase tracking-wider truncate">
                      {album.name}
                    </h3>
                    {album.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {album.description}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 text-[8px] font-black uppercase px-1.5 py-0.5 border ${
                      album.isPublished
                        ? 'border-primary text-primary'
                        : 'border-muted-foreground text-muted-foreground'
                    }`}
                  >
                    {album.isPublished ? t('admin.published') || 'Published' : t('admin.draft') || 'Draft'}
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <button
                    onClick={() => handleManagePhotos(album)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                    title={t('admin.manage_photos') || 'Manage photos'}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{t('admin.photos') || 'Photos'}</span>
                  </button>
                  <button
                    onClick={() => handleTogglePublish(album)}
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                    title={album.isPublished ? t('admin.unpublish') || 'Unpublish' : t('admin.publish') || 'Publish'}
                  >
                    {album.isPublished ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleEditAlbum(album)}
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                    title={t('admin.edit') || 'Edit'}
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteAlbum(album.id)}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                    title={t('admin.delete') || 'Delete'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
