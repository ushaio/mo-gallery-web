import { useState, useCallback, useRef, useEffect } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import { useDataRevision } from '@/hooks/useDataRevision'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { loadPersistentResource } from '@/lib/persistent-cache'
import { useUploadQueue } from '@/contexts/UploadQueueContext'
import { useUploadIntentStore } from '@/store/upload-intent'
import type { UploadTask } from '@/contexts/UploadQueueContext'
import { OnFileDrop, OnFileDropOff } from '../../wailsjs/runtime/runtime'
import {
  CheckDuplicates,
  GetAlbums,
  GetFileThumbnail,
  GetFilmRolls,
  GetStorageSources,
  GetStories,
  PrepareClipboardUpload,
  PrepareLocalAssetUpload,
  PrepareUpload,
  SelectFiles,
} from '../../wailsjs/go/main/App'
import type { services, types as wailsTypes } from '../../wailsjs/go/models'
import { toast } from 'sonner'
import {
  Upload, X, CheckCircle, AlertCircle, Loader2, FileImage,
  Image as ImageIcon, Trash2, CloudUpload, GripVertical, Eye,
  Camera, Film, BookOpen, FolderOpen, Maximize2, ChevronDown, HardDrive,
} from 'lucide-react'

interface PreparedFile {
  assetId?: string
  filePath: string
  fileName: string
  fileSize: number
  hash: string
  exif?: {
    cameraMake?: string
    cameraModel?: string
    lensModel?: string
    focalLength?: string
    aperture?: string
    shutterSpeed?: string
    iso?: number
    takenAt?: string
    orientation?: number
  }
  error?: string
}

interface UploadItem {
  file: PreparedFile
  status: 'pending' | 'checking' | 'compressing' | 'uploading' | 'done' | 'error' | 'duplicate'
  progress: number
  error?: string
  photoId?: string
  uploadTaskId?: string
}

interface UploadSettings {
  title: string
  categories: string[]
  albumIds: string[]
  storyId: string
  filmRollId: string
  storageSourceId: string
  storagePath: string
  compressEnabled: boolean
  compressionFormat: 'webp' | 'avif'
  maxSizeMB: number
  showFlag: boolean
  stripGPS: boolean
}

type UploadType = 'digital' | 'film'

const DEFAULT_UPLOAD_SETTINGS: UploadSettings = {
  title: '',
  categories: [],
  albumIds: [],
  storyId: '',
  filmRollId: '',
  storageSourceId: '',
  storagePath: '',
  compressEnabled: true,
  compressionFormat: 'avif',
  maxSizeMB: 4,
  showFlag: true,
  stripGPS: false,
}

interface UploadPageDraftState {
  items: UploadItem[]
  uploadType: UploadType
  settings: UploadSettings
  selectedIds: string[]
  categoryInput: string
  useCustomPrefix: boolean
}

let uploadPageDraftState: UploadPageDraftState = {
  items: [],
  uploadType: 'digital',
  settings: DEFAULT_UPLOAD_SETTINGS,
  selectedIds: [],
  categoryInput: '',
  useCustomPrefix: false,
}

