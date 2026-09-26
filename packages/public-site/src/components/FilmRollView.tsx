'use client'

import { memo, useState } from 'react'

import type { PhotoSiteMetadata, SiteFilmRoll } from '@mo-gallery/content-core'
import type { MediaUrlResolver } from '../adapters'
import type { PublicSiteLabels } from '../labels'
import { PhotoCard } from './PhotoCard'
import { Lightbox } from './Lightbox'

/**
 * 胶卷视图：FilmRollList（胶卷卡片）与 FilmRollDetail（成帧照片条 + 灯箱）。
 * 成员照片由宿主按 roll.photoIds 顺序解析（published 过滤 + 悬挂 id 容错）后传入。
 */

interface FilmRollListProps {
  rolls: SiteFilmRoll[]
  /** 每卷的缩略照片（按 roll.id 索引；可部分缺失，缺失渲染占位）。 */
  thumbs?: Record<string, PhotoSiteMetadata>
  resolver: MediaUrlResolver
  labels: PublicSiteLabels
  /** 单卷详情链接（宿主经 LinkAdapter.filmRoll 生成）。 */
  rollHref: (roll: SiteFilmRoll) => string
}

export const FilmRollList = memo(function FilmRollList({ rolls, thumbs, resolver, labels, rollHref }: FilmRollListProps) {
  if (rolls.length === 0) {
    return <p className="py-24 text-center text-sm text-muted-foreground">{labels.emptyFilmRolls}</p>
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {rolls.map((roll, index) => {
        const thumb = thumbs?.[roll.id]
        let thumbUrl = ''
        if (thumb) {
          try {
            thumbUrl = resolver.photoThumbnail(thumb)
          } catch {
            thumbUrl = ''
          }
        }
        const metaParts = [roll.brand, roll.format].filter(Boolean)
        return (
          <a
            key={roll.id}
            href={rollHref(roll)}
            className="psw-enter group block cursor-pointer overflow-hidden rounded-sm bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md focus:outline-none focus:ring-1 focus:ring-primary/40"
            style={{ animationDelay: `${Math.min(index, 12) * 0.05}s` }}
          >
            <div className="relative aspect-video overflow-hidden bg-muted">
              {thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbUrl}
                  alt={roll.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-[400ms] ease-out group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-serif text-4xl text-muted-foreground/30">
                  {roll.photoIds.length}
                </div>
              )}
              {/* 胶片质感：扫线常驻 + 暗角 hover 浮现（类来自 web-theme.css） */}
              <div className="film-scanlines absolute inset-0" aria-hidden="true" />
              <div className="film-vignette absolute inset-0 opacity-0 group-hover:opacity-100" aria-hidden="true" />
              {/* 帧数毛玻璃胶囊（与相册卡片同规格） */}
              <div className="absolute bottom-2 right-2 rounded-full border border-border/30 bg-background/80 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-foreground backdrop-blur-sm">
                {roll.photoIds.length}
              </div>
            </div>
            <div className="space-y-1 p-3 md:p-4">
              <h3 className="line-clamp-1 text-sm font-medium tracking-wide text-foreground">{roll.name}</h3>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
                {[
                  ...metaParts,
                  roll.iso ? `${labels.filmIsoLabel} ${roll.iso}` : '',
                  `${roll.photoIds.length} ${labels.filmFrameCountSuffix}`,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
          </a>
        )
      })}
    </div>
  )
})

interface FilmRollDetailProps {
  roll: SiteFilmRoll
  photos: PhotoSiteMetadata[]
  resolver: MediaUrlResolver
  labels: PublicSiteLabels
  grayscale?: boolean
  backHref?: string
}

export const FilmRollDetail = memo(function FilmRollDetail({
  roll,
  photos,
  resolver,
  labels,
  grayscale = false,
  backHref,
}: FilmRollDetailProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const metaParts = [roll.brand, roll.format].filter(Boolean)

  return (
    <div>
      {backHref ? (
        <a
          href={backHref}
          className="mb-6 inline-block text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          ← {labels.back}
        </a>
      ) : null}
      <header className="mb-8">
        <h1 className="font-serif text-3xl font-light tracking-tight md:text-4xl">{roll.name}</h1>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground/60">
          {[
            ...metaParts,
            roll.iso ? `${labels.filmIsoLabel} ${roll.iso}` : '',
            `${photos.length} ${labels.filmFrameCountSuffix}`,
          ].filter(Boolean).join(' · ')}
        </p>
        {roll.notes ? <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{roll.notes}</p> : null}
      </header>

      {photos.length === 0 ? (
        <p className="py-24 text-center text-sm text-muted-foreground">{labels.emptyPhotos}</p>
      ) : (
        <>
          <div className="columns-2 gap-2 sm:columns-3 lg:columns-4 lg:gap-6">
            {photos.map((photo, index) => (
              <div key={photo.id} className="group/roll relative mb-2 break-inside-avoid sm:mb-4 lg:mb-6">
                <PhotoCard
                  photo={photo}
                  grayscale={grayscale}
                  frameNumber={index + 1}
                  showMeta={false}
                  resolver={resolver}
                  onPhotoClick={() => setLightboxIndex(index)}
                />
                {/* 胶片质感叠层：扫线常驻、暗角 hover 浮现（pointer-events 由类自带 none） */}
                <div className="film-scanlines absolute inset-0" aria-hidden="true" />
                <div className="film-vignette absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/roll:opacity-100" aria-hidden="true" />
              </div>
            ))}
          </div>
          <Lightbox
            photos={photos}
            index={lightboxIndex}
            resolver={resolver}
            labels={labels}
            onClose={() => setLightboxIndex(null)}
            onNavigate={setLightboxIndex}
          />
        </>
      )}
    </div>
  )
})
