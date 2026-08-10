import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import { PhotoDetailPanel } from '@/components/admin/PhotoDetailPanel'
import { PhotoInfoSidebar } from '@/components/admin/PhotoInfoSidebar'
import { PhotoPreviewOverlay } from '@/components/admin/PhotoPreviewOverlay'
import { useAuth } from '@/contexts/AuthContext'
import { usePreferences, usePhotoFilters } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { resolveAssetUrl, type PhotoDto } from '@/lib/api'
import { normalizePhotoCategories } from '@/lib/photoCategories'
import { loadPersistentResource } from '@/lib/persistent-cache'
import { getPhotosPageCache, getPhotosPageCacheGeneration, invalidateDesktopCache, setPhotosPageCache } from '@/lib/app-cache'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import type { Album, Photo, PaginatedResponse } from '@/types'
import { toast } from 'sonner'
import {
  BatchDeletePhotos,
  BatchUpdateShowFlag,
  DeletePhoto,
  GetAlbum,
  GetCategories,
  GetPhotos,
  ToggleFeatured,
  ToggleShowFlag,
} from '../../wailsjs/go/main/App'
import type { services } from '../../wailsjs/go/models'
import { getErrorMessage } from '@/lib/auth-errors'
import { ThumbGridSkeleton } from '@/components/admin/Skeleton'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/ContextMenu'
import {
  ArrowDown, ArrowUp, BookOpen, Columns3, LayoutGrid, Star, Eye, EyeOff, Trash2, Loader2, Check,
  Maximize2, Minus, Pencil, Plus, RefreshCw, Search, X, CheckSquare, Film, ImageOff,
} from 'lucide-react'

// 三栏资源库中间区域较窄，8 列视图下 50 张可能不足以撑满一屏，导致没有滚动事件。
// 与本地资源库保持一致，每页加载 100 张，并由视口填充逻辑按需继续请求。
const PAGE_SIZE = 100
const MIN_PHOTO_GRID_SIZE = 120
const MAX_PHOTO_GRID_SIZE = 280
const MASONRY_COLUMN_GAP = 6
const MASONRY_CARD_MARGIN = 6

interface AlbumPhotoFilters {
  search: string
  category: string
  photoType: string | null
  featured: boolean | null
  cameraId: string | null
  lensId: string | null
  sortBy: 'createdAt' | 'takenAt'
  sortOrder: 'asc' | 'desc'
}

function filterAndSortAlbumPhotos(photos: Photo[], filters: AlbumPhotoFilters) {
  const search = filters.search.trim().toLocaleLowerCase()
  const category = filters.category === '全部' ? '' : filters.category

  return photos
    .filter((photo) => !category || photo.category?.split(',').includes(category))
    .filter((photo) => !search || photo.title?.toLocaleLowerCase().includes(search))
    .filter((photo) => !filters.photoType || photo.photoType === filters.photoType)
    .filter((photo) => filters.featured === null || photo.isFeatured === filters.featured)
    .filter((photo) => !filters.cameraId || photo.cameraId === filters.cameraId)
    .filter((photo) => !filters.lensId || photo.lensId === filters.lensId)
    .sort((left, right) => {
      const field = filters.sortBy === 'takenAt' ? 'takenAt' : 'createdAt'
      const leftTime = new Date(left[field] || 0).getTime()
      const rightTime = new Date(right[field] || 0).getTime()
      const comparison = leftTime - rightTime
      return filters.sortOrder === 'asc' ? comparison : -comparison
    })
}

function estimateMasonryPhotoHeight(photo: Photo, columnWidth: number) {
  const aspectRatio = photo.width > 0 && photo.height > 0
    ? photo.width / photo.height
    : 4 / 3

  return Math.round(columnWidth / aspectRatio) + MASONRY_CARD_MARGIN
}

function distributeMasonryPhotos(photos: Photo[], columnCount: number, columnWidth: number) {
  const columns = Array.from({ length: columnCount }, () => [] as Photo[])
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

// 缩略图：加载完成前保持透明，避免滚动时图片"闪现"；
// ref 回调兜底缓存命中场景（complete 已为 true 时 onLoad 不会再触发）
function Thumb({ src, alt, className, width, height }: { src: string; alt: string; className: string; width?: number; height?: number }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <img
      src={src}
      alt={alt}
      width={width || undefined}
      height={height || undefined}
      loading="lazy"
      decoding="async"
      draggable={false}
      ref={(el) => { if (el?.complete && el.naturalWidth > 0) setLoaded(true) }}
      onLoad={() => setLoaded(true)}
      className={`${className} ${loaded ? 'opacity-100' : 'opacity-0'}`}
    />
  )
}

interface PhotoCardActions {
  onCardClick: (event: React.MouseEvent, photo: Photo) => void
  onCardDoubleClick: (photo: Photo) => void
  onContextOpen: (photo: Photo) => void
  onEditDetails: (photo: Photo) => void
  onEditStory: (photo: Photo) => void
  onToggleSelect: (id: string) => void
  onToggleFeatured: (id: string) => void
  onToggleShow: (id: string) => void
  onRequestDelete: (photo: Photo) => void
}

interface PhotoCardProps extends PhotoCardActions {
  photo: Photo
  isSelected: boolean
  isDeleting: boolean
  language: 'zh' | 'en'
  viewMode: 'crop' | 'fit' | 'masonry'
}

