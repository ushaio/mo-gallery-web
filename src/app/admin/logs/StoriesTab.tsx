/**
 * 故事管理标签页 - 图文故事的创建、编辑、照片关联及发布管理
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createStory,
  deleteStory,
  getAdminStories,
  getPhotos,
  reorderStoryPhotos,
  updateStory,
  type PhotoDto,
  type StoryDto,
} from '@/lib/api'
import { PhotoSelectorModal } from '@/components/admin/PhotoSelectorModal'
import { ImageUploadSettingsModal, type UploadSettings } from '@/components/admin/ImageUploadSettingsModal'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { DraftRestoreDialog } from '@/components/admin/DraftRestoreDialog'
import { StoryPreviewModal } from '@/components/admin/StoryPreviewModal'
import type { PendingImage } from '@/components/admin/StoryPhotoPanel'
import { getStoryMarkdownImageUrls } from '@/lib/story-rich-content'
import { useAdmin } from '../layout'
import {
  STORY_PHOTO_PANEL_COLLAPSED_KEY,
  STORY_UPLOAD_SETTINGS_KEY,
  STORY_PASTE_UPLOAD_SETTINGS_KEY,
} from './stories/constants'
import { StoryEditorView } from './stories/StoryEditorView'
import { StoryListView } from './stories/StoryListView'
import type { StoriesTabProps } from './stories/types'
import { useStoryDraftState } from './stories/useStoryDraftState'
import { useStoryEditorActions } from './stories/useStoryEditorActions'
import { useStoryPhotoDnD } from './stories/useStoryPhotoDnD'
import { applySavedOrder, savePhotoOrder } from './stories/utils'

const DEFAULT_UPLOAD_SETTINGS: UploadSettings = {
  maxSizeMB: 2,
  compressionMode: 'size',
  storageProvider: 'local',
  categories: [],
  albumIds: [],
  stripGps: false,
}

const DEFAULT_PASTE_UPLOAD_SETTINGS: UploadSettings = {
  maxSizeMB: 2,
  compressionMode: 'size',
  storageProvider: 'local',
  categories: ['story-inline'],
  albumIds: [],
  stripGps: false,
}

export function StoriesTab({ token, t, notify, editStoryId, editFromDraft, onDraftConsumed, refreshKey, onEditingChange }: StoriesTabProps) {
  const router = useRouter()
  const { settings, categories, isImmersiveMode, setIsImmersiveMode } = useAdmin()

  const [stories, setStories] = useState<StoryDto[]>([])
  const [loading, setLoading] = useState(true)
  const [currentStory, setCurrentStory] = useState<StoryDto | null>(null)
  const [storyEditMode, setStoryEditMode] = useState<'list' | 'editor'>('list')
  const [saving, setSaving] = useState(false)
  const [allPhotos, setAllPhotos] = useState<PhotoDto[]>([])
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const [showPhotoSelector, setShowPhotoSelector] = useState(false)
  const [pendingCoverId, setPendingCoverId] = useState<string | null>(null)
  const [deleteStoryId, setDeleteStoryId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [useCustomDate, setUseCustomDate] = useState(false)
  const [isPhotoPanelCollapsed, setIsPhotoPanelCollapsed] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState<number | null>(null)

  const initialLoadRef = useRef(false)

  const loadStories = useCallback(async () => {
    if (!token) return

    try {
      setLoading(true)
      const data = await getAdminStories(token)
      setStories(applySavedOrder(data))
    } catch (error) {
      console.error('Failed to load stories:', error)
      notify(t('story.load_failed'), 'error')
    } finally {
      setLoading(false)
    }
  }, [notify, t, token])

  const loadAllPhotos = useCallback(async () => {
    try {
      const data = await getPhotos({ all: true })
      setAllPhotos(data)
    } catch (error) {
      console.error('Failed to load photos:', error)
    }
  }, [])

  const {
    draftSaved,
    lastSavedAt,
    initialStory,
    draftRestoreDialog,
    createStoryWithDraftCheck,
    editStoryWithDraftCheck,
    handleDraftRestore,
    handleDraftDiscard,
    handleDraftCancel,
    clearDraft,
    resetDraftState,
  } = useStoryDraftState({
    allPhotos,
    currentStory,
    pendingImages,
    pendingCoverId,
    stories,
    storyEditMode,
    editFromDraft,
    onDraftConsumed,
    notify,
    t,
    loadAllPhotos,
    setCurrentStory,
    setPendingImages,
    setPendingCoverId,
    setStoryEditMode,
  })

  const doSaveStory = useCallback(async () => {
    if (!token || !currentStory) return

    try {
      setSaving(true)
      const isNew = !stories.find((story) => story.id === currentStory.id)
      const photoIds = currentStory.photos?.map((photo) => photo.id) || []
      const dateChanged = initialStory && currentStory.createdAt !== initialStory.createdAt

      if (isNew) {
        await createStory(token, {
          title: currentStory.title,
          content: currentStory.content,
          isPublished: currentStory.isPublished,
          photoIds,
          coverPhotoId: currentStory.coverPhotoId,
          ...(dateChanged && currentStory.createdAt ? { createdAt: currentStory.createdAt } : {}),
        })
        notify(t('story.created'), 'success')
      } else {
        await updateStory(token, currentStory.id, {
          title: currentStory.title,
          content: currentStory.content,
          isPublished: currentStory.isPublished,
          coverPhotoId: currentStory.coverPhotoId ?? null,
          ...(dateChanged ? { createdAt: currentStory.createdAt } : {}),
        })
        if (photoIds.length > 0) {
          await reorderStoryPhotos(token, currentStory.id, photoIds)
        }
        savePhotoOrder(currentStory.id, photoIds)
        notify(t('story.updated'), 'success')
      }

      await clearDraft(isNew ? undefined : currentStory.id)
      pendingImages.forEach((image) => URL.revokeObjectURL(image.previewUrl))
      setPendingImages([])
      setPendingCoverId(null)
      setUseCustomDate(false)
      setPreviewPhotoIndex(null)
      setShowPreview(false)
      resetDraftState()
      setStoryEditMode('list')
      setCurrentStory(null)
      await loadStories()
      if (window.location.search.includes('editStory=')) {
        router.replace('/admin/logs', { scroll: false })
      }
    } catch (error) {
      console.error('Failed to save story:', error)
      notify(t('story.save_failed'), 'error')
    } finally {
      setSaving(false)
    }
  }, [clearDraft, currentStory, initialStory, loadStories, notify, pendingImages, resetDraftState, router, stories, t, token])

  const {
    editorRef,
    showUploadSettings,
    setShowUploadSettings,
    showPasteUploadSettings,
    setShowPasteUploadSettings,
    isUploading,
    uploadProgress,
    pendingPasteFilesRef,
    uploadSettings,
    pasteUploadSettings,
    handlePhotoPanelDrop,
    handleRemovePendingImage,
    handleConfirmUpload,
    handleRetryFailedUploads,
    handlePasteFiles,
    handleConfirmPasteUpload,
    handleInsertPhotoMarkdown,
    handleInsertGalleryMarkdown,
    handleInsertExternalPhotoMarkdown,
    restorePasteUploadSettings,
    restoreUploadSettings,
  } = useStoryEditorActions({
    token,
    currentStory,
    allPhotos,
    stories,
    pendingImages,
    initialUploadSettings: DEFAULT_UPLOAD_SETTINGS,
    initialPasteUploadSettings: DEFAULT_PASTE_UPLOAD_SETTINGS,
    setCurrentStory,
    setAllPhotos,
    setPendingImages,
    notify,
    t,
    onRequestSave: doSaveStory,
  })

  const {
    draggedItemId,
    draggedItemType,
    dragOverItemId,
    isDraggingOver,
    openMenuPhotoId,
    openMenuPendingId,
    setOpenMenuPhotoId,
    setOpenMenuPendingId,
    handlePhotoPanelDragOver,
    handlePhotoPanelDragLeave,
    handleItemDragStart,
    handleItemDragEnd,
    handleItemDragOver,
    handleItemDragLeave,
    handleItemDrop,
    setIsDraggingOver,
  } = useStoryPhotoDnD({
    currentStory,
    pendingImages,
    setCurrentStory,
    setPendingImages,
  })

  const resetEditorState = useCallback(() => {
    pendingImages.forEach((image) => URL.revokeObjectURL(image.previewUrl))
    setPendingImages([])
    setPendingCoverId(null)
    setUseCustomDate(false)
    setPreviewPhotoIndex(null)
    setShowPreview(false)
    setStoryEditMode('list')
    setCurrentStory(null)
    resetDraftState()
    setIsDraggingOver(false)
    if (window.location.search.includes('editStory=')) {
      router.replace('/admin/logs', { scroll: false })
    }
  }, [pendingImages, resetDraftState, router, setIsDraggingOver])

  const handleSaveStory = useCallback(async () => {
    if (!token || !currentStory) return
    if (!currentStory.title.trim() || !currentStory.content.trim()) {
      notify(t('story.fill_title_content'), 'error')
      return
    }

    const usedImageUrls = getStoryMarkdownImageUrls(currentStory.content)
    const availablePhotoUrls = new Set(
      (currentStory.photos || []).flatMap((photo) => [photo.url, photo.thumbnailUrl].filter((url): url is string => Boolean(url)))
    )
    const invalidImageUrls = Array.from(usedImageUrls).filter((url) => !availablePhotoUrls.has(url))
    if (invalidImageUrls.length > 0) {
      notify(`正文中引用了未关联的图片：${invalidImageUrls.slice(0, 3).join(', ')}`, 'error')
      return
    }

    const pendingToUpload = pendingImages.filter((image) => image.status === 'pending' || image.status === 'failed')
    if (pendingToUpload.length > 0) {
      setShowUploadSettings(true)
      return
    }

    await doSaveStory()
  }, [currentStory, doSaveStory, notify, pendingImages, setShowUploadSettings, t, token])

  const handleUpdatePhotos = useCallback(async (selectedPhotoIds: string[]) => {
    let sourcePhotos = allPhotos

    if (selectedPhotoIds.some((id) => !sourcePhotos.find((photo) => photo.id === id))) {
      try {
        sourcePhotos = await getPhotos({ all: true })
        setAllPhotos(sourcePhotos)
      } catch (error) {
        console.error('Failed to refresh photos for selector:', error)
      }
    }

    const selectedPhotos = selectedPhotoIds
      .map((id) => sourcePhotos.find((photo) => photo.id === id) || currentStory?.photos?.find((photo) => photo.id === id))
      .filter((photo): photo is PhotoDto => Boolean(photo))

    setCurrentStory((prev) => (prev ? { ...prev, photos: selectedPhotos } : prev))
    setShowPhotoSelector(false)
  }, [allPhotos, currentStory?.photos])

  const handleRemovePhoto = useCallback((photoId: string) => {
    setCurrentStory((prev) => (prev ? { ...prev, photos: prev.photos?.filter((photo) => photo.id !== photoId) || [] } : prev))
  }, [])

  const handleSetCover = useCallback((photoId: string) => {
    setCurrentStory((prev) => (prev ? { ...prev, coverPhotoId: photoId } : prev))
    setPendingCoverId(null)
  }, [])

  const handleSetPendingCover = useCallback((id: string) => {
    setPendingCoverId(id)
    setCurrentStory((prev) => (prev ? { ...prev, coverPhotoId: undefined } : prev))
  }, [])

  const handleSetPhotoDate = useCallback((takenAt: string) => {
    setCurrentStory((prev) => (prev ? { ...prev, createdAt: takenAt } : prev))
    setUseCustomDate(true)
  }, [])

  const handleTogglePublish = useCallback(async (story: StoryDto) => {
    if (!token) return

    try {
      await updateStory(token, story.id, { isPublished: !story.isPublished })
      notify(story.isPublished ? t('story.unpublished') : t('story.published'), 'success')
      await loadStories()
    } catch (error) {
      console.error('Failed to toggle publish:', error)
      notify(t('story.operation_failed'), 'error')
    }
  }, [loadStories, notify, t, token])

  const confirmDeleteStory = useCallback(async () => {
    if (!token || !deleteStoryId) return

    try {
      await deleteStory(token, deleteStoryId)
      notify(t('story.deleted'), 'success')
      await loadStories()
    } catch (error) {
      console.error('Failed to delete story:', error)
      notify(t('story.delete_failed'), 'error')
    } finally {
      setDeleteStoryId(null)
    }
  }, [deleteStoryId, loadStories, notify, t, token])

  const handleCreateStory = useCallback(async () => {
    await createStoryWithDraftCheck()
  }, [createStoryWithDraftCheck])

  const handleEditStory = useCallback(async (story: StoryDto) => {
    await editStoryWithDraftCheck(story)
  }, [editStoryWithDraftCheck])

  const currentPhotoIds = currentStory?.photos?.map((photo) => photo.id) || []

  const handlePrevPhoto = useCallback(() => {
    if (previewPhotoIndex === null || !currentStory?.photos) return
    setPreviewPhotoIndex(previewPhotoIndex > 0 ? previewPhotoIndex - 1 : currentStory.photos.length - 1)
  }, [currentStory?.photos, previewPhotoIndex])

  const handleNextPhoto = useCallback(() => {
    if (previewPhotoIndex === null || !currentStory?.photos) return
    setPreviewPhotoIndex(previewPhotoIndex < currentStory.photos.length - 1 ? previewPhotoIndex + 1 : 0)
  }, [currentStory?.photos, previewPhotoIndex])

  useEffect(() => {
    if (!initialLoadRef.current) {
      void loadStories()
      initialLoadRef.current = true
    }
  }, [loadStories])

  useEffect(() => {
    onEditingChange?.(storyEditMode === 'editor')
  }, [onEditingChange, storyEditMode])

  useEffect(() => {
    if (storyEditMode !== 'editor') {
      setIsImmersiveMode(false)
    }
  }, [setIsImmersiveMode, storyEditMode])

  useEffect(() => () => setIsImmersiveMode(false), [setIsImmersiveMode])

  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      void loadStories()
      resetEditorState()
    }
  }, [loadStories, refreshKey, resetEditorState])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsPhotoPanelCollapsed(window.localStorage.getItem(STORY_PHOTO_PANEL_COLLAPSED_KEY) === 'true')

    const raw = window.localStorage.getItem(STORY_PASTE_UPLOAD_SETTINGS_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as UploadSettings
        restorePasteUploadSettings({ ...DEFAULT_PASTE_UPLOAD_SETTINGS, ...parsed })
      } catch (error) {
        console.error('Failed to restore paste upload settings:', error)
      }
    }

    const uploadRaw = window.localStorage.getItem(STORY_UPLOAD_SETTINGS_KEY)
    if (!uploadRaw) return

    try {
      const parsed = JSON.parse(uploadRaw) as UploadSettings
      restoreUploadSettings({ ...DEFAULT_UPLOAD_SETTINGS, ...parsed })
    } catch (error) {
      console.error('Failed to restore upload settings:', error)
    }
  }, [restorePasteUploadSettings, restoreUploadSettings])

  useEffect(() => {
    if (editStoryId && stories.length > 0) {
      const story = stories.find((item) => item.id === editStoryId)
      if (story) {
        void editStoryWithDraftCheck(story)
      }
    }
  }, [editStoryId, editStoryWithDraftCheck, stories])

  const togglePhotoPanelCollapse = useCallback(() => {
    setIsPhotoPanelCollapsed((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORY_PHOTO_PANEL_COLLAPSED_KEY, String(next))
      }
      return next
    })
  }, [])

  return (
    <div className="flex h-full flex-col gap-6 overflow-hidden">
      {storyEditMode === 'list' || !currentStory ? (
        <StoryListView
          stories={stories}
          loading={loading}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          onCreateStory={() => void handleCreateStory()}
          onEditStory={(story) => void handleEditStory(story)}
          onTogglePublish={(story) => void handleTogglePublish(story)}
          onRequestDelete={setDeleteStoryId}
          t={t}
        />
      ) : (
        <StoryEditorView
          token={token}
          currentStory={currentStory}
          pendingImages={pendingImages}
          pendingCoverId={pendingCoverId}
          saving={saving}
          draftSaved={draftSaved}
          lastSavedAt={lastSavedAt}
          isImmersiveMode={isImmersiveMode}
          setIsImmersiveMode={setIsImmersiveMode}
          useCustomDate={useCustomDate}
          setUseCustomDate={setUseCustomDate}
          isPhotoPanelCollapsed={isPhotoPanelCollapsed}
          togglePhotoPanelCollapse={togglePhotoPanelCollapse}
          settingsCdnDomain={settings?.cdn_domain}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          isDraggingOver={isDraggingOver}
          draggedItemId={draggedItemId}
          draggedItemType={draggedItemType}
          dragOverItemId={dragOverItemId}
          openMenuPhotoId={openMenuPhotoId}
          openMenuPendingId={openMenuPendingId}
          showPreview={() => setShowPreview(true)}
          onBack={resetEditorState}
          onSave={() => void handleSaveStory()}
          onPasteFiles={handlePasteFiles}
          onOpenPhotoSelector={() => setShowPhotoSelector(true)}
          onInsertExternalPhotoMarkdown={handleInsertExternalPhotoMarkdown}
          onInsertPhotoMarkdown={handleInsertPhotoMarkdown}
          onInsertGalleryMarkdown={handleInsertGalleryMarkdown}
          onOpenPasteUploadSettings={() => setShowPasteUploadSettings(true)}
          onRemovePhoto={handleRemovePhoto}
          onRemovePendingImage={handleRemovePendingImage}
          onSetCover={handleSetCover}
          onSetPendingCover={handleSetPendingCover}
          onSetPhotoDate={handleSetPhotoDate}
          onRetryFailedUploads={handleRetryFailedUploads}
          onPhotoPanelDragOver={handlePhotoPanelDragOver}
          onPhotoPanelDragLeave={handlePhotoPanelDragLeave}
          onPhotoPanelDrop={async (event) => {
            handlePhotoPanelDragLeave(event)
            await handlePhotoPanelDrop(event)
          }}
          onItemDragStart={handleItemDragStart}
          onItemDragEnd={handleItemDragEnd}
          onItemDragOver={handleItemDragOver}
          onItemDragLeave={handleItemDragLeave}
          onItemDrop={handleItemDrop}
          onOpenMenuPhoto={setOpenMenuPhotoId}
          onOpenMenuPending={setOpenMenuPendingId}
          editorRef={editorRef}
          t={t}
          notify={notify}
          setCurrentStory={setCurrentStory}
        />
      )}

      <PhotoSelectorModal isOpen={showPhotoSelector} onClose={() => setShowPhotoSelector(false)} onConfirm={handleUpdatePhotos} initialSelectedPhotoIds={currentPhotoIds} t={t} />
      <ImageUploadSettingsModal isOpen={showUploadSettings} onClose={() => setShowUploadSettings(false)} onConfirm={handleConfirmUpload} pendingCount={pendingImages.filter((image) => image.status === 'pending' || image.status === 'failed').length} t={t} token={token} initialSettings={uploadSettings} settings={settings} categories={categories} />
      <ImageUploadSettingsModal
        isOpen={showPasteUploadSettings}
        onClose={() => {
          setShowPasteUploadSettings(false)
          pendingPasteFilesRef.current = null
        }}
        onConfirm={handleConfirmPasteUpload}
        pendingCount={pendingPasteFilesRef.current?.length || 0}
        t={t}
        token={token}
        initialSettings={pasteUploadSettings}
        settings={settings}
        categories={categories}
        confirmLabel={t('admin.save_and_process_pasted_images')}
      />
      <SimpleDeleteDialog isOpen={!!deleteStoryId} onConfirm={confirmDeleteStory} onCancel={() => setDeleteStoryId(null)} t={t} />
      <DraftRestoreDialog isOpen={draftRestoreDialog.isOpen} draftTime={draftRestoreDialog.draft?.savedAt || 0} onRestore={handleDraftRestore} onDiscard={handleDraftDiscard} onCancel={handleDraftCancel} t={t} />
      {showPreview && currentStory ? (
        <StoryPreviewModal
          story={currentStory}
          cdnDomain={settings?.cdn_domain}
          previewPhotoIndex={previewPhotoIndex}
          onClose={() => setShowPreview(false)}
          onPhotoClick={setPreviewPhotoIndex}
          onPhotoClose={() => setPreviewPhotoIndex(null)}
          onPrevPhoto={handlePrevPhoto}
          onNextPhoto={handleNextPhoto}
          t={t}
        />
      ) : null}
    </div>
  )
}
