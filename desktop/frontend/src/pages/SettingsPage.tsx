import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  clearCloudLibraryPageCache,
  clearDesktopRuntimeCache,
  clearEquipmentCache,
  clearOverviewPageCache,
  getDesktopCacheSnapshot,
} from '@/lib/app-cache'
import { clearCurrentPersistentCache, getCurrentPersistentCacheScope } from '@/lib/persistent-cache'
import { useAuth } from '@/contexts/AuthContext'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { formatBytes } from '@/lib/utils'
import { Skeleton } from '@/components/admin/Skeleton'
import {
  ClearLocalLibraryPreviewCache,
  ClearLogs,
  CreateStorageSource,
  DeleteComment,
  DeleteStorageSource,
  GetAiConfig,
  GetComments,
  GetLinuxDoAuthUrl,
  GetLinuxDoBinding,
  GetLocalLibraryCacheStats,
  GetLocalLibraryPreferences,
  GetLogConfig,
  GetLogs,
  GetLogStats,
  GetSettings,
  GetStorageSources,
  GetStoryAiProviderModels,
  IsLinuxDoEnabled,
  OpenLogDir,
  SetLocalLibraryImportMode,
  UnbindLinuxDoAccount,
  UpdateAiConfig,
  UpdateCommentStatus,
  UpdateLogConfig,
  UpdateSettings,
  UpdateStorageSource,
} from '../../wailsjs/go/main/App'
import { config as wailsConfig, local_library, type services } from '../../wailsjs/go/models'
import { version } from '../../package.json'
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime'
import { getWindowAppearance, restartApplication, updateWindowStyle, type WindowAppearance, type WindowStyle } from '@/lib/window-appearance'
import {
  Settings, Info,
  Save, Loader2, HardDrive, MessageSquare, User, Server, RefreshCw,
  Pencil, Trash2, Plus, X, Check, Cloud,
  Unlink, Link, Sparkles, Eye, EyeOff,
  FileText, Trash, Filter, FolderOpen, FolderInput, Copy, Database, Image as ImageIcon,
  Github, ExternalLink, LayoutDashboard, Images, ChevronRight,
  AppWindow, Monitor, Moon, Palette, Sun,
} from 'lucide-react'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { SelectDropdown } from '@/components/ui/SelectDropdown'

// ─── 与 Web 端一致的 5 个标签 ────────────────────────

type Tab = 'site' | 'appearance' | 'storage' | 'local-library' | 'comments' | 'account' | 'ai' | 'log' | 'cache' | 'about'
type CommentsSubTab = 'manage' | 'config'

const OFFLINE_SETTINGS_TABS = new Set<Tab>(['appearance', 'local-library', 'ai', 'log', 'cache', 'about'])