function PhotoContextTarget({
  photo, isSelected, isDeleting, language, children,
  onCardDoubleClick, onContextOpen, onEditDetails, onEditStory,
  onToggleSelect, onToggleFeatured, onToggleShow, onRequestDelete,
}: Omit<PhotoCardProps, 'onCardClick' | 'viewMode'> & { children: React.ReactElement }) {
  return (
    <ContextMenu onOpenChange={(open) => { if (open && !isDeleting) onContextOpen(photo) }}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel className="max-w-64 truncate">{photo.title || (language === 'zh' ? '未命名照片' : 'Untitled photo')}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={isDeleting} onSelect={() => onCardDoubleClick(photo)}><Maximize2 size={14} />{language === 'zh' ? '大图预览' : 'Preview'}</ContextMenuItem>
        <ContextMenuItem disabled={isDeleting} onSelect={() => onEditDetails(photo)}><Pencil size={14} />{t('admin.edit_photo', language)}</ContextMenuItem>
        <ContextMenuItem disabled={isDeleting} onSelect={() => onEditStory(photo)}><BookOpen size={14} />{t('admin.edit_story', language)}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={isDeleting} onSelect={() => onToggleSelect(photo.id)}><CheckSquare size={14} />{isSelected ? (language === 'zh' ? '取消选择' : 'Deselect') : t('admin.select_photos', language)}</ContextMenuItem>
        <ContextMenuItem disabled={isDeleting} onSelect={() => onToggleFeatured(photo.id)}><Star size={14} fill={photo.isFeatured ? 'currentColor' : 'none'} />{photo.isFeatured ? (language === 'zh' ? '取消精选' : 'Remove featured') : t('admin.featured', language)}</ContextMenuItem>
        <ContextMenuItem disabled={isDeleting} onSelect={() => onToggleShow(photo.id)}>{photo.showFlag ? <EyeOff size={14} /> : <Eye size={14} />}{t(photo.showFlag ? 'admin.hide_in_gallery' : 'admin.show_in_gallery', language)}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={isDeleting} variant="destructive" onSelect={() => onRequestDelete(photo)}><Trash2 size={14} />{t('common.delete', language)}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

// memo 化的网格卡片：勾选/搜索输入/加载更多等页面状态变化时，
// 只有 props 变化的卡片重渲染，而不是全部已加载的几百张
const PhotoGridCard = memo(function PhotoGridCard({
  photo, isSelected, isDeleting, language, viewMode,
  onCardClick, onCardDoubleClick, onContextOpen, onEditDetails, onEditStory,
  onToggleSelect, onToggleFeatured, onToggleShow, onRequestDelete,
}: PhotoCardProps) {
  const masonry = viewMode === 'masonry'

  return (
    <PhotoContextTarget
      photo={photo}
      isSelected={isSelected}
      isDeleting={isDeleting}
      language={language}
      onCardDoubleClick={onCardDoubleClick}
      onContextOpen={onContextOpen}
      onEditDetails={onEditDetails}
      onEditStory={onEditStory}
      onToggleSelect={onToggleSelect}
      onToggleFeatured={onToggleFeatured}
      onToggleShow={onToggleShow}
      onRequestDelete={onRequestDelete}
    >
      <div
        className={`group overflow-hidden border text-left transition focus:outline-none ${masonry ? 'mb-1.5 inline-block w-full rounded-sm align-top' : 'flex h-full min-w-0 flex-col rounded-lg'} ${isDeleting ? 'cursor-wait opacity-75' : 'cursor-pointer'}`}
        style={{
          borderColor: isSelected ? 'var(--primary)' : masonry ? 'transparent' : 'var(--border)',
          backgroundColor: isSelected ? 'var(--accent)' : masonry ? 'transparent' : 'var(--card)',
          boxShadow: isSelected ? '0 0 0 1px var(--primary)' : undefined,
          breakInside: masonry ? 'avoid' : undefined,
          contentVisibility: masonry ? undefined : 'auto',
        }}
        onClick={(event) => { if (!isDeleting) onCardClick(event, photo) }}
        onDoubleClick={() => { if (!isDeleting) onCardDoubleClick(photo) }}
      >
        <div
          className={`relative min-h-0 w-full overflow-hidden bg-secondary ${masonry ? '' : 'aspect-[5/4]'}`}
          style={masonry ? { aspectRatio: photo.width > 0 && photo.height > 0 ? `${photo.width} / ${photo.height}` : '4 / 3' } : undefined}
        >
          <Thumb
            src={resolveAssetUrl(photo.thumbnailUrl || photo.url)}
            alt={photo.title}
            width={masonry ? photo.width : undefined}
            height={masonry ? photo.height : undefined}
            className={`w-full transition-[transform,opacity] duration-300 ${masonry ? 'block h-full object-cover group-hover:scale-[1.015]' : viewMode === 'fit' ? 'h-full object-contain p-1' : 'h-full object-cover group-hover:scale-[1.025]'} ${isDeleting ? '!opacity-50' : ''}`}
          />
          <button
            onClick={(event) => { event.stopPropagation(); if (!isDeleting) onToggleSelect(photo.id) }}
            className={`absolute left-2 top-2 z-30 flex h-5 w-5 items-center justify-center rounded border transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            style={{ backgroundColor: isSelected ? 'var(--primary)' : 'rgba(0,0,0,0.4)', borderColor: isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.7)' }}
          >
            {isSelected && <Check size={12} className="text-white" />}
          </button>
          <div className="absolute right-2 top-2 z-20 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button onClick={(event) => { event.stopPropagation(); onToggleFeatured(photo.id) }} disabled={isDeleting} title={photo.isFeatured ? '取消精选' : '设为精选'} className="rounded bg-black/60 p-1.5 text-white hover:bg-black/75 disabled:opacity-50"><Star size={12} fill={photo.isFeatured ? 'currentColor' : 'none'} /></button>
            <button onClick={(event) => { event.stopPropagation(); onToggleShow(photo.id) }} disabled={isDeleting} title={photo.showFlag ? '设为隐藏' : '设为展示'} className="rounded bg-black/60 p-1.5 text-white hover:bg-black/75 disabled:opacity-50">{photo.showFlag ? <Eye size={12} /> : <EyeOff size={12} />}</button>
            <button onClick={(event) => { event.stopPropagation(); onRequestDelete(photo) }} disabled={isDeleting} title="删除照片" className="rounded bg-black/60 p-1.5 text-white hover:bg-red-600/85 disabled:opacity-50">{isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}</button>
          </div>
          {(photo.isFeatured || !photo.showFlag || photo.photoType === 'film') && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-1 text-white">
              {photo.isFeatured && <Star size={11} fill="currentColor" />}
              {!photo.showFlag && <EyeOff size={11} />}
              {photo.photoType === 'film' && <Film size={11} />}
            </div>
          )}
          {isDeleting && <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-black/45 text-white"><Loader2 size={20} className="animate-spin" /><span className="text-xs">删除中...</span></div>}
        </div>
        {!masonry && (
          <div className="block w-full px-2.5 py-2">
            <span className="block truncate text-xs font-medium">{photo.title || 'Untitled'}</span>
            <span className="mt-0.5 block truncate text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{photo.width && photo.height ? `${photo.width} × ${photo.height}` : photo.category || '—'}</span>
          </div>
        )}
      </div>
    </PhotoContextTarget>
  )
})

export function PhotosPage() {
  const { language, photoGridSize, photoViewMode: viewMode, setPhotoGridSize, setPhotoViewMode: setViewMode } = usePreferences()
  const gridSize = Math.min(MAX_PHOTO_GRID_SIZE, Math.max(MIN_PHOTO_GRID_SIZE, photoGridSize))
  const filters = usePhotoFilters()
  const { token, logout } = useAuth()
  const navigate = useNavigate()

  const filterKey = JSON.stringify([
    filters.category, filters.search, filters.photoType, filters.channel,
    filters.albumId, filters.cameraId, filters.lensId, filters.featured,
    filters.sortBy, filters.sortOrder,
  ])
  const photosPageCache = getPhotosPageCache()
  const cacheGenerationRef = useRef(getPhotosPageCacheGeneration())
  const invalidateAfterLocalMutation = useCallback((domains: Parameters<typeof invalidateDesktopCache>[0]) => {
    invalidateDesktopCache(domains)
    cacheGenerationRef.current = getPhotosPageCacheGeneration()
  }, [])
  const cacheHitRef = useRef(
    photosPageCache !== null && photosPageCache.loaded && photosPageCache.filterKey === filterKey,
  )

  const [photos, setPhotos] = useState<Photo[]>(() => cacheHitRef.current ? photosPageCache!.photos : [])
  const [total, setTotal] = useState(() => cacheHitRef.current ? photosPageCache!.total : 0)
  const [hasMore, setHasMore] = useState(() => cacheHitRef.current ? photosPageCache!.hasMore : true)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [categories, setCategories] = useState<string[]>([])
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<Photo | null>(null)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false)
  const [batchUpdating, setBatchUpdating] = useState(false)
  const [detailPhoto, setDetailPhoto] = useState<Photo | null>(null)
  // 大图预览（双击卡片/点击侧栏缩略图打开）
  const [previewPhoto, setPreviewPhoto] = useState<Photo | null>(null)
  // 完整编辑/叙事弹层（从右侧信息栏打开，信息页签或叙事页签）
  const [editorState, setEditorState] = useState<{ photo: Photo; mode: 'info' | 'story' } | null>(null)
  // 搜索输入本地回显，300ms 防抖后才写入筛选（避免每键一次全量请求）
  const [searchInput, setSearchInput] = useState(filters.search)
  const [photoGridWidth, setPhotoGridWidth] = useState(900)

  const pageRef = useRef(cacheHitRef.current ? photosPageCache!.page : 1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
  const autoFillAttemptPageRef = useRef<number | null>(null)
  const fetchingRef = useRef(false)
  const fetchRequestIdRef = useRef(0)
  const hasLoadedInitialPageRef = useRef(cacheHitRef.current)
  const appliedFilterKeyRef = useRef(cacheHitRef.current ? filterKey : null)
  const lastScrollTopRef = useRef(0)
  const scrollRafPendingRef = useRef(false)
  // Shift 范围选择的锚点（最近一次勾选的照片）
  const anchorIdRef = useRef<string | null>(null)

  // 渲染期同步最新状态，供卸载写缓存和稳定回调（滚动/键盘）读取
  const latestRef = useRef({ photos, total, hasMore, filterKey })
  latestRef.current = { photos, total, hasMore, filterKey }

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
      setPhotoGridWidth(current => Math.abs(current - width) < 0.5 ? current : width)
    }

    updateGridWidth()
    const observer = new ResizeObserver(updateGridWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (cacheHitRef.current && photosPageCache && scrollRef.current) {
      scrollRef.current.scrollTop = photosPageCache.scrollTop
      lastScrollTopRef.current = photosPageCache.scrollTop
    }
  }, [])

  useEffect(() => () => {
    // Activity 隐藏页面时也会执行 cleanup，不能在这里作废在途请求；否则切回时
    // cached effect 不会重跑，而首屏请求也永远无法完成。只缓存已经完成的结果。
    if (!hasLoadedInitialPageRef.current) return
    setPhotosPageCache({
      filterKey: latestRef.current.filterKey,
      photos: latestRef.current.photos,
      total: latestRef.current.total,
      hasMore: latestRef.current.hasMore,
      page: pageRef.current,
      scrollTop: lastScrollTopRef.current,
      loaded: true,
    }, cacheGenerationRef.current)
  }, [])

  // 全部照片使用分页接口；选中相册后直接读取相册管理详情接口中的 photos。
  const fetchPhotos = useCallback(async (pageNum: number, append: boolean) => {
    if (append && (fetchingRef.current || filters.albumId)) return

    const requestId = ++fetchRequestIdRef.current
    fetchingRef.current = true
    if (!append) hasLoadedInitialPageRef.current = false

    if (append) setLoadingMore(true)
    else setLoading(true)

    try {
      if (filters.albumId) {
        const album = await GetAlbum(filters.albumId) as unknown as Album
        if (requestId !== fetchRequestIdRef.current) return

        const albumPhotos = filterAndSortAlbumPhotos(album?.photos || [], filters)
        setPhotos(albumPhotos)
        setTotal(albumPhotos.length)
        setHasMore(false)
        pageRef.current = 1
        hasLoadedInitialPageRef.current = true
        setLoadError(null)
        return
      }

      const result = await GetPhotos({
        category: filters.category === '全部' ? '' : filters.category,
        search: filters.search,
        photoType: filters.photoType ?? undefined,
        channel: filters.channel ?? undefined,
        albumId: '',
        cameraId: filters.cameraId ?? '',
        lensId: filters.lensId ?? '',
        featured: filters.featured ?? undefined,
        showFlag: undefined,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        page: pageNum,
        pageSize: PAGE_SIZE,
        all: false,
      } as unknown as services.ListPhotosParams) as unknown as PaginatedResponse<Photo>
      if (requestId !== fetchRequestIdRef.current) return

      const newData = result.data || []
      setPhotos(prev => append ? [...prev, ...newData] : newData)
      if (result.meta?.total !== undefined) setTotal(result.meta.total)
      else setTotal(prev => append ? prev + newData.length : newData.length)
      // 某些旧服务响应可能不含 meta；满页时继续尝试下一页，空页后自然停止。
      setHasMore(result.meta?.hasMore ?? newData.length >= PAGE_SIZE)
      pageRef.current = pageNum
      if (!append) hasLoadedInitialPageRef.current = true
      setLoadError(null)
    } catch (err: unknown) {
      if (requestId !== fetchRequestIdRef.current) return
      console.error('获取照片失败:', err)
      setLoadError(getErrorMessage(err) || '加载照片失败，请检查网络连接')
      if (append) {
        if (autoFillAttemptPageRef.current === pageNum) autoFillAttemptPageRef.current = null
        toast.error(getErrorMessage(err) || '加载更多失败')
      }
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setLoading(false)
        setLoadingMore(false)
        fetchingRef.current = false
      }
    }
  }, [filters])

  // 滚动/键盘等稳定回调通过 ref 调用最新的 fetchPhotos
  const fetchPhotosRef = useRef(fetchPhotos)
  fetchPhotosRef.current = fetchPhotos

  // 搜索防抖：停止输入 300ms 后才更新筛选条件
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput !== filters.search) filters.setSearch(searchInput)
    }, 300)
    return () => window.clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  // 筛选变化时重置列表；命中模块缓存的首次挂载跳过（沿用缓存数据）
  useEffect(() => {
    if (appliedFilterKeyRef.current === filterKey) {
      cacheHitRef.current = false
      return
    }
    appliedFilterKeyRef.current = filterKey
    pageRef.current = 1
    autoFillAttemptPageRef.current = null
    setHasMore(true)
    setPhotos([])
    setSelected(new Set())
    anchorIdRef.current = null
    scrollRef.current?.scrollTo({ top: 0 })
    fetchPhotos(1, false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey])

  // 加载分类
  useCachedPageEffect(() => {
    (async () => {
      try {
        const result = await loadPersistentResource('categories', async () => (
          normalizePhotoCategories(await GetCategories())
        ))
        setCategories(result)
      } catch {}
    })()
  }, [])

  // 滚动到底部附近时加载更多；rAF 节流，滚动事件本身只记录位置
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    lastScrollTopRef.current = el.scrollTop

    if (scrollRafPendingRef.current) return
    scrollRafPendingRef.current = true
    requestAnimationFrame(() => {
      scrollRafPendingRef.current = false
      const node = scrollRef.current
      if (!node || fetchingRef.current || !latestRef.current.hasMore) return
      // 距离底部 300px 时触发（IntersectionObserver 的备用机制）
      if (node.scrollTop + node.clientHeight >= node.scrollHeight - 300) {
        fetchPhotosRef.current(pageRef.current + 1, true)
      }
    })
  }, [])

  // 嵌套到资源库三栏布局后，滚动事件在部分 WebView 中不会稳定抵达底部。
  // 使用滚动容器内的底部哨兵作为主分页触发；每次追加后重新观察，
  // 即使首屏高度不足以产生滚动条，也会继续加载直到填满视口。
  useEffect(() => {
    const root = scrollRef.current
    const sentinel = loadMoreSentinelRef.current
    if (!root || !sentinel || loading || photos.length === 0 || !hasMore) return

    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || fetchingRef.current || !latestRef.current.hasMore) return
      fetchPhotosRef.current(pageRef.current + 1, true)
    }, {
      root,
      rootMargin: '360px 0px',
      threshold: 0,
    })

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, photos.length, viewMode])

  // 页面没有产生滚动条时，单靠 onScroll 永远无法触发下一页。
  // 渲染完成后直接比较 scrollHeight/clientHeight，未填满视口则自动请求下一页。
  useEffect(() => {
    const node = scrollRef.current
    if (!node || loading || loadingMore || photos.length === 0 || !hasMore) return

    let frame = 0
    const checkViewportFill = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        if (fetchingRef.current || !latestRef.current.hasMore) return
        if (node.scrollHeight > node.clientHeight + 8) return

        const nextPage = pageRef.current + 1
        if (autoFillAttemptPageRef.current === nextPage) return
        autoFillAttemptPageRef.current = nextPage
        fetchPhotosRef.current(nextPage, true)
      })
    }

    checkViewportFill()
    const resizeObserver = new ResizeObserver(checkViewportFill)
    resizeObserver.observe(node)

    return () => {
      window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
    }
  }, [gridSize, hasMore, loading, loadingMore, photos.length, viewMode])

  const toggleSelect = useCallback((id: string) => {
    anchorIdRef.current = id
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // 与 web 端后台一致：普通点击打开详情，Shift+点击 / 复选框负责多选；
  // 已有锚点时 Shift+点击 选中锚点到当前的整段范围
  const handlePhotoClick = useCallback((event: React.MouseEvent, photo: Photo) => {
    if (event.shiftKey) {
      event.preventDefault()
      const list = latestRef.current.photos
      const anchorId = anchorIdRef.current
      if (anchorId && anchorId !== photo.id) {
        const anchorIdx = list.findIndex(p => p.id === anchorId)
        const currentIdx = list.findIndex(p => p.id === photo.id)
        if (anchorIdx !== -1 && currentIdx !== -1) {
          const [start, end] = anchorIdx < currentIdx ? [anchorIdx, currentIdx] : [currentIdx, anchorIdx]
          const rangeIds = list.slice(start, end + 1).map(p => p.id)
          setSelected(prev => new Set([...prev, ...rangeIds]))
          return
        }
      }
      toggleSelect(photo.id)
      return
    }
    setDetailPhoto(photo)
  }, [toggleSelect])

  // 双击卡片：打开全屏大图预览
  const handlePhotoDoubleClick = useCallback((photo: Photo) => {
    setPreviewPhoto(photo)
  }, [])

  // 右侧信息栏按钮：打开完整编辑弹层（info/story 页签）
  const openEditor = useCallback((photo: Photo, mode: 'info' | 'story') => {
    setEditorState({ photo, mode })
  }, [])

  // 详情面板保存后把更新合并回列表（接口 JSON 不含 undefined 键，直接展开安全）
  const handleDetailSave = useCallback((updated: PhotoDto) => {
    setPhotos(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } as Photo : p))
    setDetailPhoto(prev => prev && prev.id === updated.id ? { ...prev, ...updated } as Photo : prev)
    setEditorState(prev => prev && prev.photo.id === updated.id ? { ...prev, photo: { ...prev.photo, ...updated } as Photo } : prev)
    invalidateAfterLocalMutation(['overview', 'equipment', 'photos', 'albums', 'film-rolls'])
  }, [invalidateAfterLocalMutation])

  // 右侧信息栏始终以列表数据为准（乐观更新/删除后自动同步）
  const sidebarPhoto = useMemo(() => {
    if (!detailPhoto) return null
    return photos.find(p => p.id === detailPhoto.id) ?? detailPhoto
  }, [detailPhoto, photos])

  // 筛选变化/批量删除后若选中照片已不在列表，清空选中
  useEffect(() => {
    if (detailPhoto && !photos.some(p => p.id === detailPhoto.id)) setDetailPhoto(null)
  }, [photos, detailPhoto])

  // 大图预览：←/→ 切换当前已加载照片，接近末尾预取下一页
  const previewIndex = previewPhoto ? photos.findIndex(p => p.id === previewPhoto.id) : -1
  const goPreview = useCallback((direction: 1 | -1) => {
    if (previewIndex === -1) return
    const nextIndex = previewIndex + direction
    if (nextIndex < 0 || nextIndex >= photos.length) return
    setPreviewPhoto(photos[nextIndex])
    if (direction === 1 && nextIndex >= photos.length - 5 && latestRef.current.hasMore && !fetchingRef.current) {
      fetchPhotosRef.current(pageRef.current + 1, true)
    }
  }, [photos, previewIndex])

  const tForPanel = useCallback((key: string) => t(key, language), [language])

  const notifyForPanel = useCallback((message: string, type?: 'success' | 'error' | 'info') => {
    if (type === 'error') toast.error(message)
    else if (type === 'info') toast.info(message)
    else toast.success(message)
  }, [])

  // 乐观更新：先切换本地状态给即时反馈，失败再回滚
  const toggleFeatured = useCallback(async (id: string) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, isFeatured: !p.isFeatured } : p))
    try {
      await ToggleFeatured(id)
      invalidateAfterLocalMutation(['overview', 'photos'])
    } catch (err: unknown) {
      setPhotos(prev => prev.map(p => p.id === id ? { ...p, isFeatured: !p.isFeatured } : p))
      toast.error(getErrorMessage(err) || '更新精选状态失败')
    }
  }, [invalidateAfterLocalMutation])

  const toggleShowFlag = useCallback(async (id: string) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, showFlag: !p.showFlag } : p))
    try {
      await ToggleShowFlag(id)
      invalidateAfterLocalMutation(['overview', 'photos'])
    } catch (err: unknown) {
      setPhotos(prev => prev.map(p => p.id === id ? { ...p, showFlag: !p.showFlag } : p))
      toast.error(getErrorMessage(err) || '更新展示状态失败')
    }
  }, [invalidateAfterLocalMutation])

  // 单张删除：用非阻塞对话框代替原生 confirm（不再冻结整个窗口）
  const requestDeletePhoto = useCallback((photo: Photo) => {
    setDeleteTarget(photo)
  }, [])

  const handleDeleteConfirm = async () => {
    const target = deleteTarget
    if (!target) return
    setDeleteTarget(null)
    const id = target.id
    const toastId = toast.loading('正在删除照片...')
    setDeletingIds(prev => new Set(prev).add(id))
    try {
      await DeletePhoto(id, { deleteOriginal: false, deleteThumbnail: true, force: false })
      setPhotos(prev => prev.filter(p => p.id !== id))
      setSelected(prev => { const next = new Set(prev); next.delete(id); return next })
      setDetailPhoto(prev => prev && prev.id === id ? null : prev)
      setPreviewPhoto(prev => prev && prev.id === id ? null : prev)
      setEditorState(prev => prev && prev.photo.id === id ? null : prev)
      setTotal(prev => prev - 1)
      invalidateAfterLocalMutation(['overview', 'equipment', 'photos', 'albums', 'film-rolls', 'stories'])
      toast.success('照片已删除', { id: toastId })
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || '删除失败', { id: toastId })
    } finally {
      setDeletingIds(prev => { const next = new Set(prev); next.delete(id); return next })
    }
  }

  // ── 批量操作（底部选中操作条） ─────────────────────

  const handleBatchDelete = async () => {
    if (selected.size === 0 || batchDeleting) return
    const ids = Array.from(selected)
    setBatchDeleteDialogOpen(false)
    const toastId = toast.loading(`正在删除 ${ids.length} 张照片...`)
    setBatchDeleting(true)
    setDeletingIds(prev => new Set([...prev, ...ids]))
    try {
      await BatchDeletePhotos({
        photoIds: ids, deleteOriginal: false, deleteThumbnail: true, force: false,
      })
      setSelected(new Set())
      pageRef.current = 1
      await fetchPhotos(1, false)
      invalidateAfterLocalMutation(['overview', 'equipment', 'photos', 'albums', 'film-rolls', 'stories'])
      toast.success('照片已删除', { id: toastId })
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || '批量删除失败', { id: toastId })
    } finally {
      setBatchDeleting(false)
      setDeletingIds(prev => {
        const next = new Set(prev)
        ids.forEach(id => next.delete(id))
        return next
      })
    }
  }

  const handleBatchShowFlag = async (show: boolean) => {
    if (selected.size === 0 || batchUpdating) return
    const ids = Array.from(selected)
    setBatchUpdating(true)
    try {
      await BatchUpdateShowFlag(ids, show)
      setPhotos(prev => prev.map(p => selected.has(p.id) ? { ...p, showFlag: show } : p))
      invalidateAfterLocalMutation(['overview', 'photos'])
      toast.success(show ? `已将 ${ids.length} 张照片设为展示` : `已将 ${ids.length} 张照片设为隐藏`)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || '批量更新失败')
    } finally {
      setBatchUpdating(false)
    }
  }

  // 全选/取消全选当前已加载的照片
  const toggleSelectAllLoaded = () => {
    setSelected(prev => prev.size === photos.length && photos.length > 0
      ? new Set()
      : new Set(photos.map(p => p.id)))
  }

  // Esc 清除多选（编辑弹层/大图预览/对话框打开时让位）
  useEffect(() => {
    if (selected.size === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !detailPhoto && !editorState && !previewPhoto && !batchDeleteDialogOpen && !deleteTarget) {
        setSelected(new Set())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected.size, detailPhoto, editorState, previewPhoto, batchDeleteDialogOpen, deleteTarget])

  // 右侧信息栏键盘导航：←/→ 切换上一张/下一张选中照片，Esc 取消选中；
  // 输入控件聚焦时不拦截，接近已加载末尾时预取下一页
  useEffect(() => {
    if (!detailPhoto || previewPhoto || editorState) return
    const onKey = (e: KeyboardEvent) => {
      if (batchDeleteDialogOpen || deleteTarget) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      if (e.key === 'Escape') {
        setDetailPhoto(null)
        return
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const list = latestRef.current.photos
      const idx = list.findIndex(p => p.id === detailPhoto.id)
      if (idx === -1) return
      const nextIdx = e.key === 'ArrowRight' ? idx + 1 : idx - 1
      if (nextIdx < 0 || nextIdx >= list.length) return
      e.preventDefault()
      setDetailPhoto(list[nextIdx])
      if (e.key === 'ArrowRight' && nextIdx >= list.length - 5 && latestRef.current.hasMore && !fetchingRef.current) {
        fetchPhotosRef.current(pageRef.current + 1, true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailPhoto, previewPhoto, editorState, batchDeleteDialogOpen, deleteTarget])

  const renderPhotoCard = (photo: Photo) => (
    <PhotoGridCard
      key={photo.id}
      photo={photo}
      isSelected={selected.has(photo.id)}
      isDeleting={deletingIds.has(photo.id)}
      language={language}
      viewMode={viewMode}
      onCardClick={handlePhotoClick}
      onCardDoubleClick={handlePhotoDoubleClick}
      onContextOpen={setDetailPhoto}
      onEditDetails={(item) => openEditor(item, 'info')}
      onEditStory={(item) => openEditor(item, 'story')}
      onToggleSelect={toggleSelect}
      onToggleFeatured={toggleFeatured}
      onToggleShow={toggleShowFlag}
      onRequestDelete={requestDeletePhoto}
    />
  )

  const collectionTitle = filters.featured
    ? t('admin.featured', language)
    : filters.albumId
      ? (language === 'zh' ? '相册照片' : 'Album photos')
      : filters.category !== '全部'
        ? filters.category
        : filters.photoType === 'digital'
          ? t('admin.photos_type_digital', language)
          : filters.photoType === 'film'
            ? t('admin.photos_type_film', language)
            : t('admin.resource_library_all_photos', language)

  return (
    <>
      <PageHeader title={collectionTitle} />

      {/* 与本地资源库一致：搜索、筛选、视图和排序集中在内容工具栏。 */}
      <div className="flex min-h-13 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--border)' }}>
        <div className="relative min-w-0 flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
          <input
            type="text"
            placeholder={t('common.search', language)}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="h-8 w-full rounded-md border bg-input pl-8 pr-8 text-xs outline-none focus:ring-1"
          />
          {searchInput && <button type="button" onClick={() => setSearchInput('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1"><X size={13} /></button>}
        </div>
        <SelectDropdown
          value={filters.category}
          options={[
            { value: '全部', label: t('common.all', language) },
            ...categories.filter((category) => category !== '全部').map((category) => ({ value: category, label: category })),
          ]}
          onChange={(value) => filters.setCategory(value as string)}
          placeholder={t('common.all', language)}
          ariaLabel={t('ui.category_filter', language)}
          className="w-32 shrink-0"
        />
        <SelectDropdown
          value={filters.photoType || ''}
          options={[
            { value: '', label: language === 'zh' ? '全部类型' : 'All types' },
            { value: 'digital', label: t('admin.photos_type_digital', language) },
            { value: 'film', label: t('admin.photos_type_film', language) },
          ]}
          onChange={(value) => filters.setPhotoType((value as string) || null)}
          placeholder={language === 'zh' ? '全部类型' : 'All types'}
          ariaLabel={language === 'zh' ? '照片类型' : 'Photo type'}
          className="w-28 shrink-0"
        />
        <div className="flex h-8 shrink-0 items-center rounded-md border bg-input p-0.5">
          <button type="button" onClick={() => setViewMode('crop')} title={language === 'zh' ? '裁切填充' : 'Cropped view'} aria-label={language === 'zh' ? '裁切填充' : 'Cropped view'} className="flex size-7 items-center justify-center rounded" style={{ backgroundColor: viewMode === 'crop' ? 'var(--secondary)' : undefined }}><LayoutGrid size={13} /></button>
          <button type="button" onClick={() => setViewMode('fit')} title={language === 'zh' ? '适应显示' : 'Fitted view'} aria-label={language === 'zh' ? '适应显示' : 'Fitted view'} className="flex size-7 items-center justify-center rounded" style={{ backgroundColor: viewMode === 'fit' ? 'var(--secondary)' : undefined }}><Maximize2 size={13} /></button>
          <button type="button" onClick={() => setViewMode('masonry')} title={language === 'zh' ? '瀑布流' : 'Masonry view'} aria-label={language === 'zh' ? '瀑布流' : 'Masonry view'} className="flex size-7 items-center justify-center rounded" style={{ backgroundColor: viewMode === 'masonry' ? 'var(--secondary)' : undefined }}><Columns3 size={13} /></button>
        </div>
        <SelectDropdown
          value={filters.sortBy}
          options={[
            { value: 'createdAt', label: language === 'zh' ? '上传时间' : 'Uploaded' },
            { value: 'takenAt', label: language === 'zh' ? '拍摄时间' : 'Captured' },
          ]}
          onChange={(value) => filters.setSortBy(value as 'createdAt' | 'takenAt')}
          ariaLabel={language === 'zh' ? '排序' : 'Sort'}
          className="w-28 shrink-0"
        />
        <button type="button" onClick={() => filters.setSortOrder(filters.sortOrder === 'asc' ? 'desc' : 'asc')} title={filters.sortOrder === 'asc' ? (language === 'zh' ? '升序' : 'Ascending') : (language === 'zh' ? '降序' : 'Descending')} aria-label={filters.sortOrder === 'asc' ? (language === 'zh' ? '升序' : 'Ascending') : (language === 'zh' ? '降序' : 'Descending')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-input hover:bg-secondary">{filters.sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}</button>
      </div>

      {/* 与本地资源库一致：中间浏览工作区 + 底部状态栏 + 右侧详情栏。 */}
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-auto px-3 pb-4" onScroll={handleScroll}>
        <div className="sticky top-0 z-10 flex h-8 items-center justify-between gap-3 bg-background/90 text-[10px] backdrop-blur" style={{ color: 'var(--muted-foreground)' }}>
          <div className="flex min-w-0 items-center gap-2"><span className="flex size-5 shrink-0 items-center justify-center rounded bg-secondary" style={{ color: 'var(--foreground)' }}><LayoutGrid size={11} /></span><span className="truncate font-medium" style={{ color: 'var(--foreground)' }}>{collectionTitle}</span></div>
          <span className="shrink-0 rounded bg-secondary px-2 py-0.5 tabular-nums">{total.toLocaleString()} {t('admin.photos', language)}</span>
        </div>
        {loading ? (
          <ThumbGridSkeleton count={15} cols={Math.max(2, Math.floor(900 / gridSize))} aspectClassName="aspect-[5/4]" gapClassName="gap-2.5" />
        ) : photos.length === 0 && loadError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3" style={{ color: 'var(--muted-foreground)' }}>
            <span className="text-sm">{loadError}</span>
            <button onClick={() => fetchPhotos(1, false)} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}><RefreshCw size={14} /> {t('common.retry', language)}</button>
          </div>
        ) : photos.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--muted)' }}><ImageOff size={20} style={{ color: 'var(--muted-foreground)' }} /></div>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{t('admin.no_photos', language)}</p>
            <button onClick={() => navigate('/upload')} className="rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>{t('admin.upload', language)}</button>
          </div>
        ) : (
          <>
            {viewMode === 'masonry' ? (
              <div className="flex w-full items-start" style={{ gap: MASONRY_COLUMN_GAP }}>
                {masonryColumns.map((columnPhotos, columnIndex) => (
                  <div key={columnIndex} className="min-w-0 flex-1">
                    {columnPhotos.map(renderPhotoCard)}
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="grid gap-2.5"
                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridSize}px, 1fr))` }}
              >
                {photos.map(renderPhotoCard)}
              </div>
            )}
            {loadingMore && <div className="flex items-center justify-center gap-2 py-5 text-xs" style={{ color: 'var(--muted-foreground)' }}><Loader2 size={14} className="animate-spin" />{language === 'zh' ? '加载中...' : 'Loading...'}</div>}
            {!hasMore && photos.length > 0 && <div className="py-4 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>{language === 'zh' ? `已加载全部 ${total} 张照片` : `All ${total} photos loaded`}</div>}
          </>
        )}

        {/* 保留原有多选交互：照片区域底部悬浮操作栏。 */}
        {selected.size > 0 && (
          <div className="sticky bottom-4 z-20 mt-4 flex justify-center pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border px-1.5 py-1.5 shadow-lg" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
              <span className="whitespace-nowrap px-2 text-xs font-medium">{t('admin.selected', language)} {selected.size}</span>
              <div className="mx-0.5 h-4 w-px" style={{ backgroundColor: 'var(--border)' }} />
              <button onClick={toggleSelectAllLoaded} title={selected.size === photos.length ? (language === 'zh' ? '取消全选' : 'Deselect all') : (language === 'zh' ? '全选已加载' : 'Select loaded')} className="rounded-md p-1.5 transition-colors hover:opacity-80" style={{ backgroundColor: selected.size === photos.length ? 'var(--accent)' : 'transparent', color: selected.size === photos.length ? 'var(--accent-foreground)' : 'var(--muted-foreground)' }}><CheckSquare size={15} /></button>
              <button onClick={() => handleBatchShowFlag(true)} disabled={batchUpdating} title={language === 'zh' ? '设为展示' : 'Show in gallery'} className="rounded-md p-1.5 hover:opacity-80 disabled:cursor-wait disabled:opacity-50" style={{ color: 'var(--muted-foreground)' }}>{batchUpdating ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}</button>
              <button onClick={() => handleBatchShowFlag(false)} disabled={batchUpdating} title={language === 'zh' ? '设为隐藏' : 'Hide from gallery'} className="rounded-md p-1.5 hover:opacity-80 disabled:cursor-wait disabled:opacity-50" style={{ color: 'var(--muted-foreground)' }}><EyeOff size={15} /></button>
              <button onClick={() => setBatchDeleteDialogOpen(true)} disabled={batchDeleting} title={t('admin.delete_selected', language)} className="rounded-md p-1.5 hover:opacity-80 disabled:cursor-wait disabled:opacity-50" style={{ color: 'var(--destructive)' }}>{batchDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}</button>
              <div className="mx-0.5 h-4 w-px" style={{ backgroundColor: 'var(--border)' }} />
              <button onClick={() => setSelected(new Set())} title={`${t('common.cancel', language)} (Esc)`} className="rounded-md p-1.5 hover:opacity-80" style={{ color: 'var(--muted-foreground)' }}><X size={15} /></button>
            </div>
          </div>
        )}

        <div ref={loadMoreSentinelRef} className="h-px w-full" aria-hidden="true" />
        </div>

        <div className="flex min-h-10 shrink-0 items-center gap-3 border-t px-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
            <span>{photos.length.toLocaleString()} / {total.toLocaleString()} {t('admin.photos', language)}</span>
          </div>
          <button type="button" disabled={loading} onClick={() => fetchPhotos(1, false)} className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] hover:bg-secondary disabled:cursor-wait disabled:opacity-50"><RefreshCw size={11} className={loading ? 'animate-spin' : ''} />{t('common.refresh', language)}</button>
          <div className="ml-1 flex shrink-0 items-center gap-2 border-l pl-3" style={{ borderColor: 'var(--border)' }}>
            <Minus size={11} style={{ color: 'var(--muted-foreground)' }} />
            <input type="range" min={MIN_PHOTO_GRID_SIZE} max={MAX_PHOTO_GRID_SIZE} step={8} value={gridSize} onChange={(event) => setPhotoGridSize(Number(event.target.value))} aria-label={language === 'zh' ? '网格缩放' : 'Grid zoom'} title={language === 'zh' ? '网格缩放' : 'Grid zoom'} className="h-1 w-28 cursor-pointer accent-current" />
            <Plus size={11} style={{ color: 'var(--muted-foreground)' }} />
            <span className="w-8 text-right text-[9px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>{Math.round(gridSize / 176 * 100)}%</span>
          </div>
        </div>
        </main>

        <PhotoInfoSidebar
          photo={sidebarPhoto}
          token={token}
          t={tForPanel}
          notify={notifyForPanel}
          onOpenPreview={handlePhotoDoubleClick}
          onEditDetails={(photo) => openEditor(photo, 'info')}
          onEditStory={(photo) => openEditor(photo, 'story')}
          onToggleFeatured={toggleFeatured}
          onToggleShow={toggleShowFlag}
          onDelete={requestDeletePhoto}
          onSave={handleDetailSave}
          onUnauthorized={logout}
        />
      </div>

      <SimpleDeleteDialog
        isOpen={batchDeleteDialogOpen}
        title={t('common.batchDelete', language)}
        message={t('admin.photos_batch_delete_confirm', language, { count: selected.size })}
        onConfirm={handleBatchDelete}
        onCancel={() => setBatchDeleteDialogOpen(false)}
        t={(key) => t(key, language)}
      />

      <SimpleDeleteDialog
        isOpen={!!deleteTarget}
        message={t('admin.photos_delete_confirm', language)}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        t={(key) => t(key, language)}
      />

      {/* 完整编辑/叙事弹层（从右侧信息栏打开） */}
      <PhotoDetailPanel
        photo={editorState ? (editorState.photo as unknown as PhotoDto) : null}
        isOpen={!!editorState}
        initialTab={editorState?.mode}
        categories={categories}
        allPhotos={photos as unknown as PhotoDto[]}
        token={token}
        onClose={() => setEditorState(null)}
        onSave={handleDetailSave}
        onUnauthorized={logout}
        t={tForPanel}
        notify={notifyForPanel}
      />

      {/* 大图预览（双击卡片/点击侧栏缩略图打开） */}
      {previewPhoto && (
        <PhotoPreviewOverlay
          photo={previewPhoto}
          t={tForPanel}
          onClose={() => setPreviewPhoto(null)}
          onPrevious={() => goPreview(-1)}
          onNext={() => goPreview(1)}
          hasPrevious={previewIndex > 0}
          hasNext={previewIndex >= 0 && previewIndex < photos.length - 1}
        />
      )}
    </>
  )
}
