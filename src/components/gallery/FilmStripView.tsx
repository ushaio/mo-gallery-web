'use client'

import { memo, useMemo } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { resolveAssetUrl } from '@/lib/api/core'
import type { PhotoDto, PublicSettingsDto } from '@/lib/api/types'
import { useResponsiveColumnCount } from './useResponsiveColumnCount'

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

// ---------------------------------------------------------------------------
// Sub-components
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

const FilmBrandSidebar = memo(function FilmBrandSidebar({
  brand,
}: {
  brand: (typeof FILM_BRANDS)[number]
}) {
  return (
    <div className="flex w-5 shrink-0 items-center justify-center bg-[#080808] sm:w-7">
      <span
        className="whitespace-nowrap font-mono text-[7px] font-black uppercase tracking-[0.25em] text-[#c8a850]/70 sm:text-[8px]"
        style={{
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          transform: 'rotate(180deg)',
        }}
      >
        {brand.name} {brand.code} — {brand.exp}EXP — DX {brand.iso}
      </span>
    </div>
  )
})

const FilmFrame = memo(function FilmFrame({
  photo,
  frameIndex,
  settings,
  grayscale,
  onClick,
}: {
  photo: PhotoDto
  frameIndex: number
  settings: PublicSettingsDto | null
  grayscale: boolean
  onClick: () => void
}) {
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

      {/* Film grain overlay */}
      <div className="film-grain-overlay pointer-events-none absolute inset-0 opacity-[0.18]" />

      {/* Scanlines */}
      <div className="film-scanlines pointer-events-none absolute inset-0 opacity-100" />

      {/* Vignette — fades out on hover */}
      <div className="film-vignette absolute inset-0 opacity-100 group-hover:opacity-30" />

      {/* Frame number */}
      <div className="pointer-events-none absolute left-1 top-0.5 select-none font-mono text-[7px] text-[#c8a850]/60 sm:left-1.5 sm:top-1 sm:text-[8px]">
        {String(frameIndex + 1).padStart(2, '0')}A
      </div>

      {/* Triangle marker */}
      <div className="pointer-events-none absolute right-1 top-0.5 select-none font-mono text-[8px] text-[#c8a850]/40 sm:right-1.5 sm:top-1">
        ▷
      </div>

      {/* Hover info overlay */}
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-1.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:p-2">
        <p className="truncate font-mono text-[9px] text-white/95 sm:text-[10px]">
          {photo.title}
        </p>
        {photo.category ? (
          <p className="truncate font-mono text-[7px] uppercase tracking-wider text-[#c8a850]/90 sm:text-[8px]">
            {photo.category.split(',')[0]}
          </p>
        ) : null}
      </div>
    </div>
  )
})

const FilmStrip = memo(function FilmStrip({
  photos,
  brand,
  startIndex,
  settings,
  grayscale,
  onPhotoClick,
  frameHeight,
  stripIndex,
}: {
  photos: PhotoDto[]
  brand: (typeof FILM_BRANDS)[number]
  startIndex: number
  settings: PublicSettingsDto | null
  grayscale: boolean
  onPhotoClick: (photo: PhotoDto) => void
  frameHeight: string
  stripIndex: number
}) {
  const holeCount = photos.length * 2 + 3

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1], delay: stripIndex * 0.07 }}
      className="flex shrink-0 flex-col bg-[#0a0a0a] ring-1 ring-[#1e1e1e] transition-all duration-300 hover:ring-[#c8a850]/15 hover:shadow-[0_8px_32px_rgba(0,0,0,0.7)]"
    >
      <SprocketRail holeCount={holeCount} />

      <div className="flex">
        <FilmBrandSidebar brand={brand} />

        <div className="flex gap-[3px] p-[3px]" style={{ height: frameHeight }}>
          {photos.map((photo, i) => (
            <FilmFrame
              key={photo.id}
              photo={photo}
              frameIndex={startIndex + i}
              settings={settings}
              grayscale={grayscale}
              onClick={() => onPhotoClick(photo)}
            />
          ))}
        </div>
      </div>

      <SprocketRail holeCount={holeCount} />
    </motion.div>
  )
})

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function FilmStripSkeleton({ count, frameHeight }: { count: number; frameHeight: string }) {
  return (
    <div className="flex shrink-0 flex-col bg-[#0a0a0a] ring-1 ring-[#1e1e1e]">
      <div className="h-5 bg-[#0c0c0c] sm:h-6" />
      <div className="flex gap-[3px] p-[3px]" style={{ height: frameHeight }}>
        {Array.from({ length: count }, (_, j) => (
          <div key={j} className="w-36 shrink-0 animate-pulse rounded-[2px] bg-[#141414] sm:w-44 lg:w-52" />
        ))}
      </div>
      <div className="h-5 bg-[#0c0c0c] sm:h-6" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Darkroom wrapper
// ---------------------------------------------------------------------------

function DarkroomContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative -mx-2 sm:-mx-4 md:-mx-8 lg:-mx-12">
      {/* Deep background */}
      <div className="absolute inset-0 bg-[#060606]" />

      {/* Ambient center glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(200,168,80,0.04) 0%, transparent 70%)',
        }}
      />

      {/* Top & bottom edge fades */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-[#060606] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#060606] to-transparent" />

      <div className="relative px-2 sm:px-4 md:px-8 lg:px-12">
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface FilmStripViewProps {
  photos: PhotoDto[]
  settings: PublicSettingsDto | null
  grayscale: boolean
  onPhotoClick: (photo: PhotoDto) => void
  loading?: boolean
}

export function FilmStripView({
  photos,
  settings,
  grayscale,
  onPhotoClick,
  loading,
}: FilmStripViewProps) {
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

  if (loading) {
    return (
      <DarkroomContainer>
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex min-w-max gap-4 py-8">
            {Array.from({ length: 3 }, (_, i) => (
              <FilmStripSkeleton key={i} count={framesPerStrip} frameHeight={frameHeight} />
            ))}
          </div>
        </div>
      </DarkroomContainer>
    )
  }

  if (photos.length === 0) {
    return (
      <DarkroomContainer>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-4 flex h-16 w-24 items-center justify-center bg-[#0a0a0a] ring-1 ring-[#222]">
            <span className="font-mono text-xs text-[#c8a850]/40">UNEXPOSED</span>
          </div>
          <p className="font-mono text-xs uppercase tracking-wider text-[#c8a850]/30">
            No frames exposed
          </p>
        </div>
      </DarkroomContainer>
    )
  }

  return (
    <DarkroomContainer>
      {/* Left & right scroll-hint fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[#060606] to-transparent sm:w-16 md:w-20" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[#060606] to-transparent sm:w-16 md:w-20" />

      <div className="overflow-x-auto scrollbar-hide">
        <div className="flex min-w-max gap-5 py-8 sm:gap-6">
          {strips.map((strip, i) => (
            <FilmStrip
              key={i}
              photos={strip.photos}
              brand={strip.brand}
              startIndex={i * framesPerStrip}
              settings={settings}
              grayscale={grayscale}
              onPhotoClick={onPhotoClick}
              frameHeight={frameHeight}
              stripIndex={i}
            />
          ))}
        </div>
      </div>
    </DarkroomContainer>
  )
}
