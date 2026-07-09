import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'

import { t } from '@/lib/i18n'
import { getPageSizeLabel, getProjectSpreadSize } from '@/lib/zine/page-sizes'
import { getPageNumberAlign, getProjectBleedMm, getSpreadPageNumbers, PAGE_NUMBER_BOTTOM_MM, PAGE_NUMBER_FONT_PT, SAFE_MARGIN_MM } from '@/lib/zine/print'
import type { Spread, ZineProject } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'

import { SlotView } from './SlotView'

interface SpreadCanvasProps {
  project: ZineProject
  activeSpread?: Spread
  selectedSlotId: string | null
  zoom: number
  onZoomChange: (zoom: number) => void
  onSelectSlot: (slotId: string | null) => void
}

const MAX_CANVAS_WIDTH = 1040
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

export function SpreadCanvas({ project, activeSpread, selectedSlotId, zoom, onZoomChange, onSelectSlot }: SpreadCanvasProps) {
  const { language } = usePreferences()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [availableSize, setAvailableSize] = useState({ width: MAX_CANVAS_WIDTH, height: 640 })
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

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    const nextZoom = zoom + (event.deltaY > 0 ? -0.08 : 0.08)
    onZoomChange(clampZoom(nextZoom))
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
    <div ref={containerRef} className="zine-desk zine-canvas relative min-h-0 min-w-0 flex-1 overflow-hidden" onWheel={handleWheel}>
      <div className="flex h-full w-full items-center justify-center overflow-auto p-6" onClick={() => onSelectSlot(null)}>
        <div className="flex shrink-0 flex-col items-center gap-3">
          {/* 纸张 = 成品 + 出血：满版内容需延伸到纸边，裁切后才无白边 */}
          <div
            className="relative shrink-0 bg-white"
            style={{
              width: `${trimW + bleedPx * 2}px`,
              height: `${trimH + bleedPx * 2}px`,
              boxShadow: '0 1px 2px rgba(0,0,0,0.10), 0 18px 44px -14px rgba(0,0,0,0.38)',
            }}
          >
            {/* 裁切原点容器：槽位坐标一律相对成品左上角，出血区在其负方向 */}
            <div className="absolute" style={{ left: `${bleedPx}px`, top: `${bleedPx}px`, width: `${trimW}px`, height: `${trimH}px` }}>
              <CropMarks />

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

              {/* 出血环提示：裁切线外的浅红色区域即会被裁掉的部分 */}
              {bleedPx > 0 && (
                <div className="pointer-events-none absolute inset-0 z-20" style={{ boxShadow: `0 0 0 ${bleedPx}px rgba(244, 63, 94, 0.05)` }} />
              )}
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
              <div className="pointer-events-none absolute inset-y-0 z-30 w-px bg-black/10" style={{ left: `${pageWPx}px` }} />
            </div>
          </div>

          {/* folio：页码与开本标注 */}
          <p className="flex items-center gap-2 text-[11px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
            <span className="font-medium">{folioLabel}</span>
            <span aria-hidden>—</span>
            <span>
              {getPageSizeLabel(project)} {orientationLabel} · {pageW} × {pageH} mm · {t('admin.zine_bleed_label', language, { bleed })}
            </span>
          </p>
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
          onClick={() => onZoomChange(clampZoom(zoom - 0.1))}
          aria-label={t('admin.zine_zoom_out', language)}
        >
          <Minus size={13} />
        </button>
        <span className="w-10 text-center text-[11px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-accent"
          onClick={() => onZoomChange(clampZoom(zoom + 0.1))}
          aria-label={t('admin.zine_zoom_in', language)}
        >
          <Plus size={13} />
        </button>
        <div className="mx-0.5 h-4 w-px" style={{ backgroundColor: 'var(--border)' }} />
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-accent"
          onClick={() => onZoomChange(1)}
          aria-label={t('admin.zine_zoom_fit', language)}
          title={t('admin.zine_zoom_fit', language)}
        >
          <Maximize size={12} />
        </button>
      </div>

      {/* 快捷键提示 */}
      <p className="pointer-events-none absolute bottom-4 left-4 z-10 hidden text-[11px] lg:block" style={{ color: 'color-mix(in srgb, var(--muted-foreground) 75%, transparent)' }}>
        {t('admin.zine_shortcut_hint', language)}
      </p>
    </div>
  )
}
