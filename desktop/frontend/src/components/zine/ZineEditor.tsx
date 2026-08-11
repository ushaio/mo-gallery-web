import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

import { PageStrip } from './PageStrip'
import { PhotoTray } from './PhotoTray'
import { SlotContextBar } from './SlotContextBar'
import { SpreadCanvas } from './SpreadCanvas'
import { ZineAiAssistant } from './ZineAiAssistant'
import { ZineToolbar } from './ZineToolbar'

import { getSlotPageSide } from '@/lib/zine/geometry'
import { flushZineOperations, recordZineOperation } from '@/lib/zine/operation-log'
import { getProjectSpreadSize } from '@/lib/zine/page-sizes'
import { t } from '@/lib/i18n'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

function describeError(value: unknown) {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack }
  return { message: String(value) }
}

export function ZineEditor() {
  const [canvasZoom, setCanvasZoom] = useState(1)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const { language } = usePreferences()
  const project = useZineStore((state) => state.project)
  const activeSpreadId = useZineStore((state) => state.activeSpreadId)
  const selectedSlotId = useZineStore((state) => state.selectedSlotId)
  const selectSlot = useZineStore((state) => state.selectSlot)
  const projectId = project?.id

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

  // 键盘快捷键：Ctrl+Z/Y 撤销重做 · Delete 删除选中槽位 · 方向键微调（Shift ×10）· Esc 取消选择
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return

      const state = useZineStore.getState()
      const key = event.key

      if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) state.redo()
        else state.undo()
        return
      }
      if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'y') {
        event.preventDefault()
        state.redo()
        return
      }

      if (!state.project || !state.activeSpreadId || !state.selectedSlotId) return

      if (key === 'Escape') {
        state.selectSlot(null)
        return
      }
      if (key === 'Delete' || key === 'Backspace') {
        event.preventDefault()
        state.removeSlot(state.activeSpreadId, state.selectedSlotId)
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
      const spread = state.project.spreads.find((item) => item.id === state.activeSpreadId)
      const slot = spread?.slots.find((item) => item.id === state.selectedSlotId)
      if (slot) {
        const { pageW } = getProjectSpreadSize(state.project)
        const x = slot.x + nudge[0] * step
        const y = slot.y + nudge[1] * step
        state.updateSlot(state.activeSpreadId, state.selectedSlotId, { x, y, page: getSlotPageSide({ ...slot, x, y }, pageW) })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!project) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Zine project not loaded</div>
  }

  const activeSpread = project.spreads.find((spread) => spread.id === activeSpreadId) ?? project.spreads[0]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <ZineToolbar />
      <div className="flex min-h-0 flex-1">
        <PageStrip />
        <div className="relative flex min-h-0 min-w-0 flex-1">
          <SpreadCanvas
            project={project}
            activeSpread={activeSpread}
            selectedSlotId={selectedSlotId}
            zoom={canvasZoom}
            onZoomChange={setCanvasZoom}
            onSelectSlot={selectSlot}
          />
          <SlotContextBar />
          {!assistantOpen ? (
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg border bg-card text-foreground shadow-sm transition hover:bg-accent"
              style={{ borderColor: 'var(--border)' }}
              aria-label={t('admin.zine_ai', language)}
              title={t('admin.zine_ai', language)}
            >
              <Sparkles size={16} className="text-primary" />
            </button>
          ) : null}
        </div>
        {assistantOpen ? <ZineAiAssistant onClose={() => setAssistantOpen(false)} /> : null}
      </div>
      <PhotoTray />
    </div>
  )
}
