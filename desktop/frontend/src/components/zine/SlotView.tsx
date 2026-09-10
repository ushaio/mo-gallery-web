import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal, flushSync } from 'react-dom'
import Moveable from 'react-moveable'
import { Check, Crop, LockKeyhole, RotateCcw, TriangleAlert, X } from 'lucide-react'

import { toFrameDelta, toSlotGeometry, type SlotGeometry } from '@/lib/zine/geometry'
import { clampCropScale, createDefaultImageTransform, CropSession } from '@/lib/zine/crop-session'
import { isZineControlTarget, isZineEditableTarget as isEditableTarget, isZineShortcutTarget } from '@/lib/zine/editor-input'
import { applyGestureBoundary, buildGestureGuides, constrainMovementToAxis, GestureSession, getDominantMovementAxis, snapGestureRotation, type GestureGuide, type GestureKind, type MovementAxis } from '@/lib/zine/gesture-session'
import { t } from '@/lib/i18n'
import { calculateEffectiveDpi, MIN_PRINT_DPI, SAFE_MARGIN_MM } from '@/lib/zine/print'
import { recordZineOperation } from '@/lib/zine/operation-log'
import { useZinePreviewFont } from '@/lib/zine/preview-fonts'
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
  interactionDisabled?: boolean
  preview?: boolean
}

