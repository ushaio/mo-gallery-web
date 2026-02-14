'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { getPhotosWithMeta, getCategories, type PhotoDto, type PhotoPaginationMeta } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { PhotoDetailModal } from '@/components/PhotoDetailModal'
import { GalleryHeader, GalleryToolbar } from '@/components/gallery/GalleryHeader'
import { PhotoGrid } from '@/components/gallery/PhotoGrid'
import { ViewMode } from '@/components/gallery/ViewModeToggle'
import { ArrowUp, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const PAGE_SIZE = 20 // 每页加载照片数量

// 画廊页面 - 支持分类筛选、搜索、多种视图模式和无限滚动
export default function GalleryPage() {
  const { t } = useLanguage()
  const { settings } = useSettings()
  const [photos, setPhotos] = useState<PhotoDto[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('masonry')
  const [grayscale, setGrayscale] = useState(true)
  const [immersive, setImmersive] = useState(true)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState<PhotoPaginationMeta | null>(null)
  
  // 加载更多触发器的 ref（用于 IntersectionObserver）
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const isLoadingRef = useRef(false) // 防止并发加载

  // 初始化数据：根据分类获取照片和分类列表
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true)
        setPhotos([])
        setPage(1)
        
        const category = activeCategory !== 'all' ? activeCategory : undefined
        const [photosResult, categoriesData] = await Promise.all([
          getPhotosWithMeta({ category, page: 1, pageSize: PAGE_SIZE }),
          getCategories()
        ])
        
        setPhotos(photosResult.data)
        setMeta(photosResult.meta)
        setCategories(['all', ...categoriesData.filter(c => c !== 'all' && c !== '全部')])
      } catch (error) {
        console.error('Failed to fetch gallery data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchInitialData()
  }, [activeCategory])

  // 加载更多照片 - 返回 Promise，用于无限滚动
  const loadMore = useCallback(async (): Promise<void> => {
    if (isLoadingRef.current || !meta?.hasMore) return
    
    isLoadingRef.current = true
    setLoadingMore(true)
    
    try {
      const nextPage = page + 1
      const category = activeCategory !== 'all' ? activeCategory : undefined
      const result = await getPhotosWithMeta({ category, page: nextPage, pageSize: PAGE_SIZE })
      
      setPhotos(prev => [...prev, ...result.data])
      setMeta(result.meta)
      setPage(nextPage)
    } catch (error) {
      console.error('Failed to load more photos:', error)
    } finally {
      setLoadingMore(false)
      isLoadingRef.current = false
    }
  }, [page, activeCategory, meta?.hasMore])

  // IntersectionObserver 实现无限滚动
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (first.isIntersecting && meta?.hasMore && !loading && !loadingMore) {
          loadMore()
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    )

    const currentRef = loadMoreRef.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [loadMore, meta?.hasMore, loading, loadingMore])

  // 监听滚动以显示/隐藏"回到顶部"按钮（使用 ref 避免不必要的重渲染）
  const showBackToTopRef = useRef(false)
  useEffect(() => {
    const handleScroll = () => {
      const shouldShow = window.scrollY > 400
      if (shouldShow !== showBackToTopRef.current) {
        showBackToTopRef.current = shouldShow
        setShowBackToTop(shouldShow)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // 平滑滚动到页面顶部
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 按关键词过滤已加载的照片（客户端搜索）
  const filteredPhotos = useMemo(() => {
    if (!search.trim()) return photos

    const searchLower = search.toLowerCase()
    return photos.filter(p =>
      p.title.toLowerCase().includes(searchLower) ||
      p.category.toLowerCase().includes(searchLower)
    )
  }, [photos, search])

  // 显示数量：搜索时显示匹配数，否则显示总数
  const displayCount = search.trim() ? filteredPhotos.length : (meta?.total ?? photos.length)

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-16">
      {/* 页面头部区域 */}
      <div className="px-4 md:px-8 lg:px-12">
        <div className="max-w-screen-2xl mx-auto">
          <GalleryHeader
            activeCategory={activeCategory}
            categories={categories}
            onCategoryChange={(cat) => {
              setActiveCategory(cat)
              setSearch('') // 切换分类时清空搜索
            }}
            photoCount={displayCount}
            t={t}
          />
        </div>
      </div>

      {/* 吸顶工具栏 - 放在容器外以确保吸顶效果正常 */}
      <GalleryToolbar
        search={search}
        onSearchChange={setSearch}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        grayscale={grayscale}
        onGrayscaleChange={setGrayscale}
        immersive={immersive}
        onImmersiveChange={setImmersive}
        t={t}
      />

      {/* 照片网格 */}
      <div className="px-4 md:px-8 lg:px-12">
        <div className="max-w-screen-2xl mx-auto">
          <PhotoGrid
            loading={loading}
            photos={filteredPhotos}
            settings={settings}
            viewMode={viewMode}
            grayscale={grayscale}
            immersive={immersive}
            onPhotoClick={setSelectedPhoto}
            t={t}
          />
          
          {/* 加载更多触发区域 */}
          {!loading && meta?.hasMore && !search.trim() && (
            <div 
              ref={loadMoreRef} 
              className="flex justify-center items-center py-8"
            >
              {loadingMore && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                  <span className="text-sm">{t('gallery.loadingMore') || '加载更多...'}</span>
                </div>
              )}
            </div>
          )}
          
          {/* 列表底部提示 */}
          {!loading && !meta?.hasMore && photos.length > 0 && !search.trim() && (
            <div className="flex justify-center items-center py-8">
              <span className="text-sm text-muted-foreground">
                {t('gallery.noMore') || `已加载全部 ${meta?.total ?? photos.length} 张照片`}
              </span>
            </div>
          )}
        </div>
      </div>

      <PhotoDetailModal
        photo={selectedPhoto}
        isOpen={!!selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
        onPhotoChange={setSelectedPhoto}
        allPhotos={filteredPhotos}
        totalPhotos={search.trim() ? filteredPhotos.length : meta?.total}
        hasMore={!search.trim() && (meta?.hasMore ?? false)}
        onLoadMore={loadMore}
      />

      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={scrollToTop}
            className="fixed bottom-8 right-8 p-3 bg-primary text-primary-foreground rounded-full shadow-lg z-40"
            aria-label="Back to top"
          >
            <ArrowUp className="size-6" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}