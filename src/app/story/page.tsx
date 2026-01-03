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

export default function StoryListPage() {
  const { t } = useLanguage()
  const { settings } = useSettings()
  const [stories, setStories] = useState<StoryDto[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  async function loadStories() {
    try {
      const storiesData = await getStories()
      setStories(storiesData)
    } catch (error) {
      console.error('Failed to fetch story data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStories()
  }, [])

  // Group stories by year and month
  const timelineData = useMemo(() => {
    const grouped: Record<string, Record<string, StoryDto[]>> = {}
    stories.forEach(story => {
      const date = new Date(story.createdAt)
      const year = date.getFullYear().toString()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      if (!grouped[year]) grouped[year] = {}
      if (!grouped[year][month]) grouped[year][month] = []
      grouped[year][month].push(story)
    })
    return grouped
  }, [stories])

  const years = useMemo(() => {
    return Object.keys(timelineData).sort((a, b) => parseInt(b) - parseInt(a))
  }, [timelineData])

  const getMonthName = (month: string) => {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December']
    return monthNames[parseInt(month) - 1]
  }

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background pt-24 pb-16">
        <div className="px-6 md:px-12 lg:px-24">
          <div className="max-w-screen-xl mx-auto">
            <div className="animate-pulse space-y-12">
              <div className="h-16 bg-muted rounded-none w-1/3"></div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="space-y-6">
                    <div className="aspect-[16/9] bg-muted rounded-none"></div>
                    <div className="space-y-3">
                      <div className="h-6 bg-muted rounded-none w-3/4"></div>
                      <div className="h-4 bg-muted rounded-none w-full"></div>
                      <div className="h-4 bg-muted rounded-none w-2/3"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground pt-28 pb-20">
      {/* Header Section */}
      <div className="px-6 md:px-12 lg:px-24 mb-16 md:mb-24">
        <div className="max-w-screen-xl mx-auto">
          <header className="relative">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-4 mb-4"
            >
              <div className="h-px w-8 bg-primary" />
              <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-primary">
                Journal
              </span>
            </motion.div>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-5xl md:text-7xl font-serif font-light tracking-tighter leading-[0.9]"
              >
                {t('nav.story')}
              </motion.h1>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="max-w-xs"
              >
                <p className="text-xs text-muted-foreground leading-relaxed font-serif italic">
                  A collection of visual narratives, personal journeys, and documented moments in time.
                </p>
                <div className="mt-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">
                  {stories.length} {t('story.count_suffix') || 'STORIES'}
                </div>
              </motion.div>
            </div>
          </header>
        </div>
      </div>

      {/* Stories Content */}
      <div className="px-6 md:px-12 lg:px-24">
        <div className="max-w-screen-xl mx-auto">

          <QuickStoryEditor onSuccess={loadStories} />

          {stories.length === 0 ? (
            <div className="py-24 text-center border-t border-border/50">
              <BookOpen className="w-10 h-10 mx-auto mb-4 opacity-20" />
              <p className="text-muted-foreground font-serif italic text-sm">{t('story.empty') || 'No stories found yet.'}</p>
            </div>
          ) : (
            <div className="space-y-16">
              {years.map((year) => {
                const months = Object.keys(timelineData[year]).sort((a, b) => parseInt(b) - parseInt(a))

                return (
                  <section key={year} className="relative">
                    {/* Year Header - Sticky at top */}
                    <motion.div
                      className="sticky top-20 z-20 py-3 bg-background/95 backdrop-blur-sm transition-all duration-300"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.4 }}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-4xl md:text-5xl font-mono font-black tracking-tighter text-foreground/10">
                          {year}
                        </span>
                        <div className="h-px flex-1 bg-border/30" />
                      </div>
                    </motion.div>

                    {/* Months within Year */}
                    <div className="space-y-12 mt-6">
                      {months.map((month) => {
                        const storiesInMonth = timelineData[year][month]
                        let storyIndex = 0

                        return (
                          <div key={`${year}-${month}`} className="relative">
                            {/* Month Header - Sticky below year */}
                            <motion.div
                              className="sticky top-36 z-10 py-2 bg-background/90 backdrop-blur-sm transition-all duration-300"
                              initial={{ opacity: 0, x: -10 }}
                              whileInView={{ opacity: 1, x: 0 }}
                              viewport={{ once: true }}
                              transition={{ duration: 0.3, ease: "easeOut" }}
                            >
                              <div className="flex items-center gap-3 pl-4 md:pl-8">
                                <Calendar className="w-3.5 h-3.5 text-primary/60" />
                                <span className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
                                  {getMonthName(month)}
                                </span>
                                <span className="text-[10px] font-mono text-muted-foreground/40">
                                  ({storiesInMonth.length})
                                </span>
                                <div className="h-px flex-1 bg-border/20" />
                              </div>
                            </motion.div>

                            {/* Story Grid - Irregular/Asymmetrical */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10 mt-8 pl-4 md:pl-8">
                              {storiesInMonth.map((story, i) => {
                                const coverUrl = getCoverUrl(story)
                                const currentIndex = storyIndex++
                                // Create irregularity
                                const isWide = i % 7 === 0 || i % 7 === 6
                                const isTall = i % 5 === 2
                                const offset = i % 2 === 1 && !isWide ? 'lg:mt-6' : ''

                                return (
                                  <motion.div
                                    key={story.id}
                                    initial={{ opacity: 0, y: 30 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, margin: "-50px" }}
                                    transition={{ duration: 0.6, ease: [0.21, 0.45, 0.32, 0.9] }}
                                    className={`group relative flex flex-col gap-5 ${isWide ? 'md:col-span-2' : ''} ${offset}`}
                                    onMouseEnter={() => setHoveredId(story.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                  >
                                    <Link href={`/story/${story.id}`} className="block h-full">
                                      <div className="flex flex-col h-full">
                                        {/* Image Container */}
                                        <div className={`relative overflow-hidden bg-muted mb-5 group-hover:shadow-2xl transition-all duration-700 ease-out ${isTall && !isWide ? 'aspect-[3/4]' : isWide ? 'aspect-[21/9]' : 'aspect-[3/2]'}`}>
                                          {coverUrl ? (
                                            <motion.img
                                              src={coverUrl}
                                              alt={story.title}
                                              className="w-full h-full object-cover transition-transform duration-1000 ease-out group-hover:scale-105"
                                            />
                                          ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                              <BookOpen className="w-8 h-8 opacity-10" />
                                            </div>
                                          )}

                                          {/* Artistic Overlay */}
                                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                                          {/* Top Left: No. Tag */}
                                          <div className="absolute top-4 left-4 z-10 text-white/90 drop-shadow-md">
                                            <span className="text-[10px] font-mono font-bold tracking-tighter">
                                              NO.{String(currentIndex + 1).padStart(2, '0')}
                                            </span>
                                          </div>



                                          {/* Photo Count Tag */}
                                          <div className="absolute bottom-4 left-4 flex items-center gap-2 text-white/90 text-[10px] font-mono tracking-widest">
                                            <div className="h-px w-3 bg-white/50" />
                                            {story.photos.length} SHOTS
                                          </div>
                                        </div>

                                        {/* Content Info - Minimalist High Fashion Style */}
                                        <div className="flex flex-col flex-1 min-h-0 relative px-1">


                                          <div className="flex items-start justify-between gap-4 mb-3">
                                            <h3 className="text-2xl font-serif font-light tracking-tight leading-none group-hover:text-primary transition-colors duration-300">
                                              {story.title}
                                            </h3>
                                            <div className="flex items-center gap-2 text-muted-foreground/40 mt-2.5 flex-shrink-0 text-[10px] font-mono tracking-widest uppercase">
                                              <span>
                                                {new Date(story.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                                              </span>
                                              <span className="opacity-70">
                                                {new Date(story.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

          {/* Footer Navigation */}
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
              <span className="text-[9px] font-bold uppercase tracking-[0.4em] text-muted-foreground group-hover:text-primary transition-colors">
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
