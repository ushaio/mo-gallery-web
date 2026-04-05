'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
  LayoutGrid,
  List as ListIcon,
  Trash2,
  RefreshCw,
  X,
  ImageIcon,
  Star,
  SlidersHorizontal,
} from 'lucide-react'
import type { PhotoDto, AlbumDto, AdminSettingsDto, CameraDto, LensDto } from '@/lib/api/types'
import { resolveAssetUrl } from '@/lib/api/core'
import { getAlbums } from '@/lib/api/albums'
import { getCameras, getLenses } from '@/lib/api/equipment'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminSelect } from '@/components/admin/AdminFormControls'
import { AdminCollectionToolbar } from '@/components/admin/AdminCollectionToolbar'

type SortOption = 'upload-desc' | 'upload-asc' | 'taken-desc' | 'taken-asc'
type ViewMode = 'grid' | 'list'

const PHOTOS_FILTER_KEY = 'admin-photos-filters'

interface PersistedFilters {
  search: string
  categoryFilter: string
  channelFilter: string
  albumFilter: string
  cameraFilter: string
  lensFilter: string
  onlyFeatured: boolean
  sortBy: SortOption
  showFilters: boolean
}

function loadPersistedFilters(): Partial<PersistedFilters> {
  try {
    const stored = sessionStorage.getItem(PHOTOS_FILTER_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return {}
}

interface PhotosTabProps {
  photos: PhotoDto[]
  categories: string[]
  loading: boolean
  error: string
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  selectedIds: Set<string>
  onSelect: (id: string) => void
  onSelectAll: () => void
  onDelete: (id?: string) => void
  onRefresh: () => void
  onToggleFeatured: (photo: PhotoDto) => void
  onPreview: (photo: PhotoDto) => void
  t: (key: string) => string
  settings: AdminSettingsDto | null
  notify?: (message: string, type?: 'success' | 'error' | 'info') => void
}

export function PhotosTab({
  photos,
  categories,
  loading,
  error,
  viewMode,
  onViewModeChange,
  selectedIds,
  onSelect,
  onSelectAll,
  onDelete,
  onRefresh,
  onToggleFeatured,
  onPreview,
  t,
  settings,
  notify,
}: PhotosTabProps) {
  const [persisted] = useState(() => loadPersistedFilters())
  const [search, setSearch] = useState(persisted.search ?? '')
  const [categoryFilter, setCategoryFilter] = useState(persisted.categoryFilter ?? 'all')
  const [channelFilter, setChannelFilter] = useState(persisted.channelFilter ?? 'all')
  const [albumFilter, setAlbumFilter] = useState(persisted.albumFilter ?? 'all')
  const [cameraFilter, setCameraFilter] = useState(persisted.cameraFilter ?? 'all')
  const [lensFilter, setLensFilter] = useState(persisted.lensFilter ?? 'all')
  const [onlyFeatured, setOnlyFeatured] = useState(persisted.onlyFeatured ?? false)
  const [sortBy, setSortBy] = useState<SortOption>(persisted.sortBy ?? 'upload-desc')
  const [showFilters, setShowFilters] = useState(persisted.showFilters ?? false)
  const [albums, setAlbums] = useState<AlbumDto[]>([])
  const [cameras, setCameras] = useState<CameraDto[]>([])
  const [lenses, setLenses] = useState<LensDto[]>([])

  const resolvedCdnDomain = settings?.cdn_domain?.trim() || undefined

  // Persist filter state to sessionStorage
  useEffect(() => {
    try {
      const state: PersistedFilters = {
        search, categoryFilter, channelFilter, albumFilter,
        cameraFilter, lensFilter, onlyFeatured, sortBy, showFilters,
      }
      sessionStorage.setItem(PHOTOS_FILTER_KEY, JSON.stringify(state))
    } catch {}
  }, [search, categoryFilter, channelFilter, albumFilter, cameraFilter, lensFilter, onlyFeatured, sortBy, showFilters])

  // Load albums, cameras, and lenses on mount
  useEffect(() => {
    async function loadFilterData() {
      try {
        const [albumsData, camerasData, lensesData] = await Promise.all([
          getAlbums(),
          getCameras(),
          getLenses()
        ])
        setAlbums(albumsData)
        setCameras(camerasData)
        setLenses(lensesData)
      } catch (err) {
        console.error('Failed to load filter data:', err)
        notify?.(err instanceof Error ? err.message : t('common.error'), 'error')
      }
    }
    loadFilterData()
  }, [])

  // Camera options from API
  const cameraOptions = useMemo(() => {
    return cameras.map(c => ({
      value: c.id,
      label: `${c.displayName} (${c.photoCount})`
    }))
  }, [cameras])

  // Lens options from API
  const lensOptions = useMemo(() => {
    return lenses.map(l => ({
      value: l.id,
      label: `${l.displayName} (${l.photoCount})`
    }))
  }, [lenses])

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (categoryFilter !== 'all') count++
    if (channelFilter !== 'all') count++
    if (albumFilter !== 'all') count++
    if (cameraFilter !== 'all') count++
    if (lensFilter !== 'all') count++
    if (onlyFeatured) count++
    return count
  }, [categoryFilter, channelFilter, albumFilter, cameraFilter, lensFilter, onlyFeatured])

  // Get album photo IDs for filtering
  const albumPhotoIds = useMemo(() => {
    if (albumFilter === 'all') return null
    const album = albums.find(a => a.id === albumFilter)
    if (!album) return null
    return new Set(album.photos.map(p => p.id))
  }, [albumFilter, albums])

  const filteredPhotos = useMemo(() => {
    const filtered = photos.filter((p) => {
      const matchesSearch =
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.category.toLowerCase().includes(search.toLowerCase())

      const matchesCategory =
        categoryFilter === 'all' || p.category.includes(categoryFilter)

      const matchesChannel =
        channelFilter === 'all' || p.storageProvider === channelFilter

      const matchesAlbum =
        albumPhotoIds === null || albumPhotoIds.has(p.id)

      const matchesCamera = (() => {
        if (cameraFilter === 'all') return true
        return p.cameraId === cameraFilter
      })()

      const matchesLens = (() => {
        if (lensFilter === 'all') return true
        return p.lensId === lensFilter
      })()

      const matchesFeatured = !onlyFeatured || p.isFeatured

      return matchesSearch && matchesCategory && matchesChannel && matchesAlbum && matchesCamera && matchesLens && matchesFeatured
    })

    // Apply sorting
    return filtered.toSorted((a, b) => {
      switch (sortBy) {
        case 'upload-desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case 'upload-asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        case 'taken-desc':
          if (!a.takenAt && !b.takenAt) return 0
          if (!a.takenAt) return 1
          if (!b.takenAt) return -1
          return new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime()
        case 'taken-asc':
          if (!a.takenAt && !b.takenAt) return 0
          if (!a.takenAt) return 1
          if (!b.takenAt) return -1
          return new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime()
        default:
          return 0
      }
    })
  }, [photos, search, categoryFilter, channelFilter, albumPhotoIds, cameraFilter, lensFilter, onlyFeatured, sortBy])

  const clearAllFilters = () => {
    setCategoryFilter('all')
    setChannelFilter('all')
    setAlbumFilter('all')
    setCameraFilter('all')
    setLensFilter('all')
    setOnlyFeatured(false)
    setSearch('')
    try { sessionStorage.removeItem(PHOTOS_FILTER_KEY) } catch {}
  }

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'upload-desc', label: t('admin.sort_upload_desc') },
    { value: 'upload-asc', label: t('admin.sort_upload_asc') },
    { value: 'taken-desc', label: t('admin.sort_taken_desc') },
    { value: 'taken-asc', label: t('admin.sort_taken_asc') },
  ]

  return (
    <div className="space-y-4">
      <AdminCollectionToolbar
        info={(
          <>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filteredPhotos.length > 0 && selectedIds.size === filteredPhotos.length}
                onChange={onSelectAll}
                className="w-4 h-4 accent-primary cursor-pointer rounded"
              />
              <span className="text-sm font-medium text-foreground">
                {selectedIds.size > 0 ? (
                  <span className="text-primary">{selectedIds.size} {t('admin.selected') || 'selected'}</span>
                ) : (
                  <span className="text-muted-foreground">{filteredPhotos.length} {t('admin.photos')}</span>
                )}
              </span>
            </label>
            
            {selectedIds.size > 0 && (
              <>
                <div className="h-5 w-px bg-border" />
                <AdminButton
                  onClick={() => onDelete()}
                  adminVariant="destructiveOutline"
                  size="sm"
                  className="gap-1.5 rounded-md text-xs font-medium normal-case"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('common.delete')}</span>
                </AdminButton>
              </>
            )}
          </>
        )}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('common.search')}
        actions={(
          <>
            {/* Filter Toggle */}
            <AdminButton
              onClick={() => setShowFilters(!showFilters)}
              adminVariant="unstyled"
              className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border rounded-md transition-all ${
                showFilters || activeFilterCount > 0
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-background border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">{t('admin.filter') || 'Filter'}</span>
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center w-5 h-5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </AdminButton>

            {/* View Mode Toggle */}
            <div className="flex bg-background border border-border rounded-md overflow-hidden">
              <AdminButton
                onClick={() => onViewModeChange('grid')}
                adminVariant="unstyled"
                className={`p-2 transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                title="Grid view"
              >
                <LayoutGrid className="w-4 h-4" />
              </AdminButton>
              <AdminButton
                onClick={() => onViewModeChange('list')}
                adminVariant="unstyled"
                className={`p-2 transition-colors ${
                  viewMode === 'list'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                title="List view"
              >
                <ListIcon className="w-4 h-4" />
              </AdminButton>
            </div>

            {/* Refresh */}
            <AdminButton
              onClick={onRefresh}
              adminVariant="unstyled"
              className="p-2 bg-background border border-border rounded-md text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              title={t('common.refresh')}
            >
              <RefreshCw className="w-4 h-4" />
            </AdminButton>
          </>
        )}
        filters={showFilters ? (
          <div className="flex flex-wrap items-center gap-3">
              {/* Sort */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Sort:</span>
                <AdminSelect
                  value={sortBy}
                  onChange={(v) => setSortBy(v as SortOption)}
                  options={sortOptions.map(opt => ({ value: opt.value, label: opt.label }))}
                  className="min-w-[140px]"
                />
              </div>

              <div className="h-5 w-px bg-border hidden sm:block" />

              {/* Category Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">{t('ui.category_filter')}:</span>
                <AdminSelect
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  options={[
                    { value: 'all', label: t('gallery.all') },
                    ...categories.filter(c => c !== 'all' && c !== '全部').map(cat => ({ value: cat, label: cat }))
                  ]}
                  className="min-w-[120px]"
                />
              </div>

              {/* Storage Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">{t('ui.channel_filter')}:</span>
                <AdminSelect
                  value={channelFilter}
                  onChange={setChannelFilter}
                  options={[
                    { value: 'all', label: t('gallery.all') },
                    { value: 'local', label: 'Local' },
                    { value: 's3', label: 'S3' },
                    { value: 'github', label: 'GitHub' },
                  ]}
                  className="min-w-[130px]"
                />
              </div>

              {/* Album Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">{t('admin.album') || 'Album'}:</span>
                <AdminSelect
                  value={albumFilter}
                  onChange={setAlbumFilter}
                  options={[
                    { value: 'all', label: t('gallery.all') },
                    ...albums.map(album => ({ value: album.id, label: `${album.name} (${album.photoCount})` }))
                  ]}
                  className="min-w-[140px]"
                />
              </div>

              {/* Camera Filter */}
              {cameraOptions.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{t('admin.camera') || 'Camera'}:</span>
                  <AdminSelect
                    value={cameraFilter}
                    onChange={setCameraFilter}
                    options={[
                      { value: 'all', label: t('gallery.all') },
                      ...cameraOptions
                    ]}
                    className="min-w-[160px]"
                  />
                </div>
              )}

              {/* Lens Filter */}
              {lensOptions.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{t('admin.lens') || 'Lens'}:</span>
                  <AdminSelect
                    value={lensFilter}
                    onChange={setLensFilter}
                    options={[
                      { value: 'all', label: t('gallery.all') },
                      ...lensOptions
                    ]}
                    className="min-w-[160px]"
                  />
                </div>
              )}

              {/* Featured Toggle */}
              <label className={`flex items-center gap-2 px-3 py-1.5 border rounded-md cursor-pointer transition-colors ${
                onlyFeatured 
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-600' 
                  : 'bg-background border-border text-muted-foreground hover:text-foreground'
              }`}>
                <Star className={`w-3.5 h-3.5 ${onlyFeatured ? 'fill-current' : ''}`} />
                <span className="text-xs font-medium">{t('admin.feat')}</span>
                <input
                  type="checkbox"
                  checked={onlyFeatured}
                  onChange={() => setOnlyFeatured(!onlyFeatured)}
                  className="sr-only"
                />
              </label>

              {/* Clear Filters */}
              {activeFilterCount > 0 && (
                <>
                  <div className="h-5 w-px bg-border" />
                  <AdminButton
                    onClick={clearAllFilters}
                    adminVariant="unstyled"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>{t('admin.clear_all_filters')}</span>
                  </AdminButton>
                </>
              )}
          </div>
        ) : undefined}
        activeFilters={activeFilterCount > 0 && !showFilters ? (
          <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('admin.active_filters_label')}:</span>
            {categoryFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                {categoryFilter}
                <AdminButton
                  onClick={() => setCategoryFilter('all')}
                  adminVariant="icon"
                  size="xs"
                  className="p-0 hover:text-primary/70"
                >
                  <X className="w-3 h-3" />
                </AdminButton>
              </span>
            )}
            {channelFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                {channelFilter}
                <AdminButton
                  onClick={() => setChannelFilter('all')}
                  adminVariant="icon"
                  size="xs"
                  className="p-0 hover:text-primary/70"
                >
                  <X className="w-3 h-3" />
                </AdminButton>
              </span>
            )}
            {albumFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                {albums.find(a => a.id === albumFilter)?.name || albumFilter}
                <AdminButton
                  onClick={() => setAlbumFilter('all')}
                  adminVariant="icon"
                  size="xs"
                  className="p-0 hover:text-primary/70"
                >
                  <X className="w-3 h-3" />
                </AdminButton>
              </span>
            )}
            {cameraFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                {cameraOptions.find(c => c.value === cameraFilter)?.label || cameraFilter}
                <AdminButton
                  onClick={() => setCameraFilter('all')}
                  adminVariant="icon"
                  size="xs"
                  className="p-0 hover:text-primary/70"
                >
                  <X className="w-3 h-3" />
                </AdminButton>
              </span>
            )}
            {lensFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                {lensOptions.find(l => l.value === lensFilter)?.label || lensFilter}
                <AdminButton
                  onClick={() => setLensFilter('all')}
                  adminVariant="icon"
                  size="xs"
                  className="p-0 hover:text-primary/70"
                >
                  <X className="w-3 h-3" />
                </AdminButton>
              </span>
            )}
            {onlyFeatured && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500/10 text-amber-600 text-xs rounded-md">
                <Star className="w-3 h-3 fill-current" />
                {t('admin.featured_only')}
                <AdminButton
                  onClick={() => setOnlyFeatured(false)}
                  adminVariant="icon"
                  size="xs"
                  className="p-0 hover:text-amber-500/70"
                >
                  <X className="w-3 h-3" />
                </AdminButton>
              </span>
            )}
            <AdminButton
              onClick={clearAllFilters}
              adminVariant="unstyled"
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              {t('admin.clear_all_filters')}
            </AdminButton>
          </div>
        ) : undefined}
      />

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm flex items-center gap-2">
          <X className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Photo Grid/List */}
      <div>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="aspect-[4/5] bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : (
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'
                : 'flex flex-col border border-border rounded-lg overflow-hidden'
            }
          >
            {filteredPhotos.map((photo) =>
              viewMode === 'grid' ? (
                <div
                  key={photo.id}
                  className={`group relative cursor-pointer bg-muted rounded-lg overflow-hidden border-2 transition-all w-full ${
                    selectedIds.has(photo.id)
                      ? 'border-primary ring-2 ring-primary/20'
                      : 'border-transparent hover:border-border'
                  }`}
                  onClick={() => onPreview(photo)}
                >
                  <div className="relative w-full aspect-[4/5]">
                    <img
                      src={resolveAssetUrl(
                        photo.thumbnailUrl || photo.url,
                        resolvedCdnDomain
                      )}
                      alt={photo.title}
                      className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>

                  {/* Checkbox - Clean style without background */}
                  <div
                    className="absolute top-2 left-2 z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(photo.id)}
                      onChange={() => onSelect(photo.id)}
                      className="w-4 h-4 accent-primary cursor-pointer rounded border-2 border-white/80 shadow-sm"
                    />
                  </div>

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                  {/* Action Buttons - Fixed positions */}
                  <div className="absolute top-2 right-2 flex flex-col gap-1.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {/* Star button - toggle featured status */}
                    <AdminButton
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleFeatured(photo)
                      }}
                      adminVariant={photo.isFeatured ? 'iconAccent' : 'iconOnDark'}
                      size="xs"
                      className="p-1.5 backdrop-blur-sm rounded"
                      title={photo.isFeatured ? "Remove from featured" : "Add to featured"}
                    >
                      <Star className={`w-3.5 h-3.5 ${photo.isFeatured ? 'fill-current' : ''}`} />
                    </AdminButton>
                    {/* Delete button - always in same position */}
                    <AdminButton
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(photo.id)
                      }}
                      adminVariant="iconOnDarkDanger"
                      size="xs"
                      className="p-1.5 backdrop-blur-sm rounded"
                      title="Delete photo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </AdminButton>
                  </div>

                  {/* Featured Badge - Always visible when featured, higher z-index than hover overlay */}
                  {photo.isFeatured && (
                    <AdminButton
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleFeatured(photo)
                      }}
                      adminVariant="iconAccent"
                      size="xs"
                      className="absolute top-2 right-2 p-1.5 z-30 shadow-lg group-hover:opacity-0 pointer-events-auto"
                      title="Remove from featured"
                    >
                      <Star className="w-3 h-3 fill-current" />
                    </AdminButton>
                  )}

                  {/* Bottom Info */}
                  <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 pointer-events-none z-10">
                    <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5 truncate">
                      {photo.category.split(',')[0]}
                    </p>
                    <h3 className="text-sm font-medium text-white leading-tight truncate">
                      {photo.title}
                    </h3>
                  </div>
                </div>
              ) : (
                <div
                  key={photo.id}
                  className={`flex items-center gap-4 p-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors cursor-pointer ${
                    selectedIds.has(photo.id) ? 'bg-primary/5' : ''
                  }`}
                  onClick={() => onPreview(photo)}
                >
                  <div
                    className="flex items-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(photo.id)}
                      onChange={() => onSelect(photo.id)}
                      className="w-4 h-4 accent-primary cursor-pointer rounded"
                    />
                  </div>
                  <div className="w-12 h-12 flex-shrink-0 bg-muted rounded overflow-hidden">
                    <img
                      src={resolveAssetUrl(
                        photo.thumbnailUrl || photo.url,
                        resolvedCdnDomain
                      )}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-foreground">
                      {photo.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {photo.category}
                    </p>
                  </div>
                  <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="font-mono">{photo.width} × {photo.height}</span>
                    <span className="uppercase">{photo.storageProvider}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <AdminButton
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleFeatured(photo)
                      }}
                      adminVariant="icon"
                      size="xs"
                      className={`p-2 ${
                        photo.isFeatured ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-500'
                      }`}
                    >
                      <Star className={`w-4 h-4 ${photo.isFeatured ? 'fill-current' : ''}`} />
                    </AdminButton>
                    <AdminButton
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(photo.id)
                      }}
                      adminVariant="iconDestructive"
                      size="xs"
                      className="p-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </AdminButton>
                  </div>
                </div>
              )
            )}
            {filteredPhotos.length === 0 && (
              <div className="col-span-full py-24 flex flex-col items-center justify-center text-muted-foreground">
                <ImageIcon className="w-16 h-16 mb-4 opacity-10" />
                <p className="text-sm font-medium mb-2">
                  {t('admin.no_photos')}
                </p>
                {activeFilterCount > 0 && (
                  <AdminButton
                    onClick={clearAllFilters}
                    adminVariant="link"
                    size="xs"
                    className="text-xs text-primary hover:underline normal-case"
                  >
                    Clear filters to see all photos
                  </AdminButton>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
