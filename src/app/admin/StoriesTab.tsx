'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { compressImage } from '@/lib/image-compress'
import ExifReader from 'exifreader'
import {
  BookOpen,
  Plus,
  History,
  FileText,
  Edit3,
  Trash2,
  ChevronLeft,
  Save,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Calendar,
  Clock,
  Check,
} from 'lucide-react'
import {
  getAdminStories,
  createStory,
  updateStory,
  deleteStory,
  addPhotosToStory,
  reorderStoryPhotos,
  getPhotos,
  uploadPhotoWithProgress,
  addPhotosToAlbum,
  type StoryDto,
  type PhotoDto,
} from '@/lib/api'
import { useSettings } from '@/contexts/SettingsContext'
import { AdminInput, AdminSelect, type SelectOption } from '@/components/admin/AdminFormControls'
import { PhotoSelectorModal } from '@/components/admin/PhotoSelectorModal'
import { ImageUploadSettingsModal, type UploadSettings } from '@/components/admin/ImageUploadSettingsModal'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { DraftRestoreDialog } from '@/components/admin/DraftRestoreDialog'
import { StoryPreviewModal } from '@/components/admin/StoryPreviewModal'
import { StoryPhotoPanel, type PendingImage } from '@/components/admin/StoryPhotoPanel'
import type { MilkdownEditorHandle } from '@/components/MilkdownEditor'
import { saveStoryEditorDraftToDB, getStoryEditorDraftFromDB, clearStoryEditorDraftFromDB, type StoryEditorDraftData } from '@/lib/client-db'
import { AdminButton } from '@/components/admin/AdminButton'

// Dynamically import MilkdownEditor to avoid SSR issues
const MilkdownEditor = dynamic(
  () => import('@/components/MilkdownEditor'),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center border border-border bg-card/30 rounded-lg">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }
)

interface StoriesTabProps {
  token: string | null
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  editStoryId?: string
  editFromDraft?: StoryEditorDraftData | null
  onDraftConsumed?: () => void
  refreshKey?: number
}

