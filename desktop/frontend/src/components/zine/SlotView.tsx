import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import Moveable from 'react-moveable'
import { TriangleAlert } from 'lucide-react'

import { toSlotGeometry, type SlotGeometry } from '@/lib/zine/geometry'
import { CropSession } from '@/lib/zine/crop-session'
import { buildGestureGuides, GestureSession, snapGestureRotation, type GestureGuide, type GestureKind } from '@/lib/zine/gesture-session'
import { t } from '@/lib/i18n'
import { calculateEffectiveDpi, MIN_PRINT_DPI, SAFE_MARGIN_MM } from '@/lib/zine/print'
import { renderSlot } from '@/lib/zine/slot-render'
import type { Slot, Spread, ZineAsset, ZineImageTransform } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

import { SlotImageContent } from './SlotImageContent'
import { SlotTextContent } from './SlotTextContent'

const PT_TO_MM = 25.4 / 72
const ASSET_DRAG_TYPE = 'application/x-zine-asset-id'
const MIN_SLOT_MM = 5
const CROP_SCALE_STEP = 1.08

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

interface SlotViewProps {
  spread: Spread
  slot: Slot
  pageW: number
  pageH: number
  spreadW: number
  bleed: number
  assets: ZineAsset[]
  selected: boolean
  scale: number
  onSelect?: (slotId: string) => void
}

function toScreenPx(valueMm: number, scale: number) {
  return valueMm * scale
}

function cropTransformStyle(transform: ZineImageTransform) {
  return `scale(${transform.scale}) translate(${transform.offsetX}%, ${transform.offsetY}%) rotate(${transform.rotation}deg)`
}

