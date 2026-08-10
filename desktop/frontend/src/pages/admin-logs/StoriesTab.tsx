/**
 * 故事管理标签页 - 图文故事的创建、编辑、照片关联及发布管理
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import {
  getPhotos,
  type PhotoDto,
  type StoryDto,
} from '@/lib/api'
import { PhotoSelectorModal } from '@/components/admin/PhotoSelectorModal'
import { ImageUploadSettingsModal, type UploadSettings } from '@/components/admin/ImageUploadSettingsModal'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { DraftRestoreDialog } from '@/components/admin/DraftRestoreDialog'
import { StoryPreviewModal } from '@/components/admin/StoryPreviewModal'
import { StoryCoverCropModal } from '@/components/admin/StoryCoverCropModal'
import type { PendingImage } from '@/components/admin/StoryPhotoPanel'
import { getStoryReferencedPhotoIds } from '@/lib/story-rich-content'
import { getStoryCoverCrop, getStoryCoverPhoto, normalizeStoryCoverCrop, toStoryCoverCropValue } from '@/lib/story-cover'
import { normalizeCompressionMode } from '@/lib/image-compress'
import { cn } from '@/lib/utils'
import { useAdmin } from './layout'
import { useImmersiveMode } from './shared/useImmersiveMode'
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
import { EditorEmptyState } from './shared/EditorEmptyState'
import { CollapsibleListPane } from './shared/CollapsibleListPane'
import { useDirtyLeaveGuard, useSaveShortcut } from './shared/useDirtyLeaveGuard'
import {
  CreateStory,
  DeleteStory,
  GetAllPhotos,
  GetStories,
  ReorderStoryPhotos,
  UpdateStory,
} from '../../../wailsjs/go/main/App'
import type { services } from '../../../wailsjs/go/models'

const DEFAULT_UPLOAD_SETTINGS: UploadSettings = {
  maxSizeMB: 0,
  compressionMode: 'compress',
  showFlag: true,
  storageProvider: 'local',
  categories: [],
  albumIds: [],
  stripGps: false,
}

const DEFAULT_PASTE_UPLOAD_SETTINGS: UploadSettings = {
  maxSizeMB: 0,
  compressionMode: 'compress',
  showFlag: true,
  storageProvider: 'local',
  categories: [],
  albumIds: [],
  stripGps: false,
}

export function StoriesTab({ token, t, notify, editStoryId, editFromDraft, onDraftConsumed, refreshKey, listPaneCollapsed = false, onToggleListPane, subTabNav, active = true, isImmersiveMode, setIsImmersiveMode }: StoriesTabProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { settings, categories } = useAdmin()

  // 沉浸全屏/Esc 放在稳定的页签层持有：切换文章时编辑器不再重挂载
  // （内容经 contentVersion 原地重置），若放在编辑器内会反复退/进全屏，表现为页面刷新。
  useImmersiveMode(isImmersiveMode, () => setIsImmersiveMode(false))

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
  const [showCoverCropEditor, setShowCoverCropEditor] = useState(false)

  const initialLoadRef = useRef(false)
  const savingRef = useRef(false)
  const handledEditStoryIdRef = useRef<string | null>(null)
  const pendingPhotoIdsRef = useRef<string[] | null>(null)

  const loadStories = useCallback(async () => {
    try {
      setLoading(true)
      const data = await GetStories() as unknown as StoryDto[]
      setStories(applySavedOrder(data || []))
    } catch (error) {
      console.error('Failed to load stories:', error)
      notify(t('story.load_failed'), 'error')
    } finally {
      setLoading(false)
    }
  }, [notify, t])

  const loadAllPhotos = useCallback(async () => {
    try {
      const data = await GetAllPhotos() as unknown as PhotoDto[]
      setAllPhotos(data || [])
    } catch (error) {
      console.error('Failed to load photos:', error)
    }
  }, [])

  const {
    draftSaved,
    lastSavedAt,
    initialStory,
    isDirty,
    draftRestoreDialog,
    createStoryWithDraftCheck,
    editStoryWithDraftCheck,
    handleDraftRestore,
    handleDraftDiscard,
    handleDraftCancel,
    clearDraft,
    saveDraft,
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
    if (!currentStory) return
    if (savingRef.current) return

    try {
      savingRef.current = true
      setSaving(true)
      const isNew = !stories.find((story) => story.id === currentStory.id)
      const basePhotoIds = currentStory.photos?.map((photo) => photo.id) || []
      const extraIds = pendingPhotoIdsRef.current || []
      const photoIdSet = new Set(basePhotoIds)
      for (const id of extraIds) photoIdSet.add(id)
      const photoIds = Array.from(photoIdSet)
      pendingPhotoIdsRef.current = null

      const dateChanged = initialStory && currentStory.storyDate !== initialStory.storyDate

      if (isNew) {
        await CreateStory({
          title: currentStory.title,
          content: currentStory.content,
          contentJson: currentStory.contentJson ?? null,
          isPublished: currentStory.isPublished,
          photoIds,
          coverPhotoId: currentStory.coverPhotoId,
          coverCrop: currentStory.coverCrop ?? null,
          ...(dateChanged && currentStory.storyDate ? { storyDate: currentStory.storyDate } : {}),
        } as unknown as services.CreateStoryParams)
        notify(t('story.created'), 'success')
      } else {
        await UpdateStory(currentStory.id, {
          title: currentStory.title,
          content: currentStory.content,
          contentJson: currentStory.contentJson ?? null,
          isPublished: currentStory.isPublished,
          coverPhotoId: currentStory.coverPhotoId ?? null,
          coverCrop: currentStory.coverCrop ?? null,
          ...(dateChanged ? { storyDate: currentStory.storyDate } : {}),
        } as unknown as services.UpdateStoryParams)
        if (photoIds.length > 0) {
          await ReorderStoryPhotos(currentStory.id, photoIds)
        }
        savePhotoOrder(currentStory.id, photoIds)
        notify(t('story.updated'), 'success')
      }

      await clearDraft(currentStory.id)
      pendingImages.forEach((image) => URL.revokeObjectURL(image.previewUrl))
      setPendingImages([])
      setPendingCoverId(null)
      setUseCustomDate(false)
      setPreviewPhotoIndex(null)
      setShowPreview(false)
      resetDraftState()
      setStoryEditMode('list')
      setCurrentStory(null)
      // 保存后回到列表视图，自动展开左栏（编辑态可能已收起）
      if (listPaneCollapsed) onToggleListPane?.()
      await loadStories()
      if (location.search.includes('editStory=')) {
        navigate('/photo-journal', { replace: true })
      }
    } catch (error) {
      console.error('Failed to save story:', error)
      notify(t('story.save_failed'), 'error')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [clearDraft, currentStory, initialStory, listPaneCollapsed, loadStories, location.search, notify, onToggleListPane, pendingImages, resetDraftState, navigate, stories, t])

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
    pendingPhotoIdsRef,
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

  // 文档内容修订号：整篇内容被替换（草稿恢复/跳转）时递增，驱动编辑器重挂载
  const [editorRevision, setEditorRevision] = useState(0)

  const handleDraftRestoreWithRevision = useCallback(() => {
    setEditorRevision((r) => r + 1)
    handleDraftRestore()
  }, [handleDraftRestore])

  const handleDraftDiscardWithRevision = useCallback(() => {
    setEditorRevision((r) => r + 1)
    handleDraftDiscard()
  }, [handleDraftDiscard])

  useEffect(() => {
    if (editFromDraft) setEditorRevision((r) => r + 1)
  }, [editFromDraft])

  const resetEditorState = useCallback(() => {    pendingImages.forEach((image) => URL.revokeObjectURL(image.previewUrl))
    setPendingImages([])
    setPendingCoverId(null)
    setUseCustomDate(false)
    setPreviewPhotoIndex(null)
    setShowPreview(false)
    setStoryEditMode('list')
    setCurrentStory(null)
    resetDraftState()
    setIsDraggingOver(false)
    // 退出编辑时自动展开左栏列表（编辑态可能已收起）
    if (listPaneCollapsed) onToggleListPane?.()
    if (location.search.includes('editStory=')) {
      navigate('/photo-journal', { replace: true })
    }
  }, [listPaneCollapsed, location.search, onToggleListPane, pendingImages, resetDraftState, navigate, setIsDraggingOver])

  const handleSaveStory = useCallback(async () => {
    if (!token || !currentStory) return
    if (savingRef.current) return
    if (!currentStory.title.trim() || !currentStory.content.trim()) {
      notify(t('story.fill_title_content'), 'error')
      return
    }

    const referencedPhotoIds = getStoryReferencedPhotoIds(currentStory.content)
    const availablePhotoIds = new Set((currentStory.photos || []).map((photo) => photo.id))
    const invalidPhotoIds = Array.from(referencedPhotoIds).filter((photoId) => !availablePhotoIds.has(photoId))
    if (invalidPhotoIds.length > 0) {
      notify(`正文中引用了未关联的图库图片：${invalidPhotoIds.slice(0, 3).join(', ')}`, 'error')
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

    setCurrentStory((prev) => {
      if (!prev) return prev

      const coverStillExists = prev.coverPhotoId
        ? selectedPhotos.some((photo) => photo.id === prev.coverPhotoId)
        : true

      return {
        ...prev,
        photos: selectedPhotos,
        ...(coverStillExists
          ? {}
          : {
              coverPhotoId: undefined,
              coverCrop: null,
            }),
      }
    })
    setShowPhotoSelector(false)
  }, [allPhotos, currentStory?.photos])

  const handleRemovePhoto = useCallback((photoId: string) => {
    setCurrentStory((prev) => {
      if (!prev) return prev

      const nextPhotos = prev.photos?.filter((photo) => photo.id !== photoId) || []
      const removedCover = prev.coverPhotoId === photoId

      return {
        ...prev,
        photos: nextPhotos,
        ...(removedCover
          ? {
              coverPhotoId: undefined,
              coverCrop: null,
            }
          : {}),
      }
    })
  }, [])

  const handleSetCover = useCallback((photoId: string) => {
    setCurrentStory((prev) => {
      if (!prev) return prev
      const shouldResetCrop = prev.coverPhotoId !== photoId
      return {
        ...prev,
        coverPhotoId: photoId,
        ...(shouldResetCrop
          ? {
              coverCrop: null,
            }
          : {}),
      }
    })
    setPendingCoverId(null)
    setShowCoverCropEditor(true)
  }, [])

  const handleSetPendingCover = useCallback((id: string) => {
    setPendingCoverId(id)
    setCurrentStory((prev) => (prev ? {
      ...prev,
      coverPhotoId: undefined,
      coverCrop: null,
    } : prev))
  }, [])

  const handleSetPhotoDate = useCallback((takenAt: string) => {
    setCurrentStory((prev) => (prev ? { ...prev, storyDate: takenAt } : prev))
    setUseCustomDate(true)
  }, [])

  const handleApplyCoverCrop = useCallback((crop: { x: number; y: number; width: number; height: number } | null) => {
    setCurrentStory((prev) => {
      if (!prev) return prev
      const normalized = crop ? normalizeStoryCoverCrop(crop) : null
      return {
        ...prev,
        coverCrop: toStoryCoverCropValue(normalized),
      }
    })
    setShowCoverCropEditor(false)
  }, [])

  const handleTogglePublish = useCallback(async (story: StoryDto) => {
    try {
      await UpdateStory(story.id, { isPublished: !story.isPublished } as unknown as services.UpdateStoryParams)
      notify(story.isPublished ? t('story.unpublished') : t('story.published'), 'success')
      await loadStories()
    } catch (error) {
      console.error('Failed to toggle publish:', error)
      notify(t('story.operation_failed'), 'error')
    }
  }, [loadStories, notify, t])

  const confirmDeleteStory = useCallback(async () => {
    if (!deleteStoryId) return

    try {
      await DeleteStory(deleteStoryId)
      notify(t('story.deleted'), 'success')
      await loadStories()
    } catch (error) {
      console.error('Failed to delete story:', error)
      notify(t('story.delete_failed'), 'error')
    } finally {
      setDeleteStoryId(null)
    }
  }, [deleteStoryId, loadStories, notify, t])

  const handleCreateStory = useCallback(async () => {
    // 切换选中前先落盘当前草稿
    if (isDirty) void saveDraft()
    await createStoryWithDraftCheck()
  }, [createStoryWithDraftCheck, isDirty, saveDraft])

  const handleEditStory = useCallback(async (story: StoryDto) => {
    // 切换选中前先落盘当前草稿
    if (isDirty) void saveDraft()
    await editStoryWithDraftCheck(story)
  }, [editStoryWithDraftCheck, isDirty, saveDraft])

  const currentPhotoIds = currentStory?.photos?.map((photo) => photo.id) || []
  const currentCoverPhoto = currentStory ? getStoryCoverPhoto(currentStory) : null
  const currentCoverCrop = currentStory ? getStoryCoverCrop(currentStory) : null

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
    if (storyEditMode !== 'editor' || !active) {
      setIsImmersiveMode(false)
    }
  }, [active, setIsImmersiveMode, storyEditMode])

  useEffect(() => () => setIsImmersiveMode(false), [setIsImmersiveMode])

  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      void loadStories()
    }
  }, [loadStories, refreshKey])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsPhotoPanelCollapsed(window.localStorage.getItem(STORY_PHOTO_PANEL_COLLAPSED_KEY) === 'true')

    const raw = window.localStorage.getItem(STORY_PASTE_UPLOAD_SETTINGS_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as UploadSettings
        if (parsed.compressionMode) parsed.compressionMode = normalizeCompressionMode(parsed.compressionMode)
        restorePasteUploadSettings({ ...DEFAULT_PASTE_UPLOAD_SETTINGS, ...parsed })
      } catch (error) {
        console.error('Failed to restore paste upload settings:', error)
      }
    }

    const uploadRaw = window.localStorage.getItem(STORY_UPLOAD_SETTINGS_KEY)
    if (!uploadRaw) return

    try {
      const parsed = JSON.parse(uploadRaw) as UploadSettings
      if (parsed.compressionMode) parsed.compressionMode = normalizeCompressionMode(parsed.compressionMode)
      restoreUploadSettings({ ...DEFAULT_UPLOAD_SETTINGS, ...parsed })
    } catch (error) {
      console.error('Failed to restore upload settings:', error)
    }
  }, [restorePasteUploadSettings, restoreUploadSettings])

  useEffect(() => {
    if (!editStoryId) {
      handledEditStoryIdRef.current = null
      return
    }

    if (handledEditStoryIdRef.current === editStoryId) {
      return
    }

    const story = stories.find((item) => item.id === editStoryId)
    if (!story) {
      return
    }

    if (storyEditMode === 'editor' && currentStory?.id === editStoryId) {
      handledEditStoryIdRef.current = editStoryId
      return
    }

    handledEditStoryIdRef.current = editStoryId
    void editStoryWithDraftCheck(story)
  }, [currentStory?.id, editStoryId, editStoryWithDraftCheck, stories, storyEditMode])

  const togglePhotoPanelCollapse = useCallback(() => {
    setIsPhotoPanelCollapsed((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORY_PHOTO_PANEL_COLLAPSED_KEY, String(next))
      }
      return next
    })
  }, [])

  // 离开保护 + Ctrl+S（仅编辑态生效）
  useDirtyLeaveGuard(isDirty && storyEditMode === 'editor', storyEditMode === 'editor')
  useSaveShortcut(() => void handleSaveStory(), storyEditMode === 'editor')

  return (
    <div className={cn('flex h-full min-h-0 overflow-hidden', isImmersiveMode ? 'fixed inset-0 z-[45] h-dvh w-screen gap-3 bg-background p-3 sm:p-4' : 'gap-5')}>
      {/* 左栏：叙事列表（可折叠） */}
      <CollapsibleListPane
        collapsed={listPaneCollapsed}
        onToggle={() => onToggleListPane?.()}
        t={t}
        header={subTabNav}
        showCollapsedRail={storyEditMode !== 'editor'}
      >
        <StoryListView
          stories={stories}
          loading={loading}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          selectedStoryId={currentStory?.id}
          onCreateStory={() => void handleCreateStory()}
          onEditStory={(story) => void handleEditStory(story)}
          onTogglePublish={(story) => void handleTogglePublish(story)}
          onRequestDelete={setDeleteStoryId}
          t={t}
          cdnDomain={settings?.cdn_domain}
          onRefresh={() => void loadStories()}
          compact
        />
      </CollapsibleListPane>

      {/* 右栏：编辑器 / 空状态 */}
      <main className="min-w-0 flex-1 overflow-hidden">
        {storyEditMode === 'editor' && currentStory ? (
          <StoryEditorView
          token={token}
          currentStory={currentStory}
          editorRevision={editorRevision}
          pendingImages={pendingImages}
          pendingCoverId={pendingCoverId}
          saving={saving}
          draftSaved={draftSaved}
          lastSavedAt={lastSavedAt}
          isImmersiveMode={isImmersiveMode}
          setIsImmersiveMode={setIsImmersiveMode}
          listPaneCollapsed={listPaneCollapsed}
          onToggleListPane={() => onToggleListPane?.()}
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
          onClose={resetEditorState}
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
      ) : (
        <EditorEmptyState
          icon={BookOpen}
          title={t('ui.no_story')}
          hint={t('admin.select_story_hint')}
          actionLabel={t('ui.create_story')}
          onAction={() => void handleCreateStory()}
        />
      )}
      </main>

      <PhotoSelectorModal isOpen={showPhotoSelector} onClose={() => setShowPhotoSelector(false)} onConfirm={handleUpdatePhotos} initialSelectedPhotoIds={currentPhotoIds} t={t} />
      <ImageUploadSettingsModal isOpen={showUploadSettings} onClose={() => setShowUploadSettings(false)} onConfirm={handleConfirmUpload} pendingCount={pendingImages.filter((image) => image.status === 'pending' || image.status === 'failed').length} t={t} token={token} initialSettings={uploadSettings} settings={settings} categories={categories} currentStoryId={currentStory?.id} />
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
        currentStoryId={currentStory?.id}
      />
      <SimpleDeleteDialog isOpen={!!deleteStoryId} onConfirm={confirmDeleteStory} onCancel={() => setDeleteStoryId(null)} t={t} />
      <DraftRestoreDialog isOpen={draftRestoreDialog.isOpen} draftTime={draftRestoreDialog.draft?.savedAt || 0} onRestore={handleDraftRestoreWithRevision} onDiscard={handleDraftDiscardWithRevision} onCancel={handleDraftCancel} t={t} />
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
      {showCoverCropEditor && currentCoverPhoto ? (
        <StoryCoverCropModal
          photo={currentCoverPhoto}
          cdnDomain={settings?.cdn_domain}
          initialCrop={currentCoverCrop}
          onClose={() => setShowCoverCropEditor(false)}
          onApply={handleApplyCoverCrop}
          t={t}
        />
      ) : null}
    </div>
  )
}
