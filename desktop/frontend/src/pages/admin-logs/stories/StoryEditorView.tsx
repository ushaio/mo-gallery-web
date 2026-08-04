'use client'

import { useEffect, useMemo, useState } from 'react'
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
import type { PhotoDto, StoryDto } from '@/lib/api/types'
import { countStoryCharacters, hydrateStoryContentImages, hydrateStoryContentJsonImages, normalizeStoryContentImages, normalizeStoryContentJsonImages } from '@/lib/story-rich-content'
import { cn } from '@/lib/utils'
import { WindowFullscreen, WindowUnfullscreen } from '../../../../wailsjs/runtime/runtime'
import { NarrativeTipTapEditor } from './constants'
import type { UploadProgressState } from './types'

interface StoryEditorViewProps {
  token: string | null
  currentStory: StoryDto
  pendingImages: PendingImage[]
  pendingCoverId: string | null
  saving: boolean
  draftSaved: boolean
  lastSavedAt: number | null
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
  token,
  currentStory,
  pendingImages,
  pendingCoverId,
  saving,
  draftSaved,
  lastSavedAt,
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
  const [isAiTaskLocked, setIsAiTaskLocked] = useState(false)
  const editorCharacterCount = countStoryCharacters(currentStory.content)
  const relatedPhotoCount = currentStory.photos?.length || 0
  const hydratedEditorContent = useMemo(
    () => hydrateStoryContentImages(currentStory.content, currentStory.photos || [], settingsCdnDomain),
    [currentStory.content, currentStory.photos, settingsCdnDomain],
  )
  const hydratedEditorJsonContent = useMemo(
    () => hydrateStoryContentJsonImages(currentStory.contentJson, currentStory.photos || [], settingsCdnDomain),
    [currentStory.contentJson, currentStory.photos, settingsCdnDomain],
  )

