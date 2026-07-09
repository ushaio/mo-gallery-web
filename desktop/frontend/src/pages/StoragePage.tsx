import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import {
  HardDrive, Loader2, Check, X, ChevronLeft, ChevronRight,
} from 'lucide-react'

// ─── 类型定义（与 Web 端一致）───────────────────────

interface StorageFile {
  key: string
  url: string
  photoId?: string
  photoTitle?: string
  hasThumb?: boolean
  size: number
  lastModified?: string
  status: 'linked' | 'orphan' | 'missing' | 'missing_original' | 'missing_thumbnail'
  missingType?: string
}

interface StorageScanStats {
  total: number
  linked: number
  orphan: number
  missing: number
  missingOriginal: number
  missingThumbnail: number
}

interface Notification {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

// ─── 工具函数（与 Web 端一致）────────────────────────

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB']

function formatSize(bytes: number): string {
  if (bytes === 0) return '-'
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${SIZE_UNITS[i]}`
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif']

function isImageFile(key: string): boolean {
  const lower = key.toLowerCase()
  return IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext))
}

interface GroupedFiles {
  [folder: string]: StorageFile[]
}

function groupFilesByFolder(files: StorageFile[]): GroupedFiles {
  const grouped: GroupedFiles = {}
  for (const file of files) {
    const lastSlash = file.key.lastIndexOf('/')
    const folder = lastSlash >= 0 ? file.key.substring(0, lastSlash) : '/'
    if (!grouped[folder]) grouped[folder] = []
    grouped[folder].push(file)
  }
  return grouped
}

// ─── 主组件 ─────────────────────────────────────────

export function StoragePage() {
  const { language } = usePreferences()
  const [provider, setProvider] = useState('local')
  const [files, setFiles] = useState<StorageFile[]>([])
  const [stats, setStats] = useState<StorageScanStats>({
    total: 0, linked: 0, orphan: 0, missing: 0, missingOriginal: 0, missingThumbnail: 0,
  })
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false)
  const [cleanupDeleting, setCleanupDeleting] = useState(false)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const [reuploadFile, setReuploadFile] = useState<StorageFile | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [colWidths, setColWidths] = useState<Record<string, number | null>>({
    key: null, title: null, date: null, size: null, thumb: null, status: null,
  })
  const [generatingThumb, setGeneratingThumb] = useState<Set<string>>(new Set())
  const resizingCol = useRef<string | null>(null)
  const startX = useRef(0)
  const startWidth = useRef(0)

  // ─── 列宽调整 ─────────────────────────────────────

  const handleMouseDown = (col: string, e: React.MouseEvent) => {
    e.preventDefault()
    resizingCol.current = col
    startX.current = e.clientX
    const el = (e.target as HTMLElement).parentElement
    startWidth.current = el?.offsetWidth || 100
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizingCol.current) return
    const diff = e.clientX - startX.current
    const newWidth = Math.max(60, startWidth.current + diff)
    setColWidths(prev => ({ ...prev, [resizingCol.current!]: newWidth }))
  }

  const handleMouseUp = () => {
    resizingCol.current = null
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  // ─── 通知 ─────────────────────────────────────────────

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = crypto.randomUUID()
    setNotifications(prev => [...prev, { id, message, type }])
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000)
  }

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  // ─── 数据加载 ─────────────────────────────────────

  const groupedFiles = groupFilesByFolder(files)
  const sortedFolders = Object.keys(groupedFiles).sort()

  const toggleFolder = (folder: string) => {
    const newCollapsed = new Set(collapsedFolders)
    if (newCollapsed.has(folder)) {
      newCollapsed.delete(folder)
    } else {
      newCollapsed.add(folder)
    }
    setCollapsedFolders(newCollapsed)
  }

  const loadFiles = useCallback(async () => {
    if (!window || !(window as any).go?.main?.App?.ScanStorage) return
    setLoading(true)
    try {
      const result = await (window as any).go.main.App.ScanStorage({
        provider,
        status: statusFilter || undefined,
        search: search || undefined,
      })
      setFiles(result?.files || [])
      setStats(result?.stats || { total: 0, linked: 0, orphan: 0, missing: 0, missingOriginal: 0, missingThumbnail: 0 })
    } catch (err: any) {
      toast.error('扫描失败: ' + (err?.message || '未知错误'))
    } finally {
      setLoading(false)
    }
  }, [provider, statusFilter, search])

  useEffect(() => {
    loadFiles()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, statusFilter, search])

  const handleSearch = () => {
    setSearch(searchInput)
  }

  // ─── 清理操作 ─────────────────────────────────────

  const handleCleanup = async () => {
    if (selected.size === 0 || cleanupDeleting) return

    const orphanKeys = files
      .filter(f => selected.has(f.key) && f.status === 'orphan')
      .map(f => f.key)

    const missingIds = files
      .filter(f => selected.has(f.key) && f.status === 'missing' && f.photoId)
      .map(f => f.photoId!)

    setCleanupDeleting(true)
    try {
      if (orphanKeys.length > 0) {
        await (window as any).go.main.App.CleanupStorage(orphanKeys, provider)
      }

      if (missingIds.length > 0) {
        await (window as any).go.main.App.FixMissingPhotos(missingIds)
      }

      setSelected(new Set())
      setCleanupDialogOpen(false)
      loadFiles()
      toast.success('清理完成')
    } catch (err: any) {
      toast.error('清理失败: ' + (err?.message || '未知错误'))
    } finally {
      setCleanupDeleting(false)
    }
  }

  const toggleSelect = (key: string) => {
    const newSelected = new Set(selected)
    if (newSelected.has(key)) {
      newSelected.delete(key)
    } else {
      newSelected.add(key)
    }
    setSelected(newSelected)
  }

  const selectAll = () => {
    const actionable = files.filter(f => f.status !== 'linked')
    setSelected(new Set(actionable.map(f => f.key)))
  }

  // ─── 状态样式 ─────────────────────────────────────

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'linked': return 'text-green-600 dark:text-green-400'
      case 'orphan': return 'text-yellow-600 dark:text-yellow-400'
      case 'missing': return 'text-red-600 dark:text-red-400'
      case 'missing_original': return 'text-red-600 dark:text-red-400'
      case 'missing_thumbnail': return 'text-orange-600 dark:text-orange-400'
      default: return ''
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'linked': return `✓ ${t('admin.storage_linked')}`
      case 'orphan': return `⚠ ${t('admin.storage_orphan')}`
      case 'missing': return `✗ ${t('admin.storage_missing')}`
      case 'missing_original': return `✗ ${t('admin.storage_missing_original')}`
      case 'missing_thumbnail': return `⚠ ${t('admin.storage_missing_thumb')}`
      default: return status
    }
  }

  const isMissingStatus = (status: string) =>
    status === 'missing' || status === 'missing_original' || status === 'missing_thumbnail'

  // ─── 生成缩略图 ─────────────────────────────────────

  const handleGenerateThumb = async (file: StorageFile) => {
    if (!file.photoId) return
    try {
      setGeneratingThumb(prev => new Set(prev).add(file.photoId!))
      await (window as any).go.main.App.GenerateThumbnail(file.photoId)
      notify(t('admin.notify_success'), 'success')
      loadFiles()
    } catch (err: any) {
      toast.error('生成缩略图失败: ' + (err?.message || '未知错误'))
    } finally {
      setGeneratingThumb(prev => { const n = new Set(prev); n.delete(file.photoId!); return n })
    }
  }

  // ─── 渲染 ─────────────────────────────────────────

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-[1920px] p-6">
      <div className="pb-6 border-b mb-8" style={{ borderColor: 'var(--border)' }}>
        <h1 className="font-serif text-3xl">{t('admin.page_storage', language)}</h1>
      </div>

      {/* 帮助信息 */}
      <div className="mb-8 p-6 border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)/20' }}>
        <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>{t('admin.storage_help_title')}</div>
        <div className="text-xs font-mono" style={{ color: 'var(--primary)' }}>✓ {t('admin.storage_help_linked')}</div>
        <div className="text-xs font-mono" style={{ color: '#d97706' }}>⚠ {t('admin.storage_help_orphan')}</div>
        <div className="text-xs font-mono" style={{ color: 'var(--destructive)' }}>✗ {t('admin.storage_help_missing')}</div>
      </div>

      {/* 筛选器 */}
      <div className="flex flex-wrap gap-4 mb-8 items-end">
        <div className="space-y-2">
          <label className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>Provider</label>
          <select
            value={provider}
            onChange={e => setProvider(e.target.value)}
            className="px-3 py-1.5 text-xs rounded border outline-none"
            style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
          >
            <option value="local">{t('admin.storage_provider_local')}</option>
            <option value="s3">S3</option>
            <option value="github">{t('admin.storage_provider_github')}</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>Status</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded border outline-none"
            style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
          >
            <option value="">{t('admin.all_status')}</option>
            <option value="linked">{t('admin.storage_linked')}</option>
            <option value="orphan">{t('admin.storage_orphan')}</option>
            <option value="missing">{t('admin.storage_missing')}</option>
          </select>
        </div>

        <div className="flex gap-2 flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={t('common.search')}
            className="flex-1 px-3 py-1.5 text-sm rounded border outline-none"
            style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
          />
          <button
            onClick={handleSearch}
            className="px-4 py-2 text-xs rounded-md border"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
          >
            {t('common.search').replace('...', '')}
          </button>
        </div>

        <button
          onClick={() => loadFiles()}
          disabled={loading}
          className="px-6 py-2 text-xs rounded-md disabled:opacity-50"
          style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          {loading ? t('admin.storage_scanning') : t('admin.storage_scan')}
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <div className="p-4 border" style={{ borderColor: 'var(--border)' }}>
          <div className="text-2xl font-bold font-mono">{stats.total}</div>
          <div className="text-[9px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--muted-foreground)' }}>{t('admin.storage_total')}</div>
        </div>
        <div className="p-4 border" style={{ borderColor: 'var(--primary)/30', backgroundColor: 'var(--primary)/5' }}>
          <div className="text-2xl font-bold font-mono" style={{ color: 'var(--primary)' }}>{stats.linked}</div>
          <div className="text-[9px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--muted-foreground)' }}>{t('admin.storage_linked')}</div>
        </div>
        <div className="p-4 border" style={{ borderColor: '#f59e0b/30', backgroundColor: '#f59e0b/5' }}>
          <div className="text-2xl font-bold font-mono" style={{ color: '#f59e0b' }}>{stats.orphan}</div>
          <div className="text-[9px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--muted-foreground)' }}>{t('admin.storage_orphan')}</div>
        </div>
        <div className="p-4 border" style={{ borderColor: 'var(--destructive)/30', backgroundColor: 'var(--destructive)/5' }}>
          <div className="text-2xl font-bold font-mono" style={{ color: 'var(--destructive)' }}>{stats.missing}</div>
          <div className="text-[9px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--muted-foreground)' }}>{t('admin.storage_missing')}</div>
        </div>
        <div className="p-4 border" style={{ borderColor: 'var(--destructive)/20', backgroundColor: 'var(--destructive)/5' }}>
          <div className="text-2xl font-bold font-mono" style={{ color: 'var(--destructive)/80' }}>{stats.missingOriginal}</div>
          <div className="text-[9px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--muted-foreground)' }}>{t('admin.storage_missing_original')}</div>
        </div>
        <div className="p-4 border" style={{ borderColor: '#f97316/30', backgroundColor: '#f97316/5' }}>
          <div className="text-2xl font-bold font-mono" style={{ color: '#f97316' }}>{stats.missingThumbnail}</div>
          <div className="text-[9px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--muted-foreground)' }}>{t('admin.storage_missing_thumb')}</div>
        </div>
      </div>

      {/* 选中操作栏 */}
      {selected.size > 0 && (
        <div className="flex gap-4 mb-6 p-4 border" style={{ borderColor: 'var(--primary)/30', backgroundColor: 'var(--primary)/5' }}>
          <span className="text-xs font-bold uppercase tracking-widest">{t('admin.selected')} {selected.size}</span>
          <button
            onClick={() => setCleanupDialogOpen(true)}
            disabled={cleanupDeleting}
            className="px-4 py-2 text-xs rounded-md disabled:opacity-60 disabled:cursor-wait inline-flex items-center gap-2"
            style={{ backgroundColor: 'var(--destructive)', color: 'var(--destructive-foreground)' }}
          >
            {cleanupDeleting ? <Loader2 size={14} className="animate-spin" /> : null}
            {t('admin.storage_cleanup_selected')}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            disabled={cleanupDeleting}
            className="px-4 py-2 text-xs rounded-md border"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
          >
            {t('common.cancel')}
          </button>
        </div>
      )}

      {/* 文件列表 */}
      <div className="border" style={{ borderColor: 'var(--border)' }}>
        {/* 表头 */}
        <div className="flex items-center p-3" style={{ backgroundColor: 'var(--muted)/30', borderColor: 'var(--border)', borderBottomWidth: '1px' }}>
          <input
            type="checkbox"
            className="mr-4"
            onChange={e => e.target.checked ? selectAll() : setSelected(new Set())}
            checked={selected.size > 0 && selected.size === files.filter(f => f.status !== 'linked').length}
          />
          <span className="flex-1 min-w-[100px] relative border-r px-2 text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
            {t('admin.storage_file_key')}
            <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary/50" onMouseDown={e => handleMouseDown('key', e)} />
          </span>
          <span className="flex-1 min-w-[100px] hidden md:block relative border-r px-2 text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
            {t('admin.photo_title')}
            <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary/50" onMouseDown={e => handleMouseDown('title', e)} />
          </span>
          <span className="w-28 hidden lg:block text-right relative border-r px-2 text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
            {t('admin.storage_last_modified')}
            <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary/50" onMouseDown={e => handleMouseDown('date', e)} />
          </span>
          <span className="w-20 text-right relative border-r px-2 text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
            {t('admin.storage_file_size')}
            <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary/50" onMouseDown={e => handleMouseDown('size', e)} />
          </span>
          <span className="w-20 text-center relative border-r px-2 text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
            {t('admin.storage_thumb')}
            <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary/50" onMouseDown={e => handleMouseDown('thumb', e)} />
          </span>
          <span className="w-32 text-right px-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>{t('admin.storage_file_status')}</span>
        </div>

        {/* 文件列表 */}
        {files.length === 0 && !loading && (
          <div className="p-12 text-center">
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>{t('admin.storage_no_files')}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8" style={{ color: 'var(--muted-foreground)' }}>
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          sortedFolders.map(folder => (
            <div key={folder}>
              <div
                className="flex items-center p-3 cursor-pointer hover:bg-muted/50 transition-colors border-b"
                style={{ borderColor: 'var(--border)' }}
                onClick={() => toggleFolder(folder)}
              >
                <span className="mr-3 text-muted-foreground text-xs">{collapsedFolders.has(folder) ? '▶' : '▼'}</span>
                <span className="font-mono text-xs font-bold">{folder || '/'}</span>
                <span className="ml-2 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>({groupedFiles[folder].length})</span>
              </div>
              {!collapsedFolders.has(folder) && groupedFiles[folder].map(file => (
                <div key={file.key} className="flex items-center p-3 pl-8 border-b hover:bg-muted/30 transition-colors" style={{ borderColor: 'var(--border)' }}>
                  <input
                    type="checkbox"
                    className="mr-4"
                    checked={selected.has(file.key)}
                    onChange={() => toggleSelect(file.key)}
                    disabled={file.status === 'linked'}
                  />
                  <div className="flex-1 min-w-[100px] border-r px-2" style={{ borderColor: 'var(--border)/30' }}>
                    <div
                      className={`font-mono text-sm truncate ${
                        isMissingStatus(file.status)
                          ? 'cursor-pointer hover:text-red-500 hover:underline'
                          : isImageFile(file.key)
                            ? 'cursor-pointer hover:text-blue-600 hover:underline'
                            : ''
                      }`}
                      onClick={() => {
                        if (isMissingStatus(file.status)) {
                          setReuploadFile(file)
                        } else if (isImageFile(file.key)) {
                          setPreviewUrl(file.url)
                        }
                      }}
                      title={file.key}
                    >
                      {file.key.split('/').pop()}
                    </div>
                  </div>
                  <span className="flex-1 min-w-[100px] hidden md:block text-xs truncate border-r px-2" style={{ borderColor: 'var(--border)/30', color: 'var(--muted-foreground)' }} title={file.photoTitle}>
                    {file.photoTitle || '-'}
                  </span>
                  <span className="w-28 hidden lg:block text-right text-xs border-r px-2" style={{ borderColor: 'var(--border)/30', color: 'var(--muted-foreground)' }}>
                    {file.lastModified ? new Date(file.lastModified).toLocaleDateString() : '-'}
                  </span>
                  <span className="w-20 text-right text-sm border-r px-2" style={{ borderColor: 'var(--border)/30' }}>{formatSize(file.size)}</span>
                  <span className="w-20 text-center text-sm border-r px-2" style={{ borderColor: 'var(--border)/30' }}>
                    {file.status === 'linked' ? (
                      file.hasThumb ? (
                        <span className="text-green-600 dark:text-green-400">✓</span>
                      ) : generatingThumb.has(file.photoId || '') ? (
                        <span className="text-zinc-400 animate-pulse">...</span>
                      ) : (
                        <button
                          onClick={() => handleGenerateThumb(file)}
                          className="text-xs text-primary hover:underline normal-case"
                        >
                          {t('admin.storage_generate')}
                        </button>
                      )
                    ) : '-'}
                  </span>
                  <span
                    className={`w-32 text-right text-sm px-2 ${getStatusStyle(file.status)} ${isMissingStatus(file.status) ? 'cursor-pointer hover:underline' : ''}`}
                    onClick={() => isMissingStatus(file.status) && setReuploadFile(file)}
                  >
                    {getStatusLabel(file.status)}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* 预览模态框 */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-8"
          onClick={() => setPreviewUrl(null)}
        >
          <img
            src={previewUrl}
            alt={t('admin.preview')}
            className="max-w-full max-h-full object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center text-white/70 hover:text-white border border-white/20 hover:border-white/50 transition-all"
          >
            ✕
          </button>
        </div>
      )}

      {/* 通知 */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {notifications.map(n => (
          <div
            key={n.id}
            className={`px-4 py-2 rounded-md text-xs ${
              n.type === 'success' ? 'bg-green-500 text-white' :
              n.type === 'error' ? 'bg-red-500 text-white' :
              'bg-blue-500 text-white'
            }`}
          >
            {n.message}
          </div>
        ))}
      </div>
      <SimpleDeleteDialog
        isOpen={cleanupDialogOpen}
        title={t('common.confirm')}
        message={`确定要清理选中的 ${selected.size} 个存储项吗？孤立文件会被不可逆删除。`}
        onConfirm={handleCleanup}
        onCancel={() => setCleanupDialogOpen(false)}
        t={(key) => t(key, language)}
      />
      </div>
    </div>
  )
}
