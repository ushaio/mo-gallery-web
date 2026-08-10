import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Cloud,
  Eye,
  FileImage,
  FileWarning,
  Folder,
  FolderOpen,
  Github,
  HardDrive,
  ImageOff,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import { getErrorMessage } from '@/lib/auth-errors'
import { t } from '@/lib/i18n'
import { usePreferences } from '@/store/preferences'
import { CleanupStorage, FixMissingPhotos, GenerateThumbnail, ScanStorage } from '../../wailsjs/go/main/App'
import type { services } from '../../wailsjs/go/models'

// ── 工具函数 ─────────────────────────────────────────────────

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB']

function formatSize(bytes: number): string {
  if (bytes === 0) return '-'
  const k = 1024
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), SIZE_UNITS.length - 1)
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${SIZE_UNITS[i]}`
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif']

function isImageFile(key: string): boolean {
  const lower = key.toLowerCase()
  return IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext))
}

function folderOf(key: string): string {
  const lastSlash = key.lastIndexOf('/')
  return lastSlash >= 0 ? key.substring(0, lastSlash) : '/'
}

// ── 持久化（与照片库/胶卷一致：localStorage + mo-gallery 前缀）──

const PROVIDER_KEY = 'mo-gallery:storage:provider'
const SECTIONS_KEY = 'mo-gallery:storage:sections'

function readLocal(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function writeLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore quota / privacy mode errors
  }
}

interface StorageSections {
  overview: boolean
  folders: boolean
}

function readSections(): StorageSections {
  try {
    const raw = window.localStorage.getItem(SECTIONS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StorageSections>
      return { overview: parsed.overview !== false, folders: parsed.folders !== false }
    }
  } catch {
    // ignore malformed state
  }
  return { overview: true, folders: true }
}

function writeSections(sections: StorageSections) {
  try {
    window.localStorage.setItem(SECTIONS_KEY, JSON.stringify(sections))
  } catch {
    // ignore quota / privacy mode errors
  }
}

// 文件夹树展开状态（null = 未初始化，首次进入默认展开第一层）
const EXPANDED_KEY = 'mo-gallery:storage:expanded-folders'

function readExpandedFolders(): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(EXPANDED_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {
    // ignore malformed state
  }
  return null
}

function writeExpandedFolders(paths: Set<string>) {
  try {
    window.localStorage.setItem(EXPANDED_KEY, JSON.stringify([...paths]))
  } catch {
    // ignore quota / privacy mode errors
  }
}

// ── 文件夹树 ─────────────────────────────────────────────────

interface FolderTreeNode {
  name: string
  path: string
  count: number
  children: FolderTreeNode[]
}

/** 由「目录路径 → 文件数」构建文件夹树；节点 count 为整棵子树的聚合文件数 */
function buildFolderTree(counts: Map<string, number>): FolderTreeNode[] {
  const roots: FolderTreeNode[] = []
  const index = new Map<string, FolderTreeNode>()

  for (const path of [...counts.keys()].sort()) {
    if (path === '/') {
      let root = index.get('/')
      if (!root) {
        root = { name: '/', path: '/', count: 0, children: [] }
        index.set('/', root)
        roots.push(root)
      }
      root.count = counts.get('/') ?? 0
      continue
    }

    const segments = path.split('/')
    let current = ''
    let siblings = roots
    for (let i = 0; i < segments.length; i++) {
      current = i === 0 ? segments[0] : `${current}/${segments[i]}`
      let node = index.get(current)
      if (!node) {
        node = { name: segments[i], path: current, count: 0, children: [] }
        index.set(current, node)
        siblings.push(node)
      }
      if (i === segments.length - 1) node.count = counts.get(path) ?? 0
      siblings = node.children
    }
  }

  const sortRecursive = (nodes: FolderTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name))
    for (const node of nodes) sortRecursive(node.children)
  }
  sortRecursive(roots)

  const aggregate = (node: FolderTreeNode): number => {
    let total = node.count
    for (const child of node.children) total += aggregate(child)
    node.count = total
    return total
  }
  for (const root of roots) aggregate(root)

  return roots
}

function countTreeNodes(nodes: FolderTreeNode[]): number {
  let total = nodes.length
  for (const node of nodes) total += countTreeNodes(node.children)
  return total
}

/** 首次进入的默认展开集合：展开第一层（顶层文件夹） */
function defaultExpandedFolders(nodes: FolderTreeNode[]): Set<string> {
  return new Set(nodes.map(node => node.path))
}

// ── 元数据 ───────────────────────────────────────────────────

interface ProviderOption {
  value: string
  label?: string
  labelKey?: string
  icon: LucideIcon
}

const PROVIDERS: ProviderOption[] = [
  { value: 'local', labelKey: 'admin.storage_provider_local', icon: HardDrive },
  { value: 's3', label: 'S3', icon: Cloud },
  { value: 'github', labelKey: 'admin.storage_provider_github', icon: Github },
]

interface StatusMeta {
  labelKey: string
  pillClass: string
  iconClass: string
}

const STATUS_META: Record<string, StatusMeta> = {
  linked: {
    labelKey: 'admin.storage_linked',
    pillClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    iconClass: 'text-emerald-500',
  },
  orphan: {
    labelKey: 'admin.storage_orphan',
    pillClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    iconClass: 'text-amber-500',
  },
  missing: {
    labelKey: 'admin.storage_missing',
    pillClass: 'bg-red-500/10 text-red-600 dark:text-red-400',
    iconClass: 'text-red-500',
  },
  missing_original: {
    labelKey: 'admin.storage_missing_original',
    pillClass: 'bg-red-500/10 text-red-600 dark:text-red-400',
    iconClass: 'text-red-500',
  },
  missing_thumbnail: {
    labelKey: 'admin.storage_missing_thumb',
    pillClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    iconClass: 'text-orange-500',
  },
}

function statusMeta(status: string): StatusMeta {
  return STATUS_META[status] || { labelKey: '', pillClass: 'bg-muted text-muted-foreground', iconClass: 'text-muted-foreground' }
}

// ── 小组件 ───────────────────────────────────────────────────

function SectionHeader({ label, count, open, onToggle }: { label: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex h-9 w-full shrink-0 items-center justify-between gap-2 border-b px-3 transition-colors hover:bg-secondary/60"
      style={{ borderColor: 'var(--border)' }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {open ? (
          <ChevronDown size={12} className="shrink-0" style={{ color: 'var(--muted-foreground)' }} />
        ) : (
          <ChevronRight size={12} className="shrink-0" style={{ color: 'var(--muted-foreground)' }} />
        )}
        <span className="text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      </span>
      <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>{count}</span>
    </button>
  )
}

function StatusPill({ status, language }: { status: string; language: 'zh' | 'en' }) {
  const meta = statusMeta(status)
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.pillClass}`}>
      <span className="size-1 rounded-full bg-current" />
      {meta.labelKey ? t(meta.labelKey, language) : status}
    </span>
  )
}

