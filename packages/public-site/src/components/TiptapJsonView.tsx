'use client'

import { Fragment, memo, type CSSProperties, type ReactNode } from 'react'

import type { TiptapJsonNode } from '@mo-gallery/content-core'
import { resolveStoredMediaEmbedInfo } from '@mo-gallery/tiptap-editor/media-embed'
import { contentBlockStyle, contentInlineStyle } from '@mo-gallery/tiptap-editor/content-style'

/**
 * TipTap JSON → React 的结构化渲染器（访客侧安全管线）。
 *
 * 不消费 HTML 字符串、不走 dangerouslySetInnerHTML：未知节点/标记一律
 * 降级为纯文本容器或忽略，杜绝多用户托管场景下的注入面。图片等资源
 * 引用经 `resolveAssetUrl` 换算为访客可访问地址。
 *
 * W1（mo-cloud-parity-plan）起补充编辑器自定义节点的只读渲染，保证
 * TipTap 正文在访客侧与编辑端一致：`image`（photoId/width/align）、
 * `imageGroup`、`mediaEmbed`（经 @mo-gallery/tiptap-editor 的白名单
 * 解析，仅输出 Spotify/网易云等受控 embed 地址）、`storyLinkCard`
 * （站内引用经 `resolveInternalHref` 换算宿主路由）。未知节点仍降级。
 */

export interface TiptapJsonViewProps {
  doc: TiptapJsonNode
  /** 相对资源引用 → 访客可访问 URL；不传时相对引用按原样输出。 */
  resolveAssetUrl?: (rawUrl: string) => string
  /** 正文内嵌照片（photoId）→ 访客可访问 URL；缺席时回落 resolveAssetUrl(rawUrl)。 */
  resolvePhotoUrl?: (photoId: string, rawUrl: string) => string
  /** 正文内嵌照片点击回调（如打开灯箱）；仅携带 photoId 的图片触发。 */
  onPhotoClick?: (photoId: string) => void
  /** 站内引用（storyLinkCard 的 data-url 等）→ 宿主路由地址。 */
  resolveInternalHref?: (rawHref: string) => string
  className?: string
  strict?: boolean
}

interface RenderContext {
  resolveAssetUrl?: (rawUrl: string) => string
  resolvePhotoUrl?: (photoId: string, rawUrl: string) => string
  onPhotoClick?: (photoId: string) => void
  resolveInternalHref?: (rawHref: string) => string
  strict?: boolean
}

function isSafeUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim()
  if (/^(https?:\/\/|\/|#|mailto:)/i.test(trimmed)) return true
  // 相对引用（无协议、无前导斜杠）也放行，由 resolveAssetUrl 决定最终地址。
  return !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)
}

function resolveUrl(rawUrl: unknown, resolveAssetUrl?: (rawUrl: string) => string): string | null {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') return null
  const trimmed = rawUrl.trim()
  if (!isSafeUrl(trimmed)) return null
  const resolved = resolveAssetUrl ? resolveAssetUrl(trimmed) : trimmed
  return isSafeUrl(resolved) || (resolveAssetUrl && resolved.startsWith('blob:')) ? resolved : null
}

function attrString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function attrNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function renderMarks(text: string, marks: TiptapJsonNode['marks'], keyPrefix: string, strict?: boolean): ReactNode {
  if (!marks || marks.length === 0) return text

  return marks.reduceRight<ReactNode>((children, mark, index) => {
    const key = `${keyPrefix}-m${index}`
    switch (mark.type) {
      case 'bold':
        return <strong key={key}>{children}</strong>
      case 'italic':
        return <em key={key}>{children}</em>
      case 'underline':
        return <u key={key}>{children}</u>
      case 'strike':
        return <s key={key}>{children}</s>
      case 'code':
        return <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
      case 'textStyle':
      case 'pastedStyle':
        return <span key={key} style={contentInlineStyle(mark.attrs)}>{children}</span>
      case 'link': {
        const href = resolveUrl(mark.attrs?.href, undefined)
        if (!href) {
          if (strict) throw new Error('叙事中的链接地址无效。')
          return children
        }
        return (
          <a key={key} href={href} target="_blank" rel="noreferrer noopener">
            {children}
          </a>
        )
      }
      default:
        if (strict) throw new Error(`暂不支持叙事文字格式（${mark.type}）。`)
        return children
    }
  }, text)
}

