// 系统设置 · 存储源 / 插件（StorageSource CRUD）

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import { useDataRevision } from '@/hooks/useDataRevision'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { Skeleton } from '@/components/admin/Skeleton'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import { isDevelopmentBuild } from '@/lib/app-updater'
import {
  CreateDesktopStorageSource,
  GetDesktopSystemPlugins,
  GetDesktopPluginMarketplace,
  InstallDesktopMarketplacePlugin,
  ListDesktopSystemPluginVersions,
  InstallDesktopSystemPlugin,
  InstallDesktopSystemPluginPackage,
  UninstallDesktopSystemPlugin,
  OpenDesktopSystemPluginLocation,
  SelectDesktopStoragePluginManifest,
  SelectDesktopStoragePluginPackage,
  RollbackDesktopSystemPlugin,
  DeleteDesktopStorageSource,
  GetDesktopStorageSourceCredentials,
  SetDesktopStorageSourceEnabled,
  TestDesktopStorageSource,
  UpdateDesktopStorageSource,
  GetStorageSources,
} from '../../../wailsjs/go/main/App'
import { BrowserOpenURL } from '../../../wailsjs/runtime/runtime'
import {
  Loader2,
  HardDrive,
  RefreshCw,
  Pencil,
  Trash2,
  Plus,
  Check,
  Cloud,
  Eye,
  EyeOff,
  FolderOpen,
  Database,
  Github,
  ExternalLink,
  Puzzle,
  Archive,
  Download,
  CircleCheck,
  TriangleAlert,
  Power,
  Search,
  PackageOpen,
} from 'lucide-react'
import { getErrorMessage, inputClass, inputStyle, btnPrimary, Field, isRecord } from './shared'
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
  config?: Record<string, string>
  runtime?: string
  pluginId?: string
  local?: boolean
  enabled?: boolean
  status?: string
  lastError?: string
}

interface PluginDescriptor {
  id: string
  version: string
  apiVersion: string
  coreApiVersion?: string
  name: string
  description?: string
  type: 'node' | 'executable' | string
  runtime?: string
  platform?: string
  platforms?: string[]
  command?: string
  args?: string[]
  runtimeAvailable: boolean
  runtimeStatus?: string
  signatureStatus?: string
  compatibilityStatus?: string
  builtIn: boolean
  official: boolean
  installed: boolean
  manifestPath?: string
  capabilities?: string[]
  contributions?: Array<{ domain: string; apiVersion: string; capabilities?: string[] }>
  permissions?: string[]
  configSchema?: Record<string, unknown>
  credentialSchema?: Record<string, unknown>
}

interface PluginVersionDescriptor {
  pluginId: string
  version: string
  type: string
  runtime?: string
  platforms?: string[]
  active: boolean
  runtimeAvailable: boolean
  runtimeStatus?: string
  signatureStatus?: string
}

interface MarketplacePlugin {
  id: string
  name: string
  description?: string
  author?: string
  version: string
  coreApiVersion: string
  contributions?: Array<{ domain: string; apiVersion: string; capabilities?: string[] }>
  homepage?: string
  repository?: string
  available: boolean
  compatibilityStatus: string
  installedVersion?: string
  updateAvailable: boolean
}

interface MarketplaceCatalog {
  schemaVersion: number
  sourceName: string
  sourceUrl: string
  updatedAt?: string
  fetchedAt: string
  cached: boolean
  stale: boolean
  warning?: string
  plugins: MarketplacePlugin[]
}

interface SchemaField {
  key: string
  title: string
  type: string
  secret: boolean
  required: boolean
  description?: string
}

function localizedSchemaText(field: Record<string, unknown>, key: 'title' | 'description', language: 'zh' | 'en'): string | undefined {
  const translations = field['x-i18n']
  if (isRecord(translations)) {
    const locale = translations[language] || translations[language === 'zh' ? 'zh-CN' : 'en-US']
    if (isRecord(locale) && typeof locale[key] === 'string') return locale[key] as string
  }
  return typeof field[key] === 'string' ? field[key] as string : undefined
}

