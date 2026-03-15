'use client'

import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Save,
} from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminInput } from '@/components/admin/AdminFormControls'
import { StoryPhotoPanel, type PendingImage } from '@/components/admin/StoryPhotoPanel'
import type { NarrativeTipTapEditorHandle } from '@/components/NarrativeTipTapEditor'
import type { PhotoDto, StoryDto } from '@/lib/api'
import { normalizeStoryContentImages } from '@/lib/story-rich-content'
import { cn } from '@/lib/utils'
import { NarrativeTipTapEditor } from './constants'
import type { UploadProgressState } from './types'

interface StoryEditorViewProps {
  currentStory: StoryDto
  pendingImages: PendingImage[]
  pendingCoverId: string | null
  saving: boolean
  draftSaved: boolean
  lastSavedAt: number | null
  editorVersion: number
  editorRef: React.RefObject<NarrativeTipTapEditorHandle | null>
  isImmersiveMode: boolean
  setIsImmersiveMode: Dispatch<SetStateAction<boolean>>
  useCustomDate: boolean
  setUseCustomDate: Dispatch<SetStateAction<boolean>>
  isPhotoPanelCollapsed: boolean
  togglePhotoPanelCollapse: () => void
  settingsCdnDomain?: string
  isUploading: boolean
  uploadProgress: UploadProgressState
  isDraggingOver: boolean
  draggedItemId: string | null
  draggedItemType: 'photo' | 'pending' | null
  dragOverItemId: string | null
  openMenuPhotoId: string | null
  openMenuPendingId: string | null
  showPreview: () => void
  onBack: () => void
  onSave: () => void
  onPasteFiles: (files: File[]) => void
  onOpenPhotoSelector: () => void
  onInsertExternalPhotoMarkdown: () => void
  onInsertPhotoMarkdown: (photo: PhotoDto) => void
  onInsertGalleryMarkdown: (photoIds: string[]) => void
  onOpenPasteUploadSettings: () => void
  onRemovePhoto: (photoId: string) => void
  onRemovePendingImage: (id: string) => void
  onSetCover: (photoId: string) => void
  onSetPendingCover: (id: string) => void
  onSetPhotoDate: (takenAt: string) => void
  onRetryFailedUploads: () => void
  onPhotoPanelDragOver: (event: React.DragEvent) => void
  onPhotoPanelDragLeave: (event: React.DragEvent) => void
  onPhotoPanelDrop: (event: React.DragEvent) => void
  onItemDragStart: (event: React.DragEvent, itemId: string, type: 'photo' | 'pending') => void
  onItemDragEnd: (event: React.DragEvent) => void
  onItemDragOver: (event: React.DragEvent, itemId: string) => void
  onItemDragLeave: () => void
  onItemDrop: (event: React.DragEvent, targetId: string, targetType: 'photo' | 'pending') => void
  onOpenMenuPhoto: (photoId: string | null) => void
  onOpenMenuPending: (pendingId: string | null) => void
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  setCurrentStory: Dispatch<SetStateAction<StoryDto | null>>
}

