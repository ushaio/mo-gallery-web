'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { resolveAssetUrl } from '@/lib/api/core'
import { useSettings } from '@/contexts/SettingsContext'
import type { FilmRollDto, PhotoDto } from '@/lib/api/types'

const FILM_BOX_ASSET = '/film/general-135.png'

function getFrameTitle(photo: PhotoDto, frameIndex: number) {
  const title = photo.title?.trim()
  return title || `Frame ${String(frameIndex + 1).padStart(2, '0')}`
}

function getRollMetaLine(roll: FilmRollDto) {
  return `${roll.frameCount || 36} EXP • 35MM`
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
  onClick,
}: {
  photo: PhotoDto
  frameIndex: number
  onClick: () => void
}) {
  const { settings } = useSettings()
  const coverUrl = useMemo(
    () => resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain),
    [photo.thumbnailUrl, photo.url, settings?.cdn_domain],
  )

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative h-[88px] w-[132px] shrink-0 overflow-hidden border border-[#2f2922] bg-[#111] text-left transition-colors duration-200 hover:border-[#8b6a33] sm:h-[94px] sm:w-[148px] lg:h-[100px] lg:w-[158px]"
      aria-label={`Open ${getFrameTitle(photo, frameIndex)}`}
    >
      <Image
        src={coverUrl}
        alt={getFrameTitle(photo, frameIndex)}
        fill
        sizes="(max-width: 640px) 132px, (max-width: 1024px) 148px, 158px"
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
  onPhotoClick,
}: {
  roll: FilmRollDto
  photos: PhotoDto[]
  rowIndex: number
  onPhotoClick: (photo: PhotoDto) => void
}) {
  const holeCount = Math.max(photos.length * 2 + 4, 14)
  const rollNote = getRollNote(roll)

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay: rowIndex * 0.05 }}
      className="grid overflow-hidden rounded-[18px] border border-[#2a2115] bg-[#090807]/95 shadow-[0_24px_70px_rgba(0,0,0,0.28)] lg:grid-cols-[280px_minmax(0,1fr)]"
    >
      <div className="flex min-h-[198px] items-center gap-5 border-b border-[#2a2115] bg-[linear-gradient(180deg,rgba(17,14,11,0.98),rgba(8,7,6,0.98))] px-5 py-5 sm:px-6 lg:min-h-[214px] lg:border-b-0 lg:border-r">
        <div className="relative h-[138px] w-[100px] shrink-0 sm:h-[150px] sm:w-[108px]">
          <Image
            src={FILM_BOX_ASSET}
            alt="135 film box"
            fill
            sizes="108px"
            className="scale-[1.75] object-contain drop-shadow-[0_22px_28px_rgba(0,0,0,0.55)]"
            priority={rowIndex === 0}
          />
        </div>

        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#9d917d]">
            {roll.brand}
          </p>
          <h2 className="mt-3 font-serif text-[2rem] font-light leading-none tracking-[0.03em] text-[#d7b16a] sm:text-[2.2rem]">
            {roll.name}
          </h2>
          <p className="mt-4 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.28em] text-[#827867]">
            {getRollMetaLine(roll)}
          </p>
          {roll.iso ? (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.28em] text-[#827867]">
              ISO {roll.iso}
            </p>
          ) : null}
          {rollNote ? (
            <p className="mt-3 max-w-[18rem] font-mono text-[9px] uppercase tracking-[0.28em] text-[#6e654f]">
              {rollNote}
            </p>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-hide px-3 py-3 sm:px-4 lg:px-5">
        <div className="min-w-max rounded-[14px] border border-[#1c1712] bg-[#050505]">
          <div className="border-b border-[#17130f] px-4 pb-2 pt-3 sm:px-5">
            <div className="flex items-center gap-4 font-mono text-[8px] uppercase tracking-[0.34em] text-[#8b7348] sm:gap-6 sm:text-[9px]">
              <span className="min-w-[72px]">{roll.brand}</span>
              {photos.map((_, frameIndex) => (
                <span key={frameIndex}>{String(frameIndex + 1).padStart(3, '0')}</span>
              ))}
            </div>
          </div>

          <SprocketRail holeCount={holeCount} />

          <div className="flex gap-[4px] bg-[#0b0908] px-[10px] py-[8px] sm:px-3">
            {photos.map((photo, frameIndex) => (
              <FilmFrame
                key={photo.id}
                photo={photo}
                frameIndex={frameIndex}
                onClick={() => onPhotoClick(photo)}
              />
            ))}
          </div>

          <SprocketRail holeCount={holeCount} />
        </div>
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
    <div className="relative min-h-screen overflow-x-hidden bg-[#050505] text-[#f0e7d6]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(194,152,82,0.12),transparent_34%),radial-gradient(circle_at_top_right,rgba(120,87,36,0.09),transparent_28%),linear-gradient(180deg,#090807_0%,#050505_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:48px_48px] opacity-20" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.05]">
        <div className="film-grain-overlay h-full w-full" />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative z-10 mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 pb-10 pt-28 sm:px-6 md:px-10 lg:flex-row lg:items-start lg:justify-between lg:gap-12 lg:pt-32"
      >
        <div className="max-w-3xl">
          <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.45em] text-[#b89452]">
            Analog Archive • 35mm
          </p>
          <h1 className="font-serif text-5xl font-light tracking-[0.03em] text-[#f0e7d6] sm:text-6xl lg:text-7xl">
            Film Archive
          </h1>
          <p className="mt-5 max-w-xl font-mono text-[11px] uppercase tracking-[0.32em] text-[#8e8372]">
            A collection of moments, captured on film.
          </p>
        </div>

        <div className="w-full max-w-[190px] self-start rounded-[14px] border border-[#5d4b2d] bg-[#0c0b09]/90 px-5 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
          <p className="font-mono text-[9px] uppercase tracking-[0.32em] text-[#8e7b53]">
            Total Frames
          </p>
          <p className="mt-3 font-serif text-4xl text-[#d4af67]">{totalFrames}</p>
          <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.32em] text-[#8e7b53]">
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
            onPhotoClick={setSelectedPhoto}
          />
        ))}
      </section>

      <div className="relative z-10 mx-auto flex w-full max-w-[1600px] items-center justify-center gap-4 px-4 pb-14 pt-2 sm:px-6 md:px-10">
        <div className="h-px w-10 bg-[#3a2f20]" />
        <p className="font-mono text-[10px] uppercase tracking-[0.45em] text-[#8d7244]">
          Film Is Not Dead
        </p>
        <div className="h-px w-10 bg-[#3a2f20]" />
      </div>

      <AnimatePresence>
        {selectedPhoto ? (
          <Lightbox photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
        ) : null}
      </AnimatePresence>
    </div>
  )
}
