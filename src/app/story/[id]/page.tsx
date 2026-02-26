'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { motion, useScroll, useTransform } from 'framer-motion'
import { ArrowLeft, Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { getStory, type StoryDto, type PhotoDto, resolveAssetUrl } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { StoryComments } from '@/components/StoryComments'
import { PhotoDetailModal } from '@/components/PhotoDetailModal'

// Markdown 渲染器（动态加载，避免 SSR 问题）
const MilkdownViewer = dynamic(
  () => import('@/components/MilkdownViewer'),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse space-y-4">
        <div className="h-4 bg-muted rounded w-full"></div>
        <div className="h-4 bg-muted rounded w-5/6"></div>
        <div className="h-4 bg-muted rounded w-4/6"></div>
      </div>
    )
  }
)

// 故事详情页 - 展示单个故事的完整内容、照片画廊和评论
export default function StoryDetailPage() {
  const params = useParams()
  const { t } = useLanguage()
  const { settings } = useSettings()
  const [story, setStory] = useState<StoryDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoDto | null>(null)
  const [activePhotoIndex, setActivePhotoIndex] = useState(0)

  // 头部视差滚动效果
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll()
  const opacity = useTransform(scrollY, [0, 400], [1, 0])
  const scale = useTransform(scrollY, [0, 400], [1, 1.1])

  // 根据路由参数获取故事数据
  useEffect(() => {
    async function fetchStory() {
      if (!params.id) return
      try {
        const storyData = await getStory(params.id as string)
        setStory(storyData)
      } catch (err) {
        console.error('Failed to fetch story:', err)
        setError('Failed to load story')
      } finally {
        setLoading(false)
      }
    }
    fetchStory()
  }, [params.id])

  // 获取照片 URL，支持缩略图和原图
  const getPhotoUrl = (photo: PhotoDto, thumbnail = false): string => {
    const url = thumbnail ? (photo.thumbnailUrl || photo.url) : photo.url
    return resolveAssetUrl(url, settings?.cdn_domain)
  }

  // 获取封面照片：优先使用指定封面，否则使用第一张
  const getCoverPhoto = () => {
    if (!story) return null
    if (story.coverPhotoId) {
      return story.photos.find(p => p.id === story.coverPhotoId) || story.photos[0]
    }
    return story.photos[0]
  }

  // 加载中状态
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-px bg-primary animate-[grow_2s_infinite]" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-primary">Loading Narrative</span>
        </div>
      </div>
    )
  }

  // 错误或未找到故事
  if (error || !story) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6">
          <p className="text-muted-foreground font-serif italic">{error || 'Story not found'}</p>
          <Link href="/story" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest hover:text-primary transition-colors">
            <ArrowLeft className="size-3" />
            {t('story.back_to_list') || 'Back to Journal'}
          </Link>
        </div>
      </div>
    )
  }

  const coverPhoto = getCoverPhoto()
  const coverUrl = coverPhoto ? getPhotoUrl(coverPhoto) : null
  const targetPhotoId = story.coverPhotoId || story.photos[0]?.id

  return (
    <div className="bg-background text-foreground">
      {/* 紧凑型头图区域 - 带视差滚动效果 */}
      <section ref={heroRef} className="relative h-[50vh] md:h-[60vh] w-full overflow-hidden bg-black">
        <motion.div style={{ scale, opacity }} className="absolute inset-0">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={story.title}
              className="w-full h-full object-cover opacity-50"
            />
          ) : (
            <div className="w-full h-full bg-muted/10" />
          )}
          <div className="absolute inset-0 bg-black/50" />
        </motion.div>

        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px w-8 bg-primary/50" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary/80">Narrative</span>
            <div className="h-px w-8 bg-primary/50" />
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif font-light tracking-tighter text-white leading-[0.95] max-w-4xl text-balance">
            {story.title}
          </h1>

          <div className="mt-8 flex items-center gap-6 text-[10px] font-mono uppercase tracking-widest text-white/60">
            <div className="flex items-center gap-2">
              <Calendar className="size-3" />
              {new Date(story.storyDate || story.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            {story.storyDate && story.storyDate !== story.createdAt && (
              <div className="flex items-center gap-2">
                <Clock className="size-3" />
                {new Date(story.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Clock className="size-3" />
              {Math.ceil(story.content.length / 500)} min read
            </div>
          </div>
        </div>

        {/* 返回按钮 */}
        <div className="absolute top-24 left-6 md:left-12 z-10">
          <Link
            href="/story"
            className="group flex items-center gap-3 text-white/50 hover:text-white transition-colors"
          >
            <div className="size-8 flex items-center justify-center border border-white/20 rounded-full group-hover:border-white/40 transition-colors">
              <ArrowLeft className="size-4" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest hidden md:block">Back</span>
          </Link>
        </div>
      </section>

      {/* 主要内容布局 */}
      <div className="container mx-auto px-4 md:px-6 lg:px-8 py-12">
        <div className="max-w-4xl mx-auto">
          {/* 概要信息 */}
          <div className="mb-12 pb-8 border-b border-border/30 text-center">
            <p className="text-xl md:text-2xl font-serif italic text-muted-foreground leading-relaxed">
              {story.photos.length} visual records from this journey.
            </p>
          </div>

          {/* 文章正文 */}
          <article className="milkdown-article prose prose-lg dark:prose-invert max-w-none mb-24">
            <MilkdownViewer content={story.content} />
          </article>
        </div>

        {/* 照片画廊区域 */}
        <div className="max-w-6xl mx-auto mb-24">
          <div className="mb-12 flex items-end justify-between border-b border-border/30 pb-4">
            <div>
              <span className="text-xs font-mono text-primary uppercase tracking-widest">Visual Archive</span>
              <h2 className="text-3xl md:text-4xl font-serif font-light tracking-tight mt-2">Gallery</h2>
            </div>
            <span className="text-sm text-muted-foreground font-mono">{story.photos.length} photos</span>
          </div>

          {story.photos.length > 0 && (
            <div className="space-y-8">
              {/* 焦点大图展示 */}
              <div
                className="relative h-[50vh] md:h-[70vh] w-full overflow-hidden bg-muted/20 rounded-sm group flex items-center justify-center"
              >
                {/* 模糊背景 */}
                <div 
                  className="absolute inset-0 bg-cover bg-center blur-3xl opacity-30 dark:opacity-20 scale-110"
                  style={{ backgroundImage: `url(${getPhotoUrl(story.photos[activePhotoIndex], true)})` }}
                />

                {/* 主图 */}
                <img
                  src={getPhotoUrl(story.photos[activePhotoIndex])}
                  alt={story.photos[activePhotoIndex].title}
                  className="relative max-w-full max-h-full object-contain z-10 cursor-zoom-in transition-transform duration-300"
                  onClick={() => setSelectedPhoto(story.photos[activePhotoIndex])}
                />

                {/* 前后翻页按钮 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setActivePhotoIndex(prev => (prev > 0 ? prev - 1 : story.photos.length - 1))
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white/70 hover:text-white backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100"
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setActivePhotoIndex(prev => (prev < story.photos.length - 1 ? prev + 1 : 0))
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white/70 hover:text-white backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100"
                >
                  <ChevronRight className="size-6" />
                </button>

                {/* 悬浮信息栏：标题和页码 */}
                <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
                  <span className="text-white text-lg font-medium drop-shadow-md">
                    {story.photos[activePhotoIndex].title}
                  </span>
                  <span className="text-white/80 text-sm font-mono bg-black/50 px-2 py-1 rounded">
                    {activePhotoIndex + 1} / {story.photos.length}
                  </span>
                </div>
              </div>

              {/* 缩略图网格 */}
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {story.photos.map((photo, index) => (
                  <div
                    key={photo.id}
                    className={`relative aspect-square overflow-hidden bg-muted cursor-pointer transition-all duration-300 ${
                      index === activePhotoIndex
                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg scale-[1.02]'
                        : 'hover:opacity-80 hover:scale-[1.02]'
                    }`}
                    onClick={() => setActivePhotoIndex(index)}
                    onDoubleClick={() => setSelectedPhoto(photo)}
                  >
                    <img
                      src={getPhotoUrl(photo, true)}
                      alt={photo.title}
                      className={`w-full h-full object-cover transition-all duration-500 ${
                        index === activePhotoIndex ? 'scale-110 grayscale-0' : 'grayscale-[30%] hover:grayscale-0'
                      }`}
                    />
                    {/* 选中状态遮罩 */}
                    {index !== activePhotoIndex && (
                      <div className="absolute inset-0 bg-black/10 hover:bg-transparent transition-colors" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="max-w-4xl mx-auto">
          {/* 评论区 */}
          {targetPhotoId && (
            <div className="mb-16 pt-12 border-t border-border/30">
               <div className="mb-8">
                  <span className="text-xs font-mono text-primary uppercase tracking-widest">Discussion</span>
                  <h2 className="text-2xl font-serif font-light tracking-tight mt-2">Comments</h2>
               </div>
              <StoryComments storyId={story.id} targetPhotoId={targetPhotoId} />
            </div>
          )}

          {/* 底部导航 - 返回故事列表 */}
          <div className="flex justify-center pt-12 border-t border-border/30">
            <Link
              href="/story"
              className="group flex flex-col items-center gap-4 text-muted-foreground hover:text-primary transition-colors"
            >
              <div className="size-12 rounded-full border border-border flex items-center justify-center group-hover:border-primary transition-colors">
                <ArrowLeft className="size-5" />
              </div>
              <span className="text-sm font-bold uppercase tracking-widest">Back to Journal</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 照片详情弹窗 */}
      <PhotoDetailModal
        photo={selectedPhoto}
        isOpen={!!selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
        onPhotoChange={setSelectedPhoto}
        allPhotos={story.photos}
        hideStoryTab
      />
    </div>
  )
}