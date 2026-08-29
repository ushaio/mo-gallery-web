import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { useDataRevision } from '@/hooks/useDataRevision'
import { useAuth } from '@/contexts/AuthContext'
import { usePreferences, useSettingsNav, type SettingsTabKey } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { Skeleton } from '@/components/admin/Skeleton'
import { GetSettings, UpdateSettings } from '../../wailsjs/go/main/App'
import {
  type LucideIcon,
  Info, Save, Loader2, HardDrive, MessageSquare, User, Server,
  Sparkles, FileText, Database, Puzzle, FolderOpen, Palette,
} from 'lucide-react'
import { AgentExtensionsTab } from '@/components/settings/AgentExtensionsTab'
import { getErrorMessage, btnPrimary } from './settings/shared'
import { SiteTab } from './settings/SiteTab'
import { AppearanceTab } from './settings/AppearanceTab'
import { LocalLibraryTab } from './settings/LocalLibraryTab'
import { StorageTab } from './settings/StorageTab'
import { CommentsTab } from './settings/CommentsTab'
import { AccountTab } from './settings/AccountTab'
import { CacheTab } from './settings/CacheTab'
import { AboutTab } from './settings/AboutTab'
import { AiTab } from './settings/AiTab'
import { LogTab } from './settings/LogTab'

// ─── 分组导航 ────────────────────────
// 分组标题只是视觉分区：不引入路由，activeTab 仍是单一状态。

type Tab = SettingsTabKey

// 保存态：unified = 由顶部统一保存按钮提交；self = 标签内部自带保存；instant = 改动即时生效
type SaveMode = 'unified' | 'self' | 'instant'

interface TabMeta {
  key: Tab
  label: string
  icon: LucideIcon
  save: SaveMode
}

interface TabGroup {
  title: string
  tabs: TabMeta[]
}

const TAB_GROUPS: TabGroup[] = [
  {
    title: '站点与云端',
    tabs: [
      { key: 'site', label: '站点', icon: Server, save: 'unified' },
      { key: 'storage', label: '存储源', icon: HardDrive, save: 'self' },
      { key: 'plugins', label: '插件', icon: Puzzle, save: 'self' },
      { key: 'comments', label: '评论', icon: MessageSquare, save: 'unified' },
      { key: 'account', label: '账户', icon: User, save: 'instant' },
    ],
  },
  {
    title: '本地',
    tabs: [
      { key: 'local-library', label: '本地资源库', icon: FolderOpen, save: 'instant' },
      { key: 'cache', label: '缓存', icon: Database, save: 'self' },
    ],
  },
  {
    title: 'AI',
    tabs: [
      { key: 'ai', label: '模型配置', icon: Sparkles, save: 'self' },
      { key: 'agent-extensions', label: 'Agent 扩展', icon: Puzzle, save: 'self' },
    ],
  },
  {
    title: '系统',
    tabs: [
      { key: 'appearance', label: '外观', icon: Palette, save: 'self' },
      { key: 'log', label: '日志', icon: FileText, save: 'self' },
      { key: 'about', label: '关于', icon: Info, save: 'instant' },
    ],
  },
]

const TAB_META: Record<Tab, TabMeta> = Object.fromEntries(
  TAB_GROUPS.flatMap(group => group.tabs).map(meta => [meta.key, meta]),
) as Record<Tab, TabMeta>

const OFFLINE_SETTINGS_TABS = new Set<Tab>(['appearance', 'plugins', 'local-library', 'ai', 'agent-extensions', 'log', 'cache', 'about'])

// 满高、无内边距的标签（内部自行处理滚动）
const FULL_HEIGHT_TABS = new Set<Tab>(['ai', 'agent-extensions', 'plugins', 'cache'])

// 读取云端 settings 的标签。GetSettings 是一次云端往返（proxy GET /admin/settings/），
// 只有这两个标签用到它，因此按需拉取：其余标签不必为用不到的请求等待。
const CONFIG_TABS = new Set<Tab>(['site', 'comments'])

