'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { PhotoDto, StoryDto } from '@/lib/api'
import type { StoryEditorDraftData } from '@/lib/client-db'
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
}

function restorePendingImages(files?: StoryEditorDraftData['files']): PendingImage[] {
  if (!files?.length) return []
  return files.map((entry) => ({ id: entry.id, file: entry.file, previewUrl: URL.createObjectURL(entry.file), status: 'pending' as const, progress: 0, takenAt: entry.takenAt }))
}

function createSnapshot(story: StoryDto): StorySnapshot {
  return {
    title: story.title,
    content: story.content,
    isPublished: story.isPublished,
    createdAt: story.createdAt,
    storyDate: story.storyDate,
    photoIds: story.photos?.map((photo) => photo.id) || [],
    coverPhotoId: story.coverPhotoId,
  }
}

export function useStoryDraftState({
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
}: UseStoryDraftStateParams): UseStoryDraftStateResult {
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
      currentStory.content !== initialStory.content ||
      currentStory.isPublished !== initialStory.isPublished ||
      currentStory.storyDate !== initialStory.storyDate ||
      currentStory.coverPhotoId !== initialStory.coverPhotoId ||
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

  const saveDraft = useCallback(async () => {
    if (!currentStory) return

    const existingStory = stories.find((story) => story.id === currentStory.id)

    try {
      await saveStoryEditorDraftToDB({
        storyId: existingStory ? currentStory.id : undefined,
        title: currentStory.title,
        content: currentStory.content,
        isPublished: currentStory.isPublished,
        createdAt: currentStory.createdAt,
        coverPhotoId: currentStory.coverPhotoId,
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

    setCurrentStory({
      ...baseStory,
      title: draft.title || baseStory.title,
      content: draft.content || baseStory.content,
      isPublished: draft.isPublished,
      createdAt: draft.createdAt || baseStory.createdAt,
      storyDate: draft.createdAt || baseStory.storyDate,
      coverPhotoId: draft.coverPhotoId ?? baseStory.coverPhotoId,
      photos: restoredPhotos,
    })
    setPendingImages(restorePendingImages(draft.files))
    setPendingCoverId(draft.pendingCoverId || null)
    setLastSavedAt(draft.savedAt)
    setInitialStory({
      title: draft.title || baseStory.title,
      content: draft.content || baseStory.content,
      isPublished: draft.isPublished,
      createdAt: draft.createdAt || baseStory.createdAt,
      storyDate: draft.createdAt || baseStory.storyDate,
      photoIds: draft.photoIds,
      coverPhotoId: draft.coverPhotoId ?? baseStory.coverPhotoId,
    })
    notify(t('admin.restored_from_draft'), 'info')
  }, [allPhotos, notify, setCurrentStory, setPendingCoverId, setPendingImages, t])

  const createStoryWithDraftCheck = useCallback(async () => {
    const newStory = createEmptyStory()
    setInitialStory(createSnapshot(newStory))

    try {
      const draft = await getStoryEditorDraftFromDB(undefined)
      if (draft && draft.savedAt && (draft.title || draft.content || draft.files?.length)) {
        setCurrentStory(newStory)
        setDraftRestoreDialog({ isOpen: true, draft, story: newStory })
        return
      }
    } catch (error) {
      console.error('Failed to check draft:', error)
    }

    setPendingImages([])
    setPendingCoverId(null)
    setCurrentStory(newStory)
    setStoryEditMode('editor')
  }, [setCurrentStory, setPendingCoverId, setPendingImages, setStoryEditMode])

  const editStoryWithDraftCheck = useCallback(async (story: StoryDto) => {
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
    if (storyEditMode !== 'editor' || !currentStory || !isDirty) return
    if (!currentStory.title && !currentStory.content && pendingImages.length === 0) return

    const timer = window.setTimeout(() => {
      void saveDraft()
    }, AUTO_SAVE_DELAY)

    return () => window.clearTimeout(timer)
  }, [currentStory, isDirty, pendingImages.length, saveDraft, storyEditMode])

  useEffect(() => {
    if (!editFromDraft || allPhotos.length === 0) return

    queueMicrotask(() => {
      const restoredPhotos = editFromDraft.photoIds
        .map((id) => allPhotos.find((photo) => photo.id === id))
        .filter((photo): photo is PhotoDto => Boolean(photo))

      setCurrentStory({
        id: editFromDraft.storyId || crypto.randomUUID(),
        title: editFromDraft.title,
        content: editFromDraft.content,
        isPublished: editFromDraft.isPublished,
        storyDate: editFromDraft.createdAt,
        createdAt: editFromDraft.createdAt,
        updatedAt: new Date().toISOString(),
        coverPhotoId: editFromDraft.coverPhotoId ?? undefined,
        photos: restoredPhotos,
      })
      setPendingImages(restorePendingImages(editFromDraft.files))
      setPendingCoverId(editFromDraft.pendingCoverId || null)
      setLastSavedAt(editFromDraft.savedAt)
      setStoryEditMode('editor')
      notify(t('admin.restored_from_draft'), 'info')
      onDraftConsumed?.()
    })
  }, [allPhotos, editFromDraft, notify, onDraftConsumed, setCurrentStory, setPendingCoverId, setPendingImages, setStoryEditMode, t])

  return {
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
  }
}
