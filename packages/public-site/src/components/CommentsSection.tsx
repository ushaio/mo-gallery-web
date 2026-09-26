'use client'

import { memo, useCallback, useEffect, useState } from 'react'

import type { SiteComment } from '@mo-gallery/content-core'
import type { VisitorCommentInput, VisitorContentProvider } from '../adapters'
import type { PublicSiteLabels } from '../labels'

interface CommentsSectionProps {
  username: string
  /** 被评论的站点照片元数据 id（PhotoSiteMetadata.id）。 */
  photoId: string
  provider: VisitorContentProvider
  labels: PublicSiteLabels
  /** 站点/照片级评论开关（宿主由 SiteSettings.commentsEnabled 等推导）；默认 true。 */
  enabled?: boolean
  pageSize?: number
  /**
   * 访客是否具备评论身份（MO 云模式 = 已登录官网账号，决策 D2）。
   * 不传时按 provider 是否提供 submitComment 判定。
   */
  canComment?: boolean
}

function formatCommentDate(value: string | Date): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString()
}

/**
 * 照片评论区（访客视角）。列表数据经 provider.listComments 拉取
 * （approved-only，由宿主实现保证）；提交走 provider.submitComment，
 * 鉴权与作者身份解析全部由宿主实现处理，组件不伪造作者字段。
 * 宿主未提供评论能力（provider 缺少两个方法）时整体不渲染。
 */
export const CommentsSection = memo(function CommentsSection({
  username,
  photoId,
  provider,
  labels,
  enabled = true,
  pageSize = 20,
  canComment,
}: CommentsSectionProps) {
  const canList = typeof provider.listComments === 'function'
  const canSubmit = typeof provider.submitComment === 'function'
  if (!canList && !canSubmit) return null

  return (
    <CommentsSectionBody
      username={username}
      photoId={photoId}
      provider={provider}
      labels={labels}
      enabled={enabled && canList}
      canSubmit={enabled && canSubmit && canComment !== false}
      loginRequired={canComment === undefined && !canSubmit ? false : canComment === false}
      pageSize={pageSize}
    />
  )
})

interface CommentsSectionBodyProps {
  username: string
  photoId: string
  provider: VisitorContentProvider
  labels: PublicSiteLabels
  enabled: boolean
  canSubmit: boolean
  loginRequired: boolean
  pageSize: number
}

const CommentsSectionBody = memo(function CommentsSectionBody({
  username,
  photoId,
  provider,
  labels,
  enabled,
  canSubmit,
  loginRequired,
  pageSize,
}: CommentsSectionBodyProps) {
  const [comments, setComments] = useState<SiteComment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback(async (targetPage: number, append: boolean) => {
    if (typeof provider.listComments !== 'function') return
    setLoading(true)
    try {
      const result = await provider.listComments(username, photoId, targetPage, pageSize)
      setComments((current) => (append ? [...current, ...result.items] : result.items))
      setTotal(result.total)
      setPage(targetPage)
    } catch {
      if (!append) setComments([])
    } finally {
      setLoading(false)
    }
  }, [photoId, provider, pageSize, username])

  useEffect(() => {
    if (enabled) void fetchPage(1, false)
  }, [enabled, fetchPage])

  const handleSubmit = useCallback(async () => {
    const trimmed = content.trim()
    if (!trimmed || typeof provider.submitComment !== 'function') return
    setSubmitting(true)
    setError(null)
    const input: VisitorCommentInput = { content: trimmed }
    try {
      await provider.submitComment(username, photoId, input)
      setContent('')
      await fetchPage(1, false)
    } catch {
      setError(labels.commentPostFailed)
    } finally {
      setSubmitting(false)
    }
  }, [content, fetchPage, labels.commentPostFailed, photoId, provider, username])

  if (!enabled && !canSubmit) {
    return null
  }

  const hasMore = comments.length < total

  return (
    <section className="mt-12">
      <h2 className="mb-6 font-mono text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {labels.commentsTitle}{enabled && total > 0 ? ` (${total})` : ''}
      </h2>

      {canSubmit ? (
        <form
          className="mb-6 rounded-[28px] border border-border/30 bg-background/70 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSubmit()
          }}
        >
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={labels.commentPlaceholder}
            rows={3}
            className="min-h-[100px] w-full resize-y rounded-2xl border border-border/35 bg-background/80 px-4 py-3 font-serif text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition-colors focus:border-primary focus:bg-background"
          />
          {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={submitting || content.trim() === ''}
              className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? labels.commentSubmitting : labels.commentSubmit}
            </button>
          </div>
        </form>
      ) : (
        <p className="mb-6 rounded-[24px] border border-dashed border-border/30 bg-muted/5 px-5 py-6 text-center text-xs text-muted-foreground/70">
          {loginRequired ? labels.commentLoginRequired : labels.commentsDisabled}
        </p>
      )}

      {enabled ? (
        <>
          {comments.length === 0 && !loading ? (
            <p className="rounded-[28px] border border-border/20 bg-muted/5 px-6 py-10 text-center text-sm text-muted-foreground">{labels.emptyComments}</p>
          ) : (
            <ul className="space-y-4">
              {comments.map((comment) => (
                <li key={comment.id} className="group rounded-[24px] border border-border/25 bg-background/80 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-5">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/30 bg-muted/35 font-serif text-sm text-foreground/70">
                      {comment.authorName.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
                          {comment.authorName}
                        </span>
                        {/* mono 大写时间戳胶囊（web StoryComments 同款） */}
                        <time className="inline-flex items-center rounded-full bg-muted/35 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {formatCommentDate(comment.createdAt)}
                        </time>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words font-serif text-sm leading-relaxed text-foreground/75">
                        {comment.content}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {loading ? (
            <p className="py-4 text-center font-mono text-xs text-muted-foreground">{labels.loading}</p>
          ) : null}

          {hasMore && !loading ? (
            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={() => void fetchPage(page + 1, true)}
                className="text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
              >
                {labels.loadMore}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
})
