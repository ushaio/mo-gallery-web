'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { resolveAssetUrl } from '@/lib/api'
import type { PhotoDto } from '@/lib/api/types'

interface PhotoPreviewOverlayProps {
  photo: PhotoDto
  cdnDomain?: string
  t: (key: string) => string
  onClose: () => void
  onPrevious?: () => void
  onNext?: () => void
  hasPrevious?: boolean
  hasNext?: boolean
}

export function PhotoPreviewOverlay({
  photo,
  cdnDomain,
  t,
  onClose,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
}: PhotoPreviewOverlayProps) {
  const [showOriginal, setShowOriginal] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft' && hasPrevious) onPrevious?.()
      if (event.key === 'ArrowRight' && hasNext) onNext?.()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasNext, hasPrevious, onClose, onNext, onPrevious])

  const source = resolveAssetUrl(showOriginal ? photo.url : photo.thumbnailUrl || photo.url, cdnDomain)
  const meta = [
    photo.category,
    photo.photoType === 'film' ? t('admin.upload_type_film') : t('admin.upload_type_digital'),
    photo.takenAt ? new Date(photo.takenAt).toLocaleDateString() : '',
  ].filter(Boolean)

  return (
    <div className="fixed inset-0 z-[140] flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true" aria-label={photo.title || t('admin.resource_library_untitled_photo')}>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{photo.title || t('admin.resource_library_untitled_photo')}</p>
          <p className="truncate text-[10px] text-white/50">{meta.join(' · ') || photo.id}</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => { setShowOriginal((value) => !value); setLoading(true); setFailed(false) }} className="flex h-9 items-center gap-2 rounded-md px-3 text-xs hover:bg-white/10">
            {showOriginal ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {showOriginal ? t('admin.preview_fit') : t('admin.view_original')}
          </button>
          <button type="button" onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))} className="flex size-9 items-center justify-center rounded-md hover:bg-white/10" aria-label={t('admin.zine_zoom_out')}><ZoomOut size={17} /></button>
          <span className="w-12 text-center text-[10px] text-white/60">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(5, value + 0.25))} className="flex size-9 items-center justify-center rounded-md hover:bg-white/10" aria-label={t('admin.zine_zoom_in')}><ZoomIn size={17} /></button>
          <button type="button" onClick={onClose} className="flex size-9 items-center justify-center rounded-md hover:bg-white/10" aria-label={t('common.close')}><X size={19} /></button>
        </div>
      </header>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-5"
        onPointerMove={(event) => {
          const start = dragStartRef.current
          if (!start) return
          setOffset({ x: start.offsetX + event.clientX - start.x, y: start.offsetY + event.clientY - start.y })
        }}
        onPointerUp={() => { dragStartRef.current = null }}
        onPointerCancel={() => { dragStartRef.current = null }}
      >
        {hasPrevious && <button type="button" onClick={onPrevious} className="absolute left-4 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label={t('story.detail_previous_photo')}><ChevronLeft size={22} /></button>}

        {loading && !failed && <div className="absolute inset-0 flex items-center justify-center text-xs text-white/60">{t('common.loading')}</div>}
        {failed ? (
          <div className="text-sm text-white/60">{t('common.error')}</div>
        ) : (
          <img
            key={source}
            src={source}
            alt={photo.title || ''}
            draggable={false}
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setFailed(true) }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              dragStartRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y }
            }}
            className={`max-w-none select-none object-contain touch-none transition-opacity ${loading ? 'opacity-0' : 'opacity-100'}`}
            style={{
              width: showOriginal ? 'auto' : `${zoom * 100}%`,
              maxHeight: showOriginal ? 'none' : `${zoom * 100}%`,
              transform: `translate(${offset.x}px, ${offset.y}px)`,
              cursor: zoom > 1 || showOriginal ? 'grab' : 'default',
            }}
          />
        )}

        {hasNext && <button type="button" onClick={onNext} className="absolute right-4 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label={t('story.detail_next_photo')}><ChevronRight size={22} /></button>}
      </div>
    </div>
  )
}
