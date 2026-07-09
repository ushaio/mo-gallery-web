import { useState, useEffect, useCallback, useRef, useLayoutEffect, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { PhotoDetailPanel } from '@/components/admin/PhotoDetailPanel'
import { useAuth } from '@/contexts/AuthContext'
import { usePreferences, usePhotoFilters } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { resolveAssetUrl, type PhotoDto } from '@/lib/api'
import type { Photo, PaginatedResponse } from '@/types'
import { toast } from 'sonner'
import { ThumbGridSkeleton, ListSkeleton } from '@/components/admin/Skeleton'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import {
  Grid3X3, List, Star, StarOff, Eye, EyeOff, Trash2, Loader2, Check,
  RefreshCw, Search, X, CheckSquare, Film, ImageOff,
} from 'lucide-react'

const PAGE_SIZE = 50

// 模块级缓存：路由切换会卸载页面组件，把已加载的分页数据和滚动位置留在
// 模块作用域里，筛选条件未变时返回本页即恢复，不再从第 1 页重新加载
// （与 UploadPage 的模块级状态保留同一模式）。
let photosPageCache: {
  filterKey: string
  photos: Photo[]
  total: number
  hasMore: boolean
  page: number
  scrollTop: number
} | null = null

const formatListDate = (dateStr?: string) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString()
}