export function SettingsPage() {
  const { isAuthenticated } = useAuth()
  const { language } = usePreferences()
  const [tab, setTab] = useState<Tab>(() => isAuthenticated ? 'site' : 'appearance')
  const [config, setConfig] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const activeTab = isAuthenticated || OFFLINE_SETTINGS_TABS.has(tab) ? tab : 'appearance'

  const fetchSettings = useCallback(async () => {
    if (!isAuthenticated) {
      setConfig({})
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const result = await GetSettings()
      setConfig(result || {})
    } catch (err) {
      console.error('获取设置失败:', err)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => { void fetchSettings() }, [fetchSettings])

  const updateConfig = (key: string, value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const handleSave = async () => {
    if (!isAuthenticated) return
    setSaving(true)
    try {
      const result = await UpdateSettings(config)
      setConfig(result || {})
      setDirty(false)
      toast.success('设置已保存')
    } catch (error: unknown) {
      toast.error('保存失败: ' + getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const tabs = ([
    { key: 'site', label: '站点', icon: Server },
    { key: 'appearance', label: '外观', icon: Palette },
    { key: 'storage', label: '存储', icon: HardDrive },
    { key: 'local-library', label: '本地资源库', icon: FolderOpen },
    { key: 'comments', label: '评论', icon: MessageSquare },
    { key: 'account', label: '账户', icon: User },
    { key: 'ai', label: '模型配置', icon: Sparkles },
    { key: 'log', label: '日志', icon: FileText },
    { key: 'cache', label: '缓存', icon: Database },
    { key: 'about', label: '关于', icon: Info },
  ] satisfies { key: Tab; label: string; icon: typeof Settings }[]).filter(({ key }) => isAuthenticated || OFFLINE_SETTINGS_TABS.has(key))

  // site 与 comments/config 标签有保存按钮（其他标签要么只读要么有独立保存）
  const showSaveButton = isAuthenticated && (activeTab === 'comments' || activeTab === 'site')

  return (
    <>
      <PageHeader
        title={t('admin.page_settings', language)}
        actions={dirty && showSaveButton ? (
          <button onClick={handleSave} disabled={saving}
            className={btnPrimary}
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? '保存中...' : t('common.save', language)}
          </button>
        ) : undefined}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧标签栏 */}
        <div className="flex w-48 shrink-0 flex-col overflow-hidden border-r p-3" style={{ borderColor: 'var(--border)' }}>
          <div className="custom-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setTab(key)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-secondary"
                style={{
                  backgroundColor: activeTab === key ? 'var(--accent)' : 'transparent',
                  color: activeTab === key ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                }}>
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>

        </div>

        {/* 右侧内容 */}
        <div className={activeTab === 'ai' || activeTab === 'cache' ? 'flex-1 overflow-hidden' : 'flex-1 overflow-auto p-6'}>
          {loading ? (
            <div className="max-w-2xl space-y-6">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : activeTab === 'ai' ? (
            <div className="h-full min-h-0">
              <AiTab />
            </div>
          ) : activeTab === 'cache' ? (
            <div className="h-full min-h-0">
              <CacheTab />
            </div>
          ) : (
            <div className="max-w-2xl">
              {activeTab === 'site' && <SiteTab config={config} updateConfig={updateConfig} />}
              {activeTab === 'appearance' && <AppearanceTab />}
              {activeTab === 'storage' && <StorageTab />}
              {activeTab === 'local-library' && <LocalLibraryTab onManageCache={() => setTab('cache')} />}
              {activeTab === 'comments' && <CommentsTab config={config} updateConfig={updateConfig} />}
              {activeTab === 'account' && <AccountTab />}
              {activeTab === 'log' && <LogTab />}
              {activeTab === 'about' && <AboutTab />}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Tab 1: 站点（与 Web 端一致：site_title 和 cdn_domain 只读） ──

function SiteTab({ config }: {
  config: Record<string, string>
  updateConfig: (key: string, value: string) => void
}) {
  return (
    <div className="space-y-6">
      <Section title="站点信息">
        <Field label="站点标题" description="通过 .env 文件中的 SITE_TITLE 配置">
          <input type="text" value={config.site_title || ''} disabled
            className={`${inputClass} cursor-not-allowed opacity-60`}
            style={inputStyle} />
        </Field>
        <Field label="CDN 域名" description="通过 .env 文件中的 CDN_DOMAIN 配置">
          <input type="text" value={config.cdn_domain || ''} disabled
            className={`${inputClass} cursor-not-allowed opacity-60`}
            style={inputStyle} />
        </Field>
      </Section>
    </div>
  )
}

// ─── Tab 2: 外观 ─────────────────────────────────────

const themeChoices = [
  { value: 'light' as const, label: '浅色', icon: Sun },
  { value: 'dark' as const, label: '深色', icon: Moon },
  { value: 'system' as const, label: '跟随系统', icon: Monitor },
]

const windowStyleChoices: { value: WindowStyle; label: string; description: string }[] = [
  { value: 'native', label: '原生', description: '使用操作系统提供的标题栏与窗口控制按钮。' },
  { value: 'integrated', label: '一体化', description: '使用与应用界面一致的紧凑标题栏和窗口控制按钮。' },
]

function AppearanceTab() {
  const { theme, setTheme, language } = usePreferences()
  const [appearance, setAppearance] = useState<WindowAppearance | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingStyle, setSavingStyle] = useState<WindowStyle | null>(null)
  const [restartDialogOpen, setRestartDialogOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    getWindowAppearance()
      .then((result) => {
        if (!cancelled) setAppearance(result)
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error('读取窗口外观失败: ' + getErrorMessage(error))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const handleWindowStyleChange = async (style: WindowStyle) => {
    if (savingStyle || appearance?.configuredStyle === style) return
    setSavingStyle(style)
    try {
      const result = await updateWindowStyle(style)
      setAppearance(result)
      if (result.activeStyle === result.configuredStyle) {
        toast.success('窗口风格已保存')
      } else {
        setRestartDialogOpen(true)
      }
    } catch (error: unknown) {
      toast.error('保存窗口风格失败: ' + getErrorMessage(error))
    } finally {
      setSavingStyle(null)
    }
  }

  const handleRestartConfirm = async () => {
    toast.success('正在重新加载窗口…')
    try {
      await restartApplication()
      setRestartDialogOpen(false)
    } catch (error: unknown) {
      toast.error('自动切换窗口风格失败: ' + getErrorMessage(error))
    }
  }

  const handleRestartCancel = () => {
    setRestartDialogOpen(false)
    toast.info('窗口风格已保存，将在下次启动时生效')
  }

  const configuredStyle = appearance?.configuredStyle ?? 'native'
  const restartRequired = Boolean(appearance && appearance.activeStyle !== appearance.configuredStyle)

  return (
    <div className="space-y-6">
      <Section title="主题" description="调整应用界面的明暗外观，修改后立即生效。">
        <div className="flex h-10 items-center rounded-md border bg-background p-0.5" role="radiogroup" aria-label="主题">
          {themeChoices.map(({ value, label, icon: Icon }) => {
            const selected = theme === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(value)}
                className="flex h-8 min-w-0 flex-1 items-center justify-center gap-2 rounded px-3 text-xs font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                style={{
                  backgroundColor: selected ? 'var(--accent)' : 'transparent',
                  color: selected ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                }}
              >
                <Icon size={14} />
                <span className="truncate">{label}</span>
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="窗口风格" description="窗口边框由桌面运行时创建，保存后会询问是否立即重启以应用新的外观。">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-md" />
            <Skeleton className="h-16 w-full rounded-md" />
          </div>
        ) : (
          <div className="divide-y border-y" role="radiogroup" aria-label="窗口风格" style={{ borderColor: 'var(--border)' }}>
            {windowStyleChoices.map(({ value, label, description }) => {
              const selected = configuredStyle === value
              const saving = savingStyle === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={savingStyle !== null}
                  onClick={() => void handleWindowStyleChange(value)}
                  className="flex w-full items-center gap-3 px-2 py-3 text-left transition-colors hover:bg-secondary disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--muted)' }}>
                    {value === 'native' ? <Monitor size={16} /> : <AppWindow size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium">{label}</span>
                    <span className="mt-0.5 block text-[11px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{description}</span>
                  </span>
                  {saving ? <Loader2 size={14} className="shrink-0 animate-spin" /> : selected ? <Check size={14} className="shrink-0" /> : null}
                </button>
              )
            })}
          </div>
        )}

        {restartRequired && (
          <div className="flex items-start gap-2 rounded-md border px-3 py-2.5 text-[11px] leading-5" role="status" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}>
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>当前窗口仍使用“{appearance?.activeStyle === 'integrated' ? '一体化' : '原生'}”风格；已保存的“{configuredStyle === 'integrated' ? '一体化' : '原生'}”风格将在下次启动时生效。</span>
          </div>
        )}
      </Section>

      <SimpleDeleteDialog
        isOpen={restartDialogOpen}
        title="应用窗口风格"
        message={`窗口风格已保存为“${configuredStyle === 'integrated' ? '一体化' : '原生'}”。是否立即重启 MO Gallery Desktop 以应用新风格？`}
        confirmLabel="立即重启"
        cancelLabel="稍后重启"
        pendingLabel="正在重启..."
        confirmIcon="refresh"
        confirmVariant="primary"
        onConfirm={handleRestartConfirm}
        onCancel={handleRestartCancel}
        t={(key) => t(key, language)}
      />
    </div>
  )
}

// ─── 本地资源库 ──────────────────────────────────────

type LocalLibraryCacheInfo = {
  loading: boolean
  stats: local_library.LocalLibraryCacheStats | null
  error: string | null
}

function useLocalLibraryCacheInfo() {
  const [cacheInfo, setCacheInfo] = useState<LocalLibraryCacheInfo>({ loading: true, stats: null, error: null })
  const requestIdRef = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setCacheInfo(prev => ({ ...prev, loading: true, error: null }))
    try {
      const stats = await GetLocalLibraryCacheStats()
      if (requestId !== requestIdRef.current) return
      setCacheInfo({ loading: false, stats, error: null })
    } catch (error: unknown) {
      if (requestId !== requestIdRef.current) return
      setCacheInfo({
        loading: false,
        stats: null,
        error: error instanceof Error ? error.message : '本地资源库不可用',
      })
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => { requestIdRef.current += 1 }
  }, [refresh])
  return { ...cacheInfo, refresh }
}

function LocalLibraryTab({ onManageCache }: { onManageCache: () => void }) {
  const [importMode, setImportMode] = useState<'copy' | 'move' | undefined>()
  const [preferencesLoading, setPreferencesLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const localCacheInfo = useLocalLibraryCacheInfo()

  useEffect(() => {
    let active = true
    GetLocalLibraryPreferences()
      .then((result) => {
        if (!active) return
        setImportMode(result?.importMode === 'copy' || result?.importMode === 'move' ? result.importMode : undefined)
      })
      .catch((error) => toast.error('读取本地资源库设置失败: ' + getErrorMessage(error)))
      .finally(() => { if (active) setPreferencesLoading(false) })
    return () => { active = false }
  }, [])

  const chooseMode = async (mode: 'copy' | 'move') => {
    if (saving || mode === importMode) return
    setSaving(true)
    try {
      const result = await SetLocalLibraryImportMode(mode)
      setImportMode(result.importMode === 'copy' || result.importMode === 'move' ? result.importMode : mode)
      toast.success('本地资源库导入方式已更新')
    } catch (error) {
      toast.error('保存失败: ' + getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const stats = localCacheInfo.stats

  return (
    <div className="space-y-6">
      <Section title="本地资源库">
        <Field label="应用内导入方式" description="选择或拖入库外照片时使用。系统文件资源管理器中的复制、移动操作不受此设置影响。">
          {preferencesLoading ? (
            <div className="flex h-20 items-center justify-center"><Loader2 size={16} className="animate-spin" /></div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" disabled={saving} onClick={() => chooseMode('copy')}
                className="rounded-lg border p-4 text-left transition-colors hover:bg-secondary disabled:opacity-50"
                style={{ borderColor: importMode === 'copy' ? 'var(--primary)' : 'var(--border)', backgroundColor: importMode === 'copy' ? 'var(--accent)' : undefined }}>
                <span className="flex items-center gap-2 text-sm font-medium"><Copy size={16} />复制到资源库{importMode === 'copy' && <Check size={15} style={{ color: 'var(--primary)' }} />}</span>
                <span className="mt-2 block text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>保留库外源文件，库内副本成为资源库管理的文件。</span>
              </button>
              <button type="button" disabled={saving} onClick={() => chooseMode('move')}
                className="rounded-lg border p-4 text-left transition-colors hover:bg-secondary disabled:opacity-50"
                style={{ borderColor: importMode === 'move' ? 'var(--primary)' : 'var(--border)', backgroundColor: importMode === 'move' ? 'var(--accent)' : undefined }}>
                <span className="flex items-center gap-2 text-sm font-medium"><FolderInput size={16} />移动到资源库{importMode === 'move' && <Check size={15} style={{ color: 'var(--primary)' }} />}</span>
                <span className="mt-2 block text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>确认安全写入资源库后，从原位置移除源文件。</span>
              </button>
            </div>
          )}
          {!preferencesLoading && !importMode && <p className="mt-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>尚未选择。首次导入照片时会提示选择。</p>}
        </Field>
      </Section>

      <Section title="存储占用" description="统计当前资源库的 .mo-gallery 保留目录。资源库数据不可再生，不会被缓存清理删除。">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] leading-5" style={{ color: 'var(--muted-foreground)' }}>
            缩略图与大图预览可由原文件重新生成；数据库、清单、备份和回收站属于资源库数据。
          </p>
          <button type="button" onClick={() => void localCacheInfo.refresh()} disabled={localCacheInfo.loading}
            className={`${btnOutline} shrink-0`} title="重新统计存储占用">
            <RefreshCw size={13} className={localCacheInfo.loading ? 'animate-spin' : ''} />
            重新统计
          </button>
        </div>

        {localCacheInfo.loading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-md" />
            <Skeleton className="h-14 w-full rounded-md" />
            <Skeleton className="h-14 w-full rounded-md" />
          </div>
        ) : stats ? (
          <div className="divide-y border-y" style={{ borderColor: 'var(--border)' }}>
            <StorageUsageRow icon={HardDrive} label=".mo-gallery 总占用" value={formatBytes(stats.internal.bytes)} detail={`${stats.internal.fileCount} 个文件`} />
            <StorageUsageRow icon={Database} label="资源库数据" value={formatBytes(stats.libraryData.bytes)} detail={`${stats.libraryData.fileCount} 个文件 · 不可作为缓存清理`} />
            <StorageUsageRow icon={Images} label="网格缩略图" value={formatBytes(stats.thumbnails.bytes)} detail={`${stats.thumbnails.fileCount} 个文件 · 长期保留以保证浏览速度`} />
            <StorageUsageRow icon={ImageIcon} label="大图预览" value={formatBytes(stats.previews.bytes)} detail={`${stats.previews.fileCount} 个文件 · 空间上限 ${formatBytes(stats.previewLimitBytes)}`} />
          </div>
        ) : (
          <div className="rounded-md border border-dashed px-4 py-6 text-center" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-medium">当前未打开本地资源库</p>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{localCacheInfo.error || '打开资源库后可查看实际磁盘占用。'}</p>
          </div>
        )}

        <div className="flex justify-end">
          <button type="button" onClick={onManageCache} className={btnOutline}>
            <Database size={13} />
            管理缓存
            <ChevronRight size={13} />
          </button>
        </div>
      </Section>
    </div>
  )
}

function StorageUsageRow({ icon: Icon, label, value, detail }: {
  icon: typeof Database
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--muted)' }}>
        <Icon size={15} style={{ color: 'var(--muted-foreground)' }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{label}</p>
        <p className="mt-0.5 text-[10px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{detail}</p>
      </div>
      <span className="shrink-0 text-xs font-medium tabular-nums">{value}</span>
    </div>
  )
}

// ─── Tab 3: 存储（StorageSource CRUD） ─────────────────

interface StorageSource {
  id: string
  name: string
  type: string
  accessKey?: string
  secretKey?: string
  bucket?: string
  region?: string
  endpoint?: string
  publicUrl?: string
  basePath?: string
  branch?: string
  accessMethod?: string
}

const STORAGE_TYPE_META: Record<string, { label: string; icon: typeof HardDrive }> = {
  local: { label: '本地存储', icon: HardDrive },
  github: { label: 'GitHub', icon: Github },
  s3: { label: 'S3/R2', icon: Cloud },
}

function storageTypeMeta(type: string) {
  return STORAGE_TYPE_META[type] || { label: type, icon: Database }
}

function StorageTab() {
  const { language } = usePreferences()
  const [sources, setSources] = useState<StorageSource[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null) // 'local' | 'github' | 's3'
  const [deleteTarget, setDeleteTarget] = useState<StorageSource | null>(null)

  const fetchSources = useCallback(async () => {
    setLoading(true)
    try {
      const result = await GetStorageSources()
      setSources(result || [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchSources() }, [fetchSources])

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await DeleteStorageSource(deleteTarget.id)
      toast.success('已删除')
      setDeleteTarget(null)
      fetchSources()
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || '删除失败')
    }
  }

  const addActions = [
    { type: 'local' as const, label: '添加本地存储', icon: HardDrive },
    { type: 'github' as const, label: '添加 GitHub', icon: Github },
    { type: 's3' as const, label: '添加 S3/R2', icon: Cloud },
  ]

  return (
    <div className="space-y-6">
      <Section title="存储源">
        <p className="text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>
          配置照片原图与缩略图的存储位置，支持本地目录、GitHub 仓库或 S3/R2 兼容服务。
        </p>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : (
          <div className="space-y-3">
            {sources.length === 0 && !adding && (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center" style={{ borderColor: 'var(--border)' }}>
                <span className="flex size-12 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--muted)' }}>
                  <Database size={22} style={{ color: 'var(--muted-foreground)' }} />
                </span>
                <p className="text-sm font-medium">暂无存储源</p>
                <p className="max-w-sm text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>
                  添加本地目录、GitHub 仓库或 S3/R2 兼容存储，用于保存照片原图与缩略图。
                </p>
              </div>
            )}

            {sources.map(source => (
              <StorageSourceCard
                key={source.id}
                source={source}
                isEditing={editingId === source.id}
                onEdit={() => { setEditingId(editingId === source.id ? null : source.id); setAdding(null) }}
                onDelete={() => setDeleteTarget(source)}
                onSaved={() => { setEditingId(null); fetchSources() }}
              />
            ))}

            {/* 新增按钮 */}
            {!adding ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {addActions.map(({ type, label, icon: Icon }) => (
                  <button key={type} onClick={() => { setAdding(type); setEditingId(null) }}
                    className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs transition-colors hover:bg-secondary"
                    style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                    <Plus size={14} />
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <StorageSourceForm
                type={adding}
                onCancel={() => setAdding(null)}
                onSaved={() => { setAdding(null); fetchSources() }}
              />
            )}
          </div>
        )}
      </Section>

      <SimpleDeleteDialog
        isOpen={!!deleteTarget}
        title="删除存储源"
        message={deleteTarget ? `确定要删除「${deleteTarget.name}」吗？已上传的照片文件不会被删除，但该存储源将无法再用于上传与访问。` : ''}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        t={(key) => t(key, language)}
      />
    </div>
  )
}

function StorageSourceCard({ source, isEditing, onEdit, onDelete, onSaved }: {
  source: StorageSource; isEditing: boolean; onEdit: () => void; onDelete: () => void; onSaved: () => void
}) {
  if (isEditing) {
    return <StorageSourceForm source={source} onCancel={onEdit} onSaved={onSaved} />
  }

  const meta = storageTypeMeta(source.type)
  const Icon = meta.icon

  return (
    <div className="flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-secondary/40"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--muted)' }}>
        <Icon size={16} style={{ color: 'var(--muted-foreground)' }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{source.name}</span>
          <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px]"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}>
            {meta.label}
          </span>
        </div>
        <p className="mt-0.5 truncate font-mono text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          {source.type === 'local' && (source.basePath || '/')}
          {source.type === 'github' && `${source.bucket || ''} / ${source.branch || 'main'}`}
          {source.type === 's3' && `${source.bucket || ''} @ ${source.endpoint || source.region || ''}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button onClick={onEdit} title="编辑" aria-label="编辑"
          className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-secondary"
          style={{ color: 'var(--muted-foreground)' }}>
          <Pencil size={14} />
        </button>
        <button onClick={onDelete} title="删除" aria-label="删除"
          className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-secondary"
          style={{ color: 'var(--destructive)' }}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

function StorageSourceForm({ source, type, onCancel, onSaved }: {
  source?: StorageSource; type?: string; onCancel: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: source?.name || '',
    type: source?.type || type || 'local',
    accessKey: source?.accessKey || '',
    secretKey: source?.secretKey || '',
    bucket: source?.bucket || '',
    region: source?.region || '',
    endpoint: source?.endpoint || '',
    publicUrl: source?.publicUrl || '',
    basePath: source?.basePath || '',
    branch: source?.branch || 'main',
    accessMethod: source?.accessMethod || 'raw',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      if (source?.id) {
        await UpdateStorageSource(source.id, form)
        toast.success('已更新')
      } else {
        await CreateStorageSource(form)
        toast.success('已创建')
      }
      onSaved()
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const meta = storageTypeMeta(form.type)
  const Icon = meta.icon
  const isEditing = Boolean(source?.id)

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--ring)', backgroundColor: 'var(--card)' }}>
      <div className="mb-4 flex items-center justify-between gap-2 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="flex size-7 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--muted)' }}>
            <Icon size={14} style={{ color: 'var(--muted-foreground)' }} />
          </span>
          {isEditing ? '编辑存储源' : `添加${meta.label}`}
        </span>
        <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px]"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}>
          {meta.label}
        </span>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="名称">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className={inputClass} style={inputStyle} />
          </Field>
          <Field label="类型">
            <SelectDropdown
              value={form.type}
              options={[
                { value: 'local', label: '本地' },
                { value: 'github', label: 'GitHub' },
                { value: 's3', label: 'S3/R2' },
              ]}
              onChange={() => {}}
              disabled
              ariaLabel="类型"
            />
          </Field>
        </div>

        {form.type === 'local' && (
          <Field label="路径前缀" description="本地存储的根目录路径，默认为服务器存储根目录。">
            <input value={form.basePath} placeholder="/"
              onChange={e => setForm(f => ({ ...f, basePath: e.target.value }))}
              className={inputClass} style={inputStyle} />
          </Field>
        )}

        {form.type === 'github' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Personal Access Token" description="需要 repo 写权限，仅保存在服务端配置中。">
                <input type="password" value={form.accessKey}
                  onChange={e => setForm(f => ({ ...f, accessKey: e.target.value }))}
                  className={inputClass} style={inputStyle} />
              </Field>
              <Field label="仓库 (owner/repo)">
                <input value={form.bucket} placeholder="user/repo"
                  onChange={e => setForm(f => ({ ...f, bucket: e.target.value }))}
                  className={inputClass} style={inputStyle} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="分支">
                <input value={form.branch} placeholder="main"
                  onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
                  className={inputClass} style={inputStyle} />
              </Field>
              <Field label="路径前缀">
                <input value={form.basePath} placeholder="images/"
                  onChange={e => setForm(f => ({ ...f, basePath: e.target.value }))}
                  className={inputClass} style={inputStyle} />
              </Field>
              <Field label="访问方式">
                <SelectDropdown
                  value={form.accessMethod}
                  options={[
                    { value: 'raw', label: 'Raw' },
                    { value: 'jsdelivr', label: 'jsDelivr' },
                    { value: 'pages', label: 'GitHub Pages' },
                  ]}
                  onChange={value => setForm(f => ({ ...f, accessMethod: String(value) }))}
                  ariaLabel="访问方式"
                />
              </Field>
            </div>
            {form.accessMethod === 'pages' && (
              <Field label="Pages URL">
                <input value={form.publicUrl} placeholder="https://user.github.io/repo"
                  onChange={e => setForm(f => ({ ...f, publicUrl: e.target.value }))}
                  className={inputClass} style={inputStyle} />
              </Field>
            )}
          </>
        )}

        {form.type === 's3' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Endpoint">
                <input value={form.endpoint} placeholder="https://xxx.r2.cloudflarestorage.com"
                  onChange={e => setForm(f => ({ ...f, endpoint: e.target.value }))}
                  className={inputClass} style={inputStyle} />
              </Field>
              <Field label="Region">
                <input value={form.region} placeholder="auto"
                  onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                  className={inputClass} style={inputStyle} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Access Key ID">
                <input value={form.accessKey}
                  onChange={e => setForm(f => ({ ...f, accessKey: e.target.value }))}
                  className={inputClass} style={inputStyle} />
              </Field>
              <Field label="Secret Access Key" description="仅保存在服务端配置中，不会回显。">
                <input type="password" value={form.secretKey}
                  onChange={e => setForm(f => ({ ...f, secretKey: e.target.value }))}
                  className={inputClass} style={inputStyle} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bucket">
                <input value={form.bucket}
                  onChange={e => setForm(f => ({ ...f, bucket: e.target.value }))}
                  className={inputClass} style={inputStyle} />
              </Field>
              <Field label="公开访问 URL">
                <input value={form.publicUrl} placeholder="https://pub-xxx.r2.dev"
                  onChange={e => setForm(f => ({ ...f, publicUrl: e.target.value }))}
                  className={inputClass} style={inputStyle} />
              </Field>
            </div>
            <Field label="路径前缀">
              <input value={form.basePath} placeholder="photos/"
                onChange={e => setForm(f => ({ ...f, basePath: e.target.value }))}
                className={inputClass} style={inputStyle} />
            </Field>
          </>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
        <button onClick={onCancel}
          className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
          style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
          取消
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-50 hover:opacity-90"
          style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  )
}

// ─── Tab 4: 评论（与 Web 端一致：Manage + Config 子标签） ──

function CommentsTab({ config, updateConfig }: {
  config: Record<string, string>
  updateConfig: (key: string, value: string) => void
}) {
  const [subTab, setSubTab] = useState<CommentsSubTab>('manage')

  return (
    <div className="space-y-4">
      {/* 子标签切换 */}
      <div className="flex gap-1 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
        {[
          { key: 'manage' as const, label: '管理' },
          { key: 'config' as const, label: '配置' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setSubTab(key)}
            className="px-3 py-1.5 text-xs rounded-md transition-colors"
            style={{
              backgroundColor: subTab === key ? 'var(--accent)' : 'transparent',
              color: subTab === key ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {subTab === 'manage' && <CommentsManageTab />}
      {subTab === 'config' && <CommentsConfigTab config={config} updateConfig={updateConfig} />}
    </div>
  )
}

function CommentsManageTab() {
  const { language } = usePreferences()
  const [comments, setComments] = useState<services.CommentDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<services.CommentDTO | null>(null)

  const fetchComments = useCallback(async () => {
    setLoading(true)
    try {
      const result = await GetComments({
        status: statusFilter, photoId: '', page, limit: 20,
      })
      setComments(result?.data || [])
      setTotal(result?.meta?.total || 0)
    } catch {} finally { setLoading(false) }
  }, [statusFilter, page])

  useEffect(() => { fetchComments() }, [fetchComments])

  const updateStatus = async (id: string, status: string) => {
    try {
      await UpdateCommentStatus(id, status)
      fetchComments()
    } catch {}
  }

  const deleteComment = async () => {
    if (!deleteTarget) return
    try {
      await DeleteComment(deleteTarget.id)
      setDeleteTarget(null)
      fetchComments()
    } catch {}
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <SelectDropdown
          value={statusFilter}
          options={[
            { value: 'pending', label: '待审核' },
            { value: 'approved', label: '已通过' },
            { value: 'rejected', label: '已拒绝' },
          ]}
          onChange={value => { setStatusFilter(String(value)); setPage(1) }}
          placeholder="全部状态"
          clearLabel="全部状态"
          size="sm"
          ariaLabel="评论状态筛选"
          className="w-36"
        />
        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{total} 条评论</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8" style={{ color: 'var(--muted-foreground)' }}>
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-xs py-4" style={{ color: 'var(--muted-foreground)' }}>暂无评论</p>
      ) : (
        <div className="space-y-2">
          {comments.map(c => (
            <div key={c.id} className="px-4 py-3 rounded-lg border"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.author}</span>
                    <Badge tone={c.status === 'approved' ? 'green' : c.status === 'rejected' ? 'red' : undefined}>
                      {c.status === 'pending' ? '待审核' : c.status === 'approved' ? '已通过' : '已拒绝'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: 'var(--foreground)' }}>{c.content}</p>
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                    {c.email && `${c.email} · `}{new Date(c.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="ml-2 flex shrink-0 items-center gap-0.5">
                  {c.status !== 'approved' && (
                    <button onClick={() => updateStatus(c.id, 'approved')}
                      className="flex size-7 items-center justify-center rounded-md border transition-colors hover:bg-secondary"
                      style={{ borderColor: 'var(--border)', color: STATUS_COLORS.green.fg }} title="通过" aria-label="通过">
                      <Check size={13} />
                    </button>
                  )}
                  {c.status !== 'rejected' && (
                    <button onClick={() => updateStatus(c.id, 'rejected')}
                      className="flex size-7 items-center justify-center rounded-md border transition-colors hover:bg-secondary"
                      style={{ borderColor: 'var(--border)', color: 'var(--destructive)' }} title="拒绝" aria-label="拒绝">
                      <X size={13} />
                    </button>
                  )}
                  <button onClick={() => setDeleteTarget(c)}
                    className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-secondary"
                    style={{ color: 'var(--destructive)' }} title="删除" aria-label="删除">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > 20 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            第 {page} 页 / 共 {Math.ceil(total / 20)} 页
          </span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-2 py-1 text-xs rounded disabled:opacity-30"
              style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
              上一页
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 20)}
              className="px-2 py-1 text-xs rounded disabled:opacity-30"
              style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
              下一页
            </button>
          </div>
        </div>
      )}

      <SimpleDeleteDialog
        isOpen={!!deleteTarget}
        title="删除评论"
        message={deleteTarget ? `确定要删除 ${deleteTarget.author || '此用户'} 的评论吗？` : ''}
        onConfirm={deleteComment}
        onCancel={() => setDeleteTarget(null)}
        t={(key) => t(key, language)}
      />
    </div>
  )
}

function CommentsConfigTab({ config, updateConfig }: {
  config: Record<string, string>
  updateConfig: (key: string, value: string) => void
}) {
  const provider = config.comment_provider || 'local'

  return (
    <div className="space-y-4">
      <Section title="评论配置">
        <Field label="评论审核">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox"
              checked={config.comment_moderation === 'manual'}
              onChange={e => updateConfig('comment_moderation', e.target.checked ? 'manual' : 'auto')}
              className="rounded" />
            <span className="text-xs">新评论需要人工审核</span>
          </label>
        </Field>

        <Field label="评论提供者">
          <SelectDropdown
            value={provider}
            options={[
              { value: 'local', label: '本地' },
              { value: 'openai', label: 'OpenAI' },
              { value: 'gemini', label: 'Gemini' },
              { value: 'anthropic', label: 'Anthropic' },
            ]}
            onChange={value => updateConfig('comment_provider', String(value))}
            placeholder="请选择评论提供者"
            ariaLabel="评论提供者"
          />
        </Field>

        {provider !== 'local' && (
          <>
            <Field label="API Key">
              <input type="password" value={config.comment_api_key || ''}
                onChange={e => updateConfig('comment_api_key', e.target.value)}
                className={inputClass} style={inputStyle} />
            </Field>
            <Field label="API Endpoint">
              <input type="text" value={config.comment_api_endpoint || ''}
                onChange={e => updateConfig('comment_api_endpoint', e.target.value)}
                className={inputClass} style={inputStyle} />
            </Field>
            <Field label="模型">
              <input type="text" value={config.comment_model || ''}
                onChange={e => updateConfig('comment_model', e.target.value)}
                className={inputClass} style={inputStyle} />
            </Field>
          </>
        )}

        <Field label="屏蔽关键词" description="逗号分隔">
          <textarea value={config.blocked_keywords || ''}
            onChange={e => updateConfig('blocked_keywords', e.target.value)}
            rows={3}
            className={textareaClass} style={inputStyle} />
        </Field>
      </Section>
    </div>
  )
}

// ─── Tab 5: 账户（与 Web 端一致：Linux DO 绑定） ────────────

function AccountTab() {
  const { language } = usePreferences()
  const [linuxDoEnabled, setLinuxDoEnabled] = useState(false)
  const [linuxDoBinding, setLinuxDoBinding] = useState<services.LinuxDoBindingDTO | null>(null)
  const [linuxDoLoading, setLinuxDoLoading] = useState(false)
  const [linuxDoBindLoading, setLinuxDoBindLoading] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(false)

  const loadLinuxDoStatus = async () => {
    setLinuxDoLoading(true)
    try {
      const enabled = await IsLinuxDoEnabled()
      setLinuxDoEnabled(enabled)
      if (enabled) {
        const binding = await GetLinuxDoBinding()
        setLinuxDoBinding(binding)
      } else {
        setLinuxDoBinding(null)
      }
    } catch (err: unknown) {
      toast.error('加载 Linux DO 状态失败: ' + getErrorMessage(err))
    } finally {
      setLinuxDoLoading(false)
    }
  }

  useEffect(() => { loadLinuxDoStatus() }, [])

  const handleLinuxDoBind = async () => {
    try {
      setLinuxDoBindLoading(true)
      const { url, state } = await GetLinuxDoAuthUrl()
      // 保存 state 和当前路径到 sessionStorage
      sessionStorage.setItem('linuxdo_oauth_state', state)
      sessionStorage.setItem('linuxdo_redirect', window.location.pathname)
      // 跳转到 Linux DO 授权页
      window.location.href = url
    } catch (err: unknown) {
      toast.error('获取授权 URL 失败: ' + getErrorMessage(err))
      setLinuxDoBindLoading(false)
    }
  }

  const handleLinuxDoUnbind = async () => {
    try {
      await UnbindLinuxDoAccount()
      toast.success('已解绑 Linux DO 账户')
      setDeleteDialog(false)
      loadLinuxDoStatus()
    } catch (err: unknown) {
      toast.error('解绑失败: ' + getErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <Section title="Linux DO 绑定">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-[#f8d568]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
            <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--foreground)' }}>
              Linux DO
            </h4>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            绑定 Linux DO 账户后，可以使用 Linux DO 登录。
          </p>
        </div>

        {!linuxDoEnabled ? (
          <div className="p-6 rounded-lg border border-dashed text-center" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Linux DO 未配置
            </p>
            <p className="mt-2 font-mono text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
              请在 .env 中配置 LINUXDO_CLIENT_ID 和 LINUXDO_CLIENT_SECRET
            </p>
          </div>
        ) : linuxDoLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : linuxDoBinding ? (
          <div className="space-y-6 rounded-lg border p-6" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-4">
              {linuxDoBinding.avatarUrl ? (
                <img
                  src={linuxDoBinding.avatarUrl}
                  alt={linuxDoBinding.username || ''}
                  className="h-12 w-12 rounded-full border"
                  style={{ borderColor: 'var(--border)' }}
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full border bg-muted" style={{ borderColor: 'var(--border)' }}>
                  <User size={20} className="text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="font-medium" style={{ color: 'var(--foreground)' }}>
                  {linuxDoBinding.username}
                </p>
                {linuxDoBinding.trustLevel !== null && (
                  <p className="mt-0.5 font-mono text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                    Trust Level: {linuxDoBinding.trustLevel}
                  </p>
                )}
              </div>
              <div className="ml-auto">
                <Badge tone="green"><Check size={10} /> 已绑定</Badge>
              </div>
            </div>
            <button
              onClick={() => setDeleteDialog(true)}
              disabled={linuxDoBindLoading}
              className="flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors hover:bg-secondary disabled:opacity-50"
              style={{ borderColor: 'color-mix(in srgb, var(--destructive) 40%, transparent)', color: 'var(--destructive)' }}
            >
              {linuxDoBindLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Unlink size={14} />
              )}
              解绑 Linux DO
            </button>
          </div>
        ) : (
          <div className="space-y-4 rounded-lg border border-dashed p-6 text-center" style={{ borderColor: 'var(--border)' }}>
            <div className="space-y-2">
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                未绑定 Linux DO 账户
              </p>
              <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                绑定后可以使用 Linux DO 登录
              </p>
            </div>
            <button
              onClick={handleLinuxDoBind}
              disabled={linuxDoBindLoading}
              className="mx-auto flex items-center justify-center gap-2 rounded-md px-5 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#f8d568', color: '#1a1a1a' }}
            >
              {linuxDoBindLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Link size={14} />
              )}
              绑定 Linux DO
            </button>
          </div>
        )}
      </Section>

      <SimpleDeleteDialog
        isOpen={deleteDialog}
        title="解绑 Linux DO"
        message="确定要解绑 Linux DO 账户吗？解绑后无法使用 Linux DO 登录。"
        onConfirm={handleLinuxDoUnbind}
        onCancel={() => setDeleteDialog(false)}
        t={(key) => t(key, language)}
      />
    </div>
  )
}

// ─── Tab 8: 缓存管理 ─────────────────────────────────

const APP_CACHE_STORAGE_PREFIX = 'mo-gallery:desktop-cache-storage'

async function getCurrentAppCacheStorageKeys() {
  if (!('caches' in window)) return []
  const scope = getCurrentPersistentCacheScope()
  if (!scope) return []
  const prefix = `${APP_CACHE_STORAGE_PREFIX}:${scope}:`
  return (await caches.keys()).filter(key => key.startsWith(prefix))
}

function CacheTab() {
  const { language } = usePreferences()
  const [snapshot, setSnapshot] = useState(getDesktopCacheSnapshot)
  const [clearingPage, setClearingPage] = useState<'overview' | 'cloud' | null>(null)
  const [clearingApplication, setClearingApplication] = useState(false)
  const [clearingLocalPreviews, setClearingLocalPreviews] = useState(false)
  const [clearingCacheStorage, setClearingCacheStorage] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'application' | 'previews' | null>(null)
  const [cacheStorageInfo, setCacheStorageInfo] = useState({
    supported: false,
    loading: true,
    count: 0,
    bytes: 0,
    error: null as string | null,
  })
  const cacheStorageRequestIdRef = useRef(0)
  const localCacheInfo = useLocalLibraryCacheInfo()

  const refreshSnapshot = () => setSnapshot(getDesktopCacheSnapshot())

  const refreshCacheStorageInfo = useCallback(async () => {
    const requestId = ++cacheStorageRequestIdRef.current
    if (!('caches' in window)) {
      setCacheStorageInfo({ supported: false, loading: false, count: 0, bytes: 0, error: null })
      return
    }

    setCacheStorageInfo(prev => ({ ...prev, supported: true, loading: true, error: null }))
    try {
      const keys = await getCurrentAppCacheStorageKeys()
      let count = 0
      let bytes = 0
      for (const key of keys) {
        const cache = await caches.open(key)
        const requests = await cache.keys()
        count += requests.length
        for (const request of requests) {
          const response = await cache.match(request)
          if (!response) continue
          bytes += (await response.clone().blob()).size
        }
      }
      if (requestId !== cacheStorageRequestIdRef.current) return
      setCacheStorageInfo({ supported: true, loading: false, count, bytes, error: null })
    } catch (error: unknown) {
      if (requestId !== cacheStorageRequestIdRef.current) return
      setCacheStorageInfo({
        supported: true,
        loading: false,
        count: 0,
        bytes: 0,
        error: error instanceof Error ? error.message : '统计失败',
      })
    }
  }, [])

  useEffect(() => {
    void refreshCacheStorageInfo()
    return () => { cacheStorageRequestIdRef.current += 1 }
  }, [refreshCacheStorageInfo])

  const refreshAll = () => {
    refreshSnapshot()
    void refreshCacheStorageInfo()
    void localCacheInfo.refresh()
  }

  const handleClearPageCache = (scope: 'overview' | 'cloud') => {
    setClearingPage(scope)
    if (scope === 'overview') {
      clearOverviewPageCache()
      clearEquipmentCache()
    } else {
      clearCloudLibraryPageCache()
    }
    refreshSnapshot()
    setClearingPage(null)
    toast.success(scope === 'overview' ? '概览页缓存已清理，下次进入时会重新加载' : '云端照片列表缓存已清理，下次进入时会重新加载')
  }

  const deleteCacheStorage = async () => {
    if (!('caches' in window)) return 0
    cacheStorageRequestIdRef.current += 1
    const keys = await getCurrentAppCacheStorageKeys()
    await Promise.all(keys.map(key => caches.delete(key)))
    return keys.length
  }

  const handleClearCacheStorage = async () => {
    if (!cacheStorageInfo.supported) {
      toast.error('当前 WebView 不支持 CacheStorage')
      return
    }

    setClearingCacheStorage(true)
    try {
      const count = await deleteCacheStorage()
      await refreshCacheStorageInfo()
      toast.success(count > 0 ? `已清理 ${count} 个 CacheStorage` : '没有可清理的 CacheStorage')
    } catch (error: unknown) {
      toast.error('清理 CacheStorage 失败: ' + getErrorMessage(error))
    } finally {
      setClearingCacheStorage(false)
    }
  }

  const handleClearApplicationCache = async () => {
    setClearingApplication(true)
    try {
      clearDesktopRuntimeCache()
      clearCurrentPersistentCache()
      await deleteCacheStorage()
      refreshSnapshot()
      await refreshCacheStorageInfo()
      toast.success('应用缓存已清理；相关页面会在下次进入时自动重建')
    } catch (error: unknown) {
      refreshSnapshot()
      await refreshCacheStorageInfo()
      toast.error('部分应用缓存清理失败: ' + getErrorMessage(error))
    } finally {
      setClearingApplication(false)
      setConfirmAction(null)
    }
  }

  const handleClearLocalPreviews = async () => {
    setClearingLocalPreviews(true)
    try {
      await ClearLocalLibraryPreviewCache()
      await localCacheInfo.refresh()
      toast.success('本地大图预览已清理；查看照片时会按需重新生成')
    } catch (error: unknown) {
      toast.error('清理本地大图预览失败: ' + getErrorMessage(error))
    } finally {
      setClearingLocalPreviews(false)
      setConfirmAction(null)
    }
  }

  const cachedPageCount = Number(snapshot.overviewLoaded || snapshot.cameraLoaded || snapshot.lensLoaded) + Number(snapshot.photosLoaded)
  const runtimeBytes = snapshot.overviewPageBytes + snapshot.photosBytes
  const applicationDiskBytes = snapshot.persistentBytes + cacheStorageInfo.bytes
  const previewBytes = localCacheInfo.stats?.previews.bytes ?? 0
  const reclaimableBytes = applicationDiskBytes + previewBytes
  const hasApplicationCache = cachedPageCount > 0 || snapshot.persistentResourceCount > 0 || cacheStorageInfo.count > 0
  const isClearing = clearingApplication || clearingLocalPreviews || clearingCacheStorage || clearingPage !== null
  const isRefreshing = cacheStorageInfo.loading || localCacheInfo.loading || isClearing
  const previewUsagePercent = localCacheInfo.stats?.previewLimitBytes
    ? Math.min(100, Math.round((previewBytes / localCacheInfo.stats.previewLimitBytes) * 100))
    : 0

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-5" style={{ borderColor: 'var(--border)' }}>
        <div className="min-w-0">
          <h2 className="text-sm font-medium">缓存与空间</h2>
          <p className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
            释放可再生数据占用，或在页面数据异常时清理并重建缓存。
          </p>
        </div>
        <button type="button" onClick={refreshAll} disabled={isRefreshing} className={btnOutline} title="重新统计缓存">
          <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
          重新统计
        </button>
      </header>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-4xl space-y-5">
          <section className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
            <div className="flex items-start justify-between gap-4 border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>可释放空间</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{isRefreshing ? '正在统计' : formatBytes(reclaimableBytes)}</p>
                <p className="mt-1 text-[11px] leading-5" style={{ color: 'var(--muted-foreground)' }}>
                  仅计算可清理的磁盘数据，不包含运行时内存、原文件或资源库数据。
                </p>
              </div>
              <Badge tone={reclaimableBytes > 0 ? 'green' : undefined}>{reclaimableBytes > 0 ? '可清理' : '无需清理'}</Badge>
            </div>
            <div className="grid sm:grid-cols-3 sm:divide-x" style={{ borderColor: 'var(--border)' }}>
              <CacheSummaryMetric label="应用磁盘缓存" value={formatBytes(applicationDiskBytes)} detail={`${snapshot.persistentResourceCount} 项持久化数据 · ${cacheStorageInfo.count} 项当前账号网络响应`} />
              <CacheSummaryMetric label="本地大图预览" value={localCacheInfo.loading ? '统计中' : localCacheInfo.stats ? formatBytes(previewBytes) : '未打开资源库'} detail={localCacheInfo.stats ? `${localCacheInfo.stats.previews.fileCount} 个文件` : '打开本地资源库后可统计'} />
              <CacheSummaryMetric label="页面运行时状态" value={formatBytes(runtimeBytes)} detail={`${cachedPageCount}/2 个页面已缓存 · 不计入磁盘空间`} />
            </div>
          </section>

          <CacheDetailSection
            title="应用数据缓存"
            description="包含页面运行时状态、按账号保存的页面数据和 CacheStorage。清理后不会退出登录，相关页面会在下次进入时重新请求。"
            footer={(
              <button type="button" onClick={() => setConfirmAction('application')}
                disabled={isRefreshing || !hasApplicationCache} className={btnOutline} style={{ color: 'var(--destructive)' }}>
                {clearingApplication ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                清理并重建
              </button>
            )}
          >
            <CacheManagementRow
              icon={LayoutDashboard}
              title="概览页"
              description="统计概览、相机列表和镜头列表的已加载数据。"
              status={snapshot.overviewLoaded || snapshot.cameraLoaded || snapshot.lensLoaded ? '已缓存' : '未缓存'}
              detail={`${formatBytes(snapshot.overviewPageBytes)} 运行时估算 · 相机 ${snapshot.cameraCount} · 镜头 ${snapshot.lensCount}`}
              actionLabel="清理"
              onAction={() => handleClearPageCache('overview')}
              disabled={isRefreshing || !(snapshot.overviewLoaded || snapshot.cameraLoaded || snapshot.lensLoaded)}
              loading={clearingPage === 'overview'}
            />
            <CacheManagementRow
              icon={Images}
              title="云端照片列表"
              description="已加载的分页数据与滚动位置。"
              status={snapshot.photosLoaded ? '已缓存' : '未缓存'}
              detail={snapshot.photosLoaded ? `${snapshot.photosCount} 张 · ${formatBytes(snapshot.photosBytes)} 运行时估算` : '进入云端照片页面后生成'}
              actionLabel="清理"
              onAction={() => handleClearPageCache('cloud')}
              disabled={isRefreshing || !snapshot.photosLoaded}
              loading={clearingPage === 'cloud'}
            />
            <CacheManagementRow
              icon={Database}
              title="持久化页面数据"
              description="按当前服务端与登录账号保存的概览、相册、分类、胶卷、故事和朋友列表。"
              status={snapshot.persistentResourceCount > 0 ? `${snapshot.persistentResourceCount} 项` : '无缓存'}
              detail={`${formatBytes(snapshot.persistentBytes)} 磁盘估算 · 清理并重建时统一移除`}
            />
            <CacheManagementRow
              icon={Cloud}
              title="CacheStorage"
              description="由 MO Gallery 网页功能写入、按当前服务端与账号隔离的网络响应缓存。"
              status={cacheStorageInfo.loading ? '计算中' : cacheStorageInfo.error ? '统计失败' : cacheStorageInfo.supported ? `${cacheStorageInfo.count} 项` : '不支持'}
              detail={cacheStorageInfo.error || (cacheStorageInfo.supported ? `${formatBytes(cacheStorageInfo.bytes)} 磁盘估算` : '当前 WebView 未提供 CacheStorage')}
              actionLabel="清理"
              onAction={handleClearCacheStorage}
              disabled={isRefreshing || !cacheStorageInfo.supported || cacheStorageInfo.count === 0}
              loading={clearingCacheStorage}
            />
          </CacheDetailSection>

          <CacheDetailSection
            title="本地预览缓存"
            description="管理当前本地资源库按需生成的 2048px 屏幕预览。清理不会影响 512px 网格缩略图、原文件、索引或整理数据。"
            footer={localCacheInfo.stats ? (
              <button type="button" onClick={() => setConfirmAction('previews')}
                disabled={isRefreshing || localCacheInfo.stats.previews.fileCount === 0}
                className={btnOutline} style={{ color: 'var(--destructive)' }}>
                {clearingLocalPreviews ? <Loader2 size={13} className="animate-spin" /> : <Trash size={13} />}
                清理大图预览
              </button>
            ) : undefined}
          >
            <CacheManagementRow
              icon={ImageIcon}
              title="大图预览"
              description="首次查看照片时生成，之后直接复用；清理后首次打开可能需要等待重新生成。"
              status={localCacheInfo.loading ? '计算中' : localCacheInfo.stats ? formatBytes(previewBytes) : '未打开资源库'}
              detail={localCacheInfo.stats
                ? `${localCacheInfo.stats.previews.fileCount} 个文件 · 已使用上限的 ${previewUsagePercent}% · 上限 ${formatBytes(localCacheInfo.stats.previewLimitBytes)}`
                : localCacheInfo.error || '打开本地资源库后可统计和清理'}
            />
          </CacheDetailSection>

          <div className="flex items-start gap-2 rounded-md border px-4 py-3 text-[11px] leading-5" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>缓存清理不会删除账户、设置、照片原文件或资源库数据库。系统 WebView 管理的 HTTP 图片缓存无法准确统计，因此不计入可释放空间。</span>
          </div>
        </div>
      </div>

      <SimpleDeleteDialog
        isOpen={confirmAction === 'application'}
        title="清理并重建应用缓存"
        message={`将清理约 ${formatBytes(applicationDiskBytes)} 的应用磁盘缓存，以及当前页面运行时状态。不会退出登录或删除任何照片；相关页面会在下次进入时重新加载。`}
        confirmLabel="清理并重建"
        pendingLabel="正在清理..."
        confirmIcon="refresh"
        onConfirm={handleClearApplicationCache}
        onCancel={() => setConfirmAction(null)}
        t={(key) => t(key, language)}
      />
      <SimpleDeleteDialog
        isOpen={confirmAction === 'previews'}
        title="清理本地大图预览"
        message={`将释放约 ${formatBytes(previewBytes)} 的大图预览缓存。原文件、网格缩略图和资源库数据会保留；之后首次查看照片时需要重新生成预览。`}
        confirmLabel="清理预览"
        pendingLabel="正在清理..."
        onConfirm={handleClearLocalPreviews}
        onCancel={() => setConfirmAction(null)}
        t={(key) => t(key, language)}
      />
    </div>
  )
}

function CacheSummaryMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[10px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{detail}</p>
    </div>
  )
}

function CacheDetailSection({ title, description, footer, children }: {
  title: string
  description: string
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="mt-1 max-w-3xl text-[11px] leading-5" style={{ color: 'var(--muted-foreground)' }}>{description}</p>
      </div>
      <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>{children}</div>
        {footer && (
          <div className="flex justify-end border-t px-4 py-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)' }}>
            {footer}
          </div>
        )}
      </div>
    </section>
  )
}

function CacheManagementRow({ icon: Icon, title, description, status, detail, actionLabel, onAction, disabled, loading }: {
  icon: typeof Database
  title: string
  description: string
  status: string
  detail: string
  actionLabel?: string
  onAction?: () => void
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <div className="flex min-h-20 items-center gap-4 px-4 py-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--muted)' }}>
        <Icon size={16} style={{ color: 'var(--muted-foreground)' }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-xs font-medium">{title}</h4>
          <Badge>{status}</Badge>
        </div>
        <p className="mt-1 text-[11px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{description}</p>
        <p className="mt-0.5 text-[10px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{detail}</p>
      </div>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} disabled={disabled} className={`${btnOutline} shrink-0`}>
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Trash size={13} />}
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function CacheStat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--muted)' }}>
      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
      <p className="mt-0.5 text-sm font-medium" style={{ color: 'var(--foreground)' }}>{value}</p>
      {detail && <p className="mt-0.5 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{detail}</p>}
    </div>
  )
}

// ─── Tab 9: 关于 ────────────────────────────────────

const APP_REPO_URL = 'https://github.com/ushaio/mo-gallery-web'

const APP_FEATURES: { title: string; description: string }[] = [
  { title: '图库管理', description: '宫格、瀑布流与时间线视图，自动提取 EXIF 与主色调' },
  { title: '相册与胶卷', description: '相册封面与详情页，胶卷帧排序、元数据和批量添加' },
  { title: '批量上传', description: '多图拖拽、压缩、SHA-256 去重与上传进度追踪' },
  { title: '内容创作', description: '故事、博客、照片日志与 Zine 编排，TipTap 富文本编辑' },
  { title: 'AI 助手', description: '多轮对话、编辑器内 AI 操作与图片生成，支持 OpenAI 兼容 API' },
  { title: '本地资源库', description: '本地照片索引、全文搜索、预览与文件夹管理' },
  { title: '存储整理', description: 'Local / S3 / R2 / GitHub 多存储源与孤立文件检测' },
  { title: '管理与审核', description: '评论审核、友链管理、操作日志与系统设置' },
]

const APP_TECH_STACK: { label: string; value: string }[] = [
  { label: '桌面端', value: 'Wails 2 · Go · React 19 · Vite · GORM' },
  { label: 'Web 端', value: 'Next.js 16 · Hono · Prisma 7 · PostgreSQL' },
  { label: '存储后端', value: 'Local · S3 · Cloudflare R2 · GitHub' },
  { label: '共享包', value: 'packages/tiptap-editor · packages/ai-agent' },
]

function AboutTab() {
  return (
    <div className="space-y-6">
      {/* 项目介绍 */}
      <div className="rounded-lg border p-6 text-center" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl text-sm font-semibold tracking-wide"
          style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          MO
        </div>
        <h2 className="mt-4 text-base font-semibold">MO Gallery Desktop</h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
          面向摄影作品展示、内容叙事与图库管理的一体化平台，与 Next.js Web 站点共用仓库与核心能力。
        </p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}>
          <Github size={13} />
          v{version}
        </span>
      </div>

      <Section title="版本信息">
        <div className="grid gap-3 sm:grid-cols-2">
          <AboutInfoRow label="桌面端版本" value={`v${version}`} />
          <AboutInfoRow label="产品名称" value="MO Gallery Desktop" />
          <AboutInfoRow label="许可协议" value="MIT License" />
          <AboutInfoRow label="版权所有" value="© 2026 ushaio" />
        </div>
      </Section>

      <Section title="GitHub 仓库">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
          项目为开源软件（MIT License），欢迎前往 GitHub 查看源码、报告问题或参与贡献。
        </p>
        <div className="space-y-2">
          <AboutLinkRow label="项目仓库" value="github.com/ushaio/mo-gallery-web" url={APP_REPO_URL} />
          <AboutLinkRow label="Releases" value="github.com/ushaio/mo-gallery-web/releases" url={`${APP_REPO_URL}/releases`} />
          <AboutLinkRow label="更新日志" value="RELEASE.md" url={`${APP_REPO_URL}/blob/main/RELEASE.md`} />
        </div>
      </Section>

      <Section title="功能特性">
        <div className="grid gap-3 sm:grid-cols-2">
          {APP_FEATURES.map(feature => (
            <AboutFeature key={feature.title} title={feature.title} description={feature.description} />
          ))}
        </div>
      </Section>

      <Section title="技术栈">
        <div className="grid gap-3 sm:grid-cols-2">
          {APP_TECH_STACK.map(item => (
            <AboutInfoRow key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      </Section>
    </div>
  )
}

function AboutInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--muted)' }}>
      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
      <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--foreground)' }}>{value}</p>
    </div>
  )
}

function AboutLinkRow({ label, value, url }: { label: string; value: string; url: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
      <div className="flex-1 min-w-0">
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
        <p className="text-sm font-medium mt-0.5 truncate" style={{ color: 'var(--foreground)' }}>{value}</p>
      </div>
      <button
        onClick={() => BrowserOpenURL(url)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-opacity hover:opacity-70"
        style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
        aria-label={`打开 ${label}`}
        title={`打开 ${label}`}
      >
        <ExternalLink size={14} />
      </button>
    </div>
  )
}

function AboutFeature({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border p-3.5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{description}</p>
    </div>
  )
}

// ─── 通用组件 ────────────────────────────────────────

const inputStyle = {
  backgroundColor: 'var(--background)',
  borderColor: 'var(--border)',
  color: 'var(--foreground)',
}

// 桌面端统一的表单控件样式（与资源库、信息面板一致）
const inputClass = 'h-8 w-full rounded-md border bg-input px-2.5 text-xs outline-none focus:ring-1 focus:ring-ring'
const textareaClass = 'w-full rounded-md border bg-input px-2.5 py-2 text-xs outline-none focus:ring-1 focus:ring-ring resize-none'
const btnPrimary = 'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50'
const btnOutline = 'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-secondary disabled:opacity-50'

// 语义色（与桌面端状态点一致），深色/浅色主题均可读
const STATUS_COLORS: Record<string, { fg: string; bg: string }> = {
  green: { fg: '#4f9d69', bg: 'color-mix(in srgb, #4f9d69 14%, transparent)' },
  red: { fg: 'var(--destructive)', bg: 'color-mix(in srgb, var(--destructive) 12%, transparent)' },
  amber: { fg: '#b45309', bg: 'color-mix(in srgb, #f59e0b 14%, transparent)' },
}

// AI 能力标记色（500 色阶，深浅主题均可读）
const CAPABILITY_COLORS = {
  vision: '#3b82f6',
  tools: '#8b5cf6',
  structured: '#10b981',
  image: '#f59e0b',
}

function capabilityStyle(color: string, active: boolean): React.CSSProperties {
  return {
    borderColor: active ? color : 'var(--border)',
    color: active ? color : 'var(--muted-foreground)',
    backgroundColor: active ? `color-mix(in srgb, ${color} 12%, var(--card))` : 'transparent',
  }
}

function Badge({ children, tone, style: extraStyle }: {
  children: React.ReactNode
  tone?: keyof typeof STATUS_COLORS
  style?: React.CSSProperties
}) {
  const toneStyle = tone ? STATUS_COLORS[tone] : null
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]"
      style={{
        borderColor: toneStyle ? 'color-mix(in srgb, currentColor 30%, transparent)' : 'var(--border)',
        backgroundColor: toneStyle?.bg || 'var(--muted)',
        color: toneStyle?.fg || 'var(--muted-foreground)',
        ...extraStyle,
      }}>
      {children}
    </span>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
      <div className="mb-4">
        <h3 className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{title}</h3>
        {description && <p className="mt-1 text-[11px] leading-5" style={{ color: 'var(--muted-foreground)' }}>{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>
        {label}
      </label>
      {children}
      {description && (
        <p className="mt-1 text-[11px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{description}</p>
      )}
    </div>
  )
}

// ─── Tab 6: AI 模型配置 ──────────────────────────────

interface AiProviderConfig {
  base_url: string
  api_key: string
  models: string[]
  image_models: string[]
  vision_models: string[]
  tool_models: string[]
  structured_output_models: string[]
  context_windows: Record<string, number>
}

interface AiConfig {
  default_model: string
  default_image_model: string
  providers: Record<string, AiProviderConfig>
}

const emptyAiProvider: AiProviderConfig = {
  base_url: '',
  api_key: '',
  models: [''],
  image_models: [],
  vision_models: [],
  tool_models: [],
  structured_output_models: [],
  context_windows: {},
}

function normalizeModelNames(models: string[]): string[] {
  return [...new Set(models.map(model => model.trim()).filter(Boolean))]
}

const DEFAULT_AI_MODEL_CONTEXT_WINDOW = 8192
const INFERRED_AI_MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-5.5': 272000,
}

function inferAiModelContextWindow(model: string): number {
  return INFERRED_AI_MODEL_CONTEXT_WINDOWS[model.trim().toLowerCase()]
    ?? DEFAULT_AI_MODEL_CONTEXT_WINDOW
}

function formatContextWindow(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function getStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function getContextWindows(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => (
    typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0
  )))
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : 'Unknown error'
}

function normalizeAiConfig(value: unknown): AiConfig {
  const config = isRecord(value) ? value : {}
  const rawProviders = isRecord(config.providers) ? config.providers : {}
  return {
    default_model: getString(config.default_model) || getString(config.model),
    default_image_model: getString(config.default_image_model),
    providers: Object.fromEntries(Object.entries(rawProviders).map(([id, value]) => {
      const provider = isRecord(value) ? value : {}
      const models = getStringList(provider.models)
      return [id, {
        base_url: getString(provider.base_url),
        api_key: getString(provider.api_key),
        models: models.length > 0 ? models : [''],
        image_models: getStringList(provider.image_models),
        vision_models: getStringList(provider.vision_models),
        tool_models: getStringList(provider.tool_models),
        structured_output_models: getStringList(provider.structured_output_models),
        context_windows: getContextWindows(provider.context_windows),
      }]
    })),
  }
}

function buildAiConfigPayload(aiConfig: AiConfig): AiConfig {
  const providers: Record<string, AiProviderConfig> = {}
  for (const [providerId, provider] of Object.entries(aiConfig.providers)) {
    const id = providerId.trim()
    if (!id) continue
    const models = normalizeModelNames(provider.models)
    const configuredModels = new Set(models)
    providers[id] = {
      ...provider,
      models,
      image_models: normalizeModelNames(provider.image_models).filter(model => configuredModels.has(model)),
      vision_models: normalizeModelNames(provider.vision_models).filter(model => configuredModels.has(model)),
      tool_models: normalizeModelNames(provider.tool_models).filter(model => configuredModels.has(model)),
      structured_output_models: normalizeModelNames(provider.structured_output_models).filter(model => configuredModels.has(model)),
      context_windows: Object.fromEntries(Object.entries(provider.context_windows).filter(([model, size]) => (
        configuredModels.has(model) && Number.isFinite(size) && size > 0
      ))),
    }
  }
  const chatModelIds = new Set(Object.entries(providers).flatMap(([providerId, provider]) => (
    provider.models.map(model => `${providerId}:${model}`)
  )))
  const imageModelIds = new Set(Object.entries(providers).flatMap(([providerId, provider]) => (
    provider.image_models.map(model => `${providerId}:${model}`)
  )))
  return {
    ...aiConfig,
    default_model: chatModelIds.has(aiConfig.default_model) ? aiConfig.default_model : '',
    default_image_model: imageModelIds.has(aiConfig.default_image_model) ? aiConfig.default_image_model : '',
    providers,
  }
}

const AI_SELECTED_PROVIDER_KEY = 'mo-gallery:ai:selected-provider'

function readSelectedAiProvider(): string | null {
  try {
    return window.localStorage.getItem(AI_SELECTED_PROVIDER_KEY)
  } catch {
    return null
  }
}

function AiTab() {
  const { language } = usePreferences()
  const [aiConfig, setAiConfig] = useState<AiConfig>({ default_model: '', default_image_model: '', providers: {} })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [fetchingProvider, setFetchingProvider] = useState<string | null>(null)
  const [modelCandidates, setModelCandidates] = useState<Record<string, string[]>>({})
  const [deleteProviderId, setDeleteProviderId] = useState<string | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(readSelectedAiProvider())
  const [editingId, setEditingId] = useState(false)
  const [idDraft, setIdDraft] = useState('')
  const cancelEditRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void GetAiConfig()
      .then(result => { if (!cancelled) setAiConfig(normalizeAiConfig(result)) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const providerIds = Object.keys(aiConfig.providers).sort()
  // 选中项跟随数据变化：删除/重命名后自动回退到第一个可用模型源
  const selectedId = selectedProvider && aiConfig.providers[selectedProvider]
    ? selectedProvider
    : providerIds[0] ?? null

  // 选中模型源持久化（与胶卷页视图偏好一致：跨页面/重启保留）
  useEffect(() => {
    try {
      if (selectedId) window.localStorage.setItem(AI_SELECTED_PROVIDER_KEY, selectedId)
      else window.localStorage.removeItem(AI_SELECTED_PROVIDER_KEY)
    } catch {
      // localStorage 不可用时忽略
    }
  }, [selectedId])

  // 切换模型源时退出标识编辑态
  useEffect(() => { setEditingId(false) }, [selectedId])
  const defaultOptions = providerIds.flatMap(providerId => (
    aiConfig.providers[providerId].models
      .filter(model => model.trim())
      .map(model => ({ value: `${providerId}:${model.trim()}`, label: `${providerId} / ${model.trim()}` }))
  ))
  const defaultImageOptions = providerIds.flatMap(providerId => (
    aiConfig.providers[providerId].image_models
      .filter(model => model.trim())
      .map(model => ({ value: `${providerId}:${model.trim()}`, label: `${providerId} / ${model.trim()}` }))
  ))

  const updateProvider = (providerId: string, patch: Partial<AiProviderConfig>) => {
    setAiConfig(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [providerId]: { ...prev.providers[providerId], ...patch },
      },
    }))
  }

  const updateProviderId = (oldId: string, nextId: string) => {
    const id = nextId.trim()
    if (!id || id === oldId || aiConfig.providers[id]) return
    setAiConfig(prev => {
      const { [oldId]: provider, ...rest } = prev.providers
      const defaultModel = prev.default_model.startsWith(`${oldId}:`)
        ? `${id}:${prev.default_model.slice(oldId.length + 1)}`
        : prev.default_model
      const defaultImageModel = prev.default_image_model.startsWith(`${oldId}:`)
        ? `${id}:${prev.default_image_model.slice(oldId.length + 1)}`
        : prev.default_image_model
      return {
        ...prev,
        default_model: defaultModel,
        default_image_model: defaultImageModel,
        providers: { ...rest, [id]: provider },
      }
    })
    setModelCandidates(prev => {
      const { [oldId]: candidates, ...rest } = prev
      return candidates ? { ...rest, [id]: candidates } : rest
    })
  }

  const addProvider = () => {
    let index = providerIds.length + 1
    let providerId = `provider${index}`
    while (aiConfig.providers[providerId]) {
      index += 1
      providerId = `provider${index}`
    }
    setAiConfig(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [providerId]: {
          ...emptyAiProvider,
          models: [''],
          image_models: [],
          vision_models: [],
          tool_models: [],
          structured_output_models: [],
          context_windows: {},
        },
      },
    }))
    // 新建后自动选中并进入标识编辑态，方便直接命名
    cancelEditRef.current = false
    setSelectedProvider(providerId)
    setIdDraft(providerId)
    setEditingId(true)
  }

  const commitProviderId = () => {
    setEditingId(false)
    if (cancelEditRef.current) {
      cancelEditRef.current = false
      return
    }
    if (!selectedId) return
    const next = idDraft.trim()
    if (!next || next === selectedId) return
    if (aiConfig.providers[next]) {
      toast.error('模型源标识已存在')
      return
    }
    updateProviderId(selectedId, next)
    setSelectedProvider(next)
  }

  const removeProvider = (providerId: string) => {
    setAiConfig(prev => {
      const providers = Object.fromEntries(Object.entries(prev.providers).filter(([id]) => id !== providerId))
      const default_model = prev.default_model.startsWith(`${providerId}:`) ? '' : prev.default_model
      const default_image_model = prev.default_image_model.startsWith(`${providerId}:`) ? '' : prev.default_image_model
      return { ...prev, default_model, default_image_model, providers }
    })
    setModelCandidates(prev => {
      const rest = Object.fromEntries(Object.entries(prev).filter(([id]) => id !== providerId))
      return rest
    })
    setDeleteProviderId(null)
  }

  const updateModel = (providerId: string, index: number, value: string) => {
    setAiConfig(prev => {
      const provider = prev.providers[providerId]
      const previousModel = provider.models[index].trim()
      const nextModel = value.trim()
      const models = provider.models.map((model, i) => i === index ? value : model)
      const renameCapabilityModel = (capabilityModels: string[]) => capabilityModels
        .map(model => model === previousModel ? nextModel : model)
        .filter(Boolean)
      const context_windows = { ...provider.context_windows }
      if (previousModel && previousModel !== nextModel && context_windows[previousModel] !== undefined) {
        const contextWindow = context_windows[previousModel]
        delete context_windows[previousModel]
        if (nextModel) context_windows[nextModel] = contextWindow
      }
      const previousId = `${providerId}:${previousModel}`
      const nextId = nextModel ? `${providerId}:${nextModel}` : ''
      return {
        ...prev,
        default_model: prev.default_model === previousId ? nextId : prev.default_model,
        default_image_model: prev.default_image_model === previousId ? nextId : prev.default_image_model,
        providers: {
          ...prev.providers,
          [providerId]: {
            ...provider,
            models,
            image_models: renameCapabilityModel(provider.image_models),
            vision_models: renameCapabilityModel(provider.vision_models),
            tool_models: renameCapabilityModel(provider.tool_models),
            structured_output_models: renameCapabilityModel(provider.structured_output_models),
            context_windows,
          },
        },
      }
    })
  }

  const updateContextWindow = (providerId: string, model: string, rawValue: string) => {
    const modelName = model.trim()
    if (!modelName) return

    setAiConfig(prev => {
      const provider = prev.providers[providerId]
      const context_windows = { ...provider.context_windows }
      const value = rawValue.trim()

      if (!value) {
        delete context_windows[modelName]
      } else {
        const parsed = Number(value)
        if (!Number.isFinite(parsed) || parsed <= 0) return prev
        context_windows[modelName] = Math.floor(parsed)
      }

      return {
        ...prev,
        providers: {
          ...prev.providers,
          [providerId]: { ...provider, context_windows },
        },
      }
    })
  }

  const addModel = (providerId: string) => {
    const provider = aiConfig.providers[providerId]
    updateProvider(providerId, { models: [...provider.models, ''] })
  }

  const removeModel = (providerId: string, index: number) => {
    setAiConfig(prev => {
      const provider = prev.providers[providerId]
      const removed = provider.models[index].trim()
      const models = provider.models.filter((_, i) => i !== index)
      const removedId = `${providerId}:${removed}`
      const context_windows = { ...provider.context_windows }
      delete context_windows[removed]
      return {
        ...prev,
        default_model: prev.default_model === removedId ? '' : prev.default_model,
        default_image_model: prev.default_image_model === removedId ? '' : prev.default_image_model,
        providers: {
          ...prev.providers,
          [providerId]: {
            ...provider,
            models: models.length > 0 ? models : [''],
            image_models: provider.image_models.filter(model => model !== removed),
            vision_models: provider.vision_models.filter(model => model !== removed),
            tool_models: provider.tool_models.filter(model => model !== removed),
            structured_output_models: provider.structured_output_models.filter(model => model !== removed),
            context_windows,
          },
        },
      }
    })
  }

  const toggleImageModel = (providerId: string, model: string, enabled: boolean) => {
    const modelName = model.trim()
    if (!modelName) return
    setAiConfig(prev => {
      const provider = prev.providers[providerId]
      const image_models = enabled
        ? normalizeModelNames([...provider.image_models, modelName])
        : provider.image_models.filter(item => item !== modelName)
      const modelId = `${providerId}:${modelName}`
      return {
        ...prev,
        default_image_model: enabled && !prev.default_image_model
          ? modelId
          : (!enabled && prev.default_image_model === modelId ? '' : prev.default_image_model),
        providers: {
          ...prev.providers,
          [providerId]: { ...provider, image_models },
        },
      }
    })
  }

  const toggleCapabilityModel = (
    providerId: string,
    model: string,
    capability: 'vision_models' | 'tool_models' | 'structured_output_models',
    enabled: boolean,
  ) => {
    const modelName = model.trim()
    if (!modelName) return
    setAiConfig(prev => {
      const provider = prev.providers[providerId]
      const capabilityModels = enabled
        ? normalizeModelNames([...provider[capability], modelName])
        : provider[capability].filter(item => item !== modelName)
      return {
        ...prev,
        providers: {
          ...prev.providers,
          [providerId]: { ...provider, [capability]: capabilityModels },
        },
      }
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await UpdateAiConfig(wailsConfig.AIConfig.createFrom(buildAiConfigPayload(aiConfig)))
      toast.success('配置已保存')
    } catch (error: unknown) {
      toast.error('保存失败: ' + getErrorMessage(error))
    } finally { setSaving(false) }
  }

  const handleFetchModels = async (providerId: string) => {
    const provider = aiConfig.providers[providerId]
    if (!provider?.base_url || !provider?.api_key) {
      toast.error('请先填写 API 地址和 Key')
      return
    }
    setFetchingProvider(providerId)
    try {
      await UpdateAiConfig(wailsConfig.AIConfig.createFrom(buildAiConfigPayload(aiConfig)))
      const result = await GetStoryAiProviderModels(providerId)
      const list = result?.models
        ?.map(model => model.model || String(model.id || '').split(':').slice(1).join(':'))
        .filter(Boolean) || []
      setModelCandidates(prev => ({ ...prev, [providerId]: list }))
      toast.success(`获取到 ${list.length} 个模型`)
    } catch (error: unknown) {
      toast.error('获取模型失败: ' + getErrorMessage(error))
    } finally { setFetchingProvider(null) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8" style={{ color: 'var(--muted-foreground)' }}>
        <Loader2 size={16} className="animate-spin" />
      </div>
    )
  }

  const provider = selectedId ? aiConfig.providers[selectedId] : null
  const showKey = selectedId ? showKeys[selectedId] === true : false
  const modelCandidateListId = selectedId ? `ai-model-candidates-${selectedId.replace(/[^a-zA-Z0-9_-]/g, '-')}` : ''
  const candidates = selectedId ? (modelCandidates[selectedId] || []) : []
  const configured = Boolean(provider && provider.base_url.trim() && provider.api_key.trim())

  return (
    <div className="flex h-full min-h-0">
      {/* ── 左侧：模型源列表（master-detail 主列表） ── */}
      <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r bg-card" style={{ borderColor: 'var(--border)' }}>
        <div className="flex h-9 shrink-0 items-center justify-between border-b px-3" style={{ borderColor: 'var(--border)' }}>
          <span className="text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>模型源</span>
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums" style={{ color: 'var(--foreground)' }}>{providerIds.length}</span>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
          {providerIds.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <span className="flex size-10 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--muted)' }}>
                <Server size={18} style={{ color: 'var(--muted-foreground)' }} />
              </span>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>暂无模型源，点击下方添加</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {providerIds.map(providerId => (
                <ProviderListItem
                  key={providerId}
                  id={providerId}
                  provider={aiConfig.providers[providerId]}
                  selected={selectedId === providerId}
                  isDefault={
                    aiConfig.default_model.startsWith(`${providerId}:`) ||
                    aiConfig.default_image_model.startsWith(`${providerId}:`)
                  }
                  onClick={() => setSelectedProvider(providerId)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t p-2" style={{ borderColor: 'var(--border)' }}>
          <button onClick={addProvider} className={`${btnOutline} w-full justify-center`}>
            <Plus size={14} /> 添加模型源
          </button>
        </div>
      </aside>

      {/* ── 右侧：模型源详情 ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!provider || !selectedId ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6" style={{ color: 'var(--muted-foreground)' }}>
            <span className="flex size-14 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--muted)' }}>
              <Sparkles size={24} />
            </span>
            <p className="text-sm">暂无模型源，请先添加</p>
            <button onClick={addProvider}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              <Plus size={14} /> 添加模型源
            </button>
          </div>
        ) : (
          <>
            {/* 详情头部 */}
            <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-5" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0">
                {editingId ? (
                  <input
                    autoFocus
                    value={idDraft}
                    onChange={e => setIdDraft(e.target.value)}
                    onBlur={commitProviderId}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitProviderId()
                      if (e.key === 'Escape') {
                        cancelEditRef.current = true
                        setEditingId(false)
                      }
                    }}
                    className={`${inputClass} h-7 w-52 font-medium`}
                    style={inputStyle}
                    aria-label="模型源标识"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-serif text-base font-medium" style={{ color: 'var(--foreground)' }}>{selectedId}</h2>
                    <button
                      onClick={() => { cancelEditRef.current = false; setIdDraft(selectedId); setEditingId(true) }}
                      className="rounded p-1 transition-colors hover:bg-secondary"
                      style={{ color: 'var(--muted-foreground)' }}
                      aria-label="重命名模型源"
                    >
                      <Pencil size={13} />
                    </button>
                    {(aiConfig.default_model.startsWith(`${selectedId}:`) || aiConfig.default_image_model.startsWith(`${selectedId}:`)) && (
                      <Badge tone="green">默认</Badge>
                    )}
                  </div>
                )}
                <p className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                  {provider.base_url || '未配置 API 地址'}
                  <span className="mx-1.5">·</span>
                  {configured ? '已配置' : '未配置'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => handleFetchModels(selectedId)} disabled={fetchingProvider === selectedId}
                  className={btnOutline}>
                  {fetchingProvider === selectedId ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  获取模型
                </button>
                <button onClick={() => setDeleteProviderId(selectedId)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-secondary"
                  style={{ borderColor: 'var(--border)', color: 'var(--destructive)' }}
                  aria-label={`删除模型源 ${selectedId}`}>
                  <Trash2 size={14} />
                </button>
                <button onClick={handleSave} disabled={saving}
                  className={btnPrimary}
                  style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={14} />}
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </header>

            {/* 详情内容 */}
            <div className="custom-scrollbar min-h-0 flex-1 overflow-auto p-5">
              <div className="mx-auto max-w-3xl space-y-5">
                <Section title="连接信息" description="OpenAI 兼容的 API 端点。填写后可通过右上角「获取模型」连接并拉取可用模型列表。">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Field label="API 地址" description="如 https://api.openai.com/v1">
                      <input type="text" value={provider.base_url}
                        onChange={e => updateProvider(selectedId, { base_url: e.target.value })}
                        className={inputClass} style={inputStyle} />
                    </Field>
                    <Field label="API Key">
                      <div className="relative">
                        <input type={showKey ? 'text' : 'password'} value={provider.api_key}
                          onChange={e => updateProvider(selectedId, { api_key: e.target.value })}
                          className={`${inputClass} pr-9`} style={inputStyle} />
                        <button type="button" onClick={() => setShowKeys(prev => ({ ...prev, [selectedId]: !showKey }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 transition-colors"
                          style={{ color: 'var(--muted-foreground)' }} aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}>
                          {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </Field>
                  </div>
                </Section>

                <Section title="模型列表" description="标记模型实际能力；“上下文窗口”留空时自动推断，右侧显示实际生效值。">
                  <div className="space-y-2">
                    {provider.models.map((model, index) => {
                      const modelName = model.trim()
                      const supportsImage = Boolean(modelName) && provider.image_models.includes(modelName)
                      const supportsVision = Boolean(modelName) && provider.vision_models.includes(modelName)
                      const supportsTools = Boolean(modelName) && provider.tool_models.includes(modelName)
                      const supportsStructuredOutput = Boolean(modelName) && provider.structured_output_models.includes(modelName)
                      const configuredContextWindow = provider.context_windows[modelName]
                      const inferredContextWindow = inferAiModelContextWindow(modelName)
                      const effectiveContextWindow = configuredContextWindow ?? inferredContextWindow
                      return (
                        <div key={index} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                          <div className="flex items-center gap-2">
                            <input value={model} onChange={e => updateModel(selectedId, index, e.target.value)}
                              placeholder="gpt-4o"
                              list={candidates.length > 0 ? modelCandidateListId : undefined}
                              className={`${inputClass} min-w-0 flex-1`} style={inputStyle} />
                            <div className="w-32 shrink-0">
                              <input
                                type="number"
                                min={1}
                                step={1000}
                                value={configuredContextWindow ?? ''}
                                placeholder={String(inferredContextWindow)}
                                disabled={!modelName}
                                onChange={event => updateContextWindow(selectedId, model, event.target.value)}
                                aria-label={`${modelName || '未命名模型'} 上下文窗口 (tokens)`}
                                title="上下文窗口 (tokens)"
                                className={`${inputClass} pr-1 disabled:opacity-40`}
                                style={inputStyle}
                              />
                            </div>
                            <button onClick={() => removeModel(selectedId, index)}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors hover:bg-secondary"
                              style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                              aria-label="删除模型">
                              <X size={14} />
                            </button>
                          </div>
                          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <CapabilityChip icon={Eye} label="视觉理解" color={CAPABILITY_COLORS.vision} active={supportsVision}
                                disabled={!modelName}
                                onClick={() => toggleCapabilityModel(selectedId, model, 'vision_models', !supportsVision)} />
                              <CapabilityChip icon={Settings} label="工具调用" color={CAPABILITY_COLORS.tools} active={supportsTools}
                                disabled={!modelName}
                                onClick={() => toggleCapabilityModel(selectedId, model, 'tool_models', !supportsTools)} />
                              <CapabilityChip icon={Check} label="结构化输出" color={CAPABILITY_COLORS.structured} active={supportsStructuredOutput}
                                disabled={!modelName}
                                onClick={() => toggleCapabilityModel(selectedId, model, 'structured_output_models', !supportsStructuredOutput)} />
                              <CapabilityChip icon={ImageIcon} label="图片生成" color={CAPABILITY_COLORS.image} active={supportsImage}
                                disabled={!modelName}
                                onClick={() => toggleImageModel(selectedId, model, !supportsImage)} />
                            </div>
                            <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                              生效 {formatContextWindow(effectiveContextWindow)} tokens
                              {configuredContextWindow === undefined ? ' · 自动' : ' · 自定义'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                    {candidates.length > 0 && (
                      <datalist id={modelCandidateListId}>
                        {candidates.map(model => <option key={model} value={model} />)}
                      </datalist>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button onClick={() => addModel(selectedId)} className={btnOutline}>
                        <Plus size={14} /> 添加模型
                      </button>
                      <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                        提示：填好 API 地址和 Key 后，可点击右上角「获取模型」拉取可用模型列表。
                      </span>
                    </div>
                  </div>
                </Section>

                <Section title="默认模型" description="未指定模型时使用的回退值，仅显示已配置的模型。">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Field label="默认对话模型">
                      <SelectDropdown
                        value={aiConfig.default_model}
                        options={defaultOptions}
                        onChange={value => setAiConfig(prev => ({ ...prev, default_model: String(value) }))}
                        placeholder="请选择默认对话模型"
                        clearLabel="请选择默认对话模型"
                        ariaLabel="默认对话模型"
                      />
                    </Field>
                    <Field label="默认图片生成模型" description="仅显示已标记图片生成能力的模型。">
                      <SelectDropdown
                        value={aiConfig.default_image_model}
                        options={defaultImageOptions}
                        onChange={value => setAiConfig(prev => ({ ...prev, default_image_model: String(value) }))}
                        placeholder="请选择默认图片生成模型"
                        clearLabel="请选择默认图片生成模型"
                        ariaLabel="默认图片生成模型"
                      />
                    </Field>
                  </div>
                </Section>
              </div>
            </div>
          </>
        )}
      </div>

      <SimpleDeleteDialog
        isOpen={!!deleteProviderId}
        title="删除模型源"
        message={deleteProviderId ? `确定要删除模型源「${deleteProviderId}」吗？其模型配置与默认模型选择将一并移除。` : ''}
        onConfirm={() => {
          if (deleteProviderId) removeProvider(deleteProviderId)
        }}
        onCancel={() => setDeleteProviderId(null)}
        t={(key) => t(key, language)}
      />
    </div>
  )
}

// ─── AiTab 辅助组件（桌面 master-detail 风格） ─────────

function ProviderListItem({ id, provider, selected, isDefault, onClick }: {
  id: string
  provider: AiProviderConfig
  selected: boolean
  isDefault: boolean
  onClick: () => void
}) {
  const configured = Boolean(provider.base_url.trim() && provider.api_key.trim())
  const modelCount = provider.models.filter(model => model.trim()).length
  return (
    <button onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${selected ? '' : 'hover:bg-secondary'}`}
      style={{ backgroundColor: selected ? 'var(--accent)' : 'transparent' }}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: selected ? 'color-mix(in srgb, var(--accent-foreground) 14%, transparent)' : 'var(--muted)' }}>
        <Server size={14} style={{ color: selected ? 'var(--accent-foreground)' : 'var(--muted-foreground)' }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium" style={{ color: selected ? 'var(--accent-foreground)' : 'var(--foreground)' }}>{id}</span>
          {isDefault && (
            <span className="shrink-0 rounded px-1 py-px text-[9px] font-medium"
              style={{ backgroundColor: 'color-mix(in srgb, #4f9d69 14%, transparent)', color: '#4f9d69' }}>默认</span>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[10px]"
          style={{ color: selected ? 'color-mix(in srgb, var(--accent-foreground) 72%, transparent)' : 'var(--muted-foreground)' }}>
          <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: configured ? '#4f9d69' : 'var(--muted-foreground)' }} />
          {configured ? `${modelCount} 个模型` : '未配置'}
        </span>
      </span>
    </button>
  )
}

function CapabilityChip({ label, icon: Icon, color, active, disabled, onClick }: {
  label: string
  icon: typeof Eye
  color: string
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] transition-colors ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
      style={capabilityStyle(color, active)}>
      <Icon size={13} /> {label}
    </button>
  )
}

// ─── Tab 7: 日志 ──────────────────────────────────────

const LOG_CATEGORIES = [
  { value: '', label: '全部' },
  { value: 'auth', label: '认证' },
  { value: 'upload', label: '上传' },
  { value: 'photo', label: '照片' },
  { value: 'album', label: '相册' },
  { value: 'story', label: '叙事' },
  { value: 'blog', label: '博客' },
  { value: 'storage', label: '存储' },
  { value: 'ai', label: 'AI' },
  { value: 'system', label: '系统' },
]

const LOG_LEVELS = [
  { value: '', label: '全部' },
  { value: 'info', label: '信息' },
  { value: 'warn', label: '警告' },
  { value: 'error', label: '错误' },
]

const LOG_LEVEL_COLORS: Record<string, { bg: string; text: string }> = {
  info: { bg: 'color-mix(in srgb, #3b82f6 14%, transparent)', text: '#3b82f6' },
  warn: { bg: 'color-mix(in srgb, #f59e0b 14%, transparent)', text: '#d97706' },
  error: { bg: 'color-mix(in srgb, var(--destructive) 12%, transparent)', text: 'var(--destructive)' },
}

interface LogStats {
  total?: number
  enabled?: boolean
  by_category?: Record<string, number>
}

function LogTab() {
  const { language } = usePreferences()
  const [logConfig, setLogConfig] = useState({ enabled: false, max_entries: 1000 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [logs, setLogs] = useState<services.LogEntry[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [stats, setStats] = useState<LogStats | null>(null)
  const [clearLogsDialog, setClearLogsDialog] = useState(false)

  useEffect(() => {
    setLoading(true)
    void GetLogConfig()
      .then((result) => {
        setLogConfig({
          enabled: Boolean(result.enabled),
          max_entries: Number(result.max_entries ?? 1000),
        })
      })
      .finally(() => setLoading(false))
  }, [])

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const result = await GetLogs(categoryFilter, levelFilter, 200)
      setLogs(result || [])
    } catch {} finally { setLogsLoading(false) }
  }, [categoryFilter, levelFilter])

  const fetchStats = useCallback(async () => {
    try {
      const result = await GetLogStats()
      setStats(result as LogStats)
    } catch {}
  }, [])

  useEffect(() => { fetchLogs(); fetchStats() }, [fetchLogs, fetchStats])

  const handleSaveConfig = async () => {
    setSaving(true)
    try {
      await UpdateLogConfig(logConfig)
      toast.success('日志配置已保存')
    } catch (err: unknown) {
      toast.error('保存失败: ' + getErrorMessage(err))
    } finally { setSaving(false) }
  }

  const handleClearLogs = async () => {
    try {
      await ClearLogs()
      toast.success('日志已清空')
      setClearLogsDialog(false)
      fetchLogs()
      fetchStats()
    } catch {}
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8" style={{ color: 'var(--muted-foreground)' }}>
        <Loader2 size={16} className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 日志配置 */}
      <Section title="日志配置">
        <Field label="启用日志" description="开启后将记录用户操作日志">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox"
              checked={logConfig.enabled}
              onChange={e => setLogConfig(prev => ({ ...prev, enabled: e.target.checked }))}
              className="rounded" />
            <span className="text-xs">启用操作日志</span>
          </label>
        </Field>

        <Field label="最大日志条数" description="超出限制时自动清理旧日志">
          <input type="number" value={logConfig.max_entries}
            onChange={e => setLogConfig(prev => ({ ...prev, max_entries: parseInt(e.target.value) || 1000 }))}
            min={100}
            max={10000}
            className={inputClass}
            style={inputStyle} />
        </Field>

        <div className="pt-2">
          <button onClick={handleSaveConfig} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-xs rounded-md disabled:opacity-50"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </Section>

      {/* 日志统计 */}
      {stats && (
        <Section title="日志统计">
          <div className="grid grid-cols-2 gap-3">
            <CacheStat label="总日志数" value={String(stats.total || 0)} />
            <CacheStat label="状态" value={stats.enabled ? '已启用' : '已禁用'} />
          </div>
          {stats.by_category && (
            <div className="flex flex-wrap gap-2 mt-2">
              {Object.entries(stats.by_category).map(([cat, count]) => (
                <span key={cat} className="text-[10px] px-2 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                  {LOG_CATEGORIES.find(c => c.value === cat)?.label || cat}: {count as number}
                </span>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* 日志查看 */}
      <Section title="操作日志">
        {/* 过滤器 */}
        <div className="flex items-center gap-2 mb-4">
          <Filter size={14} style={{ color: 'var(--muted-foreground)' }} />
          <SelectDropdown
            value={categoryFilter}
            options={LOG_CATEGORIES.filter(c => c.value !== '').map(c => ({ value: c.value, label: c.label }))}
            onChange={value => setCategoryFilter(String(value))}
            placeholder="全部"
            clearLabel="全部"
            size="sm"
            ariaLabel="日志分类筛选"
            className="w-36"
          />
          <SelectDropdown
            value={levelFilter}
            options={LOG_LEVELS.filter(l => l.value !== '').map(l => ({ value: l.value, label: l.label }))}
            onChange={value => setLevelFilter(String(value))}
            placeholder="全部"
            clearLabel="全部"
            size="sm"
            ariaLabel="日志级别筛选"
            className="w-36"
          />
          <div className="flex-1" />
          <button onClick={() => void OpenLogDir()}
            className={btnOutline}>
            <FolderOpen size={12} />
            打开目录
          </button>
          <button onClick={() => setClearLogsDialog(true)}
            className={btnOutline}
            style={{ color: 'var(--destructive)' }}>
            <Trash size={12} />
            清空
          </button>
        </div>

        {/* 日志列表 */}
        {logsLoading ? (
          <div className="flex items-center justify-center py-8" style={{ color: 'var(--muted-foreground)' }}>
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8" style={{ color: 'var(--muted-foreground)' }}>
            <FileText size={24} className="mb-2 opacity-40" />
            <p className="text-xs">暂无日志</p>
          </div>
        ) : (
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {logs.map((log, index) => (
              <div key={index}
                className="flex items-start gap-2 px-3 py-2 rounded text-xs"
                style={{ backgroundColor: index % 2 === 0 ? 'transparent' : 'var(--muted)' }}>
                <span className="text-[10px] font-mono shrink-0 mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                  {new Date(log.timestamp).toLocaleString()}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                  style={{
                    backgroundColor: LOG_LEVEL_COLORS[log.level]?.bg || 'var(--muted)',
                    color: LOG_LEVEL_COLORS[log.level]?.text || 'var(--muted-foreground)',
                  }}>
                  {log.level}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}>
                  {LOG_CATEGORIES.find(c => c.value === log.category)?.label || log.category}
                </span>
                <span className="font-medium">{log.action}</span>
                <span style={{ color: 'var(--muted-foreground)' }}>{log.message}</span>
                {log.details && (
                  <span className="text-[10px] truncate" style={{ color: 'var(--muted-foreground)' }}>
                    {log.details}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <SimpleDeleteDialog
        isOpen={clearLogsDialog}
        title="清空日志"
        message="确定要清空所有操作日志吗？此操作不可撤销。"
        onConfirm={handleClearLogs}
        onCancel={() => setClearLogsDialog(false)}
        t={(key) => t(key, language)}
      />
    </div>
  )
}
