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

export interface MilkdownContentProps {
  content: string
  className?: string
  resolveMediaUrl?: MediaUrlResolver
  onPhotoClick?: (photoId: string) => void
  language?: 'zh' | 'en'
}

/** A read-only Markdown renderer; importing it does not load Crepe or ProseMirror. */
export function MilkdownContent({ content, className = '', resolveMediaUrl, onPhotoClick, language }: MilkdownContentProps) {
  return (
    <div className={`milkdown-content ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkDirective, remarkMediaCards, remarkTextStyles, remarkBlockStyles]} components={{
        figure: ({ node, children }) => {
          const data = node?.properties?.dataMilkdownMedia ?? node?.properties?.['data-milkdown-media']
          if (typeof data !== 'string') return <figure>{children}</figure>
          try {
            return <MediaCard media={normalizeMedia(JSON.parse(data))} resolveUrl={resolveMediaUrl} onPhotoClick={onPhotoClick} language={language} />
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
