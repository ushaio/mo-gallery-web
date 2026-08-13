import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import Moveable from 'react-moveable'
import { TriangleAlert } from 'lucide-react'

import { toSlotGeometry, type SlotGeometry } from '@/lib/zine/geometry'
import { clampCropScale, createDefaultImageTransform, CropSession } from '@/lib/zine/crop-session'
import { buildGestureGuides, constrainMovementToAxis, GestureSession, getDominantMovementAxis, snapGestureRotation, type GestureGuide, type GestureKind, type MovementAxis } from '@/lib/zine/gesture-session'
import { t } from '@/lib/i18n'
import { calculateEffectiveDpi, MIN_PRINT_DPI, SAFE_MARGIN_MM } from '@/lib/zine/print'
import { recordZineOperation } from '@/lib/zine/operation-log'
import { calculateImagePlacement, preserveImageTransformOnFrameResize, renderSlot } from '@/lib/zine/slot-render'
import type { Slot, Spread, ZineAsset, ZineImageTransform } from '@/lib/zine/types'
import type { ZineViewOptions } from '@/lib/zine/view-options'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

import { SlotImageContent } from './SlotImageContent'
import { SlotTextContent } from './SlotTextContent'

const PT_TO_MM = 25.4 / 72
const ASSET_DRAG_TYPE = 'application/x-zine-asset-id'
const MIN_SLOT_MM = 5
const CROP_SCALE_STEP = 1.08
const CROP_NUDGE_MM = 1
const SNAP_ROTATION_DEGREES = [0, 45, 90, 135, 180, 225, 270, 315]
const SNAP_DIRECTIONS = { left: true, top: true, right: true, bottom: true, center: true, middle: true } as const

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
  viewOptions: ZineViewOptions
  onSelect?: (slotId: string) => void
}

function toScreenPx(valueMm: number, scale: number) {
  return valueMm * scale
}

function cropTransformStyle(transform: ZineImageTransform) {
  return `translate(${transform.offsetX}%, ${transform.offsetY}%) rotate(${transform.rotation}deg) scale(${transform.scale})`
}

function gestureGuideKey(guide: GestureGuide) {
  return `${guide.axis}:${guide.position}:${guide.kind}`
}

function imageBoundsStyle(slot: Extract<Slot, { kind: 'image' }>, asset: ZineAsset, transform: ZineImageTransform, scale: number): CSSProperties {
  const placement = calculateImagePlacement(slot.w, slot.h, asset.width, asset.height, transform)
  return {
    position: 'absolute',
    left: `${placement.left * scale}px`,
    top: `${placement.top * scale}px`,
    width: `${placement.width * scale}px`,
    height: `${placement.height * scale}px`,
    transform: `rotate(${placement.rotation}deg)`,
    transformOrigin: 'center',
  }
}

