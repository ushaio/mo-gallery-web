import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  ArrowDown, ArrowLeft, ArrowUp, Copy, Download, ImagePlus, Loader2, Minus,
  Plus, Redo2, Save, Square, Trash2, Type, Undo2, Upload, ZoomIn, ZoomOut,
  Share2,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { exportCanvasProject } from '@/lib/design-canvas/export'
import { shareCanvasTemplate } from '@/lib/design-canvas/share'
import type { CanvasElement, CanvasImageElement } from '@/lib/design-canvas/types'
import { t } from '@/lib/i18n'
import { useDesignCanvasStore } from '@/store/design-canvas'
import { usePreferences } from '@/store/preferences'

const BACKGROUNDS = ['#FFFFFF', '#F5F2EA', '#D8DEE0', '#C8D2C4', '#D9C9C2', '#171717']

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

interface ElementViewProps {
  element: CanvasElement
  imageUrl?: string
  selected: boolean
  scale: number
}

function ElementView({ element, imageUrl, selected, scale }: ElementViewProps) {
  const selectElement = useDesignCanvasStore((state) => state.selectElement)
  const checkpoint = useDesignCanvasStore((state) => state.checkpoint)
  const updateElement = useDesignCanvasStore((state) => state.updateElement)
  const project = useDesignCanvasStore((state) => state.project)

  function beginInteraction(event: ReactPointerEvent<HTMLDivElement>, mode: 'move' | 'resize') {
    event.preventDefault()
    event.stopPropagation()
    selectElement(element.id)
    checkpoint()
    const startX = event.clientX
    const startY = event.clientY
    const initial = { x: element.x, y: element.y, width: element.width, height: element.height }
    const pointerId = event.pointerId
    event.currentTarget.setPointerCapture(pointerId)

    const handleMove = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId || !project) return
      const dx = (pointerEvent.clientX - startX) / scale
      const dy = (pointerEvent.clientY - startY) / scale
      if (mode === 'move') {
        updateElement(element.id, {
          x: clamp(initial.x + dx, -initial.width + 48, project.width - 48),
          y: clamp(initial.y + dy, -initial.height + 48, project.height - 48),
        }, false)
      } else {
        updateElement(element.id, {
          width: clamp(initial.width + dx, 80, project.width * 1.5),
          height: clamp(initial.height + dy, 80, project.height * 1.5),
        }, false)
      }
    }
    const handleUp = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  return (
    <div
      data-canvas-element={element.id}
      className="absolute touch-none"
      onPointerDown={(event) => beginInteraction(event, 'move')}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        opacity: element.opacity,
        transform: `rotate(${element.rotation}deg)`,
        transformOrigin: 'center',
        cursor: 'move',
        zIndex: selected ? 1000 : undefined,
      }}
    >
      {element.type === 'image' ? (
        imageUrl ? (
          <img src={imageUrl} alt="" draggable={false} className="pointer-events-none size-full select-none" style={{ objectFit: element.fit, borderRadius: element.radius }} />
        ) : (
          <div className="flex size-full items-center justify-center border-2 border-dashed" style={{ borderColor: 'rgba(20,20,20,.25)', backgroundColor: 'rgba(255,255,255,.18)', borderRadius: element.radius }}>
            <ImagePlus size={Math.max(22, Math.min(48, element.width / 8))} strokeWidth={1.2} style={{ color: 'rgba(20,20,20,.38)' }} />
          </div>
        )
      ) : element.type === 'shape' ? (
        <div className="size-full" style={{ backgroundColor: element.fill, borderRadius: element.shape === 'ellipse' ? '50%' : element.radius }} />
      ) : (
        <div className="size-full overflow-hidden whitespace-pre-wrap" style={{ color: element.color, fontFamily: element.fontFamily, fontSize: element.fontSize, fontWeight: element.fontWeight, textAlign: element.align }}>{element.text}</div>
      )}
      {selected && (
        <>
          <div className="pointer-events-none absolute inset-0 border-2" style={{ borderColor: 'var(--primary)' }} />
          <div
            role="button"
            aria-label="Resize"
            tabIndex={0}
            onPointerDown={(event) => beginInteraction(event, 'resize')}
            onKeyDown={(event) => {
              if (!project) return
              const step = event.shiftKey ? 40 : 10
              if (event.key === 'ArrowRight') { event.preventDefault(); updateElement(element.id, { width: clamp(element.width + step, 80, project.width * 1.5) }) }
              if (event.key === 'ArrowDown') { event.preventDefault(); updateElement(element.id, { height: clamp(element.height + step, 80, project.height * 1.5) }) }
              if (event.key === 'ArrowLeft') { event.preventDefault(); updateElement(element.id, { width: clamp(element.width - step, 80, project.width * 1.5) }) }
              if (event.key === 'ArrowUp') { event.preventDefault(); updateElement(element.id, { height: clamp(element.height - step, 80, project.height * 1.5) }) }
            }}
            className="absolute -bottom-2 -right-2 size-4 border-2"
            style={{ backgroundColor: 'var(--background)', borderColor: 'var(--primary)', cursor: 'nwse-resize' }}
          />
        </>
      )}
    </div>
  )
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" disabled={disabled} onClick={onClick} aria-label={label} title={label} className="flex size-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30">{children}</button>
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="w-4 shrink-0 text-[10px] font-medium" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      <input type="number" value={Math.round(value)} onChange={(event) => onChange(Number(event.target.value) || 0)} className="h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-xs tabular-nums outline-none focus:ring-2 focus:ring-ring" style={{ borderColor: 'var(--border)' }} />
    </label>
  )
}