export function StoryEditorView({
  currentStory,
  pendingImages,
  pendingCoverId,
  saving,
  draftSaved,
  lastSavedAt,
  editorVersion,
  editorRef,
  isImmersiveMode,
  setIsImmersiveMode,
  useCustomDate,
  setUseCustomDate,
  isPhotoPanelCollapsed,
  togglePhotoPanelCollapse,
  settingsCdnDomain,
  isUploading,
  uploadProgress,
  isDraggingOver,
  draggedItemId,
  draggedItemType,
  dragOverItemId,
  openMenuPhotoId,
  openMenuPendingId,
  showPreview,
  onBack,
  onSave,
  onPasteFiles,
  onOpenPhotoSelector,
  onInsertExternalPhotoMarkdown,
  onInsertPhotoMarkdown,
  onInsertGalleryMarkdown,
  onOpenPasteUploadSettings,
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
  t,
  notify,
  setCurrentStory,
}: StoryEditorViewProps) {
  const editorCharacterCount = (currentStory.content || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().length
  const relatedPhotoCount = currentStory.photos?.length || 0
  const pendingPhotoCount = pendingImages.length

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden">
      <div className={cn('flex shrink-0 flex-col gap-4 border-b border-border/70 pb-4 md:flex-row md:items-end md:justify-between')}>
        <div className="flex min-w-0 flex-1 items-end gap-3">
          <AdminButton onClick={onBack} adminVariant="link" className="shrink-0 self-start whitespace-nowrap px-0 text-[10px] tracking-[0.24em] hover:no-underline">
            <ChevronLeft className="h-4 w-4" /> {t('admin.back_list')}
          </AdminButton>
          <AdminInput type="text" value={currentStory.title || ''} onChange={(event) => setCurrentStory((prev) => (prev ? { ...prev, title: event.target.value } : prev))} placeholder={t('story.title_placeholder')} className="min-w-0 flex-1 border-0 border-b border-border/60 bg-transparent px-0 py-0 font-serif text-4xl font-light leading-[0.92] tracking-tight shadow-none transition-colors placeholder:font-serif placeholder:text-muted-foreground/35 hover:border-foreground/25 focus:border-primary focus-visible:ring-0 md:text-6xl" />
          {draftSaved ? <span className="flex items-center gap-1 text-[10px] text-green-500"><Check className="h-3 w-3" />{t('story.draft_saved') || 'Saved'}</span> : null}
          {!draftSaved && lastSavedAt ? <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60"><Clock className="h-3 w-3" />{new Date(lastSavedAt).toLocaleTimeString()}</span> : null}
        </div>
        <AdminButton onClick={onSave} disabled={saving} adminVariant="primary" size="lg" className="flex h-10 items-center gap-2 px-5 shadow-none"><Save className="h-4 w-4" /><span>{saving ? t('ui.saving') : t('admin.save')}</span></AdminButton>
      </div>

      <div className={cn('relative flex min-h-0 flex-1 gap-4 overflow-hidden', isImmersiveMode && 'gap-0')}>
        <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-border/80 bg-card/40 shadow-[0_24px_60px_-36px_rgba(0,0,0,0.35)]', isImmersiveMode && 'border-y-0 border-l-0 shadow-none')}>
          <div className={cn('flex flex-col gap-2 border-b border-border/70 bg-gradient-to-r from-muted/15 via-background to-muted/10 px-4 py-2 sm:flex-row sm:items-center sm:justify-between')}>
            <div className="flex flex-wrap items-center gap-4">
              <label className="group flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={currentStory.isPublished || false} onChange={(event) => setCurrentStory((prev) => (prev ? { ...prev, isPublished: event.target.checked } : prev))} className="h-4 w-4 cursor-pointer accent-primary transition-all" />
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground transition-colors group-hover:text-foreground">{t('ui.publish_now')}</span>
              </label>
              <div className="hidden h-4 w-px bg-border/60 sm:block" />
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {useCustomDate ? (
                  <div className="flex items-center gap-1">
                    <input type="datetime-local" value={new Date(currentStory.createdAt).toISOString().slice(0, 16)} onChange={(event) => { const value = event.target.value; setCurrentStory((prev) => prev ? { ...prev, createdAt: value ? new Date(value).toISOString() : new Date().toISOString() } : prev) }} className="border border-border bg-background px-2 py-1 text-xs outline-none transition-all focus:border-primary" />
                    <button type="button" onClick={() => setUseCustomDate(false)} className="p-1 text-primary transition-colors hover:bg-primary/10" title={t('admin.confirm') || '确认'}><Check className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <span onClick={() => setUseCustomDate(true)} className="cursor-pointer text-xs text-muted-foreground underline-offset-4 transition-all hover:text-foreground hover:underline decoration-dashed" title={t('admin.custom_date') || '点击编辑日期'}>{new Date(currentStory.createdAt).toLocaleString()}</span>
                )}
              </div>
              <div className="hidden h-4 w-px bg-border/60 sm:block" />
              <span className="flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground"><FileText className="h-4 w-4" />{editorCharacterCount} {t('admin.characters')}</span>
              <span className="flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground"><ImageIcon className="h-4 w-4" />{relatedPhotoCount} {t('story.related_photos')}</span>
            </div>
            <div className="flex items-center gap-2">
              <AdminButton onClick={() => setIsImmersiveMode((prev) => !prev)} adminVariant="outline" className="flex h-8 items-center gap-2 border border-border/80 bg-background/80 px-3 text-xs shadow-none transition-all hover:bg-accent hover:text-accent-foreground">{isImmersiveMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}{t('ui.immersive') || '沉浸'}</AdminButton>
              <AdminButton onClick={showPreview} adminVariant="outline" className="flex h-8 items-center gap-2 border border-border/80 bg-background/80 px-3 text-xs shadow-none transition-all hover:bg-accent hover:text-accent-foreground"><Eye className="h-3.5 w-3.5" />{t('admin.preview') || '预览'}</AdminButton>
            </div>
          </div>

          <div className={cn('relative min-h-0 flex-1 overflow-hidden bg-background', isImmersiveMode && 'border-r border-border/60')}>
            <NarrativeTipTapEditor key={`${currentStory.id}:${editorVersion}`} ref={editorRef} value={currentStory.content} onChange={(content) => setCurrentStory((prev) => (prev ? { ...prev, content: normalizeStoryContentImages(content) } : prev))} onPasteFiles={onPasteFiles} placeholder={t('ui.markdown_placeholder')} className="overflow-hidden bg-background" />
          </div>
        </div>

        <div className={cn('z-10 -mx-2 hidden flex-col justify-center md:flex', isImmersiveMode && 'mr-2')}>
          <button type="button" onClick={togglePhotoPanelCollapse} className="relative flex h-14 w-6 shrink-0 items-center justify-center border border-border bg-background transition-all hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" aria-label={isPhotoPanelCollapsed ? (t('common.expand') || 'Expand related photos') : (t('common.collapse') || 'Collapse related photos')} aria-pressed={isPhotoPanelCollapsed}>{isPhotoPanelCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
        </div>

        <div className={cn('h-full min-h-0 shrink-0 overflow-hidden will-change-[width] transition-[width] duration-300 ease-out motion-reduce:transition-none', isPhotoPanelCollapsed ? 'w-20' : isImmersiveMode ? 'w-[360px] xl:w-[420px]' : 'w-[340px] xl:w-[390px]')}>
          <StoryPhotoPanel isCollapsed={isPhotoPanelCollapsed} currentStory={currentStory} pendingImages={pendingImages} pendingCoverId={pendingCoverId} cdnDomain={settingsCdnDomain} isUploading={isUploading} uploadProgress={uploadProgress} isDraggingOver={isDraggingOver} draggedItemId={draggedItemId} draggedItemType={draggedItemType} dragOverItemId={dragOverItemId} openMenuPhotoId={openMenuPhotoId} openMenuPendingId={openMenuPendingId} t={t} notify={notify} onAddPhotos={onOpenPhotoSelector} onInsertExternalPhotoMarkdown={onInsertExternalPhotoMarkdown} onInsertPhotoMarkdown={onInsertPhotoMarkdown} onInsertGalleryMarkdown={onInsertGalleryMarkdown} onOpenPasteUploadSettings={onOpenPasteUploadSettings} onRemovePhoto={onRemovePhoto} onRemovePendingImage={onRemovePendingImage} onSetCover={onSetCover} onSetPendingCover={onSetPendingCover} onSetPhotoDate={onSetPhotoDate} onRetryFailedUploads={onRetryFailedUploads} onPhotoPanelDragOver={onPhotoPanelDragOver} onPhotoPanelDragLeave={onPhotoPanelDragLeave} onPhotoPanelDrop={onPhotoPanelDrop} onItemDragStart={onItemDragStart} onItemDragEnd={onItemDragEnd} onItemDragOver={onItemDragOver} onItemDragLeave={onItemDragLeave} onItemDrop={onItemDrop} onOpenMenuPhoto={onOpenMenuPhoto} onOpenMenuPending={onOpenMenuPending} />
        </div>
      </div>
    </div>
  )
}
