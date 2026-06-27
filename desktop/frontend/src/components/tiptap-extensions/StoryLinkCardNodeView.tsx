'use client'

import { CalendarDays, ExternalLink } from 'lucide-react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'

function formatDate(value: unknown) {
  if (typeof value !== 'string' || !value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function StoryLinkCardNodeView({ node, selected }: ReactNodeViewProps) {
  const title = typeof node.attrs.title === 'string' ? node.attrs.title : ''
  const summary = typeof node.attrs.summary === 'string' ? node.attrs.summary : ''
  const coverUrl = typeof node.attrs.coverUrl === 'string' ? node.attrs.coverUrl : ''
  const url = typeof node.attrs.url === 'string' ? node.attrs.url : ''
  const date = formatDate(node.attrs.date)
  const isPublished = node.attrs.isPublished !== false

  return (
    <NodeViewWrapper
      className="story-link-card-node"
      data-type="story-link-card"
      data-selected={selected ? 'true' : undefined}
    >
      {coverUrl ? (
        <img className="story-link-card-node__cover" src={coverUrl} alt="" draggable={false} />
      ) : null}
      <div className="story-link-card-node__body">
        <div className="story-link-card-node__eyebrow">
          <span>Story</span>
          {!isPublished ? <span>Draft</span> : null}
        </div>
        <div className="story-link-card-node__title">{title || 'Untitled story'}</div>
        {summary ? <div className="story-link-card-node__summary">{summary}</div> : null}
        <div className="story-link-card-node__meta">
          {date ? (
            <span>
              <CalendarDays className="h-3.5 w-3.5" />
              {date}
            </span>
          ) : null}
          {url ? (
            <span>
              <ExternalLink className="h-3.5 w-3.5" />
              Story link
            </span>
          ) : null}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

export default StoryLinkCardNodeView