function schemaFields(schema: Record<string, unknown> | undefined, language: 'zh' | 'en' = 'zh'): SchemaField[] {
  const properties = schema?.properties
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return []
  const requiredValues = Array.isArray(schema?.required) ? schema.required.filter((value): value is string => typeof value === 'string') : []
  const required = new Set(requiredValues)
  return Object.entries(properties as Record<string, unknown>).flatMap(([key, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const field = value as Record<string, unknown>
    return [{
      key,
      title: localizedSchemaText(field, 'title', language) || key,
      type: typeof field.type === 'string' ? field.type : 'string',
      secret: field.format === 'password' || field.secret === true,
      required: field.required === true || required.has(key),
      description: localizedSchemaText(field, 'description', language),
    }]
  })
}

const STORAGE_TYPE_META: Record<string, { label: string; icon: typeof HardDrive }> = {
  local: { label: '本地存储', icon: HardDrive },
  github: { label: 'GitHub', icon: Github },
  s3: { label: 'S3/R2', icon: Cloud },
}

function storageTypeMeta(type: string, plugin?: Pick<PluginDescriptor, 'id' | 'name'>) {
  if (plugin?.name) {
    const icon = plugin.id === 'github' ? Github : plugin.id === 's3-compatible' ? Cloud : Database
    return { label: plugin.name, icon }
  }
  if (type === 's3-compatible') return STORAGE_TYPE_META.s3
  return STORAGE_TYPE_META[type] || { label: type || '存储插件', icon: Database }
}

function supportsStorage(plugin: PluginDescriptor) {
  return plugin.contributions?.some(contribution => contribution.domain === 'storage')
    || plugin.capabilities?.some(capability => capability.startsWith('object.') || capability === 'source.validate')
    || plugin.id === 'github'
    || plugin.id === 's3-compatible'
}

function sourceStatus(source: StorageSource) {
  if (source.enabled === false) return { label: '已停用', tone: 'muted' as const }
  if (source.lastError || source.status === 'error' || source.status === 'failed') return { label: '连接异常', tone: 'error' as const }
  if (source.status === 'ready' || source.status === 'healthy' || source.status === 'active') return { label: '运行正常', tone: 'success' as const }
  return { label: '尚未测试', tone: 'pending' as const }
}
export function StorageTab({ mode = 'sources' }: { mode?: 'sources' | 'plugins' }) {
  const { language } = usePreferences()
  const [developmentBuild, setDevelopmentBuild] = useState(false)
  const [activePluginTab, setActivePluginTab] = useState('')
  const [sources, setSources] = useState<StorageSource[]>([])
  const [plugins, setPlugins] = useState<PluginDescriptor[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null) // 'local' | 'github' | 's3'
  const [deleteTarget, setDeleteTarget] = useState<StorageSource | null>(null)
  const [uninstallTarget, setUninstallTarget] = useState<PluginDescriptor | null>(null)
  const [pluginVersions, setPluginVersions] = useState<Record<string, PluginVersionDescriptor[]>>({})
  const [versionLoading, setVersionLoading] = useState<string | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<{ plugin: PluginDescriptor; version: PluginVersionDescriptor } | null>(null)
  const [pluginView, setPluginView] = useState<'marketplace' | 'installed'>('marketplace')
  const [marketplace, setMarketplace] = useState<MarketplaceCatalog | null>(null)
  const [marketplaceLoading, setMarketplaceLoading] = useState(false)
  const [marketplaceError, setMarketplaceError] = useState('')
  const [marketplaceQuery, setMarketplaceQuery] = useState('')
  const [installingMarketplacePlugin, setInstallingMarketplacePlugin] = useState('')
  const fetchSources = useCallback(async () => {
    setLoading(true)
    try {
      const result = await GetStorageSources()
      setSources(result || [])
    } catch {} finally { setLoading(false) }
  }, [])

  const fetchPlugins = useCallback(async () => {
    try {
      const result = await GetDesktopSystemPlugins()
      setPlugins((result || []) as PluginDescriptor[])
    } catch {}
  }, [])

  const fetchMarketplace = useCallback(async (force = false) => {
    setMarketplaceLoading(true)
    setMarketplaceError('')
    try {
      const result = await GetDesktopPluginMarketplace(force)
      const catalog = result as MarketplaceCatalog
      setMarketplace({
        ...catalog,
        plugins: Array.isArray(catalog.plugins) ? catalog.plugins : [],
      })
    } catch (err: unknown) {
      setMarketplaceError(getErrorMessage(err) || '无法获取插件市场')
    } finally {
      setMarketplaceLoading(false)
    }
  }, [])

  const storageSourcesRevision = useDataRevision('storage-sources')
  useCachedPageEffect(() => { void fetchSources(); void fetchPlugins() }, [fetchSources, fetchPlugins, storageSourcesRevision])

  useEffect(() => {
    if (mode === 'plugins') void fetchMarketplace(false)
  }, [fetchMarketplace, mode])

  useEffect(() => {
    let active = true
    void isDevelopmentBuild().then((isDev) => {
      if (active) setDevelopmentBuild(isDev)
    }).catch(() => {
      if (active) setDevelopmentBuild(false)
    })
    return () => { active = false }
  }, [])

  const installedPlugins = plugins.filter(plugin => plugin.installed)
  const storagePlugins = installedPlugins.filter(supportsStorage)
  const resolvedPluginTab = storagePlugins.some(plugin => plugin.id === activePluginTab)
    ? activePluginTab
    : storagePlugins[0]?.id || ''
  const activePlugin = storagePlugins.find(plugin => plugin.id === resolvedPluginTab)
  const activeSources = resolvedPluginTab
    ? sources.filter(source => (source.pluginId || source.type) === resolvedPluginTab)
    : []
  const orphanedSources = sources.filter(source => !storagePlugins.some(plugin => plugin.id === (source.pluginId || source.type)))
  const addingPluginID = adding?.startsWith('plugin:') ? adding.slice('plugin:'.length) : ''
  const validAdding = addingPluginID && storagePlugins.some(plugin => plugin.id === addingPluginID) ? adding : null

  const installPlugin = async () => {
    if (!developmentBuild) {
      toast.error('生产构建仅允许安装经过签名校验的插件包')
      return
    }
    try {
      const pluginDirectory = await SelectDesktopStoragePluginManifest()
      if (!pluginDirectory) return
      await InstallDesktopSystemPlugin(pluginDirectory)
      await fetchPlugins()
      toast.success('插件已安装')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || '插件安装失败')
    }
  }

  const installPluginPackage = async () => {
    try {
      const packagePath = await SelectDesktopStoragePluginPackage()
      if (!packagePath) return
      await InstallDesktopSystemPluginPackage(packagePath)
      await fetchPlugins()
      toast.success('插件包已安装')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || '插件包安装失败')
    }
  }

  const installMarketplacePlugin = async (plugin: MarketplacePlugin) => {
    setInstallingMarketplacePlugin(plugin.id)
    try {
      await InstallDesktopMarketplacePlugin(plugin.id, plugin.version)
      await fetchPlugins()
      await fetchMarketplace(false)
      toast.success(plugin.updateAvailable ? '插件已更新' : '插件已安装')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || '插件安装失败')
    } finally {
      setInstallingMarketplacePlugin('')
    }
  }

  const loadPluginVersions = async (pluginID: string) => {
    setVersionLoading(pluginID)
    try {
      const result = await ListDesktopSystemPluginVersions(pluginID)
      setPluginVersions(previous => ({ ...previous, [pluginID]: (result || []) as PluginVersionDescriptor[] }))
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || '无法读取插件版本')
    } finally {
      setVersionLoading(null)
    }
  }

  const confirmRollback = async () => {
    if (!rollbackTarget) return
    try {
      await RollbackDesktopSystemPlugin(rollbackTarget.plugin.id, rollbackTarget.version.version)
      toast.success(`插件已回滚到 v${rollbackTarget.version.version}`)
      setRollbackTarget(null)
      await fetchPlugins()
      await loadPluginVersions(rollbackTarget.plugin.id)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || '插件回滚失败')
    }
  }

  const renderPluginVersions = (plugin: PluginDescriptor) => {
    if (!plugin.installed) return null
    const versions = pluginVersions[plugin.id]
    return (
      <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium">已安装版本</span>
          <button type="button" onClick={() => void loadPluginVersions(plugin.id)} disabled={versionLoading === plugin.id}
            className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] transition-colors hover:bg-secondary disabled:opacity-50"
            style={{ borderColor: 'var(--border)' }}>
            <RefreshCw size={11} className={versionLoading === plugin.id ? 'animate-spin' : ''} />
            {versions ? '刷新版本' : '查看版本'}
          </button>
        </div>
        {versions && <div className="mt-2 space-y-1.5">
          {versions.map(version => (
            <div key={version.version} className="flex items-center gap-2 rounded border px-2 py-1.5 text-[10px]" style={{ borderColor: 'var(--border)' }}>
              <span className="font-medium">v{version.version}</span>
              {version.active && <span className="rounded bg-primary/10 px-1.5 py-0.5" style={{ color: 'var(--primary)' }}>当前</span>}
              <span className="ml-auto" style={{ color: version.runtimeAvailable ? '#4f9d69' : 'var(--destructive)' }}>
                {version.runtimeAvailable ? '可运行' : (version.runtimeStatus || '不可运行')}
              </span>
              {!version.active && version.runtimeAvailable && <button type="button" onClick={() => setRollbackTarget({ plugin, version })}
                className="rounded border px-2 py-0.5 transition-colors hover:bg-secondary" style={{ borderColor: 'var(--border)' }}>
                回滚
              </button>}
            </div>
          ))}
          {versions.length === 0 && <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>没有可用的版本目录</p>}
        </div>}
      </div>
    )
  }

  const openPluginLocation = async (pluginID: string) => {
    try {
      await OpenDesktopSystemPluginLocation(pluginID)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || '无法打开插件位置')
    }
  }

  const confirmUninstall = async () => {
    if (!uninstallTarget) return
    try {
      await UninstallDesktopSystemPlugin(uninstallTarget.id)
      toast.success('插件已卸载')
      setUninstallTarget(null)
      await fetchPlugins()
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || '插件卸载失败')
    }
  }


  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await DeleteDesktopStorageSource(deleteTarget.id)
      toast.success('已删除')
      setDeleteTarget(null)
      fetchSources()
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || '删除失败')
    }
  }

  const installedSystemPlugins = plugins.filter(plugin => plugin.installed)
  const normalizedMarketplaceQuery = marketplaceQuery.trim().toLocaleLowerCase()
  const visibleMarketplacePlugins = (marketplace?.plugins || []).filter(plugin => {
    if (!normalizedMarketplaceQuery) return true
    return [plugin.name, plugin.id, plugin.description, plugin.author]
      .some(value => value?.toLocaleLowerCase().includes(normalizedMarketplaceQuery))
  })

  return (
    <div className="space-y-6">
      {mode === 'plugins' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex h-9 items-center rounded-md border p-0.5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)' }} role="tablist" aria-label="插件视图">
              <button type="button" role="tab" aria-selected={pluginView === 'marketplace'} onClick={() => setPluginView('marketplace')}
                className="h-8 rounded px-3 text-xs font-medium transition-colors"
                style={{ backgroundColor: pluginView === 'marketplace' ? 'var(--background)' : 'transparent', color: pluginView === 'marketplace' ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                插件市场
              </button>
              <button type="button" role="tab" aria-selected={pluginView === 'installed'} onClick={() => setPluginView('installed')}
                className="h-8 rounded px-3 text-xs font-medium transition-colors"
                style={{ backgroundColor: pluginView === 'installed' ? 'var(--background)' : 'transparent', color: pluginView === 'installed' ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                已安装 ({installedSystemPlugins.length})
              </button>
            </div>
            {pluginView === 'marketplace' && (
              <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                <label className="relative w-full max-w-64">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
                  <input value={marketplaceQuery} onChange={event => setMarketplaceQuery(event.target.value)} placeholder="搜索插件"
                    className="h-9 w-full rounded-md border bg-transparent pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                    style={{ borderColor: 'var(--border)' }} />
                </label>
                <button type="button" onClick={() => void fetchMarketplace(true)} disabled={marketplaceLoading}
                  title="刷新插件市场" aria-label="刷新插件市场"
                  className="flex size-9 shrink-0 items-center justify-center rounded-md border transition-colors hover:bg-secondary disabled:opacity-50"
                  style={{ borderColor: 'var(--border)' }}>
                  <RefreshCw size={15} className={marketplaceLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            )}
          </div>

          {pluginView === 'marketplace' ? (
            <div className="space-y-3">
              {marketplace && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                  <span>{marketplace.sourceName}</span>
                  <span>{(marketplace.plugins || []).length} 个插件</span>
                  {marketplace.stale ? (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><TriangleAlert size={12} />离线缓存</span>
                  ) : marketplace.cached ? (
                    <span>本地缓存</span>
                  ) : (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CircleCheck size={12} />已同步</span>
                  )}
                  {marketplace.warning && <span className="text-amber-600 dark:text-amber-400">{marketplace.warning}</span>}
                </div>
              )}

              {marketplaceLoading && !marketplace ? (
                <div className="space-y-3 py-2">
                  {[0, 1, 2].map(item => <Skeleton key={item} className="h-24 w-full" />)}
                </div>
              ) : marketplaceError && !marketplace ? (
                <div className="flex min-h-44 flex-col items-center justify-center border-y px-4 py-8 text-center" style={{ borderColor: 'var(--border)' }}>
                  <PackageOpen size={28} style={{ color: 'var(--muted-foreground)' }} />
                  <p className="mt-3 text-sm font-medium">无法载入插件市场</p>
                  <p className="mt-1 max-w-md text-xs" style={{ color: 'var(--muted-foreground)' }}>{marketplaceError}</p>
                  <button type="button" onClick={() => void fetchMarketplace(true)}
                    className="mt-4 flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs transition-colors hover:bg-secondary"
                    style={{ borderColor: 'var(--border)' }}>
                    <RefreshCw size={13} />重试
                  </button>
                </div>
              ) : visibleMarketplacePlugins.length === 0 ? (
                <div className="flex min-h-36 flex-col items-center justify-center border-y px-4 py-8 text-center" style={{ borderColor: 'var(--border)' }}>
                  <PackageOpen size={24} style={{ color: 'var(--muted-foreground)' }} />
                  <p className="mt-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    {marketplaceQuery ? '没有匹配的插件' : '仓库中暂无插件'}
                  </p>
                </div>
              ) : (
                <div className="divide-y border-y" style={{ borderColor: 'var(--border)' }}>
                  {visibleMarketplacePlugins.map(plugin => {
                    const installedCurrent = plugin.installedVersion === plugin.version
                    const isInstalling = installingMarketplacePlugin === plugin.id
                    return (
                      <div key={plugin.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--muted)' }}>
                          {plugin.id === 'github' ? <Github size={18} /> : plugin.id === 's3-compatible' ? <Cloud size={18} /> : <Puzzle size={18} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">{plugin.name}</p>
                            <span className="rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>v{plugin.version}</span>
                            {plugin.installedVersion && <span className="text-[10px] text-emerald-600 dark:text-emerald-400">已安装 v{plugin.installedVersion}</span>}
                          </div>
                          {plugin.description && <p className="mt-1 text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>{plugin.description}</p>}
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                            {plugin.author && <span>{plugin.author}</span>}
                            {plugin.contributions?.map(contribution => <span key={plugin.id + ':' + contribution.domain + '@' + contribution.apiVersion}>{contribution.domain}@{contribution.apiVersion}</span>)}
                            {!plugin.available && <span className="text-amber-600 dark:text-amber-400">{plugin.compatibilityStatus}</span>}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                          {(plugin.homepage || plugin.repository) && (
                            <button type="button" onClick={() => BrowserOpenURL(plugin.homepage || plugin.repository || '')}
                              title="打开插件主页" aria-label="打开插件主页"
                              className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-secondary"
                              style={{ color: 'var(--muted-foreground)' }}>
                              <ExternalLink size={14} />
                            </button>
                          )}
                          <button type="button" onClick={() => void installMarketplacePlugin(plugin)}
                            disabled={!plugin.available || installedCurrent || isInstalling}
                            className="flex h-8 min-w-20 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55"
                            style={{ backgroundColor: installedCurrent ? 'var(--muted)' : 'var(--primary)', color: installedCurrent ? 'var(--muted-foreground)' : 'var(--primary-foreground)' }}>
                            {isInstalling ? <Loader2 size={13} className="animate-spin" /> : installedCurrent ? <CircleCheck size={13} /> : <Download size={13} />}
                            {isInstalling ? '安装中' : installedCurrent ? '已安装' : plugin.updateAvailable ? '更新' : '安装'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="rounded-md border border-dashed px-3 py-2 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                {developmentBuild ? '开发模式可导入未打包插件目录；正式使用请安装经过签名校验的插件包。' : '正式构建仅允许安装经过签名校验的插件包。'}
              </p>
              <div className="divide-y border-y" style={{ borderColor: 'var(--border)' }}>
                {installedSystemPlugins.map(plugin => (
                  <div key={plugin.id} className="flex items-start gap-3 py-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--muted)' }}>
                      {plugin.id === 'github' ? <Github size={18} /> : plugin.id === 's3-compatible' ? <Cloud size={18} /> : <Puzzle size={18} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{plugin.name || plugin.id}</p>
                        <span className="rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>v{plugin.version}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>{plugin.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                        <span className="rounded border px-1.5 py-0.5" style={{ borderColor: plugin.runtimeAvailable ? 'color-mix(in srgb, #4f9d69 50%, var(--border))' : 'var(--border)', color: plugin.runtimeAvailable ? '#4f9d69' : 'var(--destructive)' }}>
                          {plugin.runtimeAvailable ? 'runtime 可用' : (plugin.runtimeStatus || 'runtime 不可用')}
                        </span>
                        <span className="rounded border px-1.5 py-0.5" style={{ borderColor: 'var(--border)' }}>签名：{plugin.signatureStatus || 'unknown'}</span>
                        {plugin.contributions?.map(contribution => <span key={plugin.id + ':' + contribution.domain + '@' + contribution.apiVersion} className="rounded border px-1.5 py-0.5" style={{ borderColor: 'var(--border)' }}>{contribution.domain}@{contribution.apiVersion}</span>)}
                      </div>
                      {renderPluginVersions(plugin)}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => void openPluginLocation(plugin.id)} title="打开插件所在位置" aria-label="打开插件所在位置"
                        className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-secondary" style={{ color: 'var(--muted-foreground)' }}>
                        <FolderOpen size={14} />
                      </button>
                      <button onClick={() => setUninstallTarget(plugin)} title="卸载插件" aria-label="卸载插件"
                        className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-secondary" style={{ color: 'var(--destructive)' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {installedSystemPlugins.length === 0 && (
                <div className="flex min-h-32 flex-col items-center justify-center border-y text-center" style={{ borderColor: 'var(--border)' }}>
                  <PackageOpen size={24} style={{ color: 'var(--muted-foreground)' }} />
                  <p className="mt-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>尚未安装系统插件</p>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-xs font-medium">安装第三方插件</p>
                  <p className="mt-0.5 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>本地插件包仍需通过宿主签名与完整性校验</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => void installPluginPackage()} title="导入第三方插件包" aria-label="导入第三方插件包"
                    className="flex size-8 items-center justify-center rounded-md border transition-colors hover:bg-secondary" style={{ borderColor: 'var(--border)' }}>
                    <Archive size={15} />
                  </button>
                  {developmentBuild && <button onClick={() => void installPlugin()} title="安装开发目录" aria-label="安装开发目录"
                    className="flex size-8 items-center justify-center rounded-md border transition-colors hover:bg-secondary" style={{ borderColor: 'var(--border)' }}>
                    <Puzzle size={15} />
                  </button>}
                </div>
              </div>
            </div>
          )}
        </>
      )}      {mode === 'sources' && <div className="space-y-6">
        <div className="grid grid-cols-3 gap-px overflow-hidden border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--border)' }}>
          <div className="min-w-0 bg-[var(--card)] px-4 py-3"><p className="font-mono text-xl font-semibold tabular-nums">{sources.length}</p><p className="mt-1 text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--muted-foreground)' }}>全部来源</p></div>
          <div className="min-w-0 bg-[var(--card)] px-4 py-3"><p className="font-mono text-xl font-semibold tabular-nums" style={{ color: '#346538' }}>{sources.filter(source => storagePlugins.some(plugin => plugin.id === (source.pluginId || source.type)) && source.enabled !== false && sourceStatus(source).tone !== 'error').length}</p><p className="mt-1 text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--muted-foreground)' }}>运行正常</p></div>
          <div className="min-w-0 bg-[var(--card)] px-4 py-3"><p className="font-mono text-xl font-semibold tabular-nums" style={{ color: '#956400' }}>{sources.filter(source => !storagePlugins.some(plugin => plugin.id === (source.pluginId || source.type)) || source.enabled === false || sourceStatus(source).tone === 'error').length}</p><p className="mt-1 text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--muted-foreground)' }}>需要处理</p></div>
        </div>
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold">按插件查看</p><p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{storagePlugins.length ? '选择插件后管理它创建的来源。' : '尚未安装可用的存储插件。'}</p></div>{activePlugin && !validAdding && <button type="button" onClick={() => { setAdding(`plugin:${activePlugin.id}`); setEditingId(null) }} className={`${btnPrimary} shrink-0`} style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}><Plus size={14} />新增来源</button>}</div>
        {storagePlugins.length > 0 && (
          <div className="flex max-w-full items-center gap-1 overflow-x-auto border-b" style={{ borderColor: 'var(--border)' }} role="tablist" aria-label="存储插件">
            {storagePlugins.map(plugin => (
              <button
                key={plugin.id}
                type="button"
                role="tab"
                aria-selected={resolvedPluginTab === plugin.id}
                onClick={() => { setActivePluginTab(plugin.id); setAdding(null); setEditingId(null) }}
                className="flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors"
                style={{
                  borderColor: resolvedPluginTab === plugin.id ? 'var(--primary)' : 'transparent',
                  color: resolvedPluginTab === plugin.id ? 'var(--foreground)' : 'var(--muted-foreground)',
                }}
              >
                {plugin.id === 'github' ? <Github size={13} /> : plugin.id === 's3-compatible' ? <Cloud size={13} /> : <Puzzle size={13} />}
                <span className="max-w-48 truncate">{plugin.name || plugin.id}</span>
                <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>{sources.filter(source => (source.pluginId || source.type) === plugin.id).length}</span>
              </button>
            ))}
          </div>
        )}
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : (
          <div className="space-y-3">
            {storagePlugins.length === 0 && !validAdding && (
              <div className="flex flex-col items-center gap-2 border border-dashed px-6 py-12 text-center" style={{ borderColor: 'var(--border)' }}>
                <span className="flex size-10 items-center justify-center" style={{ backgroundColor: 'var(--muted)' }}>
                  <Database size={22} style={{ color: 'var(--muted-foreground)' }} />
                </span>
                <p className="text-sm font-medium">暂无存储插件</p>
                <p className="max-w-sm text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>
                  请先安装一个已签名的存储插件，安装后即可在这里配置连接。
                </p>
              </div>
            )}

            {storagePlugins.length > 0 && activeSources.length === 0 && !validAdding && (
              <div className="flex flex-col items-center gap-2 border border-dashed px-6 py-12 text-center" style={{ borderColor: 'var(--border)' }}>
                <span className="flex size-10 items-center justify-center" style={{ backgroundColor: 'var(--muted)' }}>
                  <Database size={22} style={{ color: 'var(--muted-foreground)' }} />
                </span>
                <p className="text-sm font-medium">暂无 {activePlugin?.name || resolvedPluginTab} 存储源</p>
                <p className="max-w-sm text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>
                  点击下方“新增”配置此插件的存储连接。
                </p>
              </div>
            )}

            {activeSources.map(source => (
              <StorageSourceCard
                key={source.id}
                source={source}
                plugin={storagePlugins.find(plugin => plugin.id === (source.pluginId || source.type))}
                isEditing={editingId === source.id}
                onEdit={() => { setEditingId(editingId === source.id ? null : source.id); setAdding(null) }}
                onDelete={() => setDeleteTarget(source)}
                onSaved={() => { setEditingId(null); fetchSources() }}
              />
            ))}

            {orphanedSources.length > 0 && (
              <div className="space-y-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">插件不可用的存储源</p>
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>这些配置引用的插件未安装或不再提供存储能力，仍可查看、停用或删除。</p>
                </div>
                {orphanedSources.map(source => (
                  <StorageSourceCard
                    key={source.id}
                    source={source}
                    isEditing={editingId === source.id}
                    onEdit={() => { setEditingId(editingId === source.id ? null : source.id); setAdding(null) }}
                    onDelete={() => setDeleteTarget(source)}
                    onSaved={() => { setEditingId(null); fetchSources() }}
                  />
                ))}
              </div>
            )}

            {validAdding?.startsWith('plugin:') ? (
                <DesktopStorageSourceForm
                  plugin={storagePlugins.find(plugin => plugin.id === validAdding.slice('plugin:'.length))}
                  onCancel={() => setAdding(null)}
                  onSaved={() => { setAdding(null); fetchSources() }}
                />
              ) : null}
          </div>
        )}
      </div>}

      <SimpleDeleteDialog
        isOpen={!!deleteTarget}
        title="删除存储源"
        message={deleteTarget ? `确定要删除「${deleteTarget.name}」吗？已上传的照片文件不会被删除，但该存储源将无法再用于上传与访问。` : ''}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        t={(key) => t(key, language)}
      />
      <SimpleDeleteDialog
        isOpen={!!uninstallTarget}
        title="卸载存储插件"
        message={uninstallTarget ? `确定要卸载「${uninstallTarget.name || uninstallTarget.id}」吗？现有存储源配置和凭据会保留，重新安装同一插件后可继续使用。` : ''}
        onConfirm={confirmUninstall}
        onCancel={() => setUninstallTarget(null)}
        t={(key) => t(key, language)}
      />
      <SimpleDeleteDialog
        isOpen={!!rollbackTarget}
        title="回滚存储插件"
        message={rollbackTarget ? `确定要将「${rollbackTarget.plugin.name || rollbackTarget.plugin.id}」回滚到 v${rollbackTarget.version.version} 吗？正在使用该插件的存储源会在下次请求时使用此版本。` : ''}
        onConfirm={confirmRollback}
        onCancel={() => setRollbackTarget(null)}
        t={(key) => t(key, language)}
      />
    </div>
  )
}

function StorageSourceCard({ source, plugin, isEditing, onEdit, onDelete, onSaved }: {
  source: StorageSource; plugin?: PluginDescriptor; isEditing: boolean; onEdit: () => void; onDelete: () => void; onSaved: () => void
}) {
  const [testing, setTesting] = useState(false)
  if (isEditing) return <DesktopStorageSourceForm plugin={plugin} source={source} onCancel={onEdit} onSaved={onSaved} />

  const meta = storageTypeMeta(source.pluginId || source.type, plugin)
  const Icon = meta.icon
  const status = plugin ? sourceStatus(source) : { label: '插件不可用', tone: 'error' as const }
  const statusClass = status.tone === 'success'
    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    : status.tone === 'error'
      ? 'bg-red-500/10 text-red-600 dark:text-red-400'
      : status.tone === 'muted'
        ? 'bg-secondary text-muted-foreground'
        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
  const config = source.config || {}
  const summary = Object.entries(config)
    .filter(([key, value]) => key !== 'basePath' && value && !/secret|token|key/i.test(key))
    .slice(0, 2)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ')
    || config.basePath
    || '未填写配置摘要'

  const toggleEnabled = async () => {
    try {
      await SetDesktopStorageSourceEnabled(source.id, source.enabled === false)
      onSaved()
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || '更新状态失败')
    }
  }

  const testSource = async () => {
    if (testing) return
    setTesting(true)
    try {
      const result = await TestDesktopStorageSource(source.id)
      if (result?.status === 'ready') toast.success('存储源连接正常')
      else toast.error(result?.message || '存储源连接失败')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || '存储源连接失败')
    } finally {
      setTesting(false)
      onSaved()
    }
  }

  return (
    <article className="border p-4 transition-colors hover:bg-secondary/20" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
      <div className="flex min-w-0 flex-wrap items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center" style={{ backgroundColor: 'var(--muted)' }}>
          <Icon size={17} style={{ color: 'var(--muted-foreground)' }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="max-w-full truncate text-sm font-semibold">{source.name || '未命名存储源'}</span>
            <span className="max-w-full truncate border px-1.5 py-0.5 font-mono text-[10px]" title={meta.label}
              style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>{meta.label}</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass}`}>
              <span className="size-1 rounded-full bg-current" />{status.label}
            </span>
          </div>
          <p className="mt-1 truncate font-mono text-[11px]" title={summary} style={{ color: 'var(--muted-foreground)' }}>{summary}</p>
          {source.lastError && <p className="mt-1 flex items-start gap-1 text-[11px] leading-4 text-red-600 dark:text-red-400"><TriangleAlert size={12} className="mt-0.5 shrink-0" />{source.lastError}</p>}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1 border-l pl-3" style={{ borderColor: 'var(--border)' }} aria-label="存储源操作">
          <button type="button" onClick={() => void testSource()} disabled={testing} title={testing ? '测试中...' : '测试连接'} aria-label={testing ? '测试中...' : '测试连接'} className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-secondary disabled:cursor-wait disabled:opacity-50" style={{ color: 'var(--muted-foreground)' }}>{testing ? <Loader2 size={14} className="animate-spin" /> : <CircleCheck size={14} />}</button>
          <button type="button" onClick={() => void toggleEnabled()} title={source.enabled === false ? '启用' : '禁用'} aria-label={source.enabled === false ? '启用' : '禁用'} className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-secondary" style={{ color: source.enabled === false ? 'var(--muted-foreground)' : 'var(--primary)' }}><Power size={14} /></button>
          {plugin && <button type="button" onClick={onEdit} title="编辑" aria-label="编辑" className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-secondary" style={{ color: 'var(--muted-foreground)' }}><Pencil size={14} /></button>}
          <button type="button" onClick={onDelete} title="删除" aria-label="删除" className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-secondary" style={{ color: 'var(--destructive)' }}><Trash2 size={14} /></button>
        </div>
      </div>
    </article>
  )
}

function DesktopStorageSourceForm({ plugin, source, onCancel, onSaved }: {
  plugin?: PluginDescriptor
  source?: StorageSource
  onCancel: () => void
  onSaved: () => void
}) {
  const pluginId = plugin?.id || source?.pluginId || ''
  const { language } = usePreferences()
  const configFields = schemaFields(plugin?.configSchema, language)
  const credentialFields = schemaFields(plugin?.credentialSchema, language)
  const [form, setForm] = useState({
    name: source?.name || plugin?.name || pluginId,
    config: Object.fromEntries(configFields.map(field => [field.key, source?.config?.[field.key] || ''])) as Record<string, string>,
    credentials: Object.fromEntries(credentialFields.map(field => [field.key, ''])) as Record<string, string>,
  })
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({})
  const [credentialsLoaded, setCredentialsLoaded] = useState(false)
  const [loadingCredentials, setLoadingCredentials] = useState(false)
  const [saving, setSaving] = useState(false)

  const updateConfig = (key: string, value: string) => setForm(current => ({ ...current, config: { ...current.config, [key]: value } }))
  const updateCredential = (key: string, value: string) => setForm(current => ({ ...current, credentials: { ...current.credentials, [key]: value } }))
  const toggleCredentialVisibility = async (key: string, loadStoredCredentials = false) => {
    const currentlyVisible = visibleFields[key] === true
    if (currentlyVisible) {
      setVisibleFields(previous => ({ ...previous, [key]: false }))
      return
    }
    if (loadStoredCredentials && source?.id && !credentialsLoaded) {
      setLoadingCredentials(true)
      try {
        const credentials = await GetDesktopStorageSourceCredentials(source.id)
        setForm(current => ({ ...current, credentials: { ...current.credentials, ...(credentials || {}) } }))
        setCredentialsLoaded(true)
      } catch (err: unknown) {
        toast.error(getErrorMessage(err) || '读取凭据失败')
        return
      } finally {
        setLoadingCredentials(false)
      }
    }
    setVisibleFields(previous => ({ ...previous, [key]: true }))
  }
  const handleSave = async () => {
    if (!form.name.trim() || !pluginId) return
    setSaving(true)
    try {
      const credentials = Object.fromEntries(Object.entries(form.credentials).filter(([, value]) => value.trim() !== ''))
      const input = { id: source?.id, name: form.name.trim(), pluginId, command: plugin?.command, args: plugin?.args, config: form.config, credentials, enabled: source?.enabled !== false }
      if (source?.id) {
        await UpdateDesktopStorageSource(input)
        toast.success('已更新桌面存储源')
      } else {
        await CreateDesktopStorageSource(input)
        toast.success('已创建桌面存储源')
      }
      onSaved()
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border p-5" style={{ borderColor: 'var(--ring)', backgroundColor: 'var(--card)' }}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
        <div className="min-w-0"><p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--muted-foreground)' }}>{source?.id ? 'Edit source' : 'New source'}</p><p className="mt-1 truncate text-sm font-semibold">{plugin?.name || pluginId}</p></div>
        <span className="border px-1.5 py-0.5 font-mono text-[10px]" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>{plugin?.runtime || 'desktop plugin'}</span>
      </div>
      <div className="space-y-4">
        <Field label="名称"><input value={form.name} onChange={e => setForm(current => ({ ...current, name: e.target.value }))} placeholder="例如：主图床" className={inputClass} style={inputStyle} /></Field>
        {configFields.length > 0 ? <div className="grid gap-3 sm:grid-cols-2">{configFields.map(field => <Field key={field.key} label={`${field.title}${field.required ? ' *' : ''}`} description={field.description}>
          <div className="relative">
            <input type={field.secret ? (visibleFields[`config:${field.key}`] ? 'text' : 'password') : field.type === 'number' ? 'number' : 'text'} value={form.config[field.key] || ''} onChange={e => updateConfig(field.key, e.target.value)} className={`${inputClass}${field.secret ? ' pr-9' : ''}`} style={inputStyle} />
            {field.secret && <button type="button" onClick={() => void toggleCredentialVisibility(`config:${field.key}`)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 transition-colors disabled:opacity-50" style={{ color: 'var(--muted-foreground)' }}
              aria-label={visibleFields[`config:${field.key}`] ? `隐藏${field.title}` : `显示${field.title}`}>
              {visibleFields[`config:${field.key}`] ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>}
          </div>
        </Field>)}</div> : <p className="rounded-md border border-dashed px-3 py-2 text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>此插件没有额外配置项。</p>}
        {credentialFields.length > 0 && <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <div className="mb-3"><p className="text-xs font-semibold">凭据</p><p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>凭据只写入本机安全存储；编辑时留空表示保持原凭据。</p></div>
          <div className="grid gap-3 sm:grid-cols-2">{credentialFields.map(field => <Field key={field.key} label={`${field.title}${field.required ? ' *' : ''}`} description={field.description}>
            <div className="relative">
              <input type={visibleFields[`credential:${field.key}`] ? 'text' : 'password'} autoComplete="new-password" value={form.credentials[field.key] || ''} onChange={e => updateCredential(field.key, e.target.value)} className={`${inputClass} pr-9`} style={inputStyle} />
              <button type="button" onClick={() => void toggleCredentialVisibility(`credential:${field.key}`, true)} disabled={loadingCredentials}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 transition-colors disabled:opacity-50" style={{ color: 'var(--muted-foreground)' }}
                aria-label={visibleFields[`credential:${field.key}`] ? `隐藏${field.title}` : `显示${field.title}`}>
                {visibleFields[`credential:${field.key}`] ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>)}</div>
        </div>}
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end" style={{ borderColor: 'var(--border)' }}>
        <button type="button" onClick={onCancel} className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: 'var(--border)' }}>取消</button>
        <button type="button" onClick={() => void handleSave()} disabled={saving || !form.name.trim() || !pluginId} className="rounded-md px-3 py-2 text-xs disabled:opacity-50" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>{saving ? '保存中...' : '保存存储源'}</button>
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
        await UpdateDesktopStorageSource({ id: source.id, name: form.name, pluginId: form.type, config: { basePath: form.basePath }, enabled: true })
        toast.success('已更新')
      } else {
        await CreateDesktopStorageSource({ name: form.name, pluginId: form.type, config: { basePath: form.basePath }, enabled: true })
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
