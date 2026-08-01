import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { resolveAssetUrl } from '@/lib/api'
import type { Photo } from '@/types'

interface Props {
  photo: Photo
  t: (key: string) => string
  onClose: () => void
  onPrevious?: () => void
  onNext?: () => void
  hasPrevious?: boolean
  hasNext?: boolean
}

export function PhotoPreviewOverlay({
  photo, t, onClose, onPrevious, onNext, hasPrevious = false, hasNext = false,
}: Props) {
  const [original, setOriginal] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragStartRef = useRef<{ x: number, y: number, offsetX: number, offsetY: number } | null>(null)

  useEffect(() => {
    setOffset({ x: 0, y: 0 })
    setZoom(1)
  }, [photo.id])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft' && hasPrevious) onPrevious?.()
      if (event.key === 'ArrowRight' && hasNext) onNext?.()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [hasNext, hasPrevious, onClose, onNext, onPrevious])

  const src = original ? resolveAssetUrl(photo.url) : resolveAssetUrl(photo.thumbnailUrl || photo.url)
  const subParts = [
    photo.category || '',
    photo.photoType === 'film' ? t('admin.upload_type_film') : t('admin.upload_type_digital'),
    photo.takenAt ? new Date(photo.takenAt).toLocaleDateString('zh-CN') : '',
  ].filter(Boolean)

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true" aria-label={t('admin.preview_fit')}>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{photo.title || t('admin.untitled_photo')}</div>
          <div className="truncate text-[10px] text-white/50">
            {subParts.join(' · ') || photo.id}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOriginal((value) => !value)}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-xs hover:bg-white/10"
          >
            {original ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {original ? t('admin.preview_fit') : t('admin.view_original')}
          </button>
          <button type="button" onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))} className="rounded-md p-2 hover:bg-white/10" aria-label={t('admin.zine_zoom_out')}>
            <ZoomOut size={17} />
          </button>
          <span className="w-12 text-center text-[10px] text-white/60">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(5, value + 0.25))} className="rounded-md p-2 hover:bg-white/10" aria-label={t('admin.zine_zoom_in')}>
            <ZoomIn size={17} />
          </button>
          <button type="button" onClick={onClose} className="rounded-md p-2 hover:bg-white/10" aria-label={t('common.cancel')}>
            <X size={19} />
          </button>
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
        {hasPrevious && (
          <button type="button" aria-label={t('story.detail_previous_photo')} onClick={onPrevious} className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 hover:bg-white/20">
            <ChevronLeft size={22} />
          </button>
        )}
        <img
          src={src}
          alt={photo.title || ''}
          draggable={false}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            dragStartRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y }
          }}
          className="max-w-none select-none object-contain touch-none"
          style={{
            width: original ? 'auto' : `${zoom * 100}%`,
            maxHeight: original ? 'none' : `${zoom * 100}%`,
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            cursor: zoom > 1 || original ? 'grab' : 'default',
          }}
        />
        {hasNext && (
          <button type="button" aria-label={t('story.detail_next_photo')} onClick={onNext} className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 hover:bg-white/20">
            <ChevronRight size={22} />
          </button>
        )}
      </div>
    </div>
  )
}
