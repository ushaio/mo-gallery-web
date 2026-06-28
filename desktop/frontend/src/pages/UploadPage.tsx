import { useState, useCallback, useRef } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import {
  Upload, X, CheckCircle, AlertCircle, Loader2, FileImage,
  Image as ImageIcon, Trash2, CloudUpload,
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
  const [isDragging, setIsDragging] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [categoryInput, setCategoryInput] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleSelectFiles(e.dataTransfer.files)
  }, [handleSelectFiles])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

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
    setSelectedIds(prev => { const n = new Set(prev); n.delete(filePath); return n })
  }

  const removeSelected = () => {
    setItems(prev => prev.filter(i => !selectedIds.has(i.file.filePath)))
    setSelectedIds(new Set())
  }

  const clearAll = () => { setItems([]); setSelectedIds(new Set()) }

  const toggleSelect = (filePath: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev)
      if (n.has(filePath)) n.delete(filePath)
      else n.add(filePath)
      return n
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(items.map(i => i.file.filePath)))
  }

  const pendingCount = items.filter(i => i.status === 'pending').length
  const doneCount = items.filter(i => i.status === 'done').length

  return (
    <>
      <PageHeader
        title={t('admin.page_upload', language)}
        description={items.length > 0 ? `${items.length} 个文件 · ${doneCount} 已上传 · ${pendingCount} 待上传` : undefined}
      />

      <div className="flex-1 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full p-6">
          {/* 左侧：上传设置 */}
          <div className="lg:col-span-4 overflow-auto">
            <div className="rounded-lg border p-4 space-y-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
              <h3 className="text-sm font-medium">上传设置</h3>

              {/* 分类 */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>分类</label>
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

              {/* 上传按钮 */}
              <button onClick={handleUpload} disabled={uploading || pendingCount === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs rounded-md disabled:opacity-50"
                style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
                {uploading ? '上传中...' : `上传 ${pendingCount} 个文件`}
              </button>
            </div>
          </div>

          {/* 右侧：文件列表 */}
          <div className="lg:col-span-8 overflow-auto">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`min-h-[500px] border-2 border-dashed rounded-lg transition-all ${
                isDragging ? 'border-primary bg-primary/5' : ''
              }`}
              style={{ borderColor: isDragging ? undefined : 'var(--border)' }}
            >
              {items.length > 0 ? (
                <div className="p-4">
                  {/* 工具栏 */}
                  <div className="flex items-center justify-between mb-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={items.length > 0 && selectedIds.size === items.length}
                        onChange={toggleSelectAll} className="rounded" />
                      <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        {selectedIds.size > 0 ? `已选 ${selectedIds.size} 项` : `${items.length} 个文件`}
                      </span>
                      {selectedIds.size > 0 && (
                        <button onClick={removeSelected}
                          className="p-1 rounded hover:opacity-80" style={{ color: 'var(--destructive)' }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <button onClick={clearAll}
                      className="text-xs hover:underline" style={{ color: 'var(--muted-foreground)' }}>
                      清空
                    </button>
                  </div>

                  {/* 文件列表 */}
                  <div className="space-y-1">
                    {items.map(item => (
                      <div key={item.file.filePath}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                          selectedIds.has(item.file.filePath) ? 'bg-primary/5' : 'hover:bg-muted/30'
                        }`}>
                        <input type="checkbox" checked={selectedIds.has(item.file.filePath)}
                          onChange={() => toggleSelect(item.file.filePath)} className="rounded" />

                        <div className="shrink-0">
                          {item.status === 'pending' && <FileImage size={16} style={{ color: 'var(--muted-foreground)' }} />}
                          {item.status === 'uploading' && <Loader2 size={16} className="animate-spin" style={{ color: 'var(--foreground)' }} />}
                          {item.status === 'done' && <CheckCircle size={16} className="text-green-500" />}
                          {item.status === 'error' && <AlertCircle size={16} style={{ color: 'var(--destructive)' }} />}
                          {item.status === 'duplicate' && <AlertCircle size={16} className="text-yellow-500" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{item.file.fileName}</p>
                          <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                            {formatSize(item.file.fileSize)}
                            {item.file.exif?.cameraModel && ` · ${item.file.exif.cameraModel}`}
                            {item.file.exif?.focalLength && ` · ${item.file.exif.focalLength}`}
                            {item.file.exif?.aperture && ` · ${item.file.exif.aperture}`}
                            {item.file.exif?.iso && ` · ISO ${item.file.exif.iso}`}
                          </p>
                          {item.error && (
                            <p className="text-[11px] mt-0.5"
                              style={{ color: item.status === 'duplicate' ? '#eab308' : 'var(--destructive)' }}>
                              {item.error}
                            </p>
                          )}
                        </div>

                        <button onClick={() => removeItem(item.file.filePath)}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:opacity-80 shrink-0"
                          style={{ color: 'var(--muted-foreground)' }}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* 追加文件 */}
                  <div className="mt-4 border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                    onClick={handleFileDialog}>
                    <Upload size={18} className="mx-auto mb-1 opacity-40" />
                    <p className="text-xs">点击追加文件</p>
                  </div>
                </div>
              ) : (
                /* 空状态 */
                <div className="flex flex-col items-center justify-center h-full min-h-[500px] cursor-pointer"
                  onClick={handleFileDialog}>
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                    style={{ backgroundColor: 'var(--muted)' }}>
                    <ImageIcon size={28} style={{ color: 'var(--muted-foreground)' }} />
                  </div>
                  <p className="text-sm font-medium mb-1">拖拽照片到此处，或点击选择文件</p>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    支持 JPG、PNG、WebP、AVIF、TIFF 格式
                  </p>
                  {preparing && (
                    <div className="flex items-center gap-2 mt-3">
                      <Loader2 size={14} className="animate-spin" />
                      <span className="text-xs">分析文件中...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden"
          onChange={(e) => handleSelectFiles(e.target.files)} />
      </div>
    </>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
