'use client'

import { memo, useMemo } from 'react'
import Image from 'next/image'
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
    <div className="flex h-5 items-center justify-between bg-[#111] px-1.5 sm:h-6 sm:px-2">
      {Array.from({ length: holeCount }, (_, i) => (
        <span
          key={i}
          className="inline-block h-2.5 w-3.5 rounded-[1.5px] border border-[#444] bg-[#2a2a2a] sm:h-3 sm:w-4"
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
    <div className="flex w-5 shrink-0 items-center justify-center bg-[#0a0a0a] sm:w-7">
      <span
        className="whitespace-nowrap font-mono text-[7px] font-black uppercase tracking-[0.25em] text-[#c8a850]/80 sm:text-[8px]"
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

  // Use aspect ratio from photo dimensions, clamped to reasonable film-like range
  const aspectRatio = photo.width && photo.height
    ? Math.max(0.6, Math.min(1.8, photo.width / photo.height))
    : 1.5 // default 3:2 landscape (standard 35mm frame)

  return (
    <div
      className="group relative shrink-0 cursor-pointer overflow-hidden border-2 border-[#1c1c1c] rounded-[2px]"
      style={{ aspectRatio }}
      onClick={onClick}
    >
      <Image
        src={coverUrl}
        alt={photo.title}
        fill
        sizes="(max-width: 640px) 30vw, (max-width: 1024px) 22vw, 18vw"
        className={`object-cover transition-all duration-500 group-hover:scale-105 group-hover:brightness-110 ${
          grayscale
            ? 'grayscale group-hover:grayscale-0'
            : 'sepia-[0.2] saturate-[0.85] group-hover:sepia-0 group-hover:saturate-100'
        }`}
      />

      {/* Film grain overlay */}
      <div className="film-grain-overlay pointer-events-none absolute inset-0 opacity-[0.12]" />

      {/* Frame number */}
      <div className="pointer-events-none absolute left-1 top-0.5 select-none font-mono text-[7px] text-[#c8a850]/60 sm:left-1.5 sm:top-1 sm:text-[8px]">
        {String(frameIndex + 1).padStart(2, '0')}A
      </div>

      {/* Triangle marker */}
      <div className="pointer-events-none absolute right-1 top-0.5 select-none font-mono text-[8px] text-[#c8a850]/40 sm:right-1.5 sm:top-1">
        ▷
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-transparent to-transparent p-1.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:p-2">
        <p className="truncate font-mono text-[9px] text-white/90 sm:text-[10px]">
          {photo.title}
        </p>
        {photo.category ? (
          <p className="truncate font-mono text-[7px] uppercase tracking-wider text-[#c8a850]/80 sm:text-[8px]">
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
}: {
  photos: PhotoDto[]
  brand: (typeof FILM_BRANDS)[number]
  startIndex: number
  settings: PublicSettingsDto | null
  grayscale: boolean
  onPhotoClick: (photo: PhotoDto) => void
  frameHeight: string
}) {
  const holeCount = photos.length * 2 + 3

  return (
    <div className="flex shrink-0 flex-col bg-[#0d0d0d] ring-1 ring-[#222] transition-shadow hover:ring-primary/20">
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
    </div>
  )
})

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function FilmStripSkeleton({ count, frameHeight }: { count: number; frameHeight: string }) {
  return (
    <div className="flex shrink-0 flex-col bg-[#0d0d0d] ring-1 ring-[#222]">
      <div className="h-5 bg-[#111] sm:h-6" />
      <div className="flex gap-[3px] p-[3px]" style={{ height: frameHeight }}>
        {Array.from({ length: count }, (_, j) => (
          <div key={j} className="w-36 shrink-0 animate-pulse rounded-[2px] bg-[#1a1a1a] sm:w-44 lg:w-52" />
        ))}
      </div>
      <div className="h-5 bg-[#111] sm:h-6" />
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
      <div className="-mx-2 w-[calc(100%+1rem)] overflow-x-auto px-2 pb-4 scrollbar-hide sm:-mx-4 sm:w-[calc(100%+2rem)] sm:px-4">
        <div className="flex min-w-max gap-4 py-4">
          {Array.from({ length: 3 }, (_, i) => (
            <FilmStripSkeleton key={i} count={framesPerStrip} frameHeight={frameHeight} />
          ))}
        </div>
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-16 w-24 items-center justify-center bg-[#0d0d0d] ring-1 ring-[#222]">
          <span className="font-mono text-xs text-[#c8a850]/40">UNEXPOSED</span>
        </div>
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          No frames exposed
        </p>
      </div>
    )
  }

  return (
    <div className="-mx-2 w-[calc(100%+1rem)] overflow-x-auto px-2 pb-4 scrollbar-hide sm:-mx-4 sm:w-[calc(100%+2rem)] sm:px-4">
      <div className="flex min-w-max gap-6 py-4">
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
          />
        ))}
      </div>
    </div>
  )
}
