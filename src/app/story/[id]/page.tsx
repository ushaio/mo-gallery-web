'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { motion, useScroll, useTransform } from 'framer-motion'
import { ArrowLeft, Calendar, Clock } from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { getStory, type StoryDto, type PhotoDto, resolveAssetUrl } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { StoryComments } from '@/components/StoryComments'
import { PhotoDetailModal } from '@/components/PhotoDetailModal'

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
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoDto | null>(null)
  const [activePhotoIndex, setActivePhotoIndex] = useState(0)
  
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll()
  const opacity = useTransform(scrollY, [0, 400], [1, 0])
  const scale = useTransform(scrollY, [0, 400], [1, 1.1])

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
      {/* Compact Hero Section */}
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
              {new Date(story.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="size-3" />
              {Math.ceil(story.content.length / 500)} min read
            </div>
          </div>
        </div>

        {/* Back Button */}
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

      {/* Split Layout: Article Left, Photos Right (desktop) / Article then Photos (mobile) */}
      <div className="flex flex-col lg:flex-row">
        {/* Left: Article Content */}
        <div className="w-full lg:w-1/2 xl:w-[45%] lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto">
          <div className="px-6 md:px-12 lg:px-16 py-12 lg:py-16">
            {/* Meta Info */}
            <div className="mb-8 pb-6 border-b border-border/30">
              <div className="flex items-center gap-3 text-primary/60 mb-3">
                <span className="text-xs font-mono">01</span>
                <div className="h-px flex-1 bg-border/40" />
              </div>
              <p className="text-lg md:text-xl font-serif italic text-muted-foreground leading-relaxed">
                {story.photos.length} visual records from this journey.
              </p>
            </div>

            {/* Article */}
            <article className="milkdown-article prose prose-lg dark:prose-invert max-w-none">
              <MilkdownViewer content={story.content} />
            </article>

            {/* Mobile Photo Gallery - after article content */}
            <div className="lg:hidden mt-12 pt-8 border-t border-border/30">
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <span className="text-[10px] font-mono text-primary uppercase tracking-widest">Visual Archive</span>
                  <h2 className="text-xl font-serif font-light tracking-tight mt-1 text-balance">Gallery</h2>
                </div>
                <span className="text-xs text-muted-foreground font-mono">{story.photos.length} photos</span>
              </div>

              {story.photos.length > 0 && (
                <div
                  className="relative h-[40vh] mb-3 overflow-hidden bg-black flex items-center justify-center cursor-pointer"
                  onClick={() => setSelectedPhoto(story.photos[activePhotoIndex])}
                >
                  <img
                    src={getPhotoUrl(story.photos[activePhotoIndex])}
                    alt={story.photos[activePhotoIndex].title}
                    className="max-w-full max-h-full object-contain"
                  />
                  <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                    <span className="text-white text-xs font-medium drop-shadow-lg">
                      {story.photos[activePhotoIndex].title}
                    </span>
                    <span className="text-white/70 text-[10px] font-mono">
                      {activePhotoIndex + 1} / {story.photos.length}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {story.photos.map((photo, index) => (
                  <div
                    key={photo.id}
                    className={`flex-shrink-0 w-16 h-16 overflow-hidden bg-muted cursor-pointer ${
                      index === activePhotoIndex ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => setActivePhotoIndex(index)}
                    onDoubleClick={() => setSelectedPhoto(photo)}
                  >
                    <img
                      src={getPhotoUrl(photo, true)}
                      alt={photo.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Comments */}
            {targetPhotoId && (
              <div className="mt-12 pt-8 border-t border-border/30">
                <StoryComments storyId={story.id} targetPhotoId={targetPhotoId} />
              </div>
            )}

            {/* Footer Nav */}
            <div className="mt-12 pt-8 border-t border-border/30">
              <Link
                href="/story"
                className="group inline-flex items-center gap-4 text-muted-foreground hover:text-primary transition-colors"
              >
                <ArrowLeft className="size-4" />
                <span className="text-sm font-bold uppercase tracking-widest">Back to Journal</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Right: Photo Gallery (desktop only) */}
        <div className="hidden lg:block w-full lg:w-1/2 xl:w-[55%] bg-muted/20 lg:border-l border-border/20">
          <div className="p-4 md:p-6 lg:p-8">
            {/* Gallery Header */}
            <div className="mb-6 flex items-end justify-between">
              <div>
                <span className="text-[10px] font-mono text-primary uppercase tracking-widest">Visual Archive</span>
                <h2 className="text-2xl md:text-3xl font-serif font-light tracking-tight mt-1 text-balance">Gallery</h2>
              </div>
              <span className="text-xs text-muted-foreground font-mono">{story.photos.length} photos</span>
            </div>

            {/* Featured Photo */}
            {story.photos.length > 0 && (
              <div
                className="relative h-[50vh] lg:h-[60vh] mb-4 overflow-hidden bg-black flex items-center justify-center cursor-pointer group"
                onClick={() => setSelectedPhoto(story.photos[activePhotoIndex])}
              >
                <img
                  src={getPhotoUrl(story.photos[activePhotoIndex])}
                  alt={story.photos[activePhotoIndex].title}
                  className="max-w-full max-h-full object-contain transition-transform duration-700 group-hover:scale-[1.02]"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-white text-sm font-medium drop-shadow-lg">
                    {story.photos[activePhotoIndex].title}
                  </span>
                  <span className="text-white/70 text-xs font-mono">
                    {activePhotoIndex + 1} / {story.photos.length}
                  </span>
                </div>
              </div>
            )}

            {/* Thumbnail Grid */}
            <div className="grid grid-cols-4 xl:grid-cols-5 gap-2">
              {story.photos.map((photo, index) => (
                <div
                  key={photo.id}
                  className={`relative aspect-square overflow-hidden bg-muted cursor-pointer group transition-all duration-200 ${
                    index === activePhotoIndex
                      ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                      : 'hover:ring-1 hover:ring-border'
                  }`}
                  onClick={() => setActivePhotoIndex(index)}
                  onDoubleClick={() => setSelectedPhoto(photo)}
                >
                  <img
                    src={getPhotoUrl(photo, true)}
                    alt={photo.title}
                    className={`w-full h-full object-cover transition-all duration-200 ${
                      index === activePhotoIndex ? 'scale-100' : 'grayscale-[30%] group-hover:grayscale-0'
                    }`}
                  />
                </div>
              ))}
            </div>

            <p className="mt-4 text-[10px] text-muted-foreground text-center font-mono uppercase tracking-wider">
              Click to preview · Double-click to view full
            </p>
          </div>
        </div>
      </div>

      {/* Photo Detail Modal */}
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