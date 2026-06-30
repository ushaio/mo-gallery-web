import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'

export type UploadTaskStatus = 'pending' | 'uploading' | 'completed' | 'failed'

export interface UploadTask {
  id: string
  filePath: string
  fileName: string
  fileSize: number
  status: UploadTaskStatus
  progress: number
  error?: string
  photoId?: string
}

interface UploadQueueContextType {
  tasks: UploadTask[]
  isUploading: boolean
  addTasks: (files: Array<{ filePath: string; fileName: string; fileSize: number; hash: string; exif?: any }>, settings: UploadSettings) => void
  retryTask: (taskId: string) => void
  retryAllFailed: () => void
  removeTask: (taskId: string) => void
  clearCompleted: () => void
}

interface UploadSettings {
  title: string
  categories: string[]
  albumIds?: string[]
  storyId?: string
  filmRollId?: string
  storageSourceId: string
  storagePath: string
  compressEnabled: boolean
  maxSizeMB: number
  showFlag: boolean
  stripGPS: boolean
}

const CONCURRENCY = 3

const UploadQueueContext = createContext<UploadQueueContextType | null>(null)

export function useUploadQueue() {
  const ctx = useContext(UploadQueueContext)
  if (!ctx) throw new Error('useUploadQueue must be used within UploadQueueProvider')
  return ctx
}

export function UploadQueueProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<UploadTask[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const activeCountRef = useRef(0)
  const settingsRef = useRef<UploadSettings | null>(null)
  const hashesRef = useRef<Map<string, string>>(new Map())
  const exifsRef = useRef<Map<string, any>>(new Map())

  const updateTask = useCallback((id: string, patch: Partial<UploadTask>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  }, [])

  const uploadSingleFile = useCallback(async (task: UploadTask, settings: UploadSettings) => {
    updateTask(task.id, { status: 'uploading', progress: 0 })
    try {
      const hash = hashesRef.current.get(task.filePath) || ''
      const exif = exifsRef.current.get(task.filePath) || null
      const result = await (window as any).go.main.App.UploadFile(
        task.filePath,
        {
          title: settings.title || task.fileName,
          categories: settings.categories,
          albumIds: settings.albumIds?.length ? settings.albumIds : undefined,
          storyId: settings.storyId || undefined,
          filmRollId: settings.filmRollId || undefined,
          storageSourceId: settings.storageSourceId,
          storagePath: settings.storagePath || undefined,
          compressEnabled: settings.compressEnabled,
          maxSizeMB: settings.maxSizeMB,
          showFlag: settings.showFlag,
          stripGPS: settings.stripGPS,
          originFlag: 'desktop',
        },
        hash,
        exif,
      )

      if (result?.isDuplicate) {
        updateTask(task.id, { status: 'completed', progress: 100, error: `已存在: ${result.existing?.title || ''}` })
      } else if (result?.success) {
        updateTask(task.id, { status: 'completed', progress: 100, photoId: result.photo?.id })
      } else {
        updateTask(task.id, { status: 'failed', progress: 0, error: result?.error || '上传失败' })
      }
    } catch (err: any) {
      updateTask(task.id, { status: 'failed', progress: 0, error: err?.message || '上传异常' })
    } finally {
      activeCountRef.current--
      processQueue()
    }
  }, [updateTask])

  const processQueue = useCallback(() => {
    setTasks(prev => {
      const pending = prev.filter(t => t.status === 'pending')
      const slots = CONCURRENCY - activeCountRef.current
      if (slots <= 0 || pending.length === 0) {
        if (activeCountRef.current === 0 && pending.length === 0) {
          setIsUploading(false)
        }
        return prev
      }

      const toStart = pending.slice(0, slots)
      activeCountRef.current += toStart.length

      for (const task of toStart) {
        const settings = settingsRef.current
        if (settings) {
          uploadSingleFile(task, settings)
        }
      }
      return prev
    })
  }, [uploadSingleFile])

  const addTasks = useCallback((files: Array<{ filePath: string; fileName: string; fileSize: number; hash: string; exif?: any }>, settings: UploadSettings) => {
    settingsRef.current = settings
    const newTasks: UploadTask[] = files.map(f => {
      hashesRef.current.set(f.filePath, f.hash)
      if (f.exif) exifsRef.current.set(f.filePath, f.exif)
      return {
        id: crypto.randomUUID(),
        filePath: f.filePath,
        fileName: f.fileName,
        fileSize: f.fileSize,
        status: 'pending' as const,
        progress: 0,
      }
    })

    setTasks(prev => [...prev, ...newTasks])
    setIsUploading(true)
    setTimeout(processQueue, 0)
  }, [processQueue])

  const retryTask = useCallback((taskId: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'pending' as const, progress: 0, error: undefined } : t))
    setTimeout(processQueue, 0)
  }, [processQueue])

  const retryAllFailed = useCallback(() => {
    setTasks(prev => prev.map(t => t.status === 'failed' ? { ...t, status: 'pending' as const, progress: 0, error: undefined } : t))
    setTimeout(processQueue, 0)
  }, [processQueue])

  const removeTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }, [])

  const clearCompleted = useCallback(() => {
    setTasks(prev => prev.filter(t => t.status !== 'completed'))
  }, [])

  return (
    <UploadQueueContext.Provider value={{ tasks, isUploading, addTasks, retryTask, retryAllFailed, removeTask, clearCompleted }}>
      {children}
    </UploadQueueContext.Provider>
  )
}