  useEffect(() => {
    if (!isImmersiveMode) return

    const previousBodyOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'
    WindowFullscreen()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      setIsImmersiveMode(false)
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousBodyOverflow
      WindowUnfullscreen()
    }
  }, [isImmersiveMode, setIsImmersiveMode])


  return (
    <div
      className={cn(
        'flex flex-1 flex-col gap-4 overflow-hidden',
        isImmersiveMode && 'fixed inset-0 z-[45] h-dvh w-screen gap-3 bg-background p-3 sm:p-4',
      )}
    >
      <fieldset disabled={isAiTaskLocked} className={cn('flex shrink-0 items-center justify-between gap-4 border-0 border-b border-border px-3 py-2.5 sm:px-5')}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <AdminButton onClick={onBack} adminVariant="outlineMuted" size="sm" className="flex h-8 shrink-0 items-center gap-1.5 rounded-md" title={t('admin.back_list')}>
            <ChevronLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('admin.back_list')}</span>
          </AdminButton>
          <div className="hidden h-5 w-px shrink-0 bg-border sm:block" />
          <AdminInput type="text" value={currentStory.title || ''} onChange={(event) => setCurrentStory((prev) => (prev ? { ...prev, title: event.target.value } : prev))} placeholder={t('story.title_placeholder')} className="min-w-0 flex-1 border-0 border-b border-border/40 bg-transparent px-0 py-1 font-serif text-xl font-light leading-none tracking-tight shadow-none transition-colors placeholder:font-serif placeholder:text-muted-foreground/35 hover:border-foreground/25 focus:border-primary focus-visible:ring-0 md:text-2xl" />
          {draftSaved ? (
            <span className="flex shrink-0 items-center gap-1 rounded border border-green-500/25 bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
              <Check className="h-3 w-3" />
              {t('story.draft_saved')}
            </span>
          ) : null}
          {!draftSaved && lastSavedAt ? (
            <span className="flex shrink-0 items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
              <Clock className="h-3 w-3" />
              {new Date(lastSavedAt).toLocaleTimeString()}
            </span>
          ) : null}
        </div>
        <AdminButton onClick={onSave} disabled={saving} adminVariant="primary" size="md" className="flex h-9 shrink-0 items-center gap-2 rounded-md px-4 shadow-none">
          <Save className="h-3.5 w-3.5" />
          <span>{saving ? t('ui.saving') : t('admin.save')}</span>
        </AdminButton>
      </fieldset>

      <div className="relative flex min-h-0 flex-1 gap-0 overflow-hidden">
        <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-border/80 bg-card/50 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.25)]', isImmersiveMode && 'border-y-0 border-l-0 shadow-none')}>
          <fieldset disabled={isAiTaskLocked} className={cn('flex flex-col gap-2 border-0 border-b border-border/70 bg-card/60 px-4 py-2 sm:flex-row sm:items-center sm:justify-between')}>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <div className="flex items-center gap-2">
                <AdminButton
                  onClick={() => setCurrentStory((prev) => (prev ? { ...prev, isPublished: !prev.isPublished } : prev))}
                  adminVariant="switch"
                  data-state={currentStory.isPublished ? 'checked' : 'unchecked'}
                  title={t('ui.publish_now')}
                  aria-label={t('ui.publish_now')}
                >
                  <span className={cn('absolute left-0.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform duration-200', currentStory.isPublished ? 'translate-x-[20px]' : 'translate-x-0')} />
                </AdminButton>
                <span className={cn('text-[10px] font-bold uppercase tracking-widest transition-colors', currentStory.isPublished ? 'text-primary' : 'text-muted-foreground')}>
                  {currentStory.isPublished ? t('admin.published') : t('admin.draft')}
                </span>
              </div>
              <div className="hidden h-4 w-px bg-border/70 sm:block" />
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                {useCustomDate ? (
                  <div className="flex items-center gap-1">
                    <input type="datetime-local" value={new Date(currentStory.storyDate).toISOString().slice(0, 16)} onChange={(event) => { const value = event.target.value; setCurrentStory((prev) => prev ? { ...prev, storyDate: value ? new Date(value).toISOString() : new Date().toISOString() } : prev) }} className="rounded border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-wide outline-none transition-all focus:border-primary" />
                    <button type="button" onClick={() => setUseCustomDate(false)} className="rounded p-1 text-primary transition-colors hover:bg-primary/10" title={t('common.confirm')}><Check className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <button type="button" disabled={isAiTaskLocked} onClick={() => setUseCustomDate(true)} className="cursor-pointer font-mono text-[10px] uppercase tracking-wide text-muted-foreground underline-offset-4 transition-all hover:text-foreground hover:underline decoration-dashed disabled:cursor-not-allowed disabled:opacity-60" title={t('admin.custom_date')}>{new Date(currentStory.storyDate).toLocaleString()}</button>
                )}
              </div>
              <div className="hidden h-4 w-px bg-border/70 sm:block" />
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground"><FileText className="h-3.5 w-3.5" />{editorCharacterCount} {t('admin.characters')}</span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground"><ImageIcon className="h-3.5 w-3.5" />{relatedPhotoCount} {t('story.related_photos')}</span>
            </div>
            <div className="flex items-center gap-2">
              <AdminButton
                onClick={() => setIsImmersiveMode((prev) => !prev)}
                adminVariant="outline"
                className="flex h-8 items-center gap-2 rounded-md border border-border/80 bg-card px-3 text-[10px] shadow-none transition-all hover:bg-accent hover:text-accent-foreground"
                title={isImmersiveMode ? `${t('ui.immersive')} (Esc)` : t('ui.immersive')}
                aria-pressed={isImmersiveMode}
              >
                {isImmersiveMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                {t('ui.immersive')}
              </AdminButton>
              <AdminButton onClick={showPreview} adminVariant="outline" className="flex h-8 items-center gap-2 rounded-md border border-border/80 bg-card px-3 text-[10px] shadow-none transition-all hover:bg-accent hover:text-accent-foreground"><Eye className="h-3.5 w-3.5" />{t('admin.preview')}</AdminButton>
            </div>
          </fieldset>

          <div className={cn('relative min-h-0 flex-1 overflow-hidden bg-background', isImmersiveMode && 'border-r border-border/60')}>
            <NarrativeTipTapEditor
              ref={editorRef}
              value={hydratedEditorContent}
              jsonValue={hydratedEditorJsonContent}
              onChange={(content) => setCurrentStory((prev) => (prev ? { ...prev, content: normalizeStoryContentImages(content) } : prev))}
              onJsonChange={(contentJson) => setCurrentStory((prev) => (prev ? { ...prev, contentJson: normalizeStoryContentJsonImages(contentJson) } : prev))}
              onPasteFiles={onPasteFiles}
              placeholder={t('ui.markdown_placeholder')}
              className="overflow-hidden bg-background"
              documentId={currentStory.id}
              documentKind="story"
              onAiTaskLockChange={setIsAiTaskLocked}
              aiOptions={{
                enabled: true,
                token,
                scopeId: currentStory.id,
                title: currentStory.title,
              }}
            />
          </div>
        </div>

        <div className="relative z-10 hidden w-0 shrink-0 md:block">
          <button
            type="button"
            disabled={isAiTaskLocked}
            onClick={togglePhotoPanelCollapse}
            className="absolute left-1/2 top-1/2 z-10 flex h-14 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/95 text-muted-foreground shadow-[0_8px_24px_rgba(15,23,42,0.10)] backdrop-blur transition-all duration-300 ease-out hover:h-16 hover:w-8 hover:border-primary/40 hover:text-foreground hover:shadow-[0_12px_32px_rgba(15,23,42,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none"
            aria-label={isPhotoPanelCollapsed ? t('common.expand') : t('common.collapse')}
            aria-pressed={isPhotoPanelCollapsed}
          >
            <div className="flex h-9 w-4 items-center justify-center rounded-full border border-border/70 bg-muted/50">
              {isPhotoPanelCollapsed ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </div>
          </button>
        </div>

        <fieldset disabled={isAiTaskLocked} className={cn('h-full min-h-0 shrink-0 overflow-hidden border-0 will-change-[width] transition-[width] duration-300 ease-out motion-reduce:transition-none', isPhotoPanelCollapsed ? 'w-20' : isImmersiveMode ? 'w-[360px] xl:w-[420px]' : 'w-[340px] xl:w-[390px]')}>
          <StoryPhotoPanel disabled={isAiTaskLocked} isCollapsed={isPhotoPanelCollapsed} isImmersiveMode={isImmersiveMode} currentStory={currentStory} editorContent={currentStory.content || ''} pendingImages={pendingImages} pendingCoverId={pendingCoverId} cdnDomain={settingsCdnDomain} isUploading={isUploading} uploadProgress={uploadProgress} isDraggingOver={isDraggingOver} draggedItemId={draggedItemId} draggedItemType={draggedItemType} dragOverItemId={dragOverItemId} openMenuPhotoId={openMenuPhotoId} openMenuPendingId={openMenuPendingId} t={t} notify={notify} onAddPhotos={onOpenPhotoSelector} onInsertExternalPhotoMarkdown={onInsertExternalPhotoMarkdown} onInsertPhotoMarkdown={onInsertPhotoMarkdown} onInsertGalleryMarkdown={onInsertGalleryMarkdown} onOpenPasteUploadSettings={onOpenPasteUploadSettings} onRemovePhoto={onRemovePhoto} onRemovePendingImage={onRemovePendingImage} onSetCover={onSetCover} onSetPendingCover={onSetPendingCover} onSetPhotoDate={onSetPhotoDate} onRetryFailedUploads={onRetryFailedUploads} onPhotoPanelDragOver={onPhotoPanelDragOver} onPhotoPanelDragLeave={onPhotoPanelDragLeave} onPhotoPanelDrop={onPhotoPanelDrop} onItemDragStart={onItemDragStart} onItemDragEnd={onItemDragEnd} onItemDragOver={onItemDragOver} onItemDragLeave={onItemDragLeave} onItemDrop={onItemDrop} onOpenMenuPhoto={onOpenMenuPhoto} onOpenMenuPending={onOpenMenuPending} />
        </fieldset>
      </div>
    </div>
  )
}
