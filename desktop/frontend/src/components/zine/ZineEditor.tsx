import { useEffect, useRef, useState } from 'react'
import { Eye, Hand, MousePointer2, PanelRight, Sparkles, X } from 'lucide-react'

import { PageStrip } from './PageStrip'
import { SlotContextBar } from './SlotContextBar'
import { SlotInspector } from './SlotInspector'
import { SpreadCanvas } from './SpreadCanvas'
import { ZineAiAssistant } from './ZineAiAssistant'
import { ZineToolbar } from './ZineToolbar'

import { getSlotPageSide } from '@/lib/zine/geometry'
import { applyGestureBoundary } from '@/lib/zine/gesture-session'
import { isZineControlTarget, isZineShortcutTarget } from '@/lib/zine/editor-input'
import { flushZineOperations, recordZineOperation } from '@/lib/zine/operation-log'
import { getProjectSpreadSize } from '@/lib/zine/page-sizes'
import { getProjectBleedMm, getSpreadPageNumbers } from '@/lib/zine/print'
import { t } from '@/lib/i18n'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

function describeError(value: unknown) {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack }
  return { message: String(value) }
}

export function ZineEditor() {
  const [canvasZoom, setCanvasZoom] = useState(1)
  const [canvasTool, setCanvasTool] = useState<'select' | 'hand'>('select')
  const [preview, setPreview] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth >= 1200)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const language = usePreferences((state) => state.language)
  const project = useZineStore((state) => state.project)
  const activeSpreadId = useZineStore((state) => state.activeSpreadId)
  const selectedSlotId = useZineStore((state) => state.selectedSlotId)
  const editingSlotId = useZineStore((state) => state.editingSlotId)
  const selectSlot = useZineStore((state) => state.selectSlot)
  const projectId = project?.id
  const activeTool = editingSlotId ? 'select' : canvasTool
  const canvasPreview = preview && !editingSlotId

  useEffect(() => {
    if (!editingSlotId) return
    setCanvasTool('select')
    setPreview(false)
  }, [editingSlotId])

  useEffect(() => {
    if (!projectId) return
    const sessionProject = useZineStore.getState().project

    recordZineOperation('editor_session_started', {
      projectId,
      spreadCount: sessionProject?.spreads.length ?? 0,
      assetCount: sessionProject?.assets.length ?? 0,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      userAgent: navigator.userAgent,
    }, { flush: true })

    function onError(event: ErrorEvent) {
      recordZineOperation('window_error', {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        error: describeError(event.error),
      }, { flush: true })
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      recordZineOperation('unhandled_rejection', describeError(event.reason), { flush: true })
    }

    let longTaskObserver: PerformanceObserver | null = null
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          recordZineOperation('long_task', {
            name: entry.name,
            startTime: Math.round(entry.startTime),
            duration: Math.round(entry.duration),
          }, { flush: true })
        }
      })
      longTaskObserver.observe({ entryTypes: ['longtask'] })
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
      longTaskObserver?.disconnect()
      recordZineOperation('editor_session_ended', { projectId }, { flush: true })
      void flushZineOperations()
    }
  }, [projectId])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isZineShortcutTarget(event.target) || event.defaultPrevented || event.isComposing) return

      const state = useZineStore.getState()
      const key = event.key
      const commandKey = event.ctrlKey || event.metaKey
      const spread = state.project?.spreads.find((item) => item.id === state.activeSpreadId)
      const slot = spread?.slots.find((item) => item.id === state.selectedSlotId)
      if (state.editingSlotId || editorRef.current?.querySelector('[data-zine-gesture]')) {
        if (commandKey && ['s', 'c', 'v', 'd', 'z', 'y'].includes(key.toLowerCase())) event.preventDefault()
        return
      }

      if (commandKey && key.toLowerCase() === 's') {
        event.preventDefault()
        void state.save()
        return
      }
      if (preview) {
        if (key === 'Escape' || key.toLowerCase() === 'p' && !commandKey) {
          event.preventDefault()
          setPreview(false)
        }
        return
      }
      if (commandKey && key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) state.redo()
        else state.undo()
        return
      }
      if (commandKey && key.toLowerCase() === 'y') {
        event.preventDefault()
        state.redo()
        return
      }

      if (!state.project || !spread || state.aiTaskId) return

      if (commandKey) {
        if (key.toLowerCase() === 'v') {
          event.preventDefault()
          state.pasteSlot(spread.id)
        } else if (slot && key.toLowerCase() === 'c') {
          event.preventDefault()
          state.copySlot(spread.id, slot.id)
        } else if (slot && key.toLowerCase() === 'd') {
          event.preventDefault()
          state.duplicateSlot(spread.id, slot.id)
        } else if (slot && (event.code === 'BracketLeft' || event.code === 'BracketRight')) {
          event.preventDefault()
          state.reorderSlot(spread.id, slot.id, event.code === 'BracketLeft'
            ? event.shiftKey ? 'back' : 'backward'
            : event.shiftKey ? 'front' : 'forward')
        }
        return
      }
      if (event.altKey || isZineControlTarget(event.target)) return

      if (key === 'Escape') {
        event.preventDefault()
        state.editSlot(null)
        state.selectSlot(null)
        return
      }
      if (!event.repeat && ['v', 'h', 'p', 't', 'i'].includes(key.toLowerCase())) {
        event.preventDefault()
        if (key.toLowerCase() === 'v') setCanvasTool('select')
        if (key.toLowerCase() === 'h') { state.editSlot(null); setCanvasTool('hand') }
        if (key.toLowerCase() === 'p') { state.editSlot(null); setPreview(true) }
        if (key.toLowerCase() === 't' || key.toLowerCase() === 'i') {
          setCanvasTool('select')
          state.addSlot(spread.id, key.toLowerCase() === 't' ? 'text' : 'image')
        }
        return
      }
      if (key === 'PageUp' || key === 'PageDown') {
        event.preventDefault()
        const index = state.project.spreads.findIndex((item) => item.id === spread.id)
        const next = state.project.spreads[index + (key === 'PageDown' ? 1 : -1)]
        if (next) state.setActiveSpread(next.id)
        return
      }
      if (!slot || canvasTool === 'hand') return
      if (key === 'Enter') {
        event.preventDefault()
        state.editSlot(slot.id)
        return
      }
      if (key === 'Delete' || key === 'Backspace') {
        event.preventDefault()
        state.removeSlot(spread.id, slot.id)
        return
      }

      const nudges: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      }
      const nudge = nudges[key]
      if (!nudge) return

      event.preventDefault()
      const step = event.shiftKey ? 10 : 1
      const { pageW, pageH, spreadW } = getProjectSpreadSize(state.project)
      const next = applyGestureBoundary({ ...slot, x: slot.x + nudge[0] * step, y: slot.y + nudge[1] * step }, { bleed: getProjectBleedMm(state.project), pageH, spreadW })
      state.updateSlot(spread.id, slot.id, { x: next.x, y: next.y, page: getSlotPageSide({ ...slot, ...next }, pageW) }, { recordHistory: !event.repeat })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [preview, canvasTool])

  if (!project) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Zine project not loaded</div>
  }

  const activeSpread = project.spreads.find((spread) => spread.id === activeSpreadId) ?? project.spreads[0]
  const pageNumbers = getSpreadPageNumbers(project, Math.max(0, project.spreads.indexOf(activeSpread)))
  const pageLabel = pageNumbers === 'cover' ? (language === 'zh' ? '封面' : 'Cover') : `P${pageNumbers.left} — ${pageNumbers.right}`
  const toolClass = 'flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs transition hover:bg-accent'

  return (
    <div ref={editorRef} data-zine-editor tabIndex={-1} className="zine-editor flex h-full min-h-0 flex-col overflow-hidden bg-background outline-none">
      <ZineToolbar />
      <div className="relative flex min-h-0 flex-1">
        <PageStrip />
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-card px-3" role="toolbar" aria-label={language === 'zh' ? '画布工具' : 'Canvas tools'}>
            <button type="button" className={`${toolClass} ${canvasTool === 'select' ? 'bg-accent text-foreground' : 'text-muted-foreground'}`} title={language === 'zh' ? '选择 (V)' : 'Select (V)'} aria-label={language === 'zh' ? '选择工具' : 'Select tool'} aria-pressed={canvasTool === 'select'} onClick={() => setCanvasTool('select')}><MousePointer2 size={14} /><span className="hidden sm:inline">{language === 'zh' ? '选择' : 'Select'}</span></button>
            <button type="button" className={`${toolClass} ${canvasTool === 'hand' ? 'bg-accent text-foreground' : 'text-muted-foreground'}`} title={language === 'zh' ? '平移 (H)，或按住空格' : 'Pan (H), or hold Space'} aria-label={language === 'zh' ? '平移工具' : 'Hand tool'} aria-pressed={canvasTool === 'hand'} onClick={() => { useZineStore.getState().editSlot(null); setCanvasTool('hand') }}><Hand size={14} /><span className="hidden sm:inline">{language === 'zh' ? '平移' : 'Pan'}</span></button>
            <span className="ml-2 hidden border-l border-border pl-3 text-[11px] tabular-nums text-muted-foreground sm:inline">{pageLabel}</span>
            <div className="flex-1" />
            <button type="button" className={`${toolClass} ${preview ? 'bg-accent text-foreground' : 'text-muted-foreground'}`} title={language === 'zh' ? '预览 (P)' : 'Preview (P)'} aria-pressed={preview} onClick={() => { useZineStore.getState().editSlot(null); setPreview((value) => !value) }}><Eye size={14} /><span>{language === 'zh' ? '预览' : 'Preview'}</span></button>
            <button type="button" className={`${toolClass} ${inspectorOpen ? 'bg-accent text-foreground' : 'text-muted-foreground'}`} title={language === 'zh' ? '位置、尺寸与图层' : 'Position, size and layers'} aria-label={language === 'zh' ? '属性面板' : 'Properties panel'} aria-expanded={inspectorOpen} onClick={() => { setInspectorOpen((value) => !value); setAssistantOpen(false) }}><PanelRight size={14} /><span className="hidden md:inline">{language === 'zh' ? '属性' : 'Properties'}</span></button>
            <button type="button" className={`${toolClass} text-muted-foreground`} onClick={() => { setAssistantOpen((value) => !value); setInspectorOpen(false) }} aria-label={t('admin.zine_ai', language)} title={t('admin.zine_ai', language)} aria-expanded={assistantOpen}><Sparkles size={14} /></button>
          </div>
          <div className="relative flex min-h-0 flex-1">
          <SpreadCanvas
            project={project}
            activeSpread={activeSpread}
            selectedSlotId={selectedSlotId}
            zoom={canvasZoom}
            onZoomChange={setCanvasZoom}
            onSelectSlot={selectSlot}
            tool={activeTool}
            preview={canvasPreview}
          />
          {!canvasPreview && <SlotContextBar />}
          </div>
        </div>
        {inspectorOpen ? <aside className="zine-inspector flex w-[248px] shrink-0 flex-col border-l border-border bg-card" aria-label={language === 'zh' ? '元素属性' : 'Element properties'}>
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
            <span className="text-xs font-medium">{language === 'zh' ? '属性' : 'Properties'}</span>
            <button type="button" className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent" onClick={() => setInspectorOpen(false)} aria-label={language === 'zh' ? '收起属性面板' : 'Close properties panel'}><X size={13} /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto"><SlotInspector /></div>
        </aside> : null}
        {assistantOpen ? <ZineAiAssistant onClose={() => setAssistantOpen(false)} /> : null}
      </div>
    </div>
  )
}
