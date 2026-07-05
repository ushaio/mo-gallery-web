import { useRef } from 'react'
import Moveable from 'react-moveable'

import { renderSlot } from '@/lib/zine/slot-render'
import type { Slot, Spread, ZineAsset } from '@/lib/zine/types'
import { useZineStore } from '@/store/zine'

import { SlotImageContent } from './SlotImageContent'
import { SlotTextContent } from './SlotTextContent'

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

interface SlotViewProps {
  spread: Spread
  slot: Slot
  pageW: number
  assets: ZineAsset[]
  selected: boolean
  scale: number
  onSelect?: (slotId: string) => void
}

function toScreenPx(valueMm: number, scale: number) {
  return valueMm * scale
}

export function SlotView({ spread, slot, pageW, assets, selected, scale, onSelect }: SlotViewProps) {
  const slotRef = useRef<HTMLDivElement | null>(null)
  const transformRef = useRef({ x: 0, y: 0, w: slot.w, h: slot.h, rotation: slot.rotation, pxPerMm: scale })
  const updateSlot = useZineStore((state) => state.updateSlot)
  const rendered = renderSlot(slot, pageW, assets)
  const asset = slot.kind === 'image' ? assets.find((item) => item.id === slot.assetId) : undefined
  const slotStyle = {
    ...rendered.htmlStyle,
    left: `${toScreenPx(Number(rendered.htmlStyle.left), scale)}px`,
    top: `${toScreenPx(Number(rendered.htmlStyle.top), scale)}px`,
    width: `${toScreenPx(Number(rendered.htmlStyle.width), scale)}px`,
    height: `${toScreenPx(Number(rendered.htmlStyle.height), scale)}px`,
  }

  function resetLiveStyle() {
    const element = slotRef.current
    if (!element) return

    element.style.transform = `rotate(${slot.rotation}deg)`
    element.style.width = `${toScreenPx(slot.w, scale)}px`
    element.style.height = `${toScreenPx(slot.h, scale)}px`
  }

  return (
    <>
      <div
        ref={slotRef}
        role="button"
        tabIndex={0}
        className="group block border border-dashed bg-white/70 text-left transition"
        style={{
          ...slotStyle,
          borderColor: selected ? 'var(--primary)' : 'rgba(113, 113, 122, 0.65)',
          boxShadow: selected ? '0 0 0 2px color-mix(in srgb, var(--primary) 30%, transparent)' : undefined,
          opacity: selected ? 0.82 : 1,
        }}
        onClick={(event) => {
          event.stopPropagation()
          onSelect?.(slot.id)
        }}
        onKeyDown={(event) => {
          if (isEditableTarget(event.target)) return
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          onSelect?.(slot.id)
        }}
        onDragOver={
          slot.kind === 'image'
            ? (event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'copy'
              }
            : undefined
        }
        onDrop={
          slot.kind === 'image'
            ? (event) => {
                event.preventDefault()
                event.stopPropagation()
                const assetId = event.dataTransfer.getData('application/x-zine-asset-id')
                if (assetId) updateSlot(spread.id, slot.id, { assetId })
              }
            : undefined
        }
        aria-pressed={selected}
        aria-label={`Select ${slot.kind} slot`}
      >
        {slot.kind === 'image' && <SlotImageContent asset={asset} innerStyle={rendered.imageInner?.htmlStyle} />}
        {slot.kind === 'text' && rendered.text && (
          <SlotTextContent
            content={rendered.text.content}
            style={rendered.text.htmlStyle}
            onChange={(content) => {
              if (content !== slot.content) updateSlot(spread.id, slot.id, { content })
            }}
          />
        )}
      </div>
      {selected && (
        <Moveable
          target={slotRef}
          draggable
          resizable
          rotatable
          snappable
          onDragStart={({ set }) => {
            transformRef.current = { x: 0, y: 0, w: slot.w, h: slot.h, rotation: slot.rotation, pxPerMm: scale }
            set([0, 0])
          }}
          onDrag={({ target, beforeTranslate }) => {
            transformRef.current.x = beforeTranslate[0]
            transformRef.current.y = beforeTranslate[1]
            target.style.transform = `translate(${beforeTranslate[0]}px, ${beforeTranslate[1]}px) rotate(${slot.rotation}deg)`
          }}
          onDragEnd={() => {
            const { x, y, pxPerMm } = transformRef.current
            resetLiveStyle()
            if (x === 0 && y === 0) return
            updateSlot(spread.id, slot.id, { x: slot.x + x / pxPerMm, y: slot.y + y / pxPerMm })
          }}
          onResizeStart={({ dragStart }) => {
            transformRef.current = { x: 0, y: 0, w: slot.w, h: slot.h, rotation: slot.rotation, pxPerMm: scale }
            if (dragStart) dragStart.set([0, 0])
          }}
          onResize={({ target, width, height, drag }) => {
            transformRef.current = { ...transformRef.current, x: drag.beforeTranslate[0], y: drag.beforeTranslate[1], w: width, h: height }
            target.style.width = `${width}px`
            target.style.height = `${height}px`
            target.style.transform = `translate(${drag.beforeTranslate[0]}px, ${drag.beforeTranslate[1]}px) rotate(${slot.rotation}deg)`
          }}
          onResizeEnd={() => {
            const { x, y, w, h, pxPerMm } = transformRef.current
            resetLiveStyle()
            updateSlot(spread.id, slot.id, {
              x: slot.x + x / pxPerMm,
              y: slot.y + y / pxPerMm,
              w: Math.max(5, w / pxPerMm),
              h: Math.max(5, h / pxPerMm),
            })
          }}
          onRotateStart={({ set }) => {
            transformRef.current = { x: 0, y: 0, w: slot.w, h: slot.h, rotation: slot.rotation, pxPerMm: scale }
            set(slot.rotation)
          }}
          onRotate={({ target, beforeRotate }) => {
            transformRef.current.rotation = beforeRotate
            target.style.transform = `rotate(${beforeRotate}deg)`
          }}
          onRotateEnd={() => {
            resetLiveStyle()
            if (transformRef.current.rotation === slot.rotation) return
            updateSlot(spread.id, slot.id, { rotation: transformRef.current.rotation })
          }}
        />
      )}
    </>
  )
}