// 缩略图：加载完成前保持透明，避免滚动时图片"闪现"；
// ref 回调兜底缓存命中场景（complete 已为 true 时 onLoad 不会再触发）
function Thumb({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <img
      src={src}
      alt={alt}
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
  onToggleSelect: (id: string) => void
  onToggleFeatured: (id: string) => void
  onToggleShow: (id: string) => void
  onRequestDelete: (photo: Photo) => void
}

interface PhotoCardProps extends PhotoCardActions {
  photo: Photo
  isSelected: boolean
  isDeleting: boolean
}

// memo 化的网格卡片：勾选/搜索输入/加载更多等页面状态变化时，
// 只有 props 变化的卡片重渲染，而不是全部已加载的几百张
const PhotoGridCard = memo(function PhotoGridCard({
  photo, isSelected, isDeleting,
  onCardClick, onToggleSelect, onToggleFeatured, onToggleShow, onRequestDelete,
}: PhotoCardProps) {
  return (
    <div
      className={`group relative aspect-square rounded-lg overflow-hidden transition-all ${isDeleting ? 'cursor-wait opacity-75' : 'cursor-pointer'}`}
      style={{
        backgroundColor: 'var(--muted)',
        boxShadow: isSelected ? '0 0 0 2px var(--primary)' : 'none',
        // 离屏卡片跳过渲染（尺寸由 aspect-square + 网格列宽决定，不依赖内容）
        contentVisibility: 'auto',
      }}
      onClick={(e) => { if (!isDeleting) onCardClick(e, photo) }}>
      <Thumb src={resolveAssetUrl(photo.thumbnailUrl || photo.url)} alt={photo.title}
        className={`w-full h-full object-cover transition-[transform,opacity] duration-300 group-hover:scale-[1.03] ${isDeleting ? '!opacity-50' : ''}`} />

      {/* 复选框（左上，悬停或已选中时显示） */}
      <button
        onClick={(e) => { e.stopPropagation(); if (!isDeleting) onToggleSelect(photo.id) }}
        className={`absolute top-2 left-2 z-10 flex h-5 w-5 items-center justify-center rounded border transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        style={{
          backgroundColor: isSelected ? 'var(--primary)' : 'rgba(0,0,0,0.35)',
          borderColor: isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.6)',
        }}>
        {isSelected && <Check size={12} className="text-white" />}
      </button>

      {/* 状态角标（右上，常驻） */}
      {(photo.isFeatured || !photo.showFlag || photo.photoType === 'film') && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-1 backdrop-blur-[2px]">
          {photo.isFeatured && <Star size={11} className="text-yellow-400 fill-yellow-400" />}
          {!photo.showFlag && <EyeOff size={11} className="text-white/85" />}
          {photo.photoType === 'film' && <Film size={11} className="text-white/85" />}
        </div>
      )}

      {/* 底部渐变信息条（悬停显示：标题 + 操作） */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent pt-8 pb-1.5 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-end justify-between gap-1">
          <span className="text-white text-xs truncate leading-6">{photo.title || 'Untitled'}</span>
          <div className="flex items-center shrink-0">
            <button onClick={(e) => { e.stopPropagation(); onToggleFeatured(photo.id) }}
              disabled={isDeleting} className="p-1 rounded hover:bg-white/20 disabled:opacity-50 disabled:cursor-wait">
              {photo.isFeatured ? <Star size={13} className="text-yellow-400 fill-yellow-400" /> : <Star size={13} className="text-white/70" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onToggleShow(photo.id) }}
              disabled={isDeleting} className="p-1 rounded hover:bg-white/20 disabled:opacity-50 disabled:cursor-wait">
              {photo.showFlag ? <Eye size={13} className="text-white/80" /> : <EyeOff size={13} className="text-white/50" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onRequestDelete(photo) }}
              disabled={isDeleting} className="p-1 rounded hover:bg-red-500/60 disabled:cursor-wait">
              {isDeleting ? <Loader2 size={13} className="text-white/80 animate-spin" /> : <Trash2 size={13} className="text-white/80" />}
            </button>
          </div>
        </div>
      </div>

      {isDeleting && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/45 text-white">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-xs">删除中...</span>
        </div>
      )}
    </div>
  )
})

const PhotoListRow = memo(function PhotoListRow({
  photo, isSelected, isDeleting,
  onCardClick, onToggleSelect, onToggleFeatured, onRequestDelete,
}: Omit<PhotoCardProps, 'onToggleShow'>) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${isDeleting ? 'cursor-wait opacity-70' : 'cursor-pointer'}`}
      style={{
        backgroundColor: isSelected ? 'var(--accent)' : 'transparent',
        contentVisibility: 'auto',
        containIntrinsicSize: '0 56px',
      }}
      onClick={(e) => { if (!isDeleting) onCardClick(e, photo) }}>
      <button
        onClick={(e) => { e.stopPropagation(); if (!isDeleting) onToggleSelect(photo.id) }}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors"
        style={{
          backgroundColor: isSelected ? 'var(--primary)' : 'transparent',
          borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
        }}>
        {isSelected && <Check size={11} className="text-white" />}
      </button>
      <Thumb src={resolveAssetUrl(photo.thumbnailUrl || photo.url)} alt=""
        className="w-10 h-10 rounded object-cover shrink-0 transition-opacity duration-300" />
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{photo.title || 'Untitled'}</p>
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          {isDeleting
            ? '删除中...'
            : [photo.category || '-', `${photo.width}×${photo.height}`, formatListDate(photo.takenAt || photo.createdAt)]
                .filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {photo.isFeatured && <Star size={14} className="text-yellow-500" />}
        {!photo.showFlag && <EyeOff size={14} style={{ color: 'var(--muted-foreground)' }} />}
        <button onClick={(e) => { e.stopPropagation(); onToggleFeatured(photo.id) }}
          disabled={isDeleting} className="p-1 rounded hover:opacity-80 disabled:opacity-50 disabled:cursor-wait" style={{ color: 'var(--muted-foreground)' }}>
          {photo.isFeatured ? <StarOff size={14} /> : <Star size={14} />}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onRequestDelete(photo) }}
          disabled={isDeleting} className="p-1 rounded hover:opacity-80 disabled:cursor-wait" style={{ color: 'var(--destructive)' }}>
          {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  )
})

export function PhotosPage() {
  const { language, photoColumns } = usePreferences()
  const filters = usePhotoFilters()
  const { token, logout } = useAuth()
  const navigate = useNavigate()

  const filterKey = JSON.stringify([
    filters.category, filters.search, filters.photoType, filters.channel,
    filters.albumId, filters.cameraId, filters.lensId, filters.featured,
    filters.sortBy, filters.sortOrder,
  ])
  const cacheHitRef = useRef(photosPageCache !== null && photosPageCache.filterKey === filterKey)

  const [photos, setPhotos] = useState<Photo[]>(() => cacheHitRef.current ? photosPageCache!.photos : [])
  const [total, setTotal] = useState(() => cacheHitRef.current ? photosPageCache!.total : 0)
  const [hasMore, setHasMore] = useState(() => cacheHitRef.current ? photosPageCache!.hasMore : true)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [categories, setCategories] = useState<string[]>([])
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<Photo | null>(null)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false)
  const [batchUpdating, setBatchUpdating] = useState(false)
  const [detailPhoto, setDetailPhoto] = useState<Photo | null>(null)
  // 搜索输入本地回显，300ms 防抖后才写入筛选（避免每键一次全量请求）
  const [searchInput, setSearchInput] = useState(filters.search)

  const pageRef = useRef(cacheHitRef.current ? photosPageCache!.page : 1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fetchingRef = useRef(false)
  const lastScrollTopRef = useRef(0)
  const scrollRafPendingRef = useRef(false)
  // Shift 范围选择的锚点（最近一次勾选的照片）
  const anchorIdRef = useRef<string | null>(null)

  // 渲染期同步最新状态，供卸载写缓存和稳定回调（滚动/键盘）读取
  const latestRef = useRef({ photos, total, hasMore, filterKey })
  latestRef.current = { photos, total, hasMore, filterKey }

  useLayoutEffect(() => {
    if (cacheHitRef.current && photosPageCache && scrollRef.current) {
      scrollRef.current.scrollTop = photosPageCache.scrollTop
      lastScrollTopRef.current = photosPageCache.scrollTop
    }
  }, [])

  useEffect(() => () => {
    photosPageCache = {
      filterKey: latestRef.current.filterKey,
      photos: latestRef.current.photos,
      total: latestRef.current.total,
      hasMore: latestRef.current.hasMore,
      page: pageRef.current,
      scrollTop: lastScrollTopRef.current,
    }
  }, [])

  // 加载照片（追加模式）
  const fetchPhotos = useCallback(async (pageNum: number, append: boolean) => {
    if (fetchingRef.current) return
    fetchingRef.current = true

    if (append) setLoadingMore(true)
    else setLoading(true)

    try {
      const result: PaginatedResponse<Photo> = await (window as any).go.main.App.GetPhotos({
        category: filters.category === '全部' ? '' : filters.category,
        search: filters.search,
        photoType: filters.photoType,
        channel: filters.channel,
        albumId: filters.albumId,
        cameraId: filters.cameraId,
        lensId: filters.lensId,
        featured: filters.featured,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        page: pageNum,
        pageSize: PAGE_SIZE,
      })

      const newData = result.data || []
      setPhotos(prev => append ? [...prev, ...newData] : newData)
      setTotal(result.meta?.total || 0)
      setHasMore(result.meta?.hasMore ?? false)
      pageRef.current = pageNum
      setLoadError(null)
    } catch (err: any) {
      console.error('获取照片失败:', err)
      setLoadError(err?.message || '加载照片失败，请检查网络连接')
      if (append) toast.error(err?.message || '加载更多失败')
    } finally {
      setLoading(false)
      setLoadingMore(false)
      fetchingRef.current = false
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
    if (cacheHitRef.current) {
      cacheHitRef.current = false
      return
    }
    pageRef.current = 1
    setHasMore(true)
    setPhotos([])
    setSelected(new Set())
    anchorIdRef.current = null
    scrollRef.current?.scrollTo({ top: 0 })
    fetchPhotos(1, false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey])

  // 加载分类
  useEffect(() => {
    (async () => {
      try {
        const result = await (window as any).go.main.App.GetCategories()
        setCategories(result || [])
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
      // 距离底部 300px 时触发
      if (node.scrollTop + node.clientHeight >= node.scrollHeight - 300) {
        fetchPhotosRef.current(pageRef.current + 1, true)
      }
    })
  }, [])

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

  // 详情面板保存后把更新合并回列表（接口 JSON 不含 undefined 键，直接展开安全）
  const handleDetailSave = useCallback((updated: PhotoDto) => {
    setPhotos(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } as Photo : p))
    setDetailPhoto(prev => prev && prev.id === updated.id ? { ...prev, ...updated } as Photo : prev)
  }, [])

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
      await (window as any).go.main.App.ToggleFeatured(id)
    } catch (err: any) {
      setPhotos(prev => prev.map(p => p.id === id ? { ...p, isFeatured: !p.isFeatured } : p))
      toast.error(err?.message || '更新精选状态失败')
    }
  }, [])

  const toggleShowFlag = useCallback(async (id: string) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, showFlag: !p.showFlag } : p))
    try {
      await (window as any).go.main.App.ToggleShowFlag(id)
    } catch (err: any) {
      setPhotos(prev => prev.map(p => p.id === id ? { ...p, showFlag: !p.showFlag } : p))
      toast.error(err?.message || '更新展示状态失败')
    }
  }, [])

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
      await (window as any).go.main.App.DeletePhoto(id, { deleteOriginal: false, deleteThumbnail: true, force: false })
      setPhotos(prev => prev.filter(p => p.id !== id))
      setSelected(prev => { const next = new Set(prev); next.delete(id); return next })
      setDetailPhoto(prev => prev && prev.id === id ? null : prev)
      setTotal(prev => prev - 1)
      toast.success('照片已删除', { id: toastId })
    } catch (err: any) {
      toast.error(err?.message || '删除失败', { id: toastId })
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
      await (window as any).go.main.App.BatchDeletePhotos({
        photoIds: ids, deleteOriginal: false, deleteThumbnail: true, force: false,
      })
      setSelected(new Set())
      pageRef.current = 1
      await fetchPhotos(1, false)
      toast.success('照片已删除', { id: toastId })
    } catch (err: any) {
      toast.error(err?.message || '批量删除失败', { id: toastId })
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
      await (window as any).go.main.App.BatchUpdateShowFlag(ids, show)
      setPhotos(prev => prev.map(p => selected.has(p.id) ? { ...p, showFlag: show } : p))
      toast.success(show ? `已将 ${ids.length} 张照片设为展示` : `已将 ${ids.length} 张照片设为隐藏`)
    } catch (err: any) {
      toast.error(err?.message || '批量更新失败')
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

  // Esc 清除多选（详情面板/对话框打开时让位）
  useEffect(() => {
    if (selected.size === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !detailPhoto && !batchDeleteDialogOpen && !deleteTarget) {
        setSelected(new Set())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected.size, detailPhoto, batchDeleteDialogOpen, deleteTarget])

  // 详情面板键盘导航：←/→ 切换上一张/下一张，Esc 关闭；
  // 输入控件聚焦时不拦截，接近已加载末尾时预取下一页
  useEffect(() => {
    if (!detailPhoto) return
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
  }, [detailPhoto, batchDeleteDialogOpen, deleteTarget])

  return (
    <>
      <PageHeader
        title={t('admin.page_photos', language)}
        description={`${total} ${t('admin.photos', language)}`}
        actions={
          <div className="flex rounded-md border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <button onClick={() => setViewMode('grid')} className="p-1.5 transition-colors"
              style={{ backgroundColor: viewMode === 'grid' ? 'var(--accent)' : 'transparent',
                color: viewMode === 'grid' ? 'var(--accent-foreground)' : 'var(--muted-foreground)' }}>
              <Grid3X3 size={16} />
            </button>
            <button onClick={() => setViewMode('list')} className="p-1.5 transition-colors"
              style={{ backgroundColor: viewMode === 'list' ? 'var(--accent)' : 'transparent',
                color: viewMode === 'list' ? 'var(--accent-foreground)' : 'var(--muted-foreground)' }}>
              <List size={16} />
            </button>
          </div>
        }
      />

      {/* 筛选栏 */}
      <div className="flex items-center gap-2 px-6 py-2.5 border-b overflow-x-auto shrink-0"
        style={{ borderColor: 'var(--border)' }}>
        <div className="relative shrink-0">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--muted-foreground)' }} />
          <input type="text" placeholder={t('common.search', language)}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-56 pl-8 pr-7 py-1.5 text-xs rounded-md border outline-none transition-colors focus:ring-1"
            style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
          {searchInput && (
            <button onClick={() => setSearchInput('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:opacity-70"
              style={{ color: 'var(--muted-foreground)' }}>
              <X size={12} />
            </button>
          )}
        </div>
        <select value={filters.category}
          onChange={(e) => filters.setCategory(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-md border outline-none shrink-0"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filters.photoType || ''}
          onChange={(e) => filters.setPhotoType(e.target.value || null)}
          className="px-2 py-1.5 text-xs rounded-md border outline-none shrink-0"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
          <option value="">全部类型</option>
          <option value="digital">{t('admin.photos_type_digital', language)}</option>
          <option value="film">{t('admin.photos_type_film', language)}</option>
        </select>
        <select value={filters.sortBy}
          onChange={(e) => filters.setSortBy(e.target.value as any)}
          className="px-2 py-1.5 text-xs rounded-md border outline-none shrink-0"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
          <option value="createdAt">上传时间</option>
          <option value="takenAt">拍摄时间</option>
        </select>
      </div>

      {/* 内容区 */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-6" onScroll={handleScroll}>
        {loading ? (
          viewMode === 'grid'
            ? <ThumbGridSkeleton count={photoColumns * 3} cols={photoColumns} />
            : <ListSkeleton count={10} />
        ) : photos.length === 0 && loadError ? (
          <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: 'var(--muted-foreground)' }}>
            <span className="text-sm">{loadError}</span>
            <button onClick={() => fetchPhotos(1, false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              <RefreshCw size={14} /> {t('common.retry', language)}
            </button>
          </div>
        ) : photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--muted)' }}>
              <ImageOff size={20} style={{ color: 'var(--muted-foreground)' }} />
            </div>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {t('admin.no_photos', language)}
            </p>
            <button onClick={() => navigate('/upload')}
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
              {t('admin.upload', language)}
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <>
            <div className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${photoColumns}, minmax(0, 1fr))` }}>
              {photos.map(photo => (
                <PhotoGridCard key={photo.id}
                  photo={photo}
                  isSelected={selected.has(photo.id)}
                  isDeleting={deletingIds.has(photo.id)}
                  onCardClick={handlePhotoClick}
                  onToggleSelect={toggleSelect}
                  onToggleFeatured={toggleFeatured}
                  onToggleShow={toggleShowFlag}
                  onRequestDelete={requestDeletePhoto}
                />
              ))}
            </div>

            {/* 加载更多指示器 */}
            {loadingMore && (
              <div className="flex items-center justify-center py-4 gap-2" style={{ color: 'var(--muted-foreground)' }}>
                <Loader2 size={16} className="animate-spin" />
                <span className="text-xs">加载中...</span>
              </div>
            )}
            {!hasMore && photos.length > 0 && (
              <div className="text-center py-4 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                已加载全部 {total} 张照片
              </div>
            )}
          </>
        ) : (
          <>
            <div className="space-y-1">
              {photos.map(photo => (
                <PhotoListRow key={photo.id}
                  photo={photo}
                  isSelected={selected.has(photo.id)}
                  isDeleting={deletingIds.has(photo.id)}
                  onCardClick={handlePhotoClick}
                  onToggleSelect={toggleSelect}
                  onToggleFeatured={toggleFeatured}
                  onRequestDelete={requestDeletePhoto}
                />
              ))}
            </div>

            {loadingMore && (
              <div className="flex items-center justify-center py-4 gap-2" style={{ color: 'var(--muted-foreground)' }}>
                <Loader2 size={16} className="animate-spin" />
                <span className="text-xs">加载中...</span>
              </div>
            )}
            {!hasMore && photos.length > 0 && (
              <div className="text-center py-4 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                已加载全部 {total} 张照片
              </div>
            )}
          </>
        )}

        {/* 底部浮动选中操作条 */}
        {selected.size > 0 && (
          <div className="sticky bottom-4 z-20 flex justify-center pointer-events-none mt-4">
            <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border px-1.5 py-1.5 shadow-lg"
              style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
              <span className="px-2 text-xs font-medium whitespace-nowrap">
                {t('admin.selected', language)} {selected.size}
              </span>
              <div className="w-px h-4 mx-0.5" style={{ backgroundColor: 'var(--border)' }} />
              <button onClick={toggleSelectAllLoaded}
                title={selected.size === photos.length ? '取消全选' : '全选已加载'}
                className="p-1.5 rounded-md transition-colors hover:opacity-80"
                style={{
                  backgroundColor: selected.size === photos.length ? 'var(--accent)' : 'transparent',
                  color: selected.size === photos.length ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                }}>
                <CheckSquare size={15} />
              </button>
              <button onClick={() => handleBatchShowFlag(true)} disabled={batchUpdating}
                title="设为展示" className="p-1.5 rounded-md hover:opacity-80 disabled:opacity-50 disabled:cursor-wait"
                style={{ color: 'var(--muted-foreground)' }}>
                {batchUpdating ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
              </button>
              <button onClick={() => handleBatchShowFlag(false)} disabled={batchUpdating}
                title="设为隐藏" className="p-1.5 rounded-md hover:opacity-80 disabled:opacity-50 disabled:cursor-wait"
                style={{ color: 'var(--muted-foreground)' }}>
                <EyeOff size={15} />
              </button>
              <button onClick={() => setBatchDeleteDialogOpen(true)} disabled={batchDeleting}
                title={t('admin.delete_selected', language)}
                className="p-1.5 rounded-md hover:opacity-80 disabled:opacity-50 disabled:cursor-wait"
                style={{ color: 'var(--destructive)' }}>
                {batchDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              </button>
              <div className="w-px h-4 mx-0.5" style={{ backgroundColor: 'var(--border)' }} />
              <button onClick={() => setSelected(new Set())}
                title={`${t('common.cancel', language)} (Esc)`}
                className="p-1.5 rounded-md hover:opacity-80"
                style={{ color: 'var(--muted-foreground)' }}>
                <X size={15} />
              </button>
            </div>
          </div>
        )}
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

      <PhotoDetailPanel
        photo={detailPhoto as unknown as PhotoDto | null}
        isOpen={!!detailPhoto}
        categories={categories}
        allPhotos={photos as unknown as PhotoDto[]}
        token={token}
        onClose={() => setDetailPhoto(null)}
        onSave={handleDetailSave}
        onUnauthorized={logout}
        t={tForPanel}
        notify={notifyForPanel}
      />
    </>
  )
}
