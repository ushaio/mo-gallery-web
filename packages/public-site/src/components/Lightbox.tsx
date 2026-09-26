'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'

import type { PhotoSiteMetadata } from '@mo-gallery/content-core'
import type { MediaUrlResolver } from '../adapters'
import type { PublicSiteLabels } from '../labels'

interface LightboxProps {
  photos: PhotoSiteMetadata[]
  /** 当前展示的照片在 photos 中的下标；null 表示关闭。 */
  index: number | null
  resolver: MediaUrlResolver
  labels: PublicSiteLabels
  /** 底部缩略图条（web PhotoDetailModal 规格）；默认开启。 */
  thumbnails?: boolean
  onClose: () => void
  onNavigate?: (index: number) => void
}

function formatExif(photo: PhotoSiteMetadata): string[] {
  const parts: string[] = []
  const camera = [photo.cameraMake, photo.cameraModel].filter(Boolean).join(' ')
  if (camera) parts.push(camera)
  const lens = [photo.lensMake, photo.lensModel].filter(Boolean).join(' ')
  if (lens) parts.push(lens)
  if (photo.focalLength) parts.push(`${photo.focalLength}mm`)
  if (photo.iso) parts.push(`ISO ${photo.iso}`)
  return parts
}

/* TODO(宿主增强)：web PhotoDetailModal 的拖拽物理（三联 slide 滑动切换 /
   下拉关闭 / 轴锁定）、双击 2x 缩放与放大平移、移动端控件自动隐藏不做——
   涉及 framer-motion 运动值与手势库，留待宿主（Web）以自身实现增强。 */

/**
 * 访客灯箱（web PhotoDetailModal 的视觉规格、共享包零依赖版）：
 * - 暗色 overlay + 圆形黑玻璃按钮（关闭/计数/箭头），桌面端随 hover 浮现；
 * - 底部缩略图条：active ring-2 + scale-95，非 active opacity-40，
 *   当前项自动 scrollIntoView 居中；
 * - 键盘导航（Esc 关闭、←/→ 切换）与 body 滚动锁 + 滚动条宽度补偿。
 * 纯展示组件，开合与下标由宿主状态驱动。
 */
export const Lightbox = memo(function Lightbox({
  photos,
  index,
  resolver,
  labels,
  thumbnails = true,
  onClose,
  onNavigate,
}: LightboxProps) {
  const isOpen = index !== null && index >= 0 && index < photos.length
  const thumbnailsScrollRef = useRef<HTMLDivElement>(null)

  const goPrev = useCallback(() => {
    if (index === null || !onNavigate || photos.length === 0) return
    onNavigate((index - 1 + photos.length) % photos.length)
  }, [index, onNavigate, photos.length])

  const goNext = useCallback(() => {
    if (index === null || !onNavigate || photos.length === 0) return
    onNavigate((index + 1) % photos.length)
  }, [index, onNavigate, photos.length])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      } else if (event.key === 'ArrowLeft') {
        goPrev()
      } else if (event.key === 'ArrowRight') {
        goNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    // body 滚动锁 + 滚动条宽度补偿（web PhotoDetailModal 同款，防布局跳动）
    const { body, documentElement } = document
    const previousOverflow = body.style.overflow
    const previousPaddingRight = body.style.paddingRight
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      body.style.overflow = previousOverflow
      body.style.paddingRight = previousPaddingRight
    }
  }, [goNext, goPrev, isOpen, onClose])

  // 缩略图条滚动到当前照片（web 同款 block:'nearest' + inline:'center'）
  useEffect(() => {
    if (!isOpen || !thumbnails) return
    const container = thumbnailsScrollRef.current
    if (!container || index === null) return
    const activeElement = container.children[index] as HTMLElement | undefined
    activeElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [index, isOpen, thumbnails])

  if (!isOpen || index === null) {
    return null
  }

  const photo = photos[index]
  const canNavigate = Boolean(onNavigate) && photos.length > 1
  let displayUrl = ''
  try {
    displayUrl = resolver.photoDisplay(photo)
  } catch {
    return null
  }
  const exifParts = formatExif(photo)
  const dateLabel = photo.takenAt
    ? new Date(photo.takenAt).toLocaleDateString()
    : new Date(photo.createdAt).toLocaleDateString()

  return (
    <div
      className="group fixed inset-0 z-50 flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {/* 顶部：关闭（左）+ 计数胶囊（右），桌面端 hover 浮现 */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4 md:p-6">
        <button
          type="button"
          onClick={onClose}
          aria-label={labels.lightboxClose}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white/80 transition-all duration-200 hover:border-white/20 hover:bg-black/85 hover:text-white md:h-11 md:w-11 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
        {canNavigate ? (
          <div className="rounded-full border border-white/10 bg-black/70 px-4 py-2 font-mono text-xs text-white/80">
            <span className="text-white">{index + 1}</span>
            <span className="mx-1 text-white/50">/</span>
            <span className="text-white/50">{photos.length}</span>
          </div>
        ) : null}
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 md:px-16 lg:px-24">
        {canNavigate ? (
          <button
            type="button"
            onClick={goPrev}
            aria-label={labels.lightboxPrev}
            className="absolute left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white/70 transition-all duration-200 hover:border-white/20 hover:bg-black/85 hover:text-white md:left-6 md:h-14 md:w-14 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={displayUrl}
          alt={photo.title ?? ''}
          className="max-h-full max-w-full select-none object-contain"
        />

        {canNavigate ? (
          <button
            type="button"
            onClick={goNext}
            aria-label={labels.lightboxNext}
            className="absolute right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white/70 transition-all duration-200 hover:border-white/20 hover:bg-black/85 hover:text-white md:right-6 md:h-14 md:w-14 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* 底部：标题/EXIF + 缩略图条 */}
      <div className="shrink-0 bg-black/80 border-t border-white/5">
        <div className="px-4 pt-3 text-center text-white/70">
          {photo.title ? <p className="mb-1 font-serif text-base text-white">{photo.title}</p> : null}
          {exifParts.length > 0 || dateLabel ? (
            <p className="font-mono text-[11px] uppercase tracking-widest">
              {[dateLabel, ...exifParts].filter(Boolean).join(' · ')}
            </p>
          ) : null}
        </div>
        {thumbnails && canNavigate ? (
          <div
            ref={thumbnailsScrollRef}
            className="flex h-24 items-center gap-2 overflow-x-auto p-3 custom-scrollbar scroll-smooth"
          >
            {photos.map((thumb, thumbIndex) => {
              let thumbUrl = ''
              try {
                thumbUrl = resolver.photoThumbnail(thumb)
              } catch {
                thumbUrl = ''
              }
              const active = thumbIndex === index
              return (
                <button
                  key={thumb.id}
                  type="button"
                  onClick={() => onNavigate?.(thumbIndex)}
                  aria-label={`${thumbIndex + 1} / ${photos.length}`}
                  aria-current={active ? 'true' : undefined}
                  className={`relative aspect-square h-full shrink-0 overflow-hidden transition-all duration-300 ${
                    active
                      ? 'scale-95 opacity-100 ring-2 ring-white/80'
                      : 'opacity-40 hover:scale-105 hover:opacity-90'
                  }`}
                >
                  {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbUrl} alt={thumb.title ?? ''} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-white/5 font-mono text-xs text-white/40">
                      {thumbIndex + 1}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
})
