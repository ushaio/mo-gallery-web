'use client'

import React, { useState } from 'react'
import {
  Plus,
  Image as ImageIcon,
  Loader2,
  Calendar,
  Upload,
  RefreshCw,
  MoreVertical,
  Star,
  ImagePlus,
  Trash2,
} from 'lucide-react'
import { guardNarrativeAiMutation } from '@mo-gallery/tiptap-editor'
import { getMilkdownPhotoIds, getMilkdownUploadIds } from '@mo-gallery/milkdown/media'
import { resolveAssetUrl } from '@/lib/api/core'
import type { StoryDto, PhotoDto } from '@/lib/api/types'
import { getStoryImageMatchCandidates, getStoryMarkdownImageUrls, getStoryReferencedPhotoIds } from '@/lib/story-rich-content'
import { AdminButton } from '@/components/admin/AdminButton'
import { cn } from '@/lib/utils'

export interface PendingImage {
  id: string
  file: File
  previewUrl: string
  status: 'pending' | 'uploading' | 'success' | 'failed'
  progress: number
  error?: string
  photoId?: string
  takenAt?: string
}

/**
 * 素材瓦片角标：与资源库瓦片、文章列表卡片同一枚胶囊。
 * 默认深色半透明底 + 白字；传 background/color 可覆盖（如封面用主题色）。
 */
function MaterialBadge({
  children,
  background,
  color,
}: {
  children: React.ReactNode
  background?: string
  color?: string
}) {
  return (
    <span
      className="inline-flex h-5 min-w-5 items-center justify-center gap-[3px] rounded-full px-[7px] text-[10px] font-semibold leading-none shadow-[0_1px_3px_rgba(0,0,0,0.2)] backdrop-blur-md"
      style={{
        backgroundColor: background ?? 'rgba(9,9,11,0.62)',
        color: color ?? '#ffffff',
      }}
    >
      {children}
    </span>
  )
}

interface StoryPhotoPanelProps {
  disabled: boolean
  isCollapsed: boolean
  isImmersiveMode: boolean
  currentStory: StoryDto | null
  editorContent: string
  pendingImages: PendingImage[]
  pendingCoverId: string | null
  cdnDomain?: string
  isUploading: boolean
  uploadProgress: { current: number; total: number; currentFile: string }
  isDraggingOver: boolean
  draggedItemId: string | null
  draggedItemType: 'photo' | 'pending' | null
  dragOverItemId: string | null
  openMenuPhotoId: string | null
  openMenuPendingId: string | null
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  onAddPhotos: () => void
  onInsertPhotoMarkdown: (photo: PhotoDto) => void
  onInsertGalleryMarkdown: (photoIds: string[]) => void
  onRemovePhoto: (photoId: string) => void
  onRemovePendingImage: (id: string) => void
  onSetCover: (photoId: string) => void
  onSetPendingCover: (id: string) => void

  onSetPhotoDate: (takenAt: string) => void
  onRetryFailedUploads: () => void
  onPhotoPanelDragOver: (e: React.DragEvent) => void
  onPhotoPanelDragLeave: (e: React.DragEvent) => void
  onPhotoPanelDrop: (e: React.DragEvent) => void
  onItemDragStart: (e: React.DragEvent, itemId: string, type: 'photo' | 'pending') => void
  onItemDragEnd: (e: React.DragEvent) => void
  onItemDragOver: (e: React.DragEvent, itemId: string) => void
  onItemDragLeave: () => void
  onItemDrop: (e: React.DragEvent, targetId: string, targetType: 'photo' | 'pending') => void
  onOpenMenuPhoto: (photoId: string | null) => void
  onOpenMenuPending: (pendingId: string | null) => void
  onOpenPasteUploadSettings: () => void
}

