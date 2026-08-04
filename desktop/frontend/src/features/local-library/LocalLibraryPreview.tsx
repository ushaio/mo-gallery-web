import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, FileText, Loader2, Maximize2, Minimize2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { isPhotoAsset } from './types'
import type { LocalAsset } from './types'  
import type { LocalLibraryCopy } from './copy'

interface Props {
  asset: LocalAsset
  copy: LocalLibraryCopy
  onClose: () => void
  onOpenSystem: (asset: LocalAsset) => void
  onPrevious?: () => void
  onNext?: () => void
  hasPrevious?: boolean
  hasNext?: boolean
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

export function LocalLibraryPreview({ asset, copy, onClose, onOpenSystem, onPrevious, onNext, hasPrevious = false, hasNext = false }: Props) {
  const [original, setOriginal] = useState(false)
  const [fitToWindow, setFitToWindow] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [originalFailed, setOriginalFailed] = useState(false)
  const [originalLoading, setOriginalLoading] = useState(false)
  const [originalRetry, setOriginalRetry] = useState(0)
  const [previewFailed, setPreviewFailed] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dragStartRef = useRef<{ x: number, y: number, offsetX: number, offsetY: number } | null>(null)
  const previewPending = asset.previewStatus === 'pending' || asset.previewStatus === 'generating'
  const canPreview = (asset.previewStatus === 'ready' || asset.mimeType === 'image/gif') && !previewFailed
  const setZoomLevel = (value: number) => setZoom(Math.min(5, Math.max(0.25, value)))
  const toggleOriginal = () => {
    const nextOriginal = originalFailed || !original
    setOriginal(nextOriginal)
    setFitToWindow(!nextOriginal)
    setOriginalFailed(false)
    setOriginalLoading(nextOriginal)
    setOffset({ x: 0, y: 0 })
    setZoom(1)
  }
  const showOriginalAtActualPixels = () => {
    if (!original || originalFailed) setOriginalLoading(true)
    setOriginal(true)
    setFitToWindow(false)
    setOriginalFailed(false)
    setOffset({ x: 0, y: 0 })
    setZoom(1)
  }
  const fitCurrentImage = () => {
    setFitToWindow(true)
    setOffset({ x: 0, y: 0 })
    setZoom(1)
  }

  useEffect(() => {
    setOffset({ x: 0, y: 0 })
    setZoom(1)
    setOriginal(false)
    setFitToWindow(true)
    setOriginalFailed(false)
    setOriginalLoading(false)
    setOriginalRetry(0)
    setPreviewFailed(false)
  }, [asset.id])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft' && hasPrevious) onPrevious?.()
      if (event.key === 'ArrowRight' && hasNext) onNext?.()
      if (event.key === '+' || event.key === '=') setZoom((value) => Math.min(5, value + 0.25))
      if (event.key === '-') setZoom((value) => Math.max(0.25, value - 0.25))
      if (event.key === '0') { setZoom(1); setOffset({ x: 0, y: 0 }) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [hasNext, hasPrevious, onClose, onNext, onPrevious])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus()
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleTab)
    return () => {
      document.removeEventListener('keydown', handleTab)
      previousFocus?.focus()
    }
  }, [])

  const showingOriginal = original && !originalFailed
  const normalizedFormat = asset.format.toLowerCase()
  const isPhoto = isPhotoAsset(asset)
  const isRawAsset = ['cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'rw2'].includes(normalizedFormat)
  const originalCapabilityUnverified = ['avif', 'heic', 'heif', 'tif', 'tiff'].includes(normalizedFormat)
  const shouldRenderImage = showingOriginal || canPreview
  const fitImage = !showingOriginal || fitToWindow
  const originalSrc = `${asset.originalUrl}${asset.originalUrl.includes('?') ? '&' : '?'}retry=${originalRetry}`
  const src = showingOriginal ? originalSrc : asset.previewUrl
  return (
    <div ref={dialogRef} className="fixed inset-0 z-[70] flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true" aria-label={copy.preview}>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="min-w-0"><div className="truncate text-sm font-medium">{asset.displayTitle || asset.fileName}</div><div className="truncate text-[10px] text-white/50">{asset.relativePath}</div></div>
        <div className="flex items-center gap-1">
          {isPhoto && (<>
          <button type="button" onClick={toggleOriginal} className="flex items-center gap-2 rounded-md px-3 py-2 text-xs hover:bg-white/10" aria-label={showingOriginal ? copy.screenPreview : copy.original}>{showingOriginal ? <Minimize2 size={14} /> : <Maximize2 size={14} />}{showingOriginal ? copy.screenPreview : copy.original}</button>
          {showingOriginal && isRawAsset && <span className="rounded border border-amber-200/20 bg-amber-200/10 px-2 py-1 text-[10px] text-amber-100">{copy.rawEmbeddedPreview}</span>}
          {showingOriginal && originalCapabilityUnverified && <span className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[10px] text-white/65">{copy.unverifiedCapability}</span>}
          <button type="button" onClick={fitCurrentImage} className="flex items-center gap-1 rounded-md px-2 py-2 text-[10px] hover:bg-white/10" style={{ backgroundColor: fitImage ? 'rgb(255 255 255 / 0.1)' : undefined }} aria-label={copy.fitted}><Minimize2 size={14} />{copy.fitted}</button>
          <button type="button" onClick={showOriginalAtActualPixels} className="rounded-md px-2 py-2 text-[10px] hover:bg-white/10" style={{ backgroundColor: showingOriginal && !fitToWindow && zoom === 1 ? 'rgb(255 255 255 / 0.1)' : undefined }} aria-label={copy.actualPixels}>{copy.actualPixels}</button>
          <button type="button" onClick={() => setZoomLevel(zoom - 0.25)} className="rounded-md p-2 hover:bg-white/10" aria-label={copy.zoomOut}><ZoomOut size={17} /></button>
          <button type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }) }} className="w-14 rounded-md px-1 text-center text-[10px] text-white/60 hover:bg-white/10" aria-label={copy.resetZoom}>{fitImage && zoom === 1 ? copy.fitted : `${Math.round(zoom * 100)}%`}</button>
          <button type="button" onClick={() => setZoomLevel(zoom + 0.25)} className="rounded-md p-2 hover:bg-white/10" aria-label={copy.zoomIn}><ZoomIn size={17} /></button>
          </>)}
          <button type="button" onClick={() => onOpenSystem(asset)} className="rounded-md p-2 hover:bg-white/10" title={copy.openSystem} aria-label={copy.openSystem}><ExternalLink size={17} /></button>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="rounded-md p-2 hover:bg-white/10" aria-label={copy.close}><X size={19} /></button>
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-5" onWheel={(event) => {
        event.preventDefault()
        setZoomLevel(zoom + (event.deltaY < 0 ? 0.15 : -0.15))
      }} onPointerMove={(event) => {
        const start = dragStartRef.current
        if (!start) return
        setOffset({ x: start.offsetX + event.clientX - start.x, y: start.offsetY + event.clientY - start.y })
      }} onPointerUp={() => { dragStartRef.current = null }} onPointerCancel={() => { dragStartRef.current = null }}>
        {hasPrevious && <button type="button" aria-label={copy.previous} onClick={onPrevious} className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 hover:bg-white/20"><ChevronLeft size={22} /></button>}
        {!isPhoto ? (
          <div className="flex max-w-md flex-col items-center gap-3 text-center text-white/70">
            <FileText size={54} strokeWidth={1.2} className="opacity-80" />
            <div className="text-sm font-medium uppercase tracking-widest">{asset.format}</div>
            <div className="break-all text-xs text-white/50">{asset.displayTitle || asset.fileName}</div>
            <div className="text-xs text-white/50">{formatBytes(asset.byteSize)}</div>
            <button type="button" onClick={() => onOpenSystem(asset)} className="mt-2 flex items-center gap-2 rounded-md border border-white/20 px-4 py-2 text-xs hover:bg-white/10"><ExternalLink size={14} />{copy.openSystem}</button>
          </div>
        ) : shouldRenderImage ? (
          <img src={src} alt="" draggable={false} onLoad={() => { if (showingOriginal) setOriginalLoading(false) }} onError={() => {
            if (showingOriginal) {
              setOriginalLoading(false)
              setOriginalFailed(true)
              setZoom(1)
              setOffset({ x: 0, y: 0 })
            } else {
              setPreviewFailed(true)
            }
          }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragStartRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y } }} className="max-w-none select-none object-contain touch-none" style={{ width: fitImage ? `${zoom * 100}%` : 'auto', maxHeight: fitImage ? `${zoom * 100}%` : 'none', transform: `translate(${offset.x}px, ${offset.y}px) scale(${fitImage ? 1 : zoom})`, cursor: zoom > 1 || !fitImage ? 'grab' : 'default' }} />
        ) : previewPending ? (
          <div className="flex items-center gap-2 text-sm text-white/60"><Loader2 size={18} className="animate-spin" />{copy.generatingPreview}</div>
        ) : (
          <div className="max-w-md text-center text-sm text-white/60"><p>{copy.unavailablePreview}</p><p className="mt-2 text-xs">{asset.format.startsWith('r') || ['cr2','cr3','nef','arw','dng','raf','rw2'].includes(asset.format) ? copy.rawHint : ''}</p></div>
        )}
        {originalLoading && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/15"><div className="flex items-center gap-2 rounded-md bg-black/70 px-3 py-2 text-xs text-white/70"><Loader2 size={15} className="animate-spin" />{copy.loadingOriginal}</div></div>}
        {originalFailed && <div role="alert" className="absolute bottom-5 left-1/2 flex max-w-lg -translate-x-1/2 items-center gap-3 rounded-md border border-amber-300/25 bg-black/75 px-4 py-2 text-xs text-amber-100 backdrop-blur"><span>{copy.originalUnavailable} {copy.previewFailureReason}: {copy.originalFailureReason}</span><button type="button" onClick={() => { setOriginalFailed(false); setOriginalLoading(true); setOriginal(true); setFitToWindow(false); setOriginalRetry((value) => value + 1) }} className="shrink-0 rounded border border-amber-100/30 px-2 py-1 hover:bg-white/10">{copy.retry}</button></div>}
        {hasNext && <button type="button" aria-label={copy.next} onClick={onNext} className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 hover:bg-white/20"><ChevronRight size={22} /></button>}
      </div>
    </div>
  )
}
