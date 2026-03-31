'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Check, RotateCcw, X } from 'lucide-react'
import type { PhotoDto } from '@/lib/api'
import { resolveAssetUrl } from '@/lib/api'
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

// 'move' plus 8 directional resize handles
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
  const modalTitle = t('admin.edit_cover_crop') === 'admin.edit_cover_crop' ? '调整封面裁剪' : t('admin.edit_cover_crop')
  const modalHint = t('admin.cover_crop_hint') === 'admin.cover_crop_hint' ? '拖动裁剪区域或拖动边缘/角点调整大小。' : t('admin.cover_crop_hint')
  const resetCropLabel = t('admin.reset_crop') === 'admin.reset_crop' ? '重置裁剪' : t('admin.reset_crop')
  const applyCropLabel = t('admin.apply_crop') === 'admin.apply_crop' ? '应用裁剪' : t('admin.apply_crop')
  const cardPreviewLabel = t('admin.cover_crop_card_preview') === 'admin.cover_crop_card_preview' ? '卡片预览' : t('admin.cover_crop_card_preview')
  const heroPreviewLabel = t('admin.cover_crop_hero_preview') === 'admin.cover_crop_hero_preview' ? '头图预览' : t('admin.cover_crop_hero_preview')

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

  const previewStory = useMemo(
    () => ({
      coverCrop: crop,
    }),
    [crop],
  )

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
    dragOriginRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      crop,
    }
  }

  const handleApply = () => {
    onApply(isDefaultStoryCoverCrop(crop) ? null : normalizeStoryCoverCrop(crop))
  }

  // Shared handle style
  const handle = (mode: DragMode, className: string) => (
    <div
      key={mode}
      className={`absolute z-10 h-3 w-3 rounded-full border-2 border-white bg-primary ${className}`}
      style={{ cursor: CURSOR[mode] }}
      onPointerDown={(e) => beginDrag(e, mode)}
    />
  )

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden border border-border bg-background shadow-2xl lg:flex-row">
        <div className="flex min-h-0 flex-1 flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
                {modalTitle}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {modalHint}
              </p>
            </div>
            <AdminButton onClick={onClose} adminVariant="icon">
              <X className="h-4 w-4" />
            </AdminButton>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden p-5">
            <div className="flex h-full items-center justify-center">
            <div
              ref={stageRef}
              className="relative w-full max-w-4xl overflow-hidden border border-border bg-muted"
              style={{
                aspectRatio: `${Math.max(photo.width || 1, 1)} / ${Math.max(photo.height || 1, 1)}`,
                maxHeight: '100%',
              }}
            >
              <img src={photoUrl} alt={photo.title} className="h-full w-full object-cover select-none" draggable={false} />
              <div
                className="absolute border-2 border-primary bg-primary/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                style={{ ...cropStyle, cursor: CURSOR.move }}
                onPointerDown={(event) => beginDrag(event, 'move')}
              >
                <div className="pointer-events-none absolute inset-0 border border-white/70" />
                {/* rule-of-thirds grid lines */}
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute left-1/3 top-0 h-full w-px bg-white/20" />
                  <div className="absolute left-2/3 top-0 h-full w-px bg-white/20" />
                  <div className="absolute left-0 top-1/3 h-px w-full bg-white/20" />
                  <div className="absolute left-0 top-2/3 h-px w-full bg-white/20" />
                </div>
                {/* center indicator */}
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60 bg-black/20" />
                {/* 4 corner handles */}
                {handle('nw', '-left-1.5 -top-1.5')}
                {handle('ne', '-right-1.5 -top-1.5')}
                {handle('sw', '-left-1.5 -bottom-1.5')}
                {handle('se', '-right-1.5 -bottom-1.5')}
                {/* 4 edge midpoint handles */}
                {handle('n', 'left-1/2 -top-1.5 -translate-x-1/2')}
                {handle('s', 'left-1/2 -bottom-1.5 -translate-x-1/2')}
                {handle('w', 'top-1/2 -left-1.5 -translate-y-1/2')}
                {handle('e', 'top-1/2 -right-1.5 -translate-y-1/2')}
              </div>
            </div>
            </div>
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col lg:w-[360px]">
          <div className="border-b border-border px-5 py-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('admin.preview')}
            </h4>
          </div>

          <div className="space-y-5 overflow-auto p-5">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {cardPreviewLabel}
              </p>
              <div className="relative aspect-[3/2] overflow-hidden border border-border bg-muted">
                <img
                  src={photoUrl}
                  alt={photo.title}
                  className="h-full w-full object-cover"
                  style={getStoryCoverImageStyle(previewStory)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {heroPreviewLabel}
              </p>
              <div className="relative aspect-[21/9] overflow-hidden border border-border bg-muted">
                <img
                  src={photoUrl}
                  alt={photo.title}
                  className="h-full w-full object-cover"
                  style={getStoryCoverImageStyle(previewStory)}
                />
              </div>
            </div>
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-border px-5 py-4">
            <AdminButton
              onClick={() => setCrop(normalizeStoryCoverCrop(null))}
              adminVariant="outline"
              className="flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              {resetCropLabel}
            </AdminButton>
            <AdminButton onClick={handleApply} adminVariant="primary" className="flex items-center gap-2">
              <Check className="h-4 w-4" />
              {applyCropLabel}
            </AdminButton>
          </div>
        </div>
      </div>
    </div>
  )
}
