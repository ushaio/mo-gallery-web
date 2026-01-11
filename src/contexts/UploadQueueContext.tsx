'use client'

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { uploadPhotoWithProgress, addPhotosToAlbum } from '@/lib/api'

export type UploadTaskStatus = 'pending' | 'uploading' | 'completed' | 'failed'

export interface UploadTask {
  id: string
  file: File
  fileName: string
  fileSize: number
  preview: string | null
  status: UploadTaskStatus
  progress: number
  error: string | null
  // Upload params
  title: string
  categories: string[]
  storageProvider?: string
  storagePath?: string
  storyId?: string
  albumIds?: string[]
  fileHash?: string // Original file hash for duplicate detection
  batchId: string // Unique batch identifier
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
    storagePath?: string
    storyId?: string
    albumIds?: string[]
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

export function UploadQueueProvider({
  children,
  onUploadComplete,
}: {
  children: React.ReactNode
  onUploadComplete?: (photoIds: string[], storyId?: string, albumIds?: string[]) => void
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

  const updateTaskProgress = useCallback((taskId: string, progress: number) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, progress } : t
      )
    )
  }, [])

  const notifyBatchComplete = useCallback(async (batchId: string, storyId: string | undefined, albumIds: string[] | undefined, photoIds: string[]) => {
    // Double-check we haven't already notified for this batch
    if (notifiedBatchesRef.current.has(batchId)) {
      return
    }
    notifiedBatchesRef.current.add(batchId)

    // If albumIds are provided, add photos to each album
    if (albumIds && albumIds.length > 0 && photoIds.length > 0 && tokenRef.current) {
      for (const albumId of albumIds) {
        try {
          await addPhotosToAlbum(tokenRef.current, albumId, photoIds)
        } catch (err) {
          console.error(`Failed to add photos to album ${albumId}:`, err)
        }
      }
    }

    if (photoIds.length > 0 && onUploadCompleteRef.current) {
      onUploadCompleteRef.current(photoIds, storyId, albumIds)
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
          ? { ...t, status: 'uploading' as UploadTaskStatus, progress: 0 }
          : t
      )
    })
  }, [])

  const uploadSingleFile = async (task: UploadTask) => {
    try {
      const photo = await uploadPhotoWithProgress({
        token: tokenRef.current,
        file: task.file,
        title: task.title,
        category: task.categories,
        storage_provider: task.storageProvider,
        storage_path: task.storagePath,
        file_hash: task.fileHash,
        onProgress: (progress) => {
          updateTaskProgress(task.id, progress)
        },
      })

      // Update task status and check batch completion
      setTasks((prev) => {
        const updated = prev.map((t) =>
          t.id === task.id
            ? { ...t, status: 'completed' as UploadTaskStatus, progress: 100, photoId: photo.id }
            : t
        )

        // Check if this batch is complete
        const batchTasks = updated.filter((t) => t.batchId === task.batchId)
        const allDone = batchTasks.every((t) => t.status === 'completed' || t.status === 'failed')

        if (allDone && !notifiedBatchesRef.current.has(task.batchId)) {
          const completedTasks = batchTasks.filter((t) => t.status === 'completed')
          const photoIds = completedTasks
            .map((t) => t.photoId)
            .filter((id): id is string => !!id)

          // Schedule notification outside of setState
          setTimeout(() => {
            notifyBatchComplete(task.batchId, task.storyId, task.albumIds, photoIds)
          }, 0)
        }

        return updated
      })
    } catch (err) {
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
          const photoIds = completedTasks
            .map((t) => t.photoId)
            .filter((id): id is string => !!id)

          if (photoIds.length > 0) {
            setTimeout(() => {
              notifyBatchComplete(task.batchId, task.storyId, task.albumIds, photoIds)
            }, 0)
          }
        }

        return updated
      })
    } finally {
      activeUploadsRef.current--
      uploadingTasksRef.current.delete(task.id) // Remove from uploading set
      // Process next in queue
      setTimeout(processQueue, 50)
    }
  }

  const addTasks = useCallback(
    async (params: {
      files: { id: string; file: File; fileHash?: string }[]
      title: string
      categories: string[]
      storageProvider?: string
      storagePath?: string
      storyId?: string
      albumIds?: string[]
      token: string
    }) => {
      tokenRef.current = params.token

      // Generate a unique batch ID for this upload session
      const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      const newTasks: UploadTask[] = await Promise.all(
        params.files.map(async (item) => {
          const preview = await createPreview(item.file)
          return {
            id: item.id,
            file: item.file,
            fileName: item.file.name,
            fileSize: item.file.size,
            preview,
            status: 'pending' as UploadTaskStatus,
            progress: 0,
            error: null,
            title:
              params.files.length === 1
                ? params.title
                : item.file.name.replace(/\.[^/.]+$/, ''),
            categories: params.categories,
            storageProvider: params.storageProvider,
            storagePath: params.storagePath,
            storyId: params.storyId,
            albumIds: params.albumIds,
            fileHash: item.fileHash,
            batchId,
          }
        })
      )

      setTasks((prev) => [...prev, ...newTasks])
      setIsMinimized(false)

      // Start processing queue
      setTimeout(processQueue, 50)
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
      setTimeout(processQueue, 50)
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
