import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { addPhotosToAlbum, addPhotosToStory } from '@/lib/api'
import { getErrorMessage, isAuthError } from '@/lib/auth-errors'
import { useAuth } from '@/contexts/AuthContext'

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
  addTasks: (files: Array<{ filePath: string; fileName: string; fileSize: number; hash: string; exif?: any }>, settings: UploadSettings) => UploadTask[]
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
  const { token } = useAuth()
  const [tasks, setTasks] = useState<UploadTask[]>([])
  const [isUploading, setIsUploading] = useState(false)
  // tasksRef 是队列状态的唯一权威来源；tasks state 仅用于渲染。
  // processQueue 的副作用（启动上传）绝不能放进 setTasks 的 updater：
  // React 会在 StrictMode/并发渲染下重复调用 updater，导致同一文件被上传两次。
  const tasksRef = useRef<UploadTask[]>([])
  const activeCountRef = useRef(0)
  const startedIdsRef = useRef<Set<string>>(new Set())
  // 设置按任务绑定：后加入的批次可能带不同设置（showFlag/分类/存储等），
  // 共用一个全局设置会让上一批还在排队的任务用新批次的设置上传。
  const taskSettingsRef = useRef<Map<string, UploadSettings>>(new Map())
  const hashesRef = useRef<Map<string, string>>(new Map())
  const exifsRef = useRef<Map<string, any>>(new Map())
  const tokenRef = useRef('')

  useEffect(() => {
    tokenRef.current = token || ''
  }, [token])

  const patchTasks = useCallback((updater: (prev: UploadTask[]) => UploadTask[]) => {
    tasksRef.current = updater(tasksRef.current)
    setTasks(tasksRef.current)
  }, [])

  const updateTask = useCallback((id: string, patch: Partial<UploadTask>) => {
    patchTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  }, [patchTasks])

  const uploadSingleFile = useCallback(async (task: UploadTask, settings: UploadSettings) => {
    let progressTimer: number | undefined
    updateTask(task.id, { status: 'uploading', progress: 5 })
    progressTimer = window.setInterval(() => {
      patchTasks(prev => prev.map(t => {
        if (t.id !== task.id || t.status !== 'uploading') return t
        return { ...t, progress: Math.min(95, t.progress + Math.max(1, Math.round((95 - t.progress) * 0.08))) }
      }))
    }, 500)
    try {
      const hash = hashesRef.current.get(task.filePath) || ''
      const exif = exifsRef.current.get(task.filePath) || null
      const result = await (window as any).go.main.App.UploadFile(
        task.filePath,
        {
          title: settings.title || task.fileName,
          categories: settings.categories,
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
      } else if (result?.success && result.photo?.id) {
        const photoId = result.photo.id
        updateTask(task.id, { status: 'completed', progress: 100, photoId })

        // ── 补偿调用：关联相册/故事 ──────────────────────────────────
        // Go UploadSettings 不包含 albumIds/storyId，所以在此处通过 HTTP
        // 直连 Web API 完成关联（模式参考故事编辑器 useStoryEditorActions.ts:323）
        const compensationToken = tokenRef.current
        if (compensationToken) {
          // 关联到相册（失败不影响上传成功状态，提示用户手动补救）
          if (settings.albumIds?.length) {
            for (const albumId of settings.albumIds) {
              try {
                await addPhotosToAlbum(compensationToken, albumId, [photoId])
              } catch (err) {
                if (isAuthError(err)) {
                  tokenRef.current = ''
                  return
                }
                console.error(`关联相册 ${albumId} 失败:`, err)
                toast.error(`「${task.fileName}」已上传，但添加到相册失败，请到相册页手动添加`)
              }
            }
          }

          // 关联到故事
          if (settings.storyId) {
            try {
              await addPhotosToStory(compensationToken, settings.storyId, [photoId])
            } catch (err) {
              if (isAuthError(err)) {
                tokenRef.current = ''
                return
              }
              console.error(`关联故事 ${settings.storyId} 失败:`, err)
              toast.error(`「${task.fileName}」已上传，但关联故事失败，请到故事编辑器手动添加`)
            }
          }
        }
      } else {
        updateTask(task.id, { status: 'failed', progress: 0, error: result?.error || '上传失败' })
      }
    } catch (err: unknown) {
      if (isAuthError(err)) {
        tokenRef.current = ''
        startedIdsRef.current.delete(task.id)
        updateTask(task.id, { status: 'pending', progress: 0, error: undefined })
        return
      }
      updateTask(task.id, { status: 'failed', progress: 0, error: getErrorMessage(err) })
    } finally {
      if (progressTimer) window.clearInterval(progressTimer)
      activeCountRef.current--
      processQueue()
    }
  }, [updateTask, patchTasks])

  const processQueue = useCallback(() => {
    if (!tokenRef.current) {
      setIsUploading(false)
      return
    }

    const pending = tasksRef.current.filter(
      t => t.status === 'pending' && !startedIdsRef.current.has(t.id)
    )
    const slots = CONCURRENCY - activeCountRef.current
    if (slots <= 0 || pending.length === 0) {
      if (activeCountRef.current === 0 && tasksRef.current.every(t => t.status !== 'pending')) {
        setIsUploading(false)
      }
      return
    }

    for (const task of pending.slice(0, slots)) {
      const settings = taskSettingsRef.current.get(task.id)
      if (!settings) {
        updateTask(task.id, { status: 'failed', progress: 0, error: '内部错误：缺少上传设置' })
        continue
      }
      startedIdsRef.current.add(task.id)
      activeCountRef.current++
      uploadSingleFile(task, settings)
    }
  }, [uploadSingleFile, updateTask])

  const addTasks = useCallback((files: Array<{ filePath: string; fileName: string; fileSize: number; hash: string; exif?: any }>, settings: UploadSettings) => {
    const newTasks: UploadTask[] = files.map(f => {
      hashesRef.current.set(f.filePath, f.hash)
      if (f.exif) exifsRef.current.set(f.filePath, f.exif)
      const task: UploadTask = {
        id: crypto.randomUUID(),
        filePath: f.filePath,
        fileName: f.fileName,
        fileSize: f.fileSize,
        status: 'pending' as const,
        progress: 0,
      }
      taskSettingsRef.current.set(task.id, settings)
      return task
    })

    patchTasks(prev => [...prev, ...newTasks])
    setIsUploading(true)
    setTimeout(processQueue, 0)
    return newTasks
  }, [patchTasks, processQueue])

  const retryTask = useCallback((taskId: string) => {
    startedIdsRef.current.delete(taskId)
    patchTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'pending' as const, progress: 0, error: undefined } : t))
    setTimeout(processQueue, 0)
  }, [patchTasks, processQueue])

  const retryAllFailed = useCallback(() => {
    patchTasks(prev => prev.map(t => {
      if (t.status !== 'failed') return t
      startedIdsRef.current.delete(t.id)
      return { ...t, status: 'pending' as const, progress: 0, error: undefined }
    }))
    setTimeout(processQueue, 0)
  }, [patchTasks, processQueue])

  const removeTask = useCallback((taskId: string) => {
    startedIdsRef.current.delete(taskId)
    taskSettingsRef.current.delete(taskId)
    patchTasks(prev => prev.filter(t => t.id !== taskId))
  }, [patchTasks])

  const clearCompleted = useCallback(() => {
    patchTasks(prev => prev.filter(t => {
      if (t.status !== 'completed') return true
      startedIdsRef.current.delete(t.id)
      taskSettingsRef.current.delete(t.id)
      return false
    }))
  }, [patchTasks])

  return (
    <UploadQueueContext.Provider value={{ tasks, isUploading, addTasks, retryTask, retryAllFailed, removeTask, clearCompleted }}>
      {children}
    </UploadQueueContext.Provider>
  )
}