export function SettingsPage({ isModal = false }: { isModal?: boolean } = {}) {
  const { isAuthenticated, token } = useAuth()
  const { language } = usePreferences()
  const settingsRevision = useDataRevision('settings')
  const { tab, setTab } = useSettingsNav()
  const [config, setConfig] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  // 已取得 config 对应的「身份 + settings 版本」；null 表示尚未取过。
  // 用标识而不是布尔 loading：首帧就能判断要不要显示骨架，不会先闪一下空表单；
  // 且退出登录 / 切换账号后 token 变化会让旧 config 自动失效，无需在 effect 里清状态。
  const [configKey, setConfigKey] = useState<string | null>(null)
  // 统一保存的未保存标记：按标签记录，便于在导航项上提示
  const [dirtyTabs, setDirtyTabs] = useState<Set<Tab>>(() => new Set())
  const knownTab = tab in TAB_META ? tab : 'site'
  const activeTab = isAuthenticated || OFFLINE_SETTINGS_TABS.has(knownTab) ? knownTab : 'appearance'
  const dirty = dirtyTabs.size > 0

  const needsConfig = isAuthenticated && CONFIG_TABS.has(activeTab)
  const wantedConfigKey = `${token ?? ''}:${settingsRevision}`
  const configReady = !needsConfig || configKey === wantedConfigKey
  // 在途请求的标识，避免切标签造成的重复渲染重复发请求
  const inflightRef = useRef<string | null>(null)

  useEffect(() => {
    if (!needsConfig || configReady) return
    if (inflightRef.current === wantedConfigKey) return

    inflightRef.current = wantedConfigKey
    void GetSettings()
      .then(result => setConfig(result || {}))
      .catch(err => { console.error('获取设置失败:', err) })
      // 失败也记标识：与旧行为一致地渲染空表单，而不是卡在骨架里；
      // 下次 settings 版本变化或重新登录时会再试。
      .finally(() => {
        inflightRef.current = null
        setConfigKey(wantedConfigKey)
      })
  }, [needsConfig, configReady, wantedConfigKey])

  // 改动来自当前标签，据此在导航项上标记未保存
  const updateConfig = (key: string, value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }))
    setDirtyTabs(prev => prev.has(activeTab) ? prev : new Set(prev).add(activeTab))
  }

  const handleSave = async () => {
    if (!isAuthenticated) return
    setSaving(true)
    try {
      const result = await UpdateSettings(config)
      setConfig(result || {})
      setDirtyTabs(new Set())
      toast.success('设置已保存')
    } catch (error: unknown) {
      toast.error('保存失败: ' + getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const groups = TAB_GROUPS
    .map(group => ({ ...group, tabs: group.tabs.filter(({ key }) => isAuthenticated || OFFLINE_SETTINGS_TABS.has(key)) }))
    .filter(group => group.tabs.length > 0)

  // 只有走统一保存的标签才显示顶部按钮，自带保存的标签在正文内部提交
  const activeSaveMode = TAB_META[activeTab].save
  const showSaveButton = isAuthenticated && activeSaveMode === 'unified'

  return (
    <div className={isModal ? 'flex min-h-0 flex-1 flex-col' : 'flex h-full flex-col'}>
      <PageHeader
        title={t('admin.page_settings', language)}
        actions={showSaveButton ? (
          <>
            <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
              {dirty ? '有未保存的修改' : '本页修改需手动保存'}
            </span>
            <button onClick={handleSave} disabled={saving || !dirty}
              className={btnPrimary}
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? '保存中...' : t('common.save', language)}
            </button>
          </>
        ) : (
          <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
            {activeSaveMode === 'self' ? '本页修改在各功能区内单独保存' : '本页修改即时生效'}
          </span>
        )}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧分组标签栏 */}
        <div className="flex w-48 shrink-0 flex-col overflow-hidden border-r p-3" style={{ borderColor: 'var(--border)' }}>
          <nav className="custom-scrollbar min-h-0 flex-1 overflow-y-auto" aria-label="设置分区">
            {groups.map(group => (
              <div key={group.title} className="mb-3 last:mb-0">
                <div className="mb-1 px-3 text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>
                  {group.title}
                </div>
                <div className="space-y-0.5">
                  {group.tabs.map(({ key, label, icon: Icon }) => (
                    <button key={key} type="button" onClick={() => setTab(key)}
                      aria-current={activeTab === key ? 'page' : undefined}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      style={{
                        backgroundColor: activeTab === key ? 'var(--accent)' : 'transparent',
                        color: activeTab === key ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                      }}>
                      <Icon size={16} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                      {dirtyTabs.has(key) && (
                        <span className="size-1.5 shrink-0 rounded-full" title="有未保存的修改"
                          style={{ backgroundColor: 'var(--primary)' }} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* 右侧内容 */}
        <div className={FULL_HEIGHT_TABS.has(activeTab) ? 'flex-1 overflow-hidden' : 'flex-1 overflow-auto p-6'}>
          {/* 骨架只在「当前标签确实要等云端 config」时出现。满高标签（ai / cache 等）
              各自有贴合自身布局的骨架，这里不再用表单骨架覆盖它们。 */}
          {!configReady ? (
            <ConfigFormSkeleton />
          ) : activeTab === 'ai' ? (
            <div className="h-full min-h-0">
              <AiTab />
            </div>
          ) : activeTab === 'agent-extensions' ? (
            <div className="h-full min-h-0">
              <AgentExtensionsTab />
            </div>
          ) : activeTab === 'plugins' ? (
            <div className="h-full min-h-0 overflow-auto p-6">
              <StorageTab mode="plugins" />
            </div>
          ) : activeTab === 'cache' ? (
            <div className="h-full min-h-0">
              <CacheTab />
            </div>
          ) : (
            <div className="max-w-2xl">
              {activeTab === 'site' && <SiteTab config={config} updateConfig={updateConfig} />}
              {activeTab === 'appearance' && <AppearanceTab />}
              {activeTab === 'storage' && <StorageTab mode="sources" />}
              {activeTab === 'local-library' && <LocalLibraryTab onManageCache={() => setTab('cache')} />}
              {activeTab === 'comments' && <CommentsTab config={config} updateConfig={updateConfig} />}
              {activeTab === 'account' && <AccountTab />}
              {activeTab === 'log' && <LogTab />}
              {activeTab === 'about' && <AboutTab />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// 站点 / 评论标签的表单骨架。与正文同为 max-w-2xl，且只在带 p-6 内边距的
// 容器里渲染，切换时不会产生位置跳动。
function ConfigFormSkeleton() {
  return (
    <div className="max-w-2xl space-y-6">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-full" />
    </div>
  )
}
