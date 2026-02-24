'use client'

import React, { useState, useEffect } from 'react'
import {
  Save,
  Loader2,
  X,
  Plus,
  MessageSquare,
  Globe,
  Check,
  Trash2,
  User,
  Link,
  Unlink,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import {
  AdminSettingsDto,
  CommentDto,
  LinuxDoBinding,
  getComments,
  updateCommentStatus,
  deleteComment,
  getLinuxDoBinding,
  unbindLinuxDoAccount,
  getLinuxDoAuthUrl,
  isLinuxDoEnabled,
  ApiUnauthorizedError,
} from '@/lib/api'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminInput, AdminSelect } from '@/components/admin/AdminFormControls'
import { AdminLoading } from '@/components/admin/AdminLoading'

interface SettingsTabProps {
  token: string | null
  settings: AdminSettingsDto | null
  setSettings: (settings: AdminSettingsDto) => void
  categories: string[]
  loading: boolean
  saving: boolean
  error: string
  onSave: () => void
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  onUnauthorized: () => void
}

export function SettingsTab({
  token,
  settings,
  setSettings,
  categories,
  loading,
  saving,
  error,
  onSave,
  t,
  notify,
  onUnauthorized,
}: SettingsTabProps) {
  const [settingsTab, setSettingsTab] = useState('site')
  const [comments, setComments] = useState<CommentDto[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentTab, setCommentTab] = useState<'manage' | 'config'>('manage')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [limit] = useState(20)

  // Linux DO binding state
  const [linuxDoEnabled, setLinuxDoEnabled] = useState(false)
  const [linuxDoBinding, setLinuxDoBinding] = useState<LinuxDoBinding | null>(null)
  const [linuxDoLoading, setLinuxDoLoading] = useState(false)
  const [linuxDoBindLoading, setLinuxDoBindLoading] = useState(false)

  const refreshComments = async () => {
    if (!token) return
    setCommentsLoading(true)
    try {
      const { data, meta } = await getComments(token, { page, limit })
      setComments(data)
      setTotalPages(meta.totalPages)
    } catch (err) {
      console.error(err)
    } finally {
      setCommentsLoading(false)
    }
  }

  const handleUpdateCommentStatus = async (
    id: string,
    status: 'approved' | 'rejected'
  ) => {
    if (!token) return
    try {
      await updateCommentStatus(token, id, status)
      await refreshComments()
      notify(t('admin.notify_success'))
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        onUnauthorized()
        return
      }
      notify(err instanceof Error ? err.message : t('common.error'), 'error')
    }
  }

  const handleDeleteComment = async (id: string) => {
    if (!token || !window.confirm(t('common.confirm'))) return
    try {
      await deleteComment(token, id)
      await refreshComments()
      notify(t('admin.notify_success'))
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        onUnauthorized()
        return
      }
      notify(err instanceof Error ? err.message : t('common.error'), 'error')
    }
  }

  // Load Linux DO status and binding
  const loadLinuxDoStatus = async () => {
    try {
      const enabled = await isLinuxDoEnabled()
      setLinuxDoEnabled(enabled)
      if (enabled && token) {
        setLinuxDoLoading(true)
        const binding = await getLinuxDoBinding(token)
        setLinuxDoBinding(binding)
      }
    } catch (err) {
      console.error('Failed to load Linux DO status:', err)
    } finally {
      setLinuxDoLoading(false)
    }
  }

  // Handle Linux DO bind
  const handleLinuxDoBind = async () => {
    if (!token) return
    try {
      setLinuxDoBindLoading(true)
      const { url, state } = await getLinuxDoAuthUrl()
      // Store state and mark as admin binding flow
      sessionStorage.setItem('linuxdo_oauth_state', state)
      sessionStorage.setItem('linuxdo_admin_bind', 'true')
      // Store current URL to return to after binding
      sessionStorage.setItem('linuxdo_bind_return_url', window.location.pathname)
      // Redirect to Linux DO auth
      window.location.href = url
    } catch (err) {
      notify(err instanceof Error ? err.message : t('common.error'), 'error')
      setLinuxDoBindLoading(false)
    }
  }

  // Handle Linux DO unbind
  const handleLinuxDoUnbind = async () => {
    if (!token || !window.confirm(t('common.confirm'))) return
    try {
      setLinuxDoBindLoading(true)
      await unbindLinuxDoAccount(token)
      setLinuxDoBinding(null)
      notify(t('admin.notify_success'))
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        onUnauthorized()
        return
      }
      notify(err instanceof Error ? err.message : t('common.error'), 'error')
    } finally {
      setLinuxDoBindLoading(false)
    }
  }

  // Load Linux DO status on mount
  useEffect(() => {
    loadLinuxDoStatus()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (settingsTab === 'comments') {
      refreshComments()
    }
    if (settingsTab === 'account') {
      loadLinuxDoStatus()
    }
  }, [settingsTab, token, page]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !settings) {
    return <AdminLoading text={t('common.loading')} />
  }

  return (
    <div className="max-w-[1920px]">
      <div className="flex flex-col md:flex-row gap-12 relative">
        <aside className="w-full md:w-48 space-y-1 md:sticky md:top-0 md:h-fit">
          <div className="mb-6 pb-2 border-b border-border">
            <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">
              {t('admin.config')}
            </h4>
          </div>
          {[
            { id: 'site', label: t('admin.general') },
            { id: 'categories', label: t('admin.taxonomy') },
            { id: 'storage', label: t('admin.engine') },
            { id: 'comments', label: t('admin.comments') },
            { id: 'account', label: t('admin.account') },
          ].map((tab) => (
            <AdminButton
              key={tab.id}
              onClick={() => setSettingsTab(tab.id)}
              adminVariant="unstyled"
              className={`w-full flex items-center justify-between px-2 py-3 text-xs font-bold uppercase tracking-widest transition-all border-l-2 ${
                settingsTab === tab.id
                  ? 'border-primary text-primary pl-4'
                  : 'border-transparent text-muted-foreground hover:text-foreground pl-2'
              }`}
            >
              <span>{tab.label}</span>
            </AdminButton>
          ))}
        </aside>
        <div className="flex-1 min-h-[500px] flex flex-col">
          {error && (
            <div className="mb-8 p-4 border border-destructive text-destructive text-xs tracking-widest uppercase flex items-center space-x-2">
              <X className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex-1 space-y-12">
            {settingsTab === 'site' && (
              <div className="max-w-2xl space-y-8">
                <div className="pb-4 border-b border-border">
                  <h3 className="font-serif text-2xl">{t('admin.general')}</h3>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      {t('admin.site_title')}
                    </label>
                    <AdminInput
                      variant="config"
                      value={settings.site_title}
                      disabled
                      className="opacity-60 cursor-not-allowed"
                    />
                    <p className="text-[10px] text-muted-foreground font-mono">
                      Configure via SITE_TITLE in .env file
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      {t('admin.cdn_host')}
                    </label>
                    <AdminInput
                      variant="config"
                      value={settings.cdn_domain}
                      disabled
                      className="opacity-60 cursor-not-allowed"
                      placeholder="https://cdn.example.com"
                    />
                    <p className="text-[10px] text-muted-foreground font-mono">
                      Configure via CDN_DOMAIN in .env file
                    </p>
                  </div>
                </div>
              </div>
            )}

            {settingsTab === 'categories' && (
              <div className="space-y-8">
                <div className="pb-4 border-b border-border">
                  <h3 className="font-serif text-2xl">{t('admin.taxonomy')}</h3>
                </div>
                <div className="flex flex-wrap gap-3">
                  {categories.map((cat) => (
                    <div
                      key={cat}
                      className="flex items-center space-x-2 px-4 py-2 bg-muted border border-border text-xs font-bold uppercase tracking-widest"
                    >
                      <span>{cat}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground font-mono">
                  Categories are automatically managed based on photo metadata.
                </p>
              </div>
            )}

            {settingsTab === 'storage' && (
              <div className="max-w-3xl space-y-8">
                <div className="pb-4 border-b border-border">
                  <h3 className="font-serif text-2xl">{t('admin.engine')}</h3>
                </div>
                <div className="space-y-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      {t('admin.active_provider')}
                    </label>
                    <div className="flex gap-4">
                      {['local', 'r2', 'github'].map((p) => (
                        <AdminButton
                          key={p}
                          onClick={() =>
                            setSettings({ ...settings, storage_provider: p })
                          }
                          adminVariant="unstyled"
                          className={`px-6 py-3 text-xs font-bold uppercase tracking-widest border transition-all ${
                            settings.storage_provider === p
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
                          }`}
                        >
                          {p}
                        </AdminButton>
                      ))}
                    </div>
                  </div>

                  {settings.storage_provider === 'r2' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 border border-border bg-muted/20">
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                          Endpoint
                        </label>
                        <AdminInput
                          variant="config"
                          type="text"
                          value={settings.r2_endpoint ?? ''}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              r2_endpoint: e.target.value,
                            })
                          }
                          placeholder="https://<account-id>.r2.cloudflarestorage.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                          Access Key ID
                        </label>
                        <AdminInput
                          variant="config"
                          type="text"
                          value={settings.r2_access_key_id ?? ''}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              r2_access_key_id: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                          Secret Access Key
                        </label>
                        <AdminInput
                          variant="config"
                          type="password"
                          value={settings.r2_secret_access_key ?? ''}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              r2_secret_access_key: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                          Bucket
                        </label>
                        <AdminInput
                          variant="config"
                          type="text"
                          value={settings.r2_bucket ?? ''}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              r2_bucket: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                          Path Prefix
                        </label>
                        <AdminInput
                          variant="config"
                          type="text"
                          value={settings.r2_path ? (settings.r2_path.startsWith('/') ? settings.r2_path : `/${settings.r2_path}`) : '/'}
                          onChange={(e) => {
                            let v = e.target.value
                            // Ensure starts with /
                            if (!v.startsWith('/')) v = '/' + v
                            // Remove duplicate slashes
                            v = v.replace(/\/+/g, '/')
                            setSettings({
                              ...settings,
                              r2_path: v === '/' ? '' : v.replace(/^\//, ''),
                            })
                          }}
                          placeholder="/photos"
                        />
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                          Public URL <span className="text-destructive">*</span>
                        </label>
                        <AdminInput
                          variant="config"
                          type="text"
                          value={settings.r2_public_url ?? ''}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              r2_public_url: e.target.value,
                            })
                          }
                          placeholder="https://pub-xxx.r2.dev"
                        />
                        <p className="text-[10px] text-muted-foreground font-mono">
                          Required. Enable public access in R2 bucket settings or use a custom domain.
                        </p>
                      </div>
                    </div>
                  )}

                  {settings.storage_provider === 'github' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 border border-border bg-muted/20">
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                          Personal Access Token
                        </label>
                        <AdminInput
                          variant="config"
                          type="password"
                          value={settings.github_token ?? ''}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              github_token: e.target.value,
                            })
                          }
                          placeholder={t('admin.gh_placeholder_token')}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                            Repo (owner/repo)
                          </label>
                        </div>
                        <AdminInput
                          variant="config"
                          type="text"
                          value={settings.github_repo ?? ''}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              github_repo: e.target.value,
                            })
                          }
                          placeholder={t('admin.gh_placeholder_repo')}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                            {t('admin.gh_branch')}
                          </label>
                          <AdminButton
                            onClick={async () => {
                              if (
                                !settings.github_token ||
                                !settings.github_repo
                              ) {
                                notify('Token and Repo required', 'info')
                                return
                              }
                              try {
                                const res = await fetch(
                                  `https://api.github.com/repos/${settings.github_repo}/branches`,
                                  {
                                    headers: {
                                      Authorization: `token ${settings.github_token}`,
                                    },
                                  }
                                )
                                if (!res.ok)
                                  throw new Error('Failed to fetch branches')
                                const data = await res.json()
                                const branchNames = Array.isArray(data)
                                  ? data
                                      .map((b) => {
                                        if (b && typeof b === 'object' && 'name' in b) {
                                          const name = (b as Record<string, unknown>).name
                                          return typeof name === 'string' ? name : null
                                        }
                                        return null
                                      })
                                      .filter((name): name is string => !!name)
                                  : []
                                notify(
                                  `${t('admin.notify_gh_branches')}: ${branchNames.join(
                                    ', '
                                  )}`,
                                  'info'
                                )
                              } catch (e) {
                                notify('Error fetching branches', 'error')
                              }
                            }}
                            adminVariant="unstyled"
                            className="text-[8px] font-bold text-primary uppercase hover:underline"
                          >
                            {t('admin.gh_test')}
                          </AdminButton>
                        </div>
                        <AdminInput
                          variant="config"
                          type="text"
                          value={settings.github_branch ?? ''}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              github_branch: e.target.value,
                            })
                          }
                          placeholder="main"
                        />
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                          {t('admin.path_prefix')}
                        </label>
                        <AdminInput
                          variant="config"
                          type="text"
                          value={settings.github_path ? (settings.github_path.startsWith('/') ? settings.github_path : `/${settings.github_path}`) : '/'}
                          onChange={(e) => {
                            let v = e.target.value
                            // Ensure starts with /
                            if (!v.startsWith('/')) v = '/' + v
                            // Remove duplicate slashes
                            v = v.replace(/\/+/g, '/')
                            setSettings({
                              ...settings,
                              github_path: v === '/' ? '' : v.replace(/^\//, ''),
                            })
                          }}
                          placeholder="/uploads"
                        />
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                          Access Method (访问方式)
                        </label>
                        <AdminSelect
                          value={settings.github_access_method || 'jsdelivr'}
                          onChange={(value) =>
                            setSettings({
                              ...settings,
                              github_access_method: value,
                            })
                          }
                          options={[
                            { value: 'raw', label: 'raw.githubusercontent.com' },
                            { value: 'jsdelivr', label: 'jsDelivr CDN (推荐)' },
                            { value: 'pages', label: 'GitHub Pages' },
                          ]}
                        />
                      </div>
                      {settings.github_access_method === 'pages' && (
                        <div className="md:col-span-2 space-y-2">
                          <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                            GitHub Pages URL
                          </label>
                          <AdminInput
                            variant="config"
                            type="text"
                            value={settings.github_pages_url ?? ''}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                github_pages_url: e.target.value,
                              })
                            }
                            placeholder="https://username.github.io/repo"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {settingsTab === 'comments' && (
              <div className="space-y-8">
                <div className="flex space-x-1 border-b border-border">
                  {(['manage', 'config'] as const).map((tab) => (
                    <AdminButton
                      key={tab}
                      onClick={() => setCommentTab(tab)}
                      adminVariant="tab"
                      size="none"
                      data-state={commentTab === tab ? 'active' : 'inactive'}
                      className="px-6 py-3"
                    >
                      {t(`admin.comments_tabs_${tab}`)}
                    </AdminButton>
                  ))}
                </div>

                {commentTab === 'config' && (
                  <div className="max-w-2xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="pb-4 border-b border-border">
                      <h3 className="font-serif text-2xl">
                        {t('admin.comments_config')}
                      </h3>
                    </div>
                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-4 border border-border bg-muted/10">
                        <div>
                          <label className="text-[10px] font-bold text-foreground uppercase tracking-widest">
                            {t('admin.comment_moderation')}
                          </label>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Require approval for new comments
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.comment_moderation || false}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              comment_moderation: e.target.checked,
                            })
                          }
                          className="w-5 h-5 accent-primary cursor-pointer"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                          {t('admin.comment_provider')}
                        </label>
                        <AdminSelect
                          value={settings.comment_provider || 'local'}
                          onChange={(value) =>
                            setSettings({
                              ...settings,
                              comment_provider: value,
                            })
                          }
                          options={[
                            { value: 'local', label: 'Local (Basic)' },
                            { value: 'openai', label: 'OpenAI' },
                            { value: 'gemini', label: 'Google Gemini' },
                            { value: 'anthropic', label: 'Anthropic Claude' },
                          ]}
                        />
                      </div>

                      {settings.comment_provider &&
                        settings.comment_provider !== 'local' && (
                          <div className="space-y-6 p-6 border border-border bg-muted/20">
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                {t('admin.comment_api_key')}
                              </label>
                              <AdminInput
                                variant="config"
                                type="password"
                                value={settings.comment_api_key || ''}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    comment_api_key: e.target.value,
                                  })
                                }
                                placeholder="sk-..."
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                {t('admin.comment_endpoint')}
                              </label>
                              <AdminInput
                                variant="config"
                                type="text"
                                value={settings.comment_api_endpoint || ''}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    comment_api_endpoint: e.target.value,
                                  })
                                }
                                placeholder="https://api.openai.com/v1"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                {t('admin.comment_model')}
                              </label>
                              <AdminInput
                                variant="config"
                                type="text"
                                value={settings.comment_model || ''}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    comment_model: e.target.value,
                                  })
                                }
                                placeholder="gpt-4o, gemini-pro..."
                              />
                            </div>
                          </div>
                        )}

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                          {t('admin.blocked_keywords')}
                        </label>
                        <textarea
                          value={settings.blocked_keywords || ''}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              blocked_keywords: e.target.value,
                            })
                          }
                          placeholder="comma, separated, keywords"
                          className="w-full p-4 h-32 bg-transparent border border-border focus:border-primary outline-none text-sm transition-colors rounded-none resize-none font-mono"
                        />
                        <p className="text-[10px] text-muted-foreground font-mono">
                          Comments containing these keywords will be automatically rejected.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {commentTab === 'manage' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="pb-4 border-b border-border flex items-center justify-between">
                      <h3 className="font-serif text-2xl">
                        {t('admin.comments_manage')}
                      </h3>
                      <AdminButton
                        onClick={refreshComments}
                        adminVariant="icon"
                      >
                        <Globe className="w-4 h-4" />
                      </AdminButton>
                    </div>

                    {commentsLoading ? (
                      <div className="space-y-4">
                        {[...Array(3)].map((_, i) => (
                          <div
                            key={i}
                            className="h-20 bg-muted animate-pulse"
                          />
                        ))}
                      </div>
                    ) : comments.length === 0 ? (
                      <div className="py-12 text-center border border-dashed border-border">
                        <MessageSquare className="w-8 h-8 mx-auto mb-4 opacity-20" />
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                          No comments found
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {comments.map((comment) => (
                          <div
                            key={comment.id}
                            className="p-6 border border-border hover:border-primary transition-all bg-card/30"
                          >
                            <div className="flex items-start justify-between gap-4">
                              {/* Avatar */}
                              <div className="flex-shrink-0">
                                {comment.avatarUrl ? (
                                  <img
                                    src={comment.avatarUrl}
                                    alt={comment.author}
                                    className="w-10 h-10 rounded-full object-cover border border-border"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center border border-border">
                                    <span className="text-sm font-bold text-muted-foreground">
                                      {comment.author.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="space-y-2 flex-1">
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-bold uppercase tracking-wider">
                                    {comment.author}
                                  </span>
                                  <span
                                    className={`text-[8px] font-black uppercase px-1.5 py-0.5 border ${
                                      comment.status === 'approved'
                                        ? 'border-primary text-primary'
                                        : comment.status === 'rejected'
                                        ? 'border-destructive text-destructive'
                                        : 'border-amber-500 text-amber-500'
                                    }`}
                                  >
                                    {comment.status}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground font-mono">
                                    {new Date(comment.createdAt).toLocaleString()}
                                  </span>
                                </div>
                                <p className="text-sm text-foreground/80 leading-relaxed">
                                  {comment.content}
                                </p>
                              </div>

                              <div className="flex items-center gap-2">
                                {comment.status !== 'approved' && (
                                  <AdminButton
                                    onClick={() =>
                                      handleUpdateCommentStatus(
                                        comment.id,
                                        'approved'
                                      )
                                    }
                                    adminVariant="iconPrimary"
                                    title="Approve"
                                  >
                                    <Check className="w-4 h-4" />
                                  </AdminButton>
                                )}
                                {comment.status !== 'rejected' && (
                                  <AdminButton
                                    onClick={() =>
                                      handleUpdateCommentStatus(
                                        comment.id,
                                        'rejected'
                                      )
                                    }
                                    adminVariant="iconDestructive"
                                    title="Reject"
                                  >
                                    <X className="w-4 h-4" />
                                  </AdminButton>
                                )}
                                <AdminButton
                                  onClick={() =>
                                    handleDeleteComment(comment.id)
                                  }
                                  adminVariant="iconDestructive"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </AdminButton>
                              </div>
                            </div>
                          </div>
                        ))}

                        {/* Pagination */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-center gap-4 mt-8">
                            <AdminButton
                              onClick={() => setPage((p) => Math.max(1, p - 1))}
                              disabled={page === 1}
                              adminVariant="unstyled"
                              className="p-2 border border-border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/50 transition-colors"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </AdminButton>
                            <span className="text-xs font-mono">
                              {page} / {totalPages}
                            </span>
                            <AdminButton
                              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                              disabled={page === totalPages}
                              adminVariant="unstyled"
                              className="p-2 border border-border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/50 transition-colors"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </AdminButton>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {settingsTab === 'account' && (
              <div className="max-w-2xl space-y-8">
                <div className="pb-4 border-b border-border">
                  <h3 className="font-serif text-2xl">{t('admin.account')}</h3>
                </div>

                {/* Linux DO Binding Section */}
                <div className="space-y-6">
                  <div className="pb-4 border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-[#f8d568]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                      </svg>
                      <h4 className="text-[10px] font-bold text-foreground uppercase tracking-widest">
                        Linux DO
                      </h4>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      {t('admin.linuxdo_binding_desc')}
                    </p>
                  </div>

                  {!linuxDoEnabled ? (
                    <div className="p-6 border border-dashed border-border text-center">
                      <p className="text-xs text-muted-foreground">
                        {t('admin.linuxdo_not_configured')}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70 mt-2 font-mono">
                        Configure LINUXDO_CLIENT_ID and LINUXDO_CLIENT_SECRET in .env
                      </p>
                    </div>
                  ) : linuxDoLoading ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
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
                            <User className="w-6 h-6 text-muted-foreground" />
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
                            <Link className="w-3 h-3" />
                            {t('admin.linuxdo_bound')}
                          </span>
                        </div>
                      </div>
                      <AdminButton
                        onClick={handleLinuxDoUnbind}
                        disabled={linuxDoBindLoading}
                        adminVariant="unstyled"
                        className="w-full py-3 border border-destructive/50 text-destructive hover:bg-destructive/10 text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {linuxDoBindLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Unlink className="w-4 h-4" />
                        )}
                        {t('admin.linuxdo_unbind')}
                      </AdminButton>
                    </div>
                  ) : (
                    <div className="p-6 border border-dashed border-border text-center space-y-4">
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          {t('admin.linuxdo_not_bound')}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70">
                          {t('admin.linuxdo_bind_hint')}
                        </p>
                      </div>
                      <AdminButton
                        onClick={handleLinuxDoBind}
                        disabled={linuxDoBindLoading}
                        adminVariant="unstyled"
                        className="px-6 py-3 bg-[#f8d568] text-[#1a1a1a] hover:bg-[#f5c842] text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
                      >
                        {linuxDoBindLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Link className="w-4 h-4" />
                        )}
                        {t('admin.linuxdo_bind')}
                      </AdminButton>
                    </div>
                  )}
                </div>
              </div>
            )}

            {settingsTab !== 'site' && settingsTab !== 'account' && (
              <div className="pt-8 border-t border-border flex justify-end">
                <AdminButton
                  onClick={onSave}
                  disabled={saving}
                  adminVariant="primary"
                  size="none"
                  className="px-8 py-4 flex items-center space-x-2"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>{t('admin.save')}</span>
                </AdminButton>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

