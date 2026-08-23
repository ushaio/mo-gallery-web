import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { DownloadCloudPhotoToFolder, DownloadCloudPhotoToLocalLibrary } from '../../wailsjs/go/main/App'
import type { local_library } from '../../wailsjs/go/models'

export type DownloadTaskStatus = 'pending' | 'downloading' | 'importing' | 'completed' | 'skipped' | 'failed'

export interface DownloadTask {
  id: string
  photoId: string
  fileName: string
  fileSize: number
  status: DownloadTaskStatus
  progress: number
  error?: string
  result?: local_library.ImportResult
  downloaded?: number
  total?: number
}

interface DownloadQueueContextType {
  tasks: DownloadTask[]
  isDownloading: boolean
  startDownload: (photoId: string, destination: string, libraryPath: string, fileName: string, fileSize: number, conflictPolicy?: string) => void
  startFolderDownload: (photoId: string, folderPath: string, fileName: string, fileSize: number) => void
  removeTask: (taskId: string) => void
  clearCompleted: () => void
}

const DownloadQueueContext = createContext<DownloadQueueContextType | null>(null)

export function useDownloadQueue() {
  const ctx = useContext(DownloadQueueContext)
  if (!ctx) throw new Error('useDownloadQueue must be used within DownloadQueueProvider')
  return ctx
}

export function DownloadQueueProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<DownloadTask[]>([])
  const [isDownloading, setIsDownloading] = useState(false)
  const tasksRef = useRef<Map<string, DownloadTask>>(new Map())

  const patchTask = useCallback((id: string, patch: Partial<DownloadTask>) => {
    const existing = tasksRef.current.get(id)
    if (!existing) return
    const updated = { ...existing, ...patch }
    tasksRef.current.set(id, updated)
    setTasks(Array.from(tasksRef.current.values()))
  }, [])

  const removeTaskRef = useCallback((id: string) => {
    tasksRef.current.delete(id)
    setTasks(Array.from(tasksRef.current.values()))
  }, [])

  useEffect(() => {
    const unsubscribe = EventsOn('download:progress', (event: {
      taskId: string
      phase: string
      progress: number
      error?: string
      photoId: string
      fileName: string
      fileSize: number
      downloaded?: number
      total?: number
    }) => {
      const taskId = event?.taskId
      if (!taskId) return
      const existing = tasksRef.current.get(taskId)
      if (!existing) return

      if (event.phase === 'completed') {
        patchTask(taskId, { status: 'completed', progress: 100, error: undefined, downloaded: event.total, total: event.total })
      } else if (event.phase === 'failed') {
        patchTask(taskId, { status: 'failed', progress: 0, error: event.error || '下载失败' })
      } else if (event.phase === 'downloading') {
        patchTask(taskId, { status: 'downloading', progress: event.progress, error: undefined, downloaded: event.downloaded, total: event.total })
      } else if (event.phase === 'importing') {
        patchTask(taskId, { status: 'importing', progress: event.progress, error: undefined })
      } else if (event.phase === 'fetching') {
        patchTask(taskId, { status: 'pending', progress: 0, error: undefined })
      }
    })
    return () => { unsubscribe() }
  }, [patchTask])

  const createTask = useCallback((photoId: string, fileName: string, fileSize: number) => {
    const taskId = photoId + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const task: DownloadTask = {
      id: taskId,
      photoId,
      fileName,
      fileSize,
      status: 'pending',
      progress: 0,
    }
    tasksRef.current.set(taskId, task)
    setTasks(Array.from(tasksRef.current.values()))
    setIsDownloading(true)
    return taskId
  }, [])

  const runTask = useCallback((taskId: string, runner: () => Promise<void>) => {
    void (async () => {
      try {
        await runner()
      } catch (err) {
        const message = err instanceof Error ? err.message : '下载失败'
        patchTask(taskId, { status: 'failed', progress: 0, error: message })
      } finally {
        // Check if any tasks are still active
        const hasActive = Array.from(tasksRef.current.values()).some(
          t => t.id !== taskId && (t.status === 'pending' || t.status === 'downloading' || t.status === 'importing')
        )
        if (!hasActive) setIsDownloading(false)
      }
    })()
  }, [patchTask])

  const startDownload = useCallback((photoId: string, destination: string, libraryPath: string, fileName: string, fileSize: number, conflictPolicy?: string) => {
    const taskId = createTask(photoId, fileName, fileSize)
    runTask(taskId, async () => {
      const results = await DownloadCloudPhotoToLocalLibrary(taskId, photoId, destination, libraryPath, conflictPolicy || 'rename')
      const result = results?.[0]
      if (result && result.status === 'skipped') {
        patchTask(taskId, { status: 'skipped', progress: 100 })
      } else if (result && result.status !== 'failed') {
        patchTask(taskId, { status: 'completed', progress: 100, result })
      } else if (result) {
        patchTask(taskId, { status: 'failed', progress: 0, error: result.error || '下载失败' })
      }
    })
  }, [createTask, patchTask, runTask])

  const startFolderDownload = useCallback((photoId: string, folderPath: string, fileName: string, fileSize: number) => {
    const taskId = createTask(photoId, fileName, fileSize)
    runTask(taskId, async () => {
      const result = await DownloadCloudPhotoToFolder(taskId, photoId, folderPath)
      if (result) {
        patchTask(taskId, { status: 'completed', progress: 100 })
      } else {
        patchTask(taskId, { status: 'failed', progress: 0, error: '下载失败' })
      }
    })
  }, [createTask, patchTask, runTask])

  const removeTask = useCallback((taskId: string) => {
    removeTaskRef(taskId)
    const hasActive = Array.from(tasksRef.current.values()).some(
      t => t.status === 'pending' || t.status === 'downloading' || t.status === 'importing'
    )
    if (!hasActive) setIsDownloading(false)
  }, [removeTaskRef])

  const clearCompleted = useCallback(() => {
    for (const [id, task] of tasksRef.current) {
      if (task.status === 'completed' || task.status === 'failed') {
        tasksRef.current.delete(id)
      }
    }
    setTasks(Array.from(tasksRef.current.values()))
  }, [])

  return (
    <DownloadQueueContext.Provider value={{ tasks, isDownloading, startDownload, startFolderDownload, removeTask, clearCompleted }}>
      {children}
    </DownloadQueueContext.Provider>
  )
}
