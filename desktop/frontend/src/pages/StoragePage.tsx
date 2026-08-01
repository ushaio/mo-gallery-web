import { useCallback, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileWarning,
  HardDrive,
  ImageOff,
  Link2,
  Loader2,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminInput, AdminSelect } from '@/components/admin/AdminFormControls'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { PageHeader } from '@/components/layout/PageHeader'
import { getErrorMessage } from '@/lib/auth-errors'
import { t } from '@/lib/i18n'
import { usePreferences } from '@/store/preferences'
import { CleanupStorage, FixMissingPhotos, GenerateThumbnail, ScanStorage } from '../../wailsjs/go/main/App'
import type { services } from '../../wailsjs/go/models'

// ── 类型定义 ───────────────────────────────────────────────

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
  [folder: string]: services.StorageFileDTO[]
}

function groupFilesByFolder(files: services.StorageFileDTO[]): GroupedFiles {
  const grouped: GroupedFiles = {}
  for (const file of files) {
    const lastSlash = file.key.lastIndexOf('/')
    const folder = lastSlash >= 0 ? file.key.substring(0, lastSlash) : '/'
    if (!grouped[folder]) grouped[folder] = []
    grouped[folder].push(file)
  }
  return grouped
}

export function StoragePage() {
  const { language } = usePreferences()
  const [provider, setProvider] = useState('local')
  const [files, setFiles] = useState<services.StorageFileDTO[]>([])
  const [stats, setStats] = useState<services.StorageScanStats>({
    total: 0, linked: 0, orphan: 0, missing: 0, missingOriginal: 0, missingThumbnail: 0,
  })
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false)
  const [cleanupDeleting, setCleanupDeleting] = useState(false)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const [generatingThumb, setGeneratingThumb] = useState<Set<string>>(new Set())
  const [colWidths, setColWidths] = useState<Record<string, number | null>>({
    key: null, title: null, date: null, size: null, thumb: null, status: null,
  })
  const resizingCol = useRef<string | null>(null)
  const startX = useRef(0)
  const startWidth = useRef(0)

  // ── 列宽调整 ─────────────────────────────────────────────

  const handleMouseDown = (col: string, e: ReactMouseEvent) => {
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

  // ── 数据加载 ─────────────────────────────────────────────

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
    setLoading(true)
    try {
      const result = await ScanStorage({
        provider,
        status: statusFilter || undefined,
        search: search || undefined,
      })
      setFiles(result?.files || [])
      setStats(result?.stats || { total: 0, linked: 0, orphan: 0, missing: 0, missingOriginal: 0, missingThumbnail: 0 })
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [provider, statusFilter, search])

  const handleSearch = () => {
    setSearch(searchInput)
  }

  // ── 清理操作 ─────────────────────────────────────────────

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
        await CleanupStorage(orphanKeys, provider)
      }

      if (missingIds.length > 0) {
        await FixMissingPhotos(missingIds)
      }

      setSelected(new Set())
      setCleanupDialogOpen(false)
      loadFiles()
      toast.success(t('admin.storage_cleanup_success', language))
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
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

  // ── 状态样式 ─────────────────────────────────────────────

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
      case 'linked': return `✓ ${t('admin.storage_linked', language)}`
      case 'orphan': return `⚠ ${t('admin.storage_orphan', language)}`
      case 'missing': return `✗ ${t('admin.storage_missing', language)}`
      case 'missing_original': return `✗ ${t('admin.storage_missing_original', language)}`
      case 'missing_thumbnail': return `⚠ ${t('admin.storage_missing_thumb', language)}`
      default: return status
    }
  }

  // ── 生成缩略图 ───────────────────────────────────────────

  const handleGenerateThumb = async (file: services.StorageFileDTO) => {
    if (!file.photoId) return
    setGeneratingThumb(prev => new Set(prev).add(file.photoId!))
    try {
      await GenerateThumbnail(file.photoId)
      toast.success(t('admin.notify_success', language))
      loadFiles()
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    } finally {
      setGeneratingThumb(prev => {
        const next = new Set(prev)
        next.delete(file.photoId!)
        return next
      })
    }
  }

  // ── 渲染 ─────────────────────────────────────────────────

  const providerOptions = [
    { value: 'local', label: t('admin.storage_provider_local', language) },
    { value: 's3', label: 'S3' },
    { value: 'github', label: t('admin.storage_provider_github', language) },
  ]

  const statusOptions = [
    { value: '', label: t('admin.all_status', language) },
    { value: 'linked', label: t('admin.storage_linked', language) },
    { value: 'orphan', label: t('admin.storage_orphan', language) },
    { value: 'missing', label: t('admin.storage_missing', language) },
  ]

  const statCards = [
    { labelKey: 'admin.storage_total', value: stats.total, icon: HardDrive, iconClass: 'bg-muted/60 text-muted-foreground', valueClass: 'text-foreground' },
    { labelKey: 'admin.storage_linked', value: stats.linked, icon: Link2, iconClass: 'bg-primary/10 text-primary', valueClass: 'text-primary' },
    { labelKey: 'admin.storage_orphan', value: stats.orphan, icon: AlertTriangle, iconClass: 'bg-amber-500/10 text-amber-500', valueClass: 'text-amber-500' },
    { labelKey: 'admin.storage_missing', value: stats.missing, icon: XCircle, iconClass: 'bg-destructive/10 text-destructive', valueClass: 'text-destructive' },
    { labelKey: 'admin.storage_missing_original', value: stats.missingOriginal, icon: FileWarning, iconClass: 'bg-destructive/10 text-destructive', valueClass: 'text-destructive' },
    { labelKey: 'admin.storage_missing_thumb', value: stats.missingThumbnail, icon: ImageOff, iconClass: 'bg-orange-500/10 text-orange-500', valueClass: 'text-orange-500' },
  ]

  return (
    <>
      <PageHeader title={t('admin.page_storage', language)} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1920px] space-y-6 p-6">
          {/* 状态说明 */}
          <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-4">
            <div className="text-xs font-semibold text-muted-foreground">
              {t('admin.storage_help_title', language)}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 size={14} className="shrink-0 text-primary" />
              <span>{t('admin.storage_help_linked', language)}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle size={14} className="shrink-0 text-amber-500" />
              <span>{t('admin.storage_help_orphan', language)}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <XCircle size={14} className="shrink-0 text-destructive" />
              <span>{t('admin.storage_help_missing', language)}</span>
            </div>
          </div>

          {/* 筛选器 */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="block text-xs text-muted-foreground">
                {t('admin.storage_provider', language)}
              </label>
              <AdminSelect
                value={provider}
                onChange={setProvider}
                options={providerOptions}
                className="min-w-[160px]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs text-muted-foreground">
                {t('admin.storage_file_status', language)}
              </label>
              <AdminSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={statusOptions}
                className="min-w-[160px]"
              />
            </div>

            <div className="flex min-w-[240px] flex-1 gap-2">
              <AdminInput
                variant="search"
                icon={Search}
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder={t('common.search', language)}
                className="flex-1"
              />
              <AdminButton
                onClick={handleSearch}
                adminVariant="outline"
                size="lg"
              >
                {t('common.search', language).replace('...', '')}
              </AdminButton>
              <AdminButton
                onClick={() => loadFiles()}
                disabled={loading}
                adminVariant="primary"
                size="lg"
                className="gap-2"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <HardDrive size={14} />}
                {loading ? t('admin.storage_scanning', language) : t('admin.storage_scan', language)}
              </AdminButton>
            </div>
          </div>

          {/* 统计卡片 */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {statCards.map(card => (
              <div key={card.labelKey} className="min-w-0 rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className={`text-2xl font-semibold tabular-nums ${card.valueClass}`}>{card.value}</div>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${card.iconClass}`}>
                    <card.icon size={16} />
                  </div>
                </div>
                <div className="mt-1.5 truncate text-xs text-muted-foreground">
                  {t(card.labelKey, language)}
                </div>
              </div>
            ))}
          </div>

          {/* 选中操作条 */}
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              <span className="text-xs font-semibold text-primary">
                {t('admin.selected', language)} {selected.size}
              </span>
              <AdminButton
                onClick={() => setCleanupDialogOpen(true)}
                disabled={cleanupDeleting}
                adminVariant="destructive"
                size="md"
                className="gap-1.5"
              >
                {cleanupDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {t('admin.storage_cleanup_selected', language)}
              </AdminButton>
              <AdminButton
                onClick={() => setSelected(new Set())}
                disabled={cleanupDeleting}
                adminVariant="outline"
                size="md"
              >
                {t('common.cancel', language)}
              </AdminButton>
            </div>
          )}

          {/* 文件列表 */}
          <div className="overflow-hidden rounded-lg border border-border">
            {/* 表头 */}
            <div className="flex select-none items-center border-b border-border bg-muted/40 p-3 text-xs font-semibold text-muted-foreground">
              <input
                type="checkbox"
                className="mr-4 shrink-0 accent-primary"
                onChange={e => e.target.checked ? selectAll() : setSelected(new Set())}
                checked={selected.size > 0 && selected.size === files.filter(f => f.status !== 'linked').length}
              />
              <span
                className="relative min-w-[100px] flex-1 border-r border-border/60 px-2"
                style={colWidths.key ? { width: colWidths.key, flex: 'none' } : undefined}
              >
                {t('admin.storage_file_key', language)}
                <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary/50" onMouseDown={e => handleMouseDown('key', e)} />
              </span>
              <span
                className="relative hidden min-w-[100px] flex-1 border-r border-border/60 px-2 md:block"
                style={colWidths.title ? { width: colWidths.title, flex: 'none' } : undefined}
              >
                {t('admin.photo_title', language)}
                <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary/50" onMouseDown={e => handleMouseDown('title', e)} />
              </span>
              <span
                className="relative hidden w-28 border-r border-border/60 px-2 text-right lg:block"
                style={colWidths.date ? { width: colWidths.date } : undefined}
              >
                {t('admin.storage_last_modified', language)}
                <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary/50" onMouseDown={e => handleMouseDown('date', e)} />
              </span>
              <span
                className="relative w-20 border-r border-border/60 px-2 text-right"
                style={colWidths.size ? { width: colWidths.size } : undefined}
              >
                {t('admin.storage_file_size', language)}
                <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary/50" onMouseDown={e => handleMouseDown('size', e)} />
              </span>
              <span
                className="relative w-20 border-r border-border/60 px-2 text-center"
                style={colWidths.thumb ? { width: colWidths.thumb } : undefined}
              >
                {t('admin.storage_thumb', language)}
                <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary/50" onMouseDown={e => handleMouseDown('thumb', e)} />
              </span>
              <span
                className="w-32 px-2 text-right"
                style={colWidths.status ? { width: colWidths.status } : undefined}
              >
                {t('admin.storage_file_status', language)}
              </span>
            </div>

            {/* 空状态 */}
            {files.length === 0 && !loading && (
              <div className="p-12 text-center">
                <p className="text-xs text-muted-foreground">{t('admin.storage_no_files', language)}</p>
              </div>
            )}

            {/* 加载中 */}
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : (
              sortedFolders.map(folder => (
                <div key={folder}>
                  {/* 文件夹行 */}
                  <div
                    className="flex cursor-pointer items-center border-b border-border bg-muted/40 p-3 transition-colors hover:bg-muted/60"
                    onClick={() => toggleFolder(folder)}
                  >
                    {collapsedFolders.has(folder)
                      ? <ChevronRight size={14} className="mr-3 shrink-0 text-muted-foreground" />
                      : <ChevronDown size={14} className="mr-3 shrink-0 text-muted-foreground" />}
                    <span className="truncate font-mono text-xs font-semibold">{folder || '/'}</span>
                    <span className="ml-2 shrink-0 font-mono text-[10px] text-muted-foreground">
                      ({groupedFiles[folder].length})
                    </span>
                  </div>

                  {/* 文件行 */}
                  {!collapsedFolders.has(folder) && groupedFiles[folder].map(file => (
                    <div
                      key={file.key}
                      className="flex items-center border-b border-border p-3 pl-8 transition-colors hover:bg-muted/30"
                    >
                      <input
                        type="checkbox"
                        className="mr-4 shrink-0 accent-primary"
                        checked={selected.has(file.key)}
                        onChange={() => toggleSelect(file.key)}
                        disabled={file.status === 'linked'}
                      />
                      <div
                        className="min-w-[100px] flex-1 border-r border-border/60 px-2"
                        style={colWidths.key ? { width: colWidths.key, flex: 'none' } : undefined}
                      >
                        <div
                          className={`truncate font-mono text-xs ${
                            isImageFile(file.key)
                              ? 'cursor-pointer hover:text-primary hover:underline'
                              : ''
                          }`}
                          onClick={() => {
                            if (isImageFile(file.key)) setPreviewUrl(file.url)
                          }}
                          title={file.key}
                        >
                          {file.key.split('/').pop()}
                        </div>
                      </div>
                      <span
                        className="hidden min-w-[100px] flex-1 truncate border-r border-border/60 px-2 text-xs text-muted-foreground md:block"
                        style={colWidths.title ? { width: colWidths.title, flex: 'none' } : undefined}
                        title={file.photoTitle}
                      >
                        {file.photoTitle || '-'}
                      </span>
                      <span
                        className="hidden w-28 border-r border-border/60 px-2 text-right text-xs text-muted-foreground lg:block"
                        style={colWidths.date ? { width: colWidths.date } : undefined}
                      >
                        {file.lastModified ? new Date(file.lastModified).toLocaleDateString() : '-'}
                      </span>
                      <span
                        className="w-20 border-r border-border/60 px-2 text-right text-xs"
                        style={colWidths.size ? { width: colWidths.size } : undefined}
                      >
                        {formatSize(file.size)}
                      </span>
                      <span
                        className="w-20 border-r border-border/60 px-2 text-center text-xs"
                        style={colWidths.thumb ? { width: colWidths.thumb } : undefined}
                      >
                        {file.status === 'linked' ? (
                          file.hasThumb ? (
                            <span className="text-green-600 dark:text-green-400">✓</span>
                          ) : generatingThumb.has(file.photoId || '') ? (
                            <span className="animate-pulse text-zinc-400">...</span>
                          ) : (
                            <AdminButton
                              onClick={() => handleGenerateThumb(file)}
                              adminVariant="link"
                              size="xs"
                              className="normal-case text-primary"
                            >
                              {t('admin.storage_generate', language)}
                            </AdminButton>
                          )
                        ) : '-'}
                      </span>
                      <span
                        className={`w-32 px-2 text-right text-xs ${getStatusStyle(file.status)}`}
                        style={colWidths.status ? { width: colWidths.status } : undefined}
                      >
                        {getStatusLabel(file.status)}
                      </span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 图片预览 */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8 backdrop-blur-sm"
          onClick={() => setPreviewUrl(null)}
        >
          <img
            src={previewUrl}
            alt={t('admin.preview', language)}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={e => e.stopPropagation()}
          />
          <AdminButton
            onClick={() => setPreviewUrl(null)}
            adminVariant="unstyled"
            size="none"
            className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-md border border-white/20 bg-black/40 text-white/80 transition-colors hover:border-white/50 hover:text-white"
            aria-label={t('admin.close_preview', language)}
          >
            <X size={18} />
          </AdminButton>
        </div>
      )}

      <SimpleDeleteDialog
        isOpen={cleanupDialogOpen}
        title={t('admin.storage_cleanup_selected', language)}
        message={`${t('admin.storage_cleanup_confirm', language)} (${selected.size})`}
        onConfirm={handleCleanup}
        onCancel={() => setCleanupDialogOpen(false)}
        t={(key) => t(key, language)}
      />
    </>
  )
}