export function StoryPhotoPanel({
  disabled,
  isCollapsed,
  isImmersiveMode,
  currentStory,
  editorContent,
  pendingImages,
  pendingCoverId,
  cdnDomain,
  isUploading,
  uploadProgress,
  isDraggingOver,
  draggedItemId,
  draggedItemType,
  dragOverItemId,
  openMenuPhotoId,
  openMenuPendingId,
  t,
  notify,
  onAddPhotos: onAddPhotosProp,
  onInsertPhotoMarkdown: onInsertPhotoMarkdownProp,
  onRemovePhoto: onRemovePhotoProp,
  onRemovePendingImage: onRemovePendingImageProp,
  onSetCover: onSetCoverProp,
  onSetPendingCover: onSetPendingCoverProp,
  onSetPhotoDate: onSetPhotoDateProp,
  onRetryFailedUploads: onRetryFailedUploadsProp,
  onPhotoPanelDragOver: onPhotoPanelDragOverProp,
  onPhotoPanelDragLeave: onPhotoPanelDragLeaveProp,
  onPhotoPanelDrop: onPhotoPanelDropProp,
  onItemDragStart: onItemDragStartProp,
  onItemDragEnd: onItemDragEndProp,
  onItemDragOver: onItemDragOverProp,
  onItemDragLeave: onItemDragLeaveProp,
  onItemDrop: onItemDropProp,
  onOpenMenuPhoto: onOpenMenuPhotoProp,
  onOpenMenuPending: onOpenMenuPendingProp,
  onOpenPasteUploadSettings: onOpenPasteUploadSettingsProp,
}: StoryPhotoPanelProps) {
  const guardMutation = <Args extends unknown[]>(operation: (...args: Args) => void) =>
    guardNarrativeAiMutation(disabled, operation)

  const onAddPhotos = guardMutation(onAddPhotosProp)
  const onInsertPhotoMarkdown = guardMutation(onInsertPhotoMarkdownProp)
  const onRemovePhoto = guardMutation(onRemovePhotoProp)
  const onRemovePendingImage = guardMutation(onRemovePendingImageProp)
  const onSetCover = guardMutation(onSetCoverProp)
  const onSetPendingCover = guardMutation(onSetPendingCoverProp)
  const onSetPhotoDate = guardMutation(onSetPhotoDateProp)
  const onRetryFailedUploads = guardMutation(onRetryFailedUploadsProp)
  const onPhotoPanelDragOver = guardMutation(onPhotoPanelDragOverProp)
  const onPhotoPanelDragLeave = guardMutation(onPhotoPanelDragLeaveProp)
  const onPhotoPanelDrop = guardMutation(onPhotoPanelDropProp)
  const onItemDragStart = guardMutation(onItemDragStartProp)
  const onItemDragEnd = guardMutation(onItemDragEndProp)
  const onItemDragOver = guardMutation(onItemDragOverProp)
  const onItemDragLeave = guardMutation(onItemDragLeaveProp)
  const onItemDrop = guardMutation(onItemDropProp)
  const onOpenMenuPhoto = guardMutation(onOpenMenuPhotoProp)
  const onOpenMenuPending = guardMutation(onOpenMenuPendingProp)
  const onOpenPasteUploadSettings = guardMutation(onOpenPasteUploadSettingsProp)
  const insertedImageUrls = getStoryMarkdownImageUrls(editorContent)
  const referencedPhotoIds = currentStory?.editorType === 'milkdown' ? getMilkdownPhotoIds(editorContent) : getStoryReferencedPhotoIds(editorContent)

  /**
   * 正文里占位卡的 uploadId 集合。待传项的 `id` 就是插卡时的 uploadId，
   * 所以「待传项已排入正文」＝ ids 里含该项 id（与已上传照片的 isPhotoInserted 同一口径）。
   */
  const insertedUploadIds = getMilkdownUploadIds(editorContent)

  const isPhotoInserted = (photo: PhotoDto) => {
    if (referencedPhotoIds.has(photo.id)) {
      return true
    }

    const candidates = getStoryImageMatchCandidates({
      url: photo.url,
      thumbnailUrl: photo.thumbnailUrl,
      cdnDomain,
    })

    return Array.from(candidates).some((candidate) => insertedImageUrls.has(candidate))
  }

  const isPendingInserted = (pending: PendingImage) => insertedUploadIds.has(pending.id)

  const getCombinedItems = () => {
    const photoItems = (currentStory?.photos || []).map((photo) => ({ id: photo.id, type: 'photo' as const }))
    const pendingItems = pendingImages.map((image) => ({ id: image.id, type: 'pending' as const }))
    return [...photoItems, ...pendingItems]
  }

  const [filterTab, setFilterTab] = useState<'all' | 'used' | 'unused'>('all')

  const filteredItems = getCombinedItems().filter((item) => {
    if (filterTab === 'all') return true
    if (item.type === 'pending') {
      const pending = pendingImages.find((image) => image.id === item.id)
      if (!pending) return false
      const inserted = isPendingInserted(pending)
      return filterTab === 'used' ? inserted : !inserted
    }
    const photo = currentStory?.photos?.find((p) => p.id === item.id)
    if (!photo) return false
    const inserted = isPhotoInserted(photo)
    return filterTab === 'used' ? inserted : !inserted
  })

  const filterTabs = [
    { key: 'all' as const, label: t('story.material_all') },
    { key: 'used' as const, label: t('story.material_used') },
    { key: 'unused' as const, label: t('story.material_unused') },
  ]

  if (isCollapsed) {
    return null
  }

  return (
    <fieldset
      disabled={disabled}
      aria-disabled={disabled}
      className={cn(
        'flex h-full min-w-[320px] flex-col overflow-hidden border border-border bg-card',
        isDraggingOver ? 'border-primary bg-primary/5' : 'border-border',
        isImmersiveMode && 'border-t-0'
      )}
      onDragOver={onPhotoPanelDragOver}
      onDragLeave={onPhotoPanelDragLeave}
      onDrop={onPhotoPanelDrop}
    >
      {/* 标题栏高度 h-10，与左侧编辑器工具栏（milkdown top-bar 2.5rem）严格对齐 */}
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-card px-3 py-1">
        <div className="flex min-w-0 items-center gap-2">
          <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-xs font-bold uppercase tracking-[0.24em] text-foreground">
            {t('story.material_library')}
          </span>
          {pendingImages.length > 0 ? (
            <span className="shrink-0 border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              {pendingImages.length} {t('admin.pending_uploads')}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <AdminButton
            type="button"
            onClick={onOpenPasteUploadSettings}
            adminVariant="outlineMuted"
            size="xs"
            className="h-7 border-border/70 bg-background/70"
          >
            {t('admin.upload_settings')}
          </AdminButton>
          <AdminButton
            onClick={onAddPhotos}
            adminVariant="ghost"
            size="xs"
            className="flex h-7 items-center gap-1 px-2 text-primary hover:bg-primary/10"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t('admin.add_photos')}</span>
          </AdminButton>
        </div>
      </div>

      {/* 素材筛选：全部 / 已使用 / 未使用 */}
      <div className="flex shrink-0 gap-0.5 border-b border-border/50 bg-card px-4 py-1.5">
        {filterTabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilterTab(key)}
            className={cn(
              'rounded-md px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors',
              filterTab === key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isUploading ? (
        <div className="border-b border-border bg-primary/5 px-4 py-2">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="max-w-[200px] truncate text-muted-foreground">
              {uploadProgress.currentFile}
            </span>
            <span className="font-medium text-primary">
              {uploadProgress.current}/{uploadProgress.total}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
            />
          </div>
        </div>
      ) : null}

      {!isUploading && pendingImages.some((image) => image.status === 'failed') ? (
        <div className="flex items-center justify-between border-b border-destructive/20 bg-destructive/10 px-4 py-2">
          <span className="text-xs text-destructive">
            {pendingImages.filter((image) => image.status === 'failed').length} {t('admin.upload_failed_count')}
          </span>
          <AdminButton
            onClick={onRetryFailedUploads}
            adminVariant="link"
            className="flex items-center gap-1 text-xs text-destructive"
          >
            <RefreshCw className="h-3 w-3" />
            {t('admin.retry')}
          </AdminButton>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {filteredItems.length > 0 ? (
          /* 一行 3 张：面板 340px（宽屏 390px）时瓦片约 97–114px。 */
          <div className="grid grid-cols-3 gap-2">
            {filteredItems.map((item, idx) => {
              if (item.type === 'photo') {
                const photo = currentStory?.photos?.find((current) => current.id === item.id)
                if (!photo) return null

                return (
                  <div key={photo.id} className="relative">
                    <div
                      draggable={!disabled}
                      onDragStart={(event) => onItemDragStart(event, photo.id, 'photo')}
                      onDragEnd={onItemDragEnd}
                      onDragOver={(event) => onItemDragOver(event, photo.id)}
                      onDragLeave={onItemDragLeave}
                      onDrop={(event) => onItemDrop(event, photo.id, 'photo')}
                      className={cn(
                        'group relative aspect-[4/5] cursor-grab overflow-hidden rounded-md bg-muted transition-opacity active:cursor-grabbing',
                        draggedItemId === photo.id && draggedItemType === 'photo' && 'opacity-50'
                      )}
                    >
                      {/* 更多操作（左上）：EXIF 时间等次要动作 */}
                      <AdminButton
                        onClick={(event) => {
                          event.stopPropagation()
                          onOpenMenuPhoto(openMenuPhotoId === photo.id ? null : photo.id)
                        }}
                        adminVariant="iconOnDark"
                        className="absolute left-1.5 top-1.5 z-20 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                      >
                        <MoreVertical className="h-3 w-3" />
                      </AdminButton>

                      <img
                        src={resolveAssetUrl(photo.thumbnailUrl || photo.url, cdnDomain)}
                        alt={photo.title}
                        className="h-full w-full object-cover pointer-events-none"
                      />

                      {isPhotoInserted(photo) ? (
                        <div aria-hidden className="absolute inset-0 z-10 bg-black/40" />
                      ) : null}

                      {/* 状态角标（左下）：封面 */}
                      {currentStory?.coverPhotoId === photo.id && !pendingCoverId ? (
                        <span className="absolute bottom-2 left-2 z-20">
                          <MaterialBadge background="var(--primary)" color="var(--primary-foreground)">
                            {t('admin.cover')}
                          </MaterialBadge>
                        </span>
                      ) : null}

                      {/* 顺序角标（右下）：与文章列表卡片的「照片数」同位同形 */}
                      <span className="absolute bottom-2 right-2 z-20">
                        <MaterialBadge>
                          <span className="font-mono">{idx + 1}</span>
                        </MaterialBadge>
                      </span>

                      {/* 悬停操作（右上）：图标簇，不铺满遮罩、不挡图 */}
                      <div className="absolute right-1.5 top-1.5 z-20 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <AdminButton
                          onClick={(event) => {
                            event.stopPropagation()
                            onSetCover(photo.id)
                          }}
                          adminVariant="iconOnDark"
                          title={t('admin.cover')}
                        >
                          <Star className="h-3 w-3" />
                        </AdminButton>
                        <AdminButton
                          onClick={(event) => {
                            event.stopPropagation()
                            onInsertPhotoMarkdown(photo)
                          }}
                          adminVariant="iconOnDark"
                          title={t('admin.insert_photo')}
                        >
                          <ImagePlus className="h-3 w-3" />
                        </AdminButton>
                        <AdminButton
                          onClick={(event) => {
                            event.stopPropagation()
                            if (isPhotoInserted(photo)) {
                              notify(t('story.material_in_use'), 'info')
                              return
                            }
                            onRemovePhoto(photo.id)
                          }}
                          adminVariant="iconOnDarkDanger"
                          className={isPhotoInserted(photo) ? 'cursor-not-allowed opacity-50' : undefined}
                          title={isPhotoInserted(photo) ? t('story.material_in_use') : t('common.delete')}
                        >
                          <Trash2 className="h-3 w-3" />
                        </AdminButton>
                      </div>

                      {/* 投放高亮：画在缩略图之上、瓦片边界之内的内圈描边 */}
                      {dragOverItemId === photo.id ? (
                        <span aria-hidden className="pointer-events-none absolute inset-0 z-30 rounded-md border-2" style={{ borderColor: 'var(--primary)' }} />
                      ) : null}
                    </div>

                    {openMenuPhotoId === photo.id ? (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={(event) => {
                            event.stopPropagation()
                            onOpenMenuPhoto(null)
                          }}
                        />
                        <div className="absolute right-0 top-8 z-50 min-w-[160px] border border-border bg-background py-1 shadow-lg">
                          {photo.takenAt ? (
                            <AdminButton
                              onClick={(event) => {
                                event.stopPropagation()
                                onSetPhotoDate(photo.takenAt!)
                                onOpenMenuPhoto(null)
                                notify(t('admin.set_publish_time_success'), 'success')
                              }}
                              adminVariant="ghost"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
                            >
                              <Calendar className="h-3.5 w-3.5" />
                              {t('admin.set_as_publish_time')}
                            </AdminButton>
                          ) : (
                            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                              <Calendar className="h-3.5 w-3.5" />
                              {t('admin.no_exif_time')}
                            </div>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                )
              }

              const pending = pendingImages.find((image) => image.id === item.id)
              if (!pending) return null

              const isPendingCover = pendingCoverId === pending.id

              return (
                <div key={pending.id} className="relative">
                  <div
                    draggable={!disabled && pending.status !== 'uploading'}
                    onDragStart={(event) => onItemDragStart(event, pending.id, 'pending')}
                    onDragEnd={onItemDragEnd}
                    onDragOver={(event) => onItemDragOver(event, pending.id)}
                    onDragLeave={onItemDragLeave}
                    onDrop={(event) => onItemDrop(event, pending.id, 'pending')}
                    className={cn(
                      'group relative aspect-[4/5] overflow-hidden rounded-md bg-muted transition-opacity',
                      draggedItemId === pending.id && draggedItemType === 'pending' && 'opacity-50',
                      pending.status !== 'uploading' && 'cursor-grab active:cursor-grabbing'
                    )}
                  >
                    {pending.status !== 'uploading' ? (
                      <AdminButton
                        onClick={(event) => {
                          event.stopPropagation()
                          onOpenMenuPending(openMenuPendingId === pending.id ? null : pending.id)
                        }}
                        adminVariant="iconOnDark"
                        className="absolute left-1.5 top-1.5 z-20 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                      >
                        <MoreVertical className="h-3 w-3" />
                      </AdminButton>
                    ) : null}

                    <img src={pending.previewUrl} alt="" className="h-full w-full object-cover pointer-events-none" />

                    {/* 状态角标（左下）：待传 / 失败 / 封面 —— 状态用胶囊表达，不再借虚线边框 */}
                    <span className="absolute bottom-2 left-2 z-20 flex flex-wrap items-center gap-1">
                      {isPendingCover ? (
                        <MaterialBadge background="var(--primary)" color="var(--primary-foreground)">
                          {t('admin.cover')}
                        </MaterialBadge>
                      ) : null}
                      {pending.status === 'pending' ? (
                        <MaterialBadge background="var(--primary)" color="var(--primary-foreground)">
                          {t('admin.pending_uploads')}
                        </MaterialBadge>
                      ) : null}
                      {pending.status === 'failed' ? (
                        <MaterialBadge background="#f87171">
                          {t('admin.failed')}
                        </MaterialBadge>
                      ) : null}
                    </span>

                    {/* 顺序角标（右下） */}
                    <span className="absolute bottom-2 right-2 z-20">
                      <MaterialBadge>
                        <span className="font-mono">{idx + 1}</span>
                      </MaterialBadge>
                    </span>

                    {/* 上传中：只有进度值得铺满遮罩 */}
                    {pending.status === 'uploading' ? (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
                        <div className="flex flex-col items-center">
                          <Loader2 className="h-5 w-5 animate-spin text-white" />
                          <span className="mt-1 text-[10px] text-white">{pending.progress}%</span>
                        </div>
                      </div>
                    ) : null}

                    {pending.status !== 'uploading' ? (
                      <div className="absolute right-1.5 top-1.5 z-20 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        {!isPendingCover ? (
                          <AdminButton
                            onClick={(event) => {
                              event.stopPropagation()
                              onSetPendingCover(pending.id)
                            }}
                            adminVariant="iconOnDark"
                            title={t('admin.cover')}
                          >
                            <Star className="h-3 w-3" />
                          </AdminButton>
                        ) : null}
                        <AdminButton
                          onClick={(event) => {
                            event.stopPropagation()
                            onRemovePendingImage(pending.id)
                          }}
                          adminVariant="iconOnDarkDanger"
                          title={t('common.delete')}
                        >
                          <Trash2 className="h-3 w-3" />
                        </AdminButton>
                      </div>
                    ) : null}

                    {dragOverItemId === pending.id ? (
                      <span aria-hidden className="pointer-events-none absolute inset-0 z-30 rounded-md border-2" style={{ borderColor: 'var(--primary)' }} />
                    ) : null}
                  </div>

                  {openMenuPendingId === pending.id ? (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={(event) => {
                          event.stopPropagation()
                          onOpenMenuPending(null)
                        }}
                      />
                      <div className="absolute right-0 top-8 z-50 min-w-[160px] border border-border bg-background py-1 shadow-lg">
                        {pending.takenAt ? (
                          <AdminButton
                            onClick={(event) => {
                              event.stopPropagation()
                              onSetPhotoDate(pending.takenAt!)
                              onOpenMenuPending(null)
                              notify(t('admin.set_publish_time_success'), 'success')
                            }}
                            adminVariant="ghost"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
                          >
                            <Calendar className="h-3.5 w-3.5" />
                            {t('admin.set_as_publish_time')}
                          </AdminButton>
                        ) : (
                          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5" />
                            {t('admin.no_exif_time')}
                          </div>
                        )}
                      </div>
                    </>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            {filterTab === 'used' ? (
              <p className="mb-1 text-center text-xs">{t('story.material_no_used')}</p>
            ) : filterTab === 'unused' ? (
              <p className="mb-1 text-center text-xs">{t('story.material_no_unused')}</p>
            ) : (
              <>
                <Upload className="mb-3 h-12 w-12 opacity-20" />
                <p className="mb-1 text-center text-xs">{t('admin.drag_images_here')}</p>
                <p className="mb-3 text-center text-[10px] opacity-60">{t('admin.drag_images_insert_hint')}</p>
                <AdminButton onClick={onAddPhotos} adminVariant="link" className="text-xs text-primary">
                  {t('admin.select_from_library')}
                </AdminButton>
              </>
            )}
          </div>
        )}
      </div>
    </fieldset>
  )
}