export function StoriesTab({ token, t, notify, editStoryId, editFromDraft, onDraftConsumed, refreshKey }: StoriesTabProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { settings } = useSettings()
  const [stories, setStories] = useState<StoryDto[]>([])
  const [loading, setLoading] = useState(true)
  const [currentStory, setCurrentStory] = useState<StoryDto | null>(null)
  const [storyEditMode, setStoryEditMode] = useState<'list' | 'editor'>('list')
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<MilkdownEditorHandle>(null)
  
  // Photo management
  const [allPhotos, setAllPhotos] = useState<PhotoDto[]>([])
  const [showPhotoSelector, setShowPhotoSelector] = useState(false)
  
  // Drag and drop state (supports both photos and pending images)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [draggedItemType, setDraggedItemType] = useState<'photo' | 'pending' | null>(null)
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null)
  
  // Photo/pending menu state
  const [openMenuPhotoId, setOpenMenuPhotoId] = useState<string | null>(null)
  const [openMenuPendingId, setOpenMenuPendingId] = useState<string | null>(null)
  
  // Pending cover state (for pending images before upload)
  const [pendingCoverId, setPendingCoverId] = useState<string | null>(null)
  
  // Preview modal state
  const [showPreview, setShowPreview] = useState(false)
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState<number | null>(null)
  
  // Pending images for deferred upload
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const [showUploadSettings, setShowUploadSettings] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, currentFile: '' })
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  
  // Draft auto-save state
  const [draftSaved, setDraftSaved] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const AUTO_SAVE_DELAY = 2000

  // Photo order persistence key
  const photoOrderKey = 'story_photo_order'

  // Helper to get saved photo order from localStorage
  function getSavedPhotoOrder(storyId: string): Record<string, string[]> {
    if (typeof window === 'undefined') return {}
    try {
      const stored = localStorage.getItem(photoOrderKey)
      return stored ? JSON.parse(stored) : {}
    } catch {
      return {}
    }
  }

  // Helper to save photo order to localStorage
  function savePhotoOrder(storyId: string, photoIds: string[]) {
    if (typeof window === 'undefined') return
    try {
      const all = getSavedPhotoOrder(storyId)
      all[storyId] = photoIds
      localStorage.setItem(photoOrderKey, JSON.stringify(all))
    } catch (e) {
      console.error('Failed to save photo order:', e)
    }
  }

  // Apply saved order to stories list
  function applySavedOrder(stories: StoryDto[]): StoryDto[] {
    const photoOrders = getSavedPhotoOrder('')
    return stories.map(story => {
      const order = photoOrders[story.id]
      if (order && story.photos) {
        const photoMap = new Map(story.photos.map(p => [p.id, p]))
        const sortedPhotos = order.map((id: string) => photoMap.get(id)).filter((p): p is PhotoDto => !!p)
        // Only apply if all ordered photos exist
        if (sortedPhotos.length === story.photos.length) {
          return { ...story, photos: sortedPhotos }
        }
      }
      return story
    })
  }
  
  // Track initial state for dirty checking
  const [isDirty, setIsDirty] = useState(false)
  const initialStoryRef = useRef<{
    title: string
    content: string
    isPublished: boolean
    createdAt: string
    photoIds: string[]
    coverPhotoId?: string
  } | null>(null)
  
  // Delete dialog state
  const [deleteStoryId, setDeleteStoryId] = useState<string | null>(null)
  
  // Status filter state
  const [statusFilter, setStatusFilter] = useState('')
  
  // Custom date toggle state
  const [useCustomDate, setUseCustomDate] = useState(false)
  
  // Draft restore dialog state
  const [draftRestoreDialog, setDraftRestoreDialog] = useState<{
    isOpen: boolean
    draft: StoryEditorDraftData | null
    story: StoryDto | null
  }>({ isOpen: false, draft: null, story: null })

  const initialLoadRef = useRef(false)
  
  useEffect(() => {
    if (!initialLoadRef.current) {
      loadStories()
      initialLoadRef.current = true
    }
  }, [token])
  
  // Refresh when refreshKey changes - also reset to list mode
  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      loadStories()
      setStoryEditMode('list')
      setCurrentStory(null)
      setPendingImages([])
      initialStoryRef.current = null
      setIsDirty(false)
      setUseCustomDate(false)
    }
  }, [refreshKey])

  // Handle editStoryId - auto-open editor for the specified story
  useEffect(() => {
    if (editStoryId && stories.length > 0) {
      const storyToEdit = stories.find(s => s.id === editStoryId)
      if (storyToEdit) {
        setCurrentStory({ ...storyToEdit })
        setStoryEditMode('editor')
      }
    }
  }, [editStoryId, stories])

  // Handle editFromDraft - open editor with draft data (no database call)
  useEffect(() => {
    if (editFromDraft && allPhotos.length > 0) {
      const restoredPhotos = editFromDraft.photoIds
        .map(id => allPhotos.find(p => p.id === id))
        .filter((p): p is PhotoDto => !!p)
      
      setCurrentStory({
        id: editFromDraft.storyId || crypto.randomUUID(),
        title: editFromDraft.title,
        content: editFromDraft.content,
        isPublished: editFromDraft.isPublished,
        createdAt: editFromDraft.createdAt,
        updatedAt: new Date().toISOString(),
        coverPhotoId: editFromDraft.coverPhotoId ?? undefined,
        photos: restoredPhotos,
      })
      
      if (editFromDraft.files?.length > 0) {
        const restoredPending = editFromDraft.files.map(f => ({
          id: f.id,
          file: f.file,
          previewUrl: URL.createObjectURL(f.file),
          status: 'pending' as const,
          progress: 0,
          takenAt: f.takenAt
        }))
        setPendingImages(restoredPending)
      }
      
      // Restore pendingCoverId from draft
      if (editFromDraft.pendingCoverId) {
        setPendingCoverId(editFromDraft.pendingCoverId)
      }
      
      setLastSavedAt(editFromDraft.savedAt)
      setStoryEditMode('editor')
      notify(t('admin.restored_from_draft') || '已从草稿恢复', 'info')
      onDraftConsumed?.()
    }
  }, [editFromDraft, allPhotos, onDraftConsumed])

  // Load photos first when editFromDraft is provided
  useEffect(() => {
    if (editFromDraft && allPhotos.length === 0) {
      loadAllPhotos()
    }
  }, [editFromDraft])

  // Load all photos when entering editor mode
  useEffect(() => {
    if (storyEditMode === 'editor' && allPhotos.length === 0) {
      loadAllPhotos()
    }
  }, [storyEditMode])

  // Note: Draft loading is now handled in handleEditStory and handleCreateStory
  // to allow user to choose whether to restore draft

  // Check if content has changed (dirty check)
  useEffect(() => {
    if (storyEditMode !== 'editor' || !currentStory || !initialStoryRef.current) {
      setIsDirty(false)
      return
    }
    
    const initial = initialStoryRef.current
    const currentPhotoIds = currentStory.photos?.map(p => p.id) || []
    
    const hasChanged =
      currentStory.title !== initial.title ||
      currentStory.content !== initial.content ||
      currentStory.isPublished !== initial.isPublished ||
      currentStory.createdAt !== initial.createdAt ||
      currentStory.coverPhotoId !== initial.coverPhotoId ||
      JSON.stringify(currentPhotoIds) !== JSON.stringify(initial.photoIds) ||
      pendingImages.length > 0 ||
      pendingCoverId !== null
    
    setIsDirty(hasChanged)
  }, [storyEditMode, currentStory?.title, currentStory?.content, currentStory?.isPublished, currentStory?.createdAt, currentStory?.coverPhotoId, currentStory?.photos, pendingImages, pendingCoverId])

  // Auto-save draft when story data changes (only if dirty)
  useEffect(() => {
    if (storyEditMode !== 'editor' || !currentStory || !isDirty) return
    if (!currentStory.title && !currentStory.content && pendingImages.length === 0) return

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => saveDraft(), AUTO_SAVE_DELAY)

    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current) }
  }, [currentStory?.title, currentStory?.content, currentStory?.isPublished, currentStory?.createdAt, currentStory?.coverPhotoId, currentStory?.photos, pendingImages, pendingCoverId, isDirty])

  // Apply draft to current story
  const applyDraft = useCallback((draft: StoryEditorDraftData, baseStory: StoryDto) => {
    // Use draft photoIds directly - if empty, it means user deleted all photos
    const restoredPhotos = draft.photoIds
      .map(id => allPhotos.find(p => p.id === id) || baseStory.photos?.find(p => p.id === id))
      .filter((p): p is PhotoDto => !!p)
    
    setCurrentStory({
      ...baseStory,
      title: draft.title || baseStory.title,
      content: draft.content || baseStory.content,
      isPublished: draft.isPublished,
      createdAt: draft.createdAt || baseStory.createdAt,
      coverPhotoId: draft.coverPhotoId ?? baseStory.coverPhotoId,
      photos: restoredPhotos,
    })
    
    if (draft.files?.length > 0) {
      const restoredPending = draft.files.map(f => ({
        id: f.id,
        file: f.file,
        previewUrl: URL.createObjectURL(f.file),
        status: 'pending' as const,
        progress: 0,
        takenAt: f.takenAt
      }))
      setPendingImages(restoredPending)
    }
    
    // Restore pendingCoverId from draft
    if (draft.pendingCoverId) {
      setPendingCoverId(draft.pendingCoverId)
    }
    
    setLastSavedAt(draft.savedAt)
    // Update initial ref to match restored draft (so it's not considered dirty)
    initialStoryRef.current = {
      title: draft.title || baseStory.title,
      content: draft.content || baseStory.content,
      isPublished: draft.isPublished,
      createdAt: draft.createdAt || baseStory.createdAt,
      photoIds: draft.photoIds,
      coverPhotoId: draft.coverPhotoId ?? baseStory.coverPhotoId,
    }
    notify(t('admin.restored_from_draft'), 'info')
  }, [allPhotos, notify, t])

  // Handle draft restore dialog confirm
  const handleDraftRestore = useCallback(() => {
    if (draftRestoreDialog.draft && draftRestoreDialog.story) {
      applyDraft(draftRestoreDialog.draft, draftRestoreDialog.story)
    }
    setDraftRestoreDialog({ isOpen: false, draft: null, story: null })
    setStoryEditMode('editor')
  }, [draftRestoreDialog, applyDraft])

  // Handle draft restore dialog discard
  const handleDraftDiscard = useCallback(() => {
    if (draftRestoreDialog.story) {
      setCurrentStory({ ...draftRestoreDialog.story })
    }
    setDraftRestoreDialog({ isOpen: false, draft: null, story: null })
    setStoryEditMode('editor')
  }, [draftRestoreDialog])

  // Handle draft restore dialog cancel (close without action)
  const handleDraftCancel = useCallback(() => {
    setDraftRestoreDialog({ isOpen: false, draft: null, story: null })
    setCurrentStory(null)
  }, [])

  const saveDraft = useCallback(async () => {
    if (!currentStory) return
    const existingStory = stories.find(s => s.id === currentStory.id)
    
    try {
      await saveStoryEditorDraftToDB({
        storyId: existingStory ? currentStory.id : undefined,
        title: currentStory.title,
        content: currentStory.content,
        isPublished: currentStory.isPublished,
        createdAt: currentStory.createdAt,
        coverPhotoId: currentStory.coverPhotoId,
        pendingCoverId: pendingCoverId,
        photoIds: currentStory.photos?.map(p => p.id) || [],
        files: pendingImages.map(p => ({ id: p.id, file: p.file, takenAt: p.takenAt }))
      })
      setLastSavedAt(Date.now())
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 2000)
    } catch (e) {
      console.error('Failed to save draft:', e)
    }
  }, [currentStory, stories, pendingImages, pendingCoverId])

  const clearDraft = useCallback(async (storyId?: string) => {
    try {
      await clearStoryEditorDraftFromDB(storyId)
      setLastSavedAt(null)
    } catch (e) {
      console.error('Failed to clear draft:', e)
    }
  }, [])

  async function loadStories() {
    if (!token) return
    try {
      setLoading(true)
      const data = await getAdminStories(token)
      // Apply saved photo order from localStorage
      setStories(applySavedOrder(data))
    } catch (err) {
      console.error('Failed to load stories:', err)
      notify(t('story.load_failed'), 'error')
    } finally {
      setLoading(false)
    }
  }

  async function loadAllPhotos() {
    try {
      const data = await getPhotos({ all: true })
      setAllPhotos(data)
    } catch (err) {
      console.error('Failed to load photos:', err)
    }
  }

  async function handleCreateStory() {
    const newStory: StoryDto = {
      id: crypto.randomUUID(),
      title: '',
      content: '',
      isPublished: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      photos: [],
    }
    
    // Set initial state for dirty checking
    initialStoryRef.current = {
      title: '',
      content: '',
      isPublished: false,
      createdAt: newStory.createdAt,
      photoIds: [],
      coverPhotoId: undefined,
    }
    
    // Check for existing draft for new story
    try {
      const draft = await getStoryEditorDraftFromDB(undefined)
      if (draft && draft.savedAt && (draft.title || draft.content || (draft.files && draft.files.length > 0))) {
        // Show dialog to ask user
        setCurrentStory(newStory)
        setDraftRestoreDialog({ isOpen: true, draft, story: newStory })
        return
      }
    } catch (e) {
      console.error('Failed to check draft:', e)
    }
    
    setCurrentStory(newStory)
    setStoryEditMode('editor')
  }

  async function handleEditStory(story: StoryDto) {
    // Set initial state for dirty checking
    initialStoryRef.current = {
      title: story.title,
      content: story.content,
      isPublished: story.isPublished,
      createdAt: story.createdAt,
      photoIds: story.photos?.map(p => p.id) || [],
      coverPhotoId: story.coverPhotoId,
    }
    
    // Check for existing draft for this story
    try {
      const draft = await getStoryEditorDraftFromDB(story.id)
      if (draft && draft.savedAt && draft.savedAt > new Date(story.updatedAt).getTime()) {
        // Draft is newer than saved version, show dialog
        setCurrentStory({ ...story })
        setDraftRestoreDialog({ isOpen: true, draft, story })
        return
      }
    } catch (e) {
      console.error('Failed to check draft:', e)
    }
    
    setCurrentStory({ ...story })
    setStoryEditMode('editor')
  }

  async function confirmDeleteStory() {
    if (!token || !deleteStoryId) return
    try {
      await deleteStory(token, deleteStoryId)
      notify(t('story.deleted'), 'success')
      await loadStories()
    } catch (err) {
      console.error('Failed to delete story:', err)
      notify(t('story.delete_failed'), 'error')
    } finally {
      setDeleteStoryId(null)
    }
  }

  function handlePhotoPanelDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDraggingOver(true)
  }

  function handlePhotoPanelDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setIsDraggingOver(false)
  }

  async function handlePhotoPanelDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDraggingOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return
    
    const newPending: PendingImage[] = await Promise.all(files.map(async file => {
      let takenAt: string | undefined
      try {
        const tags = await ExifReader.load(file)
        const dateTime = tags['DateTimeOriginal'] || tags['DateTime']
        if (dateTime?.description) {
          const match = dateTime.description.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
          if (match) {
            const [, year, month, day, hour, minute, second] = match
            takenAt = `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`
          }
        }
      } catch {}
      return {
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'pending' as const,
        progress: 0,
        takenAt
      }
    }))
    setPendingImages(prev => [...prev, ...newPending])
  }

  function handleRemovePendingImage(id: string) {
    setPendingImages(prev => {
      const item = prev.find(p => p.id === id)
      if (item) URL.revokeObjectURL(item.previewUrl)
      return prev.filter(p => p.id !== id)
    })
  }

  async function handleSaveStory() {
    if (!token || !currentStory) return
    if (!currentStory.title.trim() || !currentStory.content.trim()) {
      notify(t('story.fill_title_content'), 'error')
      return
    }
    const pendingToUpload = pendingImages.filter(p => p.status === 'pending' || p.status === 'failed')
    if (pendingToUpload.length > 0) {
      setShowUploadSettings(true)
      return
    }
    await doSaveStory()
  }

  async function doSaveStory() {
    if (!token || !currentStory) return
    try {
      setSaving(true)
      const isNew = !stories.find((s) => s.id === currentStory.id)
      const photoIds = currentStory.photos?.map(p => p.id) || []

      if (isNew) {
        await createStory(token, {
          title: currentStory.title,
          content: currentStory.content,
          isPublished: currentStory.isPublished,
          photoIds,
          coverPhotoId: currentStory.coverPhotoId,
          // Only pass createdAt if custom date is enabled
          ...(useCustomDate && currentStory.createdAt ? { createdAt: currentStory.createdAt } : {}),
        })
        notify(t('story.created'), 'success')
      } else {
        // Update story and sync photo order
        await updateStory(token, currentStory.id, {
          title: currentStory.title,
          content: currentStory.content,
          isPublished: currentStory.isPublished,
          coverPhotoId: currentStory.coverPhotoId ?? null,
          // Only pass createdAt if custom date is enabled
          ...(useCustomDate ? { createdAt: currentStory.createdAt } : {}),
        })
        // Sync photo order with server
        if (photoIds.length > 0) {
          await reorderStoryPhotos(token, currentStory.id, photoIds)
        }
        // Persist photo order to localStorage
        savePhotoOrder(currentStory.id, photoIds)
        notify(t('story.updated'), 'success')
      }
      // Clear draft after successful save
      const isNewStory = !stories.find((s) => s.id === currentStory.id)
      await clearDraft(isNewStory ? undefined : currentStory.id)

      pendingImages.forEach(p => URL.revokeObjectURL(p.previewUrl))
      setPendingImages([])
      setStoryEditMode('list')
      setCurrentStory(null)
      await loadStories()

      // Clear URL parameter after successful save
      if (window.location.search.includes('editStory=')) {
        router.replace('/admin/logs', { scroll: false })
      }
    } catch (err) {
      console.error('Failed to save story:', err)
      notify(t('story.save_failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmUpload(settings: UploadSettings) {
    if (!token || !currentStory) return
    setShowUploadSettings(false)
    setIsUploading(true)
    const toUpload = pendingImages.filter(p => p.status === 'pending' || p.status === 'failed')
    setUploadProgress({ current: 0, total: toUpload.length, currentFile: '' })
    const uploadedPhotoIds: string[] = []
    const uploadedPhotos: PhotoDto[] = []
    
    for (let i = 0; i < toUpload.length; i++) {
      const pending = toUpload[i]
      setUploadProgress({ current: i + 1, total: toUpload.length, currentFile: pending.file.name })
      setPendingImages(prev => prev.map(p => p.id === pending.id ? { ...p, status: 'uploading' as const, progress: 0 } : p))
      try {
        const fileToUpload = settings.maxSizeMB
          ? await compressImage(pending.file, { maxSizeMB: settings.maxSizeMB, maxWidthOrHeight: 4096 })
          : pending.file
        const photo = await uploadPhotoWithProgress({
          token,
          file: fileToUpload,
          title: pending.file.name.replace(/\.[^/.]+$/, ''),
          category: settings.category,
          storage_provider: settings.storageProvider,
          onProgress: (progress) => setPendingImages(prev => prev.map(p => p.id === pending.id ? { ...p, progress } : p))
        })
        uploadedPhotoIds.push(photo.id)
        uploadedPhotos.push(photo)
        setPendingImages(prev => prev.map(p => p.id === pending.id ? { ...p, status: 'success' as const, progress: 100, photoId: photo.id } : p))
      } catch (err) {
        setPendingImages(prev => prev.map(p => p.id === pending.id ? { ...p, status: 'failed' as const, error: err instanceof Error ? err.message : 'Upload failed' } : p))
      }
    }
    
    if (settings.albumId && uploadedPhotoIds.length > 0) {
      try { await addPhotosToAlbum(token, settings.albumId, uploadedPhotoIds) } catch {}
    }
    
    if (uploadedPhotos.length > 0) {
      const isNew = !stories.find((s) => s.id === currentStory.id)
      if (isNew) {
        setCurrentStory(prev => ({ ...prev!, photos: [...(prev?.photos || []), ...uploadedPhotos] }))
      } else {
        try {
          await addPhotosToStory(token, currentStory.id, uploadedPhotoIds)
          setCurrentStory(prev => ({ ...prev!, photos: [...(prev?.photos || []), ...uploadedPhotos] }))
        } catch {}
      }
    }
    
    setPendingImages(prev => {
      prev.filter(p => p.status === 'success').forEach(p => URL.revokeObjectURL(p.previewUrl))
      return prev.filter(p => p.status !== 'success')
    })
    setIsUploading(false)
    
    const failedCount = pendingImages.filter(p => p.status === 'failed').length
    if (failedCount === 0) {
      await doSaveStory()
    } else {
      notify(t('admin.some_uploads_failed') || `${failedCount} 张图片上传失败`, 'error')
    }
  }

  function handleRetryFailedUploads() {
    setPendingImages(prev => prev.map(p => p.status === 'failed' ? { ...p, status: 'pending' as const, error: undefined, progress: 0 } : p))
    setShowUploadSettings(true)
  }

  async function handleTogglePublish(story: StoryDto) {
    if (!token) return

    try {
      await updateStory(token, story.id, {
        isPublished: !story.isPublished,
      })
      notify(story.isPublished ? t('story.unpublished') : t('story.published'), 'success')
      await loadStories()
    } catch (err) {
      console.error('Failed to toggle publish:', err)
      notify(t('story.operation_failed'), 'error')
    }
  }

  function handleUpdatePhotos(selectedPhotoIds: string[]) {
    if (!currentStory) return
    
    // Get the photos in the selected order
    const selectedPhotos = selectedPhotoIds
      .map(id => allPhotos.find(p => p.id === id))
      .filter((p): p is PhotoDto => p !== undefined)
    
    // Always update local state only - save to server when clicking Save button
    setCurrentStory(prev => ({
      ...prev!,
      photos: selectedPhotos
    }))
    
    setShowPhotoSelector(false)
  }

  function handleRemovePhoto(photoId: string) {
    if (!currentStory) return
    setCurrentStory(prev => ({
      ...prev!,
      photos: prev?.photos?.filter(p => p.id !== photoId) || []
    }))
  }

  function handleSetCover(photoId: string) {
    if (!currentStory) return
    setCurrentStory(prev => ({
      ...prev!,
      coverPhotoId: photoId
    }))
  }

  // Unified drag handlers for photos and pending images
  function handleItemDragStart(e: React.DragEvent, itemId: string, type: 'photo' | 'pending') {
    setDraggedItemId(itemId)
    setDraggedItemType(type)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `${type}:${itemId}`)
    setTimeout(() => { (e.target as HTMLElement).style.opacity = '0.5' }, 0)
  }

  function handleItemDragEnd(e: React.DragEvent) {
    (e.target as HTMLElement).style.opacity = '1'
    setDraggedItemId(null)
    setDraggedItemType(null)
    setDragOverItemId(null)
  }

  function handleItemDragOver(e: React.DragEvent, itemId: string) {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (itemId !== draggedItemId) setDragOverItemId(itemId)
  }

  function handleItemDragLeave() {
    setDragOverItemId(null)
  }

  // Build combined list for ordering: photos first, then pending
  function getCombinedItems() {
    const photoItems = (currentStory?.photos || []).map(p => ({ id: p.id, type: 'photo' as const }))
    const pendingItems = pendingImages.map(p => ({ id: p.id, type: 'pending' as const }))
    return [...photoItems, ...pendingItems]
  }

  function handleItemDrop(e: React.DragEvent, targetId: string, targetType: 'photo' | 'pending') {
    e.preventDefault()
    e.stopPropagation()
    setDragOverItemId(null)
    if (!draggedItemId || !draggedItemType || (draggedItemId === targetId && draggedItemType === targetType)) return

    const combined = getCombinedItems()
    const draggedIdx = combined.findIndex(i => i.id === draggedItemId && i.type === draggedItemType)
    const targetIdx = combined.findIndex(i => i.id === targetId && i.type === targetType)
    if (draggedIdx === -1 || targetIdx === -1) return

    const [dragged] = combined.splice(draggedIdx, 1)
    combined.splice(targetIdx, 0, dragged)

    // Separate back into photos and pending - only update local state
    const newPhotoIds = combined.filter(i => i.type === 'photo').map(i => i.id)
    const newPendingIds = combined.filter(i => i.type === 'pending').map(i => i.id)

    const reorderedPhotos = newPhotoIds.map(id => currentStory?.photos?.find(p => p.id === id)).filter((p): p is PhotoDto => !!p)
    setCurrentStory(prev => prev ? { ...prev, photos: reorderedPhotos } : prev)

    const reorderedPending = newPendingIds.map(id => pendingImages.find(p => p.id === id)).filter((p): p is PendingImage => !!p)
    setPendingImages(reorderedPending)
  }

  const handleContentChange = useCallback((content: string) => {
    setCurrentStory(prev => prev ? { ...prev, content } : prev)
  }, [])

  // Get current photo IDs (for initial selection in modal)
  const currentPhotoIds = currentStory?.photos?.map(p => p.id) || []

  const handlePrevPhoto = () => {
    if (previewPhotoIndex === null || !currentStory?.photos) return
    setPreviewPhotoIndex(previewPhotoIndex > 0 ? previewPhotoIndex - 1 : currentStory.photos.length - 1)
  }

  const handleNextPhoto = () => {
    if (previewPhotoIndex === null || !currentStory?.photos) return
    setPreviewPhotoIndex(previewPhotoIndex < currentStory.photos.length - 1 ? previewPhotoIndex + 1 : 0)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  // Status filter options for stories
  const statusOptions: SelectOption[] = [
    { value: '', label: t('admin.all_status') || '全部状态' },
    { value: 'published', label: t('admin.published') || '已发布' },
    { value: 'draft', label: t('admin.draft') || '草稿' },
  ]

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      {storyEditMode === 'list' ? (
        <div className="space-y-8 flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border pb-4 flex-shrink-0">
            <div className="flex items-center gap-4">
              <input
                type="text"
                placeholder={t('admin.search_placeholder') || '搜索...'}
                className="px-3 py-2 text-sm bg-transparent border border-border rounded-md focus:border-primary outline-none w-48"
              />
              <AdminSelect
                value={statusFilter}
                options={statusOptions}
                onChange={setStatusFilter}
                placeholder={t('admin.all_status') || '全部状态'}
                className="w-32"
              />
            </div>
            <AdminButton
              onClick={handleCreateStory}
              adminVariant="primary"
              size="lg"
              className="flex items-center rounded-md"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('ui.create_story')}
            </AdminButton>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-1 gap-4">
              {stories
                .filter((story) => {
                  if (!statusFilter) return true
                  if (statusFilter === 'published') return story.isPublished
                  if (statusFilter === 'draft') return !story.isPublished
                  return true
                })
                .map((story) => (
                <div
                  key={story.id}
                  className="flex items-center justify-between p-6 border border-border hover:border-primary transition-all group rounded-lg"
                >
                  <div
                    className="flex-1 min-w-0"
                    onClick={() => handleEditStory(story)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="font-serif text-xl group-hover:text-primary transition-colors">
                        {story.title || t('story.untitled')}
                      </h4>
                      <span
                        className={`text-[8px] font-black uppercase px-1.5 py-0.5 border rounded ${
                          story.isPublished
                            ? 'border-primary text-primary bg-primary/10'
                            : 'border-muted-foreground text-muted-foreground'
                        }`}
                      >
                        {story.isPublished ? 'PUBLISHED' : 'DRAFT'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono uppercase">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />{' '}
                        {new Date(story.createdAt).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <History className="w-3 h-3" />{' '}
                        {new Date(story.updatedAt).toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {story.content.length}{' '}
                        {t('admin.characters')}
                      </span>
                      {story.photos && story.photos.length > 0 && (
                        <span className="flex items-center gap-1">
                          <ImageIcon className="w-3 h-3" /> {story.photos.length} {t('ui.photos_count')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <AdminButton
                      onClick={(e) => {
                        e.stopPropagation()
                        handleTogglePublish(story)
                      }}
                      adminVariant="iconPrimary"
                      title={story.isPublished ? t('story.unpublish') : t('story.publish')}
                    >
                      {story.isPublished ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </AdminButton>
                    <AdminButton
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEditStory(story)
                      }}
                      adminVariant="iconPrimary"
                    >
                      <Edit3 className="w-4 h-4" />
                    </AdminButton>
                    <AdminButton
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteStoryId(story.id)
                      }}
                      adminVariant="iconDestructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </AdminButton>
                  </div>
                </div>
              ))}
              {stories.length === 0 && (
                <div className="py-24 text-center border border-dashed border-border rounded-lg">
                  <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-10" />
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {t('ui.no_story')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Header - Back button, Draft status, and Save button */}
          <div className="flex items-center justify-between border-b border-border pb-4 flex-shrink-0">
            <div className="flex items-center gap-4">
              <AdminButton
                onClick={() => {
                  setStoryEditMode('list')
                  setCurrentStory(null)
                  setPendingImages([])
                  initialStoryRef.current = null
                  setIsDirty(false)
                  setUseCustomDate(false)
                  // Clear URL parameter when returning to list
                  if (window.location.search.includes('editStory=')) {
                    router.replace('/admin/logs', { scroll: false })
                  }
                }}
                adminVariant="link"
                className="flex items-center gap-2 hover:no-underline"
              >
                <ChevronLeft className="w-4 h-4" /> {t('admin.back_list')}
              </AdminButton>
              {/* Draft status indicator */}
              {draftSaved && (
                <span className="flex items-center gap-1 text-[10px] text-green-500">
                  <Check className="w-3 h-3" />
                  {t('story.draft_saved') || 'Saved'}
                </span>
              )}
              {!draftSaved && lastSavedAt && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                  <Clock className="w-3 h-3" />
                  {new Date(lastSavedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
            <AdminButton
              onClick={handleSaveStory}
              disabled={saving}
              adminVariant="primary"
              size="lg"
              className="flex items-center gap-2 rounded-md"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? t('ui.saving') : t('admin.save')}</span>
            </AdminButton>
          </div>

          {/* Main Content - Left/Right Layout */}
          <div className="flex-1 flex gap-4 overflow-hidden">
            {/* Left: Editor (70%) */}
            <div className="flex-[7] flex flex-col gap-4 overflow-hidden min-w-0">
              {/* Title Input */}
              <AdminInput
                type="text"
                value={currentStory?.title || ''}
                onChange={(e) =>
                  setCurrentStory((prev) => ({
                    ...prev!,
                    title: e.target.value,
                  }))
                }
                placeholder={t('story.title_placeholder')}
                className="text-xl md:text-2xl font-serif p-4 md:p-6"
              />
              
              {/* Publish Checkbox, Date, Character Count, and Preview Button */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-2">
                {/* Left: Publish Checkbox, Date, and Character Count */}
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentStory?.isPublished || false}
                      onChange={(e) =>
                        setCurrentStory((prev) => ({
                          ...prev!,
                          isPublished: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-primary cursor-pointer rounded"
                    />
                    <span className="text-xs font-bold uppercase tracking-widest">
                      {t('ui.publish_now')}
                    </span>
                  </label>
                  {/* Custom Date Toggle */}
                  <div className="flex items-center gap-2">
                    <AdminButton
                      onClick={() => setUseCustomDate(!useCustomDate)}
                      adminVariant="switch"
                      data-state={useCustomDate ? 'on' : 'off'}
                      title={t('admin.custom_date')}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${useCustomDate ? 'left-5' : 'left-0.5'}`}
                      />
                    </AdminButton>
                    <span className="text-xs text-muted-foreground font-bold uppercase tracking-widest">
                      {t('admin.custom_date')}
                    </span>
                  </div>
                  {useCustomDate && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        type="datetime-local"
                        value={currentStory?.createdAt ? new Date(currentStory.createdAt).toISOString().slice(0, 16) : ''}
                        onChange={(e) => {
                          const value = e.target.value
                          setCurrentStory((prev) => ({
                            ...prev!,
                            createdAt: value ? new Date(value).toISOString() : new Date().toISOString(),
                          }))
                        }}
                        className="px-2 py-1 text-xs font-mono bg-transparent border border-border rounded focus:border-primary outline-none"
                      />
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {currentStory?.content?.length || 0} {t('admin.characters')}
                  </span>
                </div>
                {/* Right: Preview Button */}
                <AdminButton
                  onClick={() => setShowPreview(true)}
                  adminVariant="unstyled"
                  className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-primary border border-primary/30 hover:bg-primary/10 rounded-md transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {t('admin.preview') || '预览'}
                </AdminButton>
              </div>
              
              {/* Content Area - WYSIWYG Editor */}
              <div className="flex-1 relative border border-border bg-card/30 rounded-lg overflow-hidden">
                {currentStory && (
                  <MilkdownEditor
                    key={currentStory.id}
                    ref={editorRef}
                    value={currentStory.content}
                    onChange={handleContentChange}
                    placeholder={t('ui.markdown_placeholder')}
                  />
                )}
              </div>
            </div>

            {/* Right: Photos Panel (30%) */}
            <StoryPhotoPanel
              currentStory={currentStory}
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
              onAddPhotos={() => setShowPhotoSelector(true)}
              onRemovePhoto={handleRemovePhoto}
              onRemovePendingImage={handleRemovePendingImage}
              onSetCover={(photoId) => { handleSetCover(photoId); setPendingCoverId(null) }}
              onSetPendingCover={(id) => { setPendingCoverId(id); setCurrentStory(prev => ({ ...prev!, coverPhotoId: undefined })) }}
              onSetPhotoDate={(takenAt) => { setCurrentStory(prev => ({ ...prev!, createdAt: takenAt })); setUseCustomDate(true) }}
              onRetryFailedUploads={handleRetryFailedUploads}
              onPhotoPanelDragOver={handlePhotoPanelDragOver}
              onPhotoPanelDragLeave={handlePhotoPanelDragLeave}
              onPhotoPanelDrop={handlePhotoPanelDrop}
              onItemDragStart={handleItemDragStart}
              onItemDragEnd={handleItemDragEnd}
              onItemDragOver={handleItemDragOver}
              onItemDragLeave={handleItemDragLeave}
              onItemDrop={handleItemDrop}
              onOpenMenuPhoto={setOpenMenuPhotoId}
              onOpenMenuPending={setOpenMenuPendingId}
            />
          </div>
        </div>
      )}

      <PhotoSelectorModal isOpen={showPhotoSelector} onClose={() => setShowPhotoSelector(false)} onConfirm={handleUpdatePhotos} initialSelectedPhotoIds={currentPhotoIds} t={t} />
      <ImageUploadSettingsModal isOpen={showUploadSettings} onClose={() => setShowUploadSettings(false)} onConfirm={handleConfirmUpload} pendingCount={pendingImages.filter(p => p.status === 'pending' || p.status === 'failed').length} t={t} token={token} />
      <SimpleDeleteDialog isOpen={!!deleteStoryId} onConfirm={confirmDeleteStory} onCancel={() => setDeleteStoryId(null)} t={t} />
      <DraftRestoreDialog
        isOpen={draftRestoreDialog.isOpen}
        draftTime={draftRestoreDialog.draft?.savedAt || 0}
        onRestore={handleDraftRestore}
        onDiscard={handleDraftDiscard}
        onCancel={handleDraftCancel}
        t={t}
      />

      {/* Preview Modal */}
      {showPreview && currentStory && (
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
      )}
    </div>
  )
}

