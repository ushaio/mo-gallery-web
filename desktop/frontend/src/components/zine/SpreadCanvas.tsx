import { useEffect, useRef, useState } from 'react'

import { getSpreadSize } from '@/lib/zine/page-sizes'
import type { Spread, ZineProject } from '@/lib/zine/types'

import { SlotView } from './SlotView'

interface SpreadCanvasProps {
  project: ZineProject
  activeSpread?: Spread
  selectedSlotId: string | null
  zoom: number
  onZoomChange: (zoom: number) => void
  onSelectSlot: (slotId: string | null) => void
}

const MAX_CANVAS_WIDTH = 760
const CANVAS_PADDING = 48
const MIN_CANVAS_WIDTH = 280
const MIN_CANVAS_HEIGHT = 220
const PREVIEW_FIT_RATIO = 0.82
const MIN_ZOOM = 0.4
const MAX_ZOOM = 2

interface SpreadCanvasScaleParams {
  availableWidth: number
  availableHeight: number
  spreadWidthMm: number
  spreadHeightMm: number
  zoom: number
}

export function calculateSpreadCanvasScale({
  availableWidth,
  availableHeight,
  spreadWidthMm,
  spreadHeightMm,
  zoom,
}: SpreadCanvasScaleParams) {
  const widthLimit = Math.min(MAX_CANVAS_WIDTH, Math.max(MIN_CANVAS_WIDTH, availableWidth - CANVAS_PADDING))
  const heightLimit = Math.max(MIN_CANVAS_HEIGHT, availableHeight - CANVAS_PADDING)

  return Math.min(widthLimit / spreadWidthMm, heightLimit / spreadHeightMm) * PREVIEW_FIT_RATIO * zoom
}

export function toScreenPx(valueMm: number, scale: number) {
  return valueMm * scale
}

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function SpreadCanvas({ project, activeSpread, selectedSlotId, zoom, onZoomChange, onSelectSlot }: SpreadCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [availableSize, setAvailableSize] = useState({ width: MAX_CANVAS_WIDTH, height: 640 })
  const { pageW, pageH, spreadW, spreadH } = getSpreadSize(project.pageSize, project.pageOrientation)
  const scale = calculateSpreadCanvasScale({
    availableWidth: availableSize.width,
    availableHeight: availableSize.height,
    spreadWidthMm: spreadW,
    spreadHeightMm: spreadH,
    zoom,
  })

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const observer = new ResizeObserver(([entry]) => {
      setAvailableSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    const nextZoom = zoom + (event.deltaY > 0 ? -0.08 : 0.08)
    onZoomChange(clampZoom(nextZoom))
  }

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4" onWheel={handleWheel} onClick={() => onSelectSlot(null)}>
      <div
        className="relative shrink-0 shadow-2xl shadow-black/20"
        style={{
          width: `${toScreenPx(spreadW, scale)}px`,
          height: `${toScreenPx(spreadH, scale)}px`,
        }}
      >
        <div
          className="absolute origin-top-left overflow-hidden bg-zinc-100"
          style={{
            width: `${toScreenPx(spreadW, scale)}px`,
            height: `${toScreenPx(spreadH, scale)}px`,
          }}
        >
          <div className="absolute left-0 top-0 h-full bg-white" style={{ width: `${toScreenPx(pageW, scale)}px` }} />
          <div className="absolute top-0 h-full bg-white" style={{ left: `${toScreenPx(pageW, scale)}px`, width: `${toScreenPx(pageW, scale)}px` }} />
          <div className="absolute top-0 h-full w-px bg-zinc-300" style={{ left: `${toScreenPx(pageW, scale)}px` }} />
          {activeSpread?.slots.map((slot) => (
            <SlotView
              key={slot.id}
              spread={activeSpread}
              slot={slot}
              pageW={pageW}
              assets={project.assets}
              selected={selectedSlotId === slot.id}
              scale={scale}
              onSelect={onSelectSlot}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
