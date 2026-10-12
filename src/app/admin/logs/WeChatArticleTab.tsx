/**
 * 公众号图文页签（站点后台「文章创作」的第四个子页）。
 *
 * 依赖公众号绑定状态显示（未绑定时根页面根本不渲染这个页签），内容**默认读云端数据库**：
 * 首次进入或点「刷新」才去微信拉一次（草稿箱 / 发表记录一次最多 20 条，逐页拉很慢也容易被限流），
 * 之后一直读云端库，所以反复切页签不会重复请求微信。
 *
 * 两栏语义（与微信侧的约束一致）：
 *  - 草稿：还在公众号草稿箱里，可以继续改、可以再推一次（draft/update）；
 *  - 已发布：微信不允许修改已发表文章，因此这里只读，只提供「打开公众号文章」。
 *
 * ⚠️ 当前**暂未挂载**：后台「文章创作」的公众号页签已隐藏（等有可联调的认证公众号再恢复，
 * 恢复方式见 web CHANGELOG 第 13 条与 `server/lib/wechat-articles.ts` 的 WECHAT_ARTICLES_ENABLED 说明）。
 */
'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { ExternalLink, ImageOff, Loader2, RefreshCw } from 'lucide-react'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminSelect, type SelectOption } from '@/components/admin/AdminFormControls'
import { listWeChatArticles, type WeChatArticleItem, type WeChatArticleKind, type WeChatArticlePage } from '@/lib/wechat-articles'
import { formatRelativeTimeLabel } from '@/lib/utils'

interface WeChatArticleTabProps {
  token: string | null
  t: (key: string) => string
  /** 根页面双击页签时递增：强制与微信同步一次（与其它子页签的「双击刷新」同一约定） */
  refreshKey?: number
}

/** 封面图是微信给的临时链接（约 3 天失效），失效时退回占位图标而不是留一个破图。 */
function ArticleCover({ item }: { item: WeChatArticleItem }) {
  const [failed, setFailed] = useState(false)
  if (!item.coverUrl || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
        <ImageOff className="h-5 w-5" />
      </div>
    )
  }
  return (
    <img
      src={item.coverUrl}
      alt=""
      loading="lazy"
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  )
}

export function WeChatArticleTab({ token, t, refreshKey = 0 }: WeChatArticleTabProps) {
  const [kind, setKind] = useState<WeChatArticleKind>('draft')
  const [page, setPage] = useState<WeChatArticlePage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 两栏语义与微信侧的约束一致：草稿＝公众号草稿箱（可继续编辑），已发布＝发表记录（微信不允许改）
  const kindOptions: SelectOption[] = [
    { value: 'draft', label: t('admin.wechat_articles_draft') },
    { value: 'published', label: t('admin.wechat_articles_published') },
  ]

  const load = useCallback(async (nextKind: WeChatArticleKind, refresh = false) => {
    setLoading(true)
    setError('')
    try {
      setPage(await listWeChatArticles(token, nextKind, refresh))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
      setPage(null)
    } finally {
      setLoading(false)
    }
  }, [token])

  // 切换筛选时才请求；数据本身存在云端库里，切换筛选不会每次都打微信
  useEffect(() => { void load(kind) }, [kind, load])

  // 双击页签 = 强制与微信同步一次（首次值为 0，跳过首轮）
  useEffect(() => {
    if (refreshKey > 0) void load(kind, true)
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps -- 只认外部递增的 refreshKey

  const syncedLabel = page?.syncedAt ? formatRelativeTimeLabel(page.syncedAt) : ''

  return (
    <div className="flex h-full flex-col gap-6 overflow-hidden">
      {/* 筛选与相邻子页签（草稿箱）同一套写法：左侧下拉筛选，右侧动作 */}
      <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-4">
          <AdminSelect
            value={kind}
            options={kindOptions}
            onChange={(value) => setKind(value === 'published' ? 'published' : 'draft')}
            className="w-32"
          />
          {page && page.items.length > 0 ? (
            <span className="text-xs text-muted-foreground">{page.items.length}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          {syncedLabel ? (
            <span className="text-xs text-muted-foreground">
              {t('admin.wechat_articles_synced_at')} {syncedLabel}
            </span>
          ) : null}
          <AdminButton
            onClick={() => void load(kind, true)}
            adminVariant="outline"
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('admin.wechat_articles_refresh')}
          </AdminButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !page ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('admin.wechat_articles_loading')}
          </div>
        ) : error ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
            <p className="max-w-xl text-sm text-destructive">{error}</p>
            <AdminButton onClick={() => void load(kind, true)} adminVariant="outline" className="px-4 py-2 text-xs">
              {t('admin.wechat_articles_retry')}
            </AdminButton>
          </div>
        ) : page && page.items.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <p className="text-sm">
              {kind === 'draft' ? t('admin.wechat_articles_empty_draft') : t('admin.wechat_articles_empty_published')}
            </p>
            <p className="text-xs">{t('admin.wechat_articles_empty_hint')}</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {page?.items.map((item) => (
              <div
                key={`${item.itemId}-${item.position}`}
                className="flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
              >
                <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg">
                  <ArticleCover item={item} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-medium">{item.title || t('admin.wechat_articles_untitled')}</p>
                    {item.articleUrl ? (
                      <a
                        href={item.articleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                        title={t('admin.wechat_articles_open')}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {item.digest || item.sourceUrl || t('admin.wechat_articles_no_digest')}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                    {item.author ? <span className="truncate">{item.author}</span> : null}
                    {item.updateTime ? <span>{formatRelativeTimeLabel(item.updateTime)}</span> : null}
                    {item.isDeleted ? (
                      <span className="text-destructive">{t('admin.wechat_articles_deleted')}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
