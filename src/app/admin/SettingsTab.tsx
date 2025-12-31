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
} from 'lucide-react'
import {
  AdminSettingsDto,
  CommentDto,
  getComments,
  updateCommentStatus,
  deleteComment,
  ApiUnauthorizedError,
} from '@/lib/api'
import { CustomInput } from '@/components/ui/CustomInput'

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

  const refreshComments = async () => {
    if (!token) return
    setCommentsLoading(true)
    try {
      const data = await getComments(token)
      setComments(data)
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

  useEffect(() => {
    if (settingsTab === 'comments') {
      refreshComments()
    }
  }, [settingsTab, token]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !settings) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs font-mono uppercase">
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="max-w-[1920px]">
      <div className="flex flex-col md:flex-row gap-12">
        <aside className="w-full md:w-48 space-y-1">
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
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSettingsTab(tab.id)}
              className={`w-full flex items-center justify-between px-2 py-3 text-xs font-bold uppercase tracking-widest transition-all border-l-2 ${
                settingsTab === tab.id
                  ? 'border-primary text-primary pl-4'
                  : 'border-transparent text-muted-foreground hover:text-foreground pl-2'
              }`}
            >
              <span>{tab.label}</span>
            </button>
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
                    <CustomInput
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
                    <CustomInput
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
                        <button
                          key={p}
                          onClick={() =>
                            setSettings({ ...settings, storage_provider: p })
                          }
                          className={`px-6 py-3 text-xs font-bold uppercase tracking-widest border transition-all ${
                            settings.storage_provider === p
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {settings.storage_provider === 'r2' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 border border-border bg-muted/20">
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                          Endpoint
                        </label>
                        <CustomInput
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
                        <CustomInput
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
                        <CustomInput
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
                        <CustomInput
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
                        <CustomInput
                          variant="config"
                          type="text"
                          value={settings.r2_path ?? ''}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              r2_path: e.target.value,
                            })
                          }
                          placeholder="photos"
                        />
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                          Public URL <span className="text-destructive">*</span>
                        </label>
                        <CustomInput
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
                        <CustomInput
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
                        <CustomInput
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
                          <button
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
                                const branchNames = data.map(
                                  (b: any) => b.name
                                )
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
                            className="text-[8px] font-bold text-primary uppercase hover:underline"
                          >
                            {t('admin.gh_test')}
                          </button>
                        </div>
                        <CustomInput
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
                        <CustomInput
                          variant="config"
                          type="text"
                          value={settings.github_path ?? ''}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              github_path: e.target.value,
                            })
                          }
                          placeholder={t('admin.gh_placeholder_path')}
                        />
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                          Access Method (访问方式)
                        </label>
                        <select
                          value={settings.github_access_method || 'jsdelivr'}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              github_access_method: e.target.value,
                            })
                          }
                          className="w-full p-3 bg-background border border-border focus:border-primary outline-none text-xs font-bold uppercase tracking-wider"
                        >
                          <option value="raw">
                            raw.githubusercontent.com
                          </option>
                          <option value="jsdelivr">
                            jsDelivr CDN (推荐)
                          </option>
                          <option value="pages">GitHub Pages</option>
                        </select>
                      </div>
                      {settings.github_access_method === 'pages' && (
                        <div className="md:col-span-2 space-y-2">
                          <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                            GitHub Pages URL
                          </label>
                          <CustomInput
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
                  {['manage', 'config'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setCommentTab(tab as any)}
                      className={`px-6 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
                        commentTab === tab
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t(`admin.comments_tabs_${tab}`)}
                    </button>
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
                        <select
                          value={settings.comment_provider || 'local'}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              comment_provider: e.target.value,
                            })
                          }
                          className="w-full p-4 bg-transparent border border-border focus:border-primary outline-none text-xs font-bold uppercase tracking-wider"
                        >
                          <option value="local">Local (Basic)</option>
                          <option value="openai">OpenAI</option>
                          <option value="gemini">Google Gemini</option>
                          <option value="anthropic">Anthropic Claude</option>
                        </select>
                      </div>

                      {settings.comment_provider &&
                        settings.comment_provider !== 'local' && (
                          <div className="space-y-6 p-6 border border-border bg-muted/20">
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                {t('admin.comment_api_key')}
                              </label>
                              <CustomInput
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
                              <CustomInput
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
                              <CustomInput
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
                      <button
                        onClick={refreshComments}
                        className="p-2 hover:bg-muted"
                      >
                        <Globe className="w-4 h-4" />
                      </button>
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
                                    {new Date(
                                      comment.createdAt
                                    ).toLocaleDateString()}
                                  </span>
                                </div>
                                <p className="text-sm text-foreground/80 leading-relaxed">
                                  {comment.content}
                                </p>
                              </div>

                              <div className="flex items-center gap-2">
                                {comment.status !== 'approved' && (
                                  <button
                                    onClick={() =>
                                      handleUpdateCommentStatus(
                                        comment.id,
                                        'approved'
                                      )
                                    }
                                    className="p-2 text-muted-foreground hover:text-primary transition-colors"
                                    title="Approve"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                )}
                                {comment.status !== 'rejected' && (
                                  <button
                                    onClick={() =>
                                      handleUpdateCommentStatus(
                                        comment.id,
                                        'rejected'
                                      )
                                    }
                                    className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                                    title="Reject"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() =>
                                    handleDeleteComment(comment.id)
                                  }
                                  className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {settingsTab !== 'site' && (
              <div className="pt-8 border-t border-border flex justify-end">
                <button
                  onClick={onSave}
                  disabled={saving}
                  className="px-8 py-4 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all flex items-center space-x-2"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>{t('admin.save')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