export function SlotView({ spread, slot, pageW, pageH, spreadW, bleed, assets, selected, scale, viewOptions, onSelect }: SlotViewProps) {
  const { language } = usePreferences()
  const slotAssetId = slot.kind === 'image' ? slot.assetId : null
  const slotRef = useRef<HTMLDivElement | null>(null)
  const moveableRef = useRef<Moveable | null>(null)
  const geometryRef = useRef<SlotGeometry>(toSlotGeometry(slot))
  const gestureSessionRef = useRef<GestureSession | null>(null)
  const cropSessionRef = useRef<CropSession | null>(null)
  const cropImageRef = useRef<HTMLImageElement | null>(null)
  const cropTransformRef = useRef<HTMLDivElement | null>(null)
  const cropControlsRef = useRef<HTMLDivElement | null>(null)
  const cropBoundsRef = useRef<HTMLDivElement | null>(null)
  const cropResizePointerRef = useRef<{
    pointerId: number
    centerX: number
    centerY: number
    startDistance: number
    startScale: number
  } | null>(null)
  const cropPointerRef = useRef<{
    pointerId: number
    x: number
    y: number
    originX: number
    originY: number
    axis: MovementAxis | null
  } | null>(null)
  const cropPreviewFrameRef = useRef<number | null>(null)
  const pendingCropPreviewRef = useRef<ZineImageTransform | null>(null)
  const previousAssetIdRef = useRef(slotAssetId)
  const activeGuideKeysRef = useRef('')
  const frameDragAxisRef = useRef<MovementAxis | null>(null)
  const frameDragLogRef = useRef({ moveCount: 0, lastLoggedAt: 0 })
  const resizeImageTransformRef = useRef<ZineImageTransform | null>(null)
  const resizeInitialImageTransformRef = useRef<ZineImageTransform | null>(null)
  const resizeImageStyleSnapshotRef = useRef<string | null>(null)
  const resizeImagePreviewRef = useRef<{
    frameLeftPx: number
    frameTopPx: number
    widthPx: number
    heightPx: number
    transform: string
    boundsLeftPx: number
    boundsTopPx: number
    boundsWidthPx: number
    boundsHeightPx: number
    boundsTransform: string
  } | null>(null)
  const cropDragLogRef = useRef({ moveCount: 0, lastLoggedAt: 0 })
  const dragDepthRef = useRef(0)
  const [dragOver, setDragOver] = useState(false)
  const [editingText, setEditingText] = useState(false)
  const [cropEditing, setCropEditing] = useState(false)
  const [activeGuides, setActiveGuides] = useState<GestureGuide[]>([])
  const [rotationSnap, setRotationSnap] = useState<number | null>(null)
  const updateSlot = useZineStore((state) => state.updateSlot)
  const gestureGuides = useMemo(() => buildGestureGuides(pageW, pageH, SAFE_MARGIN_MM), [pageH, pageW])
  const verticalGuidelines = useMemo(() => gestureGuides.filter((guide) => guide.axis === 'x').map((guide) => guide.position * scale), [gestureGuides, scale])
  const horizontalGuidelines = useMemo(() => gestureGuides.filter((guide) => guide.axis === 'y').map((guide) => guide.position * scale), [gestureGuides, scale])

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
  const textStyle = rendered.text
    ? { ...rendered.text.htmlStyle, fontSize: `${Number(rendered.text.htmlStyle.fontSize) * PT_TO_MM * scale}px` }
    : undefined

  useLayoutEffect(() => {
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
    const previousAssetId = previousAssetIdRef.current
    previousAssetIdRef.current = slotAssetId
    if (previousAssetId === slotAssetId) return
    if (cropSessionRef.current) {
      cropSessionRef.current = null
      cropResizePointerRef.current = null
      cancelCropPreview()
      releaseCropPointer()
      setCropEditing(false)
    }
    recordZineOperation('slot_asset_changed', {
      spreadId: spread.id,
      slotId: slot.id,
      previousAssetId,
      nextAssetId: slotAssetId,
      selected,
      geometry: toSlotGeometry(slot),
    }, { flush: true })
  }, [selected, slot, slotAssetId, spread.id])

  useEffect(() => {
    if (!selected) {
      setEditingText(false)
      if (cropEditing) commitCrop()
    }
  }, [selected])

  useEffect(() => {
    if (!cropEditing) return

    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        const initialTransform = cropSessionRef.current?.cancel()
        cropSessionRef.current = null
        cropResizePointerRef.current = null
        cancelCropPreview()
        if (initialTransform) applyCropPreview(initialTransform)
        releaseCropPointer()
        setCropEditing(false)
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        event.stopImmediatePropagation()
        commitCrop()
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        event.stopImmediatePropagation()
        cropSessionRef.current = null
        cropResizePointerRef.current = null
        cancelCropPreview()
        releaseCropPointer()
        setCropEditing(false)
        if (slot.kind === 'image') {
          updateSlot(spread.id, slot.id, {
            assetId: null,
            imageTransform: createDefaultImageTransform(),
          })
        }
        return
      }

      const nudges: Record<string, readonly [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      }
      const nudge = nudges[event.key]
      if (!nudge) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const step = (event.shiftKey ? 10 : 1) * CROP_NUDGE_MM * scale
      const next = cropSessionRef.current?.pan(
        nudge[0] * step,
        nudge[1] * step,
        slot.w * scale,
        slot.h * scale,
      )
      if (next) updateCrop(next)
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Node && (slotRef.current?.contains(target) || cropControlsRef.current?.contains(target))) return
      commitCrop()
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [cropEditing, slot])

  useEffect(() => () => {
    cancelCropPreview()
    releaseCropPointer()
  }, [])

  function applyCropPreview(transform: ZineImageTransform) {
    const transformLayer = cropTransformRef.current
    if (transformLayer) transformLayer.style.transform = cropTransformStyle(transform)
    if (cropBoundsRef.current && slot.kind === 'image' && asset) {
      Object.assign(cropBoundsRef.current.style, imageBoundsStyle(slot, asset, transform, scale))
    }
  }

  function cancelCropPreview() {
    if (cropPreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(cropPreviewFrameRef.current)
      cropPreviewFrameRef.current = null
    }
    pendingCropPreviewRef.current = null
  }

  function scheduleCropPreview(transform: ZineImageTransform) {
    pendingCropPreviewRef.current = transform
    if (cropPreviewFrameRef.current !== null) return

    cropPreviewFrameRef.current = window.requestAnimationFrame(() => {
      cropPreviewFrameRef.current = null
      const pending = pendingCropPreviewRef.current
      pendingCropPreviewRef.current = null
      if (pending) applyCropPreview(pending)
    })
  }

  function releaseCropPointer() {
    const pointer = cropPointerRef.current
    const element = slotRef.current
    cropPointerRef.current = null
    if (pointer && element?.hasPointerCapture(pointer.pointerId)) {
      element.releasePointerCapture(pointer.pointerId)
    }
  }

  function endCropResize(element: HTMLDivElement, pointerId: number) {
    if (cropResizePointerRef.current?.pointerId !== pointerId) return
    cropResizePointerRef.current = null
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId)
  }

  function resizeCropFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    const pointer = cropResizePointerRef.current
    if (!pointer || pointer.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const distance = Math.hypot(event.clientX - pointer.centerX, event.clientY - pointer.centerY)
    const factor = distance / pointer.startDistance
    const current = cropSessionRef.current?.getDraft() ?? (slot.kind === 'image' ? slot.imageTransform : null)
    if (!current) return
    updateCrop({ ...current, scale: clampCropScale(pointer.startScale * factor) })
  }

  function endCropPointer(element: HTMLDivElement, pointerId: number) {
    if (cropPointerRef.current?.pointerId !== pointerId) return
    cropPointerRef.current = null
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId)
  }

  function commitCrop() {
    const session = cropSessionRef.current
    if (slot.kind !== 'image' || !session) return
    const changed = session.changed()
    const transform = session.commit()
    cropSessionRef.current = null
    cropResizePointerRef.current = null
    cancelCropPreview()
    applyCropPreview(transform)
    releaseCropPointer()
    setCropEditing(false)
    recordZineOperation('crop_edit_committed', {
      spreadId: spread.id,
      slotId: slot.id,
      assetId: slotAssetId,
      changed,
      moveCount: cropDragLogRef.current.moveCount,
      imageTransform: transform,
    }, { flush: true })
    if (changed) updateSlot(spread.id, slot.id, { imageTransform: transform })
  }

  function beginCrop() {
    if (slot.kind !== 'image' || !asset || cropSessionRef.current) return
    const session = new CropSession(slot.imageTransform)
    cropSessionRef.current = session
    cropDragLogRef.current = { moveCount: 0, lastLoggedAt: 0 }
    applyCropPreview(session.getDraft())
    setCropEditing(true)
    onSelect?.(slot.id)
    recordZineOperation('crop_edit_started', {
      spreadId: spread.id,
      slotId: slot.id,
      assetId: slot.assetId,
      imageTransform: slot.imageTransform,
    }, { flush: true })
  }

  function updateCrop(next: ZineImageTransform) {
    cropSessionRef.current?.update(next)
    scheduleCropPreview(next)
  }

  function commitGeometry() {
    const session = gestureSessionRef.current
    if (!session) return
    const result = session.commit(slot)
    gestureSessionRef.current = null
    activeGuideKeysRef.current = ''
    setActiveGuides((current) => current.length === 0 ? current : [])
    setRotationSnap(null)
    geometryRef.current = result.geometry
    commitLiveGeometry(result.geometry, resizeImageTransformRef.current ?? undefined)
    const imageTransform = resizeImageTransformRef.current
    resizeImageTransformRef.current = null
    resizeInitialImageTransformRef.current = null
    resizeImageStyleSnapshotRef.current = null
    resizeImagePreviewRef.current = null
    if (!result.changed) return
    updateSlot(spread.id, slot.id, { ...result.geometry, page: result.page, ...(imageTransform ? { imageTransform } : {}) })
  }

  function resetLiveStyle() {
    commitLiveGeometry(geometryRef.current)
  }

  function commitLiveGeometry(
    next: SlotGeometry,
    imageTransform = slot.kind === 'image' ? slot.imageTransform : undefined,
    updateImageLayer = true,
  ) {
    const element = slotRef.current
    if (!element) return
    element.style.left = `${toScreenPx(next.x, scale)}px`
    element.style.top = `${toScreenPx(next.y, scale)}px`
    element.style.width = `${toScreenPx(next.w, scale)}px`
    element.style.height = `${toScreenPx(next.h, scale)}px`
    element.style.transform = `rotate(${next.rotation}deg)`

    const outlineLayer = cropControlsRef.current
    if (outlineLayer) {
      outlineLayer.style.left = `${toScreenPx(next.x, scale)}px`
      outlineLayer.style.top = `${toScreenPx(next.y, scale)}px`
      outlineLayer.style.width = `${toScreenPx(next.w, scale)}px`
      outlineLayer.style.height = `${toScreenPx(next.h, scale)}px`
      outlineLayer.style.transform = `rotate(${next.rotation}deg)`
    }
    if (updateImageLayer && cropBoundsRef.current && slot.kind === 'image' && asset) {
      Object.assign(cropBoundsRef.current.style, imageBoundsStyle({ ...slot, ...next }, asset, imageTransform ?? slot.imageTransform, scale))
    }
    if (updateImageLayer && cropTransformRef.current && imageTransform) {
      cropTransformRef.current.style.transform = cropTransformStyle(imageTransform)
    }
  }

  function applyLiveResizeGeometry(
    next: SlotGeometry,
    widthPx: number,
    heightPx: number,
    dragTransform: string,
    imageTransform?: ZineImageTransform,
  ) {
    const element = slotRef.current
    if (!element) return
    element.style.width = `${widthPx}px`
    element.style.height = `${heightPx}px`
    element.style.transform = dragTransform

    const outlineLayer = cropControlsRef.current
    if (outlineLayer) {
      outlineLayer.style.width = `${widthPx}px`
      outlineLayer.style.height = `${heightPx}px`
      outlineLayer.style.transform = dragTransform
    }
    if (!imageTransform && cropBoundsRef.current && slot.kind === 'image' && asset) {
      Object.assign(cropBoundsRef.current.style, imageBoundsStyle({ ...slot, ...next }, asset, slot.imageTransform, scale))
    }
  }

  function applyUnboundResizePreview(next: SlotGeometry) {
    const layer = cropTransformRef.current
    const preview = resizeImagePreviewRef.current
    if (!layer || !preview) return
    Object.assign(layer.style, {
      inset: 'auto',
      left: `${preview.frameLeftPx - toScreenPx(next.x, scale)}px`,
      top: `${preview.frameTopPx - toScreenPx(next.y, scale)}px`,
      width: `${preview.widthPx}px`,
      height: `${preview.heightPx}px`,
      transform: preview.transform,
      transformOrigin: 'center',
    })
    if (cropBoundsRef.current) {
      Object.assign(cropBoundsRef.current.style, {
        left: `${preview.boundsLeftPx - toScreenPx(next.x, scale)}px`,
        top: `${preview.boundsTopPx - toScreenPx(next.y, scale)}px`,
        width: `${preview.boundsWidthPx}px`,
        height: `${preview.boundsHeightPx}px`,
        transform: preview.boundsTransform,
        transformOrigin: 'center',
      })
    }
  }

  function restoreImageTransformLayer() {
    const layer = cropTransformRef.current
    const snapshot = resizeImageStyleSnapshotRef.current
    if (!layer || snapshot === null) return
    layer.style.cssText = snapshot
  }

  function beginGeometryGesture(kind: GestureKind, resizeDirection?: readonly [number, number]) {
    resizeImageTransformRef.current = null
    resizeInitialImageTransformRef.current = null
    resizeImageStyleSnapshotRef.current = null
    resizeImagePreviewRef.current = null
    const initial = toSlotGeometry(slot)
    geometryRef.current = initial
    gestureSessionRef.current = new GestureSession(initial, {
      kind,
      pageW,
      guides: viewOptions.snapToGuides ? gestureGuides : [],
      snapThreshold: 4 / scale,
      boundary: { bleed, pageH, spreadW },
      resizeDirection,
      rotationSnapDegrees: viewOptions.snapToGuides ? SNAP_ROTATION_DEGREES : [],
      rotationSnapThreshold: 3,
    })
    activeGuideKeysRef.current = ''
    setActiveGuides((current) => current.length === 0 ? current : [])
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
      {viewOptions.showGuides && activeGuides.map((guide) => {
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
          cursor: cropEditing ? 'grab' : selected ? 'move' : 'pointer',
          touchAction: cropEditing ? 'none' : undefined,
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
          if (event.key === 'Enter' && slot.kind === 'image' && selected && asset) {
            beginCrop()
            return
          }
          if (event.key === 'Enter' && slot.kind === 'text' && selected) {
            setEditingText(true)
            return
          }
          onSelect?.(slot.id)
        }}
        onPointerDown={(event) => {
          if (!cropEditing || slot.kind !== 'image' || event.button !== 0 || !event.isPrimary) return
          event.preventDefault()
          event.stopPropagation()
          cropPointerRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            originX: event.clientX,
            originY: event.clientY,
            axis: null,
          }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const pointer = cropPointerRef.current
          if (!pointer || pointer.pointerId !== event.pointerId || slot.kind !== 'image') return
          event.preventDefault()
          const nextAxis = event.shiftKey
            ? pointer.axis ?? getDominantMovementAxis(event.clientX - pointer.originX, event.clientY - pointer.originY)
            : null
          const rawDeltaX = event.clientX - pointer.x
          const rawDeltaY = event.clientY - pointer.y
          const [deltaX, deltaY] = nextAxis
            ? constrainMovementToAxis(rawDeltaX, rawDeltaY, nextAxis)
            : [rawDeltaX, rawDeltaY]
          const next = cropSessionRef.current?.pan(deltaX, deltaY, slot.w * scale, slot.h * scale)
          if (next) updateCrop(next)
          cropPointerRef.current = { ...pointer, x: event.clientX, y: event.clientY, axis: nextAxis }
          const now = performance.now()
          const logState = cropDragLogRef.current
          logState.moveCount += 1
          if (logState.moveCount === 1 || now - logState.lastLoggedAt >= 250) {
            logState.lastLoggedAt = now
            recordZineOperation('crop_drag_sample', {
              spreadId: spread.id,
              slotId: slot.id,
              assetId: slot.assetId,
              moveCount: logState.moveCount,
              deltaX,
              deltaY,
              imageTransform: next,
            }, { flush: logState.moveCount === 1 })
          }
        }}
        onPointerUp={(event) => {
          endCropPointer(event.currentTarget, event.pointerId)
        }}
        onPointerCancel={(event) => endCropPointer(event.currentTarget, event.pointerId)}
        onLostPointerCapture={(event) => {
          if (cropPointerRef.current?.pointerId === event.pointerId) cropPointerRef.current = null
        }}
        onWheel={(event) => {
          if (!cropEditing || slot.kind !== 'image' || event.shiftKey) return
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
            updateSlot(spread.id, slot.id, {
              assetId,
              ...(slot.assetId !== assetId ? { imageTransform: createDefaultImageTransform() } : {}),
            })
            onSelect?.(slot.id)
          }
        } : undefined}
        aria-pressed={selected}
        aria-label={t(slot.kind === 'image' ? 'admin.zine_slot_image' : 'admin.zine_slot_text', language)}
      >
        {slot.kind === 'image' && (
          <SlotImageContent
            asset={asset}
            imageRef={cropImageRef}
            transformRef={cropTransformRef}
            innerStyle={rendered.imageInner?.htmlStyle}
            imageStyle={rendered.imageInner?.imageStyle}
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
        {cropEditing && (
          <div
            className="pointer-events-none absolute inset-0 z-20 border-2 border-primary"
            aria-hidden="true"
          />
        )}
        {rotationSnap !== null && (
          <span className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white shadow-sm">
            {rotationSnap}°
          </span>
        )}
      </div>
      {(cropEditing || viewOptions.showImageOutlines) && slot.kind === 'image' && asset && (
        <div
          ref={cropControlsRef}
          className="pointer-events-none absolute overflow-visible"
          style={{
            ...slotStyle,
            zIndex: Number(slotStyle.zIndex) + 1,
            overflow: 'visible',
          }}
        >
          <div
            ref={cropBoundsRef}
            className={`pointer-events-none border ${cropEditing ? 'border-primary' : 'border-dashed'}`}
            style={{
              ...imageBoundsStyle(slot, asset, slot.imageTransform, scale),
              ...(!cropEditing ? { borderColor: 'rgba(100, 116, 139, 0.42)' } : {}),
            }}
          >
            {cropEditing && ([
              ['nw', '-translate-x-1/2 -translate-y-1/2', 'left-0 top-0'],
              ['ne', 'translate-x-1/2 -translate-y-1/2', 'right-0 top-0'],
              ['sw', '-translate-x-1/2 translate-y-1/2', 'bottom-0 left-0'],
              ['se', 'translate-x-1/2 translate-y-1/2', 'bottom-0 right-0'],
            ] as const).map(([direction, transform, position]) => (
              <div
                key={direction}
                role="button"
                tabIndex={0}
                aria-label={t('admin.zine_resize_image', language)}
                className={`pointer-events-auto absolute h-3 w-3 touch-none border-2 border-primary bg-background ${transform} ${position}`}
                style={{ cursor: `${direction}-resize` }}
                onPointerDown={(event) => {
                  if (event.button !== 0 || !event.isPrimary) return
                  event.preventDefault()
                  event.stopPropagation()
                  const current = cropSessionRef.current?.getDraft() ?? slot.imageTransform
                  const bounds = cropBoundsRef.current?.getBoundingClientRect()
                  if (!bounds) return
                  const centerX = bounds.left + bounds.width / 2
                  const centerY = bounds.top + bounds.height / 2
                  cropResizePointerRef.current = {
                    pointerId: event.pointerId,
                    centerX,
                    centerY,
                    startDistance: Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
                    startScale: current.scale,
                  }
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onPointerMove={resizeCropFromPointer}
                onPointerUp={(event) => endCropResize(event.currentTarget, event.pointerId)}
                onPointerCancel={(event) => endCropResize(event.currentTarget, event.pointerId)}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onDoubleClick={(event) => event.stopPropagation()}
                onLostPointerCapture={(event) => {
                  if (cropResizePointerRef.current?.pointerId === event.pointerId) {
                    cropResizePointerRef.current = null
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}
      {selected && !cropEditing && (
        <Moveable
          ref={moveableRef}
          target={slotRef}
          flushSync={flushSync}
          draggable
          resizable
          rotatable
          snappable={viewOptions.snapToGuides}
          snapThreshold={4}
          snapDirections={SNAP_DIRECTIONS}
          verticalGuidelines={viewOptions.snapToGuides ? verticalGuidelines : []}
          horizontalGuidelines={viewOptions.snapToGuides ? horizontalGuidelines : []}
          snapRotationDegrees={viewOptions.snapToGuides ? SNAP_ROTATION_DEGREES : []}
          snapRotationThreshold={3}
          checkInput
          onSnap={({ guidelines }) => {
            const matched = guidelines.flatMap((guideline) => {
              const axis = guideline.type === 'vertical' ? 'x' : 'y'
              const position = (axis === 'x' ? guideline.pos[0] : guideline.pos[1]) / scale
              const guide = gestureGuides.find((candidate) => candidate.axis === axis && Math.abs(candidate.position - position) < 0.25)
              return guide ? [guide] : []
            })
            const nextGuides = Array.from(new Map(matched.map((guide) => [gestureGuideKey(guide), guide])).values())
              .sort((a, b) => gestureGuideKey(a).localeCompare(gestureGuideKey(b)))
            const nextKeys = nextGuides.map(gestureGuideKey).join('|')
            if (activeGuideKeysRef.current === nextKeys) return
            activeGuideKeysRef.current = nextKeys
            setActiveGuides(nextGuides)
            recordZineOperation('frame_snap_changed', {
              spreadId: spread.id,
              slotId: slot.id,
              guideKeys: nextKeys,
            })
          }}
          onDragStart={({ set }) => {
            beginGeometryGesture('drag')
            frameDragAxisRef.current = null
            frameDragLogRef.current = { moveCount: 0, lastLoggedAt: 0 }
            set([0, 0])
            const image = cropImageRef.current
            recordZineOperation('frame_drag_started', {
              spreadId: spread.id,
              slotId: slot.id,
              assetId: slotAssetId,
              geometry: toSlotGeometry(slot),
              scale,
              image: image ? {
                complete: image.complete,
                naturalWidth: image.naturalWidth,
                naturalHeight: image.naturalHeight,
              } : null,
            }, { flush: true })
          }}
          onDrag={({ beforeTranslate, inputEvent }) => {
            const initial = gestureSessionRef.current?.initial ?? toSlotGeometry(slot)
            const shiftKey = inputEvent && 'shiftKey' in inputEvent ? Boolean(inputEvent.shiftKey) : false
            const axis = shiftKey
              ? frameDragAxisRef.current ?? getDominantMovementAxis(beforeTranslate[0], beforeTranslate[1])
              : null
            frameDragAxisRef.current = axis
            const translation = axis
              ? constrainMovementToAxis(beforeTranslate[0], beforeTranslate[1], axis)
              : beforeTranslate
            const next = { ...initial, x: initial.x + translation[0] / scale, y: initial.y + translation[1] / scale }
            updateGeometryDraft(next)
            commitLiveGeometry(next)
            const now = performance.now()
            const logState = frameDragLogRef.current
            logState.moveCount += 1
            if (logState.moveCount === 1 || now - logState.lastLoggedAt >= 250) {
              logState.lastLoggedAt = now
              recordZineOperation('frame_drag_sample', {
                spreadId: spread.id,
                slotId: slot.id,
                assetId: slotAssetId,
                moveCount: logState.moveCount,
                beforeTranslate: translation,
                geometry: next,
              }, { flush: logState.moveCount === 1 })
            }
          }}
          onDragEnd={() => {
            frameDragAxisRef.current = null
            recordZineOperation('frame_drag_ended', {
              spreadId: spread.id,
              slotId: slot.id,
              assetId: slotAssetId,
              moveCount: frameDragLogRef.current.moveCount,
              geometry: geometryRef.current,
            }, { flush: true })
            commitGeometry()
          }}
          onResizeStart={({ dragStart, direction, setMin }) => {
            beginGeometryGesture('resize', direction as [number, number])
            setMin([MIN_SLOT_MM * scale, MIN_SLOT_MM * scale])
            if (slot.kind === 'image' && asset && slot.imageFrameBinding === false) {
              resizeImageTransformRef.current = slot.imageTransform
              resizeInitialImageTransformRef.current = slot.imageTransform
              const placement = calculateImagePlacement(slot.w, slot.h, asset.width, asset.height, slot.imageTransform)
              resizeImagePreviewRef.current = {
                frameLeftPx: toScreenPx(slot.x, scale),
                frameTopPx: toScreenPx(slot.y, scale),
                widthPx: toScreenPx(slot.w, scale),
                heightPx: toScreenPx(slot.h, scale),
                transform: cropTransformStyle(slot.imageTransform),
                boundsLeftPx: toScreenPx(slot.x + placement.left, scale),
                boundsTopPx: toScreenPx(slot.y + placement.top, scale),
                boundsWidthPx: toScreenPx(placement.width, scale),
                boundsHeightPx: toScreenPx(placement.height, scale),
                boundsTransform: `rotate(${placement.rotation}deg)`,
              }
              if (cropTransformRef.current) {
                resizeImageStyleSnapshotRef.current = cropTransformRef.current.style.cssText
              }
            }
            if (dragStart) dragStart.set([0, 0])
          }}
          onResize={({ width, height, drag }) => {
            const initial = gestureSessionRef.current?.initial ?? toSlotGeometry(slot)
            const next = {
              ...initial,
              x: initial.x + drag.beforeTranslate[0] / scale,
              y: initial.y + drag.beforeTranslate[1] / scale,
              w: Math.max(MIN_SLOT_MM, width / scale),
              h: Math.max(MIN_SLOT_MM, height / scale),
            }
            const imageTransform = slot.kind === 'image' && asset && slot.imageFrameBinding === false
              ? preserveImageTransformOnFrameResize(
                gestureSessionRef.current?.initial ?? toSlotGeometry(slot),
                next,
                asset.width,
                asset.height,
                resizeInitialImageTransformRef.current ?? slot.imageTransform,
              )
              : undefined
            if (imageTransform) resizeImageTransformRef.current = imageTransform
            updateGeometryDraft(next)
            applyLiveResizeGeometry(next, width, height, drag.transform, imageTransform)
            if (imageTransform) applyUnboundResizePreview(next)
          }}
          onResizeEnd={() => {
            restoreImageTransformLayer()
            commitGeometry()
          }}
          onRotateStart={({ set }) => {
            beginGeometryGesture('rotate')
            set(slot.rotation)
          }}
          onRotate={({ beforeRotate }) => {
            const initial = gestureSessionRef.current?.initial ?? toSlotGeometry(slot)
            const next = { ...initial, rotation: beforeRotate }
            const rotationFeedback = snapGestureRotation(beforeRotate, viewOptions.snapToGuides ? SNAP_ROTATION_DEGREES : [], 3)
            setRotationSnap(rotationFeedback.snapped ? rotationFeedback.rotation : null)
            updateGeometryDraft(next)
            commitLiveGeometry(next)
          }}
          onRotateEnd={commitGeometry}
        />
      )}
    </>
  )
}
