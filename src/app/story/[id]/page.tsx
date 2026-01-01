'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { motion, useScroll, useTransform } from 'framer-motion'
import { ArrowLeft, Calendar, ImageIcon, ChevronLeft, ChevronRight, X, MousePointer2, Clock } from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { getStory, type StoryDto, type PhotoDto, resolveAssetUrl } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { StoryComments } from '@/components/StoryComments'

// Dynamically import MilkdownViewer to avoid SSR issues
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

export default function StoryDetailPage() {
  const params = useParams()
  const { t } = useLanguage()
  const { settings } = useSettings()
  const [story, setStory] = useState<StoryDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null)
  
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll()
  const opacity = useTransform(scrollY, [0, 400], [1, 0])
  const scale = useTransform(scrollY, [0, 400], [1, 1.1])
  const y = useTransform(scrollY, [0, 400], [0, 100])

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

  const getPhotoUrl = (photo: PhotoDto, thumbnail = false): string => {
    const url = thumbnail ? (photo.thumbnailUrl || photo.url) : photo.url
    return resolveAssetUrl(url, settings?.cdn_domain)
  }

  const getCoverPhoto = () => {
    if (!story) return null
    if (story.coverPhotoId) {
      return story.photos.find(p => p.id === story.coverPhotoId) || story.photos[0]
    }
    return story.photos[0]
  }

  const handlePrevPhoto = () => {
    if (selectedPhotoIndex === null || !story) return
    setSelectedPhotoIndex(selectedPhotoIndex > 0 ? selectedPhotoIndex - 1 : story.photos.length - 1)
  }

  const handleNextPhoto = () => {
    if (selectedPhotoIndex === null || !story) return
    setSelectedPhotoIndex(selectedPhotoIndex < story.photos.length - 1 ? selectedPhotoIndex + 1 : 0)
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedPhotoIndex === null) return
      if (e.key === 'ArrowLeft') handlePrevPhoto()
      if (e.key === 'ArrowRight') handleNextPhoto()
      if (e.key === 'Escape') setSelectedPhotoIndex(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedPhotoIndex, story])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-px bg-primary animate-[grow_2s_infinite]" />
          <span className="text-[10px] font-mono uppercase tracking-[0.5em] text-primary">Loading Narrative</span>
        </div>
      </div>
    )
  }

  if (error || !story) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6">
          <p className="text-muted-foreground font-serif italic">{error || 'Story not found'}</p>
          <Link href="/story" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest hover:text-primary transition-colors">
            <ArrowLeft className="w-3 h-3" />
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
    <div className="min-h-screen bg-background text-foreground">
      {/* Immersive Hero Section */}
      <section ref={heroRef} className="relative h-screen w-full overflow-hidden bg-black">
        <motion.div style={{ scale, opacity }} className="absolute inset-0">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={story.title}
              className="w-full h-full object-cover opacity-60"
            />
          ) : (
            <div className="w-full h-full bg-muted/10" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-background" />
        </motion.div>

        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-3 mb-8"
          >
            <div className="h-px w-8 bg-primary/50" />
            <span className="text-[10px] font-bold uppercase tracking-[0.5em] text-primary/80">Narrative</span>
            <div className="h-px w-8 bg-primary/50" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="text-5xl md:text-7xl lg:text-9xl font-serif font-light tracking-tighter text-white leading-[0.9] max-w-5xl"
          >
            {story.title}
          </motion.h1>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-12 flex items-center gap-8 text-[10px] font-mono uppercase tracking-[0.3em] text-white/60"
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              {new Date(story.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3" />
              {Math.ceil(story.content.length / 500)} min read
            </div>
          </motion.div>
        </div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 1 }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4"
        >
          <span className="text-[9px] font-bold uppercase tracking-[0.4em] text-white/40">Scroll</span>
          <div className="w-px h-12 bg-gradient-to-b from-primary/50 to-transparent" />
        </motion.div>

        {/* Floating Back Button */}
        <div className="absolute top-32 left-6 md:left-12 z-10">
          <Link
            href="/story"
            className="group flex items-center gap-4 text-white/50 hover:text-white transition-colors"
          >
            <div className="w-8 h-8 flex items-center justify-center border border-white/10 rounded-full group-hover:border-white/30 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest hidden md:block">Back</span>
          </Link>
        </div>
      </section>

      {/* Content Section */}
      <div className="px-6 md:px-12 lg:px-24 py-24 md:py-40">
        <div className="max-w-screen-md mx-auto">
          {/* Intro Text / Meta */}
          <div className="mb-20 space-y-6">
            <div className="flex items-center gap-4 text-primary/40">
              <span className="text-xs font-mono">01</span>
              <div className="h-px flex-1 bg-border/50" />
            </div>
            <p className="text-xl md:text-2xl font-serif italic text-muted-foreground leading-relaxed">
              This narrative features {story.photos.length} visual records captured during this journey.
            </p>
          </div>

          {/* Main Article */}
          <motion.article
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="milkdown-article"
          >
            <MilkdownViewer content={story.content} />
          </motion.article>

          {/* Large Featured Photo */}
          {story.photos.length > 1 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="my-32 -mx-6 md:-mx-24 lg:-mx-48 aspect-[21/9] overflow-hidden bg-muted"
            >
              <img
                src={getPhotoUrl(story.photos[1])}
                alt="Featured visual"
                className="w-full h-full object-cover"
              />
            </motion.div>
          )}

          {/* Final Gallery */}
          <section className="mt-40">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
              <div className="space-y-4">
                <span className="text-[10px] font-mono text-primary uppercase tracking-[0.4em]">Visual Archive</span>
                <h2 className="text-4xl md:text-5xl font-serif font-light tracking-tight">Gallery</h2>
              </div>
              <p className="text-sm text-muted-foreground font-serif italic max-w-xs">
                A complete collection of moments documented in this narrative.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-8">
              {story.photos.map((photo, index) => (
                <motion.div
                  key={photo.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className={`relative group cursor-none overflow-hidden bg-muted
                    ${index % 5 === 0 ? 'md:col-span-2 aspect-[16/10]' : 'aspect-square'}
                  `}
                  onClick={() => setSelectedPhotoIndex(index)}
                >
                  <img
                    src={getPhotoUrl(photo, true)}
                    alt={photo.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <MousePointer2 className="w-6 h-6 text-white" />
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Comments Section */}
          {targetPhotoId && <StoryComments storyId={story.id} targetPhotoId={targetPhotoId} />}

          {/* Footer Nav */}
          <div className="mt-40 pt-24 border-t border-border/50 text-center">
            <Link
              href="/story"
              className="group inline-flex flex-col items-center gap-6"
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.5em] text-muted-foreground group-hover:text-primary transition-colors">
                Next Chapter
              </span>
              <span className="text-4xl md:text-6xl font-serif font-light italic tracking-tight hover:text-primary transition-colors">
                Back to Journal
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* Sophisticated Lightbox */}
      {selectedPhotoIndex !== null && story.photos[selectedPhotoIndex] && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/98 flex items-center justify-center"
          onClick={() => setSelectedPhotoIndex(null)}
        >
          <button
            onClick={() => setSelectedPhotoIndex(null)}
            className="absolute top-12 right-12 p-2 text-white/30 hover:text-white transition-colors z-10"
          >
            <X className="w-8 h-8" />
          </button>

          {story.photos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handlePrevPhoto() }}
                className="absolute left-8 top-1/2 -translate-y-1/2 p-4 text-white/20 hover:text-white transition-colors z-10"
              >
                <ChevronLeft className="w-12 h-12" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleNextPhoto() }}
                className="absolute right-8 top-1/2 -translate-y-1/2 p-4 text-white/20 hover:text-white transition-colors z-10"
              >
                <ChevronRight className="w-12 h-12" />
              </button>
            </>
          )}

          <div className="w-full h-full flex items-center justify-center p-6 md:p-24" onClick={(e) => e.stopPropagation()}>
            <motion.img
              key={selectedPhotoIndex}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              src={getPhotoUrl(story.photos[selectedPhotoIndex])}
              alt={story.photos[selectedPhotoIndex].title}
              className="max-w-full max-h-full object-contain"
            />
          </div>

          <div className="absolute bottom-12 left-12 flex flex-col gap-2">
            <div className="text-white font-serif text-2xl tracking-tight">
              {story.photos[selectedPhotoIndex].title || 'Untitled Record'}
            </div>
            <div className="text-white/40 font-mono text-[10px] uppercase tracking-widest">
              {selectedPhotoIndex + 1} of {story.photos.length}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}