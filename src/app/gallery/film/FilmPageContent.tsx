'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { resolveAssetUrl } from '@/lib/api/core'
import { useSettings } from '@/contexts/SettingsContext'
import { getFilmStockAsset } from '@/lib/film-presets'
import type { FilmRollDto, PhotoDto } from '@/lib/api/types'

const EXPANDED_FRAME_GRID_CLASSES = {
  '120': 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  '135': 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
} as const

function getFrameTitle(photo: PhotoDto, frameIndex: number) {
  const title = photo.title?.trim()
  return title || `Frame ${String(frameIndex + 1).padStart(2, '0')}`
}

function getRollMetaLine(roll: FilmRollDto) {
  return `${roll.frameCount || 36} EXP • ${roll.format ?? '135'}`
}

function getRollNote(roll: FilmRollDto) {
  return roll.notes?.trim()
}

function SprocketRail({ holeCount }: { holeCount: number }) {
  return (
    <div className="flex h-6 items-center justify-between gap-1 bg-[#050505] px-3 sm:h-7">
      {Array.from({ length: holeCount }, (_, index) => (
        <span
          key={index}
          className="block h-[10px] w-[8px] rounded-[1px] border border-[#211a13] bg-[#100e0c] sm:h-[11px] sm:w-[9px]"
        />
      ))}
    </div>
  )
}

function FilmFrame({
  photo,
  frameIndex,
  format,
  isExpanded,
  onClick,
}: {
  photo: PhotoDto
  frameIndex: number
  format: FilmRollDto['format']
  isExpanded: boolean
  onClick: () => void
}) {
  const { settings } = useSettings()
  const coverUrl = useMemo(
    () => resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain),
    [photo.thumbnailUrl, photo.url, settings?.cdn_domain],
  )
  const frameClassName = isExpanded
    ? format === '120'
      ? 'aspect-square w-full'
      : 'aspect-[3/2] w-full'
    : 'h-[104px] w-[156px] shrink-0 sm:h-[116px] sm:w-[182px] lg:h-[132px] lg:w-[208px]'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden border border-[#2f2922] bg-[#111] text-left transition-colors duration-200 hover:border-[#8b6a33] ${frameClassName}`}
      aria-label={`Open ${getFrameTitle(photo, frameIndex)}`}
    >
      <Image
        src={coverUrl}
        alt={getFrameTitle(photo, frameIndex)}
        fill
        sizes={isExpanded ? '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw' : '(max-width: 640px) 156px, (max-width: 1024px) 182px, 208px'}
        className="object-cover grayscale-[0.15] sepia-[0.18] brightness-[0.92] transition duration-300 group-hover:brightness-100"
      />
      <div className="film-grain-overlay pointer-events-none absolute inset-0 opacity-[0.12]" />
      <div className="film-scanlines pointer-events-none absolute inset-0 opacity-70" />
      <div className="film-vignette pointer-events-none absolute inset-0 opacity-80" />
      <div className="pointer-events-none absolute left-2 top-1.5 font-mono text-[8px] uppercase tracking-[0.26em] text-[#bea06a]/70">
        {String(frameIndex + 1).padStart(3, '0')}
      </div>
    </button>
  )
}

