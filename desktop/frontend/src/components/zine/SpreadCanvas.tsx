import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'

import { t } from '@/lib/i18n'
import { isZineControlTarget, isZineEditableTarget, isZineShortcutTarget } from '@/lib/zine/editor-input'
import { getPageSizeLabel, getProjectSpreadSize } from '@/lib/zine/page-sizes'
import { DEFAULT_ZINE_FONT_FAMILY, useZinePreviewFont } from '@/lib/zine/preview-fonts'
import { getPageNumberAlign, getProjectBleedMm, getSpreadPageNumbers, PAGE_NUMBER_BOTTOM_MM, PAGE_NUMBER_FONT_PT, SAFE_MARGIN_MM } from '@/lib/zine/print'
import type { Spread, ZineProject } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'

import { SlotView } from './SlotView'
import './zine-editor.css'

interface SpreadCanvasProps {
  project: ZineProject
  activeSpread?: Spread
  selectedSlotId: string | null
  zoom: number
  onZoomChange: (zoom: number) => void
  onSelectSlot: (slotId: string | null) => void
  tool?: 'select' | 'hand'
  preview?: boolean
}

const DEFAULT_CANVAS_WIDTH = 1040
const CANVAS_PADDING = 48
const MIN_CANVAS_WIDTH = 280
const MIN_CANVAS_HEIGHT = 220
const PREVIEW_FIT_RATIO = 0.88
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4

interface SpreadCanvasScaleParams {
  availableWidth: number
  availableHeight: number
  spreadWidthMm: number
  spreadHeightMm: number
  zoom: number
}

interface PendingZoomAnchor {
  pointerX: number
  pointerY: number
  paperX: number
  paperY: number
  nextZoom: number
}

export function calculateSpreadCanvasScale({
  availableWidth,
  availableHeight,
  spreadWidthMm,
  spreadHeightMm,
  zoom,
}: SpreadCanvasScaleParams) {
  const widthLimit = Math.max(MIN_CANVAS_WIDTH, availableWidth - CANVAS_PADDING)
  const heightLimit = Math.max(MIN_CANVAS_HEIGHT, availableHeight - CANVAS_PADDING)

  return Math.min(widthLimit / spreadWidthMm, heightLimit / spreadHeightMm) * PREVIEW_FIT_RATIO * zoom
}

export function toScreenPx(valueMm: number, scale: number) {
  return valueMm * scale
}

export function calculatePointerAnchoredScroll(scroll: number, pointer: number, zoom: number, nextZoom: number) {
  return (scroll + pointer) * (nextZoom / zoom) - pointer
}

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/** 成品裁切位的四角标记：对齐裁切框（不含出血），印刷台上的定位语汇 */
function CropMarks() {
  const marks: CSSProperties[] = [
    { top: 12, left: 0, width: 8, height: 1 },
    { top: 0, left: 12, width: 1, height: 8 },
    { top: 12, right: 0, width: 8, height: 1 },
    { top: 0, right: 12, width: 1, height: 8 },
    { bottom: 12, left: 0, width: 8, height: 1 },
    { bottom: 0, left: 12, width: 1, height: 8 },
    { bottom: 12, right: 0, width: 8, height: 1 },
    { bottom: 0, right: 12, width: 1, height: 8 },
  ]

  return (
    <div className="pointer-events-none absolute -inset-3 z-20" aria-hidden style={{ color: 'color-mix(in srgb, var(--muted-foreground) 55%, transparent)' }}>
      {marks.map((style, index) => (
        <div key={index} className="absolute bg-current" style={style} />
      ))}
    </div>
  )
}

