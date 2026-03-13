import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'
import ResizableImageNodeView from '@/components/tiptap-extensions/ResizableImageNodeView'

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

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageNodeView)
  },
})

export default ResizableImage
