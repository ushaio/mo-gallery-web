'use client'

import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { parseMusicEmbedInfoByProvider } from '@/lib/music-embed'

export function MusicEmbedNodeView({ node, selected }: ReactNodeViewProps) {
  const url = typeof node.attrs.url === 'string' ? node.attrs.url : ''
  const provider = typeof node.attrs.provider === 'string' ? node.attrs.provider : ''
  const embedInfo = parseMusicEmbedInfoByProvider(provider, url)

  if (!embedInfo) {
    return (
      <NodeViewWrapper
        className="music-embed-node music-embed-node--invalid"
        data-type="music-embed"
        data-selected={selected ? 'true' : undefined}
      >
        <div className="music-embed-node__fallback">Invalid music link</div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper
      className="music-embed-node"
      data-type="music-embed"
      data-provider={embedInfo.provider}
      data-selected={selected ? 'true' : undefined}
    >
      <iframe
        className="music-embed-node__frame"
        src={embedInfo.embedUrl}
        title={embedInfo.title}
        width="100%"
        height={embedInfo.height}
        frameBorder={embedInfo.frameBorder}
        marginWidth={embedInfo.marginWidth}
        marginHeight={embedInfo.marginHeight}
        allow={embedInfo.allow}
        loading="lazy"
        allowFullScreen={embedInfo.allowFullScreen}
        style={embedInfo.provider === 'spotify' ? { borderRadius: '12px' } : undefined}
      />
    </NodeViewWrapper>
  )
}

export default MusicEmbedNodeView
