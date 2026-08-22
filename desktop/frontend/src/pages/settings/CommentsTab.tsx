// 系统设置 · 评论（与 Web 端一致：Manage + Config 子标签）

import { useState, useCallback } from 'react'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import {
  DeleteComment,
  GetComments,
  UpdateCommentStatus,
} from '../../../wailsjs/go/main/App'
import { type services } from '../../../wailsjs/go/models'
import {
  Loader2,
  Trash2,
  X,
  Check,
} from 'lucide-react'
import { inputClass, inputStyle, textareaClass, STATUS_COLORS, Badge, Section, Field } from './shared'
type CommentsSubTab = 'manage' | 'config'

// ─── Tab 4: 评论（与 Web 端一致：Manage + Config 子标签） ──

export function CommentsTab({ config, updateConfig }: {
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

  useCachedPageEffect(() => { void fetchComments() }, [fetchComments])

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
