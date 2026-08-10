'use client'

import { useMemo, useState } from 'react'
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Image as ImageIcon,
} from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import { StoryPhotoPanel, type PendingImage } from '@/components/admin/StoryPhotoPanel'
import type { NarrativeTipTapEditorHandle } from '@/components/NarrativeTipTapEditor'
import type { PhotoDto, StoryDto } from '@/lib/api/types'
import { countStoryCharacters, hydrateStoryContentImages, hydrateStoryContentJsonImages, normalizeStoryContentImages, normalizeStoryContentJsonImages } from '@/lib/story-rich-content'
import { cn } from '@/lib/utils'
import { NarrativeTipTapEditor } from './constants'
import type { UploadProgressState } from './types'
import { EditorShell } from '../shared/EditorShell'

interface StoryEditorViewProps {
  token: string | null
  currentStory: StoryDto
  editorRevision?: number
  pendingImages: PendingImage[]
  pendingCoverId: string | null
  saving: boolean
  draftSaved: boolean
  lastSavedAt: number | null
  editorRef: React.RefObject<NarrativeTipTapEditorHandle | null>
  isImmersiveMode: boolean
  setIsImmersiveMode: Dispatch<SetStateAction<boolean>>
  listPaneCollapsed?: boolean
  onToggleListPane?: () => void
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

  onClose: () => void
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
  editorRevision,
  pendingImages,
  pendingCoverId,
  saving,
  draftSaved,
  lastSavedAt,
  editorRef,
  isImmersiveMode,
  setIsImmersiveMode,
  listPaneCollapsed,
  onToggleListPane,
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
  onClose,
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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <EditorShell
        title={currentStory.title || ''}
        onTitleChange={(value) => setCurrentStory((prev) => (prev ? { ...prev, title: value } : prev))}
        titlePlaceholder={t('story.title_placeholder')}
        onClose={onClose}
        disabled={isAiTaskLocked}
        draftSaved={draftSaved}
        lastSavedAt={lastSavedAt}
        saving={saving}
        isPublished={currentStory.isPublished}
        onTogglePublished={() => setCurrentStory((prev) => (prev ? { ...prev, isPublished: !prev.isPublished } : prev))}
        publishedLabel={t('admin.published')}
        draftLabel={t('admin.draft')}
        onSave={onSave}
        saveDisabled={saving}
        saveLabel={saving ? t('ui.saving') : t('admin.save')}
        savingLabel={t('ui.saving')}
        onPreview={showPreview}
        previewLabel={t('admin.preview')}
        isImmersiveMode={isImmersiveMode}
        onToggleImmersive={() => setIsImmersiveMode((prev) => !prev)}
        immersiveLabel={t('ui.immersive')}
        listPaneCollapsed={listPaneCollapsed}
        onToggleListPane={onToggleListPane}
        metaLeft={
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            {useCustomDate ? (
              <div className="flex items-center gap-1">
                <input
                  type="datetime-local"
                  value={new Date(currentStory.storyDate).toISOString().slice(0, 16)}
                  onChange={(event) => {
                    const value = event.target.value
                    setCurrentStory((prev) =>
                      prev
                        ? { ...prev, storyDate: value ? new Date(value).toISOString() : new Date().toISOString() }
                        : prev,
                    )
                  }}
                  className="rounded border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-wide outline-none transition-all focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setUseCustomDate(false)}
                  className="rounded p-1 text-primary transition-colors hover:bg-primary/10"
                  title={t('common.confirm')}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={isAiTaskLocked}
                onClick={() => setUseCustomDate(true)}
                className="cursor-pointer font-mono text-[10px] uppercase tracking-wide text-muted-foreground underline-offset-4 transition-all hover:text-foreground hover:underline decoration-dashed disabled:cursor-not-allowed disabled:opacity-60"
                title={t('admin.custom_date')}
              >
                {new Date(currentStory.storyDate).toLocaleString()}
              </button>
            )}
          </div>
        }
        metaRight={
          <>
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              {editorCharacterCount} {t('admin.characters')}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              <ImageIcon className="h-3.5 w-3.5" />
              {relatedPhotoCount} {t('story.related_photos')}
            </span>
          </>
        }
        t={t}
      >
        <div className="relative flex min-h-0 flex-1 gap-0 overflow-hidden">
          <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-border/80 bg-card/50 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.25)]', isImmersiveMode && 'border-y-0 border-l-0 shadow-none')}>
            <div className={cn('relative min-h-0 flex-1 overflow-hidden bg-background', isImmersiveMode && 'border-r border-border/60')}>
              <NarrativeTipTapEditor
                contentVersion={`${currentStory.id}-${editorRevision ?? 0}`}
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
      </EditorShell>
    </div>
  )
}
