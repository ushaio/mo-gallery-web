import { useState, useCallback, useRef } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import {
  Upload, X, CheckCircle, AlertCircle, Loader2, FileImage,
  ChevronDown, ChevronUp, Image as ImageIcon,
} from 'lucide-react'

interface PreparedFile {
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
  status: 'pending' | 'uploading' | 'done' | 'error' | 'duplicate'
  error?: string
  photoId?: string
}

interface UploadSettings {
  categories: string[]
  compressEnabled: boolean
  maxSizeMB: number
  showFlag: boolean
  stripGPS: boolean
}

export function UploadPage() {
  const { language } = usePreferences()
  const [items, setItems] = useState<UploadItem[]>([])
  const [settings, setSettings] = useState<UploadSettings>({
    categories: [],
    compressEnabled: false,
    maxSizeMB: 0,
    showFlag: true,
    stripGPS: false,
  })
  const [preparing, setPreparing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showSettings, setShowSettings] = useState(true)
  const [categoryInput, setCategoryInput] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  // 选择文件
  const handleSelectFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const paths: string[] = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i] as any
      if (f.path) paths.push(f.path)
    }
    if (paths.length === 0) {
      alert('无法获取文件路径，请使用"选择文件"按钮')
      return
    }
    await processFiles(paths)
  }, [])

  // 使用 Go 文件对话框
  const handleFileDialog = useCallback(async () => {
    try {
      const paths: string[] = await (window as any).go.main.App.SelectFiles()
      if (paths && paths.length > 0) {
        await processFiles(paths)
      }
    } catch {
      fileInputRef.current?.click()
    }
  }, [])

  // 处理文件
  const processFiles = async (paths: string[]) => {
    setPreparing(true)
    try {
      const prepared: PreparedFile[] = await (window as any).go.main.App.PrepareUpload(paths)
      const hashes = prepared.filter(f => f.hash).map(f => f.hash)
      let duplicates: Record<string, any> = {}
      if (hashes.length > 0) {
        try {
          const dupResult = await (window as any).go.main.App.CheckDuplicates(hashes)
          duplicates = dupResult?.duplicates || {}
        } catch {}
      }
      const newItems: UploadItem[] = prepared.map(f => ({
        file: f,
        status: f.error ? 'error' : (duplicates[f.hash] ? 'duplicate' : 'pending'),
        error: f.error || (duplicates[f.hash] ? `已存在: ${duplicates[f.hash].title || ''}` : undefined),
      }))
      setItems(prev => [...prev, ...newItems])
    } catch (err: any) {
      console.error('预处理失败:', err)
    } finally {
      setPreparing(false)
    }
  }

  // 拖拽处理
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    handleSelectFiles(e.dataTransfer.files)
  }, [handleSelectFiles])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  // 开始上传
  const handleUpload = async () => {
    const pending = items.filter(i => i.status === 'pending')
    if (pending.length === 0) return
    setUploading(true)

    for (const item of pending) {
      setItems(prev => prev.map(i =>
        i.file.filePath === item.file.filePath ? { ...i, status: 'uploading' as const } : i
      ))
      try {
        const result = await (window as any).go.main.App.UploadFile(
          item.file.filePath,
          {
            title: item.file.fileName,
            categories: settings.categories,
            compressEnabled: settings.compressEnabled,
            maxSizeMB: settings.maxSizeMB,
            showFlag: settings.showFlag,
            stripGPS: settings.stripGPS,
            originFlag: 'web',
          },
          item.file.hash,
          item.file.exif || null,
        )
        if (result?.isDuplicate) {
          setItems(prev => prev.map(i =>
            i.file.filePath === item.file.filePath
              ? { ...i, status: 'duplicate' as const, error: `已存在: ${result.existing?.title || ''}` }
              : i
          ))
        } else if (result?.success) {
          setItems(prev => prev.map(i =>
            i.file.filePath === item.file.filePath
              ? { ...i, status: 'done' as const, photoId: result.photo?.id }
              : i
          ))
        } else {
          setItems(prev => prev.map(i =>
            i.file.filePath === item.file.filePath
              ? { ...i, status: 'error' as const, error: result?.error || '上传失败' }
              : i
          ))
        }
      } catch (err: any) {
        setItems(prev => prev.map(i =>
          i.file.filePath === item.file.filePath
            ? { ...i, status: 'error' as const, error: err?.message || '上传失败' }
            : i
        ))
      }
    }
    setUploading(false)
  }

  const removeItem = (filePath: string) => {
    setItems(prev => prev.filter(i => i.file.filePath !== filePath))
  }

  const clearAll = () => setItems([])

  const pendingCount = items.filter(i => i.status === 'pending').length
  const doneCount = items.filter(i => i.status === 'done').length

  return (
    <>
      <PageHeader
        title={t('nav.upload', language)}
        description={items.length > 0 ? `${items.length} 个文件 · ${doneCount} 已上传 · ${pendingCount} 待上传` : undefined}
        actions={items.length > 0 ? (
          <div className="flex items-center gap-2">
            <button onClick={clearAll}
              className="px-3 py-1.5 text-xs rounded-md"
              style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
              清空
            </button>
            <button onClick={handleUpload} disabled={uploading || pendingCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md disabled:opacity-50"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? '上传中...' : `上传 ${pendingCount} 个文件`}
            </button>
          </div>
        ) : undefined}
      />

      <div className="flex-1 overflow-hidden">
        {/* 空状态：大区域拖拽区 */}
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full p-6"
            onDrop={handleDrop} onDragOver={handleDragOver}>
            <div ref={dropRef}
              className="w-full max-w-2xl border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-colors hover:border-solid"
              style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
              onClick={handleFileDialog}>
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: 'var(--muted)' }}>
                <ImageIcon size={36} style={{ color: 'var(--muted-foreground)' }} />
              </div>
              <p className="text-base font-medium mb-2">拖拽照片到此处，或点击选择文件</p>
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                支持 JPG、PNG、WebP、AVIF、TIFF 格式
              </p>
              {preparing && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">分析文件中...</span>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden"
              onChange={(e) => handleSelectFiles(e.target.files)} />
          </div>
        ) : (
          /* 有文件：左右分栏 */
          <div className="flex h-full">
            {/* 左侧：文件列表 */}
            <div className="flex-1 overflow-auto p-4">
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.file.filePath}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg border"
                    style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
                    {/* 状态图标 */}
                    <div className="shrink-0">
                      {item.status === 'pending' && <FileImage size={18} style={{ color: 'var(--muted-foreground)' }} />}
                      {item.status === 'uploading' && <Loader2 size={18} className="animate-spin" style={{ color: 'var(--foreground)' }} />}
                      {item.status === 'done' && <CheckCircle size={18} className="text-green-500" />}
                      {item.status === 'error' && <AlertCircle size={18} style={{ color: 'var(--destructive)' }} />}
                      {item.status === 'duplicate' && <AlertCircle size={18} className="text-yellow-500" />}
                    </div>

                    {/* 文件信息 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{item.file.fileName}</p>
                      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        {formatSize(item.file.fileSize)}
                        {item.file.exif?.cameraModel && ` · ${item.file.exif.cameraModel}`}
                        {item.file.exif?.focalLength && ` · ${item.file.exif.focalLength}`}
                        {item.file.exif?.aperture && ` · ${item.file.exif.aperture}`}
                        {item.file.exif?.shutterSpeed && ` · ${item.file.exif.shutterSpeed}`}
                        {item.file.exif?.iso && ` · ISO ${item.file.exif.iso}`}
                      </p>
                      {item.error && (
                        <p className="text-xs mt-0.5"
                          style={{ color: item.status === 'duplicate' ? '#eab308' : 'var(--destructive)' }}>
                          {item.error}
                        </p>
                      )}
                    </div>

                    {/* 移除 */}
                    <button onClick={() => removeItem(item.file.filePath)}
                      className="p-1 rounded hover:opacity-80 shrink-0"
                      style={{ color: 'var(--muted-foreground)' }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* 追加文件区域 */}
              <div
                className="mt-4 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                onDrop={handleDrop} onDragOver={handleDragOver} onClick={handleFileDialog}>
                <Upload size={20} className="mx-auto mb-1 opacity-40" />
                <p className="text-xs">拖拽或点击追加文件</p>
              </div>
            </div>

            {/* 右侧：上传设置 */}
            <div className="w-72 border-l overflow-auto p-4 shrink-0" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setShowSettings(!showSettings)}
                className="flex items-center justify-between w-full mb-3">
                <span className="text-sm font-medium">上传设置</span>
                {showSettings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showSettings && (
                <div className="space-y-4">
                  {/* 分类 */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
                      分类
                    </label>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {settings.categories.map(c => (
                        <span key={c} className="flex items-center gap-1 px-2 py-0.5 text-xs rounded"
                          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}>
                          {c}
                          <button onClick={() => setSettings(s => ({
                            ...s, categories: s.categories.filter(x => x !== c)
                          }))}>
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                    <input type="text" placeholder="输入分类名，回车添加"
                      value={categoryInput}
                      onChange={e => setCategoryInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && categoryInput.trim()) {
                          setSettings(s => ({ ...s, categories: [...s.categories, categoryInput.trim()] }))
                          setCategoryInput('')
                        }
                      }}
                      className="w-full px-2 py-1 text-xs rounded border outline-none"
                      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }}
                    />
                  </div>

                  {/* 压缩 */}
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={settings.compressEnabled}
                        onChange={e => setSettings(s => ({ ...s, compressEnabled: e.target.checked }))}
                        className="rounded" />
                      <span className="text-xs">压缩为 AVIF</span>
                    </label>
                    {settings.compressEnabled && (
                      <div className="mt-2">
                        <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                          目标大小: {settings.maxSizeMB > 0 ? `${settings.maxSizeMB.toFixed(1)} MB` : '不限'}
                        </label>
                        <input type="range" min={0} max={20} step={0.1}
                          value={settings.maxSizeMB}
                          onChange={e => setSettings(s => ({ ...s, maxSizeMB: +e.target.value }))}
                          className="w-full mt-1" />
                      </div>
                    )}
                  </div>

                  {/* 显示 */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={settings.showFlag}
                      onChange={e => setSettings(s => ({ ...s, showFlag: e.target.checked }))}
                      className="rounded" />
                    <span className="text-xs">在画廊中显示</span>
                  </label>

                  {/* GPS */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={settings.stripGPS}
                      onChange={e => setSettings(s => ({ ...s, stripGPS: e.target.checked }))}
                      className="rounded" />
                    <span className="text-xs">移除 GPS 信息</span>
                  </label>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
