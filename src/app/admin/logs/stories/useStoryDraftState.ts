'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { PhotoDto, StoryDto } from '@/lib/api/types'
import { STORY_EDITOR_DRAFT_PREFIX, type StoryEditorDraftData } from '@/lib/client-db'
import { clearStoryEditorDraftFromDB, getStoryEditorDraftFromDB, saveStoryEditorDraftToDB } from '@/lib/client-db'
import type { PendingImage } from '@/components/admin/StoryPhotoPanel'
import { AUTO_SAVE_DELAY } from './constants'
import type { DraftRestoreDialogState, StorySnapshot } from './types'
import { createEmptyStory } from './utils'

interface UseStoryDraftStateParams {
  allPhotos: PhotoDto[]
  currentStory: StoryDto | null
  pendingImages: PendingImage[]
  pendingCoverId: string | null
  stories: StoryDto[]
  storyEditMode: 'list' | 'editor'
  saving: boolean
  editFromDraft?: StoryEditorDraftData | null
  onDraftConsumed?: () => void
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  t: (key: string) => string
  loadAllPhotos: () => Promise<void>
  setCurrentStory: Dispatch<SetStateAction<StoryDto | null>>
  setPendingImages: Dispatch<SetStateAction<PendingImage[]>>
  setPendingCoverId: Dispatch<SetStateAction<string | null>>
  setStoryEditMode: Dispatch<SetStateAction<'list' | 'editor'>>
}

interface UseStoryDraftStateResult {
  editorSessionId: string
  draftSaved: boolean
  lastSavedAt: number | null
  initialStory: StorySnapshot | null
  draftRestoreDialog: DraftRestoreDialogState
  createStoryWithDraftCheck: () => Promise<void>
  editStoryWithDraftCheck: (story: StoryDto) => Promise<void>
  handleDraftRestore: () => void
  handleDraftDiscard: () => void
  handleDraftCancel: () => void
  clearDraft: (storyId?: string) => Promise<void>
  resetDraftState: () => void
  markSaved: (story: StoryDto) => void
}

function restorePendingImages(files?: StoryEditorDraftData['files']): PendingImage[] {
  if (!files?.length) return []
  return files.map((entry) => ({ id: entry.id, file: entry.file, previewUrl: URL.createObjectURL(entry.file), status: 'pending' as const, progress: 0, takenAt: entry.takenAt }))
}

function createSnapshot(story: StoryDto): StorySnapshot {
  return {
    ...story,
    photoIds: story.photos?.map((photo) => photo.id) || [],
  }
}

function getNewStoryIdFromDraft(draft: StoryEditorDraftData): string {
  if (draft.storyId) return draft.storyId
  if (draft.id.startsWith(STORY_EDITOR_DRAFT_PREFIX)) {
    const draftId = draft.id.slice(STORY_EDITOR_DRAFT_PREFIX.length)
    if (draftId && draftId !== 'new') return draftId
  }
  return crypto.randomUUID()
}

