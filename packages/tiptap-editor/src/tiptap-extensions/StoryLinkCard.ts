import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import StoryLinkCardNodeView from './StoryLinkCardNodeView'

export const StoryLinkCard = Node.create({
  name: 'storyLinkCard',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      storyId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-story-id') || '',
        renderHTML: (attributes) => attributes.storyId ? { 'data-story-id': attributes.storyId } : {},
      },
      url: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-url') || '',
        renderHTML: (attributes) => attributes.url ? { 'data-url': attributes.url } : {},
      },
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-title') || '',
        renderHTML: (attributes) => attributes.title ? { 'data-title': attributes.title } : {},
      },
      summary: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-summary') || '',
        renderHTML: (attributes) => attributes.summary ? { 'data-summary': attributes.summary } : {},
      },
      coverUrl: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-cover-url') || '',
        renderHTML: (attributes) => attributes.coverUrl ? { 'data-cover-url': attributes.coverUrl } : {},
      },
      date: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-date') || '',
        renderHTML: (attributes) => attributes.date ? { 'data-date': attributes.date } : {},
      },
      isPublished: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-published') !== 'false',
        renderHTML: (attributes) => attributes.isPublished === false ? { 'data-published': 'false' } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="story-link-card"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const href = HTMLAttributes['data-url'] || HTMLAttributes.url || '#'
    return ['div', mergeAttributes({ 'data-type': 'story-link-card', 'data-url': href }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(StoryLinkCardNodeView)
  },
})

export default StoryLinkCard
