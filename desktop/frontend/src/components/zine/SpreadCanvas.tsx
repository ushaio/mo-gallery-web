import { useEffect, useRef, useState } from 'react'

import { getSpreadSize } from '@/lib/zine/page-sizes'
import type { Spread, ZineProject } from '@/lib/zine/types'

import { SlotView } from './SlotView'

interface SpreadCanvasProps {
  project: ZineProject
  activeSpread?: Spread
  selectedSlotId: string | null
  onSelectSlot: (slotId: string | null) => void
}

const MAX_CANVAS_WIDTH = 760
const CANVAS_PADDING = 48
const MIN_CANVAS_WIDTH = 280
const MIN_CANVAS_HEIGHT = 220
const PREVIEW_FIT_RATIO = 0.82

interface SpreadCanvasScaleParams {
  availableWidth: number
  availableHeight: number
  spreadWidthMm: number
  spreadHeightMm: number
}

export function calculateSpreadCanvasScale({
  availableWidth,
  availableHeight,
  spreadWidthMm,
  spreadHeightMm,
}: SpreadCanvasScaleParams) {
  const widthLimit = Math.min(MAX_CANVAS_WIDTH, Math.max(MIN_CANVAS_WIDTH, availableWidth - CANVAS_PADDING))
  const heightLimit = Math.max(MIN_CANVAS_HEIGHT, availableHeight - CANVAS_PADDING)

  return Math.min(widthLimit / spreadWidthMm, heightLimit / spreadHeightMm) * PREVIEW_FIT_RATIO
}

export function SpreadCanvas({ project, activeSpread, selectedSlotId, onSelectSlot }: SpreadCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [availableSize, setAvailableSize] = useState({ width: MAX_CANVAS_WIDTH, height: 640 })
  const { pageW, pageH, spreadW, spreadH } = getSpreadSize(project.pageSize, project.pageOrientation)
  const scale = calculateSpreadCanvasScale({
    availableWidth: availableSize.width,
    availableHeight: availableSize.height,
    spreadWidthMm: spreadW,
    spreadHeightMm: spreadH,
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

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3" onClick={() => onSelectSlot(null)}>
      <div
        className="relative shrink-0 shadow-2xl shadow-black/20"
        style={{
          width: `${spreadW * scale}px`,
          height: `${spreadH * scale}px`,
        }}
      >
        <div
          className="absolute origin-top-left overflow-hidden bg-zinc-100"
          style={{
            width: `${spreadW}mm`,
            height: `${spreadH}mm`,
            transform: `scale(${scale})`,
          }}
        >
          <div className="absolute left-0 top-0 h-full bg-white" style={{ width: `${pageW}mm` }} />
          <div className="absolute top-0 h-full bg-white" style={{ left: `${pageW}mm`, width: `${pageW}mm` }} />
          <div className="absolute top-0 h-full w-px bg-zinc-300" style={{ left: `${pageW}mm` }} />
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
