'use client'

import { useCallback, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { DragEvent } from 'react'
import ExifReader from 'exifreader'
import { resolveAssetUrl } from '@/lib/api/core'
import {
  addPhotosToAlbum,
  addPhotosToStory,
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
import { uploadStoryPhotoFile } from './uploadStoryPhotoFile'
import { GetAllPhotos } from '../../../../wailsjs/go/main/App'

interface UseStoryEditorActionsParams {
  token: string | null
  currentStory: StoryDto | null
  allPhotos: PhotoDto[]
  stories: StoryDto[]
  pendingImages: PendingImage[]
  cdnDomain?: string
  initialUploadSettings: UploadSettings
  initialPasteUploadSettings: UploadSettings
  pendingPhotoIdsRef: MutableRefObject<string[] | null>
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
  cdnDomain,
  initialUploadSettings,
  initialPasteUploadSettings,
  pendingPhotoIdsRef,
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
  }, [])

  const restoreUploadSettings = useCallback((settings: UploadSettings) => {
    setUploadSettings(settings)
  }, [])

  const insertDirective = useCallback((markdown: string) => {
    editorRef.current?.insertValue(markdown)
    const nextValue = editorRef.current?.getValue() || currentStory?.content || ''
    const nextJsonValue = editorRef.current?.getJsonValue() ?? currentStory?.contentJson ?? null
    setCurrentStory((prev) => (prev ? { ...prev, content: nextValue, contentJson: nextJsonValue } : prev))
  }, [currentStory?.content, currentStory?.contentJson, setCurrentStory])

  const syncEditorContent = useCallback(() => {
    const latestValue = editorRef.current?.getValue() || currentStory?.content || ''
    const latestJsonValue = editorRef.current?.getJsonValue() ?? currentStory?.contentJson ?? null
    setCurrentStory((prev) => (prev ? { ...prev, content: latestValue, contentJson: latestJsonValue } : prev))
  }, [currentStory?.content, currentStory?.contentJson, setCurrentStory])

  const insertUploadPlaceholder = useCallback((placeholder: {
    uploadId: string
    fileName: string
    imageWidth: number
    imageHeight: number
  }) => {
    editorRef.current?.insertImageUploadPlaceholder(placeholder)
    syncEditorContent()
  }, [syncEditorContent])

  const resolveUploadPlaceholder = useCallback((uploadId: string, photo: PhotoDto) => {
    const resolved = editorRef.current?.resolveImageUploadPlaceholder(uploadId, {
      src: resolveAssetUrl(photo.url, cdnDomain),
      alt: photo.title,
      photoId: photo.id,
    }) ?? false
    syncEditorContent()
    return resolved
  }, [cdnDomain, syncEditorContent])

  const failUploadPlaceholder = useCallback((uploadId: string) => {
    editorRef.current?.failImageUploadPlaceholder(uploadId)
    syncEditorContent()
  }, [syncEditorContent])

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

  const findExistingPhotoById = useCallback(async (photoId: string) => {
    const cachedPhoto = currentStory?.photos.find((photo) => photo.id === photoId)
      || allPhotos.find((photo) => photo.id === photoId)

    if (cachedPhoto) {
      return cachedPhoto
    }

    const photos = await GetAllPhotos() as unknown as PhotoDto[]
    setAllPhotos(photos || [])
    return (photos || []).find((photo: PhotoDto) => photo.id === photoId) ?? null
  }, [allPhotos, currentStory?.photos, setAllPhotos])

  const { uploadAndInsertFiles } = useStoryPasteUploads({
    token: token || '',
    notify,
    setUploadProgress,
    insertUploadPlaceholder,
    resolveUploadPlaceholder,
    failUploadPlaceholder,
    findExistingPhotoById,
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
        const { photo, reusedDuplicate } = await uploadStoryPhotoFile({
          token,
          file: pending.file,
          settings,
          findExistingPhotoById,
          onProgress: (progress) => {
            setPendingImages((prev) => prev.map((image) => image.id === pending.id ? { ...image, progress } : image))
          },
        })

        if (!uploadedPhotoIds.includes(photo.id)) {
          uploadedPhotoIds.push(photo.id)
        }
        if (!uploadedPhotos.some((item) => item.id === photo.id)) {
          uploadedPhotos.push(photo)
        }
        setPendingImages((prev) => prev.map((image) => image.id === pending.id ? { ...image, status: 'success' as const, progress: 100, photoId: photo.id } : image))
        if (reusedDuplicate) {
          addPhotoToCache(photo)
          notify(`图片已存在，已复用：${photo.title}`, 'info')
        }
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
        setCurrentStory((prev) => {
          if (!prev) return prev
          const existingIds = new Set((prev.photos || []).map((photo) => photo.id))
          const nextPhotos = uploadedPhotos.filter((photo) => !existingIds.has(photo.id))
          return nextPhotos.length > 0 ? { ...prev, photos: [...(prev.photos || []), ...nextPhotos] } : prev
        })
      } else {
        try {
          const existingIds = new Set((currentStory.photos || []).map((photo) => photo.id))
          const newPhotoIds = uploadedPhotoIds.filter((photoId) => !existingIds.has(photoId))
          if (newPhotoIds.length > 0) {
            await addPhotosToStory(token, currentStory.id, newPhotoIds)
          }
          setCurrentStory((prev) => {
            if (!prev) return prev
            const currentIds = new Set((prev.photos || []).map((photo) => photo.id))
            const nextPhotos = uploadedPhotos.filter((photo) => !currentIds.has(photo.id))
            return nextPhotos.length > 0 ? { ...prev, photos: [...(prev.photos || []), ...nextPhotos] } : prev
          })
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
      // Pass uploaded photo IDs via ref so doSaveStory can merge them
      // (setCurrentStory hasn't re-rendered yet, so the closure state is stale)
      pendingPhotoIdsRef.current = uploadedPhotoIds
      await onRequestSave()
      return
    }

    notify(`${failedCount} ${t('admin.upload_failed_count')}`, 'error')
  }, [addPhotoToCache, currentStory, findExistingPhotoById, notify, onRequestSave, pendingImages, persistUploadSettings, setCurrentStory, setPendingImages, stories, t, token])

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
    persistPasteUploadSettings({ ...settings, category: settings.category?.trim() || '' })

    const files = pendingPasteFilesRef.current
    if (!files?.length) {
      setShowPasteUploadSettings(false)
      return
    }

    await uploadAndInsertFiles(files, settings)
  }, [persistPasteUploadSettings, uploadAndInsertFiles])

  const handleInsertPhotoMarkdown = useCallback((photo: PhotoDto) => {
    addPhotoToCurrentStory(photo)
    if (!photo.url) {
      notify('Photo URL is unavailable', 'error')
      return
    }
    insertDirective(buildStoryMarkdownImage({ url: photo.url, alt: photo.title, photoId: photo.id }))
    notify('Inserted Markdown image', 'success')
  }, [addPhotoToCurrentStory, insertDirective, notify])

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

    const markdown = photosToInsert
      .filter((photo) => Boolean(photo.url))
      .map((photo) => buildStoryMarkdownImage({ url: photo.url!, alt: photo.title, photoId: photo.id }).trim())
      .join('\n\n')
    if (!markdown) {
      notify('Photo URL is unavailable', 'error')
      return
    }
    insertDirective(`\n${markdown}\n`)
    notify('Inserted Markdown gallery', 'success')
  }, [currentStory?.photos, insertDirective, notify])

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
    restoreUploadSettings,
    restorePasteUploadSettings,
  }
}

