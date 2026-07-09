'use client'

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
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
import { resolveAssetUrl } from '@/lib/api/core'
import { getAlbums } from '@/lib/api/albums'
import { getCameras, getLenses } from '@/lib/api/equipment'
import {
  MAX_PHOTO_GRID_COLUMNS,
  MIN_PHOTO_GRID_COLUMNS,
  type PhotosSortOption,
  useAdminPreferenceStore,
  useAdminSessionPreferenceStore,
} from '@/lib/admin-preferences'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminSelect } from '@/components/admin/AdminFormControls'
import { AdminCollectionToolbar } from '@/components/admin/AdminCollectionToolbar'
import type { PhotoDto, AlbumDto, AdminSettingsDto, CameraDto, LensDto } from '@/lib/api/types'

type ViewMode = 'grid' | 'list'

const PHOTO_GRID_CLASS_NAME =
  'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-[repeat(var(--admin-photo-grid-columns),minmax(0,1fr))] gap-0.5'

const GRID_OBSERVER_ROOT_MARGIN = '1000px'

function LazyGridCard({
  photo,
  isSelected,
  resolvedCdnDomain,
  onSelect,
  onDelete,
  onToggleFeatured,
  onClick,
}: PhotoGridCardProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: GRID_OBSERVER_ROOT_MARGIN },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (!visible) {
    return (
      <div
        ref={sentinelRef}
        className="bg-muted rounded-lg w-full aspect-[4/5]"
      />
    )
  }

  return (
    <PhotoGridCard
      photo={photo}
      isSelected={isSelected}
      resolvedCdnDomain={resolvedCdnDomain}
      onSelect={onSelect}
      onDelete={onDelete}
      onToggleFeatured={onToggleFeatured}
      onClick={onClick}
    />
  )
}

interface PhotoGridCardProps {
  photo: PhotoDto
  isSelected: boolean
  resolvedCdnDomain: string | undefined
  onSelect: (id: string, shiftKey?: boolean) => void
  onDelete: (id: string) => void
  onToggleFeatured: (photo: PhotoDto) => void
  onClick: (event: React.MouseEvent, photo: PhotoDto) => void
}

const PhotoGridCard = React.memo(function PhotoGridCard({
  photo,
  isSelected,
  resolvedCdnDomain,
  onSelect,
  onDelete,
  onToggleFeatured,
  onClick,
}: PhotoGridCardProps) {
  return (
    <div
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 300px' }}
      className={`group relative cursor-pointer bg-muted rounded-lg overflow-hidden border-2 transition-colors w-full ${
        isSelected
          ? 'border-primary'
          : 'border-transparent hover:border-border'
      }`}
      onClick={(event) => onClick(event, photo)}
    >
      <div className="relative w-full aspect-[4/5]">
        <img
          src={resolveAssetUrl(
            photo.thumbnailUrl || photo.url,
            resolvedCdnDomain
          )}
          alt={photo.title}
          className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          decoding="async"
        />
      </div>

      <div
        className="absolute top-2 left-2 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onClick={(event) => onSelect(photo.id, event.shiftKey)}
          onChange={() => undefined}
          className="w-4 h-4 accent-primary cursor-pointer rounded border-2 border-white/80 shadow-sm"
        />
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      <div className="absolute top-2 right-2 flex flex-col gap-1.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
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

      <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-[opacity,transform] duration-300 translate-y-2 group-hover:translate-y-0 pointer-events-none z-10">
        <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5 truncate">
          {photo.category.split(',')[0]}
        </p>
        <h3 className="text-sm font-medium text-white leading-tight truncate">
          {photo.title}
        </h3>
      </div>
    </div>
  )
}, (prev, next) => {
  return (
    prev.photo.id === next.photo.id &&
    prev.isSelected === next.isSelected &&
    prev.photo.isFeatured === next.photo.isFeatured &&
    prev.photo.thumbnailUrl === next.photo.thumbnailUrl &&
    prev.photo.url === next.photo.url &&
    prev.photo.title === next.photo.title &&
    prev.photo.category === next.photo.category &&
    prev.resolvedCdnDomain === next.resolvedCdnDomain &&
    prev.onSelect === next.onSelect &&
    prev.onDelete === next.onDelete &&
    prev.onToggleFeatured === next.onToggleFeatured &&
    prev.onClick === next.onClick
  )
})

