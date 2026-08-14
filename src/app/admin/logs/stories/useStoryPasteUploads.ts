'use client'

import { useCallback } from 'react'
import { addPhotosToAlbum, type PhotoDto } from '@/lib/api'
import type { UploadSettings } from '@/components/admin/ImageUploadSettingsModal'
import { uploadStoryPhotoFile } from './uploadStoryPhotoFile'

interface UploadAndInsertParams {
  token: string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  setUploadProgress: React.Dispatch<React.SetStateAction<{ current: number; total: number; currentFile: string }>>
  insertUploadPlaceholder: (placeholder: { uploadId: string; fileName: string; imageWidth: number; imageHeight: number }) => void
  resolveUploadPlaceholder: (uploadId: string, photo: PhotoDto) => boolean
  failUploadPlaceholder: (uploadId: string) => void
  findExistingPhotoById: (photoId: string) => Promise<PhotoDto | null>
  addPhotoToCache: (photo: PhotoDto) => void
  addPhotoToCurrentStory: (photo: PhotoDto) => void
  persistPasteUploadSettings: (settings: UploadSettings) => void
  setShowPasteUploadSettings: React.Dispatch<React.SetStateAction<boolean>>
  setIsUploading: React.Dispatch<React.SetStateAction<boolean>>
  pendingPasteFilesRef: React.MutableRefObject<File[] | null>
}

type UseStoryPasteUploadsParams = UploadAndInsertParams

async function readImageDimensions(file: File) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      const dimensions = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      if (dimensions.width > 0 && dimensions.height > 0) return dimensions
    } catch {
      // Fall through to the object URL path for older browsers and uncommon formats.
    }
  }

  return await new Promise<{ width: number; height: number }>((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    const finish = (dimensions: { width: number; height: number }) => {
      URL.revokeObjectURL(objectUrl)
      resolve(dimensions)
    }
    image.onload = () => finish({ width: image.naturalWidth || 4, height: image.naturalHeight || 3 })
    image.onerror = () => finish({ width: 4, height: 3 })
    image.src = objectUrl
  })
}

export function useStoryPasteUploads({
  token,
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
}: UseStoryPasteUploadsParams) {
  const uploadAndInsertFiles = useCallback(async (files: File[], settings: UploadSettings) => {
    if (files.length === 0) return

    const nextSettings: UploadSettings = {
      ...settings,
      categories: settings.categories || [],
    }

    const placeholders = await Promise.all(files.map(async (file) => {
      const id = crypto.randomUUID()
      const { width: imageWidth, height: imageHeight } = await readImageDimensions(file)
      return {
        id,
        file,
        imageWidth,
        imageHeight,
      }
    }))

    placeholders.forEach((item) => insertUploadPlaceholder({
      uploadId: item.id,
      fileName: item.file.name,
      imageWidth: item.imageWidth,
      imageHeight: item.imageHeight,
    }))
    persistPasteUploadSettings(nextSettings)
    setShowPasteUploadSettings(false)
    pendingPasteFilesRef.current = null
    setIsUploading(true)
    setUploadProgress({ current: 0, total: files.length, currentFile: '' })

    let successCount = 0
    let failedCount = 0

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]
        const placeholder = placeholders[index]

        try {
          setUploadProgress({ current: index + 1, total: files.length, currentFile: file.name })

          const { photo: uploadedPhoto, reusedDuplicate } = await uploadStoryPhotoFile({
          token,
          file,
          settings: nextSettings,
          findExistingPhotoById,
          onProgress: (progress) => {
            setUploadProgress({ current: index + 1, total: files.length, currentFile: `${file.name} ${progress}%` })
          },
          })

          addPhotoToCache(uploadedPhoto)
          addPhotoToCurrentStory(uploadedPhoto)
          if (!resolveUploadPlaceholder(placeholder.id, uploadedPhoto)) {
            throw new Error('图片已上传，但编辑器占位替换失败')
          }
          successCount += 1
          if (reusedDuplicate) notify(`复用重复图片：${uploadedPhoto.title}`, 'info')

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
        } catch (error) {
          failedCount += 1
          failUploadPlaceholder(placeholder.id)
          const message = error instanceof Error ? error.message : '粘贴图片处理失败'
          console.error(`Failed to process pasted image ${file.name}:`, error)
          notify(`${file.name}：${message}`, 'error')
        }
      }

      if (successCount > 0) {
        notify(failedCount > 0 ? `已插入 ${successCount} 张图片，${failedCount} 张失败` : '粘贴图片已处理并插入正文', failedCount > 0 ? 'info' : 'success')
      }
    } finally {
      setIsUploading(false)
      setUploadProgress({ current: 0, total: 0, currentFile: '' })
    }
  }, [
    addPhotoToCache,
    addPhotoToCurrentStory,
    failUploadPlaceholder,
    findExistingPhotoById,
    insertUploadPlaceholder,
    notify,
    pendingPasteFilesRef,
    persistPasteUploadSettings,
    resolveUploadPlaceholder,
    setIsUploading,
    setShowPasteUploadSettings,
    setUploadProgress,
    token,
  ])

  return { uploadAndInsertFiles }
}
