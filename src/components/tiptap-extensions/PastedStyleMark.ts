import { Mark, mergeAttributes } from '@tiptap/core'

const DEFAULT_MARK_HIGHLIGHT = '#fff3a3'

const ALLOWED_STYLE_PROPERTIES = new Set([
  'color',
  'background-color',
  'font-size',
])

function sanitizeStyleValue(property: string, rawValue: string | null | undefined) {
  const value = rawValue?.trim().replace(/\s+/g, ' ')
  if (!value) return null

  const lowered = value.toLowerCase()
  if (
    lowered.includes('expression(') ||
    lowered.includes('javascript:') ||
    lowered.includes('url(')
  ) {
    return null
  }

  if (
    property === 'font-size' &&
    !/^\d+(\.\d+)?(px|em|rem|%)$/i.test(value)
  ) {
    return null
  }

  return value
}

function buildAllowedStyle(
  entries: Array<[string, string | null | undefined]>
) {
  const styleEntries: string[] = []

  for (const [property, rawValue] of entries) {
    if (!ALLOWED_STYLE_PROPERTIES.has(property)) continue

    const value = sanitizeStyleValue(property, rawValue)
    if (!value) continue

    styleEntries.push(`${property}: ${value}`)
  }

  return styleEntries.length > 0 ? styleEntries.join('; ') : null
}

function extractSupportedStyle(element: HTMLElement) {
  return buildAllowedStyle([
    ['color', element.style.color || element.getAttribute('color')],
    [
      'background-color',
      element.style.backgroundColor || element.getAttribute('bgcolor'),
    ],
    ['font-size', element.style.fontSize],
  ])
}

function getAttrs(element: HTMLElement, fallbackStyle?: string) {
  const pastedStyle = extractSupportedStyle(element) ?? fallbackStyle ?? null

  if (!pastedStyle) {
    return false
  }

  return { pastedStyle }
}

export const PastedStyleMark = Mark.create({
  name: 'pastedStyle',
  priority: 1000,
  inclusive: true,
  excludes: '',

  addAttributes() {
    return {
      pastedStyle: {
        default: null,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span',
        getAttrs: (element) => getAttrs(element as HTMLElement),
      },
      {
        tag: 'font',
        getAttrs: (element) => getAttrs(element as HTMLElement),
      },
      {
        tag: 'mark',
        getAttrs: (element) =>
          getAttrs(
            element as HTMLElement,
            `background-color: ${DEFAULT_MARK_HIGHLIGHT}`
          ),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as Record<string, unknown> & {
      pastedStyle?: string | null
    }

    const { pastedStyle, ...rest } = attrs

    return [
      'span',
      mergeAttributes(rest, pastedStyle ? { style: pastedStyle } : {}),
      0,
    ]
  },
})

export default PastedStyleMark
