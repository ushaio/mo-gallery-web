import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import { useDataRevision } from '@/hooks/useDataRevision'
import { useAuth } from '@/contexts/AuthContext'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { Skeleton } from '@/components/admin/Skeleton'
import { GetSettings, UpdateSettings } from '../../wailsjs/go/main/App'
import {
  Settings, Info, Save, Loader2, HardDrive, MessageSquare, User, Server,
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

// ─── 与 Web 端一致的 5 个标签 ────────────────────────

type Tab = 'site' | 'appearance' | 'storage' | 'plugins' | 'local-library' | 'comments' | 'account' | 'ai' | 'agent-extensions' | 'log' | 'cache' | 'about'
const OFFLINE_SETTINGS_TABS = new Set<Tab>(['appearance', 'plugins', 'local-library', 'ai', 'agent-extensions', 'log', 'cache', 'about'])

export function SettingsPage({ isModal = false }: { isModal?: boolean } = {}) {
  const { isAuthenticated } = useAuth()
  const { language } = usePreferences()
  const settingsRevision = useDataRevision('settings')
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

  useCachedPageEffect(() => { void fetchSettings() }, [fetchSettings, settingsRevision])

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
    { key: 'storage', label: '存储源', icon: HardDrive },
    { key: 'plugins', label: '插件', icon: Puzzle },
    { key: 'local-library', label: '本地资源库', icon: FolderOpen },
    { key: 'comments', label: '评论', icon: MessageSquare },
    { key: 'account', label: '账户', icon: User },
    { key: 'ai', label: '模型配置', icon: Sparkles },
    { key: 'agent-extensions', label: 'Agent 扩展', icon: Puzzle },
    { key: 'log', label: '日志', icon: FileText },
    { key: 'cache', label: '缓存', icon: Database },
    { key: 'about', label: '关于', icon: Info },
  ] satisfies { key: Tab; label: string; icon: typeof Settings }[]).filter(({ key }) => isAuthenticated || OFFLINE_SETTINGS_TABS.has(key))

  // site 与 comments/config 标签有保存按钮（其他标签要么只读要么有独立保存）
  const showSaveButton = isAuthenticated && (activeTab === 'comments' || activeTab === 'site')

  return (
    <div className={isModal ? 'flex min-h-0 flex-1 flex-col' : 'flex h-full flex-col'}>
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
        <div className={activeTab === 'ai' || activeTab === 'agent-extensions' || activeTab === 'plugins' || activeTab === 'cache' ? 'flex-1 overflow-hidden' : 'flex-1 overflow-auto p-6'}>
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
