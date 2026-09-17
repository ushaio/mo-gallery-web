import { mergeAttributes, Node } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'

export type ImageUploadPlaceholderState = 'loading' | 'failed'

function positiveNumber(value: unknown, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const ImageUploadPlaceholder = Node.create({
  name: 'imageUploadPlaceholder',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      uploadId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-upload-id') || '',
        renderHTML: (attributes) => ({ 'data-upload-id': attributes.uploadId }),
      },
      fileName: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-file-name') || '',
        renderHTML: (attributes) => ({ 'data-file-name': attributes.fileName }),
      },
      imageWidth: {
        default: 4,
        parseHTML: (element) => positiveNumber(element.getAttribute('data-image-width'), 4),
        renderHTML: (attributes) => ({ 'data-image-width': attributes.imageWidth }),
      },
      imageHeight: {
        default: 3,
        parseHTML: (element) => positiveNumber(element.getAttribute('data-image-height'), 3),
        renderHTML: (attributes) => ({ 'data-image-height': attributes.imageHeight }),
      },
      displayWidth: {
        default: 480,
        parseHTML: (element) => positiveNumber(element.getAttribute('data-display-width'), 480),
        renderHTML: (attributes) => ({ 'data-display-width': attributes.displayWidth }),
      },
      state: {
        default: 'loading' satisfies ImageUploadPlaceholderState,
        parseHTML: (element) => element.getAttribute('data-state') === 'failed' ? 'failed' : 'loading',
        renderHTML: (attributes) => ({ 'data-state': attributes.state }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-image-upload-placeholder]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-image-upload-placeholder': '' })]
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('span')
      dom.className = 'tiptap-image-upload-placeholder'
      dom.contentEditable = 'false'
      dom.setAttribute('role', 'img')

      const sync = (attrs: Record<string, unknown>) => {
        const imageWidth = positiveNumber(attrs.imageWidth, 4)
        const imageHeight = positiveNumber(attrs.imageHeight, 3)
        const displayWidth = positiveNumber(attrs.displayWidth, 480)
        const state: ImageUploadPlaceholderState = attrs.state === 'failed' ? 'failed' : 'loading'
        const fileName = String(attrs.fileName || '')

        dom.dataset.state = state
        dom.style.width = `${displayWidth}px`
        dom.style.aspectRatio = `${imageWidth} / ${imageHeight}`
        dom.setAttribute('aria-label', state === 'failed' ? `${fileName} upload failed` : `${fileName} uploading`)
      }

      const selectNode = (event: MouseEvent) => {
        event.preventDefault()
        const pos = getPos()
        if (pos === undefined) return
        editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)))
      }

      sync(node.attrs as Record<string, unknown>)
      dom.addEventListener('mousedown', selectNode)

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type !== node.type) return false
          sync(updatedNode.attrs as Record<string, unknown>)
          return true
        },
        selectNode: () => dom.setAttribute('data-selected', 'true'),
        deselectNode: () => dom.removeAttribute('data-selected'),
        destroy: () => dom.removeEventListener('mousedown', selectNode),
      }
    }
  },
})

export default ImageUploadPlaceholder
