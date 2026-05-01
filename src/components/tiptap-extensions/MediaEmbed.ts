import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import MediaEmbedNodeView from './MediaEmbedNodeView'

export const MediaEmbed = Node.create({
  name: 'mediaEmbed',
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
      src: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-src') || '',
        renderHTML: (attributes) => attributes.src ? { 'data-src': attributes.src } : {},
      },
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-title') || '',
        renderHTML: (attributes) => attributes.title ? { 'data-title': attributes.title } : {},
      },
      height: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-height') || '',
        renderHTML: (attributes) => attributes.height ? { 'data-height': attributes.height } : {},
      },
      allow: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-allow') || '',
        renderHTML: (attributes) => attributes.allow ? { 'data-allow': attributes.allow } : {},
      },
      allowFullScreen: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-allowfullscreen') === 'true',
        renderHTML: (attributes) => attributes.allowFullScreen ? { 'data-allowfullscreen': 'true' } : {},
      },
      frameBorder: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-frameborder') || '',
        renderHTML: (attributes) => attributes.frameBorder ? { 'data-frameborder': attributes.frameBorder } : {},
      },
      marginWidth: {
        default: null,
        parseHTML: (element) => {
          const value = element.getAttribute('data-marginwidth')
          return value ? Number.parseInt(value, 10) : null
        },
        renderHTML: (attributes) => attributes.marginWidth !== null && attributes.marginWidth !== undefined ? { 'data-marginwidth': String(attributes.marginWidth) } : {},
      },
      marginHeight: {
        default: null,
        parseHTML: (element) => {
          const value = element.getAttribute('data-marginheight')
          return value ? Number.parseInt(value, 10) : null
        },
        renderHTML: (attributes) => attributes.marginHeight !== null && attributes.marginHeight !== undefined ? { 'data-marginheight': String(attributes.marginHeight) } : {},
      },
      scrolling: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-scrolling') || '',
        renderHTML: (attributes) => attributes.scrolling ? { 'data-scrolling': attributes.scrolling } : {},
      },
      border: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-border') || '',
        renderHTML: (attributes) => attributes.border ? { 'data-border': attributes.border } : {},
      },
      frameSpacing: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-framespacing') || '',
        renderHTML: (attributes) => attributes.frameSpacing ? { 'data-framespacing': attributes.frameSpacing } : {},
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="media-embed"]',
      },
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
    return ['div', mergeAttributes({ 'data-type': 'media-embed' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaEmbedNodeView)
  },
})

export default MediaEmbed
