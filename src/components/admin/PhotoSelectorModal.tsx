'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Image as ImageIcon,
  X,
  Search,
  SlidersHorizontal,
  ChevronDown,
  Star,
  RefreshCw,
  LayoutGrid,
  List as ListIcon,
} from 'lucide-react'
import { getPhotos, getAlbums, resolveAssetUrl, type PhotoDto, type AlbumDto } from '@/lib/api'
import { useSettings } from '@/contexts/SettingsContext'
import { AdminButton } from '@/components/admin/AdminButton'

interface PhotoSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (selectedPhotoIds: string[]) => void
  initialSelectedPhotoIds?: string[]
  t: (key: string) => string
  title?: string
  confirmText?: string
  multiple?: boolean
  categories?: string[]
}

type SortOption = 'upload-desc' | 'upload-asc' | 'taken-desc' | 'taken-asc'
type ViewMode = 'grid' | 'list'

export function PhotoSelectorModal({
  isOpen,
  onClose,
  onConfirm,
  initialSelectedPhotoIds = [],
  t,
  title,
  confirmText,
  multiple = true,
  categories = [],
}: PhotoSelectorModalProps) {
  const { settings } = useSettings()
  const [allPhotos, setAllPhotos] = useState<PhotoDto[]>([])
  const [albums, setAlbums] = useState<AlbumDto[]>([])
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  // Filter states
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [channelFilter, setChannelFilter] = useState('all')
  const [albumFilter, setAlbumFilter] = useState('all')
  const [onlyFeatured, setOnlyFeatured] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('upload-desc')
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  useEffect(() => {
    if (isOpen) {
      loadPhotos()
      loadAlbums()
    }
  }, [isOpen])

  // Initialize selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedPhotoIds([...initialSelectedPhotoIds])
    } else {
      setSelectedPhotoIds([])
      // Reset filters when modal closes
      setSearch('')
      setCategoryFilter('all')
      setChannelFilter('all')
      setAlbumFilter('all')
      setOnlyFeatured(false)
      setSortBy('upload-desc')
      setShowFilters(false)
    }
  }, [isOpen, initialSelectedPhotoIds])

  async function loadPhotos() {
    try {
      setLoading(true)
      const data = await getPhotos({ all: true })
      setAllPhotos(data)
    } catch (err) {
      console.error('Failed to load photos:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadAlbums() {
    try {
      const data = await getAlbums()
      setAlbums(data)
    } catch (err) {
      console.error('Failed to load albums:', err)
    }
  }

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (categoryFilter !== 'all') count++
    if (channelFilter !== 'all') count++
    if (albumFilter !== 'all') count++
    if (onlyFeatured) count++
    return count
  }, [categoryFilter, channelFilter, albumFilter, onlyFeatured])

  // Get unique categories from photos
  const photoCategories = useMemo(() => {
    if (categories.length > 0) return categories
    const cats = new Set<string>()
    allPhotos.forEach(p => {
      p.category.split(',').forEach(c => {
        const trimmed = c.trim()
        if (trimmed && trimmed !== 'all' && trimmed !== '全部') {
          cats.add(trimmed)
        }
      })
    })
    return Array.from(cats).sort()
  }, [allPhotos, categories])

  // Get album photo IDs for filtering
  const albumPhotoIds = useMemo(() => {
    if (albumFilter === 'all') return null
    const album = albums.find(a => a.id === albumFilter)
    if (!album) return null
    return new Set(album.photos.map(p => p.id))
  }, [albumFilter, albums])

  // Filter and sort photos
  const filteredPhotos = useMemo(() => {
    const filtered = allPhotos.filter((p) => {
      const matchesSearch =
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.category.toLowerCase().includes(search.toLowerCase())

      const matchesCategory =
        categoryFilter === 'all' || p.category.includes(categoryFilter)

      const matchesChannel =
        channelFilter === 'all' || p.storageProvider === channelFilter

      const matchesAlbum =
        albumPhotoIds === null || albumPhotoIds.has(p.id)

      const matchesFeatured = !onlyFeatured || p.isFeatured

      return matchesSearch && matchesCategory && matchesChannel && matchesAlbum && matchesFeatured
    })

    // Apply sorting
    return filtered.sort((a, b) => {
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
  }, [allPhotos, search, categoryFilter, channelFilter, albumPhotoIds, onlyFeatured, sortBy])

  const clearAllFilters = () => {
    setCategoryFilter('all')
    setChannelFilter('all')
    setAlbumFilter('all')
    setOnlyFeatured(false)
    setSearch('')
  }

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'upload-desc', label: t('admin.sort_upload_desc') },
    { value: 'upload-asc', label: t('admin.sort_upload_asc') },
    { value: 'taken-desc', label: t('admin.sort_taken_desc') },
    { value: 'taken-asc', label: t('admin.sort_taken_asc') },
  ]

  function handlePhotoClick(photoId: string) {
    if (multiple) {
      setSelectedPhotoIds(prev => {
        const index = prev.indexOf(photoId)
        if (index !== -1) {
          // Remove from selection
          return prev.filter(id => id !== photoId)
        } else {
          // Add to selection
          return [...prev, photoId]
        }
      })
    } else {
      // Single selection mode
      setSelectedPhotoIds([photoId])
    }
  }

  // Get the selection order index for a photo (1-based)
  function getSelectionIndex(photoId: string): number {
    return selectedPhotoIds.indexOf(photoId) + 1
  }

  function handleConfirm() {
    onConfirm(selectedPhotoIds)
    onClose()
  }

  function handleClose() {
    setSelectedPhotoIds([])
    onClose()
  }

  function handleRefresh() {
    loadPhotos()
    loadAlbums()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="relative bg-background border border-border rounded-lg shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <ImageIcon className="w-5 h-5 text-primary" />
            <h3 className="font-bold">{title || t('admin.select_photos')}</h3>
            {selectedPhotoIds.length > 0 && (
              <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded">
                {selectedPhotoIds.length} {t('admin.selected')}
              </span>
            )}
          </div>
          <AdminButton
            onClick={handleClose}
            adminVariant="icon"
            className="p-2 hover:bg-muted rounded-md"
          >
            <X className="w-4 h-4" />
          </AdminButton>
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-border bg-muted/30">
          {/* Top Row: Search and Actions */}
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            {/* Search */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={t('common.search')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 pl-9 pr-4 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
                {search && (
                  <AdminButton
                    onClick={() => setSearch('')}
                    adminVariant="icon"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </AdminButton>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Filter Toggle */}
              <AdminButton
                onClick={() => setShowFilters(!showFilters)}
                adminVariant="outlineMuted"
                size="md"
                className={`flex items-center gap-2 rounded-md ${
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
                  onClick={() => setViewMode('grid')}
                  adminVariant="icon"
                  className={`p-2 ${
                    viewMode === 'grid'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                  title={t('admin.grid_view')}
                >
                  <LayoutGrid className="w-4 h-4" />
                </AdminButton>
                <AdminButton
                  onClick={() => setViewMode('list')}
                  adminVariant="icon"
                  className={`p-2 ${
                    viewMode === 'list'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                  title={t('admin.list_view')}
                >
                  <ListIcon className="w-4 h-4" />
                </AdminButton>
              </div>

              {/* Refresh */}
              <AdminButton
                onClick={handleRefresh}
                adminVariant="icon"
                className="p-2 bg-background border border-border rounded-md text-muted-foreground hover:text-foreground hover:border-foreground/30"
                title={t('common.refresh')}
              >
                <RefreshCw className="w-4 h-4" />
              </AdminButton>

              {/* Photo Count */}
              <span className="text-xs text-muted-foreground px-2">
                {filteredPhotos.length} {t('admin.photos')}
              </span>
            </div>
          </div>

          {/* Filter Row - Collapsible */}
          {showFilters && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="flex flex-wrap items-center gap-3">
                {/* Sort */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{t('admin.sort')}:</span>
                  <div className="relative">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      className="appearance-none h-8 pl-3 pr-8 bg-background border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                    >
                      {sortOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                <div className="h-5 w-px bg-border hidden sm:block" />

                {/* Category Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{t('ui.category_filter')}:</span>
                  <div className="relative">
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className={`appearance-none h-8 pl-3 pr-8 border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer ${
                        categoryFilter !== 'all' 
                          ? 'bg-primary/10 border-primary/30 text-primary' 
                          : 'bg-background border-border'
                      }`}
                    >
                      <option value="all">{t('gallery.all')}</option>
                      {photoCategories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                {/* Album Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{t('admin.album') || 'Album'}:</span>
                  <div className="relative">
                    <select
                      value={albumFilter}
                      onChange={(e) => setAlbumFilter(e.target.value)}
                      className={`appearance-none h-8 pl-3 pr-8 border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer ${
                        albumFilter !== 'all' 
                          ? 'bg-primary/10 border-primary/30 text-primary' 
                          : 'bg-background border-border'
                      }`}
                    >
                      <option value="all">{t('gallery.all')}</option>
                      {albums.map((album) => (
                        <option key={album.id} value={album.id}>{album.name} ({album.photoCount})</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                {/* Storage Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{t('ui.channel_filter')}:</span>
                  <div className="relative">
                    <select
                      value={channelFilter}
                      onChange={(e) => setChannelFilter(e.target.value)}
                      className={`appearance-none h-8 pl-3 pr-8 border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer ${
                        channelFilter !== 'all' 
                          ? 'bg-primary/10 border-primary/30 text-primary' 
                          : 'bg-background border-border'
                      }`}
                    >
                      <option value="all">{t('gallery.all')}</option>
                      <option value="local">{t('admin.local_storage')}</option>
                      <option value="s3">S3</option>
                      <option value="github">GitHub</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                {/* Featured Toggle */}
                <label className={`flex items-center gap-2 px-3 py-1.5 border rounded-md cursor-pointer transition-colors ${
                  onlyFeatured 
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-600' 
                    : 'bg-background border-border text-muted-foreground hover:text-foreground'
                }`}>
                  <Star className={`w-3.5 h-3.5 ${onlyFeatured ? 'fill-current' : ''}`} />
                  <span className="text-xs font-medium">{t('admin.featured')}</span>
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
                      adminVariant="ghost"
                      size="sm"
                      className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{t('admin.clear_all')}</span>
                    </AdminButton>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Active Filters Tags */}
          {activeFilterCount > 0 && !showFilters && (
            <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('admin.active_filters')}:</span>
              {categoryFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                  {categoryFilter}
                  <AdminButton onClick={() => setCategoryFilter('all')} adminVariant="icon" className="hover:text-primary/70">
                    <X className="w-3 h-3" />
                  </AdminButton>
                </span>
              )}
              {albumFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                  {albums.find(a => a.id === albumFilter)?.name || albumFilter}
                  <AdminButton onClick={() => setAlbumFilter('all')} adminVariant="icon" className="hover:text-primary/70">
                    <X className="w-3 h-3" />
                  </AdminButton>
                </span>
              )}
              {channelFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                  {channelFilter}
                  <AdminButton onClick={() => setChannelFilter('all')} adminVariant="icon" className="hover:text-primary/70">
                    <X className="w-3 h-3" />
                  </AdminButton>
                </span>
              )}
              {onlyFeatured && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500/10 text-amber-600 text-xs rounded-md">
                  <Star className="w-3 h-3 fill-current" />
                  {t('admin.featured')}
                  <AdminButton onClick={() => setOnlyFeatured(false)} adminVariant="icon" className="hover:text-amber-500/70">
                    <X className="w-3 h-3" />
                  </AdminButton>
                </span>
              )}
              <AdminButton
                onClick={clearAllFilters}
                adminVariant="link"
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                {t('admin.clear_all')}
              </AdminButton>
            </div>
          )}
        </div>

        {/* Modal Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : filteredPhotos.length > 0 ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-2">
                {filteredPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    onClick={() => handlePhotoClick(photo.id)}
                    className={`relative aspect-square cursor-pointer rounded-lg overflow-hidden border-2 transition-all group ${
                      selectedPhotoIds.includes(photo.id)
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'border-transparent hover:border-border'
                    }`}
                  >
                    <img
                      src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
                      alt={photo.title}
                      className="w-full h-full object-cover"
                    />
                    {/* Featured Badge */}
                    {photo.isFeatured && (
                      <div className="absolute top-1 right-1 p-1 bg-amber-500 text-white rounded z-10">
                        <Star className="w-2.5 h-2.5 fill-current" />
                      </div>
                    )}
                    {/* Selection Indicator */}
                    {selectedPhotoIds.includes(photo.id) && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <div className="w-7 h-7 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg">
                          <span className="text-sm font-bold">{getSelectionIndex(photo.id)}</span>
                        </div>
                      </div>
                    )}
                    {/* Hover Info */}
                    <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <p className="text-[9px] text-white truncate">{photo.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col border border-border rounded-lg overflow-hidden">
                {filteredPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    onClick={() => handlePhotoClick(photo.id)}
                    className={`flex items-center gap-3 p-2 border-b border-border last:border-0 hover:bg-muted/50 transition-colors cursor-pointer ${
                      selectedPhotoIds.includes(photo.id) ? 'bg-primary/5' : ''
                    }`}
                  >
                    {/* Selection Number */}
                    <div className="w-6 h-6 flex items-center justify-center">
                      {selectedPhotoIds.includes(photo.id) ? (
                        <div className="w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center">
                          <span className="text-xs font-bold">{getSelectionIndex(photo.id)}</span>
                        </div>
                      ) : (
                        <div className="w-5 h-5 border-2 border-border rounded-full" />
                      )}
                    </div>
                    {/* Thumbnail */}
                    <div className="w-10 h-10 flex-shrink-0 bg-muted rounded overflow-hidden">
                      <img
                        src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-foreground">
                        {photo.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {photo.category}
                      </p>
                    </div>
                    {/* Meta */}
                    <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-mono">{photo.width} × {photo.height}</span>
                      {photo.isFeatured && (
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ImageIcon className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm">{t('admin.no_photos_available')}</p>
              {activeFilterCount > 0 && (
                <AdminButton
                  onClick={clearAllFilters}
                  adminVariant="link"
                  className="mt-2 text-xs text-primary"
                >
                  {t('admin.clear_filters_hint')}
                </AdminButton>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
          <AdminButton
            onClick={handleClose}
            adminVariant="link"
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {t('common.cancel')}
          </AdminButton>
          <AdminButton
            onClick={handleConfirm}
            disabled={selectedPhotoIds.length === 0}
            adminVariant="primary"
            size="md"
            className="rounded-md text-sm"
          >
            {confirmText || t('admin.add')} {multiple && `(${selectedPhotoIds.length})`}
          </AdminButton>
        </div>
      </div>
    </div>
  )
}
