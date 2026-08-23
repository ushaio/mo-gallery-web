import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Maximize2, Minimize2, Square, X, ZoomIn, ZoomOut } from 'lucide-react'
import { LivePhotoIcon } from '@/components/icons/LivePhotoIcon'

export interface PhotoPreviewFrameCopy {
  viewOriginal: string
  fitWindow: string
  zoomOut: string
  resetZoom: string
  zoomIn: string
  close: string
  previous: string
  next: string
  loading: string
  originalUnavailable?: string
  retry?: string
  openSystem?: string
}

interface Props {
  title: string
  subtitle?: string
  originalSrc?: string
  previewSrc?: string
  livePhotoVideoSrc?: string
  alt?: string
  copy: PhotoPreviewFrameCopy
  onClose: () => void
  onOpenSystem?: () => void
  onPrevious?: () => void
  onNext?: () => void
  hasPrevious?: boolean
  hasNext?: boolean
  fallback?: ReactNode
}

export function PhotoPreviewFrame({
  title,
  subtitle,
  originalSrc,
  previewSrc,
  livePhotoVideoSrc,
  alt = '',
  copy,
  onClose,
  onOpenSystem,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  fallback,
}: Props) {
  const [showOriginal, setShowOriginal] = useState(Boolean(originalSrc))
  const [originalFailed, setOriginalFailed] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const [loading, setLoading] = useState(Boolean(originalSrc || previewSrc))
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [showLiveVideo, setShowLiveVideo] = useState(false)
  const [liveVideoEnded, setLiveVideoEnded] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dragStartRef = useRef<{ x: number, y: number, offsetX: number, offsetY: number } | null>(null)

  useEffect(() => {
    document.body.classList.add('mo-fullscreen-preview')
    return () => document.body.classList.remove('mo-fullscreen-preview')
  }, [])

  useEffect(() => {
    setShowOriginal(Boolean(originalSrc))
    setOriginalFailed(false)
    setImageFailed(false)
    setLoading(Boolean(originalSrc || previewSrc))
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setLiveVideoEnded(false)
    setShowLiveVideo(Boolean(livePhotoVideoSrc))
  }, [originalSrc, previewSrc, livePhotoVideoSrc])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus()
    return () => previousFocus?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          event.preventDefault()
          onClose()
          break
        case 'ArrowLeft':
          if (onPrevious && hasPrevious) { event.preventDefault(); onPrevious() }
          break
        case 'ArrowRight':
          if (onNext && hasNext) { event.preventDefault(); onNext() }
          break
        case ' ':
          if (livePhotoVideoSrc) {
            event.preventDefault()
            setLiveVideoEnded(false)
            setShowLiveVideo((value) => !value)
          }
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, onPrevious, onNext, hasPrevious, hasNext, livePhotoVideoSrc])

  const setZoomLevel = (value: number) => setZoom(Math.min(5, Math.max(0.25, value)))
  const activeSrc = showOriginal && !originalFailed ? originalSrc : previewSrc
  const hasImage = Boolean(activeSrc)

  const resetView = () => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }

  const toggleSource = () => {
    const nextOriginal = !showOriginal || originalFailed
    setShowOriginal(nextOriginal)
    setOriginalFailed(false)
    setImageFailed(false)
    setLoading(nextOriginal ? Boolean(originalSrc) : Boolean(previewSrc))
    resetView()
  }

  const retryOriginal = () => {
    setShowOriginal(true)
    setOriginalFailed(false)
    setImageFailed(false)
    setLoading(true)
    resetView()
  }

  return (
    <div ref={dialogRef} className="fixed inset-0 z-[70] flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true" aria-label={title}>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{title}</div>
          {subtitle && <div className="truncate text-[10px] text-white/50">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-1">
          {hasImage && (
            <>
              {livePhotoVideoSrc && (
                <button type="button" onClick={() => { setLiveVideoEnded(false); setShowLiveVideo((value) => !value) }} className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs hover:bg-white/10 ${showLiveVideo && !liveVideoEnded ? 'text-emerald-300' : 'text-white/70'}`} aria-label="Toggle Live Photo video">
                  {showLiveVideo && !liveVideoEnded ? <Square size={14} /> : <LivePhotoIcon size={15} />}
                  Live
                </button>
              )}
              <button type="button" onClick={toggleSource} className="flex items-center gap-2 rounded-md px-3 py-2 text-xs hover:bg-white/10" aria-label={showOriginal && !originalFailed ? copy.fitWindow : copy.viewOriginal}>
                {showOriginal && !originalFailed ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                {showOriginal && !originalFailed ? copy.fitWindow : copy.viewOriginal}
              </button>
              <button type="button" onClick={() => setZoomLevel(zoom - 0.25)} className="rounded-md p-2 hover:bg-white/10" aria-label={copy.zoomOut}><ZoomOut size={17} /></button>
              <button type="button" onClick={resetView} className="w-12 rounded-md px-1 text-center text-[10px] text-white/60 hover:bg-white/10" aria-label={copy.resetZoom}>{Math.round(zoom * 100)}%</button>
              <button type="button" onClick={() => setZoomLevel(zoom + 0.25)} className="rounded-md p-2 hover:bg-white/10" aria-label={copy.zoomIn}><ZoomIn size={17} /></button>
            </>
          )}
          {onOpenSystem && copy.openSystem && <button type="button" onClick={onOpenSystem} className="rounded-md p-2 hover:bg-white/10" title={copy.openSystem} aria-label={copy.openSystem}><ExternalLink size={17} /></button>}
          <button ref={closeButtonRef} type="button" onClick={onClose} className="rounded-md p-2 hover:bg-white/10" aria-label={copy.close}><X size={19} /></button>
        </div>
      </header>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-5"
        onWheel={(event) => {
          if (!hasImage || !event.ctrlKey) return
          event.preventDefault()
          setZoomLevel(zoom + (event.deltaY < 0 ? 0.15 : -0.15))
        }}
        onPointerMove={(event) => {
          const start = dragStartRef.current
          if (!start) return
          setOffset({ x: start.offsetX + event.clientX - start.x, y: start.offsetY + event.clientY - start.y })
        }}
        onPointerUp={() => { dragStartRef.current = null }}
        onPointerCancel={() => { dragStartRef.current = null }}
      >
        {hasPrevious && <button type="button" aria-label={copy.previous} onClick={onPrevious} className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 hover:bg-white/20"><ChevronLeft size={22} /></button>}
        {imageFailed || !activeSrc ? (
          fallback ?? <div className="text-sm text-white/60">{copy.originalUnavailable || copy.loading}</div>
        ) : (
          <>
            <img
              key={activeSrc}
              src={activeSrc}
              alt={alt}
              draggable={false}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false)
                if (showOriginal && previewSrc && previewSrc !== originalSrc) setOriginalFailed(true)
                else setImageFailed(true)
              }}
              onPointerDown={(event) => {
                if (zoom <= 1) return
                event.currentTarget.setPointerCapture(event.pointerId)
                dragStartRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y }
              }}
              className={`select-none object-contain touch-none transition-opacity ${loading ? 'opacity-0' : 'opacity-100'}`}
              style={{ width: 'auto', height: '100%', maxWidth: '100%', maxHeight: '100%', transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: 'center center', cursor: zoom > 1 ? 'grab' : 'default' }}
            />
            {livePhotoVideoSrc && showLiveVideo && !liveVideoEnded && (
              <video
                src={livePhotoVideoSrc}
                autoPlay
                playsInline
                onEnded={() => { setLiveVideoEnded(true); setShowLiveVideo(false) }}
                className="pointer-events-none absolute inset-0 m-auto h-full max-h-full max-w-full object-contain"
              />
            )}
          </>
        )}
        {loading && hasImage && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-white/60"><div className="flex items-center gap-2 rounded-md bg-black/60 px-3 py-2"><Loader2 size={15} className="animate-spin" />{copy.loading}</div></div>}
        {originalFailed && copy.originalUnavailable && <div role="alert" className="absolute bottom-5 left-1/2 flex max-w-lg -translate-x-1/2 items-center gap-3 rounded-md border border-amber-300/25 bg-black/75 px-4 py-2 text-xs text-amber-100 backdrop-blur"><span>{copy.originalUnavailable}</span>{copy.retry && <button type="button" onClick={retryOriginal} className="shrink-0 rounded border border-amber-100/30 px-2 py-1 hover:bg-white/10">{copy.retry}</button>}</div>}
        {hasNext && <button type="button" aria-label={copy.next} onClick={onNext} className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 hover:bg-white/20"><ChevronRight size={22} /></button>}
      </div>
    </div>
  )
}
