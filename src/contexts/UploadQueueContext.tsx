'use client'

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { uploadPhotoWithProgress } from '@/lib/api/photos'
import { addPhotosToAlbum } from '@/lib/api/albums'
import { addPhotosToStory } from '@/lib/api/stories'
import { addPhotosToFilmRoll } from '@/lib/api/film-rolls'
import { compressImage, CompressionMode, convertImageToJpeg, extractExifToJson, stripGpsFromExifJson } from '@/lib/image-compress'

export type UploadTaskStatus = 'pending' | 'compressing' | 'uploading' | 'completed' | 'failed'

export interface UploadTask {
  id: string
  file: File
  fileName: string
  fileSize: number
  originalSize: number // Original file size before compression
  compressedSize?: number // Size after compression
  targetFileName?: string
  targetFileSize?: number
  targetFileType?: string
  preview: string | null
  status: UploadTaskStatus
  progress: number
  error: string | null
  retryCount?: number
  // Upload params
  title: string
  categories: string[]
  storageProvider?: string
  storageSourceId?: string
  storagePath?: string
  storagePathFull?: boolean
  storyId?: string
  albumIds?: string[]
  filmRollId?: string
  showFlag?: boolean
  fileHash?: string // Original file hash for duplicate detection
  batchId: string // Unique batch identifier
  // Compression settings
  compressionMode?: CompressionMode
  maxSizeMB?: number
  maxWidthOrHeight?: number
  // Privacy: strip GPS from EXIF before upload
  stripGps?: boolean
  // Result
  photoId?: string
}

interface UploadQueueContextType {
  tasks: UploadTask[]
  isMinimized: boolean
  setIsMinimized: (value: boolean) => void
  addTasks: (params: {
    files: { id: string; file: File; fileHash?: string }[]
    title: string
    categories: string[]
    storageProvider?: string
    storageSourceId?: string
    storagePath?: string
    storagePathFull?: boolean
    storyId?: string
    albumIds?: string[]
    filmRollId?: string
    showFlag?: boolean
    compressionMode?: CompressionMode
    maxSizeMB?: number
    maxWidthOrHeight?: number
    stripGps?: boolean
    token: string
  }) => void
  retryTask: (taskId: string, token: string) => void
  removeTask: (taskId: string) => void
  clearCompleted: () => void
  clearAll: () => void
}

const UploadQueueContext = createContext<UploadQueueContextType | null>(null)

export function useUploadQueue() {
  const context = useContext(UploadQueueContext)
  if (!context) {
    throw new Error('useUploadQueue must be used within UploadQueueProvider')
  }
  return context
}

const CONCURRENCY = 4
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 2000
const AVIF_FILE_TYPE = 'image/avif'
const AVIF_EXTENSION = '.avif'
const RETRYABLE_ERROR_PATTERNS = [
  /^Network error/i,
  /^Upload timeout/i,
  /^Failed to fetch/i,
  /TypeError/i,
  /network/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
]

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return RETRYABLE_ERROR_PATTERNS.some((p) => p.test(err.message))
}

function replaceFileExtension(filename: string, extension: string) {
  return filename.replace(/\.[^.]*$/, '') + extension
}

function getFilenameFromStorageValue(value: string | null | undefined) {
  if (!value) return undefined
  try {
    const pathname = /^https?:\/\//i.test(value) ? new URL(value).pathname : value
    const normalized = pathname.replace(/\\/g, '/')
    const filename = normalized.split('/').filter(Boolean).pop()
    return filename || undefined
  } catch {
    const normalized = value.replace(/\\/g, '/')
    return normalized.split('/').filter(Boolean).pop() || undefined
  }
}

function inferFileTypeFromName(filename: string | undefined, fallback?: string) {
  const extension = filename?.split('.').pop()?.toLowerCase()
  switch (extension) {
    case 'avif':
      return 'image/avif'
    case 'webp':
      return 'image/webp'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    default:
      return fallback
  }
}