function ArchiveRollRow({
  roll,
  photos,
  rowIndex,
  isExpanded,
  onToggle,
  onPhotoClick,
}: {
  roll: FilmRollDto
  photos: PhotoDto[]
  rowIndex: number
  isExpanded: boolean
  onToggle: () => void
  onPhotoClick: (photo: PhotoDto) => void
}) {
  const rollNote = getRollNote(roll)
  const rollFormat = roll.format ?? '135'
  const expandedGridClassName = EXPANDED_FRAME_GRID_CLASSES[rollFormat]
  const defaultHoleCount = Math.max(photos.length * 2 + 4, 14)
  const expandedHoleCount = rollFormat === '120' ? 22 : 26

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay: rowIndex * 0.05 }}
      className="grid overflow-hidden rounded-[18px] border border-border bg-card/95 shadow-[0_24px_70px_rgba(0,0,0,0.12)] dark:border-[#2a2115] dark:bg-[#090807]/95 dark:shadow-[0_24px_70px_rgba(0,0,0,0.28)] lg:grid-cols-[280px_minmax(0,1fr)]"
    >
      <div className="flex min-h-[198px] self-start items-center gap-5 border-b border-border bg-secondary/60 px-5 py-5 sm:px-6 dark:border-[#2a2115] dark:bg-[linear-gradient(180deg,rgba(17,14,11,0.98),rgba(8,7,6,0.98))] lg:min-h-[214px] lg:border-b-0 lg:border-r">
        <button
          type="button"
          onClick={onToggle}
          className="group relative h-[138px] w-[100px] shrink-0 cursor-pointer sm:h-[150px] sm:w-[108px]"
          aria-expanded={isExpanded}
          aria-controls={`film-roll-${roll.id}`}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${roll.brand} ${roll.name}`}
        >
          <Image
            src={getFilmStockAsset(roll.brand, roll.name, roll.format ?? '135')}
            alt={`${roll.brand} ${roll.name}`}
            fill
            sizes="108px"
            className="scale-[1.75] object-contain drop-shadow-[0_22px_28px_rgba(0,0,0,0.55)] transition-transform duration-300 group-hover:scale-[1.86]"
            priority={rowIndex === 0}
          />
        </button>

        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-muted-foreground dark:text-[#9d917d]">
            {roll.brand}
          </p>
          <h2 className="mt-3 font-serif text-[2rem] font-light leading-none tracking-[0.03em] text-foreground dark:text-[#d7b16a] sm:text-[2.2rem]">
            {roll.name}
          </h2>
          <p className="mt-4 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground dark:text-[#827867]">
            {getRollMetaLine(roll)}
          </p>
          {roll.iso ? (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground dark:text-[#827867]">
              ISO {roll.iso}
            </p>
          ) : null}
          {rollNote ? (
            <p className="mt-3 max-w-[18rem] font-mono text-[9px] uppercase tracking-[0.28em] text-muted-foreground/80 dark:text-[#6e654f]">
              {rollNote}
            </p>
          ) : null}
        </div>
      </div>

      <div id={`film-roll-${roll.id}`} className={`h-full scrollbar-hide ${isExpanded ? 'overflow-hidden bg-muted px-3 py-6 sm:px-5 dark:bg-[#e7dcc8] lg:px-8' : 'overflow-x-auto'}`}>
        <motion.div
          animate={{ opacity: 1 }}
          initial={false}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className={isExpanded ? `grid w-full ${expandedGridClassName} gap-x-1 gap-y-4` : 'h-full min-w-max'}
        >
          {isExpanded ? photos.map((photo, frameIndex) => (
            <div key={photo.id} className="flex min-w-0 flex-col bg-[#050505] shadow-[0_10px_28px_rgba(0,0,0,0.22)]">
              <SprocketRail holeCount={expandedHoleCount} />
              <div className="bg-[#0b0908] px-[6px] py-[5px] sm:px-[8px]">
                <FilmFrame
                  photo={photo}
                  frameIndex={frameIndex}
                  format={rollFormat}
                  isExpanded
                  onClick={() => onPhotoClick(photo)}
                />
              </div>
              <SprocketRail holeCount={expandedHoleCount} />
            </div>
          )) : (
            <div className="flex h-full min-w-max flex-col rounded-[14px] border border-[#1c1712] bg-[#050505]">
              <SprocketRail holeCount={defaultHoleCount} />

              <div className="flex flex-1 items-center gap-[4px] bg-[#0b0908] px-[8px] py-[6px] sm:px-[10px]">
                {photos.map((photo, frameIndex) => (
                  <FilmFrame
                    key={photo.id}
                    photo={photo}
                    frameIndex={frameIndex}
                    format={rollFormat}
                    isExpanded={false}
                    onClick={() => onPhotoClick(photo)}
                  />
                ))}
              </div>

              <SprocketRail holeCount={defaultHoleCount} />
            </div>
          )}
        </motion.div>
      </div>
    </motion.article>
  )
}

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
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020202]/95 p-4 md:p-10"
      onClick={onClose}
    >
      <div className="film-grain-overlay pointer-events-none absolute inset-0 opacity-[0.08]" />

      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.24 }}
        className="relative max-h-full max-w-6xl overflow-hidden rounded-[16px] border border-[#2b2217] bg-[#070605] shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <SprocketRail holeCount={16} />

        <div className="relative bg-[#090807] p-2 sm:p-3">
          <div className="relative overflow-hidden rounded-[8px] border border-[#221b13] bg-black">
            <Image
              src={url}
              alt={photo.title}
              width={photo.width ?? 1200}
              height={photo.height ?? 800}
              className="block max-h-[78vh] w-auto object-contain"
              priority
            />
            <div className="film-grain-overlay pointer-events-none absolute inset-0 opacity-[0.1]" />
            <div className="film-vignette pointer-events-none absolute inset-0 opacity-60" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-[#2b2217] bg-[#070605] px-4 py-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.32em] text-[#7f6b45]">
            Frame Preview
          </span>
          <div className="min-w-0 text-right">
            <p className="truncate font-serif text-sm text-[#e6dcc8]">
              {photo.title || 'Untitled Frame'}
            </p>
            {photo.category ? (
              <p className="mt-1 truncate font-mono text-[8px] uppercase tracking-[0.28em] text-[#8f7a51]">
                {photo.category.split(',')[0]}
              </p>
            ) : null}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

interface FilmPageContentProps {
  initialRolls: FilmRollDto[]
}

export function FilmPageContent({ initialRolls }: FilmPageContentProps) {
  const [rolls] = useState<FilmRollDto[]>(initialRolls)
  const [expandedRollId, setExpandedRollId] = useState<string | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoDto | null>(null)

  const strips = useMemo(() => {
    return rolls
      .filter((roll) => (roll.filmPhotos?.length ?? 0) > 0)
      .map((roll) => ({
        roll,
        photos: roll.filmPhotos!.map((item) => item.photo!).filter(Boolean),
      }))
  }, [rolls])

  const totalFrames = useMemo(
    () => strips.reduce((sum, strip) => sum + strip.photos.length, 0),
    [strips],
  )

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_34%),radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--muted-foreground)_8%,transparent),transparent_28%),linear-gradient(180deg,var(--background)_0%,var(--muted)_100%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(194,152,82,0.12),transparent_34%),radial-gradient(circle_at_top_right,rgba(120,87,36,0.09),transparent_28%),linear-gradient(180deg,#090807_0%,#050505_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_srgb,var(--foreground)_4%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_srgb,var(--foreground)_4%,transparent)_1px,transparent_1px)] bg-[size:48px_48px] opacity-30 dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] dark:opacity-20" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.025] dark:opacity-[0.05]">
        <div className="film-grain-overlay h-full w-full" />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative z-10 mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 pb-10 pt-28 sm:px-6 md:px-10 lg:flex-row lg:items-start lg:justify-between lg:gap-12 lg:pt-32"
      >
        <div className="max-w-3xl">
          <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.45em] text-primary dark:text-[#b89452]">
            Analog Archive • 35mm
          </p>
          <h1 className="font-serif text-5xl font-light tracking-[0.03em] text-foreground dark:text-[#f0e7d6] sm:text-6xl lg:text-7xl">
            Film Archive
          </h1>
          <p className="mt-5 max-w-xl font-mono text-[11px] uppercase tracking-[0.32em] text-muted-foreground dark:text-[#8e8372]">
            A collection of moments, captured on film.
          </p>
        </div>

        <div className="w-full max-w-[190px] self-start rounded-[14px] border border-border bg-card/90 px-5 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.08)] dark:border-[#5d4b2d] dark:bg-[#0c0b09]/90 dark:shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
          <p className="font-mono text-[9px] uppercase tracking-[0.32em] text-muted-foreground dark:text-[#8e7b53]">
            Total Frames
          </p>
          <p className="mt-3 font-serif text-4xl text-primary dark:text-[#d4af67]">{totalFrames}</p>
          <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.32em] text-muted-foreground dark:text-[#8e7b53]">
            {strips.length} Rolls
          </p>
        </div>
      </motion.section>

      <section className="relative z-10 mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 pb-16 sm:px-6 md:px-10">
        {strips.map((strip, index) => (
          <ArchiveRollRow
            key={strip.roll.id}
            roll={strip.roll}
            photos={strip.photos}
            rowIndex={index}
            isExpanded={expandedRollId === strip.roll.id}
            onToggle={() => setExpandedRollId((currentId) => currentId === strip.roll.id ? null : strip.roll.id)}
            onPhotoClick={setSelectedPhoto}
          />
        ))}
      </section>

      <div className="relative z-10 mx-auto flex w-full max-w-[1600px] items-center justify-center gap-4 px-4 pb-14 pt-2 sm:px-6 md:px-10">
        <div className="h-px w-10 bg-border dark:bg-[#3a2f20]" />
        <p className="font-mono text-[10px] uppercase tracking-[0.45em] text-muted-foreground dark:text-[#8d7244]">
          Film Is Not Dead
        </p>
        <div className="h-px w-10 bg-border dark:bg-[#3a2f20]" />
      </div>

      <AnimatePresence>
        {selectedPhoto ? (
          <Lightbox photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
        ) : null}
      </AnimatePresence>
    </div>
  )
}
