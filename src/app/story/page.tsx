'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Calendar, ArrowRight, Image as ImageIcon, ArrowUpRight, Clock } from 'lucide-react'
import Link from 'next/link'
import { getStories, type StoryDto } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { resolveAssetUrl } from '@/lib/api'
import { QuickStoryEditor } from '@/components/story/QuickStoryEditor'

// 故事列表页 - 按年月时间线展示所有故事
export default function StoryListPage() {
  const { t } = useLanguage()
  const { settings } = useSettings()
  const [stories, setStories] = useState<StoryDto[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'storyDate' | 'createdAt'>('storyDate')

  // 加载故事列表数据
  async function loadStories(sort: 'storyDate' | 'createdAt' = sortBy) {
    try {
      setLoading(true)
      const storiesData = await getStories(sort)
      setStories(storiesData)
    } catch (error) {
      console.error('Failed to fetch story data:', error)
    } finally {
      setLoading(false)
    }
  }

  // 页面初始化时加载数据
  useEffect(() => {
    loadStories()
  }, [])

  // 切换排序方式
  function handleSortChange(sort: 'storyDate' | 'createdAt') {
    if (sort === sortBy) return
    setSortBy(sort)
    loadStories(sort)
  }

  // 获取排序使用的日期字段
  const getDateField = (story: StoryDto) => {
    return sortBy === 'storyDate' ? (story.storyDate || story.createdAt) : story.createdAt
  }

  // 按年份和月份对故事进行分组，用于时间线展示
  const timelineData = useMemo(() => {
    const grouped: Record<string, Record<string, StoryDto[]>> = {}
    stories.forEach(story => {
      const date = new Date(getDateField(story))
      const year = date.getFullYear().toString()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      if (!grouped[year]) grouped[year] = {}
      if (!grouped[year][month]) grouped[year][month] = []
      grouped[year][month].push(story)
    })
    return grouped
  }, [stories, sortBy])

  // 年份降序排列
  const years = useMemo(() => {
    return Object.keys(timelineData).sort((a, b) => parseInt(b) - parseInt(a))
  }, [timelineData])

  // 获取月份英文名称
  const getMonthName = (month: string) => {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December']
    return monthNames[parseInt(month) - 1]
  }

  // 获取故事封面图片 URL：优先使用指定封面，其次使用第一张照片
  const getCoverUrl = (story: StoryDto): string | null => {
    if (story.coverPhotoId && story.photos.length > 0) {
      const coverPhoto = story.photos.find(p => p.id === story.coverPhotoId)
      if (coverPhoto) {
        return resolveAssetUrl(coverPhoto.thumbnailUrl || coverPhoto.url, settings?.cdn_domain)
      }
    }
    if (story.photos.length > 0) {
      const firstPhoto = story.photos[0]
      return resolveAssetUrl(firstPhoto.thumbnailUrl || firstPhoto.url, settings?.cdn_domain)
    }
    return null
  }

  // 加载骨架屏 - 故事卡片占位
  const StorySkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10 pl-4 md:pl-8">
      {[...Array(6)].map((_, i) => {
        const isWide = i % 7 === 0
        const isTall = i % 5 === 2
        return (
          <div key={i} className={`animate-pulse space-y-5 ${isWide ? 'md:col-span-2' : ''}`}>
            <div className={`bg-muted ${isTall && !isWide ? 'aspect-[3/4]' : isWide ? 'aspect-[21/9]' : 'aspect-[3/2]'}`} />
            <div className="space-y-3 px-1">
              <div className="flex justify-between">
                <div className="h-6 bg-muted w-2/3" />
                <div className="h-4 bg-muted w-24" />
              </div>
              <div className="h-4 bg-muted w-5/6" />
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-16">
      {/* 页面头部区域 */}
      <div className="px-4 md:px-8 lg:px-12">
        <div className="max-w-screen-2xl mx-auto">
          <header className="relative mb-12 md:mb-16">
            <div className="flex flex-col gap-8">
              {/* 标题区域 */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-px w-6 bg-primary/60" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary/80">
                      Journal
                    </span>
                  </div>
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-light tracking-tight text-balance">
                    {t('nav.story')}
                  </h1>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground/60 font-serif italic hidden md:block">
                    Visual narratives
                  </span>
                  <div className="h-4 w-px bg-border/50 hidden md:block" />
                  <div className="text-xs font-mono text-muted-foreground tracking-wider">
                    {loading ? '—' : stories.length} {t('story.count_suffix') || 'STORIES'}
                  </div>
                </div>
              </div>

              {/* 分隔线 */}
              <div className="border-t border-border/30" />

              {/* 排序切换 Tab */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleSortChange('storyDate')}
                  className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-all ${
                    sortBy === 'storyDate'
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground/60 hover:text-foreground'
                  }`}
                >
                  {t('sort_by_story_date')}
                </button>
                <button
                  onClick={() => handleSortChange('createdAt')}
                  className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-all ${
                    sortBy === 'createdAt'
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground/60 hover:text-foreground'
                  }`}
                >
                  {t('sort_by_publish_date')}
                </button>
              </div>
            </div>
          </header>
        </div>
      </div>

      {/* 故事内容区域 */}
      <div className="px-4 md:px-8 lg:px-12">
        <div className="max-w-screen-2xl mx-auto">
          <QuickStoryEditor onSuccess={() => loadStories()} />

          {loading ? (
            <StorySkeleton />
          ) : stories.length === 0 ? (
            <div className="py-24 text-center border-t border-border/50">
              <BookOpen className="size-10 mx-auto mb-4 opacity-20" />
              <p className="text-muted-foreground font-serif italic text-sm">{t('story.empty') || 'No stories found yet.'}</p>
            </div>
          ) : (
            <div className="space-y-16">
              {years.map((year) => {
                const months = Object.keys(timelineData[year]).sort((a, b) => parseInt(b) - parseInt(a))

                return (
                  <section key={year} className="relative">
                    {/* 年份标题 - 页面滚动时吸顶 */}
                    <motion.div
                      className="sticky top-20 z-20 py-3 bg-background/95 backdrop-blur-sm transition-all duration-200"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-4xl md:text-5xl font-mono font-black tracking-tighter text-foreground/10">
                          {year}
                        </span>
                        <div className="h-px flex-1 bg-border/30" />
                      </div>
                    </motion.div>

                    {/* 年份内的月份分组 */}
                    <div className="space-y-12 mt-6">
                      {months.map((month) => {
                        const storiesInMonth = timelineData[year][month]
                        let storyIndex = 0

                        return (
                          <div key={`${year}-${month}`} className="relative">
                            {/* 月份标题 - 吸顶在年份标题下方 */}
                            <motion.div
                              className="sticky top-36 z-10 py-2 bg-background/90 backdrop-blur-sm transition-all duration-200"
                              initial={{ opacity: 0, x: -10 }}
                              whileInView={{ opacity: 1, x: 0 }}
                              viewport={{ once: true }}
                              transition={{ duration: 0.2, ease: "easeOut" }}
                            >
                              <div className="flex items-center gap-3 pl-4 md:pl-8">
                                <Calendar className="size-3.5 text-primary/60" />
                                <span className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
                                  {getMonthName(month)}
                                </span>
                                <span className="text-[10px] font-mono text-muted-foreground/40">
                                  ({storiesInMonth.length})
                                </span>
                                <div className="h-px flex-1 bg-border/20" />
                              </div>
                            </motion.div>

                            {/* 故事卡片网格 - 不规则/非对称布局 */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10 mt-8 pl-4 md:pl-8">
                              {storiesInMonth.map((story, i) => {
                                const coverUrl = getCoverUrl(story)
                                const currentIndex = storyIndex++
                                // 创建不规则布局效果
                                const isWide = i % 7 === 0 || i % 7 === 6
                                const isTall = i % 5 === 2
                                const offset = i % 2 === 1 && !isWide ? 'lg:mt-6' : ''

                                return (
                                  <motion.div
                                    key={story.id}
                                    initial={{ opacity: 0, y: 30 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, margin: "-50px" }}
                                    transition={{ duration: 0.2, ease: "easeOut" }}
                                    className={`group relative flex flex-col gap-5 ${isWide ? 'md:col-span-2' : ''} ${offset}`}
                                    onMouseEnter={() => setHoveredId(story.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                  >
                                    <Link href={`/story/${story.id}`} className="block h-full">
                                      <div className="flex flex-col h-full">
                                        {/* 图片容器 */}
                                        <div className={`relative overflow-hidden bg-muted mb-5 group-hover:shadow-2xl transition-shadow duration-200 ease-out ${isTall && !isWide ? 'aspect-[3/4]' : isWide ? 'aspect-[21/9]' : 'aspect-[3/2]'}`}>
                                          {coverUrl ? (
                                            <motion.img
                                              src={coverUrl}
                                              alt={story.title}
                                              className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                                            />
                                          ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                              <BookOpen className="size-8 opacity-10" />
                                            </div>
                                          )}

                                          {/* 左上角：编号标签 */}
                                          <div className="absolute top-4 left-4 z-10 text-white/90 drop-shadow-md">
                                            <span className="text-[10px] font-mono font-bold tracking-tighter">
                                              NO.{String(currentIndex + 1).padStart(2, '0')}
                                            </span>
                                          </div>



                                          {/* 照片数量标签 */}
                                          <div className="absolute bottom-4 left-4 flex items-center gap-2 text-white/90 text-[10px] font-mono tracking-widest">
                                            <div className="h-px w-3 bg-white/50" />
                                            {story.photos.length} SHOTS
                                          </div>
                                        </div>

                                        {/* 内容信息 - 极简高端时尚风格 */}
                                        <div className="flex flex-col flex-1 min-h-0 relative px-1">


                                          <div className="flex items-start justify-between gap-4 mb-3">
                                            <h3 className="text-2xl font-serif font-light tracking-tight leading-none group-hover:text-primary transition-colors duration-300 text-balance">
                                              {story.title}
                                            </h3>
                                            <div className="flex items-center gap-2 text-muted-foreground/40 mt-2.5 flex-shrink-0 text-[10px] font-mono tracking-widest uppercase">
                                              <span>
                                                {new Date(getDateField(story)).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                                              </span>
                                              <span className="opacity-70">
                                                {new Date(getDateField(story)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                              </span>
                                            </div>
                                          </div>

                                          {!isWide && (
                                            <p className="text-xs text-muted-foreground/70 leading-relaxed font-serif italic mb-4 line-clamp-2 md:w-5/6">
                                              {story.content.replace(/[#*`\[\]]/g, '')}
                                            </p>
                                          )}


                                        </div>
                                      </div>
                                    </Link>
                                  </motion.div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          )}

          {/* 底部导航 - 返回画廊 */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mt-32 pt-16 border-t border-border/50 text-center"
          >
            <Link
              href="/gallery"
              className="group inline-flex flex-col items-center gap-4"
            >
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground group-hover:text-primary transition-colors">
                Explore More
              </span>
              <span className="text-3xl md:text-5xl font-serif font-light italic tracking-tight hover:text-primary transition-colors">
                {t('story.back_to_gallery') || 'Back to Gallery'}
              </span>
            </Link>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