export function UploadQueueProvider({
  children,
  onUploadComplete,
}: {
  children: React.ReactNode
  onUploadComplete?: (photoIds: string[], storyId?: string, albumIds?: string[], failedCount?: number) => void
}) {
  const [tasks, setTasks] = useState<UploadTask[]>([])
  const [isMinimized, setIsMinimized] = useState(false)
  const activeUploadsRef = useRef(0)
  const tokenRef = useRef<string>('')
  const onUploadCompleteRef = useRef(onUploadComplete)
  const notifiedBatchesRef = useRef<Set<string>>(new Set())
  const uploadingTasksRef = useRef<Set<string>>(new Set()) // Track tasks currently being uploaded

  // Keep the ref updated
  useEffect(() => {
    onUploadCompleteRef.current = onUploadComplete
  }, [onUploadComplete])

  const createPreview = (file: File): Promise<string | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    })
  }

  const updateTaskProgress = useCallback((taskId: string, progress: number, status?: UploadTaskStatus) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, progress, ...(status && { status }) } : t
      )
    )
  }, [])

  const notifyBatchComplete = useCallback(async (batchId: string, storyId: string | undefined, albumIds: string[] | undefined, filmRollId: string | undefined, photoIds: string[], failedCount: number) => {
    // Double-check we haven't already notified for this batch
    if (notifiedBatchesRef.current.has(batchId)) {
      return
    }
    notifiedBatchesRef.current.add(batchId)

    // If storyId is provided, add photos to the story
    if (storyId && photoIds.length > 0 && tokenRef.current) {
      try {
        await addPhotosToStory(tokenRef.current, storyId, photoIds)
      } catch (err) {
        console.error(`Failed to add photos to story ${storyId}:`, err)
      }
    }

    // If albumIds are provided, add photos to each album in parallel
    if (albumIds && albumIds.length > 0 && photoIds.length > 0 && tokenRef.current) {
      await Promise.all(
        albumIds.map(async (albumId) => {
          try {
            await addPhotosToAlbum(tokenRef.current, albumId, photoIds)
          } catch (err) {
            console.error(`Failed to add photos to album ${albumId}:`, err)
          }
        })
      )
    }

    // If filmRollId is provided, add photos to the film roll
    if (filmRollId && photoIds.length > 0 && tokenRef.current) {
      try {
        await addPhotosToFilmRoll(tokenRef.current, filmRollId, photoIds)
      } catch (err) {
        console.error(`Failed to add photos to film roll ${filmRollId}:`, err)
      }
    }

    if ((photoIds.length > 0 || failedCount > 0) && onUploadCompleteRef.current) {
      onUploadCompleteRef.current(photoIds, storyId, albumIds, failedCount)
    }
  }, [])

  const processQueue = useCallback(() => {
    setTasks((currentTasks) => {
      const pendingTasks = currentTasks.filter(
        (t) => t.status === 'pending' && !uploadingTasksRef.current.has(t.id)
      )
      const availableSlots = CONCURRENCY - activeUploadsRef.current

      if (availableSlots <= 0 || pendingTasks.length === 0) {
        return currentTasks
      }

      const tasksToStart = pendingTasks.slice(0, availableSlots)
      activeUploadsRef.current += tasksToStart.length

      // Mark tasks as uploading to prevent duplicate uploads
      tasksToStart.forEach((task) => {
        uploadingTasksRef.current.add(task.id)
        uploadSingleFile(task)
      })

      return currentTasks.map((t) =>
        tasksToStart.some((ts) => ts.id === t.id)
          ? {
              ...t,
              status: (t.compressionMode && t.compressionMode !== 'none'
                ? 'compressing'
                : 'uploading') as UploadTaskStatus,
              progress: 0,
            }
          : t
      )
    })
  }, [])

  const uploadSingleFile = async (task: UploadTask) => {
    try {
      let fileToUpload = task.file
      let compressedSize: number | undefined
      const shouldCompress = task.compressionMode && task.compressionMode !== 'none'

      const latestToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      if (latestToken) tokenRef.current = latestToken

      // Extract EXIF from the original file before compression (compression
      // discards EXIF). GPS is stripped from the JSON here when enabled;
      // the server also strips GPS as a fallback via strip_gps.
      let exifJsonString: string | undefined
      try {
        let exifJson = await extractExifToJson(task.file)
        if (task.stripGps) {
          exifJson = stripGpsFromExifJson(exifJson)
        }
        if (Object.keys(exifJson).length > 0) {
          exifJsonString = JSON.stringify(exifJson)
        }
      } catch {
        // EXIF read failure should not block upload
      }

      // Step 1: Convert unsupported browser-upload formats if needed, then compress
      if (fileToUpload.type === 'image/bmp') {
        fileToUpload = await convertImageToJpeg(fileToUpload)
        compressedSize = fileToUpload.size
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  compressedSize,
                  fileSize: compressedSize!,
                  targetFileName: fileToUpload.name,
                  targetFileSize: compressedSize,
                  targetFileType: fileToUpload.type,
                }
              : t
          )
        )
      }

      if (shouldCompress) {
        try {
          fileToUpload = await compressImage(
            fileToUpload,
            { mode: task.compressionMode, maxSizeMB: task.maxSizeMB, maxWidthOrHeight: task.maxWidthOrHeight },
            (progress) => {
              updateTaskProgress(task.id, Math.round(progress * 0.3))
            }
          )
          compressedSize = fileToUpload.size

          // Update compressed size info
          setTasks((prev) =>
            prev.map((t) =>
              t.id === task.id
                ? {
                    ...t,
                    compressedSize,
                    fileSize: compressedSize!,
                    targetFileSize: compressedSize,
                    targetFileType: AVIF_FILE_TYPE,
                  }
                : t
            )
          )
        } catch (compressError) {
          const message =
            compressError instanceof Error && compressError.message
              ? compressError.message
              : 'Image compression failed'
          console.warn(`[upload] Compression failed for ${task.fileName}, falling back to original: ${message}`)
          compressedSize = fileToUpload.size
          setTasks((prev) =>
            prev.map((t) =>
              t.id === task.id
                ?                 {
                    ...t,
                    compressedSize: undefined,
                    fileSize: fileToUpload.size,
                    targetFileSize: fileToUpload.size,
                    targetFileType: AVIF_FILE_TYPE,
                    error: null,
                  }
                : t
            )
          )
        }
      }

      // Step 2: Upload (progress mapped from 30% to 100% if browser compression ran, else 0% to 100%)
      const browserCompressed = task.compressionMode && task.compressionMode !== 'none'
      const uploadProgressOffset = browserCompressed ? 30 : 0
      const uploadProgressRange = 100 - uploadProgressOffset

      const photo = await uploadPhotoWithProgress({
        token: tokenRef.current,
        file: fileToUpload,
        title: task.title,
        category: task.categories,
        storage_provider: task.storageProvider,
        storage_source_id: task.storageSourceId,
        storage_path: task.storagePath,
        storage_path_full: task.storagePathFull,
        file_hash: task.fileHash,
        film_roll_id: task.filmRollId,
        show_flag: task.showFlag,
        compression_mode: task.compressionMode,
        max_size_mb: task.maxSizeMB,
        exif_json: exifJsonString,
        strip_gps: task.stripGps ? 'true' : undefined,
        onProgress: (progress) => {
          const mappedProgress = Math.round(uploadProgressOffset + (progress / 100) * uploadProgressRange)
          updateTaskProgress(task.id, mappedProgress, 'uploading')
        },
      })

      // Update task status and check batch completion
      setTasks((prev) => {
        const updated = prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                status: 'completed' as UploadTaskStatus,
                progress: 100,
                photoId: photo.id,
                targetFileName: getFilenameFromStorageValue(photo.storageKey || photo.url) ?? t.targetFileName ?? fileToUpload.name,
                targetFileSize: photo.size ?? t.targetFileSize ?? fileToUpload.size,
                targetFileType: inferFileTypeFromName(photo.storageKey || photo.url, t.targetFileType ?? fileToUpload.type),
                compressedSize: photo.size ?? t.compressedSize,
                fileSize: photo.size ?? t.fileSize,
              }
            : t
        )

        // Check if this batch is complete
        const batchTasks = updated.filter((t) => t.batchId === task.batchId)
        const allDone = batchTasks.every((t) => t.status === 'completed' || t.status === 'failed')

        if (allDone && !notifiedBatchesRef.current.has(task.batchId)) {
          const completedTasks = batchTasks.filter((t) => t.status === 'completed')
          const failedTasks = batchTasks.filter((t) => t.status === 'failed')
          const photoIds = completedTasks
            .map((t) => t.photoId)
            .filter((id): id is string => !!id)

          // Schedule notification outside of setState
          setTimeout(() => {
            notifyBatchComplete(task.batchId, task.storyId, task.albumIds, task.filmRollId, photoIds, failedTasks.length)
          }, 0)
        }

        return updated
      })
    } catch (err) {
      const currentRetry = task.retryCount ?? 0
      const canRetry = isRetryableError(err) && currentRetry < MAX_RETRIES

      if (canRetry) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  status: 'pending' as UploadTaskStatus,
                  error: `Retry ${currentRetry + 1}/${MAX_RETRIES}...`,
                  progress: 0,
                  retryCount: currentRetry + 1,
                }
              : t
          )
        )
        setTimeout(processQueue, RETRY_DELAY_MS)
      } else {
        setTasks((prev) => {
          const updated = prev.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  status: 'failed' as UploadTaskStatus,
                  error: err instanceof Error ? err.message : 'Upload failed',
                }
              : t
          )

          // Check if this batch is complete (all done, even with failures)
          const batchTasks = updated.filter((t) => t.batchId === task.batchId)
          const allDone = batchTasks.every((t) => t.status === 'completed' || t.status === 'failed')

          if (allDone && !notifiedBatchesRef.current.has(task.batchId)) {
            const completedTasks = batchTasks.filter((t) => t.status === 'completed')
            const failedTasks = batchTasks.filter((t) => t.status === 'failed')
            const photoIds = completedTasks
              .map((t) => t.photoId)
              .filter((id): id is string => !!id)

            if (photoIds.length > 0 || failedTasks.length > 0) {
              setTimeout(() => {
                notifyBatchComplete(task.batchId, task.storyId, task.albumIds, task.filmRollId, photoIds, failedTasks.length)
              }, 0)
            }
          }

          return updated
        })
      }
    } finally {
      activeUploadsRef.current--
      uploadingTasksRef.current.delete(task.id) // Remove from uploading set
      // Process next in queue
      queueMicrotask(processQueue)
    }
  }

  const addTasks = useCallback(
    async (params: {
      files: { id: string; file: File; fileHash?: string }[]
      title: string
      categories: string[]
      storageProvider?: string
      storageSourceId?: string
      storagePath?: string
      storagePathFull?: boolean
      storyId?: string
      albumIds?: string[]
      filmRollId?: string
      showFlag?: boolean
      compressionMode?: CompressionMode
      maxSizeMB?: number
      maxWidthOrHeight?: number
      stripGps?: boolean
      token: string
    }) => {
      tokenRef.current = params.token

      // Generate a unique batch ID for this upload session
      const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      const newTasks: UploadTask[] = await Promise.all(
        params.files.map(async (item) => {
          const preview = await createPreview(item.file)
          const fallbackTitle = item.file.name.replace(/\.[^/.]+$/, '')
          const normalizedTitle = params.title.trim() || fallbackTitle
          return {
            id: item.id,
            file: item.file,
            fileName: item.file.name,
            fileSize: item.file.size,
            originalSize: item.file.size,
            preview,
            status: 'pending' as UploadTaskStatus,
            progress: 0,
            error: null,
            title:
              params.files.length === 1
                ? normalizedTitle
                : fallbackTitle,
            categories: params.categories,
            storageProvider: params.storageProvider,
            storageSourceId: params.storageSourceId,
            storagePath: params.storagePath,
            storagePathFull: params.storagePathFull,
            storyId: params.storyId,
            albumIds: params.albumIds,
            filmRollId: params.filmRollId,
            showFlag: params.showFlag ?? true,
            fileHash: item.fileHash,
            compressionMode: params.compressionMode,
            maxSizeMB: params.maxSizeMB,
            maxWidthOrHeight: params.maxWidthOrHeight,
            stripGps: params.stripGps,
            batchId,
          }
        })
      )

      setTasks((prev) => [...prev, ...newTasks])
      setIsMinimized(false)

      // Start processing queue
      queueMicrotask(processQueue)
    },
    [processQueue]
  )

  const retryTask = useCallback(
    (taskId: string, token: string) => {
      tokenRef.current = token

      setTasks((prev) => {
        const task = prev.find((t) => t.id === taskId)
        if (task) {
          // Remove the old batch from notified set so it can notify again
          notifiedBatchesRef.current.delete(task.batchId)
        }
        return prev.map((t) =>
          t.id === taskId
            ? { ...t, status: 'pending' as UploadTaskStatus, error: null, progress: 0 }
            : t
        )
      })
      setTimeout(processQueue, 0)
    },
    [processQueue]
  )

  const removeTask = useCallback((taskId: string) => {
    setTasks((prev) => {
      const task = prev.find((t) => t.id === taskId)
      if (task?.preview) {
        URL.revokeObjectURL(task.preview)
      }
      return prev.filter((t) => t.id !== taskId)
    })
  }, [])

  const clearCompleted = useCallback(() => {
    setTasks((prev) => {
      prev
        .filter((t) => t.status === 'completed')
        .forEach((t) => {
          if (t.preview) URL.revokeObjectURL(t.preview)
        })
      return prev.filter((t) => t.status !== 'completed')
    })
  }, [])

  const clearAll = useCallback(() => {
    setTasks((prev) => {
      prev.forEach((t) => {
        if (t.preview) URL.revokeObjectURL(t.preview)
      })
      return []
    })
    notifiedBatchesRef.current.clear()
  }, [])

  return (
    <UploadQueueContext.Provider
      value={{
        tasks,
        isMinimized,
        setIsMinimized,
        addTasks,
        retryTask,
        removeTask,
        clearCompleted,
        clearAll,
      }}
    >
      {children}
    </UploadQueueContext.Provider>
  )
}
