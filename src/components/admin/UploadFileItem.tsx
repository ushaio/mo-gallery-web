import React, { useState, useRef, useEffect } from 'react'
import { ImageIcon, Maximize2, Check, X, Loader2 } from 'lucide-react'
import { formatFileSize } from '@/lib/utils'

export const UploadFileItem = React.memo(function UploadFileItem({ 
  file, 
  id,
  onRemove, 
  uploading, 
  isUploaded, 
  isCurrent,
  viewMode,
  selected,
  onSelect,
  onPreview,
  t
}: { 
  file: File, 
  id: string,
  onRemove: (id: string) => void,
  uploading: boolean,
  isUploaded: boolean,
  isCurrent: boolean,
  viewMode: 'list' | 'grid',
  selected: boolean,
  onSelect: (id: string) => void,
  onPreview: (id: string) => void,
  t: (key: string) => string
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isVisible) return
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } }, { rootMargin: '200px' })
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [viewMode, isVisible])

  useEffect(() => {
    if (!isVisible || previewUrl) return
    const originalUrl = URL.createObjectURL(file); const img = new Image(); img.src = originalUrl
    img.onload = () => {
      const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); const maxSize = 120
      let width = img.width; let height = img.height
      if (width > height) { if (width > maxSize) { height *= maxSize / width; width = maxSize; } } else { if (height > maxSize) { width *= maxSize / height; height = maxSize; } }
      canvas.width = width; canvas.height = height; ctx?.drawImage(img, 0, 0, width, height)
      const thumbUrl = canvas.toDataURL('image/webp', 0.8); setPreviewUrl(thumbUrl); URL.revokeObjectURL(originalUrl)
    }
    img.onerror = () => URL.revokeObjectURL(originalUrl)
  }, [isVisible, file, previewUrl])

  if (viewMode === 'grid') {
    return (
      <div ref={containerRef} className={`relative aspect-square border border-border transition-all group overflow-hidden ${isCurrent ? 'ring-2 ring-primary' : ''} ${selected ? 'border-primary bg-primary/5' : 'bg-background'}`}>
        {previewUrl ? <img src={previewUrl} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105 cursor-pointer" onClick={() => onPreview(id)} /> : <div className="w-full h-full flex items-center justify-center bg-muted"><ImageIcon className="w-6 h-6 text-muted-foreground/20" /></div>}
        <button onClick={() => onPreview(id)} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-2 bg-background/50 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity z-10"><Maximize2 className="w-4 h-4 text-foreground" /></button>
        <div className={`absolute top-2 left-2 z-20 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}><input type="checkbox" checked={selected} onChange={() => onSelect(id)} disabled={uploading} className="w-4 h-4 accent-primary cursor-pointer border-border bg-background" /></div>
        {isUploaded && <div className="absolute inset-0 bg-primary/20 backdrop-blur-[1px] flex items-center justify-center z-20"><Check className="w-8 h-8 text-primary drop-shadow-md" /></div>}
        {isCurrent && <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] flex items-center justify-center z-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}
        {!uploading && !isUploaded && <button onClick={() => onRemove(id)} className="absolute top-2 right-2 p-1.5 bg-background/80 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all z-20"><X className="w-3 h-3" /></button>}
        <div className="absolute bottom-0 left-0 w-full p-2 bg-background/90 text-[8px] font-mono truncate opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-tighter pointer-events-none">{formatFileSize(file.size)}</div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`flex items-center gap-4 p-3 border border-border mb-2 transition-colors ${isCurrent ? 'bg-primary/5 border-primary/30' : 'bg-background hover:bg-muted/30'} ${selected ? 'border-primary/50 bg-primary/5' : ''}`}>
      <div className="flex items-center"><input type="checkbox" checked={selected} onChange={() => onSelect(id)} disabled={uploading} className="w-4 h-4 accent-primary cursor-pointer" /></div>
      <div className="w-12 h-12 flex-shrink-0 bg-muted overflow-hidden border border-border relative group cursor-pointer" onClick={() => onPreview(id)}>
        {previewUrl ? <img src={previewUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-4 h-4 text-muted-foreground/20" /></div>}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><Maximize2 className="w-3 h-3 text-white" /></div>
      </div>
      <div className="flex-1 min-w-0"><p className="text-xs font-bold uppercase tracking-wider truncate mb-0.5 text-foreground">{file.name}</p><p className="text-[10px] font-mono text-muted-foreground">{formatFileSize(file.size)}</p></div>
      <div className="flex items-center gap-3">
        {isUploaded ? <div className="flex items-center gap-1 text-primary"><Check className="w-4 h-4" /><span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">Done</span></div> : isCurrent ? <div className="flex items-center gap-2 text-primary"><Loader2 className="w-3 h-3 animate-spin" /><span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline animate-pulse">Processing</span></div> : uploading ? <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-50">Waiting</span> : <button onClick={() => onRemove(id)} className="p-2 text-muted-foreground hover:text-destructive transition-colors"><X className="w-4 h-4" /></button>}
      </div>
    </div>
  )
})
