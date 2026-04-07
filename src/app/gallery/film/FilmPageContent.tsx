'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Circle, CircleOff } from 'lucide-react'
import { resolveAssetUrl } from '@/lib/api/core'
import { getPhotosWithMeta } from '@/lib/api/photos'
import { useSettings } from '@/contexts/SettingsContext'
import { useResponsiveColumnCount } from '@/components/gallery/useResponsiveColumnCount'
import type { PhotoDto, PhotoPaginationMeta } from '@/lib/api/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILM_STRIP_RULES = [
  { minWidth: 1024, columns: 5 },
  { minWidth: 640, columns: 4 },
  { minWidth: 0, columns: 3 },
]

const FILM_BRANDS = [
  { name: 'KODAK PORTRA', code: '400', iso: '400/27°', exp: '36' },
  { name: 'FUJIFILM PRO', code: '160NS', iso: '160/23°', exp: '36' },
  { name: 'ILFORD HP5', code: 'PLUS', iso: '400/27°', exp: '36' },
  { name: 'CINESTILL', code: '800T', iso: '800/30°', exp: '36' },
  { name: 'KODAK GOLD', code: '200', iso: '200/24°', exp: '24' },
]

const LEADER_MARKS = ['△', '▽', '◁', '▷', '○', '□']

// ---------------------------------------------------------------------------
// Film frame
// ---------------------------------------------------------------------------

