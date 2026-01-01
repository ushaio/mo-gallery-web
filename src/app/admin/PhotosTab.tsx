'use client'

import React, { useState, useMemo } from 'react'
import {
  LayoutGrid,
  List as ListIcon,
  Plus,
  Trash2,
  RefreshCw,
  X,
  ImageIcon,
  Star,
  Search,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react'
import { PhotoDto, resolveAssetUrl, PublicSettingsDto } from '@/lib/api'

interface PhotosTabProps {
  photos: PhotoDto[]
  categories: string[]
  loading: boolean
  error: string
  viewMode: 'grid' | 'list'
  selectedIds: Set<string>
  onViewModeChange: (mode: 'grid' | 'list') => void
  onSelect: (id: string) => void
  onSelectAll: () => void
  onDelete: (id?: string) => void
  onRefresh: () => void
  onToggleFeatured: (photo: PhotoDto) => void
  onAdd: () => void
  onPreview: (photo: PhotoDto) => void
  t: (key: string) => string
  settings: PublicSettingsDto | null
}

type SortOption = 'upload-desc' | 'upload-asc' | 'taken-desc' | 'taken-asc'

export function PhotosTab({
  photos,
  categories,
  loading,
  error,
  viewMode,
  selectedIds,
  onViewModeChange,
  onSelect,
  onSelectAll,
  onDelete,
  onRefresh,
  onToggleFeatured,
  onAdd,
  onPreview,
  t,
  settings,
}: PhotosTabProps) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [channelFilter, setChannelFilter] = useState('all')
  const [onlyFeatured, setOnlyFeatured] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('upload-desc')
  const [showFilters, setShowFilters] = useState(false)

  const resolvedCdnDomain = settings?.cdn_domain?.trim() || undefined

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (categoryFilter !== 'all') count++
    if (channelFilter !== 'all') count++
    if (onlyFeatured) count++
    return count
  }, [categoryFilter, channelFilter, onlyFeatured])

  const filteredPhotos = useMemo(() => {
    const filtered = photos.filter((p) => {
      const matchesSearch =
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.category.toLowerCase().includes(search.toLowerCase())

      const matchesCategory =
        categoryFilter === 'all' || p.category.includes(categoryFilter)

      const matchesChannel =
        channelFilter === 'all' || p.storageProvider === channelFilter

      const matchesFeatured = !onlyFeatured || p.isFeatured

      return matchesSearch && matchesCategory && matchesChannel && matchesFeatured
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
  }, [photos, search, categoryFilter, channelFilter, onlyFeatured, sortBy])

  const clearAllFilters = () => {
    setCategoryFilter('all')
    setChannelFilter('all')
    setOnlyFeatured(false)
    setSearch('')
  }

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'upload-desc', label: t('admin.sort_upload_desc') },
    { value: 'upload-asc', label: t('admin.sort_upload_asc') },
    { value: 'taken-desc', label: t('admin.sort_taken_desc') },
    { value: 'taken-asc', label: t('admin.sort_taken_asc') },
  ]

  return (
    <div className="space-y-4">
      {/* Main Toolbar */}
      <div className="bg-muted/30 border border-border rounded-lg p-4">
        {/* Top Row: Selection, Search, Actions */}
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* Left: Selection Info */}
          <div className="flex items-center gap-3 shrink-0">
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
                <button
                  onClick={() => onDelete()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('common.delete')}</span>
                </button>
              </>
            )}
          </div>

          {/* Center: Search */}
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
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border rounded-md transition-all ${
                showFilters || activeFilterCount > 0
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-background border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">{t('ui.category_filter') || 'Filters'}</span>
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center w-5 h-5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* View Mode Toggle */}
            <div className="flex bg-background border border-border rounded-md overflow-hidden">
              <button
                onClick={() => onViewModeChange('grid')}
                className={`p-2 transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                title="Grid view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => onViewModeChange('list')}
                className={`p-2 transition-colors ${
                  viewMode === 'list'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                title="List view"
              >
                <ListIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={onRefresh}
              className="p-2 bg-background border border-border rounded-md text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              title={t('common.refresh')}
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Add New */}
            <button
              onClick={onAdd}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider rounded-md hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{t('admin.add_new')}</span>
            </button>
          </div>
        </div>

        {/* Filter Row - Collapsible */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex flex-wrap items-center gap-3">
              {/* Sort */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Sort:</span>
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
                    {categories.filter(c => c !== 'all' && c !== '全部').map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
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
                    <option value="local">Local</option>
                    <option value="r2">Cloudflare R2</option>
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
                  <button
                    onClick={clearAllFilters}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Clear all</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Active Filters Tags */}
        {activeFilterCount > 0 && !showFilters && (
          <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Active filters:</span>
            {categoryFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                {categoryFilter}
                <button onClick={() => setCategoryFilter('all')} className="hover:text-primary/70">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {channelFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                {channelFilter}
                <button onClick={() => setChannelFilter('all')} className="hover:text-primary/70">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {onlyFeatured && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500/10 text-amber-600 text-xs rounded-md">
                <Star className="w-3 h-3 fill-current" />
                Featured
                <button onClick={() => setOnlyFeatured(false)} className="hover:text-amber-500/70">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            <button
              onClick={clearAllFilters}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm flex items-center gap-2">
          <X className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Photo Grid/List */}
      <div className="overflow-y-auto custom-scrollbar">
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
                  className={`group relative cursor-pointer bg-muted rounded-lg overflow-hidden border-2 transition-all ${
                    selectedIds.has(photo.id)
                      ? 'border-primary ring-2 ring-primary/20'
                      : 'border-transparent hover:border-border'
                  }`}
                  onClick={() => onPreview(photo)}
                >
                  <div className="aspect-[4/5]">
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

                  {/* Featured Badge */}
                  {photo.isFeatured && (
                    <div className="absolute top-2 right-2 p-1.5 bg-amber-500 text-white rounded z-10 shadow-lg">
                      <Star className="w-3 h-3 fill-current" />
                    </div>
                  )}

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                  {/* Action Buttons - Fixed positions */}
                  <div className="absolute top-2 right-2 flex flex-col gap-1.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {/* Star button - always takes space, visible only when not featured */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleFeatured(photo)
                      }}
                      className={`p-1.5 bg-black/60 backdrop-blur-sm text-white hover:text-amber-400 rounded transition-colors ${
                        photo.isFeatured ? 'invisible' : ''
                      }`}
                      title="Add to featured"
                    >
                      <Star className="w-3.5 h-3.5" />
                    </button>
                    {/* Delete button - always in same position */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(photo.id)
                      }}
                      className="p-1.5 bg-black/60 backdrop-blur-sm text-white hover:text-destructive rounded transition-colors"
                      title="Delete photo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

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
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleFeatured(photo)
                      }}
                      className={`p-2 rounded hover:bg-muted transition-colors ${
                        photo.isFeatured ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-500'
                      }`}
                    >
                      <Star className={`w-4 h-4 ${photo.isFeatured ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(photo.id)
                      }}
                      className="p-2 text-muted-foreground hover:text-destructive rounded hover:bg-muted transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
                  <button
                    onClick={clearAllFilters}
                    className="text-xs text-primary hover:underline"
                  >
                    Clear filters to see all photos
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}