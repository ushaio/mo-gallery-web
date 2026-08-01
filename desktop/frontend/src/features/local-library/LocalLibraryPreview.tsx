import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Maximize2, Minimize2, X, ZoomIn, ZoomOut } from 'lucide-react'
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

export function LocalLibraryPreview({ asset, copy, onClose, onOpenSystem, onPrevious, onNext, hasPrevious = false, hasNext = false }: Props) {
  const [original, setOriginal] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragStartRef = useRef<{ x: number, y: number, offsetX: number, offsetY: number } | null>(null)
  const previewPending = asset.previewStatus === 'pending' || asset.previewStatus === 'generating'
  const canPreview = asset.previewStatus === 'ready' || asset.mimeType === 'image/gif'

  useEffect(() => {
    setOffset({ x: 0, y: 0 })
    setZoom(1)
  }, [asset.id])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft' && hasPrevious) onPrevious?.()
      if (event.key === 'ArrowRight' && hasNext) onNext?.()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [hasNext, hasPrevious, onClose, onNext, onPrevious])

  const src = original ? asset.originalUrl : asset.previewUrl
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true" aria-label={copy.preview}>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="min-w-0"><div className="truncate text-sm font-medium">{asset.displayTitle || asset.fileName}</div><div className="truncate text-[10px] text-white/50">{asset.relativePath}</div></div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setOriginal((value) => !value)} className="flex items-center gap-2 rounded-md px-3 py-2 text-xs hover:bg-white/10">{original ? <Minimize2 size={14} /> : <Maximize2 size={14} />}{original ? copy.fitted : copy.original}</button>
          <button type="button" onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))} className="rounded-md p-2 hover:bg-white/10"><ZoomOut size={17} /></button>
          <span className="w-12 text-center text-[10px] text-white/60">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(5, value + 0.25))} className="rounded-md p-2 hover:bg-white/10"><ZoomIn size={17} /></button>
          <button type="button" onClick={() => onOpenSystem(asset)} className="rounded-md p-2 hover:bg-white/10" title={copy.openSystem}><ExternalLink size={17} /></button>
          <button type="button" onClick={onClose} className="rounded-md p-2 hover:bg-white/10"><X size={19} /></button>
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-5" onPointerMove={(event) => {
        const start = dragStartRef.current
        if (!start) return
        setOffset({ x: start.offsetX + event.clientX - start.x, y: start.offsetY + event.clientY - start.y })
      }} onPointerUp={() => { dragStartRef.current = null }} onPointerCancel={() => { dragStartRef.current = null }}>
        {hasPrevious && <button type="button" aria-label="上一张" onClick={onPrevious} className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 hover:bg-white/20"><ChevronLeft size={22} /></button>}
        {canPreview ? (
          <img src={src} alt="" draggable={false} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragStartRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y } }} className="max-w-none select-none object-contain touch-none" style={{ width: original ? 'auto' : `${zoom * 100}%`, maxHeight: original ? 'none' : `${zoom * 100}%`, transform: `translate(${offset.x}px, ${offset.y}px)`, cursor: zoom > 1 || original ? 'grab' : 'default' }} />
        ) : previewPending ? (
          <div className="flex items-center gap-2 text-sm text-white/60"><Loader2 size={18} className="animate-spin" />{copy.generatingPreview}</div>
        ) : (
          <div className="max-w-md text-center text-sm text-white/60"><p>{copy.unavailablePreview}</p><p className="mt-2 text-xs">{asset.format.startsWith('r') || ['cr2','cr3','nef','arw','dng','raf'].includes(asset.format) ? copy.rawHint : ''}</p></div>
        )}
        {hasNext && <button type="button" aria-label="下一张" onClick={onNext} className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 hover:bg-white/20"><ChevronRight size={22} /></button>}
      </div>
    </div>
  )
}