interface PhotoListRowProps {
  photo: PhotoDto
  isSelected: boolean
  resolvedCdnDomain: string | undefined
  onSelect: (id: string, shiftKey?: boolean) => void
  onDelete: (id: string) => void
  onToggleFeatured: (photo: PhotoDto) => void
  onClick: (event: React.MouseEvent, photo: PhotoDto) => void
}

const PhotoListRow = React.memo(function PhotoListRow({
  photo,
  isSelected,
  resolvedCdnDomain,
  onSelect,
  onDelete,
  onToggleFeatured,
  onClick,
}: PhotoListRowProps) {
  return (
    <div
      className={`flex items-center gap-4 p-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors cursor-pointer ${
        isSelected ? 'bg-primary/5' : ''
      }`}
      onClick={(event) => onClick(event, photo)}
    >
      <div
        className="flex items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onClick={(event) => onSelect(photo.id, event.shiftKey)}
          onChange={() => undefined}
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
          decoding="async"
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
}, (prev, next) => {
  return (
    prev.photo.id === next.photo.id &&
    prev.isSelected === next.isSelected &&
    prev.photo.isFeatured === next.photo.isFeatured &&
    prev.photo.thumbnailUrl === next.photo.thumbnailUrl &&
    prev.photo.url === next.photo.url &&
    prev.photo.title === next.photo.title &&
    prev.photo.category === next.photo.category &&
    prev.photo.width === next.photo.width &&
    prev.photo.height === next.photo.height &&
    prev.photo.storageProvider === next.photo.storageProvider &&
    prev.resolvedCdnDomain === next.resolvedCdnDomain &&
    prev.onSelect === next.onSelect &&
    prev.onDelete === next.onDelete &&
    prev.onToggleFeatured === next.onToggleFeatured &&
    prev.onClick === next.onClick
  )
})

interface PhotosTabProps {
  photos: PhotoDto[]
  categories: string[]
  loading: boolean
  error: string
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  selectedIds: Set<string>
  onSelect: (id: string) => void
  onSelectionChange: React.Dispatch<React.SetStateAction<Set<string>>>
  onDelete: (id?: string) => void
  onBatchAction: () => void
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
  onSelectionChange,
  onDelete,
  onBatchAction,
  onRefresh,
  onToggleFeatured,
  onPreview,
  t,
  settings,
  notify,
}: PhotosTabProps) {
  const photosFilters = useAdminSessionPreferenceStore((state) => state.photosFilters)
  const setPhotosFilters = useAdminSessionPreferenceStore((state) => state.setPhotosFilters)
  const gridColumns = useAdminPreferenceStore((state) => state.photoGridColumns)
  const setPhotoGridColumns = useAdminPreferenceStore((state) => state.setPhotoGridColumns)
  const [albums, setAlbums] = useState<AlbumDto[]>([])
  const [cameras, setCameras] = useState<CameraDto[]>([])
  const [lenses, setLenses] = useState<LensDto[]>([])
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [toolbarScrolled, setToolbarScrolled] = useState(false)
  const gridContainerRef = useRef<HTMLDivElement>(null)
  const sliderRef = useRef<HTMLInputElement>(null)
  const columnsLabelRef = useRef<HTMLSpanElement>(null)
  const pendingColumnsRef = useRef<number>(gridColumns)
  const rafIdRef = useRef(0)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('[data-search-input]')?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleScroll = useCallback(() => {
    setToolbarScrolled((scrollContainerRef.current?.scrollTop ?? 0) > 0)
  }, [])

  const {
    search,
    categoryFilter,
    photoTypeFilter,
    channelFilter,
    albumFilter,
    cameraFilter,
    lensFilter,
    onlyFeatured,
    sortBy,
    showFilters,
  } = photosFilters

  const setSearch = useCallback((value: string) => setPhotosFilters({ search: value }), [setPhotosFilters])
  const setCategoryFilter = useCallback((value: string) => setPhotosFilters({ categoryFilter: value }), [setPhotosFilters])
  const setPhotoTypeFilter = useCallback((value: string) => setPhotosFilters({ photoTypeFilter: value }), [setPhotosFilters])
  const setChannelFilter = useCallback((value: string) => setPhotosFilters({ channelFilter: value }), [setPhotosFilters])
  const setAlbumFilter = useCallback((value: string) => setPhotosFilters({ albumFilter: value }), [setPhotosFilters])
  const setCameraFilter = useCallback((value: string) => setPhotosFilters({ cameraFilter: value }), [setPhotosFilters])
  const setLensFilter = useCallback((value: string) => setPhotosFilters({ lensFilter: value }), [setPhotosFilters])
  const setOnlyFeatured = useCallback((value: boolean) => setPhotosFilters({ onlyFeatured: value }), [setPhotosFilters])
  const setSortBy = useCallback((value: PhotosSortOption) => setPhotosFilters({ sortBy: value }), [setPhotosFilters])
  const setShowFilters = useCallback((value: boolean) => setPhotosFilters({ showFilters: value }), [setPhotosFilters])

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafIdRef.current)
      setPhotoGridColumns(pendingColumnsRef.current)
    }
  }, [setPhotoGridColumns])

  const resolvedCdnDomain = settings?.cdn_domain?.trim() || undefined

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
      label: c.displayName
    }))
  }, [cameras])

  // Lens options from API
  const lensOptions = useMemo(() => {
    return lenses.map(l => ({
      value: l.id,
      label: l.displayName
    }))
  }, [lenses])

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (categoryFilter !== 'all') count++
    if (photoTypeFilter !== 'all') count++
    if (channelFilter !== 'all') count++
    if (albumFilter !== 'all') count++
    if (cameraFilter !== 'all') count++
    if (lensFilter !== 'all') count++
    if (onlyFeatured) count++
    return count
  }, [categoryFilter, photoTypeFilter, channelFilter, albumFilter, cameraFilter, lensFilter, onlyFeatured])

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

      const matchesPhotoType =
        photoTypeFilter === 'all' || (p.photoType ?? 'digital') === photoTypeFilter

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

      return matchesSearch && matchesCategory && matchesPhotoType && matchesChannel && matchesAlbum && matchesCamera && matchesLens && matchesFeatured
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
  }, [photos, search, categoryFilter, photoTypeFilter, channelFilter, albumPhotoIds, cameraFilter, lensFilter, onlyFeatured, sortBy])

  const clearAllFilters = () => {
    setPhotosFilters({
      search: '',
      categoryFilter: 'all',
      photoTypeFilter: 'all',
      channelFilter: 'all',
      albumFilter: 'all',
      cameraFilter: 'all',
      lensFilter: 'all',
      onlyFeatured: false,
    })
  }

  const sortOptions: { value: PhotosSortOption; label: string }[] = [
    { value: 'upload-desc', label: t('admin.sort_upload_desc') },
    { value: 'upload-asc', label: t('admin.sort_upload_asc') },
    { value: 'taken-desc', label: t('admin.sort_taken_desc') },
    { value: 'taken-asc', label: t('admin.sort_taken_asc') },
  ]

  const handleSelectPhoto = useCallback((photoId: string, shiftKey = false) => {
    if (!shiftKey || !lastSelectedId) {
      onSelect(photoId)
      setLastSelectedId(photoId)
      return
    }

    const startIndex = filteredPhotos.findIndex((photo) => photo.id === lastSelectedId)
    const endIndex = filteredPhotos.findIndex((photo) => photo.id === photoId)

    if (startIndex === -1 || endIndex === -1) {
      onSelect(photoId)
      setLastSelectedId(photoId)
      return
    }

    const [rangeStart, rangeEnd] = startIndex < endIndex
      ? [startIndex, endIndex]
      : [endIndex, startIndex]
    const rangeIds = filteredPhotos.slice(rangeStart, rangeEnd + 1).map((photo) => photo.id)
    const shouldSelectRange = !selectedIds.has(photoId)

    onSelectionChange((prev) => {
      const next = new Set(prev)
      for (const id of rangeIds) {
        if (shouldSelectRange) next.add(id)
        else next.delete(id)
      }
      return next
    })
    setLastSelectedId(photoId)
  }, [filteredPhotos, lastSelectedId, onSelect, onSelectionChange, selectedIds])

  const handlePhotoClick = useCallback((event: React.MouseEvent, photo: PhotoDto) => {
    if (event.shiftKey) {
      event.preventDefault()
      handleSelectPhoto(photo.id, true)
      return
    }
    onPreview(photo)
  }, [handleSelectPhoto, onPreview])

  const hasSelectedPhotos = selectedIds.size >= 1

  // 全选只作用于当前筛选结果；勾选态也按"筛选结果是否全部选中"计算，
  // 避免选中集合里残留不可见照片时批量操作误伤。
  const allVisibleSelected =
    filteredPhotos.length > 0 && filteredPhotos.every((photo) => selectedIds.has(photo.id))

  const handleToggleSelectAll = useCallback(() => {
    onSelectionChange((prev) => {
      const visibleIds = filteredPhotos.map((photo) => photo.id)
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id))
      return allSelected ? new Set<string>() : new Set(visibleIds)
    })
  }, [filteredPhotos, onSelectionChange])

  // 筛选条件变化时清空选中，防止批量删除命中已被筛掉的照片
  useEffect(() => {
    onSelectionChange(new Set())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryFilter, photoTypeFilter, channelFilter, albumFilter, cameraFilter, lensFilter, onlyFeatured])

  const handleGridColumnsChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value)
    pendingColumnsRef.current = value
    if (columnsLabelRef.current) {
      columnsLabelRef.current.textContent = String(value)
    }
    cancelAnimationFrame(rafIdRef.current)
    rafIdRef.current = requestAnimationFrame(() => {
      if (gridContainerRef.current) {
        gridContainerRef.current.style.setProperty('--admin-photo-grid-columns', String(value))
      }
    })
  }, [])

  const persistGridColumns = useCallback(() => {
    const value = pendingColumnsRef.current
    if (value !== gridColumns) {
      setPhotoGridColumns(value)
    }
  }, [gridColumns, setPhotoGridColumns])

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      <AdminCollectionToolbar
        scrolled={toolbarScrolled}
        info={(
          <>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={handleToggleSelectAll}
                className="w-4 h-4 accent-primary cursor-pointer rounded"
              />
              <span className="text-sm font-medium text-muted-foreground">
                {filteredPhotos.length} {t('admin.photos')}
              </span>
            </label>
          </>
        )}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('common.search')}
        actions={(
          <>
            {/* Sort */}
            <AdminSelect
              value={sortBy}
              onChange={(v) => setSortBy(v as PhotosSortOption)}
              options={sortOptions.map(opt => ({ value: opt.value, label: opt.label }))}
              className="min-w-[140px]"
            />

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

            <div className="h-5 w-px bg-border mx-0.5" />

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

            {viewMode === 'grid' ? (
              <div
                className="hidden h-9 items-center gap-2 rounded-md border border-border bg-background px-3 sm:flex"
                title="Grid columns"
              >
                <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                <input
                  ref={sliderRef}
                  key={gridColumns}
                  type="range"
                  min={MIN_PHOTO_GRID_COLUMNS}
                  max={MAX_PHOTO_GRID_COLUMNS}
                  step={1}
                  defaultValue={gridColumns}
                  onChange={handleGridColumnsChange}
                  onMouseUp={persistGridColumns}
                  onTouchEnd={persistGridColumns}
                  aria-label="Grid columns"
                  className="w-24 accent-primary"
                />
                <span ref={columnsLabelRef} className="w-5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {gridColumns}
                </span>
              </div>
            ) : null}

            <div className="h-5 w-px bg-border mx-0.5" />

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

              {/* Photo Type Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">{t('admin.all_types')}:</span>
                <AdminSelect
                  value={photoTypeFilter}
                  onChange={setPhotoTypeFilter}
                  options={[
                    { value: 'all', label: t('gallery.all') },
                    { value: 'digital', label: t('admin.upload_type_digital') },
                    { value: 'film', label: t('admin.upload_type_film') },
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
            {photoTypeFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                {t(`admin.upload_type_${photoTypeFilter}`)}
                <AdminButton
                  onClick={() => setPhotoTypeFilter('all')}
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

      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto custom-scrollbar">
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm flex items-center gap-2">
          <X className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Photo Grid/List */}
      <div className="space-y-4">
        {loading ? (
          <div className={PHOTO_GRID_CLASS_NAME} style={{ '--admin-photo-grid-columns': String(gridColumns) } as React.CSSProperties}>
            {[...Array(12)].map((_, i) => (
              <div key={i} className="aspect-[4/5] bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : (
          <div
            ref={viewMode === 'grid' ? gridContainerRef : undefined}
            className={
              viewMode === 'grid'
                ? PHOTO_GRID_CLASS_NAME
                : 'flex flex-col border border-border rounded-lg overflow-hidden'
            }
            style={viewMode === 'grid' ? { '--admin-photo-grid-columns': String(gridColumns) } as React.CSSProperties : undefined}
          >
            {filteredPhotos.map((photo) =>
              viewMode === 'grid' ? (
                <LazyGridCard
                  key={photo.id}
                  photo={photo}
                  isSelected={selectedIds.has(photo.id)}
                  resolvedCdnDomain={resolvedCdnDomain}
                  onSelect={handleSelectPhoto}
                  onDelete={onDelete}
                  onToggleFeatured={onToggleFeatured}
                  onClick={handlePhotoClick}
                />
              ) : (
                <PhotoListRow
                  key={photo.id}
                  photo={photo}
                  isSelected={selectedIds.has(photo.id)}
                  resolvedCdnDomain={resolvedCdnDomain}
                  onSelect={handleSelectPhoto}
                  onDelete={onDelete}
                  onToggleFeatured={onToggleFeatured}
                  onClick={handlePhotoClick}
                />
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

      <div
        className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-5 py-3 bg-background/95 backdrop-blur-xl border border-border rounded-xl shadow-lg shadow-black/10 dark:shadow-black/30 transition-all duration-200 ease-out ${
          hasSelectedPhotos
            ? 'translate-y-0 opacity-100'
            : 'translate-y-5 opacity-0 pointer-events-none'
        }`}
      >
        <span className="text-sm font-medium text-primary">
          {selectedIds.size} {t('admin.selected') || 'selected'}
        </span>
        <div className="w-px h-5 bg-border" />
        <AdminButton
          onClick={onBatchAction}
          adminVariant="outline"
          size="sm"
          className="gap-1.5 rounded-lg text-xs font-medium"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>{t('admin.batch_actions') || 'Batch actions'}</span>
        </AdminButton>
        <AdminButton
          onClick={() => onDelete()}
          adminVariant="destructiveOutline"
          size="sm"
          className="gap-1.5 rounded-lg text-xs font-medium"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{t('common.delete')}</span>
        </AdminButton>
      </div>
    </div>
  )
}
