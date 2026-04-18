import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import SpotifyEmbedNodeView from './SpotifyEmbedNodeView'

export const SpotifyEmbed = Node.create({
  name: 'spotifyEmbed',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      url: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-url') || '',
        renderHTML: (attributes) => {
          if (!attributes.url) {
            return {}
          }

          return {
            'data-url': attributes.url,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="spotify-embed"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'spotify-embed' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(SpotifyEmbedNodeView)
  },
})

export default SpotifyEmbed
