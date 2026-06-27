'use client'

import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { resolveStoredMediaEmbedInfo } from '@/lib/media-embed'

export function MediaEmbedNodeView({ node, selected }: ReactNodeViewProps) {
  const embedInfo = resolveStoredMediaEmbedInfo(node.attrs)

  if (!embedInfo) {
    return (
      <NodeViewWrapper
        className="media-embed-node media-embed-node--invalid"
        data-type="media-embed"
        data-selected={selected ? 'true' : undefined}
      >
        <div className="media-embed-node__fallback">Invalid media embed</div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper
      className="media-embed-node"
      data-type="media-embed"
      data-provider={embedInfo.provider}
      data-selected={selected ? 'true' : undefined}
    >
      <iframe
        className="media-embed-node__frame"
        src={embedInfo.src}
        title={embedInfo.title}
        width="100%"
        height={embedInfo.height}
        frameBorder={embedInfo.frameBorder}
        marginWidth={embedInfo.marginWidth}
        marginHeight={embedInfo.marginHeight}
        allow={embedInfo.allow}
        loading="lazy"
        scrolling={embedInfo.scrolling}
        allowFullScreen={embedInfo.allowFullScreen}
        style={embedInfo.provider === 'spotify' ? { borderRadius: '12px' } : undefined}
      />
    </NodeViewWrapper>
  )
}

export default MediaEmbedNodeView