export function CanvasEditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { language } = usePreferences()
  const store = useDesignCanvasStore()
  const { project, selectedElementId, assetUrls, undoStack, redoStack, saveStatus, loading } = store
  const workspaceRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fitScale, setFitScale] = useState(0.2)
  const [zoom, setZoom] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const scale = fitScale * zoom
  const selectedElement = useMemo(() => project?.elements.find((element) => element.id === selectedElementId) ?? null, [project, selectedElementId])

  useEffect(() => {
    if (projectId) void useDesignCanvasStore.getState().loadProject(projectId)
    return () => {
      void useDesignCanvasStore.getState().save()
      useDesignCanvasStore.getState().dispose()
    }
  }, [projectId])

  const updateFitScale = useCallback(() => {
    if (!workspaceRef.current || !project) return
    const { width, height } = workspaceRef.current.getBoundingClientRect()
    setFitScale(Math.min((width - 112) / project.width, (height - 112) / project.height, 1))
  }, [project?.height, project?.width])

  useEffect(() => {
    updateFitScale()
    if (!workspaceRef.current) return
    const observer = new ResizeObserver(updateFitScale)
    observer.observe(workspaceRef.current)
    return () => observer.disconnect()
  }, [updateFitScale])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      const modifier = event.ctrlKey || event.metaKey
      const actions = useDesignCanvasStore.getState()
      if (modifier && event.key.toLowerCase() === 's') { event.preventDefault(); void actions.save(); return }
      if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? actions.redo() : actions.undo(); return }
      if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); actions.redo(); return }
      if (editing) return
      if (event.key === 'Delete' || event.key === 'Backspace') actions.deleteSelected()
      if (event.key === 'Escape') actions.selectElement(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  async function handleExport() {
    if (!project || exporting) return
    setExporting(true)
    try { await exportCanvasProject(project); toast.success(t('admin.canvas_exported', language)) }
    catch (error) { console.error(error); toast.error(t('admin.canvas_export_failed', language)) }
    finally { setExporting(false) }
  }

  async function handleShare() {
    if (!project || sharing) return
    setSharing(true)
    try {
      await shareCanvasTemplate(project)
      toast.success(t('admin.canvas_shared', language))
    } catch (error) {
      if (error instanceof Error && error.message === 'LOGIN_REQUIRED') {
        toast.error(t('admin.canvas_share_login_required', language))
      } else {
        const detail = error instanceof Error ? error.message : ''
        toast.error(detail || t('admin.canvas_share_failed', language))
      }
    } finally {
      setSharing(false)
    }
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 size={20} className="animate-spin" /></div>
  if (!project) return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-sm" style={{ color: 'var(--muted-foreground)' }}>
      {t('admin.canvas_project_missing', language)}
      <button type="button" onClick={() => navigate('/design/canvas')} className="rounded-md border px-3 py-2" style={{ borderColor: 'var(--border)' }}>{t('admin.design_back_to_studio', language)}</button>
    </div>
  )

  const statusLabel = saveStatus === 'saving' ? t('admin.canvas_saving', language) : saveStatus === 'failed' ? t('admin.canvas_save_failed', language) : saveStatus === 'unsaved' ? t('admin.canvas_unsaved', language) : t('admin.canvas_saved', language)

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ backgroundColor: 'var(--background)' }}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: 'var(--border)' }}>
        <IconButton label={t('admin.canvas_back_to_projects', language)} onClick={() => navigate('/design/canvas')}><ArrowLeft size={16} /></IconButton>
        <input value={project.title} onChange={(event) => store.rename(event.target.value)} aria-label={t('admin.canvas_project_title', language)} className="h-8 w-48 rounded-md bg-transparent px-2 text-sm font-medium outline-none focus:bg-secondary focus:ring-2 focus:ring-ring" />
        <span className="text-[10px]" style={{ color: saveStatus === 'failed' ? 'var(--destructive)' : 'var(--muted-foreground)' }}>{statusLabel}</span>
        <span className="mx-1 h-5 w-px" style={{ backgroundColor: 'var(--border)' }} />
        <IconButton label={t('admin.canvas_undo', language)} disabled={undoStack.length === 0} onClick={store.undo}><Undo2 size={15} /></IconButton>
        <IconButton label={t('admin.canvas_redo', language)} disabled={redoStack.length === 0} onClick={store.redo}><Redo2 size={15} /></IconButton>
        <div className="flex-1" />
        <button type="button" onClick={() => void store.save()} className="flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-secondary" style={{ borderColor: 'var(--border)' }}><Save size={14} />{t('admin.canvas_save', language)}</button>
        <button type="button" disabled={sharing} onClick={() => void handleShare()} className="flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-secondary disabled:opacity-50" style={{ borderColor: 'var(--border)' }}><Share2 size={14} />{t('admin.canvas_share', language)}</button>
        <button type="button" disabled={exporting} onClick={() => void handleExport()} className="flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>{exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}{t('admin.canvas_export_png', language)}</button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-48 shrink-0 flex-col border-r" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
          <div className="flex h-11 items-center justify-between border-b px-3" style={{ borderColor: 'var(--border)' }}>
            <span className="text-xs font-semibold">{t('admin.canvas_assets', language)}</span>
            <IconButton label={t('admin.canvas_import_images', language)} onClick={() => fileInputRef.current?.click()}><Upload size={14} /></IconButton>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { void store.importFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = '' }} />
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {project.assets.length === 0 ? (
              <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-32 w-full items-center justify-center rounded-md border border-dashed transition-colors hover:bg-secondary" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }} aria-label={t('admin.canvas_import_images', language)}><ImagePlus size={22} strokeWidth={1.4} /></button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {project.assets.map((asset) => (
                  <button key={asset.id} type="button" onClick={() => store.useAsset(asset.id)} title={asset.name} className="aspect-square overflow-hidden rounded-md border bg-muted transition-colors hover:border-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ borderColor: 'var(--border)' }}>
                    {assetUrls[asset.id] && <img src={assetUrls[asset.id]} alt={asset.name} className="size-full object-cover" draggable={false} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center justify-center gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
            <IconButton label={t('admin.canvas_add_image_frame', language)} onClick={() => store.addElement('image')}><ImagePlus size={14} /></IconButton>
            <IconButton label={t('admin.canvas_add_text', language)} onClick={() => store.addElement('text')}><Type size={14} /></IconButton>
            <IconButton label={t('admin.canvas_add_shape', language)} onClick={() => store.addElement('shape')}><Square size={14} /></IconButton>
            <span className="mx-2 h-5 w-px" style={{ backgroundColor: 'var(--border)' }} />
            <IconButton label={t('admin.canvas_zoom_out', language)} onClick={() => setZoom((value) => clamp(value - 0.1, 0.4, 2.5))}><ZoomOut size={14} /></IconButton>
            <button type="button" onClick={() => setZoom(1)} className="w-14 text-center text-[10px] tabular-nums" title={t('admin.canvas_fit', language)}>{Math.round(scale * 100)}%</button>
            <IconButton label={t('admin.canvas_zoom_in', language)} onClick={() => setZoom((value) => clamp(value + 0.1, 0.4, 2.5))}><ZoomIn size={14} /></IconButton>
          </div>
          <div ref={workspaceRef} className="zine-desk min-h-0 flex-1 overflow-auto" onPointerDown={(event) => { if (event.target === event.currentTarget) store.selectElement(null) }}>
            <div className="flex min-h-full min-w-full items-center justify-center p-14">
              <div className="relative shrink-0" style={{ width: project.width * scale, height: project.height * scale }}>
                <div
                  className="absolute left-0 top-0 overflow-hidden shadow-[0_14px_45px_rgba(0,0,0,.18)]"
                  onPointerDown={(event) => { if (event.target === event.currentTarget) store.selectElement(null) }}
                  style={{ width: project.width, height: project.height, backgroundColor: project.background, transform: `scale(${scale})`, transformOrigin: 'top left' }}
                >
                  {project.elements.map((element) => (
                    <ElementView key={element.id} element={element} imageUrl={element.type === 'image' && element.assetId ? assetUrls[element.assetId] : undefined} selected={selectedElementId === element.id} scale={scale} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="w-60 shrink-0 overflow-auto border-l" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
          <section className="border-b p-4" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-xs font-semibold">{t('admin.canvas_background', language)}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {BACKGROUNDS.map((color) => <button key={color} type="button" onClick={() => store.setBackground(color)} aria-label={color} title={color} className="size-7 rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ backgroundColor: color, borderColor: project.background === color ? 'var(--foreground)' : 'var(--border)' }} />)}
            </div>
          </section>
          {selectedElement ? (
            <>
              <section className="border-b p-4" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold">{t('admin.canvas_geometry', language)}</h2>
                  <div className="flex">
                    <IconButton label={t('admin.canvas_duplicate', language)} onClick={store.duplicateSelected}><Copy size={14} /></IconButton>
                    <IconButton label={t('admin.canvas_delete', language)} onClick={store.deleteSelected}><Trash2 size={14} /></IconButton>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <NumberField label="X" value={selectedElement.x} onChange={(x) => store.updateElement(selectedElement.id, { x })} />
                  <NumberField label="Y" value={selectedElement.y} onChange={(y) => store.updateElement(selectedElement.id, { y })} />
                  <NumberField label="W" value={selectedElement.width} onChange={(width) => store.updateElement(selectedElement.id, { width: Math.max(80, width) })} />
                  <NumberField label="H" value={selectedElement.height} onChange={(height) => store.updateElement(selectedElement.id, { height: Math.max(80, height) })} />
                </div>
                <div className="mt-2"><NumberField label="°" value={selectedElement.rotation} onChange={(rotation) => store.updateElement(selectedElement.id, { rotation })} /></div>
              </section>
              {selectedElement.type === 'image' && (
                <section className="border-b p-4" style={{ borderColor: 'var(--border)' }}>
                  <h2 className="text-xs font-semibold">{t('admin.canvas_image_fit', language)}</h2>
                  <div className="mt-3 grid grid-cols-2 rounded-md border p-0.5" style={{ borderColor: 'var(--border)' }}>
                    {(['cover', 'contain'] as CanvasImageElement['fit'][]).map((fit) => <button key={fit} type="button" onClick={() => store.updateElement(selectedElement.id, { fit })} className="h-7 rounded text-[10px] font-medium" style={{ backgroundColor: selectedElement.fit === fit ? 'var(--primary)' : 'transparent', color: selectedElement.fit === fit ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }}>{fit === 'cover' ? t('admin.canvas_fit_cover', language) : t('admin.canvas_fit_contain', language)}</button>)}
                  </div>
                </section>
              )}
              <section className="p-4">
                <h2 className="text-xs font-semibold">{t('admin.canvas_layers', language)}</h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => store.moveSelectedLayer(1)} className="flex h-8 items-center justify-center gap-2 rounded-md border text-[10px] font-medium hover:bg-secondary" style={{ borderColor: 'var(--border)' }}><ArrowUp size={13} />{t('admin.canvas_layer_forward', language)}</button>
                  <button type="button" onClick={() => store.moveSelectedLayer(-1)} className="flex h-8 items-center justify-center gap-2 rounded-md border text-[10px] font-medium hover:bg-secondary" style={{ borderColor: 'var(--border)' }}><ArrowDown size={13} />{t('admin.canvas_layer_backward', language)}</button>
                </div>
              </section>
            </>
          ) : (
            <div className="flex h-40 items-center justify-center"><Minus size={18} style={{ color: 'var(--muted-foreground)' }} /></div>
          )}
        </aside>
      </div>
    </div>
  )
}