function FilmFrame({
  photo,
  frameIndex,
  grayscale,
  onClick,
}: {
  photo: PhotoDto
  frameIndex: number
  grayscale: boolean
  onClick: () => void
}) {
  const { settings } = useSettings()
  const coverUrl = useMemo(
    () => resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain),
    [photo.thumbnailUrl, photo.url, settings?.cdn_domain],
  )
  const aspectRatio = photo.width && photo.height
    ? Math.max(0.6, Math.min(1.8, photo.width / photo.height))
    : 1.5

  return (
    <div
      className="group relative shrink-0 cursor-pointer overflow-hidden rounded-[2px] border border-[#2a2a2a] transition-all duration-300 hover:border-[#c8a850]/40 hover:shadow-[0_0_18px_rgba(200,168,80,0.22),0_0_4px_rgba(200,168,80,0.12)]"
      style={{ aspectRatio }}
      onClick={onClick}
    >
      <Image
        src={coverUrl}
        alt={photo.title}
        fill
        sizes="(max-width: 640px) 30vw, (max-width: 1024px) 22vw, 18vw"
        className={`object-cover transition-all duration-500 group-hover:scale-[1.04] group-hover:brightness-[1.08] ${
          grayscale
            ? 'grayscale group-hover:grayscale-0'
            : 'sepia-[0.25] saturate-[0.8] group-hover:sepia-0 group-hover:saturate-100'
        }`}
      />
      <div className="film-grain-overlay pointer-events-none absolute inset-0 opacity-[0.18]" />
      <div className="film-scanlines pointer-events-none absolute inset-0" />
      <div className="film-vignette absolute inset-0 opacity-100 group-hover:opacity-30" />
      <div className="pointer-events-none absolute left-1 top-0.5 select-none font-mono text-[7px] text-[#c8a850]/60 sm:left-1.5 sm:top-1 sm:text-[8px]">
        {String(frameIndex + 1).padStart(2, '0')}A
      </div>
      <div className="pointer-events-none absolute right-1 top-0.5 select-none font-mono text-[8px] text-[#c8a850]/40 sm:right-1.5 sm:top-1">
        ▷
      </div>
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-1.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:p-2">
        <p className="truncate font-mono text-[9px] text-white/95 sm:text-[10px]">{photo.title}</p>
        {photo.category ? (
          <p className="truncate font-mono text-[7px] uppercase tracking-wider text-[#c8a850]/90 sm:text-[8px]">
            {photo.category.split(',')[0]}
          </p>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sprocket rail
// ---------------------------------------------------------------------------

function SprocketRail({ holeCount }: { holeCount: number }) {
  return (
    <div className="flex h-5 items-center justify-between bg-[#0c0c0c] px-1.5 sm:h-6 sm:px-2">
      {Array.from({ length: holeCount }, (_, i) => (
        <span
          key={i}
          className="inline-block h-2.5 w-3.5 rounded-[1.5px] border border-[#3a3a3a] bg-[#1e1e1e] shadow-[0_0_3px_rgba(200,168,80,0.15)] sm:h-3 sm:w-4"
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Film strip
// ---------------------------------------------------------------------------

function FilmStrip({
  photos,
  brand,
  startIndex,
  grayscale,
  onPhotoClick,
  frameHeight,
  stripIndex,
}: {
  photos: PhotoDto[]
  brand: (typeof FILM_BRANDS)[number]
  startIndex: number
  grayscale: boolean
  onPhotoClick: (photo: PhotoDto) => void
  frameHeight: string
  stripIndex: number
}) {
  const holeCount = photos.length * 2 + 3

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1], delay: stripIndex * 0.07 }}
      className="flex shrink-0 flex-col bg-[#0a0a0a] ring-1 ring-[#1e1e1e] transition-all duration-300 hover:ring-[#c8a850]/15 hover:shadow-[0_8px_40px_rgba(0,0,0,0.8)]"
    >
      <SprocketRail holeCount={holeCount} />
      <div className="flex">
        {/* Brand sidebar */}
        <div className="flex w-5 shrink-0 items-center justify-center bg-[#080808] sm:w-7">
          <span
            className="whitespace-nowrap font-mono text-[7px] font-black uppercase tracking-[0.25em] text-[#c8a850]/70 sm:text-[8px]"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}
          >
            {brand.name} {brand.code} — {brand.exp}EXP — DX {brand.iso}
          </span>
        </div>
        <div className="flex gap-[3px] p-[3px]" style={{ height: frameHeight }}>
          {photos.map((photo, i) => (
            <FilmFrame
              key={photo.id}
              photo={photo}
              frameIndex={startIndex + i}
              grayscale={grayscale}
              onClick={() => onPhotoClick(photo)}
            />
          ))}
        </div>
      </div>
      <SprocketRail holeCount={holeCount} />
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------------------

function Lightbox({
  photo,
  onClose,
}: {
  photo: PhotoDto
  onClose: () => void
}) {
  const { settings } = useSettings()
  const url = useMemo(
    () => resolveAssetUrl(photo.url, settings?.cdn_domain),
    [photo.url, settings?.cdn_domain],
  )

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 md:p-12"
      onClick={onClose}
    >
      {/* Film grain on lightbox */}
      <div className="film-grain-overlay pointer-events-none absolute inset-0 opacity-[0.08]" />

      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative max-h-full max-w-5xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top tape strip */}
        <div className="flex h-4 items-center justify-between bg-[#0c0c0c] px-2">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className="inline-block h-2 w-2.5 rounded-[1px] border border-[#333] bg-[#1a1a1a]" />
          ))}
        </div>

        <div className="relative bg-[#0a0a0a] p-1">
          <div className="relative overflow-hidden">
            <Image
              src={url}
              alt={photo.title}
              width={photo.width ?? 1200}
              height={photo.height ?? 800}
              className="block max-h-[75vh] w-auto object-contain"
              priority
            />
            <div className="film-grain-overlay pointer-events-none absolute inset-0 opacity-[0.12]" />
            <div className="film-vignette absolute inset-0 opacity-60" />
          </div>
        </div>

        {/* Bottom strip with metadata */}
        <div className="flex h-auto items-center justify-between bg-[#0c0c0c] px-3 py-1.5">
          <div className="flex items-center gap-3">
            {LEADER_MARKS.slice(0, 3).map((m, i) => (
              <span key={i} className="font-mono text-[8px] text-[#c8a850]/30">{m}</span>
            ))}
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-mono text-[9px] text-white/80">{photo.title}</span>
            {photo.category && (
              <span className="font-mono text-[7px] uppercase tracking-widest text-[#c8a850]/60">
                {photo.category.split(',')[0]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {LEADER_MARKS.slice(3).map((m, i) => (
              <span key={i} className="font-mono text-[8px] text-[#c8a850]/30">{m}</span>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main page content
// ---------------------------------------------------------------------------

interface FilmPageContentProps {
  initialPhotos: PhotoDto[]
  initialMeta: PhotoPaginationMeta | null
}

const PAGE_SIZE = 60

export function FilmPageContent({ initialPhotos, initialMeta }: FilmPageContentProps) {
  const [photos, setPhotos] = useState<PhotoDto[]>(initialPhotos)
  const [meta, setMeta] = useState<PhotoPaginationMeta | null>(initialMeta)
  const [page, setPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const [grayscale, setGrayscale] = useState(true)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoDto | null>(null)
  const isLoadingRef = useRef(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const framesPerStrip = useResponsiveColumnCount(FILM_STRIP_RULES)
  const frameHeight = framesPerStrip >= 5 ? '14rem' : framesPerStrip >= 4 ? '12rem' : '9rem'

  const strips = useMemo(() => {
    const result: Array<{ brand: (typeof FILM_BRANDS)[number]; photos: PhotoDto[] }> = []
    for (let i = 0; i < photos.length; i += framesPerStrip) {
      result.push({
        brand: FILM_BRANDS[result.length % FILM_BRANDS.length],
        photos: photos.slice(i, i + framesPerStrip),
      })
    }
    return result
  }, [photos, framesPerStrip])

  const loadMore = useCallback(async () => {
    if (isLoadingRef.current || !meta?.hasMore) return
    isLoadingRef.current = true
    setLoadingMore(true)
    try {
      const nextPage = page + 1
      const result = await getPhotosWithMeta({ page: nextPage, pageSize: PAGE_SIZE })
      setPhotos((prev) => [...prev, ...result.data])
      setMeta(result.meta)
      setPage(nextPage)
    } catch (e) {
      console.error('Failed to load more photos', e)
    } finally {
      setLoadingMore(false)
      isLoadingRef.current = false
    }
  }, [meta?.hasMore, page])

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && meta?.hasMore && !loadingMore) {
          void loadMore()
        }
      },
      { threshold: 0.1, rootMargin: '200px' },
    )
    const el = loadMoreRef.current
    if (el) observer.observe(el)
    return () => { if (el) observer.unobserve(el); observer.disconnect() }
  }, [loadMore, loadingMore, meta?.hasMore])

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#060606]">
      {/* Full-page grain */}
      <div className="film-grain-overlay pointer-events-none fixed inset-0 z-0 opacity-[0.06]" />

      {/* Ambient center glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 30%, rgba(200,168,80,0.05) 0%, transparent 70%)' }}
      />

      {/* ── Top bar ─────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <Link
          href="/gallery"
          className="group flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-[#c8a850]/50 transition-colors hover:text-[#c8a850]/90"
        >
          <ArrowLeft className="size-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
          GALLERY
        </Link>

        <button
          onClick={() => setGrayscale((v) => !v)}
          className={`flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] transition-colors duration-200 ${
            grayscale ? 'text-[#c8a850]/70 hover:text-[#c8a850]' : 'text-white/40 hover:text-white/70'
          }`}
          aria-pressed={grayscale}
        >
          {grayscale ? <Circle className="size-3" /> : <CircleOff className="size-3" />}
          B&W
        </button>
      </header>

      {/* ── Hero title ──────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative z-10 px-6 pb-10 pt-4 md:px-12 md:pb-14 md:pt-6"
      >
        {/* Film leader decorative line */}
        <div className="mb-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#c8a850]/30 to-transparent" />
          <div className="flex items-center gap-2">
            {LEADER_MARKS.map((m, i) => (
              <span key={i} className="font-mono text-[9px] text-[#c8a850]/25">{m}</span>
            ))}
          </div>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent via-[#c8a850]/30 to-transparent" />
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.5em] text-[#c8a850]/40">
              ANALOG ARCHIVE · 35MM
            </div>
            <h1 className="font-serif text-5xl font-light tracking-tight text-white/90 md:text-7xl">
              胶片
            </h1>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/20 md:text-right">
            <div>{strips.length} ROLLS</div>
            <div>{photos.length} FRAMES{meta?.hasMore ? '+' : ''}</div>
          </div>
        </div>

        {/* Bottom rule */}
        <div className="mt-8 h-px bg-gradient-to-r from-[#c8a850]/20 via-[#c8a850]/5 to-transparent" />
      </motion.section>

      {/* ── Film strips ─────────────────────────────────────── */}
      <section className="relative z-10 pb-20">
        {/* Left/right edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-[#060606] to-transparent md:w-12" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-[#060606] to-transparent md:w-12" />

        <div className="overflow-x-auto scrollbar-hide px-6 md:px-12">
          <div className="flex min-w-max flex-col gap-6 py-4">
            {strips.map((strip, i) => (
              <FilmStrip
                key={i}
                photos={strip.photos}
                brand={strip.brand}
                startIndex={i * framesPerStrip}
                grayscale={grayscale}
                onPhotoClick={setSelectedPhoto}
                frameHeight={frameHeight}
                stripIndex={i}
              />
            ))}
          </div>
        </div>

        {/* Infinite scroll sentinel */}
        <div ref={loadMoreRef} className="flex items-center justify-center py-8">
          {loadingMore && (
            <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-[#c8a850]/30 animate-pulse">
              DEVELOPING…
            </span>
          )}
        </div>

        {!meta?.hasMore && photos.length > 0 && (
          <div className="flex items-center justify-center gap-4 pb-4">
            <div className="h-px w-12 bg-[#c8a850]/20" />
            <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-[#c8a850]/30">
              END OF ROLL — {photos.length} FRAMES
            </span>
            <div className="h-px w-12 bg-[#c8a850]/20" />
          </div>
        )}
      </section>

      {/* ── Lightbox ────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedPhoto && (
          <Lightbox photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}
