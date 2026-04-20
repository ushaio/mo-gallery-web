import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import MusicEmbedNodeView from './MusicEmbedNodeView'

export const MusicEmbed = Node.create({
  name: 'musicEmbed',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      provider: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-provider') || '',
        renderHTML: (attributes) => attributes.provider ? { 'data-provider': attributes.provider } : {},
      },
      url: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-url') || '',
        renderHTML: (attributes) => attributes.url ? { 'data-url': attributes.url } : {},
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="music-embed"]',
      },
      {
        tag: 'div[data-type="spotify-embed"]',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) {
            return false
          }

          return {
            provider: 'spotify',
            url: element.getAttribute('data-url') || '',
          }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'music-embed' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MusicEmbedNodeView)
  },
})

export default MusicEmbed
