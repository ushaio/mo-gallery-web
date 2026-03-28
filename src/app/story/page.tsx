'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, Calendar } from 'lucide-react'
import Link from 'next/link'
import { resolveAssetUrl } from '@/lib/api/core'
import { getStories } from '@/lib/api/stories'
import type { StoryDto } from '@/lib/api/types'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { QuickStoryEditor } from '@/components/story/QuickStoryEditor'
import { buildStoryPreviewText } from '@/lib/story-rich-content'
import { getStoryCoverImageStyle } from '@/lib/story-cover'

const STORY_GRID_CLASSNAME = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10 pl-4 md:pl-8'
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const STORY_SKELETON_ITEMS = Array.from({ length: 6 }, (_, index) => index)

type StoryCardViewModel = StoryDto & {
  coverUrl: string | null
  previewText: string
  dateLabel: string
  timeLabel: string
  serialNumber: string
  isWide: boolean
  aspectClassName: string
  offsetClassName: string
}

type StoryMonthGroup = {
  key: string
  label: string
  stories: StoryCardViewModel[]
}

type StoryYearGroup = {
  year: string
  months: StoryMonthGroup[]
}

function getStoryLayout(index: number) {
  const isWide = index % 7 === 0 || index % 7 === 6
  const isTall = index % 5 === 2

  return {
    isWide,
    aspectClassName: isTall && !isWide ? 'aspect-[3/4]' : isWide ? 'aspect-[21/9]' : 'aspect-[3/2]',
    offsetClassName: index % 2 === 1 && !isWide ? 'lg:mt-6' : '',
  }
}

function getStoryCoverUrl(story: StoryDto, cdnDomain?: string): string | null {
  if (story.coverPhotoId && story.photos.length > 0) {
    const coverPhoto = story.photos.find((photo) => photo.id === story.coverPhotoId)
    if (coverPhoto) {
      return resolveAssetUrl(coverPhoto.thumbnailUrl || coverPhoto.url, cdnDomain)
    }
  }

  const firstPhoto = story.photos[0]
  return firstPhoto ? resolveAssetUrl(firstPhoto.thumbnailUrl || firstPhoto.url, cdnDomain) : null
}