export function SpreadCanvas({ project, activeSpread, selectedSlotId, zoom, onZoomChange, onSelectSlot, tool = 'select', preview = false }: SpreadCanvasProps) {
  const language = usePreferences((state) => state.language)
  const zineViewOptions = usePreferences((state) => state.zineViewOptions)
  const folioFont = useZinePreviewFont(DEFAULT_ZINE_FONT_FAMILY, project.pageNumbers?.enabled ? '0123456789' : '')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const paperRef = useRef<HTMLDivElement | null>(null)
  const zoomRef = useRef(zoom)
  const fitRequestedRef = useRef(true)
  const scrollRangeRef = useRef<{ x: number; y: number } | null>(null)
  const pendingZoomAnchorRef = useRef<PendingZoomAnchor | null>(null)
  const panRef = useRef<{ pointerId: number; x: number; y: number; scrollLeft: number; scrollTop: number; moved: boolean } | null>(null)
  const suppressClickRef = useRef(false)
  const [spacePressed, setSpacePressed] = useState(false)
  const [panning, setPanning] = useState(false)
  const [availableSize, setAvailableSize] = useState({ width: DEFAULT_CANVAS_WIDTH, height: 640 })
  const { pageW, pageH, spreadW, spreadH } = getProjectSpreadSize(project)
  const bleed = getProjectBleedMm(project)
  const scale = calculateSpreadCanvasScale({
    availableWidth: availableSize.width,
    availableHeight: availableSize.height,
    spreadWidthMm: spreadW + bleed * 2,
    spreadHeightMm: spreadH + bleed * 2,
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

  useLayoutEffect(() => {
    zoomRef.current = zoom
    const viewport = viewportRef.current
    const paper = paperRef.current
    const anchor = pendingZoomAnchorRef.current
    if (!viewport || !paper) return
    const range = { x: viewport.scrollWidth - viewport.clientWidth, y: viewport.scrollHeight - viewport.clientHeight }
    if (fitRequestedRef.current) {
      viewport.scrollLeft = range.x / 2
      viewport.scrollTop = range.y / 2
      fitRequestedRef.current = false
      pendingZoomAnchorRef.current = null
    } else if (anchor && anchor.nextZoom === zoom) {
      const viewportRect = viewport.getBoundingClientRect()
      const paperRect = paper.getBoundingClientRect()
      viewport.scrollLeft += paperRect.left - viewportRect.left + anchor.paperX * paperRect.width - anchor.pointerX
      viewport.scrollTop += paperRect.top - viewportRect.top + anchor.paperY * paperRect.height - anchor.pointerY
      pendingZoomAnchorRef.current = null
    } else if (scrollRangeRef.current) {
      // Preserve the viewport's offset from the paper when a side panel resizes.
      viewport.scrollLeft += (range.x - scrollRangeRef.current.x) / 2
      viewport.scrollTop += (range.y - scrollRangeRef.current.y) / 2
    }
    scrollRangeRef.current = range
  }, [zoom, availableSize.width, availableSize.height, project.pageSize, project.pageOrientation, project.customSizeMm])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isZineShortcutTarget(event.target) || isZineControlTarget(event.target)) return
      if (event.key === 'Escape' && panRef.current) {
        event.preventDefault()
        endPan()
        return
      }
      if (event.code !== 'Space' || event.ctrlKey || event.metaKey || event.altKey) return
      event.preventDefault()
      setSpacePressed(true)
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.code === 'Space') setSpacePressed(false)
    }

    function onBlur() {
      setSpacePressed(false)
      endPan()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const changeZoom = useCallback((nextZoom: number, clientX?: number, clientY?: number) => {
    const viewport = viewportRef.current
    const paper = paperRef.current
    if (!viewport || !paper) return
    const next = clampZoom(nextZoom)
    if (next === zoomRef.current) return
    const rect = viewport.getBoundingClientRect()
    const paperRect = paper.getBoundingClientRect()
    const x = clientX ?? rect.left + viewport.clientWidth / 2
    const y = clientY ?? rect.top + viewport.clientHeight / 2
    pendingZoomAnchorRef.current = {
      pointerX: x - rect.left,
      pointerY: y - rect.top,
      paperX: (x - paperRect.left) / paperRect.width,
      paperY: (y - paperRect.top) / paperRect.height,
      nextZoom: next,
    }
    zoomRef.current = next
    onZoomChange(next)
  }, [onZoomChange])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      event.stopPropagation()
      if (viewport?.querySelector('[data-zine-gesture]') || panRef.current || event.deltaY === 0) return
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport!.clientHeight : 1
      changeZoom(zoomRef.current * Math.exp(-event.deltaY * unit * 0.002), event.clientX, event.clientY)
    }
    // React's wheel listeners are passive; cancellation must be attached here.
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [changeZoom])

  function endPan() {
    const pan = panRef.current
    panRef.current = null
    setPanning(false)
    if (!pan) return
    suppressClickRef.current = true
    const viewport = viewportRef.current
    if (viewport?.hasPointerCapture(pan.pointerId)) viewport.releasePointerCapture(pan.pointerId)
  }

  function fitCanvas() {
    pendingZoomAnchorRef.current = null
    fitRequestedRef.current = zoom !== 1
    zoomRef.current = 1
    onZoomChange(1)
    const viewport = viewportRef.current
    if (viewport && zoom === 1) viewport.scrollTo({
      left: (viewport.scrollWidth - viewport.clientWidth) / 2,
      top: (viewport.scrollHeight - viewport.clientHeight) / 2,
    })
  }

  const spreadIndex = Math.max(0, project.spreads.findIndex((spread) => spread.id === activeSpread?.id))
  const trimW = toScreenPx(spreadW, scale)
  const trimH = toScreenPx(spreadH, scale)
  const bleedPx = toScreenPx(bleed, scale)
  const safePx = toScreenPx(SAFE_MARGIN_MM, scale)
  const pageWPx = toScreenPx(pageW, scale)
  const foldWidth = Math.max(12, trimW * 0.05)
  const orientationLabel = t(project.pageOrientation === 'portrait' ? 'admin.zine_orientation_portrait' : 'admin.zine_orientation_landscape', language)
  const pageNumbers = getSpreadPageNumbers(project, spreadIndex)
  const pageNumberSettings = project.pageNumbers
  const pageNumberFontMm = PAGE_NUMBER_FONT_PT * (25.4 / 72)
  const folioLabel =
    pageNumbers === 'cover'
      ? `${t('admin.zine_back_cover', language)} · ${t('admin.zine_front_cover', language)}`
      : `P${pageNumbers.left} · P${pageNumbers.right}`

  return (
    <div ref={containerRef} data-zine-canvas className="zine-desk zine-canvas relative isolate min-h-0 min-w-0 flex-1 overflow-hidden">
      <div
        ref={viewportRef}
        data-zine-viewport
        data-zine-navigating={panning || spacePressed || tool === 'hand' || undefined}
        tabIndex={0}
        aria-label={language === 'zh' ? 'Zine 编辑画布' : 'Zine editing canvas'}
        className={`h-full w-full overflow-auto outline-none ${panning ? 'cursor-grabbing' : spacePressed || tool === 'hand' ? 'cursor-grab' : ''}`}
        style={{ scrollbarGutter: 'stable', overscrollBehavior: 'contain' }}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false
            return
          }
          if (!preview && tool === 'select') onSelectSlot(null)
        }}
        onPointerDownCapture={(event) => {
          suppressClickRef.current = false
          const viewport = viewportRef.current
          if (!viewport || isZineEditableTarget(event.target)) return
          if (event.target instanceof Element && event.target.closest('button')) return
          viewport.focus({ preventScroll: true })
          if (!(event.button === 1 || event.button === 0 && (spacePressed || tool === 'hand'))) return
          event.preventDefault()
          event.stopPropagation()
          viewport.setPointerCapture(event.pointerId)
          panRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            scrollLeft: viewport.scrollLeft,
            scrollTop: viewport.scrollTop,
            moved: false,
          }
          setPanning(true)
        }}
        onPointerMove={(event) => {
          const pan = panRef.current
          const viewport = viewportRef.current
          if (!pan || !viewport || pan.pointerId !== event.pointerId) return
          const deltaX = event.clientX - pan.x
          const deltaY = event.clientY - pan.y
          if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) pan.moved = true
          viewport.scrollLeft = pan.scrollLeft - deltaX
          viewport.scrollTop = pan.scrollTop - deltaY
        }}
        onPointerUp={(event) => {
          if (panRef.current?.pointerId !== event.pointerId) return
          event.stopPropagation()
          endPan()
        }}
        onPointerCancel={endPan}
        onLostPointerCapture={() => { if (panRef.current) endPan() }}
        onAuxClick={(event) => { if (event.button === 1) event.preventDefault() }}
      >
        {/* A viewport of work area on each side keeps pan/zoom available even
            when the paper fits entirely inside the viewport. */}
        <div className="flex items-center justify-center" style={{
          width: trimW + bleedPx * 2 + availableSize.width * 2,
          height: trimH + bleedPx * 2 + availableSize.height * 2 + 32,
        }}>
          <div className="flex shrink-0 flex-col items-center gap-3">
          {/* 纸张 = 成品 + 出血：满版内容需延伸到纸边，裁切后才无白边 */}
          <div
            ref={paperRef}
            data-zine-paper
            className="relative shrink-0 bg-white"
            style={{
              width: `${trimW + bleedPx * 2}px`,
              height: `${trimH + bleedPx * 2}px`,
              boxShadow: '0 1px 2px rgba(0,0,0,0.10), 0 18px 44px -14px rgba(0,0,0,0.38)',
            }}
          >
            {/* 裁切原点容器：槽位坐标一律相对成品左上角，出血区在其负方向 */}
            <div className="absolute" style={{ left: `${bleedPx}px`, top: `${bleedPx}px`, width: `${trimW}px`, height: `${trimH}px` }}>
              {!preview && zineViewOptions.showBleed ? <CropMarks /> : null}

              {activeSpread?.slots.map((slot) => (
                <SlotView
                  key={slot.id}
                  spread={activeSpread}
                  slot={slot}
                  pageW={pageW}
                  pageH={pageH}
                  spreadW={spreadW}
                  bleed={bleed}
                  assets={project.assets}
                  selected={!preview && selectedSlotId === slot.id}
                  scale={scale}
                  viewOptions={zineViewOptions}
                  onSelect={onSelectSlot}
                  interactionDisabled={preview || tool === 'hand'}
                  preview={preview}
                />
              ))}

              {/* 空白跨页引导：无任何槽位时提示从工具栏或模板开始 */}
              {!preview && (activeSpread?.slots.length ?? 0) === 0 && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
                  <p className="max-w-[75%] text-center text-xs leading-relaxed" style={{ color: 'rgba(113, 113, 122, 0.7)' }}>
                    {t('admin.zine_canvas_empty_hint', language)}
                  </p>
                </div>
              )}
              {!preview && zineViewOptions.showBleed && bleedPx > 0 && (
                <div className="pointer-events-none absolute inset-0 z-20" style={{ boxShadow: `0 0 0 ${bleedPx}px rgba(244, 63, 94, 0.05)` }} />
              )}
              {!preview && zineViewOptions.showGuides ? (
                <>
                  {/* 裁切框（成品尺寸） */}
                  <div className="pointer-events-none absolute inset-0 z-20" style={{ boxShadow: 'inset 0 0 0 1px rgba(59, 130, 246, 0.45)' }} />
                  {/* 安全边距参考线：文字等关键内容建议保持在虚线以内 */}
                  {(['left', 'right'] as const).map((side) => (
                    <div
                      key={side}
                      className="pointer-events-none absolute z-20 border border-dashed"
                      style={{
                        left: `${(side === 'right' ? pageWPx : 0) + safePx}px`,
                        top: `${safePx}px`,
                        width: `${pageWPx - safePx * 2}px`,
                        height: `${trimH - safePx * 2}px`,
                        borderColor: 'rgba(59, 130, 246, 0.22)',
                      }}
                    />
                  ))}
                </>
              ) : null}

              {/* 页码预览：与导出一致（封面跨页不编页码） */}
              {pageNumberSettings?.enabled &&
                pageNumbers !== 'cover' &&
                (['left', 'right'] as const).map((side) => (
                  <span
                    key={`folio-${side}`}
                    className="pointer-events-none absolute z-10 tabular-nums"
                    style={{
                      left: `${(side === 'right' ? pageWPx : 0) + safePx}px`,
                      top: `${trimH - toScreenPx(PAGE_NUMBER_BOTTOM_MM, scale)}px`,
                      width: `${pageWPx - safePx * 2}px`,
                      fontSize: `${toScreenPx(pageNumberFontMm, scale)}px`,
                      fontFamily: folioFont.fontFamily,
                      lineHeight: 1,
                      textAlign: getPageNumberAlign(side, pageNumberSettings.position),
                      color: 'rgba(82, 82, 82, 0.9)',
                    }}
                  >
                    {side === 'left' ? pageNumbers.left : pageNumbers.right}
                  </span>
                ))}

              {/* 书脊折痕：让跨页读起来像一本摊开的册子 */}
              <div
                className="pointer-events-none absolute inset-y-0 z-30"
                style={{
                  left: `${pageWPx - foldWidth / 2}px`,
                  width: `${foldWidth}px`,
                  background:
                    'linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.05) 38%, rgba(0,0,0,0.14) 50%, rgba(0,0,0,0.05) 62%, rgba(0,0,0,0) 100%)',
                }}
              />
              {!preview && zineViewOptions.showGuides ? <div className="pointer-events-none absolute inset-y-0 z-30 w-px bg-black/10" style={{ left: `${pageWPx}px` }} /> : null}
            </div>
          </div>

          {/* folio：页码与开本标注 */}
          <p className="flex max-w-full items-center gap-2 text-[11px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
            <span className="font-medium">{folioLabel}</span>
            <span aria-hidden>—</span>
            <span className="hidden xl:inline">
              {getPageSizeLabel(project)} {orientationLabel} · {pageW} × {pageH} mm · {t('admin.zine_bleed_label', language, { bleed })}
            </span>
          </p>
          </div>
        </div>
      </div>

      {/* 浮动缩放控件 */}
      <div
        className="absolute bottom-3 right-3 z-10 flex items-center gap-0.5 rounded-full border bg-popover p-1 text-popover-foreground shadow-lg"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-accent"
          onClick={() => changeZoom(zoomRef.current - 0.1)}
          disabled={zoom <= MIN_ZOOM}
          aria-label={t('admin.zine_zoom_out', language)}
        >
          <Minus size={13} />
        </button>
        <button type="button" onClick={fitCanvas} title={t('admin.zine_zoom_fit', language)} className="w-10 rounded text-center text-[11px] tabular-nums focus-visible:ring-2 focus-visible:ring-ring" style={{ color: 'var(--muted-foreground)' }}>
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-accent"
          onClick={() => changeZoom(zoomRef.current + 0.1)}
          disabled={zoom >= MAX_ZOOM}
          aria-label={t('admin.zine_zoom_in', language)}
        >
          <Plus size={13} />
        </button>
        <div className="mx-0.5 h-4 w-px" style={{ backgroundColor: 'var(--border)' }} />
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-accent"
          onClick={fitCanvas}
          aria-label={t('admin.zine_zoom_fit', language)}
          title={t('admin.zine_zoom_fit', language)}
        >
          <Maximize size={12} />
        </button>
      </div>

      {/* 快捷键提示 */}
      <p className="pointer-events-none absolute bottom-4 left-4 z-10 hidden text-[11px] lg:block" style={{ color: 'color-mix(in srgb, var(--muted-foreground) 75%, transparent)' }}>
        {language === 'zh' ? '空格 / 中键平移 · Ctrl + 滚轮缩放 · Shift 约束方向' : 'Space / middle mouse to pan · Ctrl + scroll to zoom · Shift to constrain'}
      </p>
    </div>
  )
}
