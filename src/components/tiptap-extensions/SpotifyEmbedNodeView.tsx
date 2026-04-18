'use client'

import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { parseSpotifyEmbedInfo } from '@/lib/spotify'

export function SpotifyEmbedNodeView({ node, selected }: ReactNodeViewProps) {
  const url = typeof node.attrs.url === 'string' ? node.attrs.url : ''
  const embedInfo = parseSpotifyEmbedInfo(url)

  if (!embedInfo) {
    return (
      <NodeViewWrapper
        className="spotify-embed-node spotify-embed-node--invalid"
        data-type="spotify-embed"
        data-selected={selected ? 'true' : undefined}
      >
        <div className="spotify-embed-node__fallback">Invalid Spotify link</div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper
      className="spotify-embed-node"
      data-type="spotify-embed"
      data-selected={selected ? 'true' : undefined}
      data-spotify-type={embedInfo.type}
    >
      <iframe
        className="spotify-embed-node__frame"
        src={embedInfo.embedUrl}
        height={embedInfo.height}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        allowFullScreen
      />
    </NodeViewWrapper>
  )
}

export default SpotifyEmbedNodeView