function renderImage(node: TiptapJsonNode, context: RenderContext, key: string): ReactNode {
  const photoId = attrString(node.attrs?.photoId)
  const rawSrc = attrString(node.attrs?.src) ?? ''
  let src: string | null = null
  if (photoId && context.resolvePhotoUrl) {
    const resolved = context.resolvePhotoUrl(photoId, rawSrc)
    src = resolved && (isSafeUrl(resolved) || resolved.startsWith('blob:')) ? resolved : null
    if (!src && context.strict) throw new Error('这篇叙事引用的照片无法读取。')
  }
  if (!src) {
    src = resolveUrl(node.attrs?.src, context.resolveAssetUrl)
  }
  if (!src) {
    if (context.strict) throw new Error('叙事中的图片地址缺失或无效。')
    return null
  }
  const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''
  const width = attrNumber(node.attrs?.width)
  const align = attrString(node.attrs?.align) ?? attrString(node.attrs?.['data-align'])
  const style: CSSProperties = {
    display: 'inline-block',
    verticalAlign: 'top',
    maxWidth: '100%',
    height: 'auto',
    ...(width ? { width: `${Math.max(1, Math.round(width))}px` } : {}),
  }
  if (align === 'center' || align === 'right') {
    style.display = 'block'
    style.marginLeft = 'auto'
    style.marginRight = align === 'center' ? 'auto' : align === 'right' ? 0 : undefined
  }
  const clickable = Boolean(photoId && context.onPhotoClick)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={key}
      src={src}
      alt={alt}
      loading="lazy"
      data-photo-id={photoId}
      style={style}
      className={clickable ? 'cursor-zoom-in' : undefined}
      onClick={clickable ? () => context.onPhotoClick?.(photoId as string) : undefined}
    />
  )
}

function renderMediaEmbed(node: TiptapJsonNode, context: RenderContext, key: string): ReactNode {
  const attrs = node.attrs ?? {}
  const embedInfo = resolveStoredMediaEmbedInfo({
    provider: attrString(attrs.provider) ?? null,
    url: attrString(attrs.url) ?? null,
    src: attrString(attrs.src) ?? null,
    title: attrString(attrs.title) ?? null,
    height: attrString(attrs.height) ?? null,
    allow: attrString(attrs.allow) ?? null,
    allowFullScreen: attrs.allowFullScreen === true,
    frameBorder: attrString(attrs.frameBorder) ?? null,
    marginWidth: attrNumber(attrs.marginWidth) ?? null,
    marginHeight: attrNumber(attrs.marginHeight) ?? null,
    scrolling: attrString(attrs.scrolling) ?? null,
    border: attrString(attrs.border) ?? null,
    frameSpacing: attrString(attrs.frameSpacing) ?? null,
  })
  if (!embedInfo || !isSafeUrl(embedInfo.src)) {
    if (context.strict) throw new Error('叙事中的音视频嵌入无效或暂不支持。')
    return null
  }
  return (
    <div key={key} className="story-media-card" data-type="media-embed">
      <iframe
        src={embedInfo.src}
        title={embedInfo.title}
        width="100%"
        loading="lazy"
        allow={embedInfo.allow}
        allowFullScreen={embedInfo.allowFullScreen || undefined}
        frameBorder={embedInfo.frameBorder}
        height={embedInfo.height}
        scrolling={embedInfo.scrolling}
        style={embedInfo.provider === 'spotify' ? { borderRadius: '12px' } : undefined}
      />
    </div>
  )
}

function formatStoryCardDate(value: string | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function renderStoryLinkCard(node: TiptapJsonNode, context: RenderContext, key: string): ReactNode {
  const attrs = node.attrs ?? {}
  const storyId = attrString(attrs.storyId) ?? ''
  const rawUrl = attrString(attrs.url) ?? (storyId ? `/story/${storyId}` : '')
  if (!rawUrl) {
    if (context.strict) throw new Error('叙事链接卡缺少目标地址。')
    return null
  }
  const resolvedHref = context.resolveInternalHref ? context.resolveInternalHref(rawUrl) : rawUrl
  if (!resolvedHref || !isSafeUrl(resolvedHref)) {
    if (context.strict) throw new Error('叙事链接卡的目标地址无效。')
    return null
  }
  const title = attrString(attrs.title) ?? 'Untitled story'
  const summary = attrString(attrs.summary)
  const coverUrl = resolveUrl(attrs.coverUrl, context.resolveAssetUrl)
  if (context.strict && attrString(attrs.coverUrl) && !coverUrl) throw new Error('叙事链接卡的封面地址无效。')
  const dateLabel = formatStoryCardDate(attrString(attrs.date))
  const isPublished = attrs.published !== false

  return (
    <a key={key} className="story-link-card" data-type="story-link-card" href={resolvedHref} target="_blank" rel="noreferrer">
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="story-link-card__cover" src={coverUrl} alt="" loading="lazy" />
      ) : null}
      <span className="story-link-card__body">
        <span className="story-link-card__eyebrow">
          <span>Story</span>
          {isPublished ? null : <span>Draft</span>}
        </span>
        <span className="story-link-card__title">{title}</span>
        {summary ? <span className="story-link-card__summary">{summary}</span> : null}
        {dateLabel ? <span className="story-link-card__meta">{dateLabel}</span> : null}
      </span>
    </a>
  )
}

