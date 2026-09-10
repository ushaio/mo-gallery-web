/**
 * 故事管理标签页 - 图文故事的创建、编辑、照片关联及发布管理
 */
'use client'

import { getEditorContent, hasEditorContent } from '@mo-gallery/api-client'
import { convertToMilkdown } from '@mo-gallery/milkdown/migration'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import {
  type PhotoDto,
  type StoryDto,
} from '@/lib/api'
import { ImageUploadSettingsModal, type UploadSettings } from '@/components/admin/ImageUploadSettingsModal'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { DraftRestoreDialog } from '@/components/admin/DraftRestoreDialog'
import { StoryPreviewModal } from '@/components/admin/StoryPreviewModal'
import { StoryCoverCropModal } from '@/components/admin/StoryCoverCropModal'
import { PhotoLibraryDialog } from '@/components/zine/PhotoLibraryDialog'
import { StoryPhotoPanel, type PendingImage } from '@/components/admin/StoryPhotoPanel'
import { getMilkdownPhotoIds, hasPendingMilkdownUploads } from '@mo-gallery/milkdown/media'
import { getStoryCoverCrop, getStoryCoverPhoto, normalizeStoryCoverCrop, toStoryCoverCropValue } from '@/lib/story-cover'
import { normalizeCompressionFormat, normalizeCompressionMode } from '@/lib/image-compress'
import { cn } from '@/lib/utils'
import { usePreferences } from '@/store/preferences'
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
import { applySavedOrder, isMilkdownStoryReady, savePhotoOrder } from './stories/utils'
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
import type { Photo } from '@/types'

const DEFAULT_UPLOAD_SETTINGS: UploadSettings = {
  maxSizeMB: 0,
  compressionMode: 'compress',
  compressionFormat: 'avif',
  showFlag: true,
  storageProvider: 'local',
  categories: [],
  albumIds: [],
  stripGps: false,
}

const DEFAULT_PASTE_UPLOAD_SETTINGS: UploadSettings = {
  maxSizeMB: 0,
  compressionMode: 'compress',
  compressionFormat: 'avif',
  showFlag: true,
  storageProvider: 'local',
  categories: [],
  albumIds: [],
  stripGps: false,
}

