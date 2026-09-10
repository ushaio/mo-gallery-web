'use client'

import type { ReactNode } from 'react'
import { hasEditorContent } from '@mo-gallery/api-client'
import { EditorContentPrompt } from '@mo-gallery/milkdown/editor-content'
import {
  Calendar,
  Check,
} from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { PendingImage } from '@/components/admin/StoryPhotoPanel'
import type { NarrativeMilkdownEditorHandle } from '@/components/NarrativeMilkdownEditor'
import type { PhotoDto, StoryDto } from '@/lib/api/types'
import { cn } from '@/lib/utils'
import { usePreferences } from '@/store/preferences'
import { NarrativeMilkdownEditor } from './constants'
import type { UploadProgressState } from './types'
import { EditorShell } from '../shared/EditorShell'
import { isMilkdownStoryReady } from './utils'

interface StoryEditorViewProps {
  sidePanel?: ReactNode
  token: string | null
  currentStory: StoryDto
  editorSessionId: string
  editorRevision?: number
  pendingImages: PendingImage[]
  pendingCoverId: string | null
  saving: boolean
  draftSaved: boolean
  lastSavedAt: number | null
  editorRef: React.RefObject<NarrativeMilkdownEditorHandle | null>
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
  onConvertToMilkdown: () => void
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
  sidePanel,
  token,
  currentStory,
  editorSessionId,
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
  onConvertToMilkdown,
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
  const materialCount = currentStory.photos?.length || 0
  const language = usePreferences((state) => state.language)
  const editorReady = isMilkdownStoryReady(currentStory)

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
        saveDisabled={saving || isUploading || !editorReady}
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
        t={t}
      >
<div className="relative flex min-h-0 flex-1 gap-0 overflow-hidden">
          <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-border/80 bg-card/50 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.25)]', isImmersiveMode && 'shadow-none')}>
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
              {editorReady ? <NarrativeMilkdownEditor
                contentVersion={`${editorSessionId}-${editorRevision ?? 0}`}
                ref={editorRef}
                value={currentStory.milkContent ?? ''}
                onChange={(milkContent) => setCurrentStory((prev) => (prev?.id === currentStory.id && isMilkdownStoryReady(prev) ? { ...prev, milkContent } : prev))}
                token={token}
                photos={currentStory.photos}
                cdnDomain={settingsCdnDomain}
                onPhotoUploaded={(photo) => setCurrentStory((prev) => prev?.id === currentStory.id && !prev.photos.some((entry) => entry.id === photo.id) ? { ...prev, photos: [...prev.photos, photo] } : prev)}
                onPasteFiles={onPasteFiles}
                toolbarAction={{
                  label: isPhotoPanelCollapsed ? t('common.expand') : t('common.collapse'),
                  onClick: togglePhotoPanelCollapse,
                }}
                className="overflow-hidden bg-background"
                onBusyChange={onAiTaskLockChange}
                onError={(error) => notify(error.message, 'error')}
                statusBar={{
                  materialCount,
                  trailing: draftSaved ? (
                    <span className="flex items-center gap-1 font-mono text-[10px] text-green-600 dark:text-green-400">
                      <Check className="h-3 w-3" />
                      {t('story.draft_saved')}
                    </span>
                  ) : null,
                }}
              /> : <EditorContentPrompt
                language={language}
                targetEditor="Milkdown"
                sourceEditor="TipTap"
                scenario={hasEditorContent(currentStory, 'milkdown') ? 'use-existing' : hasEditorContent(currentStory, 'tiptap') ? 'convert' : 'unavailable'}
                onAction={onConvertToMilkdown}
              />}
            </div>
          </div>
          {sidePanel}
        </div>
      </EditorShell>
    </div>
  )
}