interface SlotInteractionActions {
  beginCrop: () => void
  cancelCrop: () => void
  cancelGeometry: () => void
  commitCrop: () => void
  endEditRequest: () => void
  updateCrop: (transform: ZineImageTransform) => void
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

export const SlotView = memo(function SlotView({ spread, slot, pageW, pageH, spreadW, bleed, assets, selected, scale, viewOptions, onSelect, interactionDisabled = false, preview = false }: SlotViewProps) {
  const language = usePreferences((state) => state.language)
  const aiBusy = useZineStore((state) => state.aiTaskId !== null)
  const editRequested = useZineStore((state) => state.editingSlotId === slot.id)
  const editSlot = useZineStore((state) => state.editSlot)
  const canEdit = !slot.locked && !aiBusy && !interactionDisabled
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
  const actionsRef = useRef<SlotInteractionActions | null>(null)
  const gestureGuides = useMemo(() => buildGestureGuides(pageW, pageH, SAFE_MARGIN_MM), [pageH, pageW])
  const verticalGuidelines = useMemo(() => gestureGuides.filter((guide) => guide.axis === 'x').map((guide) => guide.position * scale), [gestureGuides, scale])
  const horizontalGuidelines = useMemo(() => gestureGuides.filter((guide) => guide.axis === 'y').map((guide) => guide.position * scale), [gestureGuides, scale])

  const rendered = useMemo(() => renderSlot(slot, pageW, assets), [slot, pageW, assets])
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
  const previewFont = useZinePreviewFont(slot.kind === 'text' ? slot.fontFamily || 'serif' : undefined, slot.kind === 'text' ? slot.content : '')
  const textStyle = rendered.text
    ? { ...rendered.text.htmlStyle, fontFamily: previewFont.fontFamily, fontSize: `${Number(rendered.text.htmlStyle.fontSize) * PT_TO_MM * scale}px` }
    : undefined

  // Native gesture listeners outlive a render. Publish the current handlers
  // before effects run, so callbacks never commit an older slot or scale.
  useLayoutEffect(() => {
    actionsRef.current = { beginCrop, cancelCrop, cancelGeometry, commitCrop, endEditRequest, updateCrop }
  })

  useLayoutEffect(() => {
    if (gestureSessionRef.current) return
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
    if (!canEdit) {
      actionsRef.current?.cancelGeometry()
      actionsRef.current?.cancelCrop()
      actionsRef.current?.endEditRequest()
      setEditingText(false)
      return
    }
    if (selected && editRequested) {
      if (slot.kind === 'text') setEditingText(true)
      else actionsRef.current?.beginCrop()
    } else {
      setEditingText(false)
      if (cropSessionRef.current) actionsRef.current?.commitCrop()
    }
  }, [selected, editRequested, canEdit, slot.kind])

  useEffect(() => {
    if (!selected) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !gestureSessionRef.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
      actionsRef.current?.cancelGeometry()
    }
    function onCancel() {
      actionsRef.current?.cancelGeometry()
      actionsRef.current?.cancelCrop()
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', onCancel)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', onCancel)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [selected])

  useEffect(() => {
    if (!cropEditing) return
    const element = slotRef.current
    if (!element) return
    function onWheel(event: WheelEvent) {
      if (event.shiftKey || event.ctrlKey || event.metaKey) return
      event.preventDefault()
      event.stopPropagation()
      const next = cropSessionRef.current?.zoom(event.deltaY, CROP_SCALE_STEP)
      if (next) actionsRef.current?.updateCrop(next)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [cropEditing, slot, scale])

  useEffect(() => {
    if (!cropEditing) return

    function onKeyDown(event: KeyboardEvent) {
      if (!isZineShortcutTarget(event.target)) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        actionsRef.current?.cancelCrop()
        return
      }

      if (isZineControlTarget(event.target)) return

      if (event.key === 'Enter') {
        event.preventDefault()
        event.stopImmediatePropagation()
        actionsRef.current?.commitCrop()
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.stopImmediatePropagation()
        actionsRef.current?.cancelCrop()
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
        actionsRef.current?.endEditRequest()
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
        slot.rotation,
      )
      if (next) actionsRef.current?.updateCrop(next)
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Element && target.closest('[data-zine-crop-controls]')) return
      if (target instanceof Node && (slotRef.current?.contains(target) || cropControlsRef.current?.contains(target))) return
      actionsRef.current?.commitCrop()
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [cropEditing, slot, scale, spread.id, updateSlot])

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
    endEditRequest()
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
    if (cropSessionRef.current) return
    if (!canEdit || slot.kind !== 'image' || !asset) {
      endEditRequest()
      return
    }
    const session = new CropSession(slot.imageTransform)
    cropSessionRef.current = session
    cropDragLogRef.current = { moveCount: 0, lastLoggedAt: 0 }
    applyCropPreview(session.getDraft())
    setCropEditing(true)
    onSelect?.(slot.id)
    editSlot(slot.id)
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

  function endEditRequest() {
    if (useZineStore.getState().editingSlotId === slot.id) editSlot(null)
  }

  function cancelCrop() {
    const session = cropSessionRef.current
    if (!session) return
    cropSessionRef.current = null
    cropResizePointerRef.current = null
    cancelCropPreview()
    applyCropPreview(session.cancel())
    releaseCropPointer()
    setCropEditing(false)
    endEditRequest()
  }

  function clearGestureFeedback() {
    if (slotRef.current) delete slotRef.current.dataset.zineGesture
    activeGuideKeysRef.current = ''
    setActiveGuides((current) => current.length === 0 ? current : [])
    setRotationSnap(null)
    frameDragAxisRef.current = null
  }

  function cancelGeometry() {
    const session = gestureSessionRef.current
    if (!session) return
    gestureSessionRef.current = null
    moveableRef.current?.stopDrag()
    restoreImageTransformLayer()
    geometryRef.current = session.initial
    commitLiveGeometry(session.initial)
    resizeInitialImageTransformRef.current = null
    resizeImageStyleSnapshotRef.current = null
    resizeImagePreviewRef.current = null
    clearGestureFeedback()
    moveableRef.current?.updateRect()
  }

  function commitGeometry() {
    const session = gestureSessionRef.current
    if (!session) return
    const result = session.commit(slot)
    gestureSessionRef.current = null
    clearGestureFeedback()
    geometryRef.current = result.geometry
    const imageTransform = result.changed && slot.kind === 'image' && asset && resizeInitialImageTransformRef.current
      ? preserveImageTransformOnFrameResize(session.initial, result.geometry, asset.width, asset.height, resizeInitialImageTransformRef.current)
      : undefined
    commitLiveGeometry(result.geometry, imageTransform)
    resizeInitialImageTransformRef.current = null
    resizeImageStyleSnapshotRef.current = null
    resizeImagePreviewRef.current = null
    if (!result.changed) return
    updateSlot(spread.id, slot.id, { ...result.geometry, page: result.page, ...(imageTransform ? { imageTransform } : {}) })
  }

  function applyLiveDrag(deltaX: number, deltaY: number, rotation: number) {
    // Keep the layout origin fixed for the whole gesture. Moveable measures the
    // transformed target; changing left/top here makes that origin drift.
    const transform = `translate3d(${deltaX}px, ${deltaY}px, 0) rotate(${rotation}deg)`
    if (slotRef.current) slotRef.current.style.transform = transform
    if (cropControlsRef.current) cropControlsRef.current.style.transform = transform
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
    syncCoverImage(next.w, next.h)

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
    if (!imageTransform) syncCoverImage(next.w, next.h)

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

  function syncCoverImage(width: number, height: number) {
    const image = cropImageRef.current
    if (!image || !asset || asset.width <= 0 || asset.height <= 0) return
    const wider = asset.width / asset.height >= width / height
    image.style.width = wider ? 'auto' : '100%'
    image.style.height = wider ? '100%' : 'auto'
  }

  function applyUnboundResizePreview(next: SlotGeometry) {
    const layer = cropTransformRef.current
    const preview = resizeImagePreviewRef.current
    if (!layer || !preview) return
    const [deltaX, deltaY] = toFrameDelta(
      preview.frameLeftPx + preview.widthPx / 2 - toScreenPx(next.x + next.w / 2, scale),
      preview.frameTopPx + preview.heightPx / 2 - toScreenPx(next.y + next.h / 2, scale),
      next.rotation,
    )
    const left = toScreenPx(next.w, scale) / 2 - preview.widthPx / 2 + deltaX
    const top = toScreenPx(next.h, scale) / 2 - preview.heightPx / 2 + deltaY
    Object.assign(layer.style, {
      inset: 'auto',
      left: `${left}px`,
      top: `${top}px`,
      width: `${preview.widthPx}px`,
      height: `${preview.heightPx}px`,
      transform: preview.transform,
      transformOrigin: 'center',
    })
    if (cropBoundsRef.current) {
      Object.assign(cropBoundsRef.current.style, {
        left: `${preview.boundsLeftPx - preview.frameLeftPx + left}px`,
        top: `${preview.boundsTopPx - preview.frameTopPx + top}px`,
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
    if (slotRef.current) slotRef.current.dataset.zineGesture = 'true'
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
      snapOnCommit: false,
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
        tabIndex={preview ? -1 : 0}
        data-zine-slot={slot.id}
        data-zine-locked={slot.locked || undefined}
        data-zine-font-loading={previewFont.loading || undefined}
        data-zine-font-error={previewFont.error || undefined}
        className="group text-left outline-none"
        style={{
          ...slotStyle,
          cursor: interactionDisabled ? 'inherit' : slot.locked ? 'default' : cropEditing ? 'grab' : selected ? 'move' : 'pointer',
          touchAction: 'none',
          willChange: selected ? 'transform' : undefined,
        }}
        onClick={(event) => {
          event.stopPropagation()
          if (interactionDisabled) return
          onSelect?.(slot.id)
        }}
        onFocus={(event) => {
          if (!interactionDisabled && event.target === event.currentTarget) onSelect?.(slot.id)
        }}
        onMouseDown={(event) => {
          if (event.button !== 0 || !canEdit || cropEditing || editingText || isEditableTarget(event.target)) return
          if (event.target instanceof Element && event.target.closest('button')) return
          event.currentTarget.focus({ preventScroll: true })
          if (selected) return
          // Mount the active Moveable before forwarding this same press so a
          // previously unselected element can be grabbed in one gesture.
          event.preventDefault()
          flushSync(() => onSelect?.(slot.id))
          moveableRef.current?.dragStart(event.nativeEvent)
        }}
        onDoubleClick={(event) => {
          event.stopPropagation()
          if (!canEdit) return
          if (slot.kind === 'text') {
            onSelect?.(slot.id)
            setEditingText(true)
            editSlot(slot.id)
          } else {
            beginCrop()
          }
        }}
        onKeyDown={(event) => {
          if (!canEdit || isEditableTarget(event.target) || event.key !== 'Enter') return
          event.preventDefault()
          event.stopPropagation()
          if (event.key === 'Enter' && slot.kind === 'image' && selected && asset) {
            beginCrop()
            return
          }
          if (event.key === 'Enter' && slot.kind === 'text' && selected) {
            setEditingText(true)
            editSlot(slot.id)
            return
          }
          onSelect?.(slot.id)
        }}
        onPointerDown={(event) => {
          if (!canEdit || !cropEditing || slot.kind !== 'image' || event.button !== 0 || !event.isPrimary) return
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
          const next = cropSessionRef.current?.pan(deltaX, deltaY, slot.w * scale, slot.h * scale, slot.rotation)
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
        onDragEnter={slot.kind === 'image' ? (event) => {
          if (!canEdit || !isAssetDrag(event)) return
          event.preventDefault()
          dragDepthRef.current += 1
          setDragOver(true)
        } : undefined}
        onDragOver={slot.kind === 'image' ? (event) => {
          if (!canEdit || !isAssetDrag(event)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        } : undefined}
        onDragLeave={slot.kind === 'image' ? () => {
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
          if (dragDepthRef.current === 0) setDragOver(false)
        } : undefined}
        onDrop={slot.kind === 'image' ? (event) => {
          if (!canEdit || !isAssetDrag(event)) return
          event.preventDefault()
          event.stopPropagation()
          dragDepthRef.current = 0
          setDragOver(false)
          const assetId = event.dataTransfer.getData(ASSET_DRAG_TYPE)
          if (assetId && assets.some((candidate) => candidate.id === assetId)) {
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
        {slot.kind === 'image' && (!preview || asset) && (
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
            onReplace={canEdit ? () => updateSlot(spread.id, slot.id, { assetId: null }) : undefined}
          />
        )}
        {slot.kind === 'text' && rendered.text && (
          <SlotTextContent
            content={rendered.text.content}
            style={textStyle}
            placeholder={preview ? undefined : t('admin.zine_text_edit_hint', language)}
            editing={editingText}
            onEditEnd={() => {
              setEditingText(false)
              endEditRequest()
            }}
            onChange={(content) => {
              if (content !== slot.content) updateSlot(spread.id, slot.id, { content })
            }}
          />
        )}

        {previewFont.error && !preview && (
          <span
            role="img"
            aria-label={previewFont.error}
            title={previewFont.error}
            className="absolute right-1 top-1 z-10 rounded-full bg-destructive p-1 text-destructive-foreground shadow-sm"
          >
            <TriangleAlert size={10} />
          </span>
        )}
        {lowRes && !dragOver && !preview && (
          <span
            className="pointer-events-none absolute right-1 top-1 z-10 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm"
            style={{ backgroundColor: 'rgba(217, 119, 6, 0.92)' }}
            title={t('admin.zine_low_res_hint', language, { dpi: Math.round(effectiveDpi), min: MIN_PRINT_DPI })}
          >
            <TriangleAlert size={10} />
            {slotHeightPx > 44 && `${Math.round(effectiveDpi)} PPI`}
          </span>
        )}
        {(isEmptyImage || isEmptyText) && !dragOver && !preview && <div className="pointer-events-none absolute inset-0 border border-dashed" style={{ borderColor: 'rgba(113, 113, 122, 0.5)' }} />}
        {!selected && !dragOver && !interactionDisabled && <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--primary) 60%, transparent)' }} />}
        {selected && slot.locked && !preview && <div className="pointer-events-none absolute inset-0 border border-dashed border-primary"><LockKeyhole size={14} className="absolute right-1 top-1 rounded bg-background p-0.5 text-primary" /></div>}
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
      {!preview && (cropEditing || viewOptions.showImageOutlines) && slot.kind === 'image' && asset && (
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
      {selected && canEdit && !cropEditing && !editingText && (
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
          preventClickEventOnDrag
          preventDefault
          hideDefaultLines={false}
          origin={false}
          controlPadding={5}
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
            const next = applyGestureBoundary(
              { ...initial, x: initial.x + translation[0] / scale, y: initial.y + translation[1] / scale },
              { bleed, pageH, spreadW },
            )
            updateGeometryDraft(next)
            applyLiveDrag((next.x - initial.x) * scale, (next.y - initial.y) * scale, initial.rotation)
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
            const next = applyGestureBoundary({
              ...initial,
              x: initial.x + drag.beforeTranslate[0] / scale,
              y: initial.y + drag.beforeTranslate[1] / scale,
              w: Math.max(MIN_SLOT_MM, width / scale),
              h: Math.max(MIN_SLOT_MM, height / scale),
            }, { bleed, pageH, spreadW })
            const imageTransform = slot.kind === 'image' && asset && slot.imageFrameBinding === false
              ? preserveImageTransformOnFrameResize(
                gestureSessionRef.current?.initial ?? toSlotGeometry(slot),
                next,
                asset.width,
                asset.height,
                resizeInitialImageTransformRef.current ?? slot.imageTransform,
              )
              : undefined
            updateGeometryDraft(next)
            const transform = `translate3d(${(next.x - initial.x) * scale}px, ${(next.y - initial.y) * scale}px, 0) rotate(${initial.rotation}deg)`
            applyLiveResizeGeometry(next, width, height, transform, imageTransform)
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
      {cropEditing && slotRef.current?.closest('[data-zine-canvas]') && createPortal(
        <div
          data-zine-crop-controls
          role="toolbar"
          aria-label={language === 'zh' ? '调整图片' : 'Adjust image'}
          className="absolute bottom-14 left-1/2 z-50 flex w-max max-w-[calc(100%_-_24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className="flex items-center gap-1.5 px-2 text-xs font-medium"><Crop size={14} />{language === 'zh' ? '调整图片' : 'Adjust image'}</span>
          <span className="hidden pr-2 text-[10px] text-muted-foreground xl:inline">{language === 'zh' ? '拖动取景 · 滚轮缩放' : 'Drag to position · Scroll to zoom'}</span>
          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring" aria-label={t('admin.zine_reset_crop', language)} title={t('admin.zine_reset_crop', language)} onClick={() => {
            const next = cropSessionRef.current?.reset()
            if (next) updateCrop(next)
          }}><RotateCcw size={14} /></button>
          <button type="button" className="flex h-8 items-center gap-1 rounded-md px-2 text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring" title="Esc" onClick={cancelCrop}><X size={14} />{language === 'zh' ? '取消' : 'Cancel'}</button>
          <button type="button" className="flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring" title="Enter" onClick={commitCrop}><Check size={14} />{language === 'zh' ? '完成' : 'Done'}</button>
        </div>,
        slotRef.current.closest('[data-zine-canvas]')!,
      )}
    </>
  )
}, (previous, next) => (
  previous.slot === next.slot && previous.spread.id === next.spread.id
  && previous.assets === next.assets && previous.selected === next.selected
  && previous.scale === next.scale && previous.pageW === next.pageW
  && previous.pageH === next.pageH && previous.spreadW === next.spreadW
  && previous.bleed === next.bleed && previous.viewOptions === next.viewOptions
  && previous.onSelect === next.onSelect && previous.interactionDisabled === next.interactionDisabled
  && previous.preview === next.preview
))