export function StoriesTab({ token, t, notify, editStoryId, editSource = 'prompt', editFromDraft, onDraftConsumed, refreshKey, createRequestKey = 0, newStoryPhotoIds, listPaneCollapsed = false, onToggleListPane, subTabNav, active = true, isImmersiveMode, setIsImmersiveMode }: StoriesTabProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { settings, categories } = useAdmin()
  const language = usePreferences((state) => state.language)

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
  const [showMaterialLibrary, setShowMaterialLibrary] = useState(false)
  const [pendingCoverId, setPendingCoverId] = useState<string | null>(null)
  const [deleteStoryId, setDeleteStoryId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [useCustomDate, setUseCustomDate] = useState(false)
  const [isPhotoPanelCollapsed, setIsPhotoPanelCollapsed] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState<number | null>(null)
  const [showCoverCropEditor, setShowCoverCropEditor] = useState(false)
  const [isAiTaskLocked, setIsAiTaskLocked] = useState(false)

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
    editorSessionId,
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
    markDraftSynced,
    rekeySavedDraft,
    acceptSavedStory,
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
    if (!currentStory || !isMilkdownStoryReady(currentStory)) return
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

      const dateChanged = initialStory && currentStory.storyDate !== initialStory.storyDate
      let savedStory: StoryDto

      if (isNew) {
        savedStory = await CreateStory({
          title: currentStory.title,
          editorType: 'milkdown',
          milkContent: currentStory.milkContent ?? '',
          isPublished: currentStory.isPublished,
          photoIds,
          coverPhotoId: currentStory.coverPhotoId,
          coverCrop: currentStory.coverCrop ?? null,
          storyDate: currentStory.storyDate,
        } as unknown as services.CreateStoryParams) as unknown as StoryDto
      } else {
        savedStory = await UpdateStory(currentStory.id, {
          title: currentStory.title,
          editorType: 'milkdown',
          milkContent: currentStory.milkContent ?? '',
          isPublished: currentStory.isPublished,
          coverPhotoId: currentStory.coverPhotoId ?? null,
          coverCrop: currentStory.coverCrop ?? null,
          ...(dateChanged ? { storyDate: currentStory.storyDate } : {}),
        } as unknown as services.UpdateStoryParams) as unknown as StoryDto
        const photoIdsChanged = JSON.stringify(photoIds) !== JSON.stringify(initialStory?.photoIds ?? [])
        if (photoIds.length > 0 && photoIdsChanged) {
          savedStory = await ReorderStoryPhotos(currentStory.id, photoIds) as unknown as StoryDto
        }
      }

      const photoOrder = new Map(photoIds.map((id, index) => [id, index]))
      savedStory = {
        ...savedStory,
        photos: [...savedStory.photos].sort((left, right) =>
          (photoOrder.get(left.id) ?? photoIds.length) - (photoOrder.get(right.id) ?? photoIds.length)),
      }
      savePhotoOrder(savedStory.id, photoIds)
      setStories((previous) => previous.some((story) => story.id === savedStory.id)
        ? previous.map((story) => story.id === savedStory.id ? savedStory : story)
        : [savedStory, ...previous])

      // The baseline is what this request saved. Keep inactive local sources
      // and any newer edits in the open form instead of replacing the editor.
      const savedSnapshot: StoryDto = {
        ...savedStory,
        contentEditorTypes: Array.from(new Set([...savedStory.contentEditorTypes, ...currentStory.contentEditorTypes])),
        tiptapContent: currentStory.tiptapContent,
        tiptapContentJson: currentStory.tiptapContentJson,
      }
      if (acceptSavedStory(savedSnapshot, editorSessionId)) {
        setCurrentStory((latest) => latest?.id === currentStory.id ? {
          ...latest,
          id: savedStory.id,
          createdAt: savedStory.createdAt,
          updatedAt: savedStory.updatedAt,
          storyDate: latest.storyDate === currentStory.storyDate ? savedStory.storyDate : latest.storyDate,
          contentEditorTypes: Array.from(new Set([...savedStory.contentEditorTypes, ...latest.contentEditorTypes])),
        } : latest)
        const submittedPendingIds = new Set(pendingImages.map((image) => image.id))
        setPendingImages((latest) => {
          latest.filter((image) => submittedPendingIds.has(image.id)).forEach((image) => URL.revokeObjectURL(image.previewUrl))
          return latest.filter((image) => !submittedPendingIds.has(image.id))
        })
        setPendingCoverId((latest) => latest === pendingCoverId ? null : latest)
        if (pendingPhotoIdsRef.current === extraIds) pendingPhotoIdsRef.current = null
      }
      notify(t(isNew ? 'story.created' : 'story.updated'), 'success')
      try {
        if (isNew) await rekeySavedDraft(currentStory.id, savedStory.id)
        await markDraftSynced(savedSnapshot, savedStory.id)
      } catch (error) {
        console.error('Story saved but local draft synchronization failed:', error)
        notify(language === 'zh' ? '文章已保存，但本地草稿同步失败。' : 'Story saved, but the local draft could not be updated.', 'error')
      }
    } catch (error) {
      console.error('Failed to save story:', error)
      notify(t('story.save_failed'), 'error')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [acceptSavedStory, currentStory, editorSessionId, initialStory, language, markDraftSynced, notify, pendingCoverId, pendingImages, rekeySavedDraft, stories, t])

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
    restorePasteUploadSettings,
    restoreUploadSettings,
  } = useStoryEditorActions({
    token,
    currentStory,
    allPhotos,
    stories,
    pendingImages,
    cdnDomain: settings?.cdn_domain,
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

  const handleConvertToMilkdown = useCallback(() => {
    if (!currentStory) return
    const hasMilkdownContent = hasEditorContent(currentStory, 'milkdown')
    if (!hasMilkdownContent && !hasEditorContent(currentStory, 'tiptap')) return

    try {
      const milkContent = hasMilkdownContent
        ? currentStory.milkContent ?? ''
        : convertToMilkdown(currentStory)
      setCurrentStory((previous) => previous?.id === currentStory.id ? {
        ...previous,
        editorType: 'milkdown',
        contentEditorTypes: previous.contentEditorTypes.includes('milkdown')
          ? previous.contentEditorTypes
          : [...previous.contentEditorTypes, 'milkdown'],
        milkContent,
      } : previous)
      setEditorRevision((revision) => revision + 1)
    } catch (error) {
      notify(error instanceof Error ? error.message : t('story.operation_failed'), 'error')
    }
  }, [currentStory, notify, t])

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
    if (!token || !currentStory || !isMilkdownStoryReady(currentStory)) return
    if (savingRef.current) return
    if (!currentStory.title.trim()) {
      notify(t('blog.enter_title'), 'error')
      return
    }

    if (hasPendingMilkdownUploads(currentStory.milkContent ?? '')) {
      notify('请等待图片上传完成，或移除未完成的上传卡片。', 'error')
      return
    }
    const referencedPhotoIds = getMilkdownPhotoIds(currentStory.milkContent ?? '')
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

  const handleImportMaterials = useCallback((photos: Photo[]) => {
    const importedPhotos: PhotoDto[] = photos.map((photo) => {
      const { camera: _camera, lens: _lens, ...photoFields } = photo
      return {
        ...photoFields,
        originFlag: photo.originFlag === 'web' || photo.originFlag === 'mobile' || photo.originFlag === 'desktop'
          ? photo.originFlag
          : undefined,
      }
    })
    setCurrentStory((prev) => {
      if (!prev) return prev
      const existingIds = new Set((prev.photos || []).map((photo) => photo.id))
      const newPhotos = importedPhotos.filter((photo) => !existingIds.has(photo.id))
      return {
        ...prev,
        photos: [...(prev.photos || []), ...newPhotos],
      }
    })
    setAllPhotos((prev) => {
      const existingIds = new Set(prev.map((photo) => photo.id))
      return [...prev, ...importedPhotos.filter((photo) => !existingIds.has(photo.id))]
    })
    setShowMaterialLibrary(false)
  }, [])

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

  const handledCreateRequestRef = useRef(0)
  useEffect(() => {
    if (createRequestKey <= 0 || handledCreateRequestRef.current === createRequestKey) return
    handledCreateRequestRef.current = createRequestKey
    void handleCreateStory()
  }, [createRequestKey, handleCreateStory])

  // 首页照片流「写叙事」交接：新建一篇叙事并预置选中的照片
  const handledNewStoryPhotosRef = useRef('')
  const photoHandoffLoadRef = useRef(false)
  useEffect(() => {
    const ids = (newStoryPhotoIds ?? []).filter(Boolean)
    const handoffKey = ids.join(',')
    if (ids.length === 0 || handledNewStoryPhotosRef.current === handoffKey) return
    if (allPhotos.length === 0) {
      // 照片库还没加载，先拉取一次，等数据到位后本 effect 会重跑
      if (!photoHandoffLoadRef.current) {
        photoHandoffLoadRef.current = true
        void loadAllPhotos()
      }
      return
    }
    handledNewStoryPhotosRef.current = handoffKey
    pendingPhotoIdsRef.current = ids
    void (async () => {
      if (isDirty) void saveDraft()
      await createStoryWithDraftCheck()
      const photoMap = new Map(allPhotos.map(photo => [photo.id, photo]))
      const picked = ids
        .map(id => photoMap.get(id))
        .filter((photo): photo is PhotoDto => Boolean(photo))
      setCurrentStory(current => {
        if (!current) return current
        const existing = new Set((current.photos ?? []).map(photo => photo.id))
        return { ...current, photos: [...(current.photos ?? []), ...picked.filter(photo => !existing.has(photo.id))] }
      })
    })()
  }, [newStoryPhotoIds, allPhotos, createStoryWithDraftCheck, isDirty, saveDraft, setCurrentStory, loadAllPhotos])

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
        parsed.compressionFormat = normalizeCompressionFormat(parsed.compressionFormat)
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
      parsed.compressionFormat = normalizeCompressionFormat(parsed.compressionFormat)
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

    const editRequestKey = `${editStoryId}:${editSource}`
    if (handledEditStoryIdRef.current === editRequestKey) {
      return
    }

    const story = stories.find((item) => item.id === editStoryId)
    if (!story) {
      return
    }

    if (editSource === 'prompt' && storyEditMode === 'editor' && currentStory?.id === editStoryId) {
      handledEditStoryIdRef.current = editRequestKey
      return
    }

    handledEditStoryIdRef.current = editRequestKey
    void editStoryWithDraftCheck(story, editSource)
  }, [currentStory?.id, editSource, editStoryId, editStoryWithDraftCheck, stories, storyEditMode])

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
    <div className={cn('flex h-full min-h-0 overflow-hidden', isImmersiveMode ? 'fixed inset-0 z-[45] h-dvh w-screen gap-3 bg-background p-3 sm:p-4' : storyEditMode === 'editor' ? 'gap-0' : 'gap-4')}>
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

      {/* 右栏：编辑器 + 素材库（无间隙） */}
      <div className="flex min-w-0 flex-1 overflow-hidden">
        <main className={cn('min-w-0 flex-1 overflow-hidden', storyEditMode === 'editor' && '-ml-px')}>
          {storyEditMode === 'editor' && currentStory ? (
          <StoryEditorView
           sidePanel={storyEditMode === 'editor' && currentStory && !isPhotoPanelCollapsed ? (
             <aside className="-ml-px w-[340px] shrink-0 overflow-hidden xl:w-[390px]">
          <StoryPhotoPanel
            disabled={isAiTaskLocked || !isMilkdownStoryReady(currentStory)}
            isCollapsed={isPhotoPanelCollapsed}
            isImmersiveMode={isImmersiveMode}
            currentStory={currentStory}
            editorContent={getEditorContent(currentStory)}
            pendingImages={pendingImages}
            pendingCoverId={pendingCoverId}
            cdnDomain={settings?.cdn_domain}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            isDraggingOver={isDraggingOver}
            draggedItemId={draggedItemId}
            draggedItemType={draggedItemType}
            dragOverItemId={dragOverItemId}
            openMenuPhotoId={openMenuPhotoId}
            openMenuPendingId={openMenuPendingId}
            t={t}
            notify={notify}
            onAddPhotos={() => setShowMaterialLibrary(true)}
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
          />
             </aside>
           ) : null}

          token={token}
          currentStory={currentStory}
          editorSessionId={editorSessionId}
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
          isAiTaskLocked={isAiTaskLocked}
          onAiTaskLockChange={setIsAiTaskLocked}
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
          onConvertToMilkdown={handleConvertToMilkdown}
          onPasteFiles={handlePasteFiles}
          onOpenMaterialLibrary={() => setShowMaterialLibrary(true)}
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
      </div>


      <PhotoLibraryDialog
        source={showMaterialLibrary ? 'cloud' : null}
        existingPhotoIds={currentPhotoIds}
        onClose={() => setShowMaterialLibrary(false)}
        onImportPhotos={handleImportMaterials}
      />
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
