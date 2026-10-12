'use client'

import ReactMarkdown from 'react-markdown'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import { MediaCard } from './MediaCard'
import { mediaFromAttributes, normalizeMedia, safeMediaUrl, walkMarkdown } from './media'
import type { MarkdownTree, MediaUrlResolver } from './media'
import { remarkTextStyles } from './text-style'
import { remarkBlockStyles } from './block-style'
import './content.css'

function remarkMediaCards() {
  return (tree: MarkdownTree) => {
    walkMarkdown(tree, (node) => {
      if (node.type !== 'leafDirective' || node.name !== 'media') return
      node.data = {
        ...node.data,
        hName: 'figure',
        hProperties: { 'data-milkdown-media': JSON.stringify(mediaFromAttributes(node.attributes)) },
      }
    })
  }
}

/** 只有换行标签本身的词元（`<br>` / `<br/>` / `<br />`，大小写不敏感）。 */
const BR_ONLY_PATTERN = /^<br\s*\/?>$/i
/** 文本里夹着的换行标签词元（split 用捕获组 ⇒ 结果偶数下标是文本、奇数下标是标签）。 */
const BR_SPLIT_PATTERN = /(<br\s*\/?>)/i
/** 子节点按「块」排版的容器：只影响独占一行的 `<br />` 该不该补一层段落。 */
const BLOCK_CONTAINERS = new Set(['root', 'blockquote', 'listItem', 'footnoteDefinition'])

/**
 * `<br>` 词元 → 硬换行（mdast `break`，渲染出来就是 `<br>`）。
 *
 * 正文里的 `<br />` 有三种来源，这里都按语义认：
 *  - **Milkdown 的空段落方言（主因）**：编辑器把空段落序列化成独占一行的 `<br />`（作者在编辑器里
 *    敲出的空行，回来就是这个词元），解析回来仍是空段落 ⇒ 编辑器看着完全正常；只有只读渲染器
 *    （react-markdown，刻意不开 rehype-raw）把它原样当文本输出，页面上就出现字面「<br />」。
 *    独占一行时它在 mdast 里是**块级** html 节点 ⇒ 补一层段落，渲染成一个空段落，与编辑器的空行一致。
 *  - 混在段落里的**行内** `<br />`（同样是 html 节点，但落在段落里）⇒ 换成一次换行。这种形态在
 *    编辑器里会被丢掉（PM schema 里没有 html 节点，只有整块的会被解析成空段落），所以只可能来自
 *    没被编辑器重新保存过的内容。
 *  - **转义形态** `&lt;br /&gt;`（从 HTML 源粘进来，如模型回答 / 网页纯文本）⇒ 普通 `text` 节点、
 *    值为字面 `<br />` ⇒ 同样换成换行。
 * 其余行内 HTML 不认（保持原文显示，不引 rehype-raw）；代码块（`code`）与行内代码（`inlineCode`）里的
 * `<br />` 是正文内容，一律不动。
 */
function remarkHardBreaks() {
  return (tree: MarkdownTree) => { tree.children = rewriteBreakTokens(tree.children ?? [], true) }
}

function rewriteBreakTokens(children: MarkdownTree[], block: boolean): MarkdownTree[] {
  return children.flatMap((node) => {
    if (node.type === 'html' && BR_ONLY_PATTERN.test((node.value ?? '').trim())) {
      const hardBreak: MarkdownTree = { type: 'break' }
      // 独占一行时它在 mdast 里是块级 html 节点：raw 的 `break` 不能当块用，补一层段落
      return block ? [{ type: 'paragraph', children: [hardBreak] }] : [hardBreak]
    }
    if (node.children) node.children = rewriteBreakTokens(node.children, BLOCK_CONTAINERS.has(node.type))
    if (node.type !== 'text' || !node.value || !BR_SPLIT_PATTERN.test(node.value)) return [node]
    return node.value.split(BR_SPLIT_PATTERN).flatMap((piece, index) => {
      if (!piece) return []
      return index % 2 ? [{ type: 'break' }] : [{ ...node, value: piece }]
    })
  })
}

export interface MilkdownContentProps {
  content: string
  className?: string
  resolveMediaUrl?: MediaUrlResolver
  /**
   * 按 uploadId 现取占位卡的本地预览图（blob: / 本地资源库缩略图）。
   *
   * 与编辑器（`media-plugin.tsx` 的 `MediaViewOptions.resolveUploadPreview`）同一口径：
   * 这两类 URL 都是会话级的，刻意不落进文档，只读渲染时现查一次，
   * 否则只读预览里的待上传卡片会退化成「待上传，保存时会一并上传」的文字占位。
   */
  resolveUploadPreview?: (uploadId: string) => string | undefined
  /**
   * 是否显示上传状态浮层（待上传 / 上传中 / 失败）。**预览与发布侧传 false**：
   * 待上传项按正式图片渲染，只读页面上不出现「还没上传」这类内部状态。
   */
  showUploadStatus?: boolean
  onPhotoClick?: (photoId: string) => void
  language?: 'zh' | 'en'
}

/** A read-only Markdown renderer; importing it does not load Crepe or ProseMirror. */
export function MilkdownContent({ content, className = '', resolveMediaUrl, resolveUploadPreview, showUploadStatus, onPhotoClick, language }: MilkdownContentProps) {
  return (
    <div className={`milkdown-content ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkDirective, remarkHardBreaks, remarkMediaCards, remarkTextStyles, remarkBlockStyles]} components={{
        figure: ({ node, children }) => {
          const data = node?.properties?.dataMilkdownMedia ?? node?.properties?.['data-milkdown-media']
          if (typeof data !== 'string') return <figure>{children}</figure>
          try {
            const media = normalizeMedia(JSON.parse(data))
            return <MediaCard
              media={media}
              resolveUrl={resolveMediaUrl}
              // 占位卡与拼图里的待传格都没有 src，靠 uploadId 现取本地预览图（与编辑器渲染同口径）
              resolveUploadPreview={resolveUploadPreview}
              showUploadStatus={showUploadStatus}
              onPhotoClick={onPhotoClick}
              language={language}
            />
          } catch { return null }
        },
        img: ({ src, alt }) => {
          const raw = typeof src === 'string' ? src : ''
          const url = safeMediaUrl(resolveMediaUrl?.(raw) ?? raw)
          return url ? <img src={url} alt={alt ?? ''} loading="lazy" /> : <span>{alt}</span>
        },
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
      }}>{content}</ReactMarkdown>
    </div>
  )
}
