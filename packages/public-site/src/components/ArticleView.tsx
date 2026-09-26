'use client'

import { memo, type ReactNode } from 'react'

import type { PhotoSiteMetadata, SiteArticle } from '@mo-gallery/content-core'
import type { LinkAdapter, MediaUrlResolver } from '../adapters'
import type { PublicSiteLabels } from '../labels'
import { ArticleBody } from './ArticleBody'

interface ArticleViewProps {
  username: string
  article: SiteArticle
  resolver: MediaUrlResolver
  links: LinkAdapter
  labels: PublicSiteLabels
  /** 正文内联照片点击回调（可选，如打开灯箱）。 */
  onOpenPhoto?: (photo: PhotoSiteMetadata) => void
  /** 文章内联照片（可选；milkdown 媒体卡回显用）。 */
  photos?: PhotoSiteMetadata[]
  backHref?: string
  /**
   * 封面图 URL（可选；story 全屏封面 header 规格：cover 40% 透明度 +
   * 径向/纵向双遮罩，标题白字压在遮罩上）。缺省用居中的传统标题区。
   */
  coverUrl?: string
  /** 侧栏内容（可选）；提供时正文走 web story 的 12 栏 8+4 布局。 */
  sidebar?: ReactNode
}

function formatDate(date: Date | undefined): string {
  if (!date) return ''
  const value = new Date(date)
  return Number.isNaN(value.getTime()) ? '' : value.toLocaleDateString()
}

/**
 * 文章/故事详情（访客侧）。正文渲染策略（见 ArticleBody）：
 * - milkdown：走 @mo-gallery/milkdown 的只读 Markdown 渲染器
 *   （ReactMarkdown 管线，不渲染裸 HTML，即共享净化管线）；
 * - tiptap：走 TiptapJsonView 的结构化 JSON 渲染（不消费 HTML 字符串）；
 *   宿主必须提供 `tiptapContentJson`——仅有 HTML 存量时正文不可渲染，
 *   只展示标题/摘要（渲染器不做 HTML 注入兜底）。
 *
 * 正文容器固定挂 `story-rich-content` 类：web-theme.css 按该类提供
 * story 正文排版（中文栈、1.125rem/1.95、clamp 标题、软圆角 link-card 等），
 * 与 web 宿主（PublicArticleBody）的类名约定一致。
 */
export const ArticleView = memo(function ArticleView({
  username,
  article,
  resolver,
  links,
  labels,
  onOpenPhoto,
  photos,
  backHref,
  coverUrl,
  sidebar,
}: ArticleViewProps) {
  const editorType = article.contentRef.editorType
  const isMilkdown = editorType === 'milkdown'
  const dateLabel = formatDate(article.publishedAt ?? article.storyDate ?? article.createdAt)

  const backLink = backHref ?? links.articleIndex?.(username, article.kind ?? 'blog')

  const metaLine = [
    article.kind ?? labels.navBlog,
    dateLabel,
    article.category,
    ...(article.tags ?? []),
  ].filter(Boolean).join(' · ')

  const body = (
    <ArticleBody
      articleId={article.id}
      editorType={editorType}
      tiptapContent={article.tiptapContent}
      tiptapContentJson={article.tiptapContentJson}
      milkContent={article.milkContent}
      resolver={resolver}
      photos={photos}
      onOpenPhoto={onOpenPhoto}
      className="story-rich-content"
    />
  )

  const fallbackSummary = !isMilkdown && !article.tiptapContentJson && article.summary ? (
    <p className="mt-6 text-base leading-relaxed text-muted-foreground">{article.summary}</p>
  ) : null

  return (
    <article className="mx-auto max-w-3xl psw-enter">
      {/* story 全屏封面 header（cover 40% + 双遮罩，web story/[id] 规格） */}
      {coverUrl ? (
        <header className="relative isolate -mx-4 mb-10 overflow-hidden bg-zinc-950 px-4 pb-16 pt-40 text-white sm:-mx-6 md:-mx-10 md:px-10">
          <div className="absolute inset-0" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverUrl}
              alt=""
              className="h-full w-full object-cover opacity-40"
              loading="eager"
              decoding="async"
            />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.7)_100%)]" />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
          </div>
          <div className="relative">
            <h1 className="font-serif text-3xl font-light tracking-tight md:text-5xl">{article.title}</h1>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-white/70">{metaLine}</p>
          </div>
        </header>
      ) : (
        <header className="mb-10">
          {backLink ? (
            <a
              href={backLink}
              className="mb-6 inline-block text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
            >
              ← {labels.back}
            </a>
          ) : null}
          <h1 className="font-serif text-3xl font-light tracking-tight md:text-4xl">{article.title}</h1>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground/60">
            {metaLine}
          </p>
        </header>
      )}
      {coverUrl && backLink ? (
        <a
          href={backLink}
          className="mb-6 inline-block text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          ← {labels.back}
        </a>
      ) : null}

      {sidebar ? (
        /* 12 栏 8+4 正文/侧栏（web story/[id] 布局能力） */
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-8">
            {body}
            {fallbackSummary}
          </div>
          <aside className="lg:col-span-4">{sidebar}</aside>
        </div>
      ) : (
        <>
          {body}
          {fallbackSummary}
        </>
      )}
    </article>
  )
})
