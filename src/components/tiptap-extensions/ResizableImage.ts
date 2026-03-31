import type { Editor } from '@tiptap/core'
import { ResizableNodeView } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import Image from '@tiptap/extension-image'

function applyImageContainerStyles(element: HTMLElement, includeMargin = true) {
  element.style.display = 'inline-flex'
  element.style.verticalAlign = 'top'
  element.style.width = 'fit-content'
  element.style.maxWidth = '100%'
  if (includeMargin) {
    element.style.margin = '0 0.75rem 0.75rem 0'
  } else {
    element.style.margin = '0'
  }
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

  const regex = new RegExp(`${property}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, 'i')
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

/**
 * Create a floating size label element
 */
function createSizeLabel(): HTMLElement {
  const label = document.createElement('div')
  label.className = 'tiptap-image-size-label'
  label.style.cssText = `
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.75);
    color: white;
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 12px;
    font-family: ui-monospace, monospace;
    pointer-events: none;
    z-index: 1000;
    opacity: 0;
    transition: opacity 0.15s ease;
  `
  return label
}

/**
 * Update the size label position and content
 */
function updateSizeLabel(label: HTMLElement, width: number, height: number | null, imageElement: HTMLElement) {
  const rect = imageElement.getBoundingClientRect()

  // Calculate actual rendered height if not provided
  const displayHeight = height ?? Math.round(rect.height)

  label.textContent = `${Math.round(width)} × ${displayHeight}`
  label.style.opacity = '1'

  // Position above the image
  label.style.top = `${rect.top - 32}px`
  label.style.left = `${rect.left + rect.width / 2}px`
}

/**
 * Hide the size label
 */
function hideSizeLabel(label: HTMLElement) {
  label.style.opacity = '0'
}

export const ResizableImage = Image.extend({
  draggable: true,

  inline() {
    return true
  },

  group: 'inline',

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

      // Create size label for resize feedback
      const sizeLabel = createSizeLabel()
      let isResizing = false

      const syncImageState = (attrs: Record<string, unknown>, container?: HTMLElement) => {
        const width = typeof attrs.width === 'number' ? attrs.width : null

        applyImageDimensions(imageElement, width)

        if (container) {
          applyImageContainerStyles(container)
          const wrapper = container.querySelector('[data-resize-wrapper]')
          if (wrapper instanceof HTMLElement) {
            applyImageContainerStyles(wrapper, false)
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

          // Show and update size label during resize
          if (!isResizing) {
            isResizing = true
            document.body.appendChild(sizeLabel)
          }
          updateSizeLabel(sizeLabel, width, null, imageElement)
        },
        onCommit: (width) => {
          const pos = getPos()

          if (pos === undefined) {
            return
          }

          // Hide and remove size label
          hideSizeLabel(sizeLabel)
          isResizing = false
          if (sizeLabel.parentElement) {
            sizeLabel.parentElement.removeChild(sizeLabel)
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
        // Clean up size label if still in DOM
        if (isResizing && sizeLabel.parentElement) {
          sizeLabel.parentElement.removeChild(sizeLabel)
        }
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
    }
  },
})

export default ResizableImage