export function UploadPage() {
  const { language } = usePreferences()
  const relatedDataRevision = useDataRevision('albums', 'stories', 'film-rolls', 'storage-sources')
  const { tasks, addTasks } = useUploadQueue()
  const [items, setItems] = useState<UploadItem[]>(() => uploadPageDraftState.items)
  const [uploadType, setUploadType] = useState<UploadType>(() => uploadPageDraftState.uploadType)
  const [settings, setSettings] = useState<UploadSettings>(() => uploadPageDraftState.settings)
  const [preparing, setPreparing] = useState(false)
  const [preparingLabel, setPreparingLabel] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(uploadPageDraftState.selectedIds))
  const [categoryInput, setCategoryInput] = useState(() => uploadPageDraftState.categoryInput)
  const [previewFile, setPreviewFile] = useState<{ path: string; name: string } | null>(null)
  const [useCustomPrefix, setUseCustomPrefix] = useState(() => uploadPageDraftState.useCustomPrefix)
  const [showPrefixDropdown, setShowPrefixDropdown] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const clipboardPasteInFlightRef = useRef(false)

  useEffect(() => {
    uploadPageDraftState = {
      items,
      uploadType,
      settings,
      selectedIds: Array.from(selectedIds),
      categoryInput,
      useCustomPrefix,
    }
  }, [items, uploadType, settings, selectedIds, categoryInput, useCustomPrefix])

  // Wails 原生文件拖放（可获取完整路径）
  useEffect(() => {
    OnFileDrop((_x, _y, paths) => {
      if (paths && paths.length > 0) {
        processFiles(paths)
      }
      setIsDragging(false)
    }, true)

    const handleDragOver = (e: DragEvent) => { e.preventDefault(); e.stopPropagation() }
    const handleDragEnter = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.relatedTarget === null) setIsDragging(false)
    }
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragleave', handleDragLeave)

    return () => {
      OnFileDropOff()
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragleave', handleDragLeave)
    }
  }, [])

  // 关联数据
  const [albums, setAlbums] = useState<services.AlbumDTO[]>([])
  const [stories, setStories] = useState<services.StoryDTO[]>([])
  const [filmRolls, setFilmRolls] = useState<services.FilmRollDTO[]>([])
  const [storageSources, setStorageSources] = useState<wailsTypes.StorageSourceDTO[]>([])

  // 点击外部关闭下拉框
  useEffect(() => {
    if (!showPrefixDropdown) return
    const handleClick = () => {
      setShowPrefixDropdown(false)
    }
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [showPrefixDropdown])

  // 加载关联数据
  useCachedPageEffect(() => {
    (async () => {
      const failed: string[] = []
      try {
        const r = await loadPersistentResource<services.AlbumDTO[]>('albums', GetAlbums)
        setAlbums(r || [])
      } catch { failed.push('相册') }
      try {
        const r = await loadPersistentResource<services.StoryDTO[]>('stories', GetStories)
        setStories(r || [])
      } catch { failed.push('故事') }
      try {
        const r = await loadPersistentResource<services.FilmRollDTO[]>('film-rolls', GetFilmRolls)
        setFilmRolls(r || [])
      } catch { failed.push('胶卷') }
      try {
        const r = await GetStorageSources()
        const sources = r || []
        setStorageSources(sources)
        // 自动选中第一个存储源
        if (sources.length > 0) setSettings(s => s.storageSourceId ? s : ({ ...s, storageSourceId: sources[0].id }))
      } catch {
        // 存储源加载失败会导致上传按钮一直不可用，必须显式提示
        toast.error('存储源加载失败，无法上传。请检查服务器连接后重新进入本页')
      }
      if (failed.length > 0) {
        toast.error(`${failed.join('、')}列表加载失败，相关选项暂不可用`)
      }
    })()
  }, [relatedDataRevision])

  const handleSelectFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const paths: string[] = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i] as File & { path?: string }
      if (f.path) paths.push(f.path)
    }
    if (paths.length === 0) {
      toast.error('无法获取文件路径，请使用"选择文件"按钮')
      return
    }
    await processFiles(paths)
  }, [])

  const handleFileDialog = useCallback(async () => {
    try {
      const paths = await SelectFiles()
      if (paths && paths.length > 0) {
        await processFiles(paths)
      }
    } catch {
      fileInputRef.current?.click()
    }
  }, [])

  const appendPreparedFiles = async (prepared: PreparedFile[]) => {
    const hashes = prepared.filter(f => f.hash).map(f => f.hash)
    let duplicates: Record<string, services.DuplicateInfo> = {}
    setPreparingLabel('查重中')
    if (hashes.length > 0) {
      try {
        const dupResult = await CheckDuplicates(hashes)
        duplicates = dupResult?.duplicates || {}
      } catch {}
    }
    const newItems: UploadItem[] = prepared.map(f => ({
      file: f,
      status: f.error ? 'error' : (duplicates[f.hash] ? 'duplicate' : 'pending'),
      progress: f.error || duplicates[f.hash] ? 100 : 0,
      error: f.error || (duplicates[f.hash] ? `已存在: ${duplicates[f.hash].title || ''}` : undefined),
    }))
    setItems(prev => [...prev, ...newItems])
    setPreparingLabel('')
  }

  const processFiles = async (paths: string[]) => {
    setPreparing(true)
    setPreparingLabel('文件处理中')
    try {
      const prepared: PreparedFile[] = await PrepareUpload(paths)
      await appendPreparedFiles(prepared)
    } catch (err: unknown) {
      console.error('预处理失败:', err)
      toast.error(err instanceof Error ? err.message : '文件预处理失败，请重试')
    } finally {
      setPreparing(false)
      setPreparingLabel('')
    }
  }

  const processLocalAssets = async (assetIds: string[]) => {
    setPreparing(true)
    setPreparingLabel('文件处理中')
    try {
      const prepared: PreparedFile[] = await PrepareLocalAssetUpload(assetIds)
      await appendPreparedFiles(prepared)
    } catch (err: unknown) {
      console.error('本地资源预处理失败:', err)
      toast.error(err instanceof Error ? err.message : '本地资源预处理失败，请重新检查资源库')
    } finally {
      setPreparing(false)
      setPreparingLabel('')
    }
  }

  const processClipboardFiles = async (files: File[]) => {
    if (clipboardPasteInFlightRef.current) return
    clipboardPasteInFlightRef.current = true
    setPreparing(true)
    setPreparingLabel('正在读取剪贴板图片')
    try {
      const dataURLs = await Promise.all(files.map(readFileAsDataURL))
      const prepared: PreparedFile[] = await PrepareClipboardUpload(
        files.map(file => file.name),
        dataURLs,
      )
      await appendPreparedFiles(prepared)
      toast.success(`已从剪贴板添加 ${prepared.length} 张图片`)
    } catch (err: unknown) {
      console.error('剪贴板图片预处理失败:', err)
      toast.error(err instanceof Error ? err.message : '无法读取剪贴板图片')
    } finally {
      clipboardPasteInFlightRef.current = false
      setPreparing(false)
      setPreparingLabel('')
    }
  }

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const imageFiles = Array.from(event.clipboardData?.items || [])
        .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter((file): file is File => file !== null)
      if (imageFiles.length === 0) return
      event.preventDefault()
      void processClipboardFiles(imageFiles)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  useEffect(() => {
    const intent = useUploadIntentStore.getState().consume()
    if (!intent) return
    if (intent.albumId) {
      setSettings((current) => ({ ...current, albumIds: [intent.albumId!] }))
    }
    if (intent.source === 'local-assets') {
      if (intent.assetIds.length > 0) void processLocalAssets(intent.assetIds)
      return
    }
    if (intent.paths.length > 0) void processFiles(intent.paths)
  }, [])

  const handleUpload = async () => {
    const pending = items.filter(i => i.status === 'pending')
    if (pending.length === 0) return

    const newTasks = addTasks(
      pending.map(item => ({
        filePath: item.file.filePath,
        assetId: item.file.assetId,
        fileName: item.file.fileName,
        fileSize: item.file.fileSize,
        hash: item.file.hash,
        exif: item.file.exif,
      })),
      {
        title: settings.title,
        categories: settings.categories,
        albumIds: settings.albumIds.length > 0 ? settings.albumIds : undefined,
        storyId: settings.storyId || undefined,
        filmRollId: uploadType === 'film' ? (settings.filmRollId || undefined) : undefined,
        storageSourceId: settings.storageSourceId,
        storagePath: settings.storagePath,
        compressEnabled: settings.compressEnabled,
        compressionFormat: settings.compressionFormat,
        maxSizeMB: settings.maxSizeMB,
        showFlag: settings.showFlag,
        stripGPS: settings.stripGPS,
      }
    )

    const taskByPath = new Map(newTasks.map(task => [task.filePath, task]))
    setItems(prev => prev.map(item => {
      const task = taskByPath.get(item.file.filePath)
      return task ? { ...item, status: 'uploading', progress: task.progress, error: undefined, uploadTaskId: task.id } : item
    }))
    setSelectedIds(new Set())
  }

  useEffect(() => {
    if (tasks.length === 0) return
    const taskById = new Map(tasks.map(task => [task.id, task]))
    setItems(prev => prev.map(item => {
      if (!item.uploadTaskId) return item
      const task = taskById.get(item.uploadTaskId)
      if (!task) return item
      return {
        ...item,
        status: mapUploadTaskStatus(task),
        progress: task.status === 'completed' ? 100 : task.progress,
        error: task.error,
        photoId: task.photoId,
      }
    }))
  }, [tasks])

  const removeItem = (filePath: string) => {
    setItems(prev => prev.filter(i => i.file.filePath !== filePath))
    setSelectedIds(prev => { const n = new Set(prev); n.delete(filePath); return n })
  }
  const removeSelected = () => { setItems(prev => prev.filter(i => !selectedIds.has(i.file.filePath))); setSelectedIds(new Set()) }
  const clearAll = () => { setItems([]); setSelectedIds(new Set()) }
  const toggleSelect = (filePath: string) => { setSelectedIds(prev => { const n = new Set(prev); if (n.has(filePath)) n.delete(filePath); else n.add(filePath); return n }) }
  const toggleSelectAll = () => { if (selectedIds.size === items.length) setSelectedIds(new Set()); else setSelectedIds(new Set(items.map(i => i.file.filePath))) }

  const albumOptions = albums.map(a => ({ value: a.id, label: a.name }))
  const storyOptions = stories.map(s => ({ value: s.id, label: s.title }))
  const filmRollOptions = filmRolls.map(r => ({ value: r.id, label: `${r.name} · ${r.brand} · ${r.format}` }))
  const storageSourceOptions = storageSources.map(s => ({ value: s.id, label: `${s.name} (${s.type})` }))

  const pendingCount = items.filter(i => i.status === 'pending').length
  const doneCount = items.filter(i => i.status === 'done').length

  return (
    <>
      <PageHeader
        title={t('admin.page_upload', language)}
        description={items.length > 0 ? `${items.length} 个文件 · ${doneCount} 已上传 · ${pendingCount} 待上传` : undefined}
      />

      {/* 数码/胶片切换 */}
      <div className="flex gap-1 px-6 border-b" style={{ borderColor: 'var(--border)' }}>
        {[
          { key: 'digital' as const, label: '数码', icon: Camera },
          { key: 'film' as const, label: '胶片', icon: Film },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setUploadType(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              uploadType === key ? 'border-primary' : 'border-transparent'
            }`}
            style={{
              color: uploadType === key ? 'var(--primary)' : 'var(--muted-foreground)',
              borderColor: uploadType === key ? 'var(--primary)' : 'transparent',
            }}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 p-6 max-w-[1600px]">
          {/* 左侧：上传设置 */}
          <div className="lg:col-span-4">
            <div className="sticky top-0 space-y-4">
              <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
                <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>上传设置</h3>

                {/* 标题 */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>标题 <span className="text-destructive">*</span></label>
                  <input type="text" value={settings.title}
                    onChange={e => setSettings(s => ({ ...s, title: e.target.value }))}
                    placeholder={items.length > 1 ? '多文件时作为前缀' : '照片标题'}
                    disabled={items.length > 1}
                    className="w-full px-3 py-2 text-sm rounded-lg border outline-none disabled:opacity-50"
                    style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }} />
                </div>

                {/* 分类 + 相册 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>分类</label>
                    <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 min-h-[34px] rounded-lg border cursor-text"
                      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}
                      onClick={(e) => { if (e.target === e.currentTarget || !(e.target as HTMLElement).closest('button')) (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus() }}>
                      {settings.categories.map(c => (
                        <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md"
                          style={{ backgroundColor: 'var(--muted)', color: 'var(--foreground)' }}>
                          {c}
                          <button type="button" onClick={() => setSettings(s => ({ ...s, categories: s.categories.filter(x => x !== c) }))}
                            className="hover:text-destructive transition-colors">
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                      <input type="text"
                        value={categoryInput}
                        onChange={e => setCategoryInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && categoryInput.trim()) {
                            e.preventDefault()
                            if (!settings.categories.includes(categoryInput.trim())) {
                              setSettings(s => ({ ...s, categories: [...s.categories, categoryInput.trim()] }))
                            }
                            setCategoryInput('')
                          }
                          if (e.key === 'Backspace' && !categoryInput && settings.categories.length > 0) {
                            setSettings(s => ({ ...s, categories: s.categories.slice(0, -1) }))
                          }
                        }}
                        className="flex-1 min-w-[60px] outline-none bg-transparent text-xs"
                        style={{ color: 'var(--foreground)' }}
                        placeholder={settings.categories.length === 0 ? '输入后回车' : ''} />
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
                      <FolderOpen size={11} /> 相册
                    </label>
                    <SelectDropdown
                      value={settings.albumIds}
                      options={albumOptions}
                      onChange={(value) => setSettings(s => ({ ...s, albumIds: value as string[] }))}
                      placeholder="选择相册"
                      multiple
                      ariaLabel="选择相册"
                    />
                  </div>
                </div>

                {/* 故事 */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
                    <BookOpen size={11} /> 故事
                  </label>
                  <SelectDropdown
                    value={settings.storyId}
                    options={storyOptions}
                    onChange={(value) => setSettings(s => ({ ...s, storyId: value as string }))}
                    placeholder="不关联"
                    clearLabel="不关联"
                    size="md"
                    icon={BookOpen}
                    ariaLabel="关联故事"
                  />
                </div>

                {/* 胶卷（仅胶片模式） */}
                {uploadType === 'film' && (
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
                      <Film size={11} /> 胶卷
                    </label>
                    <SelectDropdown
                      value={settings.filmRollId}
                      options={filmRollOptions}
                      onChange={(value) => setSettings(s => ({ ...s, filmRollId: value as string }))}
                      placeholder="选择胶卷"
                      clearLabel="不选择"
                      size="md"
                      icon={Film}
                      ariaLabel="选择胶卷"
                    />
                  </div>
                )}

                {/* 存储源 + 路径 */}
                <div className="pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>存储源 <span className="text-destructive">*</span></label>
                      <SelectDropdown
                        value={settings.storageSourceId}
                        options={storageSourceOptions}
                        onChange={(value) => {
                          setSettings(prev => ({ ...prev, storageSourceId: value as string, storagePath: '' }))
                          setUseCustomPrefix(false)
                        }}
                        placeholder="选择存储源"
                        icon={HardDrive}
                        ariaLabel="选择存储源"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>路径前缀</label>
                      <div className="flex items-stretch relative">
                        {(() => {
                          const selectedSource = storageSources.find(s => s.id === settings.storageSourceId)
                          const basePath = selectedSource?.basePath
                          const displayPrefix = (!useCustomPrefix && basePath) ? basePath : '/'
                          return (
                            <button type="button"
                              onClick={(e) => { e.stopPropagation(); basePath && setShowPrefixDropdown(!showPrefixDropdown) }}
                              className="px-2 flex items-center gap-0.5 text-[10px] font-mono border-r-0 rounded-l-lg border shrink-0 hover:opacity-80 transition-opacity"
                              style={{ backgroundColor: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                              <span className="truncate max-w-[80px]">{displayPrefix}/</span>
                              {basePath && <ChevronDown size={10} className={`shrink-0 transition-transform ${showPrefixDropdown ? 'rotate-180' : ''}`} />}
                            </button>
                          )
                        })()}
                        {showPrefixDropdown && (() => {
                          const selectedSource = storageSources.find(s => s.id === settings.storageSourceId)
                          const basePath = selectedSource?.basePath
                          if (!basePath) return null
                          return (
                            <div className="absolute z-20 left-0 top-full mt-0.5 min-w-full border rounded-md shadow-lg"
                              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}
                              onClick={e => e.stopPropagation()}>
                              <button type="button"
                                onClick={() => { setUseCustomPrefix(true); setSettings(s => ({ ...s, storagePath: '' })); setShowPrefixDropdown(false) }}
                                className="w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-muted/50 flex items-center justify-between"
                                style={{ color: useCustomPrefix ? 'var(--primary)' : 'var(--foreground)' }}>
                                <span>/</span>
                                {useCustomPrefix && <CheckCircle size={10} />}
                              </button>
                              <button type="button"
                                onClick={() => { setUseCustomPrefix(false); setSettings(s => ({ ...s, storagePath: '' })); setShowPrefixDropdown(false) }}
                                className="w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-muted/50 flex items-center justify-between"
                                style={{ color: !useCustomPrefix ? 'var(--primary)' : 'var(--foreground)' }}>
                                <span>{basePath}/</span>
                                {!useCustomPrefix && <CheckCircle size={10} />}
                              </button>
                            </div>
                          )
                        })()}
                        <input type="text" value={settings.storagePath}
                          onChange={e => setSettings(s => ({ ...s, storagePath: e.target.value }))}
                          placeholder="path"
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-r-lg border outline-none font-mono"
                          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 压缩 */}
                <div className="pt-3 border-t space-y-3" style={{ borderColor: 'var(--border)' }}>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={settings.compressEnabled}
                      onChange={e => setSettings(s => ({ ...s, compressEnabled: e.target.checked }))}
                      className="rounded" />
                    <span className="text-sm">压缩格式</span>
                  </label>
                  {settings.compressEnabled && (
                    <div className="pl-6">
                      <SelectDropdown
                        value={settings.compressionFormat}
                        options={[{ value: 'avif', label: 'AVIF' }, { value: 'webp', label: 'WebP' }]}
                        onChange={value => setSettings(s => ({ ...s, compressionFormat: value as 'webp' | 'avif' }))}
                        ariaLabel="压缩格式"
                        className="mb-3"
                      />
                      <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        目标大小: {settings.maxSizeMB > 0 ? `${settings.maxSizeMB.toFixed(1)} MB` : '不限'}
                      </label>
                      <input type="range" min={0} max={20} step={0.1}
                        value={settings.maxSizeMB}
                        onChange={e => setSettings(s => ({ ...s, maxSizeMB: +e.target.value }))}
                        aria-label="目标大小"
                        className="w-full h-1.5 mt-3 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:transition-transform [&::-moz-range-thumb]:hover:scale-110" />
                    </div>
                  )}

                  {/* 画廊显示 */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>在画廊中显示</span>
                    <ToggleSwitch checked={settings.showFlag}
                      onChange={v => setSettings(s => ({ ...s, showFlag: v }))} />
                  </div>

                  {/* GPS */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>移除 GPS 信息</span>
                    <ToggleSwitch checked={settings.stripGPS}
                      onChange={v => setSettings(s => ({ ...s, stripGPS: v }))} />
                  </div>
                </div>
              </div>

              {/* 上传按钮 */}
              <button onClick={handleUpload} disabled={pendingCount === 0 || !settings.storageSourceId}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-xl disabled:opacity-40 transition-all"
                style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                <CloudUpload size={16} />
                {!settings.storageSourceId ? '请先选择存储源' : `上传 ${pendingCount} 个文件`}
              </button>
            </div>
          </div>

          {/* 右侧：文件列表 */}
          <div className="lg:col-span-8">
            <div
              className={`min-h-[600px] rounded-xl border-2 border-dashed transition-all ${isDragging ? 'border-primary bg-primary/5' : ''}`}
              style={{ borderColor: isDragging ? undefined : 'var(--border)', '--wails-drop-target': 'drop' } as React.CSSProperties}
            >
              {items.length > 0 ? (
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={items.length > 0 && selectedIds.size === items.length}
                        onChange={toggleSelectAll} className="rounded" />
                      <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
                        {selectedIds.size > 0 ? `已选 ${selectedIds.size} 项` : `${items.length} 个文件`}
                      </span>
                      {selectedIds.size > 0 && (
                        <button onClick={removeSelected} className="p-1.5 rounded-md hover:bg-destructive/10" style={{ color: 'var(--destructive)' }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <button onClick={clearAll} className="text-xs hover:underline" style={{ color: 'var(--muted-foreground)' }}>清空全部</button>
                  </div>

                  <div className="space-y-0.5">
                    {items.map(item => (
                      <FileItem key={item.file.filePath} item={item}
                        selected={selectedIds.has(item.file.filePath)}
                        onSelect={() => toggleSelect(item.file.filePath)}
                        onRemove={() => removeItem(item.file.filePath)}
                        onPreview={() => setPreviewFile({ path: item.file.filePath, name: item.file.fileName })} />
                    ))}
                  </div>

                  <div className="mt-4 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors hover:border-solid"
                    style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                    onClick={handleFileDialog}>
                    <Upload size={20} className="mx-auto mb-1.5 opacity-30" />
                    <p className="text-xs">{preparingLabel || '点击、拖拽或粘贴图片以继续添加'}</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full min-h-[600px] cursor-pointer"
                  onClick={handleFileDialog}>
                  <div className="relative mb-6">
                    <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--muted)' }}>
                      <ImageIcon size={32} style={{ color: 'var(--muted-foreground)' }} />
                    </div>
                    {preparing && (
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: 'var(--background)', border: '2px solid var(--border)' }}>
                        <Loader2 size={12} className="animate-spin" />
                      </div>
                    )}
                  </div>
                  <p className="text-sm font-medium mb-1.5">{preparingLabel || '拖拽、粘贴照片到此处，或点击选择文件'}</p>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>支持 JPG、PNG、WebP、AVIF、TIFF 格式</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden"
        onChange={e => handleSelectFiles(e.target.files)} />

      {/* 图片预览弹窗 */}
      {previewFile && <PreviewModal filePath={previewFile.path} fileName={previewFile.name} onClose={() => setPreviewFile(null)} />}
    </>
  )
}

// ─── ToggleSwitch ─────────────────────────────────────

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
      style={{ backgroundColor: checked ? 'var(--primary)' : 'var(--muted)' }}>
      <span className={`pointer-events-none block size-4 rounded-full shadow-lg transition-transform ${
        checked ? 'translate-x-4' : 'translate-x-0.5'
      }`}
        style={{ backgroundColor: 'var(--background)' }} />
    </button>
  )
}

// ─── PreviewModal ─────────────────────────────────────

function PreviewModal({ filePath, fileName, onClose }: { filePath: string; fileName: string; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useCachedPageEffect(() => {
    setLoading(true)
    void GetFileThumbnail(filePath)
      .then((dataUrl: string) => { setSrc(dataUrl); setLoading(false) })
      .catch(() => setLoading(false))
  }, [filePath])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2 text-white">
          <span className="text-sm truncate">{fileName}</span>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          {loading ? (
            <Loader2 size={32} className="text-white animate-spin" />
          ) : src ? (
            <img src={src} alt={fileName} className="max-w-full max-h-[80vh] object-contain rounded-lg" />
          ) : (
            <p className="text-white/60">无法加载图片</p>
          )}
        </div>
      </div>
    </div>
  )
}

function mapUploadTaskStatus(task: UploadTask): UploadItem['status'] {
  if (task.status === 'completed') return 'done'
  if (task.status === 'failed') return 'error'
  if (task.status === 'checking') return 'checking'
  if (task.status === 'compressing') return 'compressing'
  return task.status
}

// ─── FileItem ─────────────────────────────────────────

function FileItem({ item, selected, onSelect, onRemove, onPreview }: {
  item: UploadItem; selected: boolean; onSelect: () => void; onRemove: () => void; onPreview: () => void
}) {
  const [thumbnail, setThumbnail] = useState<string | null>(null)

  useCachedPageEffect(() => {
    void GetFileThumbnail(item.file.filePath)
      .then((dataUrl: string) => setThumbnail(dataUrl))
      .catch(() => {})
  }, [item.file.filePath])

  const statusIcon = {
    pending: <FileImage size={14} style={{ color: 'var(--muted-foreground)' }} />,
    checking: <Loader2 size={14} className="animate-spin text-sky-500" />,
    compressing: <Loader2 size={14} className="animate-spin text-amber-500" />,
    uploading: <Loader2 size={14} className="animate-spin" />,
    done: <CheckCircle size={14} className="text-green-500" />,
    error: <AlertCircle size={14} style={{ color: 'var(--destructive)' }} />,
    duplicate: <AlertCircle size={14} className="text-yellow-500" />,
  }[item.status]

  const progress = Math.max(0, Math.min(100, item.progress ?? 0))
  const progressColor = {
    pending: 'transparent',
    checking: 'color-mix(in srgb, #0ea5e9 18%, transparent)',
    compressing: 'color-mix(in srgb, #f59e0b 18%, transparent)',
    uploading: 'color-mix(in srgb, var(--primary) 22%, transparent)',
    done: 'rgba(34, 197, 94, 0.18)',
    error: 'color-mix(in srgb, var(--destructive) 18%, transparent)',
    duplicate: 'rgba(234, 179, 8, 0.18)',
  }[item.status]

  return (
    <div className={`group relative overflow-hidden flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${selected ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
      {progress > 0 && (
        <div
          className="absolute inset-y-0 left-0 pointer-events-none transition-all duration-300"
          style={{ width: `${progress}%`, backgroundColor: progressColor }}
        />
      )}
      <GripVertical size={12} style={{ color: 'var(--muted-foreground)' }} className="relative z-10 opacity-0 group-hover:opacity-40 transition-opacity shrink-0 cursor-grab" />
      <input type="checkbox" checked={selected} onChange={onSelect} className="relative z-10 rounded shrink-0" />

      <div className="relative z-10 w-10 h-10 rounded-md overflow-hidden shrink-0 group/thumb" style={{ backgroundColor: 'var(--muted)' }}>
        {thumbnail ? <img src={thumbnail} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={14} style={{ color: 'var(--muted-foreground)' }} className="opacity-30" /></div>}
        <button onClick={onPreview}
          className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity rounded-md">
          <Maximize2 size={12} className="text-white" />
        </button>
      </div>

      <div className="relative z-10 flex-1 min-w-0">
        <p className="text-sm truncate">{item.file.fileName}</p>
        <p className="text-[11px] font-mono" style={{ color: 'var(--muted-foreground)' }}>
          {formatSize(item.file.fileSize)}
          {item.status === 'checking' && ' · 查重中'}
          {item.status === 'compressing' && ' · 压缩中'}
          {item.status === 'uploading' && ` · 上传中 ${progress}%`}
          {item.file.exif?.cameraModel && ` · ${item.file.exif.cameraModel}`}
          {item.file.exif?.focalLength && ` · ${item.file.exif.focalLength}`}
          {item.file.exif?.aperture && ` · ${item.file.exif.aperture}`}
          {item.file.exif?.iso && ` · ISO ${item.file.exif.iso}`}
        </p>
        {item.error && <p className="text-[11px] mt-0.5" style={{ color: item.status === 'duplicate' ? '#eab308' : 'var(--destructive)' }}>{item.error}</p>}
      </div>

      <div className="relative z-10 flex items-center gap-1.5 shrink-0">
        {statusIcon}
        <button onClick={onRemove} className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all" style={{ color: 'var(--muted-foreground)' }}>
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('无法读取剪贴板图片'))
    reader.onerror = () => reject(reader.error || new Error('无法读取剪贴板图片'))
    reader.readAsDataURL(file)
  })
}
