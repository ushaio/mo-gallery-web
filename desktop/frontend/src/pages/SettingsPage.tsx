import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import {
  Settings, Moon, Sun, Monitor,
  Save, Loader2, HardDrive, MessageSquare, User, Server,
  Tag, Pencil, Trash2, Plus, X, Check,
} from 'lucide-react'

// ─── 与 Web 端一致的 5 个标签 ────────────────────────

type Tab = 'site' | 'categories' | 'storage' | 'comments' | 'account'
type CommentsSubTab = 'manage' | 'config'

export function SettingsPage() {
  const { language, theme, setTheme, setLanguage } = usePreferences()
  const [tab, setTab] = useState<Tab>('site')
  const [config, setConfig] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const result = await (window as any).go.main.App.GetSettings()
      setConfig(result || {})
    } catch (err) {
      console.error('获取设置失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const updateConfig = (key: string, value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await (window as any).go.main.App.UpdateSettings(config)
      setConfig(result || {})
      setDirty(false)
      toast.success('设置已保存')
    } catch (err: any) {
      toast.error('保存失败: ' + (err?.message || '未知错误'))
    } finally {
      setSaving(false)
    }
  }

  const tabs: { key: Tab; label: string; icon: typeof Settings }[] = [
    { key: 'site', label: '站点', icon: Server },
    { key: 'categories', label: '分类', icon: Tag },
    { key: 'storage', label: '存储', icon: HardDrive },
    { key: 'comments', label: '评论', icon: MessageSquare },
    { key: 'account', label: '账户', icon: User },
  ]

  // 与 Web 端一致：只有 categories 标签显示保存按钮（其他标签要么只读要么有独立保存）
  // 但桌面端 comments/config 也需要保存，所以条件放宽
  const showSaveButton = tab === 'comments' || tab === 'site'

  return (
    <>
      <PageHeader
        title={t('settings.title', language)}
        actions={dirty && showSaveButton ? (
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md disabled:opacity-50"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? '保存中...' : t('common.save', language)}
          </button>
        ) : undefined}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧标签栏 */}
        <div className="w-48 border-r p-3 shrink-0 flex flex-col" style={{ borderColor: 'var(--border)' }}>
          <div className="space-y-0.5">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setTab(key)}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm transition-colors"
                style={{
                  backgroundColor: tab === key ? 'var(--accent)' : 'transparent',
                  color: tab === key ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                }}>
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>

          {/* 本地偏好（与 Web 端一致，放在标签栏底部） */}
          <div className="mt-auto border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-medium mb-3 px-3" style={{ color: 'var(--muted-foreground)' }}>外观</p>
            <div className="px-3 mb-3 flex gap-1">
              {[
                { value: 'light' as const, icon: Sun },
                { value: 'dark' as const, icon: Moon },
                { value: 'system' as const, icon: Monitor },
              ].map(({ value, icon: Icon }) => (
                <button key={value} onClick={() => setTheme(value)}
                  className="p-1.5 rounded transition-colors"
                  style={{
                    backgroundColor: theme === value ? 'var(--accent)' : 'transparent',
                    color: theme === value ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                  }}>
                  <Icon size={14} />
                </button>
              ))}
            </div>
            <p className="text-xs font-medium mb-3 px-3" style={{ color: 'var(--muted-foreground)' }}>语言</p>
            <div className="px-3 flex gap-1">
              {[
                { value: 'zh' as const, label: '中文' },
                { value: 'en' as const, label: 'EN' },
              ].map(({ value, label }) => (
                <button key={value} onClick={() => setLanguage(value)}
                  className="px-2 py-1 text-xs rounded transition-colors"
                  style={{
                    backgroundColor: language === value ? 'var(--accent)' : 'transparent',
                    color: language === value ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 右侧内容 */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64" style={{ color: 'var(--muted-foreground)' }}>
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : (
            <div className="max-w-2xl">
              {tab === 'site' && <SiteTab config={config} updateConfig={updateConfig} />}
              {tab === 'categories' && <CategoriesTab />}
              {tab === 'storage' && <StorageTab />}
              {tab === 'comments' && <CommentsTab config={config} updateConfig={updateConfig} />}
              {tab === 'account' && <AccountTab />}
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
            className="w-full px-3 py-1.5 text-sm rounded border outline-none opacity-60 cursor-not-allowed"
            style={inputStyle} />
        </Field>
        <Field label="CDN 域名" description="通过 .env 文件中的 CDN_DOMAIN 配置">
          <input type="text" value={config.cdn_domain || ''} disabled
            className="w-full px-3 py-1.5 text-sm rounded border outline-none opacity-60 cursor-not-allowed"
            style={inputStyle} />
        </Field>
      </Section>
    </div>
  )
}

// ─── Tab 2: 分类（与 Web 端一致：只读展示） ────────────

function CategoriesTab() {
  const [categories, setCategories] = useState<string[]>([])

  useEffect(() => {
    (async () => {
      try {
        const result = await (window as any).go.main.App.GetCategories()
        setCategories((result || []).filter((c: string) => c !== '全部'))
      } catch {}
    })()
  }, [])

  return (
    <div className="space-y-6">
      <Section title="分类管理">
        <p className="text-xs mb-4" style={{ color: 'var(--muted-foreground)' }}>
          分类根据照片元数据自动管理。
        </p>
        {categories.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>暂无分类</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map(c => (
              <span key={c} className="px-2.5 py-1 text-xs rounded-md"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}>
                {c}
              </span>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

// ─── Tab 3: 存储（与 Web 端一致：StorageSource CRUD） ──

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

function StorageTab() {
  const [sources, setSources] = useState<StorageSource[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null) // 'local' | 'github' | 's3'

  const fetchSources = useCallback(async () => {
    setLoading(true)
    try {
      const result = await (window as any).go.main.App.GetStorageSources()
      setSources(result || [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchSources() }, [fetchSources])

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此存储源吗？')) return
    try {
      await (window as any).go.main.App.DeleteStorageSource(id)
      toast.success('已删除')
      fetchSources()
    } catch (err: any) {
      toast.error(err?.message || '删除失败')
    }
  }

  return (
    <div className="space-y-6">
      <Section title="存储源">
        {loading ? (
          <div className="flex items-center justify-center py-8" style={{ color: 'var(--muted-foreground)' }}>
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {sources.map(source => (
              <StorageSourceCard
                key={source.id}
                source={source}
                isEditing={editingId === source.id}
                onEdit={() => setEditingId(editingId === source.id ? null : source.id)}
                onDelete={() => handleDelete(source.id)}
                onSaved={() => { setEditingId(null); fetchSources() }}
              />
            ))}

            {/* 新增按钮 */}
            {!adding ? (
              <div className="flex gap-2">
                <button onClick={() => setAdding('local')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md"
                  style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
                  <Plus size={14} /> 添加本地存储
                </button>
                <button onClick={() => setAdding('github')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md"
                  style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
                  <Plus size={14} /> 添加 GitHub
                </button>
                <button onClick={() => setAdding('s3')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md"
                  style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
                  <Plus size={14} /> 添加 S3/R2
                </button>
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
    </div>
  )
}

function StorageSourceCard({ source, isEditing, onEdit, onDelete, onSaved }: {
  source: StorageSource; isEditing: boolean; onEdit: () => void; onDelete: () => void; onSaved: () => void
}) {
  if (isEditing) {
    return <StorageSourceForm source={source} onCancel={onEdit} onSaved={onSaved} />
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{source.name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}>
            {source.type}
          </span>
        </div>
        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted-foreground)' }}>
          {source.type === 'local' && (source.basePath || '/')}
          {source.type === 'github' && `${source.bucket || ''} / ${source.branch || 'main'}`}
          {source.type === 's3' && `${source.bucket || ''} @ ${source.endpoint || source.region || ''}`}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onEdit} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--muted-foreground)' }}>
          <Pencil size={14} />
        </button>
        <button onClick={onDelete} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--destructive)' }}>
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
        await (window as any).go.main.App.UpdateStorageSource(source.id, form)
        toast.success('已更新')
      } else {
        await (window as any).go.main.App.CreateStorageSource(form)
        toast.success('已创建')
      }
      onSaved()
    } catch (err: any) {
      toast.error(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3"
      style={{ borderColor: 'var(--ring)', backgroundColor: 'var(--card)' }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="名称">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-1.5 text-sm rounded border outline-none" style={inputStyle} />
        </Field>
        <Field label="类型">
          <select value={form.type} disabled
            className="w-full px-3 py-1.5 text-sm rounded border outline-none opacity-60" style={inputStyle}>
            <option value="local">本地</option>
            <option value="github">GitHub</option>
            <option value="s3">S3/R2</option>
          </select>
        </Field>
      </div>

      {form.type === 'local' && (
        <Field label="路径前缀">
          <input value={form.basePath} placeholder="/"
            onChange={e => setForm(f => ({ ...f, basePath: e.target.value }))}
            className="w-full px-3 py-1.5 text-sm rounded border outline-none" style={inputStyle} />
        </Field>
      )}

      {form.type === 'github' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Personal Access Token">
              <input type="password" value={form.accessKey}
                onChange={e => setForm(f => ({ ...f, accessKey: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm rounded border outline-none" style={inputStyle} />
            </Field>
            <Field label="仓库 (owner/repo)">
              <input value={form.bucket} placeholder="user/repo"
                onChange={e => setForm(f => ({ ...f, bucket: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm rounded border outline-none" style={inputStyle} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="分支">
              <input value={form.branch} placeholder="main"
                onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm rounded border outline-none" style={inputStyle} />
            </Field>
            <Field label="路径前缀">
              <input value={form.basePath} placeholder="images/"
                onChange={e => setForm(f => ({ ...f, basePath: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm rounded border outline-none" style={inputStyle} />
            </Field>
            <Field label="访问方式">
              <select value={form.accessMethod}
                onChange={e => setForm(f => ({ ...f, accessMethod: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm rounded border outline-none" style={inputStyle}>
                <option value="raw">Raw</option>
                <option value="jsdelivr">jsDelivr</option>
                <option value="pages">GitHub Pages</option>
              </select>
            </Field>
          </div>
          {form.accessMethod === 'pages' && (
            <Field label="Pages URL">
              <input value={form.publicUrl} placeholder="https://user.github.io/repo"
                onChange={e => setForm(f => ({ ...f, publicUrl: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm rounded border outline-none" style={inputStyle} />
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
                className="w-full px-3 py-1.5 text-sm rounded border outline-none" style={inputStyle} />
            </Field>
            <Field label="Region">
              <input value={form.region} placeholder="auto"
                onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm rounded border outline-none" style={inputStyle} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Access Key ID">
              <input value={form.accessKey}
                onChange={e => setForm(f => ({ ...f, accessKey: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm rounded border outline-none" style={inputStyle} />
            </Field>
            <Field label="Secret Access Key">
              <input type="password" value={form.secretKey}
                onChange={e => setForm(f => ({ ...f, secretKey: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm rounded border outline-none" style={inputStyle} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bucket">
              <input value={form.bucket}
                onChange={e => setForm(f => ({ ...f, bucket: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm rounded border outline-none" style={inputStyle} />
            </Field>
            <Field label="公开访问 URL">
              <input value={form.publicUrl} placeholder="https://pub-xxx.r2.dev"
                onChange={e => setForm(f => ({ ...f, publicUrl: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm rounded border outline-none" style={inputStyle} />
            </Field>
          </div>
          <Field label="路径前缀">
            <input value={form.basePath} placeholder="photos/"
              onChange={e => setForm(f => ({ ...f, basePath: e.target.value }))}
              className="w-full px-3 py-1.5 text-sm rounded border outline-none" style={inputStyle} />
          </Field>
        </>
      )}

      <div className="flex gap-2 pt-2">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md disabled:opacity-50"
          style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? '保存中...' : '保存'}
        </button>
        <button onClick={onCancel}
          className="px-3 py-1.5 text-xs rounded-md"
          style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
          取消
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
  const [comments, setComments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const fetchComments = useCallback(async () => {
    setLoading(true)
    try {
      const result = await (window as any).go.main.App.GetComments({
        status: statusFilter, page, limit: 20,
      })
      setComments(result?.data || [])
      setTotal(result?.meta?.total || 0)
    } catch {} finally { setLoading(false) }
  }, [statusFilter, page])

  useEffect(() => { fetchComments() }, [fetchComments])

  const updateStatus = async (id: string, status: string) => {
    try {
      await (window as any).go.main.App.UpdateCommentStatus(id, status)
      fetchComments()
    } catch {}
  }

  const deleteComment = async (id: string) => {
    if (!confirm('确定删除此评论？')) return
    try {
      await (window as any).go.main.App.DeleteComment(id)
      fetchComments()
    } catch {}
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          className="px-2 py-1 text-xs rounded border outline-none"
          style={inputStyle}>
          <option value="">全部状态</option>
          <option value="pending">待审核</option>
          <option value="approved">已通过</option>
          <option value="rejected">已拒绝</option>
        </select>
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
                    <span className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: c.status === 'approved' ? '#dcfce7' : c.status === 'rejected' ? '#fee2e2' : 'var(--muted)',
                        color: c.status === 'approved' ? '#166534' : c.status === 'rejected' ? '#991b1b' : 'var(--muted-foreground)',
                      }}>
                      {c.status === 'pending' ? '待审核' : c.status === 'approved' ? '已通过' : '已拒绝'}
                    </span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--foreground)' }}>{c.content}</p>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    {c.email && `${c.email} · `}{new Date(c.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {c.status !== 'approved' && (
                    <button onClick={() => updateStatus(c.id, 'approved')}
                      className="px-2 py-1 text-[11px] rounded" title="通过"
                      style={{ backgroundColor: '#dcfce7', color: '#166534' }}>
                      ✓
                    </button>
                  )}
                  {c.status !== 'rejected' && (
                    <button onClick={() => updateStatus(c.id, 'rejected')}
                      className="px-2 py-1 text-[11px] rounded" title="拒绝"
                      style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}>
                      ✗
                    </button>
                  )}
                  <button onClick={() => deleteComment(c.id)}
                    className="p-1 rounded hover:opacity-80" style={{ color: 'var(--destructive)' }}>
                    <Trash2 size={12} />
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
          <select value={provider}
            onChange={e => updateConfig('comment_provider', e.target.value)}
            className="w-full px-3 py-1.5 text-sm rounded border outline-none" style={inputStyle}>
            <option value="local">本地</option>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </Field>

        {provider !== 'local' && (
          <>
            <Field label="API Key">
              <input type="password" value={config.comment_api_key || ''}
                onChange={e => updateConfig('comment_api_key', e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded border outline-none" style={inputStyle} />
            </Field>
            <Field label="API Endpoint">
              <input type="text" value={config.comment_api_endpoint || ''}
                onChange={e => updateConfig('comment_api_endpoint', e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded border outline-none" style={inputStyle} />
            </Field>
            <Field label="模型">
              <input type="text" value={config.comment_model || ''}
                onChange={e => updateConfig('comment_model', e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded border outline-none" style={inputStyle} />
            </Field>
          </>
        )}

        <Field label="屏蔽关键词" description="逗号分隔">
          <textarea value={config.blocked_keywords || ''}
            onChange={e => updateConfig('blocked_keywords', e.target.value)}
            rows={3}
            className="w-full px-3 py-1.5 text-sm rounded border outline-none resize-none" style={inputStyle} />
        </Field>
      </Section>
    </div>
  )
}

// ─── Tab 5: 账户（与 Web 端一致） ────────────────────

function AccountTab() {
  return (
    <div className="space-y-6">
      <Section title="账户信息">
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          账户管理通过 Web 端进行。桌面端使用相同的登录凭据。
        </p>
      </Section>
    </div>
  )
}

// ─── 通用组件 ────────────────────────────────────────

const inputStyle = {
  backgroundColor: 'var(--background)',
  borderColor: 'var(--border)',
  color: 'var(--foreground)',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
      <h3 className="text-sm font-medium mb-4">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
        {label}
      </label>
      {children}
      {description && (
        <p className="text-[11px] mt-1" style={{ color: 'var(--muted-foreground)' }}>{description}</p>
      )}
    </div>
  )
}