export function useStoryDraftState({
  allPhotos,
  currentStory,
  pendingImages,
  pendingCoverId,
  stories,
  storyEditMode,
  saving,
  editFromDraft,
  onDraftConsumed,
  notify,
  t,
  loadAllPhotos,
  setCurrentStory,
  setPendingImages,
  setPendingCoverId,
  setStoryEditMode,
}: UseStoryDraftStateParams): UseStoryDraftStateResult {
  const [editorSessionId, setEditorSessionId] = useState('')
  const [draftSaved, setDraftSaved] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [initialStory, setInitialStory] = useState<StorySnapshot | null>(null)
  const [draftRestoreDialog, setDraftRestoreDialog] = useState<DraftRestoreDialogState>({ isOpen: false, draft: null, story: null })

  const isDirty = !!(
    storyEditMode === 'editor' &&
    currentStory &&
    initialStory &&
    (
      currentStory.title !== initialStory.title ||
      currentStory.editorType !== initialStory.editorType ||
      currentStory.tiptapContent !== initialStory.tiptapContent ||
      currentStory.milkContent !== initialStory.milkContent ||
      JSON.stringify(currentStory.tiptapContentJson ?? null) !== JSON.stringify(initialStory.tiptapContentJson ?? null) ||
      JSON.stringify(currentStory.contentEditorTypes) !== JSON.stringify(initialStory.contentEditorTypes) ||
      currentStory.isPublished !== initialStory.isPublished ||
      currentStory.storyDate !== initialStory.storyDate ||
      currentStory.coverPhotoId !== initialStory.coverPhotoId ||
      JSON.stringify(currentStory.coverCrop ?? null) !== JSON.stringify(initialStory.coverCrop ?? null) ||
      JSON.stringify(currentStory.photos?.map((photo) => photo.id) || []) !== JSON.stringify(initialStory.photoIds) ||
      pendingImages.length > 0 ||
      pendingCoverId !== null
    )
  )

  const resetDraftState = useCallback(() => {
    setInitialStory(null)
    setLastSavedAt(null)
    setDraftRestoreDialog({ isOpen: false, draft: null, story: null })
  }, [])

  const markSaved = useCallback((story: StoryDto) => {
    setInitialStory(createSnapshot(story))
    setLastSavedAt(Date.now())
    setDraftSaved(true)
    window.setTimeout(() => setDraftSaved(false), 2000)
  }, [])

  const saveDraft = useCallback(async () => {
    if (!currentStory) return

    const existingStory = stories.find((story) => story.id === currentStory.id)

    try {
      await saveStoryEditorDraftToDB({
        storyId: existingStory ? currentStory.id : undefined,
        draftId: existingStory ? undefined : currentStory.id,
        title: currentStory.title,
        editorType: currentStory.editorType,
        contentEditorTypes: currentStory.contentEditorTypes,
        tiptapContent: currentStory.tiptapContent,
        tiptapContentJson: currentStory.tiptapContentJson ?? null,
        milkContent: currentStory.milkContent,
        isPublished: currentStory.isPublished,
        createdAt: currentStory.createdAt,
        storyDate: currentStory.storyDate,
        coverPhotoId: currentStory.coverPhotoId,
        coverCrop: currentStory.coverCrop ?? null,
        pendingCoverId,
        photoIds: currentStory.photos?.map((photo) => photo.id) || [],
        files: pendingImages.map((image) => ({ id: image.id, file: image.file, takenAt: image.takenAt })),
      })
      setLastSavedAt(Date.now())
      setDraftSaved(true)
      window.setTimeout(() => setDraftSaved(false), 2000)
    } catch (error) {
      console.error('Failed to save draft:', error)
    }
  }, [currentStory, pendingCoverId, pendingImages, stories])

  const clearDraft = useCallback(async (storyId?: string) => {
    try {
      await clearStoryEditorDraftFromDB(storyId)
      setLastSavedAt(null)
    } catch (error) {
      console.error('Failed to clear draft:', error)
    }
  }, [])

  const applyDraft = useCallback((draft: StoryEditorDraftData, baseStory: StoryDto) => {
    const restoredPhotos = draft.photoIds
      .map((id) => allPhotos.find((photo) => photo.id === id) || baseStory.photos?.find((photo) => photo.id === id))
      .filter((photo): photo is PhotoDto => Boolean(photo))

    const restoredStory: StoryDto = {
      ...baseStory,
      title: draft.title,
      editorType: draft.editorType,
      contentEditorTypes: draft.contentEditorTypes,
      tiptapContent: draft.tiptapContent,
      tiptapContentJson: draft.tiptapContentJson ?? null,
      milkContent: draft.milkContent,
      isPublished: draft.isPublished,
      createdAt: draft.createdAt || baseStory.createdAt,
      storyDate: draft.storyDate ?? draft.createdAt ?? baseStory.storyDate,
      coverPhotoId: draft.coverPhotoId ?? undefined,
      coverCrop: draft.coverCrop ?? null,
      photos: restoredPhotos,
    }
    setCurrentStory(restoredStory)
    setPendingImages(restorePendingImages(draft.files))
    setPendingCoverId(draft.pendingCoverId || null)
    setLastSavedAt(draft.savedAt)
    setInitialStory(createSnapshot(restoredStory))
    notify(t('admin.restored_from_draft'), 'info')
  }, [allPhotos, notify, setCurrentStory, setPendingCoverId, setPendingImages, t])

  const createStoryWithDraftCheck = useCallback(async () => {
    const newStory = createEmptyStory()
    setEditorSessionId(newStory.id)
    setInitialStory(createSnapshot(newStory))
    setPendingImages([])
    setPendingCoverId(null)
    setCurrentStory(newStory)
    setStoryEditMode('editor')
  }, [setCurrentStory, setPendingCoverId, setPendingImages, setStoryEditMode])

  const editStoryWithDraftCheck = useCallback(async (story: StoryDto) => {
    setEditorSessionId(story.id)
    setInitialStory(createSnapshot(story))

    try {
      const draft = await getStoryEditorDraftFromDB(story.id)
      if (draft && draft.savedAt && draft.savedAt > new Date(story.updatedAt).getTime()) {
        setCurrentStory({ ...story })
        setDraftRestoreDialog({ isOpen: true, draft, story })
        return
      }
    } catch (error) {
      console.error('Failed to check draft:', error)
    }

    setPendingImages([])
    setPendingCoverId(null)
    setCurrentStory({ ...story })
    setStoryEditMode('editor')
  }, [setCurrentStory, setPendingCoverId, setPendingImages, setStoryEditMode])

  const handleDraftRestore = useCallback(() => {
    if (draftRestoreDialog.draft && draftRestoreDialog.story) {
      applyDraft(draftRestoreDialog.draft, draftRestoreDialog.story)
    }
    setDraftRestoreDialog({ isOpen: false, draft: null, story: null })
    setStoryEditMode('editor')
  }, [applyDraft, draftRestoreDialog, setStoryEditMode])

  const handleDraftDiscard = useCallback(() => {
    if (draftRestoreDialog.story) {
      setCurrentStory({ ...draftRestoreDialog.story })
      setPendingImages([])
      setPendingCoverId(null)
    }
    setDraftRestoreDialog({ isOpen: false, draft: null, story: null })
    setStoryEditMode('editor')
  }, [draftRestoreDialog.story, setCurrentStory, setPendingCoverId, setPendingImages, setStoryEditMode])

  const handleDraftCancel = useCallback(() => {
    setDraftRestoreDialog({ isOpen: false, draft: null, story: null })
    setCurrentStory(null)
  }, [setCurrentStory])

  useEffect(() => {
    if (editFromDraft && allPhotos.length === 0) {
      void loadAllPhotos()
    }
  }, [allPhotos.length, editFromDraft, loadAllPhotos])

  useEffect(() => {
    if (storyEditMode === 'editor' && allPhotos.length === 0) {
      void loadAllPhotos()
    }
  }, [allPhotos.length, loadAllPhotos, storyEditMode])

  useEffect(() => {
    if (saving || storyEditMode !== 'editor' || !currentStory || !isDirty) return

    const timer = window.setTimeout(() => {
      void saveDraft()
    }, AUTO_SAVE_DELAY)

    return () => window.clearTimeout(timer)
  }, [currentStory, isDirty, pendingImages.length, saveDraft, saving, storyEditMode])

  useEffect(() => {
    if (!editFromDraft || (editFromDraft.photoIds.length > 0 && allPhotos.length === 0)) return

    queueMicrotask(() => {
      const restoredPhotos = editFromDraft.photoIds
        .map((id) => allPhotos.find((photo) => photo.id === id))
        .filter((photo): photo is PhotoDto => Boolean(photo))

      const restoredStory: StoryDto = {
        id: getNewStoryIdFromDraft(editFromDraft),
        title: editFromDraft.title,
        editorType: editFromDraft.editorType,
        contentEditorTypes: editFromDraft.contentEditorTypes,
        tiptapContent: editFromDraft.tiptapContent,
        tiptapContentJson: editFromDraft.tiptapContentJson ?? null,
        milkContent: editFromDraft.milkContent,
        isPublished: editFromDraft.isPublished,
        storyDate: editFromDraft.storyDate ?? editFromDraft.createdAt,
        createdAt: editFromDraft.createdAt,
        updatedAt: new Date().toISOString(),
        coverPhotoId: editFromDraft.coverPhotoId ?? undefined,
        coverCrop: editFromDraft.coverCrop ?? null,
        photos: restoredPhotos,
      }
      setEditorSessionId(restoredStory.id)
      setCurrentStory(restoredStory)
      setPendingImages(restorePendingImages(editFromDraft.files))
      setPendingCoverId(editFromDraft.pendingCoverId || null)
      setLastSavedAt(editFromDraft.savedAt)
      setInitialStory(createSnapshot(restoredStory))
      setStoryEditMode('editor')
      notify(t('admin.restored_from_draft'), 'info')
      onDraftConsumed?.()
    })
  }, [allPhotos, editFromDraft, notify, onDraftConsumed, setCurrentStory, setPendingCoverId, setPendingImages, setStoryEditMode, t])

  return {
    editorSessionId,
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
    markSaved,
  }
}
