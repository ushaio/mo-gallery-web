'use client'

import { useCallback } from 'react'
import { compressImage } from '@/lib/image-compress'
import { calculateFileHash } from '@/lib/file-hash'
import { stripGpsData } from '@/lib/privacy-strip'
import {
  addPhotosToAlbum,
  checkDuplicatePhoto,
  getPhotos,
  uploadPhotoWithProgress,
  type PhotoDto,
  type StoryDto,
} from '@/lib/api'
import { buildStoryMarkdownImage } from '@/lib/story-rich-content'
import type { UploadSettings } from '@/components/admin/ImageUploadSettingsModal'

interface UploadAndInsertParams {
  token: string
  currentStory: StoryDto | null
  allPhotos: PhotoDto[]
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  setAllPhotos: React.Dispatch<React.SetStateAction<PhotoDto[]>>
  setUploadProgress: React.Dispatch<React.SetStateAction<{ current: number; total: number; currentFile: string }>>
  insertDirective: (markdown: string) => void
  replaceEditorText: (searchValue: string, nextValue: string) => void
  addPhotoToCache: (photo: PhotoDto) => void
  addPhotoToCurrentStory: (photo: PhotoDto) => void
  persistPasteUploadSettings: (settings: UploadSettings) => void
  setShowPasteUploadSettings: React.Dispatch<React.SetStateAction<boolean>>
  setIsUploading: React.Dispatch<React.SetStateAction<boolean>>
  pendingPasteFilesRef: React.MutableRefObject<File[] | null>
}

type UseStoryPasteUploadsParams = UploadAndInsertParams

export function useStoryPasteUploads({
  token,
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
}: UseStoryPasteUploadsParams) {
  const buildPasteUploadPlaceholder = useCallback((id: string, fileName: string) => {
    return `\n<!-- story-paste-upload:${id} -->\n![正在上传 ${fileName}...](uploading://${id})\n`
  }, [])

  const uploadAndInsertFiles = useCallback(async (files: File[], settings: UploadSettings) => {
    if (files.length === 0) return

    const nextSettings: UploadSettings = {
      ...settings,
      categories: settings.categories || [],
    }

    const placeholders = files.map((file) => {
      const id = crypto.randomUUID()
      return { id, file, text: buildPasteUploadPlaceholder(id, file.name) }
    })

    placeholders.forEach((item) => insertDirective(item.text))
    persistPasteUploadSettings(nextSettings)
    setShowPasteUploadSettings(false)
    pendingPasteFilesRef.current = null
    setIsUploading(true)
    setUploadProgress({ current: 0, total: files.length, currentFile: '' })

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]
        const placeholder = placeholders[index]
        setUploadProgress({ current: index + 1, total: files.length, currentFile: file.name })

        const fileHash = await calculateFileHash(file)
        const duplicate = await checkDuplicatePhoto(token, fileHash)

        if (duplicate.isDuplicate && duplicate.existingPhoto) {
          const existingPhotoId = duplicate.existingPhoto.id
          let existingPhoto =
            currentStory?.photos.find((photo) => photo.id === existingPhotoId) ||
            allPhotos.find((photo) => photo.id === existingPhotoId)

          if (!existingPhoto) {
            const photos = await getPhotos({ all: true })
            existingPhoto = photos.find((photo) => photo.id === existingPhotoId)
            setAllPhotos(photos)
          }

          if (existingPhoto) {
            addPhotoToCache(existingPhoto)
            addPhotoToCurrentStory(existingPhoto)
            replaceEditorText(placeholder.text, buildStoryMarkdownImage({ url: existingPhoto.url, alt: existingPhoto.title }))
            notify(`复用重复图片：${existingPhoto.title}`, 'info')
            continue
          }
        }

        let fileToUpload = file

        if (nextSettings.stripGps) {
          fileToUpload = await stripGpsData(fileToUpload)
        }

        if (nextSettings.compressionMode && nextSettings.compressionMode !== 'none' && nextSettings.maxSizeMB) {
          fileToUpload = await compressImage(fileToUpload, {
            mode: nextSettings.compressionMode,
            maxSizeMB: nextSettings.maxSizeMB,
            maxWidthOrHeight: 4096,
          })
        }

        const uploadedPhoto = await uploadPhotoWithProgress({
          token,
          file: fileToUpload,
          title: file.name.replace(/\.[^/.]+$/, ''),
          category: nextSettings.categories,
          storage_provider: nextSettings.storageProvider,
          storage_source_id: nextSettings.storageSourceId,
          storage_path: nextSettings.storagePath,
          storage_path_full: nextSettings.storagePathFull,
          file_hash: fileHash,
          onProgress: (progress) => {
            setUploadProgress({ current: index + 1, total: files.length, currentFile: `${file.name} ${progress}%` })
          },
        })

        if (nextSettings.albumIds?.length) {
          for (const albumId of nextSettings.albumIds) {
            try {
              await addPhotosToAlbum(token, albumId, [uploadedPhoto.id])
            } catch (error) {
              console.error('Failed to add pasted upload to album:', error)
            }
          }
        } else if (nextSettings.albumId) {
          try {
            await addPhotosToAlbum(token, nextSettings.albumId, [uploadedPhoto.id])
          } catch (error) {
            console.error('Failed to add pasted upload to album:', error)
          }
        }

        addPhotoToCache(uploadedPhoto)
        addPhotoToCurrentStory(uploadedPhoto)
        replaceEditorText(placeholder.text, buildStoryMarkdownImage({ url: uploadedPhoto.url, alt: uploadedPhoto.title }))
      }

      notify('粘贴图片已处理并插入正文', 'success')
    } catch (error) {
      console.error('Failed to handle pasted files:', error)
      notify(error instanceof Error ? error.message : '粘贴图片处理失败', 'error')
    } finally {
      setIsUploading(false)
      setUploadProgress({ current: 0, total: 0, currentFile: '' })
    }
  }, [
    addPhotoToCache,
    addPhotoToCurrentStory,
    allPhotos,
    buildPasteUploadPlaceholder,
    currentStory?.photos,
    insertDirective,
    notify,
    pendingPasteFilesRef,
    persistPasteUploadSettings,
    replaceEditorText,
    setAllPhotos,
    setIsUploading,
    setShowPasteUploadSettings,
    setUploadProgress,
    token,
  ])

  return { uploadAndInsertFiles }
}
