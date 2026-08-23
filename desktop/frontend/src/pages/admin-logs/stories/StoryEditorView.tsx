'use client'

import { useMemo } from 'react'
import {
  Calendar,
  Check,
  PanelRightClose,
  PanelRightOpen,
  FileText,
  Image as ImageIcon,
} from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { PendingImage } from '@/components/admin/StoryPhotoPanel'
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
  isAiTaskLocked: boolean
  onAiTaskLockChange: (locked: boolean) => void

  showPreview: () => void

  onClose: () => void
  onSave: () => void
  onPasteFiles: (files: File[]) => void
  onOpenMaterialLibrary: () => void
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
  isAiTaskLocked,
  onAiTaskLockChange,
  showPreview,
  onClose,
  onSave,
  onPasteFiles,
  onOpenMaterialLibrary,
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
  const editorCharacterCount = countStoryCharacters(currentStory.content)
  const materialCount = currentStory.photos?.length || 0
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
        saveDisabled={saving || isUploading}
        saveLabel={saving ? t('ui.saving') : isUploading ? t('admin.uploading') : t('admin.save')}
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
        metaRight={null}
        bottomBar={
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                {editorCharacterCount} {t('admin.characters')}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                <ImageIcon className="h-3.5 w-3.5" />
                {materialCount} {t('story.materials_suffix')}
              </span>
            </div>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              {draftSaved ? (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <Check className="h-3 w-3" />
                  {t('story.draft_saved')}
                </span>
              ) : null}
            </span>
          </div>
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
                toolbarAfterRedoAction={{
                  title: isPhotoPanelCollapsed ? t('common.expand') : t('common.collapse'),
                  onClick: togglePhotoPanelCollapse,
                  icon: isPhotoPanelCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />,
                  disabled: isAiTaskLocked,
                }}
                placeholder={t('ui.markdown_placeholder')}
                className="overflow-hidden bg-background"
                documentId={currentStory.id}
                documentKind="story"
                onAiTaskLockChange={onAiTaskLockChange}
                aiOptions={{
                  enabled: true,
                  token,
                  scopeId: currentStory.id,
                  title: currentStory.title,
                }}
              />
            </div>
          </div>
        </div>
      </EditorShell>
    </div>
  )
}
