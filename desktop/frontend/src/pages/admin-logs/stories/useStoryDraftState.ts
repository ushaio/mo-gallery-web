'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { PhotoDto, StoryDto } from '@/lib/api/types'
import { STORY_EDITOR_DRAFT_PREFIX, type StoryEditorDraftData } from '@/lib/client-db'
import { getStoryEditorDraftFromDB, markStoryEditorDraftSynced, rekeyStoryEditorDraft, saveStoryEditorDraftToDB } from '@/lib/client-db'
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
  editorSessionId: string
  draftSaved: boolean
  lastSavedAt: number | null
  initialStory: StorySnapshot | null
  isDirty: boolean
  draftRestoreDialog: DraftRestoreDialogState
  createStoryWithDraftCheck: () => Promise<void>
  editStoryWithDraftCheck: (story: StoryDto, source?: 'prompt' | 'draft' | 'database') => Promise<void>
  handleDraftRestore: () => void
  handleDraftDiscard: () => void
  handleDraftCancel: () => void
  markDraftSynced: (snapshot: StoryDto, storyId: string) => Promise<void>
  rekeySavedDraft: (oldDraftId: string, storyId: string) => Promise<void>
  saveDraft: () => Promise<void>
  resetDraftState: () => void
  acceptSavedStory: (story: StoryDto, sessionId: string) => boolean
}

function restorePendingImages(files?: StoryEditorDraftData['files']): PendingImage[] {
  if (!files?.length) return []
  return files.map((entry) => ({ id: entry.id, file: entry.file, previewUrl: URL.createObjectURL(entry.file), status: 'pending' as const, progress: 0, takenAt: entry.takenAt }))
}