export function SlotView({ spread, slot, pageW, pageH, spreadW, bleed, assets, selected, scale, onSelect }: SlotViewProps) {
  const { language } = usePreferences()
  const slotRef = useRef<HTMLDivElement | null>(null)
  const moveableRef = useRef<Moveable | null>(null)
  const geometryRef = useRef<SlotGeometry>(toSlotGeometry(slot))
  const gestureSessionRef = useRef<GestureSession | null>(null)
  const cropSessionRef = useRef<CropSession | null>(null)
  const cropPointerRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const dragDepthRef = useRef(0)
  const [dragOver, setDragOver] = useState(false)
  const [editingText, setEditingText] = useState(false)
  const [cropEditing, setCropEditing] = useState(false)
  const [cropDraft, setCropDraft] = useState<ZineImageTransform | null>(null)
  const [activeGuides, setActiveGuides] = useState<GestureGuide[]>([])
  const [rotationSnap, setRotationSnap] = useState<number | null>(null)
  const updateSlot = useZineStore((state) => state.updateSlot)
  const gestureGuides = useMemo(() => buildGestureGuides(pageW, pageH, SAFE_MARGIN_MM), [pageH, pageW])

  const rendered = renderSlot(slot, pageW, assets)
  const asset = slot.kind === 'image' ? assets.find((item) => item.id === slot.assetId) : undefined
  const isEmptyImage = slot.kind === 'image' && !asset
  const isEmptyText = slot.kind === 'text' && !slot.content
  const effectiveDpi =
    slot.kind === 'image' && asset && asset.width > 0 && asset.height > 0
      ? calculateEffectiveDpi(asset.width, asset.height, slot.w, slot.h, slot.imageTransform.scale)
      : 0
  const lowRes = effectiveDpi > 0 && effectiveDpi < MIN_PRINT_DPI
  const slotHeightPx = toScreenPx(slot.h, scale)
  const slotStyle = {
    ...rendered.htmlStyle,
    left: `${toScreenPx(Number(rendered.htmlStyle.left), scale)}px`,
    top: `${toScreenPx(Number(rendered.htmlStyle.top), scale)}px`,
    width: `${toScreenPx(Number(rendered.htmlStyle.width), scale)}px`,
    height: `${toScreenPx(Number(rendered.htmlStyle.height), scale)}px`,
  }
  const imageInnerStyle = cropEditing && cropDraft
    ? { ...rendered.imageInner?.htmlStyle, transform: cropTransformStyle(cropDraft) }
    : rendered.imageInner?.htmlStyle
  const textStyle = rendered.text
    ? { ...rendered.text.htmlStyle, fontSize: `${Number(rendered.text.htmlStyle.fontSize) * PT_TO_MM * scale}px` }
    : undefined

  useEffect(() => {
    geometryRef.current = toSlotGeometry(slot)
    const element = slotRef.current
    if (element) {
      element.style.left = String(slotStyle.left)
      element.style.top = String(slotStyle.top)
      element.style.width = String(slotStyle.width)
      element.style.height = String(slotStyle.height)
      element.style.transform = `rotate(${slot.rotation}deg)`
    }
    moveableRef.current?.updateRect()
    // slotStyle is derived from the geometry inputs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.x, slot.y, slot.w, slot.h, slot.rotation, scale, selected])

  useEffect(() => {
    if (!selected) {
      setEditingText(false)
      if (cropEditing) commitCrop()
    }
  }, [selected])

  useEffect(() => {
    if (!cropEditing) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || isEditableTarget(event.target)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      cropSessionRef.current?.cancel()
      cropSessionRef.current = null
      setCropEditing(false)
      setCropDraft(null)
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Node && slotRef.current?.contains(target)) return
      commitCrop()
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [cropEditing, slot])

  function commitCrop() {
    const session = cropSessionRef.current
    if (slot.kind !== 'image' || !session) return
    if (session.changed()) updateSlot(spread.id, slot.id, { imageTransform: session.commit() })
    cropSessionRef.current = null
    setCropEditing(false)
    setCropDraft(null)
  }

  function beginCrop() {
    if (slot.kind !== 'image') return
    const session = new CropSession(slot.imageTransform)
    cropSessionRef.current = session
    setCropDraft(session.getDraft())
    setCropEditing(true)
    onSelect?.(slot.id)
  }

  function updateCrop(next: ZineImageTransform) {
    cropSessionRef.current?.update(next)
    setCropDraft(next)
  }

  function commitGeometry() {
    const session = gestureSessionRef.current
    if (!session) return
    const result = session.commit(slot)
    gestureSessionRef.current = null
    setActiveGuides([])
    setRotationSnap(null)
    geometryRef.current = result.geometry
    commitLiveGeometry(result.geometry)
    if (!result.changed) return
    updateSlot(spread.id, slot.id, { ...result.geometry, page: result.page })
  }

  function resetLiveStyle() {
    commitLiveGeometry(geometryRef.current)
  }

  function commitLiveGeometry(next: SlotGeometry) {
    const element = slotRef.current
    if (!element) return
    element.style.left = `${toScreenPx(next.x, scale)}px`
    element.style.top = `${toScreenPx(next.y, scale)}px`
    element.style.width = `${toScreenPx(next.w, scale)}px`
    element.style.height = `${toScreenPx(next.h, scale)}px`
    element.style.transform = `rotate(${next.rotation}deg)`
  }

  function beginGeometryGesture(kind: GestureKind, resizeDirection?: readonly [number, number]) {
    const initial = toSlotGeometry(slot)
    geometryRef.current = initial
    gestureSessionRef.current = new GestureSession(initial, {
      kind,
      pageW,
      guides: gestureGuides,
      snapThreshold: 4 / scale,
      boundary: { bleed, pageH, spreadW },
      resizeDirection,
      rotationSnapDegrees: [0, 45, 90, 135, 180, 225, 270, 315],
      rotationSnapThreshold: 3,
    })
    setActiveGuides([])
    setRotationSnap(null)
  }

  function updateGeometryDraft(next: SlotGeometry) {
    geometryRef.current = next
    gestureSessionRef.current?.update(next)
  }

  function isAssetDrag(event: React.DragEvent) {
    return event.dataTransfer.types.includes(ASSET_DRAG_TYPE)
  }

  return (
    <>
      {activeGuides.map((guide) => {
        const color = guide.kind === 'spine'
          ? 'rgba(239, 68, 68, 0.9)'
          : guide.kind === 'safe-margin'
            ? 'rgba(59, 130, 246, 0.85)'
            : guide.kind === 'page-center'
              ? 'rgba(16, 185, 129, 0.85)'
              : 'rgba(245, 158, 11, 0.9)'
        return (
          <div
            key={`${guide.axis}-${guide.kind}-${guide.position}`}
            className="pointer-events-none absolute z-40"
            style={guide.axis === 'x'
              ? { left: `${toScreenPx(guide.position, scale)}px`, top: 0, width: '1px', height: `${toScreenPx(pageH, scale)}px`, backgroundColor: color }
              : { left: 0, top: `${toScreenPx(guide.position, scale)}px`, width: `${toScreenPx(spreadW, scale)}px`, height: '1px', backgroundColor: color }}
          />
        )
      })}
      <div
        ref={slotRef}
        role="button"
        tabIndex={0}
        className="group text-left outline-none"
        style={{
          ...slotStyle,
          cursor: cropEditing ? 'crosshair' : selected ? 'move' : 'pointer',
          willChange: selected ? 'transform' : undefined,
        }}
        onClick={(event) => {
          event.stopPropagation()
          onSelect?.(slot.id)
        }}
        onDoubleClick={(event) => {
          event.stopPropagation()
          if (slot.kind === 'text') {
            onSelect?.(slot.id)
            setEditingText(true)
          } else {
            beginCrop()
          }
        }}
        onKeyDown={(event) => {
          if (isEditableTarget(event.target)) return
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          if (event.key === 'Enter' && slot.kind === 'text' && selected) {
            setEditingText(true)
            return
          }
          onSelect?.(slot.id)
        }}
        onPointerDown={(event) => {
          if (!cropEditing || slot.kind !== 'image') return
          event.preventDefault()
          event.stopPropagation()
          cropPointerRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const pointer = cropPointerRef.current
          if (!pointer || pointer.pointerId !== event.pointerId || slot.kind !== 'image') return
          const next = cropSessionRef.current?.pan(event.clientX - pointer.x, event.clientY - pointer.y, slot.w * scale, slot.h * scale)
          if (next) updateCrop(next)
          cropPointerRef.current = { ...pointer, x: event.clientX, y: event.clientY }
        }}
        onPointerUp={(event) => {
          if (cropPointerRef.current?.pointerId === event.pointerId) cropPointerRef.current = null
        }}
        onWheel={(event) => {
          if (!cropEditing || slot.kind !== 'image') return
          event.preventDefault()
          event.stopPropagation()
          const next = cropSessionRef.current?.zoom(event.deltaY, CROP_SCALE_STEP)
          if (next) updateCrop(next)
        }}
        onDragEnter={slot.kind === 'image' ? (event) => {
          if (!isAssetDrag(event)) return
          event.preventDefault()
          dragDepthRef.current += 1
          setDragOver(true)
        } : undefined}
        onDragOver={slot.kind === 'image' ? (event) => {
          if (!isAssetDrag(event)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        } : undefined}
        onDragLeave={slot.kind === 'image' ? () => {
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
          if (dragDepthRef.current === 0) setDragOver(false)
        } : undefined}
        onDrop={slot.kind === 'image' ? (event) => {
          event.preventDefault()
          event.stopPropagation()
          dragDepthRef.current = 0
          setDragOver(false)
          const assetId = event.dataTransfer.getData(ASSET_DRAG_TYPE)
          if (assetId) {
            updateSlot(spread.id, slot.id, { assetId })
            onSelect?.(slot.id)
          }
        } : undefined}
        aria-pressed={selected}
        aria-label={t(slot.kind === 'image' ? 'admin.zine_slot_image' : 'admin.zine_slot_text', language)}
      >
        {slot.kind === 'image' && (
          <SlotImageContent
            asset={asset}
            innerStyle={imageInnerStyle}
            compact={slotHeightPx < 56}
            hintText={t('admin.zine_empty_slot_hint', language)}
            failedText={t('admin.zine_image_load_failed', language)}
            retryText={t('admin.zine_retry_image', language)}
            replaceText={t('admin.zine_replace_image', language)}
            onReplace={() => updateSlot(spread.id, slot.id, { assetId: null })}
          />
        )}
        {slot.kind === 'text' && rendered.text && (
          <SlotTextContent
            content={rendered.text.content}
            style={textStyle}
            placeholder={t('admin.zine_text_edit_hint', language)}
            editing={editingText}
            onEditEnd={() => setEditingText(false)}
            onChange={(content) => {
              if (content !== slot.content) updateSlot(spread.id, slot.id, { content })
            }}
          />
        )}

        {lowRes && !dragOver && (
          <span
            className="pointer-events-none absolute right-1 top-1 z-10 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm"
            style={{ backgroundColor: 'rgba(217, 119, 6, 0.92)' }}
            title={t('admin.zine_low_res_hint', language, { dpi: Math.round(effectiveDpi) })}
          >
            <TriangleAlert size={10} />
            {slotHeightPx > 44 && `${Math.round(effectiveDpi)} DPI`}
          </span>
        )}
        {(isEmptyImage || isEmptyText) && !dragOver && <div className="pointer-events-none absolute inset-0 border border-dashed" style={{ borderColor: 'rgba(113, 113, 122, 0.5)' }} />}
        {!selected && !dragOver && <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--primary) 60%, transparent)' }} />}
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)', boxShadow: 'inset 0 0 0 2px var(--primary)' }}>
            {slotHeightPx > 44 && <span className="rounded-full px-2.5 py-1 text-[11px] font-medium shadow-sm" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>{t('admin.zine_drop_here', language)}</span>}
          </div>
        )}
        {cropEditing && <div className="pointer-events-none absolute inset-0 z-20 border-2 border-primary" />}
        {rotationSnap !== null && (
          <span className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white shadow-sm">
            {rotationSnap}°
          </span>
        )}
      </div>
      {selected && !cropEditing && (
        <Moveable
          ref={moveableRef}
          target={slotRef}
          flushSync={flushSync}
          draggable
          resizable
          rotatable
          snappable
          snapThreshold={4}
          snapDirections={{ left: true, top: true, right: true, bottom: true, center: true, middle: true }}
          verticalGuidelines={gestureGuides.filter((guide) => guide.axis === 'x').map((guide) => guide.position * scale)}
          horizontalGuidelines={gestureGuides.filter((guide) => guide.axis === 'y').map((guide) => guide.position * scale)}
          snapRotationDegrees={[0, 45, 90, 135, 180, 225, 270, 315]}
          snapRotationThreshold={3}
          checkInput
          onSnap={({ guidelines }) => {
            const matched = guidelines.flatMap((guideline) => {
              const axis = guideline.type === 'vertical' ? 'x' : 'y'
              const position = (axis === 'x' ? guideline.pos[0] : guideline.pos[1]) / scale
              const guide = gestureGuides.find((candidate) => candidate.axis === axis && Math.abs(candidate.position - position) < 0.25)
              return guide ? [guide] : []
            })
            setActiveGuides(Array.from(new Map(matched.map((guide) => [`${guide.axis}:${guide.position}:${guide.kind}`, guide])).values()))
          }}
          onDragStart={({ set }) => {
            beginGeometryGesture('drag')
            set([0, 0])
          }}
          onDrag={({ target, beforeTranslate }) => {
            const initial = gestureSessionRef.current?.initial ?? toSlotGeometry(slot)
            const next = { ...initial, x: initial.x + beforeTranslate[0] / scale, y: initial.y + beforeTranslate[1] / scale }
            updateGeometryDraft(next)
            target.style.left = `${toScreenPx(next.x, scale)}px`
            target.style.top = `${toScreenPx(next.y, scale)}px`
            target.style.transform = `rotate(${next.rotation}deg)`
          }}
          onDragEnd={commitGeometry}
          onResizeStart={({ dragStart, direction }) => {
            beginGeometryGesture('resize', direction as [number, number])
            if (dragStart) dragStart.set([0, 0])
          }}
          onResize={({ target, width, height, drag }) => {
            const initial = gestureSessionRef.current?.initial ?? toSlotGeometry(slot)
            const next = {
              ...initial,
              x: initial.x + drag.beforeTranslate[0] / scale,
              y: initial.y + drag.beforeTranslate[1] / scale,
              w: Math.max(MIN_SLOT_MM, width / scale),
              h: Math.max(MIN_SLOT_MM, height / scale),
            }
            updateGeometryDraft(next)
            target.style.left = `${toScreenPx(next.x, scale)}px`
            target.style.top = `${toScreenPx(next.y, scale)}px`
            target.style.width = `${toScreenPx(next.w, scale)}px`
            target.style.height = `${toScreenPx(next.h, scale)}px`
            target.style.transform = `rotate(${next.rotation}deg)`
          }}
          onResizeEnd={commitGeometry}
          onRotateStart={({ set }) => {
            beginGeometryGesture('rotate')
            set(slot.rotation)
          }}
          onRotate={({ target, beforeRotate }) => {
            const initial = gestureSessionRef.current?.initial ?? toSlotGeometry(slot)
            const next = { ...initial, rotation: beforeRotate }
            const rotationFeedback = snapGestureRotation(beforeRotate, [0, 45, 90, 135, 180, 225, 270, 315], 3)
            setRotationSnap(rotationFeedback.snapped ? rotationFeedback.rotation : null)
            updateGeometryDraft(next)
            target.style.transform = `rotate(${beforeRotate}deg)`
          }}
          onRotateEnd={commitGeometry}
        />
      )}
    </>
  )
}
