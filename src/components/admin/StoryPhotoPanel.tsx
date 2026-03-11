'use client'

import React from 'react'
import {
  Plus,
  Image as ImageIcon,
  X,
  Loader2,
  Calendar,
  Upload,
  RefreshCw,
  MoreVertical,
  LayoutGrid,
} from 'lucide-react'
import { resolveAssetUrl, type StoryDto, type PhotoDto } from '@/lib/api'
import { AdminButton } from '@/components/admin/AdminButton'

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

interface StoryPhotoPanelProps {
  currentStory: StoryDto | null
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
  onInsertExternalPhotoMarkdown: () => void
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
  currentStory,
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
  onAddPhotos,
  onInsertExternalPhotoMarkdown,
  onInsertPhotoMarkdown,
  onInsertGalleryMarkdown,
  onRemovePhoto,
  onRemovePendingImage,
  onSetCover,
  onSetPendingCover,
  onSetPhotoDate,
  onRetryFailedUploads,
  onPhotoPanelDragOver,
  onPhotoPanelDragLeave,
  onPhotoPanelDrop,
  onItemDragStart,
  onItemDragEnd,
  onItemDragOver,
  onItemDragLeave,
  onItemDrop,
  onOpenMenuPhoto,
  onOpenMenuPending,
  onOpenPasteUploadSettings,
}: StoryPhotoPanelProps) {
  const getCombinedItems = () => {
    const photoItems = (currentStory?.photos || []).map((photo) => ({ id: photo.id, type: 'photo' as const }))
    const pendingItems = pendingImages.map((image) => ({ id: image.id, type: 'pending' as const }))
    return [...photoItems, ...pendingItems]
  }

  return (
    <div
      className={`flex-[3] flex min-w-[320px] flex-col overflow-hidden rounded-lg border transition-colors ${
        isDraggingOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'
      }`}
      onDragOver={onPhotoPanelDragOver}
      onDragLeave={onPhotoPanelDragLeave}
      onDrop={onPhotoPanelDrop}
    >
      <div className="flex items-center justify-between border-b border-border bg-background/50 p-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-widest">
            {t('story.related_photos')}
          </span>
          <span className="text-xs text-muted-foreground">
            ({(currentStory?.photos?.length || 0) + pendingImages.length})
          </span>
          {pendingImages.length > 0 ? (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
              {pendingImages.length} 待上传
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <AdminButton
            type="button"
            onClick={onInsertExternalPhotoMarkdown}
            adminVariant="outlineMuted"
            size="xs"
            className="rounded-md"
          >
            外链图
          </AdminButton>
          <AdminButton
            type="button"
            onClick={onOpenPasteUploadSettings}
            adminVariant="outlineMuted"
            size="xs"
            className="rounded-md"
          >
            上传设置
          </AdminButton>
          <AdminButton
            onClick={onAddPhotos}
            adminVariant="ghost"
            size="sm"
            className="flex items-center gap-1 rounded-md text-primary hover:bg-primary/10"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t('admin.add_photos')}</span>
          </AdminButton>
        </div>
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
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
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
            {pendingImages.filter((image) => image.status === 'failed').length} 张上传失败
          </span>
          <AdminButton
            onClick={onRetryFailedUploads}
            adminVariant="link"
            className="flex items-center gap-1 text-xs text-destructive"
          >
            <RefreshCw className="h-3 w-3" />
            重试
          </AdminButton>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {currentStory?.photos && currentStory.photos.length >= 2 ? (
          <div className="mb-4 rounded-lg border border-border bg-background/60 p-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              混排快捷插入
            </div>
            <AdminButton
              type="button"
              onClick={() => onInsertGalleryMarkdown(currentStory.photos.map((photo) => photo.id))}
              adminVariant="primarySoft"
              size="sm"
              className="flex w-full items-center justify-center gap-2 rounded-md"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              插入当前故事 Markdown 图片组
            </AdminButton>
          </div>
        ) : null}

        {(currentStory?.photos && currentStory.photos.length > 0) || pendingImages.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {getCombinedItems().map((item, idx) => {
              if (item.type === 'photo') {
                const photo = currentStory?.photos?.find((current) => current.id === item.id)
                if (!photo) return null

                return (
                  <div key={photo.id} className="relative">
                    <div
                      draggable
                      onDragStart={(event) => onItemDragStart(event, photo.id, 'photo')}
                      onDragEnd={onItemDragEnd}
                      onDragOver={(event) => onItemDragOver(event, photo.id)}
                      onDragLeave={onItemDragLeave}
                      onDrop={(event) => onItemDrop(event, photo.id, 'photo')}
                      className={`relative group aspect-square cursor-grab overflow-hidden rounded-lg border-2 transition-all active:cursor-grabbing ${
                        dragOverItemId === photo.id
                          ? 'scale-105 border-primary border-dashed shadow-lg'
                          : currentStory?.coverPhotoId === photo.id
                            ? 'border-primary'
                            : 'border-transparent hover:border-border'
                      } ${draggedItemId === photo.id && draggedItemType === 'photo' ? 'opacity-50' : ''}`}
                    >
                      <AdminButton
                        onClick={(event) => {
                          event.stopPropagation()
                          onOpenMenuPhoto(openMenuPhotoId === photo.id ? null : photo.id)
                        }}
                        adminVariant="icon"
                        className="absolute right-1 top-1 z-20 rounded bg-black/40 p-1 text-white opacity-0 transition-opacity hover:bg-black/60 group-hover:opacity-100"
                      >
                        <MoreVertical className="h-3 w-3" />
                      </AdminButton>

                      <div className="absolute bottom-1 right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/60">
                        <span className="text-[10px] font-bold text-white">{idx + 1}</span>
                      </div>

                      <img
                        src={resolveAssetUrl(photo.thumbnailUrl || photo.url, cdnDomain)}
                        alt={photo.title}
                        className="h-full w-full object-cover pointer-events-none"
                      />

                      {currentStory?.coverPhotoId === photo.id && !pendingCoverId ? (
                        <div className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[8px] font-bold uppercase text-primary-foreground">
                          {t('admin.cover')}
                        </div>
                      ) : null}

                      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                        {currentStory?.coverPhotoId !== photo.id || pendingCoverId ? (
                          <AdminButton
                            onClick={(event) => {
                              event.stopPropagation()
                              onSetCover(photo.id)
                            }}
                            adminVariant="ghost"
                            className="rounded bg-white/20 p-1.5 text-[10px] font-medium text-white hover:bg-white/40"
                          >
                            Cover
                          </AdminButton>
                        ) : null}
                        <AdminButton
                          onClick={(event) => {
                            event.stopPropagation()
                            onInsertPhotoMarkdown(photo)
                          }}
                          adminVariant="ghost"
                          className="rounded bg-white/20 p-1.5 text-[10px] font-medium text-white hover:bg-white/40"
                        >
                          插入
                        </AdminButton>
                        <AdminButton
                          onClick={(event) => {
                            event.stopPropagation()
                            onRemovePhoto(photo.id)
                          }}
                          adminVariant="ghost"
                          className="rounded bg-white/20 p-1.5 text-white hover:bg-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </AdminButton>
                      </div>
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
                        <div className="absolute right-0 top-8 z-50 min-w-[160px] rounded-md border border-border bg-background py-1 shadow-lg">
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
                    draggable={pending.status !== 'uploading'}
                    onDragStart={(event) => onItemDragStart(event, pending.id, 'pending')}
                    onDragEnd={onItemDragEnd}
                    onDragOver={(event) => onItemDragOver(event, pending.id)}
                    onDragLeave={onItemDragLeave}
                    onDrop={(event) => onItemDrop(event, pending.id, 'pending')}
                    className={`relative group aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                      pending.status === 'uploading'
                        ? 'border-primary'
                        : pending.status === 'failed'
                          ? 'border-destructive border-dashed'
                          : isPendingCover
                            ? 'border-primary'
                            : 'border-amber-500 border-dashed'
                    } ${dragOverItemId === pending.id ? 'scale-105 shadow-lg' : ''} ${
                      draggedItemId === pending.id && draggedItemType === 'pending' ? 'opacity-50' : ''
                    } ${pending.status !== 'uploading' ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  >
                    {pending.status !== 'uploading' ? (
                      <AdminButton
                        onClick={(event) => {
                          event.stopPropagation()
                          onOpenMenuPending(openMenuPendingId === pending.id ? null : pending.id)
                        }}
                        adminVariant="icon"
                        className="absolute right-1 top-1 z-20 rounded bg-black/40 p-1 text-white opacity-0 transition-opacity hover:bg-black/60 group-hover:opacity-100"
                      >
                        <MoreVertical className="h-3 w-3" />
                      </AdminButton>
                    ) : null}

                    <div className="absolute bottom-1 right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/60">
                      <span className="text-[10px] font-bold text-white">{idx + 1}</span>
                    </div>

                    <img src={pending.previewUrl} alt="" className="h-full w-full object-cover pointer-events-none" />

                    {isPendingCover ? (
                      <div className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[8px] font-bold uppercase text-primary-foreground">
                        {t('admin.cover')}
                      </div>
                    ) : null}

                    <div
                      className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                        pending.status === 'uploading'
                          ? 'bg-black/40 opacity-100'
                          : pending.status === 'failed'
                            ? 'bg-destructive/30 opacity-100'
                            : 'bg-amber-500/20 opacity-100 group-hover:opacity-0'
                      }`}
                    >
                      {pending.status === 'uploading' ? (
                        <div className="flex flex-col items-center">
                          <Loader2 className="h-5 w-5 animate-spin text-white" />
                          <span className="mt-1 text-[10px] text-white">{pending.progress}%</span>
                        </div>
                      ) : null}
                      {pending.status === 'pending' ? <Upload className="h-5 w-5 text-amber-600" /> : null}
                      {pending.status === 'failed' ? <X className="h-5 w-5 text-destructive" /> : null}
                    </div>

                    {pending.status !== 'uploading' ? (
                      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                        {!isPendingCover ? (
                          <AdminButton
                            onClick={(event) => {
                              event.stopPropagation()
                              onSetPendingCover(pending.id)
                            }}
                            adminVariant="ghost"
                            className="rounded bg-white/20 p-1.5 text-[10px] font-medium text-white hover:bg-white/40"
                          >
                            Cover
                          </AdminButton>
                        ) : null}
                        <AdminButton
                          onClick={(event) => {
                            event.stopPropagation()
                            onRemovePendingImage(pending.id)
                          }}
                          adminVariant="ghost"
                          className="rounded bg-white/20 p-1.5 text-white hover:bg-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </AdminButton>
                      </div>
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
                      <div className="absolute right-0 top-8 z-50 min-w-[160px] rounded-md border border-border bg-background py-1 shadow-lg">
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
            <Upload className="mb-3 h-12 w-12 opacity-20" />
            <p className="mb-1 text-center text-xs">拖拽图片到这里</p>
            <p className="mb-3 text-center text-[10px] opacity-60">或先关联图片，再插入到正文</p>
            <AdminButton onClick={onAddPhotos} adminVariant="link" className="text-xs text-primary">
              从图库选择
            </AdminButton>
          </div>
        )}
      </div>
    </div>
  )
}
