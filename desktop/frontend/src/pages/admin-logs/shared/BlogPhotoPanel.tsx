'use client'

import { ChevronLeft, ChevronRight, Image as ImageIcon, Plus } from 'lucide-react'
import type { PhotoDto } from '@/lib/api/types'
import { resolveAssetUrl } from '@/lib/api/core'
import { cn } from '@/lib/utils'

/**
 * 博客照片素材面板（可折叠）：
 * 点击照片即可在光标处插入 Markdown 图片，与叙事照片面板保持同构交互。
 * 折叠状态由父级持久化到 localStorage。
 */
export const BLOG_PHOTO_PANEL_COLLAPSED_KEY = 'mo-gallery:journal:blog-photo-panel-collapsed'

interface BlogPhotoPanelProps {
  photos: PhotoDto[]
  cdnDomain?: string
  isCollapsed: boolean
  onToggleCollapse: () => void
  onInsertPhoto: (photo: PhotoDto) => void
  disabled?: boolean
  t: (key: string) => string
}

export function BlogPhotoPanel({
  photos,
  cdnDomain,
  isCollapsed,
  onToggleCollapse,
  onInsertPhoto,
  disabled,
  t,
}: BlogPhotoPanelProps) {
  return (
    <fieldset
      disabled={disabled}
      className={cn(
        'h-full min-h-0 shrink-0 overflow-hidden border-0 will-change-[width] transition-[width] duration-300 ease-out motion-reduce:transition-none',
        isCollapsed ? 'w-14' : 'w-[260px] xl:w-[300px]',
      )}
    >
      {isCollapsed ? (
        <div className="flex h-full flex-col items-center gap-3 border-l border-border bg-card/50 pt-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            title={t('common.expand')}
            aria-label={t('common.expand')}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-muted/50 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <ImageIcon className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
        </div>
      ) : (
        <div className="flex h-full flex-col border-l border-border bg-card/40">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
            <span
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest"
              style={{ color: 'var(--muted-foreground)' }}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              {t('admin.photo_assets')}
            </span>
            <button
              type="button"
              onClick={onToggleCollapse}
              title={t('common.collapse')}
              aria-label={t('common.collapse')}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="custom-scrollbar flex-1 overflow-y-auto p-3">
            {photos.length === 0 ? (
              <p className="text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {t('admin.photo_assets_empty')}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {photos.map((photo) => (
                  <button
                    type="button"
                    key={photo.id}
                    onClick={() => onInsertPhoto(photo)}
                    className="group relative aspect-square cursor-pointer overflow-hidden rounded border border-transparent bg-muted transition-all hover:border-primary"
                    title={photo.title || t('admin.photo_assets_insert')}
                  >
                    <img
                      src={resolveAssetUrl(photo.thumbnailUrl || photo.url, cdnDomain)}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-primary/20 opacity-0 transition-opacity group-hover:opacity-100">
                      <Plus className="h-5 w-5 text-white" />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </fieldset>
  )
}
