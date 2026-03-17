'use client'

import { useCallback, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { DragEvent } from 'react'
import ExifReader from 'exifreader'
import { compressImage } from '@/lib/image-compress'
import { stripGpsData } from '@/lib/privacy-strip'
import {
  addPhotosToAlbum,
  addPhotosToStory,
  uploadPhotoWithProgress,
  type PhotoDto,
  type StoryDto,
} from '@/lib/api'
import { buildStoryMarkdownImage } from '@/lib/story-rich-content'
import type { NarrativeTipTapEditorHandle } from '@/components/NarrativeTipTapEditor'
import type { PendingImage } from '@/components/admin/StoryPhotoPanel'
import type { UploadSettings } from '@/components/admin/ImageUploadSettingsModal'
import { STORY_PASTE_UPLOAD_SETTINGS_KEY, STORY_UPLOAD_SETTINGS_KEY } from './constants'
import type { UploadProgressState } from './types'
import { useStoryPasteUploads } from './useStoryPasteUploads'

interface UseStoryEditorActionsParams {
  token: string | null
  currentStory: StoryDto | null
  allPhotos: PhotoDto[]
  stories: StoryDto[]
  pendingImages: PendingImage[]
  initialUploadSettings: UploadSettings
  initialPasteUploadSettings: UploadSettings
  setCurrentStory: Dispatch<SetStateAction<StoryDto | null>>
  setAllPhotos: Dispatch<SetStateAction<PhotoDto[]>>
  setPendingImages: Dispatch<SetStateAction<PendingImage[]>>
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  t: (key: string) => string
  onRequestSave: () => Promise<void>
}

interface UseStoryEditorActionsResult {
  editorRef: MutableRefObject<NarrativeTipTapEditorHandle | null>
  showUploadSettings: boolean
  setShowUploadSettings: Dispatch<SetStateAction<boolean>>
  showPasteUploadSettings: boolean
  setShowPasteUploadSettings: Dispatch<SetStateAction<boolean>>
  isUploading: boolean
  uploadProgress: UploadProgressState
  pendingPasteFilesRef: MutableRefObject<File[] | null>
  uploadSettings: UploadSettings
  pasteUploadSettings: UploadSettings
  hasConfirmedPasteSettings: boolean
  handlePhotoPanelDrop: (event: DragEvent) => Promise<void>
  handleRemovePendingImage: (id: string) => void
  handleConfirmUpload: (settings: UploadSettings) => Promise<void>
  handleRetryFailedUploads: () => void
  handlePasteFiles: (files: File[]) => void
  handleConfirmPasteUpload: (settings: UploadSettings) => Promise<void>
  handleInsertPhotoMarkdown: (photo: PhotoDto) => void
  handleInsertGalleryMarkdown: (photoIds: string[]) => void
  handleInsertExternalPhotoMarkdown: () => void
  restoreUploadSettings: (settings: UploadSettings) => void
  restorePasteUploadSettings: (settings: UploadSettings) => void
}

async function readTakenAt(file: File) {
  try {
    const tags = await ExifReader.load(file)
    const dateTime = tags.DateTimeOriginal || tags.DateTime
    if (!dateTime?.description) return undefined

    const match = dateTime.description.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
    if (!match) return undefined

    const [, year, month, day, hour, minute, second] = match
    return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`
  } catch {
    return undefined
  }
}

export function useStoryEditorActions({
  token,
  currentStory,
  allPhotos,
  stories,
  pendingImages,
  initialUploadSettings,
  initialPasteUploadSettings,
  setCurrentStory,
  setAllPhotos,
  setPendingImages,
  notify,
  t,
  onRequestSave,
}: UseStoryEditorActionsParams): UseStoryEditorActionsResult {
  const editorRef = useRef<NarrativeTipTapEditorHandle>(null)
  const pendingPasteFilesRef = useRef<File[] | null>(null)

  const [showUploadSettings, setShowUploadSettings] = useState(false)
  const [showPasteUploadSettings, setShowPasteUploadSettings] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState>({ current: 0, total: 0, currentFile: '' })
  const [hasConfirmedPasteSettings, setHasConfirmedPasteSettings] = useState(false)
  const [uploadSettings, setUploadSettings] = useState<UploadSettings>(initialUploadSettings)
  const [pasteUploadSettings, setPasteUploadSettings] = useState<UploadSettings>(initialPasteUploadSettings)

  const persistUploadSettings = useCallback((settings: UploadSettings) => {
    setUploadSettings(settings)

    if (typeof window === 'undefined') return

    try {
      window.localStorage.setItem(STORY_UPLOAD_SETTINGS_KEY, JSON.stringify(settings))
    } catch (error) {
      console.error('Failed to persist upload settings:', error)
    }
  }, [])

  const persistPasteUploadSettings = useCallback((settings: UploadSettings) => {
    setPasteUploadSettings(settings)
    setHasConfirmedPasteSettings(true)

    if (typeof window === 'undefined') return

    try {
      window.localStorage.setItem(STORY_PASTE_UPLOAD_SETTINGS_KEY, JSON.stringify(settings))
    } catch (error) {
      console.error('Failed to persist paste upload settings:', error)
    }
  }, [])

  const restorePasteUploadSettings = useCallback((settings: UploadSettings) => {
    setPasteUploadSettings(settings)
    setHasConfirmedPasteSettings(true)
  }, [])

  const restoreUploadSettings = useCallback((settings: UploadSettings) => {
    setUploadSettings(settings)
  }, [])

  const insertDirective = useCallback((markdown: string) => {
    editorRef.current?.insertValue(markdown)
    const nextValue = editorRef.current?.getValue() || currentStory?.content || ''
    setCurrentStory((prev) => (prev ? { ...prev, content: nextValue } : prev))
  }, [currentStory?.content, setCurrentStory])

  const replaceEditorText = useCallback((searchValue: string, nextValue: string) => {
    editorRef.current?.replaceText(searchValue, nextValue)
    const latestValue = editorRef.current?.getValue() || currentStory?.content || ''
    setCurrentStory((prev) => (prev ? { ...prev, content: latestValue } : prev))
  }, [currentStory?.content, setCurrentStory])

  const addPhotoToCurrentStory = useCallback((photo: PhotoDto) => {
    setCurrentStory((prev) => {
      if (!prev) return prev
      if (prev.photos.some((item) => item.id === photo.id)) return prev
      return { ...prev, photos: [...prev.photos, photo] }
    })
  }, [setCurrentStory])

  const addPhotoToCache = useCallback((photo: PhotoDto) => {
    setAllPhotos((prev) => (prev.some((item) => item.id === photo.id) ? prev : [photo, ...prev]))
  }, [setAllPhotos])

  const { uploadAndInsertFiles } = useStoryPasteUploads({
    token: token || '',
    currentStory,
    allPhotos,
    notify,
    setAllPhotos,
    setUploadProgress,
    insertDirective,
    replaceEditorText,
    addPhotoToCache,
    addPhotoToCurrentStory,
    persistPasteUploadSettings,
    setShowPasteUploadSettings,
    setIsUploading,
    pendingPasteFilesRef,
  })

  const handlePhotoPanelDrop = useCallback(async (event: DragEvent) => {
    event.preventDefault()
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'))
    if (files.length === 0) return

    const newPending = await Promise.all(files.map(async (file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending' as const,
      progress: 0,
      takenAt: await readTakenAt(file),
    })))

    setPendingImages((prev) => [...prev, ...newPending])
  }, [setPendingImages])

  const handleRemovePendingImage = useCallback((id: string) => {
    setPendingImages((prev) => {
      const item = prev.find((image) => image.id === id)
      if (item) URL.revokeObjectURL(item.previewUrl)
      return prev.filter((image) => image.id !== id)
    })
  }, [setPendingImages])

  const handleConfirmUpload = useCallback(async (settings: UploadSettings) => {
    if (!token || !currentStory) return

    persistUploadSettings(settings)
    setShowUploadSettings(false)
    setIsUploading(true)
    const toUpload = pendingImages.filter((image) => image.status === 'pending' || image.status === 'failed')
    setUploadProgress({ current: 0, total: toUpload.length, currentFile: '' })

    const uploadedPhotoIds: string[] = []
    const uploadedPhotos: PhotoDto[] = []

    for (let index = 0; index < toUpload.length; index += 1) {
      const pending = toUpload[index]
      setUploadProgress({ current: index + 1, total: toUpload.length, currentFile: pending.file.name })
      setPendingImages((prev) => prev.map((image) => image.id === pending.id ? { ...image, status: 'uploading' as const, progress: 0 } : image))

      try {
        let fileToUpload = pending.file

        if (settings.stripGps) {
          fileToUpload = await stripGpsData(fileToUpload)
        }

        if (settings.compressionMode && settings.compressionMode !== 'none' && settings.maxSizeMB) {
          fileToUpload = await compressImage(fileToUpload, {
            mode: settings.compressionMode,
            maxSizeMB: settings.maxSizeMB,
            maxWidthOrHeight: 4096,
          })
        }

        const photo = await uploadPhotoWithProgress({
          token,
          file: fileToUpload,
          title: pending.file.name.replace(/\.[^/.]+$/, ''),
          category: settings.categories?.length ? settings.categories : settings.category,
          storage_provider: settings.storageProvider,
          storage_path: settings.storagePath,
          storage_path_full: settings.storagePathFull,
          onProgress: (progress) => {
            setPendingImages((prev) => prev.map((image) => image.id === pending.id ? { ...image, progress } : image))
          },
        })

        uploadedPhotoIds.push(photo.id)
        uploadedPhotos.push(photo)
        setPendingImages((prev) => prev.map((image) => image.id === pending.id ? { ...image, status: 'success' as const, progress: 100, photoId: photo.id } : image))
      } catch (error) {
        setPendingImages((prev) => prev.map((image) => image.id === pending.id ? { ...image, status: 'failed' as const, error: error instanceof Error ? error.message : 'Upload failed' } : image))
      }
    }

    if (settings.albumIds?.length && uploadedPhotoIds.length > 0) {
      for (const albumId of settings.albumIds) {
        try {
          await addPhotosToAlbum(token, albumId, uploadedPhotoIds)
        } catch {}
      }
    } else if (settings.albumId && uploadedPhotoIds.length > 0) {
      try {
        await addPhotosToAlbum(token, settings.albumId, uploadedPhotoIds)
      } catch {}
    }

    if (uploadedPhotos.length > 0) {
      const isNew = !stories.find((story) => story.id === currentStory.id)
      if (isNew) {
        setCurrentStory((prev) => (prev ? { ...prev, photos: [...(prev.photos || []), ...uploadedPhotos] } : prev))
      } else {
        try {
          await addPhotosToStory(token, currentStory.id, uploadedPhotoIds)
          setCurrentStory((prev) => (prev ? { ...prev, photos: [...(prev.photos || []), ...uploadedPhotos] } : prev))
        } catch {}
      }
    }

    setPendingImages((prev) => {
      prev.filter((image) => image.status === 'success').forEach((image) => URL.revokeObjectURL(image.previewUrl))
      return prev.filter((image) => image.status !== 'success')
    })
    setIsUploading(false)

    const failedCount = pendingImages.filter((image) => image.status === 'failed').length
    if (failedCount === 0) {
      await onRequestSave()
      return
    }

    notify(`${failedCount} ${t('admin.upload_failed_count')}`, 'error')
  }, [currentStory, notify, onRequestSave, pendingImages, persistUploadSettings, setCurrentStory, setPendingImages, stories, t, token])

  const handleRetryFailedUploads = useCallback(() => {
    setPendingImages((prev) => prev.map((image) => image.status === 'failed' ? { ...image, status: 'pending' as const, error: undefined, progress: 0 } : image))
    setShowUploadSettings(true)
  }, [setPendingImages])

  const handlePasteFiles = useCallback((files: File[]) => {
    if (!token || !currentStory) return

    if (!hasConfirmedPasteSettings) {
      pendingPasteFilesRef.current = files
      setShowPasteUploadSettings(true)
      return
    }

    void uploadAndInsertFiles(files, pasteUploadSettings)
  }, [currentStory, hasConfirmedPasteSettings, pasteUploadSettings, setShowPasteUploadSettings, token, uploadAndInsertFiles])

  const handleConfirmPasteUpload = useCallback(async (settings: UploadSettings) => {
    persistPasteUploadSettings({ ...settings, category: settings.category?.trim() || 'story-inline' })

    const files = pendingPasteFilesRef.current
    if (!files?.length) {
      setShowPasteUploadSettings(false)
      return
    }

    await uploadAndInsertFiles(files, settings)
  }, [persistPasteUploadSettings, uploadAndInsertFiles])

  const handleInsertPhotoMarkdown = useCallback((photo: PhotoDto) => {
    insertDirective(buildStoryMarkdownImage({ url: photo.url, alt: photo.title }))
    notify('Inserted Markdown image', 'success')
  }, [insertDirective, notify])

  const handleInsertGalleryMarkdown = useCallback((photoIds: string[]) => {
    if (photoIds.length === 0) {
      notify('No photos available to insert', 'info')
      return
    }

    const photosToInsert = photoIds
      .map((photoId) => currentStory?.photos?.find((photo) => photo.id === photoId))
      .filter((photo): photo is PhotoDto => Boolean(photo))

    if (photosToInsert.length === 0) {
      notify('No photos available to insert', 'info')
      return
    }

    const markdown = photosToInsert.map((photo) => buildStoryMarkdownImage({ url: photo.url, alt: photo.title }).trim()).join('\n\n')
    insertDirective(`\n${markdown}\n`)
    notify('Inserted Markdown gallery', 'success')
  }, [currentStory?.photos, insertDirective, notify])

  const handleInsertExternalPhotoMarkdown = useCallback(() => {
    const url = window.prompt('Enter external image URL (https)')
    if (!url) return

    const trimmedUrl = url.trim()
    if (!/^https:\/\//i.test(trimmedUrl)) {
      notify('External images must use an https URL', 'error')
      return
    }

    const caption = window.prompt('Enter image caption (optional)')?.trim() || ''
    insertDirective(buildStoryMarkdownImage({ url: trimmedUrl, alt: caption }))
    notify('Inserted external Markdown image', 'success')
  }, [insertDirective, notify])

  return {
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
    hasConfirmedPasteSettings,
    handlePhotoPanelDrop,
    handleRemovePendingImage,
    handleConfirmUpload,
    handleRetryFailedUploads,
    handlePasteFiles,
    handleConfirmPasteUpload,
    handleInsertPhotoMarkdown,
    handleInsertGalleryMarkdown,
    handleInsertExternalPhotoMarkdown,
    restoreUploadSettings,
    restorePasteUploadSettings,
  }
}