function StorySkeleton() {
  return (
    <div className={STORY_GRID_CLASSNAME}>
      {STORY_SKELETON_ITEMS.map((index) => {
        const layout = getStoryLayout(index)
        return (
          <div key={index} className={`animate-pulse space-y-5 ${layout.isWide ? 'md:col-span-2' : ''}`}>
            <div className={`bg-muted ${layout.aspectClassName}`} />
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
}

export default function StoryListPage() {
  const { t } = useLanguage()
  const { settings } = useSettings()
  const [stories, setStories] = useState<StoryDto[]>([])
  const [loading, setLoading] = useState(true)

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
    void loadStories()
  }, [])

  const storyTimeline = useMemo<StoryYearGroup[]>(() => {
    const grouped = new Map<string, Map<string, StoryDto[]>>()

    for (const story of stories) {
      const createdAt = new Date(story.createdAt)
      const year = createdAt.getFullYear().toString()
      const month = String(createdAt.getMonth() + 1).padStart(2, '0')

      if (!grouped.has(year)) {
        grouped.set(year, new Map())
      }

      const monthGroup = grouped.get(year)!
      if (!monthGroup.has(month)) {
        monthGroup.set(month, [])
      }

      monthGroup.get(month)!.push(story)
    }

    return Array.from(grouped.entries())
      .sort(([leftYear], [rightYear]) => Number(rightYear) - Number(leftYear))
      .map(([year, monthMap]) => ({
        year,
        months: Array.from(monthMap.entries())
          .sort(([leftMonth], [rightMonth]) => Number(rightMonth) - Number(leftMonth))
          .map(([month, monthStories]) => ({
            key: `${year}-${month}`,
            label: MONTH_NAMES[Number(month) - 1],
            stories: monthStories.map((story, index) => {
              const createdAt = new Date(story.createdAt)
              const layout = getStoryLayout(index)

              return {
                ...story,
                coverUrl: getStoryCoverUrl(story, settings?.cdn_domain),
                previewText: buildStoryPreviewText(story.content),
                dateLabel: createdAt.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }),
                timeLabel: createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                serialNumber: String(index + 1).padStart(2, '0'),
                ...layout,
              }
            }),
          })),
      }))
  }, [settings?.cdn_domain, stories])

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-16">
      <div className="px-4 md:px-8 lg:px-12">
        <div className="max-w-screen-2xl mx-auto">
          <header className="relative mb-12 md:mb-16">
            <div className="flex flex-col gap-8">
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

              <div className="border-t border-border/30" />
            </div>
          </header>
        </div>
      </div>

      <div className="px-4 md:px-8 lg:px-12">
        <div className="max-w-screen-2xl mx-auto">
          <QuickStoryEditor onSuccess={loadStories} />

          {loading ? (
            <StorySkeleton />
          ) : stories.length === 0 ? (
            <div className="py-24 text-center border-t border-border/50">
              <BookOpen className="size-10 mx-auto mb-4 opacity-20" />
              <p className="text-muted-foreground font-serif italic text-sm">{t('story.empty') || 'No stories found yet.'}</p>
            </div>
          ) : (
            <div className="space-y-16">
              {storyTimeline.map(({ year, months }) => (
                <section key={year} className="relative">
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

                  <div className="space-y-12 mt-6">
                    {months.map(({ key, label, stories: monthStories }) => (
                      <div key={key} className="relative">
                        <motion.div
                          className="sticky top-36 z-10 py-2 bg-background/90 backdrop-blur-sm transition-all duration-200"
                          initial={{ opacity: 0, x: -10 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                        >
                          <div className="flex items-center gap-3 pl-4 md:pl-8">
                            <Calendar className="size-3.5 text-primary/60" />
                            <span className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
                              {label}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground/40">
                              ({monthStories.length})
                            </span>
                            <div className="h-px flex-1 bg-border/20" />
                          </div>
                        </motion.div>

                        <div className={`${STORY_GRID_CLASSNAME} mt-8`}>
                          {monthStories.map((story) => (
                            <motion.div
                              key={story.id}
                              initial={{ opacity: 0, y: 30 }}
                              whileInView={{ opacity: 1, y: 0 }}
                              viewport={{ once: true, margin: '-50px' }}
                              transition={{ duration: 0.2, ease: 'easeOut' }}
                              className={`group relative flex flex-col gap-5 ${story.isWide ? 'md:col-span-2' : ''} ${story.offsetClassName}`}
                            >
                              <Link href={`/story/${story.id}`} className="block h-full">
                                <div className="flex flex-col h-full">
                                  <div className={`relative overflow-hidden bg-muted mb-5 group-hover:shadow-2xl transition-shadow duration-200 ease-out ${story.aspectClassName}`}>
                                    {story.coverUrl ? (
                                      <motion.img
                                        src={story.coverUrl}
                                        alt={story.title}
                                        className="w-full h-full object-cover"
                                        style={getStoryCoverImageStyle(story)}
                                        whileHover={{ scale: 1.05 }}
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <BookOpen className="size-8 opacity-10" />
                                      </div>
                                    )}

                                    <div className="absolute top-4 left-4 z-10 text-white/90 drop-shadow-md">
                                      <span className="text-[10px] font-mono font-bold tracking-tighter">
                                        NO.{story.serialNumber}
                                      </span>
                                    </div>

                                    <div className="absolute bottom-4 left-4 flex items-center gap-2 text-white/90 text-[10px] font-mono tracking-widest">
                                      <div className="h-px w-3 bg-white/50" />
                                      {story.photos.length} SHOTS
                                    </div>
                                  </div>

                                  <div className="flex flex-col flex-1 min-h-0 relative px-1">
                                    <div className="flex items-start justify-between gap-4 mb-3">
                                      <h3 className="text-2xl font-serif font-light tracking-tight leading-none group-hover:text-primary transition-colors duration-300 text-balance">
                                        {story.title}
                                      </h3>
                                      <div className="flex items-center gap-2 text-muted-foreground/40 mt-2.5 flex-shrink-0 text-[10px] font-mono tracking-widest uppercase">
                                        <span>{story.dateLabel}</span>
                                        <span className="opacity-70">{story.timeLabel}</span>
                                      </div>
                                    </div>

                                    {!story.isWide ? (
                                      <p className="text-xs text-muted-foreground/70 leading-relaxed font-serif italic mb-4 line-clamp-2 md:w-5/6">
                                        {story.previewText}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              </Link>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

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
