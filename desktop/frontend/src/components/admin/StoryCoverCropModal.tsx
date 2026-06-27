'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Check, RotateCcw, X, Crop } from 'lucide-react'
import type { PhotoDto } from '@/lib/api/types'
import { resolveAssetUrl } from '@/lib/api/core'
import {
  getStoryCoverImageStyle,
  isDefaultStoryCoverCrop,
  normalizeStoryCoverCrop,
  type StoryCoverCrop,
} from '@/lib/story-cover'
import { AdminButton } from '@/components/admin/AdminButton'

interface StoryCoverCropModalProps {
  photo: PhotoDto
  cdnDomain?: string
  initialCrop?: StoryCoverCrop | null
  onClose: () => void
  onApply: (crop: StoryCoverCrop | null) => void
  t: (key: string) => string
}

type DragMode = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'

const CURSOR: Record<DragMode, string> = {
  move: 'move',
  n: 'n-resize',
  s: 's-resize',
  e: 'e-resize',
  w: 'w-resize',
  nw: 'nw-resize',
  ne: 'ne-resize',
  sw: 'sw-resize',
  se: 'se-resize',
}

const MIN_CROP_SIZE = 0.1
const PANEL_HEADER_CLASSNAME =
  'flex min-h-[72px] shrink-0 items-center justify-between border-b border-border bg-gradient-to-r from-muted/25 via-background to-muted/15 px-5 py-3.5'
const PANEL_FOOTER_CLASSNAME =
  'min-h-[72px] shrink-0 border-t border-border bg-gradient-to-r from-muted/20 via-background to-muted/15 px-5 py-4'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function applyResize(origin: StoryCoverCrop, dx: number, dy: number, mode: DragMode): StoryCoverCrop {
  let { x, y, width, height } = origin

  if (mode === 'move') {
    return {
      x: clamp(x + dx, 0, 1 - width),
      y: clamp(y + dy, 0, 1 - height),
      width,
      height,
    }
  }

  const right = x + width
  const bottom = y + height

  if (mode === 'e' || mode === 'ne' || mode === 'se') {
    width = clamp(width + dx, MIN_CROP_SIZE, 1 - x)
  }
  if (mode === 'w' || mode === 'nw' || mode === 'sw') {
    const newX = clamp(x + dx, 0, right - MIN_CROP_SIZE)
    width = right - newX
    x = newX
  }
  if (mode === 's' || mode === 'se' || mode === 'sw') {
    height = clamp(height + dy, MIN_CROP_SIZE, 1 - y)
  }
  if (mode === 'n' || mode === 'nw' || mode === 'ne') {
    const newY = clamp(y + dy, 0, bottom - MIN_CROP_SIZE)
    height = bottom - newY
    y = newY
  }

  return { x, y, width, height }
}

