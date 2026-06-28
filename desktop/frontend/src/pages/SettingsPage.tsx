import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import {
  Settings,
  Save, Loader2, HardDrive, MessageSquare, User, Server,
  Tag, Pencil, Trash2, Plus, X, Check,
  Unlink, Link, Sparkles, Eye, EyeOff,
} from 'lucide-react'

// ─── 与 Web 端一致的 5 个标签 ────────────────────────

type Tab = 'site' | 'categories' | 'storage' | 'comments' | 'account' | 'ai'
type CommentsSubTab = 'manage' | 'config'

export function SettingsPage() {
  const { language } = usePreferences()
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
    { key: 'ai', label: '模型配置', icon: Sparkles },
  ]

  // 与 Web 端一致：只有 categories 标签显示保存按钮（其他标签要么只读要么有独立保存）
  // 但桌面端 comments/config 也需要保存，所以条件放宽
  const showSaveButton = tab === 'comments' || tab === 'site'

  return (
    <>
      <PageHeader
        title={t('admin.page_settings', language)}
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
              {tab === 'ai' && <AiTab />}
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

// ─── Tab 5: 账户（与 Web 端一致：Linux DO 绑定） ────────────

function AccountTab() {
  const [linuxDoEnabled, setLinuxDoEnabled] = useState(false)
  const [linuxDoBinding, setLinuxDoBinding] = useState<any>(null)
  const [linuxDoLoading, setLinuxDoLoading] = useState(false)
  const [linuxDoBindLoading, setLinuxDoBindLoading] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(false)

  const loadLinuxDoStatus = async () => {
    setLinuxDoLoading(true)
    try {
      const enabled = await (window as any).go.main.App.IsLinuxDoEnabled()
      setLinuxDoEnabled(enabled)
      if (enabled) {
        const binding = await (window as any).go.main.App.GetLinuxDoBinding()
        setLinuxDoBinding(binding)
      } else {
        setLinuxDoBinding(null)
      }
    } catch (err: any) {
      toast.error('加载 Linux DO 状态失败: ' + (err?.message || '未知错误'))
    } finally {
      setLinuxDoLoading(false)
    }
  }

  useEffect(() => { loadLinuxDoStatus() }, [])

  const handleLinuxDoBind = async () => {
    try {
      setLinuxDoBindLoading(true)
      const { url, state } = await (window as any).go.main.App.GetLinuxDoAuthUrl()
      // 保存 state 和当前路径到 sessionStorage
      sessionStorage.setItem('linuxdo_oauth_state', state)
      sessionStorage.setItem('linuxdo_redirect', window.location.pathname)
      // 跳转到 Linux DO 授权页
      window.location.href = url
    } catch (err: any) {
      toast.error('获取授权 URL 失败: ' + (err?.message || '未知错误'))
      setLinuxDoBindLoading(false)
    }
  }

  const handleLinuxDoUnbind = async () => {
    try {
      await (window as any).go.main.App.UnbindLinuxDoAccount()
      toast.success('已解绑 Linux DO 账户')
      setDeleteDialog(false)
      loadLinuxDoStatus()
    } catch (err: any) {
      toast.error('解绑失败: ' + (err?.message || '未知错误'))
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
            <h4 className="text-[10px] font-bold text-foreground uppercase tracking-widest">
              Linux DO
            </h4>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            绑定 Linux DO 账户后，可以使用 Linux DO 登录。
          </p>
        </div>

        {!linuxDoEnabled ? (
          <div className="p-6 border border-dashed border-border text-center">
            <p className="text-xs text-muted-foreground">
              Linux DO 未配置
            </p>
            <p className="text-[10px] text-muted-foreground/70 mt-2 font-mono">
              请在 .env 中配置 LINUXDO_CLIENT_ID 和 LINUXDO_CLIENT_SECRET
            </p>
          </div>
        ) : linuxDoLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : linuxDoBinding ? (
          <div className="p-6 border border-border bg-muted/10 space-y-6">
            <div className="flex items-center gap-4">
              {linuxDoBinding.avatarUrl ? (
                <img
                  src={linuxDoBinding.avatarUrl}
                  alt={linuxDoBinding.username || ''}
                  className="w-12 h-12 rounded-full border border-border"
                />
              ) : (
                <div className="w-12 h-12 rounded-full border border-border bg-muted flex items-center justify-center">
                  <User size={20} className="text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="font-bold text-foreground">
                  {linuxDoBinding.username}
                </p>
                {linuxDoBinding.trustLevel !== null && (
                  <p className="text-[10px] text-muted-foreground font-mono">
                    Trust Level: {linuxDoBinding.trustLevel}
                  </p>
                )}
              </div>
              <div className="ml-auto">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-widest border border-primary/20">
                  ✓ 已绑定
                </span>
              </div>
            </div>
            <button
              onClick={() => setDeleteDialog(true)}
              disabled={linuxDoBindLoading}
              className="w-full py-3 border border-destructive/50 text-destructive hover:bg-destructive/10 text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
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
          <div className="p-6 border border-dashed border-border text-center space-y-4">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                未绑定 Linux DO 账户
              </p>
              <p className="text-[10px] text-muted-foreground/70">
                绑定后可以使用 Linux DO 登录
              </p>
            </div>
            <button
              onClick={handleLinuxDoBind}
              disabled={linuxDoBindLoading}
              className="px-6 py-3 bg-[#f8d568] text-[#1a1a1a] hover:bg-[#f5c842] text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
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

      {/* 确认解绑对话框 */}
      {deleteDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-8">
          <div className="bg-card border border-border p-6 max-w-sm w-full">
            <h3 className="text-sm font-medium mb-4">确认解绑</h3>
            <p className="text-xs text-muted-foreground mb-6">
              确定要解绑 Linux DO 账户吗？解绑后无法使用 Linux DO 登录。
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteDialog(false)}
                className="px-3 py-1.5 text-xs rounded-md"
                style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
              >
                取消
              </button>
              <button
                onClick={handleLinuxDoUnbind}
                className="px-3 py-1.5 text-xs rounded-md"
                style={{ backgroundColor: 'var(--destructive)', color: 'var(--destructive-foreground)' }}
              >
                确认解绑
              </button>
            </div>
          </div>
        </div>
      )}
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

// ─── Tab 6: AI 模型配置 ──────────────────────────────

function AiTab() {
  const [aiConfig, setAiConfig] = useState({ base_url: '', api_key: '', model: '' })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)

  useEffect(() => {
    setLoading(true)
    try {
      const result = (window as any).go?.main?.App?.GetAiConfig?.()
      if (result && typeof result.then === 'function') {
        result.then((r: any) => { if (r) setAiConfig(r) }).finally(() => setLoading(false))
      } else if (result) {
        setAiConfig(result)
        setLoading(false)
      } else {
        setLoading(false)
      }
    } catch { setLoading(false) }
  }, [])

  const update = (key: string, value: string) => {
    setAiConfig(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await (window as any).go.main.App.UpdateAiConfig(aiConfig)
      toast.success('配置已保存')
    } catch (err: any) {
      toast.error('保存失败: ' + (err?.message || '未知错误'))
    } finally { setSaving(false) }
  }

  const handleFetchModels = async () => {
    if (!aiConfig.base_url || !aiConfig.api_key) {
      toast.error('请先填写 API 地址和 Key')
      return
    }
    setFetchingModels(true)
    try {
      const result = await (window as any).go.main.App.GetStoryAiModels()
      const list = result?.models?.map((m: any) => m.id) || []
      setModels(list)
      if (list.length > 0 && !list.includes(aiConfig.model)) {
        setAiConfig(prev => ({ ...prev, model: result?.defaultModel || list[0] }))
      }
      toast.success(`获取到 ${list.length} 个模型`)
    } catch (err: any) {
      toast.error('获取模型失败: ' + (err?.message || '未知错误'))
    } finally { setFetchingModels(false) }
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
      <Section title="模型配置">
        <Field label="API 地址" description="OpenAI 兼容的 API 地址">
          <input type="text" value={aiConfig.base_url}
            onChange={e => update('base_url', e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="w-full px-3 py-1.5 text-sm rounded border outline-none"
            style={inputStyle} />
        </Field>

        <Field label="API Key">
          <div className="relative">
            <input type={showKey ? 'text' : 'password'} value={aiConfig.api_key}
              onChange={e => update('api_key', e.target.value)}
              placeholder="sk-xxx"
              className="w-full px-3 py-1.5 pr-9 text-sm rounded border outline-none"
              style={inputStyle} />
            <button type="button" onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors"
              style={{ color: 'var(--muted-foreground)' }}>
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>

        <Field label="默认模型">
          <div className="flex gap-2">
            {models.length > 0 ? (
              <select value={aiConfig.model}
                onChange={e => update('model', e.target.value)}
                className="flex-1 px-3 py-1.5 text-sm rounded border outline-none"
                style={inputStyle}>
                {models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input type="text" value={aiConfig.model}
                onChange={e => update('model', e.target.value)}
                placeholder="gpt-4o"
                className="flex-1 px-3 py-1.5 text-sm rounded border outline-none"
                style={inputStyle} />
            )}
            <button onClick={handleFetchModels} disabled={fetchingModels}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border shrink-0 disabled:opacity-50"
              style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
              {fetchingModels ? <Loader2 size={12} className="animate-spin" /> : null}
              获取模型
            </button>
          </div>
        </Field>

        <div className="pt-2">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-xs rounded-md disabled:opacity-50"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </Section>
    </div>
  )
}
