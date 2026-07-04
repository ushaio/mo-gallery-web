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

const MAX_CANVAS_WIDTH = 920
const CANVAS_PADDING = 48

export function SpreadCanvas({ project, activeSpread, selectedSlotId, onSelectSlot }: SpreadCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [availableWidth, setAvailableWidth] = useState(MAX_CANVAS_WIDTH)
  const { pageW, pageH, spreadW, spreadH } = getSpreadSize(project.pageSize, project.pageOrientation)
  const scale = Math.min(MAX_CANVAS_WIDTH, Math.max(320, availableWidth - CANVAS_PADDING)) / spreadW

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const observer = new ResizeObserver(([entry]) => {
      setAvailableWidth(entry.contentRect.width)
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6" onClick={() => onSelectSlot(null)}>
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
