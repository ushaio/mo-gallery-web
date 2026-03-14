import type { Editor } from '@tiptap/core'
import { ResizableNodeView } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import Image from '@tiptap/extension-image'

function applyImageAlignmentStyles(element: HTMLElement, align: string | null | undefined) {
  const normalizedAlign = align || null
  element.setAttribute('data-align', normalizedAlign ?? 'left')

  if (normalizedAlign === 'center') {
    element.style.marginLeft = 'auto'
    element.style.marginRight = 'auto'
  } else if (normalizedAlign === 'right') {
    element.style.marginLeft = 'auto'
    element.style.marginRight = '0'
  } else {
    element.style.marginLeft = '0'
    element.style.marginRight = '0'
  }
}

function applyImageContainerStyles(element: HTMLElement, align: string | null | undefined) {
  element.style.width = 'fit-content'
  element.style.maxWidth = '100%'
  applyImageAlignmentStyles(element, align)
}

function parsePixelValue(value: string | null): number | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  const pxMatch = trimmed.match(/^(\d+(?:\.\d+)?)px$/i)
  if (pxMatch) {
    const parsed = Number.parseFloat(pxMatch[1])
    return Number.isFinite(parsed) ? parsed : null
  }

  const numeric = Number.parseFloat(trimmed)
  return Number.isFinite(numeric) ? numeric : null
}

function parseSizeFromStyle(element: HTMLElement, property: 'width' | 'height'): number | null {
  const inlineValue = element.style[property]
  const fromInline = parsePixelValue(inlineValue)
  if (fromInline != null) {
    return fromInline
  }

  const styleAttribute = element.getAttribute('style')
  if (!styleAttribute) {
    return null
  }

  const regex = new RegExp(`${property}\s*:\s*(\d+(?:\.\d+)?)px`, 'i')
  const match = styleAttribute.match(regex)
  if (!match) {
    return null
  }

  const parsed = Number.parseFloat(match[1])
  return Number.isFinite(parsed) ? parsed : null
}

function selectImageNode(editor: Editor, getPos: () => number | undefined) {
  const pos = getPos()
  if (pos === undefined) {
    return
  }

  editor.chain().focus().setNodeSelection(pos).run()
}

function applyImageSelectionStyles(container: HTMLElement, imageElement: HTMLElement, selected: boolean) {
  container.toggleAttribute('data-selected', selected)
  container.classList.toggle('ProseMirror-selectednode', selected)
  imageElement.toggleAttribute('data-selected', selected)
}

