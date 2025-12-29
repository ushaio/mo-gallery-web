'use client'

import React, { useState, useMemo } from 'react'
import {
  LayoutGrid,
  List as ListIcon,
  Plus,
  Trash2,
  Globe,
  X,
  ImageIcon,
  Star,
  Search,
  Filter,
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
  const [categoryFilter, setCategoryFilter] = useState('全部')
  const [channelFilter, setChannelFilter] = useState('全部')
  const [onlyFeatured, setOnlyFeatured] = useState(false)

  const resolvedCdnDomain = settings?.cdn_domain?.trim() || undefined

  const filteredPhotos = useMemo(() => {
    return photos.filter((p) => {
      const matchesSearch =
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.category.toLowerCase().includes(search.toLowerCase())
      
      const matchesCategory =
        categoryFilter === '全部' || p.category.includes(categoryFilter)
      
      const matchesChannel =
        channelFilter === '全部' || p.storageProvider === channelFilter
      
      const matchesFeatured = !onlyFeatured || p.isFeatured

      return matchesSearch && matchesCategory && matchesChannel && matchesFeatured
    })
  }, [photos, search, categoryFilter, channelFilter, onlyFeatured])

  return (
    <div className="space-y-6">
      {/* Integrated Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-border pb-6">
        {/* Left: Items info & Selection actions */}
        <div className="flex items-center space-x-6 shrink-0">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filteredPhotos.length > 0 && selectedIds.size === filteredPhotos.length}
              onChange={onSelectAll}
              className="w-4 h-4 accent-primary cursor-pointer"
            />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
              {selectedIds.size > 0
                ? `${selectedIds.size} Selected`
                : `${filteredPhotos.length} Items`}
            </span>
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-4">
              <div className="h-4 w-[1px] bg-border"></div>
              <button
                onClick={() => onDelete()}
                className="text-destructive hover:opacity-80 transition-opacity flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          )}
        </div>

        {/* Right: Search, Filters, Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-1 lg:justify-end">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={t('common.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-muted/30 border border-border focus:border-primary outline-none text-xs font-mono transition-all"
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {/* Category Filter */}
            <div className="relative group">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 bg-muted/30 border border-border focus:border-primary outline-none text-xs font-mono cursor-pointer transition-all hover:bg-muted/50"
              >
                <option value="全部">分类: {t('gallery.all')}</option>
                {categories.filter(c => c !== '全部').map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none group-hover:text-foreground transition-colors" />
            </div>

            {/* Channel Filter */}
            <div className="relative group">
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 bg-muted/30 border border-border focus:border-primary outline-none text-xs font-mono cursor-pointer transition-all hover:bg-muted/50"
              >
                <option value="全部">渠道: 全部</option>
                <option value="local">Local</option>
                <option value="r2">Cloudflare R2</option>
                <option value="github">GitHub</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none group-hover:text-foreground transition-colors" />
            </div>

            {/* Featured Filter (Switch) */}
            <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 border border-border">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                {t('admin.feat')}
              </span>
              <button
                onClick={() => setOnlyFeatured(!onlyFeatured)}
                className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                  onlyFeatured ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`pointer-events-none block h-3 w-3 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                    onlyFeatured ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="h-6 w-[1px] bg-border mx-1 hidden md:block"></div>

            <div className="flex items-center gap-2">
              <div className="flex bg-muted p-1 border border-border">
                <button
                  onClick={() => onViewModeChange('grid')}
                  className={`p-1.5 transition-all ${
                    viewMode === 'grid'
                      ? 'bg-background text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onViewModeChange('list')}
                  className={`p-1.5 transition-all ${
                    viewMode === 'list'
                      ? 'bg-background text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <ListIcon className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                className="p-2 border border-border hover:text-primary hover:border-primary transition-colors text-muted-foreground"
                onClick={onRefresh}
                title={t('common.refresh')}
              >
                <Globe className="w-4 h-4" />
              </button>

              <button
                onClick={onAdd}
                className="flex items-center px-4 py-2 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all ml-2"
              >
                <Plus className="w-3.5 h-3.5 mr-2" />
                {t('admin.add_new')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 border border-destructive text-destructive text-xs tracking-widest uppercase flex items-center space-x-2">
          <X className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="aspect-[4/5] bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4'
                : 'flex flex-col border border-border'
            }
          >
            {filteredPhotos.map((photo) =>
              viewMode === 'grid' ? (
                <div
                  key={photo.id}
                  className={`group relative cursor-pointer bg-muted border overflow-hidden ${
                    selectedIds.has(photo.id)
                      ? 'border-primary ring-1 ring-primary'
                      : 'border-transparent'
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
                      className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 grayscale group-hover:grayscale-0"
                      loading="lazy"
                    />
                  </div>
                  <div
                    className="absolute top-2 left-2 z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(photo.id)}
                      onChange={() => onSelect(photo.id)}
                      className="w-4 h-4 accent-primary cursor-pointer border-white"
                    />
                  </div>
                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                  {/* Action Buttons */}
                  <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleFeatured(photo)
                      }}
                      className={`p-2 bg-black/50 backdrop-blur-sm text-white hover:text-amber-500 transition-colors ${
                        photo.isFeatured ? 'text-amber-500' : ''
                      }`}
                    >
                      <Star
                        className={`w-4 h-4 ${
                          photo.isFeatured ? 'fill-current' : ''
                        }`}
                      />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(photo.id)
                      }}
                      className="p-2 bg-black/50 backdrop-blur-sm text-white hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Bottom Info */}
                  <div className="absolute bottom-0 left-0 w-full p-4 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-4 group-hover:translate-y-0 pointer-events-none z-10">
                    <p className="text-[9px] font-black text-primary uppercase tracking-[0.3em] mb-1">
                      {photo.category.split(',')[0]}
                    </p>
                    <h3 className="text-sm font-serif text-white leading-tight truncate">
                      {photo.title}
                    </h3>
                  </div>
                  {photo.isFeatured && (
                    <div className="absolute top-2 left-8 px-1.5 py-0.5 bg-amber-500 text-white text-[8px] font-black uppercase tracking-widest z-10">
                      {t('admin.feat')}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  key={photo.id}
                  className={`flex items-center gap-4 p-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer ${
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
                      className="w-4 h-4 accent-primary cursor-pointer"
                    />
                  </div>
                  <div className="w-12 h-12 flex-shrink-0 bg-muted border border-border overflow-hidden">
                    <img
                      src={resolveAssetUrl(
                        photo.thumbnailUrl || photo.url,
                        resolvedCdnDomain
                      )}
                      alt=""
                      className="w-full h-full object-cover grayscale"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold uppercase tracking-widest truncate text-foreground">
                      {photo.title}
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase">
                      {photo.category}
                    </p>
                  </div>
                  <div className="hidden md:block text-[10px] font-mono text-muted-foreground w-32">
                    {photo.width} × {photo.height}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleFeatured(photo)
                      }}
                      className={`p-2 hover:bg-muted transition-colors ${
                        photo.isFeatured
                          ? 'text-amber-500'
                          : 'text-muted-foreground'
                      }`}
                    >
                      <Star
                        className={`w-4 h-4 ${
                          photo.isFeatured ? 'fill-current' : ''
                        }`}
                      />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(photo.id)
                      }}
                      className="p-2 text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            )}
            {filteredPhotos.length === 0 && (
              <div className="col-span-full py-24 flex flex-col items-center justify-center text-muted-foreground">
                <ImageIcon className="w-12 h-12 mb-4 opacity-10" />
                <p className="text-xs font-bold uppercase tracking-widest">
                  {t('admin.no_photos')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}