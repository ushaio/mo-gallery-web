import { useState, useEffect, useCallback, useRef } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePreferences, usePhotoFilters } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { resolveAssetUrl } from '@/lib/api'
import type { Photo, PaginatedResponse } from '@/types'
import { toast } from 'sonner'
import { Grid3X3, List, Star, StarOff, Eye, EyeOff, Trash2, Loader2 } from 'lucide-react'

const PAGE_SIZE = 50

export function PhotosPage() {
  const { language, photoColumns } = usePreferences()
  const filters = usePhotoFilters()

  const [photos, setPhotos] = useState<Photo[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [categories, setCategories] = useState<string[]>([])
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)

  const pageRef = useRef(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fetchingRef = useRef(false)

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
    } catch (err) {
      console.error('获取照片失败:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
      fetchingRef.current = false
    }
  }, [filters])

  // 筛选变化时重置列表
  useEffect(() => {
    pageRef.current = 1
    setHasMore(true)
    setPhotos([])
    fetchPhotos(1, false)
  }, [filters.category, filters.search, filters.photoType, filters.channel,
      filters.albumId, filters.cameraId, filters.lensId, filters.featured,
      filters.sortBy, filters.sortOrder])

  // 加载分类
  useEffect(() => {
    (async () => {
      try {
        const result = await (window as any).go.main.App.GetCategories()
        setCategories(result || [])
      } catch {}
    })()
  }, [])

  // 滚动到底部附近时加载更多
  const handleScroll = useCallback(() => {
    if (fetchingRef.current || !hasMore || loadingMore) return

    const el = scrollRef.current
    if (!el) return

    // 距离底部 300px 时触发
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
      fetchPhotos(pageRef.current + 1, true)
    }
  }, [hasMore, loadingMore, fetchPhotos])

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleFeatured = async (id: string) => {
    try {
      await (window as any).go.main.App.ToggleFeatured(id)
      setPhotos(prev => prev.map(p => p.id === id ? { ...p, isFeatured: !p.isFeatured } : p))
    } catch {}
  }

  const toggleShowFlag = async (id: string) => {
    try {
      await (window as any).go.main.App.ToggleShowFlag(id)
      setPhotos(prev => prev.map(p => p.id === id ? { ...p, showFlag: !p.showFlag } : p))
    } catch {}
  }

  const deletePhoto = async (id: string) => {
    if (!confirm(t('admin.photos_delete_confirm', language))) return
    const toastId = toast.loading('正在删除照片...')
    setDeletingIds(prev => new Set(prev).add(id))
    try {
      await (window as any).go.main.App.DeletePhoto(id, { deleteOriginal: false, deleteThumbnail: true, force: false })
      setPhotos(prev => prev.filter(p => p.id !== id))
      setSelected(prev => { const next = new Set(prev); next.delete(id); return next })
      setTotal(prev => prev - 1)
      toast.success('照片已删除', { id: toastId })
    } catch (err: any) {
      toast.error(err?.message || '删除失败', { id: toastId })
    } finally {
      setDeletingIds(prev => { const next = new Set(prev); next.delete(id); return next })
    }
  }

  return (
    <>
      <PageHeader
        title={t('admin.page_photos', language)}
        description={`${total} photos`}
        actions={
          <div className="flex items-center gap-2">
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

            {selected.size > 0 && (
              <button onClick={async () => {
                if (!confirm(t('admin.photos_batch_delete_confirm', language, { count: selected.size }))) return
                const ids = Array.from(selected)
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
              }} disabled={batchDeleting} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-opacity hover:opacity-80 disabled:opacity-60 disabled:cursor-wait"
                style={{ backgroundColor: 'var(--destructive)', color: 'var(--destructive-foreground)' }}>
                {batchDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {batchDeleting ? '删除中...' : `${t('common.batchDelete', language)} (${selected.size})`}
              </button>
            )}
          </div>
        }
      />

      {/* 筛选栏 */}
      <div className="flex items-center gap-2 px-6 py-2 border-b overflow-x-auto shrink-0"
        style={{ borderColor: 'var(--border)' }}>
        <input type="text" placeholder={t('common.search', language)}
          value={filters.search}
          onChange={(e) => filters.setSearch(e.target.value)}
          className="px-3 py-1 text-xs rounded-md border outline-none w-48"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
        <select value={filters.category}
          onChange={(e) => filters.setCategory(e.target.value)}
          className="px-2 py-1 text-xs rounded-md border outline-none"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filters.photoType || ''}
          onChange={(e) => filters.setPhotoType(e.target.value || null)}
          className="px-2 py-1 text-xs rounded-md border outline-none"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
          <option value="">全部类型</option>
          <option value="digital">{t('admin.photos_type_digital', language)}</option>
          <option value="film">{t('admin.photos_type_film', language)}</option>
        </select>
        <select value={filters.sortBy}
          onChange={(e) => filters.setSortBy(e.target.value as any)}
          className="px-2 py-1 text-xs rounded-md border outline-none"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
          <option value="createdAt">上传时间</option>
          <option value="takenAt">拍摄时间</option>
        </select>
      </div>

      {/* 内容区 */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-6" onScroll={handleScroll}>
        {loading ? (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--muted-foreground)' }}>
            {t('common.loading', language)}
          </div>
        ) : photos.length === 0 ? (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--muted-foreground)' }}>
            {t('common.noData', language)}
          </div>
        ) : viewMode === 'grid' ? (
          <>
            <div className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${photoColumns}, minmax(0, 1fr))` }}>
              {photos.map(photo => (
                <div key={photo.id}
                  className={`group relative aspect-square rounded-lg overflow-hidden border transition-opacity ${deletingIds.has(photo.id) ? 'cursor-wait opacity-75' : 'cursor-pointer'}`}
                  style={{ borderColor: selected.has(photo.id) ? 'var(--ring)' : 'transparent' }}
                  onClick={() => { if (!deletingIds.has(photo.id)) toggleSelect(photo.id) }}>
                  <img src={resolveAssetUrl(photo.thumbnailUrl || photo.url)} alt={photo.title}
                    className={`w-full h-full object-cover transition-opacity ${deletingIds.has(photo.id) ? 'opacity-50' : ''}`} loading="lazy" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end">
                    <div className="w-full p-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-white text-xs truncate">{photo.title || 'Untitled'}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); toggleFeatured(photo.id) }}
                          disabled={deletingIds.has(photo.id)} className="p-1 rounded hover:bg-white/20 disabled:opacity-50 disabled:cursor-wait">
                          {photo.isFeatured ? <Star size={14} className="text-yellow-400" /> : <StarOff size={14} className="text-white/60" />}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); toggleShowFlag(photo.id) }}
                          disabled={deletingIds.has(photo.id)} className="p-1 rounded hover:bg-white/20 disabled:opacity-50 disabled:cursor-wait">
                          {photo.showFlag ? <Eye size={14} className="text-white/80" /> : <EyeOff size={14} className="text-white/40" />}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deletePhoto(photo.id) }}
                          disabled={deletingIds.has(photo.id)} className="p-1 rounded hover:bg-red-500/60 disabled:cursor-wait">
                          {deletingIds.has(photo.id) ? <Loader2 size={14} className="text-white/80 animate-spin" /> : <Trash2 size={14} className="text-white/80" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  {deletingIds.has(photo.id) && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/45 text-white">
                      <Loader2 size={20} className="animate-spin" />
                      <span className="text-xs">删除中...</span>
                    </div>
                  )}
                  <div className="absolute top-1.5 left-1.5 flex gap-1">
                    {photo.isFeatured && <span className="px-1.5 py-0.5 text-[10px] rounded bg-yellow-500/90 text-white">★</span>}
                    {!photo.showFlag && <span className="px-1.5 py-0.5 text-[10px] rounded bg-red-500/90 text-white">H</span>}
                    {photo.photoType === 'film' && <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-500/90 text-white">F</span>}
                  </div>
                </div>
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
                <div key={photo.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${deletingIds.has(photo.id) ? 'cursor-wait opacity-70' : 'cursor-pointer'}`}
                  style={{ backgroundColor: selected.has(photo.id) ? 'var(--accent)' : 'transparent' }}
                  onClick={() => { if (!deletingIds.has(photo.id)) toggleSelect(photo.id) }}>
                  <img src={resolveAssetUrl(photo.thumbnailUrl || photo.url)} alt=""
                    className="w-10 h-10 rounded object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{photo.title || 'Untitled'}</p>
                    <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {deletingIds.has(photo.id) ? '删除中...' : `${photo.category || '-'} · ${photo.width}×${photo.height}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {photo.isFeatured && <Star size={14} className="text-yellow-500" />}
                    {!photo.showFlag && <EyeOff size={14} style={{ color: 'var(--muted-foreground)' }} />}
                    <button onClick={(e) => { e.stopPropagation(); toggleFeatured(photo.id) }}
                      disabled={deletingIds.has(photo.id)} className="p-1 rounded hover:opacity-80 disabled:opacity-50 disabled:cursor-wait" style={{ color: 'var(--muted-foreground)' }}>
                      {photo.isFeatured ? <StarOff size={14} /> : <Star size={14} />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deletePhoto(photo.id) }}
                      disabled={deletingIds.has(photo.id)} className="p-1 rounded hover:opacity-80 disabled:cursor-wait" style={{ color: 'var(--destructive)' }}>
                      {deletingIds.has(photo.id) ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
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
      </div>
    </>
  )
}
