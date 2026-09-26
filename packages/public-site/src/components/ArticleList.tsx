'use client'

import { memo } from 'react'

import type { SiteArticle, SiteArticleKind } from '@mo-gallery/content-core'
import type { LinkAdapter } from '../adapters'
import type { PublicSiteLabels } from '../labels'

interface ArticleListProps {
  username: string
  articles: SiteArticle[]
  links: LinkAdapter
  labels: PublicSiteLabels
  kind?: SiteArticleKind
  /** 分页信息；提供 onPageChange 时渲染「加载更多」。 */
  page?: number
  pageSize?: number
  total?: number
  loading?: boolean
  onLoadMore?: () => void
}

function articleDate(article: SiteArticle): Date | undefined {
  return article.publishedAt ?? article.storyDate ?? article.createdAt
}

/**
 * 文章/故事列表（blog 与 story 共用，kind 只影响默认详情路由语义）。
 * 详情链接优先走 LinkAdapter.articleByKind，缺席回落 article()。
 * 视觉对齐 web 列表观感：serif 大标题 hover 变 primary、mono 大写元信息、
 * `psw-enter` 入场 stagger（需宿主引入 web-theme.css）。
 */
export const ArticleList = memo(function ArticleList({
  username,
  articles,
  links,
  labels,
  kind = 'blog',
  page,
  pageSize,
  total,
  loading = false,
  onLoadMore,
}: ArticleListProps) {
  const detailHref = (article: SiteArticle) =>
    links.articleByKind?.(username, article.kind ?? kind, article.slug || article.id) ??
    links.article(username, article.slug || article.id)

  const hasMore = page !== undefined && pageSize !== undefined && total !== undefined
    ? page * pageSize < total
    : false

  return (
    <div>
      {articles.length === 0 && !loading ? (
        <p className="py-24 text-center text-sm text-muted-foreground">{labels.emptyArticles}</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {articles.map((article, index) => {
            const date = articleDate(article)
            const tags = article.tags ?? []
            return (
              <li
                key={article.id}
                className="psw-enter py-8"
                style={{ animationDelay: `${Math.min(index, 12) * 0.06}s` }}
              >
                <a href={detailHref(article)} className="group block">
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="font-serif text-2xl font-light tracking-tight text-foreground transition-colors duration-300 group-hover:text-primary md:text-3xl">
                      {article.title}
                    </h2>
                    {date ? (
                      <time className="shrink-0 font-mono text-[11px] uppercase tracking-widest text-muted-foreground/60">
                        {new Date(date).toLocaleDateString()}
                      </time>
                    ) : null}
                  </div>
                  {article.summary ? (
                    <p className="mt-2 max-w-3xl line-clamp-2 text-sm leading-relaxed text-muted-foreground">{article.summary}</p>
                  ) : null}
                  {article.category || tags.length > 0 ? (
                    <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
                      {[article.category || labels.articleUncategorized, ...tags].join(' · ')}
                    </p>
                  ) : null}
                </a>
              </li>
            )
          })}
        </ul>
      )}

      {loading ? (
        <p className="py-6 text-center font-mono text-xs text-muted-foreground">{labels.loading}</p>
      ) : null}

      {hasMore && onLoadMore ? (
        <div className="py-6 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            className="rounded-full border border-border/60 px-6 py-2.5 text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            {labels.loadMore}
          </button>
        </div>
      ) : null}
    </div>
  )
})
