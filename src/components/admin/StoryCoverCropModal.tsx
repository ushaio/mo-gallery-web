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

type DragMode = 'move' | 'resize'

const MIN_CROP_SIZE = 0.1

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
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
  const modalHint = t('admin.cover_crop_hint') === 'admin.cover_crop_hint' ? '拖动裁剪区域，决定封面图可见范围。' : t('admin.cover_crop_hint')
  const resetCropLabel = t('admin.reset_crop') === 'admin.reset_crop' ? '重置裁剪' : t('admin.reset_crop')
  const applyCropLabel = t('admin.apply_crop') === 'admin.apply_crop' ? '应用裁剪' : t('admin.apply_crop')
  const resizeCropLabel = t('admin.resize_cover_crop') === 'admin.resize_cover_crop' ? '调整裁剪区域大小' : t('admin.resize_cover_crop')
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

      if (dragMode === 'move') {
        setCrop({
          ...dragOrigin.crop,
          x: clamp(dragOrigin.crop.x + dx, 0, 1 - dragOrigin.crop.width),
          y: clamp(dragOrigin.crop.y + dy, 0, 1 - dragOrigin.crop.height),
        })
        return
      }

      const nextWidth = clamp(dragOrigin.crop.width + dx, MIN_CROP_SIZE, 1 - dragOrigin.crop.x)
      const nextHeight = clamp(dragOrigin.crop.height + dy, MIN_CROP_SIZE, 1 - dragOrigin.crop.y)
      setCrop({
        ...dragOrigin.crop,
        width: nextWidth,
        height: nextHeight,
      })
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

          <div className="min-h-0 flex-1 overflow-auto p-5">
            <div
              ref={stageRef}
              className="relative mx-auto w-full max-w-4xl overflow-hidden border border-border bg-muted"
              style={{ aspectRatio: `${Math.max(photo.width || 1, 1)} / ${Math.max(photo.height || 1, 1)}` }}
            >
              <img src={photoUrl} alt={photo.title} className="h-full w-full object-cover select-none" draggable={false} />
              <div
                className="absolute border-2 border-primary bg-primary/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                style={cropStyle}
                onPointerDown={(event) => beginDrag(event, 'move')}
              >
                <div className="pointer-events-none absolute inset-0 border border-white/70" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-black/20" />
                <button
                  type="button"
                  aria-label={resizeCropLabel}
                  className="absolute bottom-0 right-0 h-5 w-5 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-full border-2 border-white bg-primary"
                  onPointerDown={(event) => beginDrag(event, 'resize')}
                />
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