function applyImageDimensions(imageElement: HTMLElement, width: number | null) {
  if (width) {
    imageElement.style.width = `${width}px`
    imageElement.setAttribute('width', String(width))
  } else {
    imageElement.style.removeProperty('width')
    imageElement.removeAttribute('width')
  }

  // Always let the browser derive height from the intrinsic image ratio.
  imageElement.style.removeProperty('height')
  imageElement.removeAttribute('height')
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const widthAttr = parsePixelValue(element.getAttribute('width'))
          if (widthAttr != null) {
            return widthAttr
          }

          return parseSizeFromStyle(element, 'width')
        },
        renderHTML: (attributes) => {
          if (!attributes.width) {
            return {}
          }

          return {
            width: attributes.width,
          }
        },
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const heightAttr = parsePixelValue(element.getAttribute('height'))
          if (heightAttr != null) {
            return heightAttr
          }

          return parseSizeFromStyle(element, 'height')
        },
        renderHTML: (attributes) => {
          if (!attributes.height) {
            return {}
          }

          return {
            height: attributes.height,
          }
        },
      },
      align: {
        default: null,
        parseHTML: (element) => {
          return element.getAttribute('data-align') || null
        },
        renderHTML: (attributes) => {
          if (!attributes.align) {
            return {}
          }
          return {
            'data-align': attributes.align,
          }
        },
      },
    }
  },

  addNodeView() {
    if (!this.options.resize || !this.options.resize.enabled || typeof document === 'undefined') {
      return null
    }

    const { directions, minWidth, minHeight, alwaysPreserveAspectRatio } = this.options.resize

    return ({ node, getPos, HTMLAttributes, editor }) => {
      const imageElement = document.createElement('img')

      Object.entries(HTMLAttributes).forEach(([key, value]) => {
        if (value == null || key === 'width' || key === 'height') {
          return
        }

        imageElement.setAttribute(key, String(value))
      })

      const imageSrc = String(HTMLAttributes.src ?? '')

      const syncImageState = (attrs: Record<string, unknown>, container?: HTMLElement) => {
        const width = typeof attrs.width === 'number' ? attrs.width : null
        const align = typeof attrs.align === 'string' ? attrs.align : null

        applyImageDimensions(imageElement, width)
        applyImageAlignmentStyles(imageElement, align)

        if (container) {
          applyImageContainerStyles(container, align)
          const wrapper = container.querySelector('[data-resize-wrapper]')
          if (wrapper instanceof HTMLElement) {
            applyImageContainerStyles(wrapper, align)
          }
        }
      }

      syncImageState(node.attrs as Record<string, unknown>)

      const nodeView = new ResizableNodeView({
        element: imageElement,
        editor,
        node,
        getPos,
        onResize: (width) => {
          applyImageDimensions(imageElement, width)
        },
        onCommit: (width) => {
          const pos = getPos()

          if (pos === undefined) {
            return
          }

          this.editor
            .chain()
            .setNodeSelection(pos)
            .updateAttributes(this.name, { width, height: null })
            .run()
        },
        onUpdate: (updatedNode) => {
          if (updatedNode.type !== node.type) {
            return false
          }

          return true
        },
        options: {
          directions,
          min: {
            width: minWidth,
            height: minHeight,
          },
          preserveAspectRatio: alwaysPreserveAspectRatio === true,
        },
      })
      const selectableNodeView = nodeView as ResizableNodeView & {
        selectNode?: () => void
        deselectNode?: () => void
      }

      const dom = nodeView.dom as HTMLElement
      syncImageState(node.attrs as Record<string, unknown>, dom)
      applyImageSelectionStyles(dom, imageElement, false)

      const syncSelectionState = () => {
        const pos = getPos()
        const selection = editor.state.selection
        const isSelected = pos !== undefined
          && selection instanceof NodeSelection
          && selection.from === pos

        applyImageSelectionStyles(dom, imageElement, isSelected)
      }

      const handleSelect = (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        selectImageNode(editor, getPos)
        requestAnimationFrame(syncSelectionState)
      }

      imageElement.addEventListener('mousedown', handleSelect)
      dom.addEventListener('mousedown', handleSelect)
      editor.on('selectionUpdate', syncSelectionState)

      const revealNodeView = () => {
        dom.style.visibility = ''
        dom.style.pointerEvents = ''
      }

      dom.style.visibility = 'hidden'
      dom.style.pointerEvents = 'none'
      imageElement.onload = revealNodeView
      imageElement.src = imageSrc

      if (imageElement.complete) {
        revealNodeView()
      }

      syncSelectionState()

      const originalUpdate = nodeView.update.bind(nodeView)

      nodeView.update = (updatedNode, decorations, innerDecorations) => {
        const didUpdate = originalUpdate(updatedNode, decorations, innerDecorations)

        if (didUpdate) {
          syncImageState(updatedNode.attrs as Record<string, unknown>, dom)
          syncSelectionState()
        }

        return didUpdate
      }

      selectableNodeView.selectNode = () => {
        applyImageSelectionStyles(dom, imageElement, true)
      }

      selectableNodeView.deselectNode = () => {
        applyImageSelectionStyles(dom, imageElement, false)
      }

      const originalDestroy = nodeView.destroy.bind(nodeView)
      nodeView.destroy = () => {
        imageElement.removeEventListener('mousedown', handleSelect)
        dom.removeEventListener('mousedown', handleSelect)
        editor.off('selectionUpdate', syncSelectionState)
        originalDestroy()
      }

      return nodeView
    }
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setImageAlign: (align: string) => ({
        commands,
      }: {
        commands: {
          updateAttributes: (typeOrName: string, attributes: Record<string, unknown>) => boolean
        }
      }) => {
        return commands.updateAttributes('image', { align })
      },
    }
  },
})

export default ResizableImage