function createSnapshot(story: StoryDto): StorySnapshot {
  return {
    title: story.title,
    editorType: story.editorType,
    contentEditorTypes: [...story.contentEditorTypes],
    tiptapContent: story.tiptapContent,
    tiptapContentJson: story.tiptapContentJson ?? null,
    milkContent: story.milkContent ?? null,
    isPublished: story.isPublished,
    createdAt: story.createdAt,
    storyDate: story.storyDate,
    photoIds: story.photos?.map((photo) => photo.id) || [],
    coverPhotoId: story.coverPhotoId,
    coverCrop: story.coverCrop ?? null,
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
  const [editorSessionId, setEditorSessionId] = useState(() => crypto.randomUUID())
  const editorSessionRef = useRef(editorSessionId)
  const draftWritesRef = useRef<Promise<void>>(Promise.resolve())
  const draftCloudIdsRef = useRef(new Map<string, string>())
  const [draftSaved, setDraftSaved] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [initialStory, setInitialStory] = useState<StorySnapshot | null>(null)
  const [draftRestoreDialog, setDraftRestoreDialog] = useState<DraftRestoreDialogState>({ isOpen: false, draft: null, story: null })

  const enqueueDraftWrite = useCallback((operation: () => Promise<void>) => {
    const write = draftWritesRef.current.then(operation)
    draftWritesRef.current = write.catch(() => undefined)
    return write
  }, [])

  const rekeySavedDraft = useCallback((oldDraftId: string, storyId: string) => {
    // Resolve queued autosaves to the cloud ID before moving the latest old row.
    draftCloudIdsRef.current.set(oldDraftId, storyId)
    draftCloudIdsRef.current.set(storyId, storyId)
    return enqueueDraftWrite(() => rekeyStoryEditorDraft(oldDraftId, storyId))
  }, [enqueueDraftWrite])

  const beginEditorSession = useCallback(() => {
    const sessionId = crypto.randomUUID()
    editorSessionRef.current = sessionId
    setEditorSessionId(sessionId)
  }, [])

  const acceptSavedStory = useCallback((story: StoryDto, sessionId: string) => {
    if (editorSessionRef.current !== sessionId) return false
    setInitialStory(createSnapshot(story))
    return true
  }, [])

  const isDirty = !!(
    storyEditMode === 'editor' &&
    currentStory &&
    initialStory &&
    (
      currentStory.title !== initialStory.title ||
      currentStory.editorType !== initialStory.editorType ||
      JSON.stringify([...currentStory.contentEditorTypes].sort()) !== JSON.stringify([...initialStory.contentEditorTypes].sort()) ||
      (currentStory.milkContent ?? null) !== initialStory.milkContent ||
      currentStory.tiptapContent !== initialStory.tiptapContent ||
      JSON.stringify(currentStory.tiptapContentJson ?? null) !== JSON.stringify(initialStory.tiptapContentJson ?? null) ||
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
    beginEditorSession()
    setInitialStory(null)
    setLastSavedAt(null)
    setDraftRestoreDialog({ isOpen: false, draft: null, story: null })
  }, [beginEditorSession])

  const saveDraft = useCallback(async () => {
    if (!currentStory) return

    const existingStory = stories.find((story) => story.id === currentStory.id)

    try {
      await enqueueDraftWrite(async () => {
        const cloudId = draftCloudIdsRef.current.get(currentStory.id)
        await saveStoryEditorDraftToDB({
          storyId: cloudId ?? (existingStory ? currentStory.id : undefined),
          draftId: cloudId || existingStory ? undefined : currentStory.id,
          title: currentStory.title,
          editorType: currentStory.editorType,
          contentEditorTypes: currentStory.contentEditorTypes,
          tiptapContent: currentStory.tiptapContent,
          tiptapContentJson: currentStory.tiptapContentJson ?? null,
          milkContent: currentStory.milkContent ?? null,
          isPublished: currentStory.isPublished,
          createdAt: currentStory.createdAt,
          coverPhotoId: currentStory.coverPhotoId,
          coverCrop: currentStory.coverCrop ?? null,
          pendingCoverId,
          photoIds: currentStory.photos?.map((photo) => photo.id) || [],
          files: pendingImages.map((image) => ({ id: image.id, file: image.file, takenAt: image.takenAt })),
        })
      })
      setLastSavedAt(Date.now())
      setDraftSaved(true)
      window.setTimeout(() => setDraftSaved(false), 2000)
    } catch (error) {
      console.error('Failed to save draft:', error)
    }
  }, [currentStory, enqueueDraftWrite, pendingCoverId, pendingImages, stories])

  const markDraftSynced = useCallback(async (snapshot: StoryDto, storyId: string) => {
    await enqueueDraftWrite(async () => {
      const draft = await getStoryEditorDraftFromDB(storyId)
      if (!draft || draft.title !== snapshot.title || draft.editorType !== snapshot.editorType
        || (draft.milkContent ?? null) !== (snapshot.milkContent ?? null)
        || draft.tiptapContent !== snapshot.tiptapContent
        || JSON.stringify(draft.tiptapContentJson ?? null) !== JSON.stringify(snapshot.tiptapContentJson ?? null)
        || draft.isPublished !== snapshot.isPublished
        || (draft.coverPhotoId ?? null) !== (snapshot.coverPhotoId ?? null)
        || JSON.stringify(draft.coverCrop ?? null) !== JSON.stringify(snapshot.coverCrop ?? null)
        || JSON.stringify(draft.photoIds) !== JSON.stringify(snapshot.photos.map((photo) => photo.id))
        || (draft.files?.length ?? 0) > 0 || draft.pendingCoverId) return
      await markStoryEditorDraftSynced(storyId, draft.savedAt)
    })
  }, [enqueueDraftWrite])

  const applyDraft = useCallback((draft: StoryEditorDraftData, baseStory: StoryDto) => {
    beginEditorSession()
    const restoredPhotos = draft.photoIds
      .map((id) => allPhotos.find((photo) => photo.id === id) || baseStory.photos?.find((photo) => photo.id === id))
      .filter((photo): photo is PhotoDto => Boolean(photo))

    const restoredStory: StoryDto = {
      ...baseStory,
      title: draft.title,
      editorType: draft.editorType,
      contentEditorTypes: [...draft.contentEditorTypes],
      tiptapContent: draft.tiptapContent,
      tiptapContentJson: draft.tiptapContentJson ?? null,
      milkContent: draft.milkContent ?? null,
      isPublished: draft.isPublished,
      createdAt: draft.createdAt || baseStory.createdAt,
      storyDate: draft.createdAt || baseStory.storyDate,
      coverPhotoId: draft.coverPhotoId ?? baseStory.coverPhotoId,
      coverCrop: draft.coverCrop ?? baseStory.coverCrop ?? null,
      photos: restoredPhotos,
    }
    setCurrentStory(restoredStory)
    setPendingImages(restorePendingImages(draft.files))
    setPendingCoverId(draft.pendingCoverId || null)
    setLastSavedAt(draft.savedAt)
    setInitialStory({ ...createSnapshot(restoredStory), photoIds: draft.photoIds })
    notify(t('admin.restored_from_draft'), 'info')
  }, [allPhotos, beginEditorSession, notify, setCurrentStory, setPendingCoverId, setPendingImages, t])

  const createStoryWithDraftCheck = useCallback(async () => {
    beginEditorSession()
    const newStory = createEmptyStory()
    setInitialStory(createSnapshot(newStory))
    setPendingImages([])
    setPendingCoverId(null)
    setCurrentStory(newStory)
    setStoryEditMode('editor')
  }, [beginEditorSession, setCurrentStory, setPendingCoverId, setPendingImages, setStoryEditMode])

  const editStoryWithDraftCheck = useCallback(async (
    story: StoryDto,
    source: 'prompt' | 'draft' | 'database' = 'prompt',
  ) => {
    beginEditorSession()
    const editableStory = { ...story }
    setInitialStory(createSnapshot(editableStory))

    if (source === 'database') {
      setPendingImages([])
      setPendingCoverId(null)
      setCurrentStory(editableStory)
      setStoryEditMode('editor')
      return
    }

    try {
      const draft = await getStoryEditorDraftFromDB(story.id)
      if (source === 'draft' && draft) {
        applyDraft(draft, story)
        setStoryEditMode('editor')
        return
      }
      if (source === 'prompt' && draft && !draft.cloudSynced && draft.savedAt && draft.savedAt > new Date(story.updatedAt).getTime()) {
        setCurrentStory(editableStory)
        setDraftRestoreDialog({ isOpen: true, draft, story: editableStory })
        return
      }
    } catch (error) {
      console.error('Failed to check draft:', error)
    }

    setPendingImages([])
    setPendingCoverId(null)
    setCurrentStory(editableStory)
    setStoryEditMode('editor')
  }, [applyDraft, beginEditorSession, setCurrentStory, setPendingCoverId, setPendingImages, setStoryEditMode])

  const handleDraftRestore = useCallback(() => {
    if (draftRestoreDialog.draft && draftRestoreDialog.story) {
      applyDraft(draftRestoreDialog.draft, draftRestoreDialog.story)
    }
    setDraftRestoreDialog({ isOpen: false, draft: null, story: null })
    setStoryEditMode('editor')
  }, [applyDraft, draftRestoreDialog, setStoryEditMode])

  const handleDraftDiscard = useCallback(() => {
    if (draftRestoreDialog.story) {
      setCurrentStory(draftRestoreDialog.story)
      setPendingImages([])
      setPendingCoverId(null)
    }
    setDraftRestoreDialog({ isOpen: false, draft: null, story: null })
    setStoryEditMode('editor')
  }, [draftRestoreDialog.story, setCurrentStory, setPendingCoverId, setPendingImages, setStoryEditMode])

  const handleDraftCancel = useCallback(() => {
    beginEditorSession()
    setDraftRestoreDialog({ isOpen: false, draft: null, story: null })
    setCurrentStory(null)
    setStoryEditMode('list')
  }, [beginEditorSession, setCurrentStory, setStoryEditMode])

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

    const timer = window.setTimeout(() => {
      void saveDraft()
    }, AUTO_SAVE_DELAY)

    return () => window.clearTimeout(timer)
  }, [currentStory, isDirty, pendingImages.length, saveDraft, storyEditMode])

  useEffect(() => {
    if (!editFromDraft || (editFromDraft.photoIds.length > 0 && allPhotos.length === 0)) return

    queueMicrotask(() => {
      beginEditorSession()
      const milkContent = editFromDraft.milkContent ?? null
      const restoredPhotos = editFromDraft.photoIds
        .map((id) => allPhotos.find((photo) => photo.id === id))
        .filter((photo): photo is PhotoDto => Boolean(photo))

      setCurrentStory({
        id: getNewStoryIdFromDraft(editFromDraft),
        title: editFromDraft.title,
        editorType: editFromDraft.editorType,
        contentEditorTypes: [...editFromDraft.contentEditorTypes],
        tiptapContent: editFromDraft.tiptapContent,
        tiptapContentJson: editFromDraft.tiptapContentJson ?? null,
        milkContent,
        isPublished: editFromDraft.isPublished,
        storyDate: editFromDraft.createdAt,
        createdAt: editFromDraft.createdAt,
        updatedAt: new Date().toISOString(),
        coverPhotoId: editFromDraft.coverPhotoId ?? undefined,
        coverCrop: editFromDraft.coverCrop ?? null,
        photos: restoredPhotos,
      })
      setPendingImages(restorePendingImages(editFromDraft.files))
      setPendingCoverId(editFromDraft.pendingCoverId || null)
      setLastSavedAt(editFromDraft.savedAt)
      setInitialStory({
        title: editFromDraft.title,
        editorType: editFromDraft.editorType,
        contentEditorTypes: [...editFromDraft.contentEditorTypes],
        tiptapContent: editFromDraft.tiptapContent,
        tiptapContentJson: editFromDraft.tiptapContentJson ?? null,
        milkContent,
        isPublished: editFromDraft.isPublished,
        createdAt: editFromDraft.createdAt,
        storyDate: editFromDraft.createdAt,
        photoIds: editFromDraft.photoIds,
        coverPhotoId: editFromDraft.coverPhotoId ?? undefined,
        coverCrop: editFromDraft.coverCrop ?? null,
      })
      setStoryEditMode('editor')
      notify(t('admin.restored_from_draft'), 'info')
      onDraftConsumed?.()
    })
  }, [allPhotos, beginEditorSession, editFromDraft, notify, onDraftConsumed, setCurrentStory, setPendingCoverId, setPendingImages, setStoryEditMode, t])

  return {
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
    saveDraft,
    resetDraftState,
    acceptSavedStory,
  }
}
