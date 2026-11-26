import { Extension } from '@tiptap/core'
import { sanitizeContentStyleValue as sanitizeStyleValue } from '../lib/content-style'

const ALLOWED_STYLE_PROPERTIES = new Set([
  'color',
  'background-color',
  'font-size',
  'font-family',
])

function extractSupportedBlockStyle(element: HTMLElement) {
  const styleEntries: string[] = []

  const color = sanitizeStyleValue('color', element.style.color)
  if (color && ALLOWED_STYLE_PROPERTIES.has('color')) {
    styleEntries.push(`color: ${color}`)
  }

  const backgroundColor = sanitizeStyleValue(
    'background-color',
    element.style.backgroundColor
  )
  if (backgroundColor && ALLOWED_STYLE_PROPERTIES.has('background-color')) {
    styleEntries.push(`background-color: ${backgroundColor}`)
  }

  const fontSize = sanitizeStyleValue('font-size', element.style.fontSize)
  if (fontSize && ALLOWED_STYLE_PROPERTIES.has('font-size')) {
    styleEntries.push(`font-size: ${fontSize}`)
  }

  const fontFamily = sanitizeStyleValue('font-family', element.style.fontFamily)
  if (fontFamily && ALLOWED_STYLE_PROPERTIES.has('font-family')) {
    styleEntries.push(`font-family: ${fontFamily}`)
  }

  return styleEntries.length > 0 ? styleEntries.join('; ') : null
}

export const PastedBlockStyle = Extension.create({
  name: 'pastedBlockStyle',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'blockquote', 'listItem'],
        attributes: {
          pastedStyle: {
            default: null,
            parseHTML: (element) =>
              extractSupportedBlockStyle(element as HTMLElement),
            renderHTML: (attributes) => {
              const pastedStyle = attributes.pastedStyle as string | null
              return pastedStyle ? { style: pastedStyle } : {}
            },
          },
        },
      },
    ]
  },
})

export default PastedBlockStyle