function FileThumb({ file }: { file: services.StorageFileDTO }) {
  const [failed, setFailed] = useState(false)
  const showImage = isImageFile(file.key) && Boolean(file.url) && !failed && file.status !== 'missing'

  let placeholder = <FileImage size={15} style={{ color: 'var(--muted-foreground)' }} />
  if (file.status === 'missing') placeholder = <FileWarning size={15} className="text-red-400" />
  else if (file.status === 'missing_thumbnail') placeholder = <ImageOff size={15} className="text-orange-400" />

  return (
    <span
      className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)' }}
    >
      {showImage ? (
        <img src={file.url} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-cover" />
      ) : placeholder}
    </span>
  )
}

// ── 主组件 ───────────────────────────────────────────────────

export function StoragePage() {
  const { language } = usePreferences()
  const [provider, setProvider] = useState(() => {
    const stored = readLocal(PROVIDER_KEY, 'local')
    return PROVIDERS.some(p => p.value === stored) ? stored : 'local'
  })
  const [files, setFiles] = useState<services.StorageFileDTO[]>([])
  const [stats, setStats] = useState<services.StorageScanStats>({
    total: 0, linked: 0, orphan: 0, missing: 0, missingOriginal: 0, missingThumbnail: 0,
  })
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [issuesOnly, setIssuesOnly] = useState(false)
  const [folderFilter, setFolderFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(false)
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false)
  const [cleanupDeleting, setCleanupDeleting] = useState(false)
  const [generatingThumb, setGeneratingThumb] = useState<Set<string>>(new Set())
  const [sections, setSections] = useState<StorageSections>(readSections)
  const [expandedFolders, setExpandedFolders] = useState<Set<string> | null>(readExpandedFolders)

  const toggleSection = (key: keyof StorageSections) => {
    setSections(prev => {
      const next = { ...prev, [key]: !prev[key] }
      writeSections(next)
      return next
    })
  }

  // ── 数据加载 ─────────────────────────────────────────────

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
      // 裁剪已不在结果中的选中项
      setSelected(prev => {
        const keys = new Set((result?.files || []).map(f => f.key))
        return new Set([...prev].filter(key => keys.has(key)))
      })
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [provider, statusFilter, search])

  // 首次进入自动扫描；菜单页常驻缓存后，切回本页不再重复扫描，
  // 需要最新结果时使用工具栏的「扫描 / 刷新」按钮（切换存储源或筛选条件仍会自动重扫）
  useCachedPageEffect(() => {
    void loadFiles()
  }, [loadFiles])

  // 搜索防抖（400ms 自动触发扫描）
  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => window.clearTimeout(handle)
  }, [searchInput])

  const switchProvider = (next: string) => {
    if (next === provider) return
    setProvider(next)
    writeLocal(PROVIDER_KEY, next)
    setFolderFilter(null)
    setSelected(new Set())
    setSearchInput('')
    setSearch('')
  }

  const clearSearch = () => {
    setSearchInput('')
    setSearch('')
  }

  // ── 客户端过滤：仅异常 + 文件夹 ─────────────────────────

  const baseList = useMemo(
    () => (issuesOnly ? files.filter(f => f.status !== 'linked') : files),
    [files, issuesOnly],
  )

  const visibleFiles = useMemo(() => {
    if (!folderFilter) return baseList
    // 根目录：只匹配直接位于根的文件；其他目录：匹配整棵子树
    if (folderFilter === '/') return baseList.filter(file => folderOf(file.key) === '/')
    return baseList.filter(file => file.key.startsWith(`${folderFilter}/`))
  }, [baseList, folderFilter])

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const file of baseList) {
      const folder = folderOf(file.key)
      counts.set(folder, (counts.get(folder) || 0) + 1)
    }
    return counts
  }, [baseList])

  const folderTree = useMemo(() => buildFolderTree(folderCounts), [folderCounts])
  const folderTreeNodeCount = useMemo(() => countTreeNodes(folderTree), [folderTree])

  // 展开状态：null 表示未初始化（渲染时按「默认展开第一层」展示），用户操作后持久化
  const expandedSet = useMemo(
    () => expandedFolders ?? defaultExpandedFolders(folderTree),
    [expandedFolders, folderTree],
  )

  const toggleFolderExpanded = (path: string) => {
    setExpandedFolders(prev => {
      const base = prev ?? defaultExpandedFolders(folderTree)
      const next = new Set(base)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      writeExpandedFolders(next)
      return next
    })
  }

  const renderFolderTree = (nodes: FolderTreeNode[], depth = 0): ReactNode => (
    nodes.map(node => {
      const active = folderFilter === node.path
      const hasChildren = node.children.length > 0
      const collapsed = !expandedSet.has(node.path)
      return (
        <div key={node.path} style={{ paddingLeft: `${7 + Math.min(5, depth) * 12}px` }}>
          <div
            className="mb-0.5 flex w-full items-center rounded-md pr-2 text-xs transition-colors hover:bg-secondary"
            style={{ backgroundColor: active ? 'var(--accent)' : undefined }}
          >
            {hasChildren ? (
              <button
                type="button"
                aria-label={node.name}
                onClick={() => toggleFolderExpanded(node.path)}
                className="mr-0.5 flex size-4 shrink-0 items-center justify-center rounded hover:bg-black/10"
              >
                {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              </button>
            ) : (
              <span className="mr-0.5 size-4 shrink-0" />
            )}
            <button
              type="button"
              onClick={() => setFolderFilter(active ? null : node.path)}
              onDoubleClick={() => { if (hasChildren) toggleFolderExpanded(node.path) }}
              className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
            >
              <Folder size={13} className="shrink-0" style={{ color: 'var(--muted-foreground)' }} />
              <span
                className="min-w-0 flex-1 truncate font-mono"
                style={{ color: active ? 'var(--accent-foreground)' : 'var(--foreground)' }}
                title={node.path}
              >
                {node.name}
              </span>
              <span
                className="rounded bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums"
                style={{ color: active ? 'var(--accent-foreground)' : 'var(--muted-foreground)' }}
              >
                {node.count}
              </span>
            </button>
          </div>
          {!collapsed && renderFolderTree(node.children, depth + 1)}
        </div>
      )
    })
  )

  const actionable = useMemo(() => visibleFiles.filter(f => f.status !== 'linked'), [visibleFiles])
  const allActionableSelected = actionable.length > 0 && actionable.every(f => selected.has(f.key))

  const toggleSelect = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAllActionable = () => setSelected(new Set(actionable.map(f => f.key)))
  const clearSelection = () => setSelected(new Set())

  const resetFilters = () => {
    setStatusFilter('')
    setIssuesOnly(false)
    setFolderFilter(null)
    setSearchInput('')
    setSearch('')
  }

  // ── 清理 / 缩略图操作 ───────────────────────────────────

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

  // ── 渲染数据 ─────────────────────────────────────────────

  const statusOptions = [
    { value: '', label: t('admin.all_status', language) },
    ...Object.keys(STATUS_META).map(status => ({ value: status, label: t(STATUS_META[status].labelKey, language) })),
  ]

  const statItems = [
    { status: '', labelKey: 'admin.storage_total', icon: HardDrive, count: stats.total, iconClass: 'text-muted-foreground' },
    { status: 'linked', labelKey: 'admin.storage_linked', icon: Link2, count: stats.linked, iconClass: STATUS_META.linked.iconClass },
    { status: 'orphan', labelKey: 'admin.storage_orphan', icon: AlertTriangle, count: stats.orphan, iconClass: STATUS_META.orphan.iconClass },
    { status: 'missing', labelKey: 'admin.storage_missing', icon: XCircle, count: stats.missing, iconClass: STATUS_META.missing.iconClass },
    { status: 'missing_original', labelKey: 'admin.storage_missing_original', icon: FileWarning, count: stats.missingOriginal, iconClass: STATUS_META.missing_original.iconClass },
    { status: 'missing_thumbnail', labelKey: 'admin.storage_missing_thumb', icon: ImageOff, count: stats.missingThumbnail, iconClass: STATUS_META.missing_thumbnail.iconClass },
  ]

  return (
    <>
      <PageHeader
        title={t('admin.page_storage', language)}
        description={`${stats.total} ${t('admin.storage_file_unit', language)}`}
        actions={
          <button
            onClick={() => void loadFiles()}
            disabled={loading}
            className="flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <HardDrive size={14} />}
            {loading ? t('admin.storage_scanning', language) : t('admin.storage_scan', language)}
          </button>
        }
      />

      {/* 内容工具栏：与照片库/胶卷保持一致的位置与样式 */}
      <div className="flex min-h-13 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--border)' }}>
        {/* 存储源切换 */}
        <div
          className="flex h-8 items-center rounded-md border bg-background p-0.5"
          style={{ borderColor: 'var(--border)' }}
          role="tablist"
          aria-label={t('admin.storage_provider', language)}
        >
          {PROVIDERS.map(({ value, label, labelKey, icon: Icon }) => {
            const active = provider === value
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchProvider(value)}
                className="flex h-7 items-center gap-1.5 rounded px-3 text-[11px] font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                style={{
                  backgroundColor: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                }}
              >
                <Icon size={12} />
                {labelKey ? t(labelKey, language) : label}
              </button>
            )
          })}
        </div>

        <SelectDropdown
          value={statusFilter}
          options={statusOptions}
          onChange={value => setStatusFilter(String(value))}
          placeholder={t('admin.all_status', language)}
          clearLabel={t('admin.all_status', language)}
          ariaLabel={t('admin.storage_file_status', language)}
          className="w-32 shrink-0"
        />

        {/* 仅异常 */}
        <button
          type="button"
          onClick={() => setIssuesOnly(value => !value)}
          className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors hover:bg-secondary"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: issuesOnly ? 'var(--accent)' : 'var(--background)',
            color: issuesOnly ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
          }}
        >
          <AlertTriangle size={12} />
          {t('admin.storage_only_issues', language)}
        </button>

        {/* 搜索 */}
        <div className="relative min-w-0 max-w-sm flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
          <input
            type="text"
            value={searchInput}
            onChange={event => setSearchInput(event.target.value)}
            onKeyDown={event => event.key === 'Enter' && setSearch(searchInput.trim())}
            placeholder={t('common.search', language)}
            className="h-8 w-full rounded-md border bg-input pl-8 pr-8 text-xs outline-none focus:ring-1"
            style={{ borderColor: 'var(--border)' }}
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label={t('common.close', language)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-secondary"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* 主区域：左侧概览/文件夹 + 右侧文件列表（桌面 master-detail） */}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r bg-card" style={{ borderColor: 'var(--border)' }}>
          {/* 状态概览 */}
          <div className="shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
            <SectionHeader
              label={t('admin.storage_section_overview', language)}
              count={files.length}
              open={sections.overview}
              onToggle={() => toggleSection('overview')}
            />
            {sections.overview && (
              <div className="p-2">
                {statItems.map(item => {
                  const active = statusFilter === item.status
                  return (
                    <button
                      key={item.status || 'total'}
                      type="button"
                      onClick={() => {
                        setFolderFilter(null)
                        setStatusFilter(item.status)
                      }}
                      className="mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-secondary"
                      style={{ backgroundColor: active ? 'var(--accent)' : undefined }}
                    >
                      <item.icon size={13} className={`shrink-0 ${item.iconClass}`} />
                      <span className="min-w-0 flex-1 truncate text-left" style={{ color: active ? 'var(--accent-foreground)' : 'var(--muted-foreground)' }}>
                        {t(item.labelKey, language)}
                      </span>
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums" style={{ color: active ? 'var(--accent-foreground)' : 'var(--foreground)' }}>
                        {item.count}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 文件夹（树形） */}
          <div className="flex min-h-0 flex-1 flex-col">
            <SectionHeader
              label={t('admin.storage_section_folders', language)}
              count={folderTreeNodeCount}
              open={sections.folders}
              onToggle={() => toggleSection('folders')}
            />
            {sections.folders && (
              <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
                <button
                  type="button"
                  onClick={() => setFolderFilter(null)}
                  className="mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-secondary"
                  style={{ backgroundColor: folderFilter === null ? 'var(--accent)' : undefined }}
                >
                  <FolderOpen size={13} className="shrink-0" style={{ color: 'var(--muted-foreground)' }} />
                  <span className="min-w-0 flex-1 truncate text-left" style={{ color: folderFilter === null ? 'var(--accent-foreground)' : 'var(--foreground)' }}>
                    {t('admin.storage_all_folders', language)}
                  </span>
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums" style={{ color: folderFilter === null ? 'var(--accent-foreground)' : 'var(--muted-foreground)' }}>
                    {baseList.length}
                  </span>
                </button>

                {renderFolderTree(folderTree)}

                {folderTree.length === 0 && (
                  <div className="px-2 py-6 text-center text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                    {t('admin.storage_no_files', language)}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* 右侧文件列表 */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* 列表头 */}
          <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b px-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex min-w-0 items-center gap-2">
              {folderFilter ? (
                <span
                  className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px]"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--secondary)' }}
                >
                  <Folder size={11} style={{ color: 'var(--muted-foreground)' }} />
                  <span className="max-w-56 truncate font-mono">{folderFilter}</span>
                  <button
                    type="button"
                    onClick={() => setFolderFilter(null)}
                    aria-label={t('common.close', language)}
                    className="rounded p-0.5 hover:bg-black/10"
                  >
                    <X size={10} />
                  </button>
                </span>
              ) : (
                <span className="text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>
                  {t('admin.storage_file_list', language)}
                </span>
              )}
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
                {visibleFiles.length}
              </span>
              {issuesOnly && (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                  <AlertTriangle size={10} />
                  {t('admin.storage_only_issues', language)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowGuide(value => !value)}
              className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[10px] transition-colors hover:bg-secondary"
              style={{ color: showGuide ? 'var(--primary)' : 'var(--muted-foreground)' }}
            >
              <CircleHelp size={12} />
              {t('admin.storage_help_title', language)}
            </button>
          </div>

          {/* 状态说明 */}
          {showGuide && (
            <div
              className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-1.5 text-[10px]"
              style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
            >
              <span className="flex items-center gap-1">
                <CheckCircle2 size={11} className="shrink-0 text-emerald-500" />
                {t('admin.storage_help_linked', language)}
              </span>
              <span className="flex items-center gap-1">
                <AlertTriangle size={11} className="shrink-0 text-amber-500" />
                {t('admin.storage_help_orphan', language)}
              </span>
              <span className="flex items-center gap-1">
                <XCircle size={11} className="shrink-0 text-red-500" />
                {t('admin.storage_help_missing', language)}
              </span>
            </div>
          )}

          {/* 选中操作条 */}
          {selected.size > 0 && (
            <div
              className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2"
              style={{ borderColor: 'var(--border)', backgroundColor: 'color-mix(in srgb, var(--primary) 6%, transparent)' }}
            >
              <span className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>
                {t('admin.selected', language)} {selected.size}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllActionable}
                  className="flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] transition-colors hover:bg-secondary"
                  style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                >
                  <CheckCircle2 size={12} />
                  {t('admin.storage_select_all', language)}
                </button>
                <button
                  type="button"
                  onClick={() => setCleanupDialogOpen(true)}
                  disabled={cleanupDeleting}
                  className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
                  style={{ backgroundColor: 'var(--destructive)', color: 'var(--destructive-foreground)' }}
                >
                  {cleanupDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  {t('admin.storage_cleanup_selected', language)}
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={cleanupDeleting}
                  className="flex h-7 items-center rounded-md border px-2.5 text-[11px] transition-colors hover:bg-secondary disabled:opacity-50"
                  style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                >
                  {t('common.cancel', language)}
                </button>
              </div>
            </div>
          )}

          {/* 列头 */}
          {visibleFiles.length > 0 && !loading && (
            <div
              className="hidden shrink-0 items-center gap-3 border-b px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] lg:flex"
              style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
            >
              <span className="flex w-8 shrink-0">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={allActionableSelected}
                  onChange={event => (event.target.checked ? selectAllActionable() : clearSelection())}
                  disabled={actionable.length === 0}
                  aria-label={t('admin.storage_select_all', language)}
                />
              </span>
              <span className="w-12 shrink-0" />
              <span className="min-w-0 flex-1">{t('admin.storage_file_key', language)}</span>
              <span className="hidden w-44 shrink-0 xl:block">{t('admin.photo_title', language)}</span>
              <span className="w-16 shrink-0 text-right">{t('admin.storage_file_size', language)}</span>
              <span className="hidden w-24 shrink-0 text-right md:block">{t('admin.storage_last_modified', language)}</span>
              <span className="w-28 shrink-0 text-right">{t('admin.storage_file_status', language)}</span>
              <span className="w-14 shrink-0" />
            </div>
          )}

          {/* 文件行 */}
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="flex items-center gap-3 border-b px-3 py-2" style={{ borderColor: 'var(--border)' }}>
                  <div className="size-4 shrink-0 animate-pulse rounded" style={{ backgroundColor: 'var(--muted)' }} />
                  <div className="size-11 shrink-0 animate-pulse rounded-md" style={{ backgroundColor: 'var(--muted)' }} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-3 w-1/3 animate-pulse rounded" style={{ backgroundColor: 'var(--muted)' }} />
                    <div className="h-2 w-1/4 animate-pulse rounded" style={{ backgroundColor: 'var(--muted)' }} />
                  </div>
                </div>
              ))
            ) : files.length === 0 ? (
              <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 p-6" style={{ color: 'var(--muted-foreground)' }}>
                <span className="flex size-14 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--muted)' }}>
                  <HardDrive size={24} />
                </span>
                <p className="text-sm">{t('admin.storage_no_files', language)}</p>
                <button
                  onClick={() => void loadFiles()}
                  className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs"
                  style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                >
                  <HardDrive size={14} />
                  {t('admin.storage_scan', language)}
                </button>
              </div>
            ) : visibleFiles.length === 0 ? (
              <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 p-6" style={{ color: 'var(--muted-foreground)' }}>
                <span className="flex size-14 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--muted)' }}>
                  <Search size={24} />
                </span>
                <p className="text-sm">{t('admin.storage_no_match', language)}</p>
                <button onClick={resetFilters} className="text-xs underline-offset-2 hover:underline" style={{ color: 'var(--muted-foreground)' }}>
                  {t('common.reset', language)}
                </button>
              </div>
            ) : (
              visibleFiles.map(file => {
                const selectedRow = selected.has(file.key)
                const name = file.key.split('/').pop() || file.key
                return (
                  <div
                    key={file.key}
                    className="group flex items-center gap-3 border-b px-3 py-2 transition-colors hover:bg-muted/30"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: selectedRow ? 'color-mix(in srgb, var(--accent) 55%, transparent)' : undefined,
                    }}
                  >
                    <span className="flex w-8 shrink-0">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--primary)]"
                        checked={selectedRow}
                        onChange={() => toggleSelect(file.key)}
                        disabled={file.status === 'linked'}
                        title={file.status === 'linked' ? t('admin.storage_help_linked', language) : undefined}
                      />
                    </span>
                    <FileThumb file={file} />
                    <div className="min-w-0 flex-1">
                      <div
                        className={`truncate font-mono text-xs ${isImageFile(file.key) ? 'cursor-pointer hover:text-primary hover:underline' : ''}`}
                        title={file.key}
                        onClick={() => {
                          if (isImageFile(file.key)) setPreviewUrl(file.url)
                        }}
                      >
                        {name}
                      </div>
                      <div className="truncate text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                        {folderOf(file.key)}
                      </div>
                    </div>
                    <span className="hidden w-44 shrink-0 truncate text-xs xl:block" style={{ color: 'var(--muted-foreground)' }} title={file.photoTitle}>
                      {file.photoTitle || '-'}
                    </span>
                    <span className="w-16 shrink-0 text-right text-xs tabular-nums">{formatSize(file.size)}</span>
                    <span className="hidden w-24 shrink-0 text-right text-[11px] md:block" style={{ color: 'var(--muted-foreground)' }}>
                      {file.lastModified ? new Date(file.lastModified).toLocaleDateString() : '-'}
                    </span>
                    <span className="flex w-28 shrink-0 justify-end">
                      <StatusPill status={file.status} language={language} />
                    </span>
                    <span className="flex w-14 shrink-0 items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
                      {isImageFile(file.key) && (
                        <button
                          type="button"
                          onClick={() => setPreviewUrl(file.url)}
                          title={t('admin.preview', language)}
                          className="rounded p-1 transition-colors hover:bg-secondary"
                          style={{ color: 'var(--muted-foreground)' }}
                        >
                          <Eye size={13} />
                        </button>
                      )}
                      {file.status === 'linked' && !file.hasThumb && (
                        <button
                          type="button"
                          onClick={() => void handleGenerateThumb(file)}
                          disabled={generatingThumb.has(file.photoId || '')}
                          title={t('admin.storage_generate', language)}
                          className="rounded p-1 transition-colors hover:bg-secondary"
                          style={{ color: generatingThumb.has(file.photoId || '') ? 'var(--muted-foreground)' : 'var(--primary)' }}
                        >
                          {generatingThumb.has(file.photoId || '') ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <RefreshCw size={13} />
                          )}
                        </button>
                      )}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </main>
      </div>

      {/* 底部状态栏：与照片库一致 */}
      <div className="flex min-h-10 shrink-0 items-center gap-3 border-t px-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          <span>{stats.total} {t('admin.storage_file_unit', language)}</span>
          <span className="opacity-60">·</span>
          <span className="flex items-center gap-1 text-emerald-500">
            <Link2 size={11} />{stats.linked} {t('admin.storage_linked', language)}
          </span>
          <span className="opacity-60">·</span>
          <span className="flex items-center gap-1 text-amber-500">
            <AlertTriangle size={11} />{stats.orphan} {t('admin.storage_orphan', language)}
          </span>
          <span className="opacity-60">·</span>
          <span className="flex items-center gap-1 text-red-500">
            <XCircle size={11} />{stats.missing + stats.missingOriginal + stats.missingThumbnail} {t('admin.storage_missing', language)}
          </span>
          {folderFilter && (
            <>
              <span className="opacity-60">·</span>
              <span className="max-w-48 truncate font-mono">{folderFilter}</span>
            </>
          )}
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadFiles()}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] hover:bg-secondary disabled:cursor-wait disabled:opacity-50"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          {t('common.refresh', language)}
        </button>
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
            onClick={event => event.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setPreviewUrl(null)}
            aria-label={t('admin.close_preview', language)}
            className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-md border border-white/20 bg-black/40 text-white/80 transition-colors hover:border-white/50 hover:text-white"
          >
            <X size={18} />
          </button>
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