function renderNodes(nodes: TiptapJsonNode[] | undefined, context: RenderContext): ReactNode[] {
  if (!nodes || nodes.length === 0) return []
  return nodes.map((node, index) => renderNode(node, context, index))
}

function renderNode(node: TiptapJsonNode, context: RenderContext, index: number): ReactNode {
  const key = `n${index}`
  const children = renderNodes(node.content, context)

  switch (node.type) {
    case 'paragraph':
      return <p key={key} style={contentBlockStyle(node.attrs)}>{children}</p>
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6
      const Tag = `h${level}` as const
      return <Tag key={key} style={contentBlockStyle(node.attrs)}>{children}</Tag>
    }
    case 'bulletList':
      return <ul key={key}>{children}</ul>
    case 'orderedList':
      return <ol key={key} start={attrNumber(node.attrs?.start)}>{children}</ol>
    case 'listItem':
      return <li key={key} style={contentBlockStyle(node.attrs)}>{children}</li>
    case 'blockquote':
      return <blockquote key={key} style={contentBlockStyle(node.attrs)}>{children}</blockquote>
    case 'table':
      return <table key={key}><tbody>{children}</tbody></table>
    case 'tableRow':
      return <tr key={key}>{children}</tr>
    case 'tableCell':
    case 'tableHeader': {
      const Cell = node.type === 'tableHeader' ? 'th' : 'td'
      const widths = Array.isArray(node.attrs?.colwidth) ? node.attrs.colwidth : []
      const width = widths.every((value) => typeof value === 'number' && value > 0)
        ? widths.reduce<number>((total, value) => total + Number(value), 0)
        : 0
      return <Cell key={key} colSpan={attrNumber(node.attrs?.colspan)} rowSpan={attrNumber(node.attrs?.rowspan)} style={width ? { width } : undefined}>{children}</Cell>
    }
    case 'codeBlock':
      return (
        <pre key={key}>
          <code>{node.content?.map((child) => child.text ?? '').join('\n')}</code>
        </pre>
      )
    case 'horizontalRule':
      return <hr key={key} />
    case 'hardBreak':
      return <br key={key} />
    case 'image':
      return renderImage(node, context, key)
    case 'imageGroup': {
      const align = attrString(node.attrs?.align) ?? attrString(node.attrs?.['data-align'])
      return (
        <div
          key={key}
          data-type="image-group"
          data-align={align}
          style={align === 'center' || align === 'right' ? { justifyContent: align === 'center' ? 'center' : 'flex-end' } : undefined}
        >
          {children}
        </div>
      )
    }
    case 'mediaEmbed':
      return renderMediaEmbed(node, context, key)
    case 'storyLinkCard':
      return renderStoryLinkCard(node, context, key)
    case 'text':
      return <Fragment key={key}>{renderMarks(node.text ?? '', node.marks, key, context.strict)}</Fragment>
    default:
      if (context.strict) throw new Error(`暂不支持叙事内容块（${node.type}）。`)
      // 未知节点：仅递归渲染子节点（无子节点则忽略），不输出其属性。
      return children.length > 0 ? <div key={key}>{children}</div> : null
  }
}

export const TiptapJsonView = memo(function TiptapJsonView({ doc, resolveAssetUrl, resolvePhotoUrl, onPhotoClick, resolveInternalHref, className, strict }: TiptapJsonViewProps) {
  const children = renderNodes(doc.content, { resolveAssetUrl, resolvePhotoUrl, onPhotoClick, resolveInternalHref, strict })
  if (children.length === 0) return null
  return <div className={className}>{children}</div>
})