export function StoryCoverCropModal({
  photo,
  cdnDomain,
  initialCrop,
  onClose,
  onApply,
  t,
}: StoryCoverCropModalProps) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const dragModeRef = useRef<DragMode | null>(null)
  const dragOriginRef = useRef<{
    pointerX: number
    pointerY: number
    crop: StoryCoverCrop
  } | null>(null)

  const [crop, setCrop] = useState<StoryCoverCrop>(normalizeStoryCoverCrop(initialCrop))
  const photoUrl = resolveAssetUrl(photo.url, cdnDomain)

  const tr = (key: string, fallback: string) => {
    const val = t(key)
    return val === key ? fallback : val
  }

  const modalTitle = tr('admin.edit_cover_crop', '编辑封面裁剪')
  const modalHint = tr('admin.cover_crop_hint', '拖动裁剪区域或拖动边缘/角点调整大小。')
  const resetCropLabel = tr('admin.reset_crop', '重置')
  const applyCropLabel = tr('admin.apply_crop', '应用')
  const cardPreviewLabel = tr('admin.cover_crop_card_preview', '卡片预览')
  const heroPreviewLabel = tr('admin.cover_crop_hero_preview', '头图预览')

  useEffect(() => {
    setCrop(normalizeStoryCoverCrop(initialCrop))
  }, [initialCrop])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const stage = stageRef.current
      const dragOrigin = dragOriginRef.current
      const dragMode = dragModeRef.current
      if (!stage || !dragOrigin || !dragMode) return

      const rect = stage.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      const dx = (event.clientX - dragOrigin.pointerX) / rect.width
      const dy = (event.clientY - dragOrigin.pointerY) / rect.height

      setCrop(applyResize(dragOrigin.crop, dx, dy, dragMode))
    }

    const handlePointerUp = () => {
      dragModeRef.current = null
      dragOriginRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [])

  const previewStory = useMemo(() => ({ coverCrop: crop }), [crop])

  const cropStyle = {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.width * 100}%`,
    height: `${crop.height * 100}%`,
  }

  const beginDrag = (event: ReactPointerEvent, mode: DragMode) => {
    event.preventDefault()
    event.stopPropagation()
    dragModeRef.current = mode
    dragOriginRef.current = { pointerX: event.clientX, pointerY: event.clientY, crop }
  }

  const handleApply = () => {
    onApply(isDefaultStoryCoverCrop(crop) ? null : normalizeStoryCoverCrop(crop))
  }

  const handle = (mode: DragMode, className: string) => (
    <div
      key={mode}
      className={`absolute z-10 h-2.5 w-2.5 border border-white/90 bg-primary shadow-[0_0_0_1px_rgba(0,0,0,0.3)] ${className}`}
      style={{ cursor: CURSOR[mode] }}
      onPointerDown={(e) => beginDrag(e, mode)}
    />
  )

  const coveragePercent = Math.round(crop.width * crop.height * 100)

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="grid max-h-[90vh] w-full max-w-6xl overflow-hidden border border-border bg-background shadow-[0_32px_80px_rgba(0,0,0,0.4)] lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_minmax(0,1fr)_auto]">
        <div className={`${PANEL_HEADER_CLASSNAME} lg:border-r`}>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border/80 bg-background/90 shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
              <Crop className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground">
                {modalTitle}
              </h3>
              <p className="mt-0.5 max-w-[36ch] text-[10px] leading-relaxed text-muted-foreground/75">
                {modalHint}
              </p>
            </div>
          </div>
          <AdminButton
            onClick={onClose}
            adminVariant="icon"
            className="h-8 w-8 shrink-0 rounded-md border border-border/70 bg-background/80 shadow-none transition-colors hover:border-border hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </AdminButton>
        </div>

        <div className={PANEL_HEADER_CLASSNAME}>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground">
            {t('admin.preview')}
          </h4>
        </div>

        <div className="min-h-0 overflow-hidden bg-[hsl(var(--muted)/0.4)] p-5 lg:border-r">
          <div className="flex h-full items-center justify-center">
            <div
              ref={stageRef}
              className="relative w-full max-w-4xl overflow-hidden bg-black shadow-[0_0_0_1px_hsl(var(--border))]"
              style={{
                aspectRatio: `${Math.max(photo.width || 1, 1)} / ${Math.max(photo.height || 1, 1)}`,
                maxHeight: '100%',
              }}
            >
              <img
                src={photoUrl}
                alt={photo.title}
                className="h-full w-full select-none object-cover"
                draggable={false}
              />

              <div
                className="absolute border border-primary/80 bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.52)]"
                style={{ ...cropStyle, cursor: CURSOR.move }}
                onPointerDown={(event) => beginDrag(event, 'move')}
              >
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute left-1/3 top-0 h-full w-px bg-white/15" />
                  <div className="absolute left-2/3 top-0 h-full w-px bg-white/15" />
                  <div className="absolute left-0 top-1/3 h-px w-full bg-white/15" />
                  <div className="absolute left-0 top-2/3 h-px w-full bg-white/15" />
                </div>

                {handle('nw', '-left-1.5 -top-1.5')}
                {handle('ne', '-right-1.5 -top-1.5')}
                {handle('sw', '-left-1.5 -bottom-1.5')}
                {handle('se', '-right-1.5 -bottom-1.5')}
                {handle('n', 'left-1/2 -top-1.5 -translate-x-1/2')}
                {handle('s', 'left-1/2 -bottom-1.5 -translate-x-1/2')}
                {handle('w', 'top-1/2 -left-1.5 -translate-y-1/2')}
                {handle('e', 'top-1/2 -right-1.5 -translate-y-1/2')}
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-auto p-5">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border/50" />
                <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/60">
                  {cardPreviewLabel}
                </p>
                <div className="h-px flex-1 bg-border/50" />
              </div>
              <div className="relative aspect-[3/2] overflow-hidden border border-border bg-muted shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]">
                <img
                  src={photoUrl}
                  alt={photo.title}
                  className="h-full w-full object-cover"
                  style={getStoryCoverImageStyle(previewStory)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border/50" />
                <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/60">
                  {heroPreviewLabel}
                </p>
                <div className="h-px flex-1 bg-border/50" />
              </div>
              <div className="relative aspect-[21/9] overflow-hidden border border-border bg-muted shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]">
                <img
                  src={photoUrl}
                  alt={photo.title}
                  className="h-full w-full object-cover"
                  style={getStoryCoverImageStyle(previewStory)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className={`${PANEL_FOOTER_CLASSNAME} lg:border-r`}>
          <div className="flex h-full flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              X <span className="font-mono text-foreground">{(crop.x * 100).toFixed(1)}%</span>
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Y <span className="font-mono text-foreground">{(crop.y * 100).toFixed(1)}%</span>
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              W <span className="font-mono text-foreground">{(crop.width * 100).toFixed(1)}%</span>
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              H <span className="font-mono text-foreground">{(crop.height * 100).toFixed(1)}%</span>
            </span>
            <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {t('admin.coverage') === 'admin.coverage' ? '覆盖' : t('admin.coverage')}{' '}
              <span className="font-mono text-primary">{coveragePercent}%</span>
            </span>
          </div>
        </div>

        <div className={PANEL_FOOTER_CLASSNAME}>
          <div className="flex h-full items-center justify-between gap-3">
            <AdminButton
              onClick={() => setCrop(normalizeStoryCoverCrop(null))}
              adminVariant="outline"
              className="flex h-10 items-center gap-2 rounded-md border-border/80 bg-background/85 px-4 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground shadow-none transition-all hover:border-foreground/15 hover:bg-accent/60 hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {resetCropLabel}
            </AdminButton>
            <AdminButton
              onClick={handleApply}
              adminVariant="primary"
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md px-4 text-[11px] font-semibold tracking-[0.18em] shadow-[0_12px_30px_rgba(15,23,42,0.16)] transition-all hover:-translate-y-px hover:shadow-[0_16px_36px_rgba(15,23,42,0.2)]"
            >
              <Check className="h-3.5 w-3.5" />
              {applyCropLabel}
            </AdminButton>
          </div>
        </div>
      </div>
    </div>
  )
}
