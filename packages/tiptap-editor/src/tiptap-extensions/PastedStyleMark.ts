import { Mark, mergeAttributes } from '@tiptap/core'

const DEFAULT_MARK_HIGHLIGHT = '#fff3a3'

const ALLOWED_STYLE_PROPERTIES = new Set([
  'color',
  'background-color',
  'font-size',
  'font-family',
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

  if (
    property === 'font-family' &&
    /[;{}<>]/.test(value)
  ) {
    return null
  }

  return value
}

interface InlineStyleAttrs {
  color?: string | null
  backgroundColor?: string | null
  fontSize?: string | null
  fontFamily?: string | null
}

interface MarkCommandContext {
  editor: {
    getAttributes: (name: string) => InlineStyleAttrs
  }
  commands: {
    unsetMark: (name: string) => boolean
    setMark: (name: string, attributes: InlineStyleAttrs) => boolean
  }
}

function buildAllowedStyle(entries: Array<[string, string | null | undefined]>) {
  const styleEntries: string[] = []

  for (const [property, rawValue] of entries) {
    if (!ALLOWED_STYLE_PROPERTIES.has(property)) continue

    const value = sanitizeStyleValue(property, rawValue)
    if (!value) continue

    styleEntries.push(`${property}: ${value}`)
  }

  return styleEntries.length > 0 ? styleEntries.join('; ') : null
}

function extractSupportedStyle(element: HTMLElement): InlineStyleAttrs | null {
  const color = sanitizeStyleValue('color', element.style.color || element.getAttribute('color'))
  const backgroundColor = sanitizeStyleValue(
    'background-color',
    element.style.backgroundColor || element.getAttribute('bgcolor')
  )
  const fontSize = sanitizeStyleValue('font-size', element.style.fontSize)
  const fontFamily = sanitizeStyleValue(
    'font-family',
    element.style.fontFamily || element.getAttribute('face')
  )

  if (!color && !backgroundColor && !fontSize && !fontFamily) {
    return null
  }

  return {
    color,
    backgroundColor,
    fontSize,
    fontFamily,
  }
}

function getStyleString(attrs: InlineStyleAttrs) {
  return buildAllowedStyle([
    ['color', attrs.color],
    ['background-color', attrs.backgroundColor],
    ['font-size', attrs.fontSize],
    ['font-family', attrs.fontFamily],
  ])
}

function getAttrs(element: HTMLElement, fallbackAttrs?: InlineStyleAttrs) {
  const attrs = extractSupportedStyle(element) ?? fallbackAttrs ?? null

  if (!attrs) {
    return false
  }

  return attrs
}

function hasRenderableAttrs(attrs: InlineStyleAttrs) {
  return Boolean(attrs.color || attrs.backgroundColor || attrs.fontSize || attrs.fontFamily)
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pastedStyle: {
      setTextColor: (color: string) => ReturnType
      unsetTextColor: () => ReturnType
      setFontSize: (fontSize: string) => ReturnType
      unsetFontSize: () => ReturnType
      setFontFamily: (fontFamily: string) => ReturnType
      unsetFontFamily: () => ReturnType
      setBackgroundColor: (backgroundColor: string) => ReturnType
      unsetBackgroundColor: () => ReturnType
    }
  }
}

export const PastedStyleMark = Mark.create({
  name: 'pastedStyle',
  priority: 1000,
  inclusive: true,
  excludes: 'pastedStyle',

  addAttributes() {
    return {
      color: {
        default: null,
      },
      backgroundColor: {
        default: null,
      },
      fontSize: {
        default: null,
      },
      fontFamily: {
        default: null,
      },
    }
  },

  addCommands() {
    return {
      setTextColor:
        (color: string) =>
        ({ editor, commands }: MarkCommandContext) => {
          const currentAttrs = editor.getAttributes(this.name) as InlineStyleAttrs
          const nextAttrs: InlineStyleAttrs = {
            color: sanitizeStyleValue('color', color),
            backgroundColor: currentAttrs.backgroundColor ?? null,
            fontSize: currentAttrs.fontSize ?? null,
            fontFamily: currentAttrs.fontFamily ?? null,
          }

          if (!hasRenderableAttrs(nextAttrs)) {
            return commands.unsetMark(this.name)
          }

          return commands.setMark(this.name, nextAttrs)
        },
      unsetTextColor:
        () =>
        ({ editor, commands }: MarkCommandContext) => {
          const currentAttrs = editor.getAttributes(this.name) as InlineStyleAttrs
          const nextAttrs: InlineStyleAttrs = {
            color: null,
            backgroundColor: currentAttrs.backgroundColor ?? null,
            fontSize: currentAttrs.fontSize ?? null,
            fontFamily: currentAttrs.fontFamily ?? null,
          }

          if (!hasRenderableAttrs(nextAttrs)) {
            return commands.unsetMark(this.name)
          }

          return commands.setMark(this.name, nextAttrs)
        },
      setFontSize:
        (fontSize: string) =>
        ({ editor, commands }: MarkCommandContext) => {
          const currentAttrs = editor.getAttributes(this.name) as InlineStyleAttrs
          const nextAttrs: InlineStyleAttrs = {
            color: currentAttrs.color ?? null,
            backgroundColor: currentAttrs.backgroundColor ?? null,
            fontSize: sanitizeStyleValue('font-size', fontSize),
            fontFamily: currentAttrs.fontFamily ?? null,
          }

          if (!hasRenderableAttrs(nextAttrs)) {
            return commands.unsetMark(this.name)
          }

          return commands.setMark(this.name, nextAttrs)
        },
      unsetFontSize:
        () =>
        ({ editor, commands }: MarkCommandContext) => {
          const currentAttrs = editor.getAttributes(this.name) as InlineStyleAttrs
          const nextAttrs: InlineStyleAttrs = {
            color: currentAttrs.color ?? null,
            backgroundColor: currentAttrs.backgroundColor ?? null,
            fontSize: null,
            fontFamily: currentAttrs.fontFamily ?? null,
          }

          if (!hasRenderableAttrs(nextAttrs)) {
            return commands.unsetMark(this.name)
          }

          return commands.setMark(this.name, nextAttrs)
        },
      setFontFamily:
        (fontFamily: string) =>
        ({ editor, commands }: MarkCommandContext) => {
          const currentAttrs = editor.getAttributes(this.name) as InlineStyleAttrs
          const nextAttrs: InlineStyleAttrs = {
            color: currentAttrs.color ?? null,
            backgroundColor: currentAttrs.backgroundColor ?? null,
            fontSize: currentAttrs.fontSize ?? null,
            fontFamily: sanitizeStyleValue('font-family', fontFamily),
          }

          if (!hasRenderableAttrs(nextAttrs)) {
            return commands.unsetMark(this.name)
          }

          return commands.setMark(this.name, nextAttrs)
        },
      unsetFontFamily:
        () =>
        ({ editor, commands }: MarkCommandContext) => {
          const currentAttrs = editor.getAttributes(this.name) as InlineStyleAttrs
          const nextAttrs: InlineStyleAttrs = {
            color: currentAttrs.color ?? null,
            backgroundColor: currentAttrs.backgroundColor ?? null,
            fontSize: currentAttrs.fontSize ?? null,
            fontFamily: null,
          }

          if (!hasRenderableAttrs(nextAttrs)) {
            return commands.unsetMark(this.name)
          }

          return commands.setMark(this.name, nextAttrs)
        },
      setBackgroundColor:
        (backgroundColor: string) =>
        ({ editor, commands }: MarkCommandContext) => {
          const currentAttrs = editor.getAttributes(this.name) as InlineStyleAttrs
          const nextAttrs: InlineStyleAttrs = {
            color: currentAttrs.color ?? null,
            backgroundColor: sanitizeStyleValue('background-color', backgroundColor),
            fontSize: currentAttrs.fontSize ?? null,
            fontFamily: currentAttrs.fontFamily ?? null,
          }

          if (!hasRenderableAttrs(nextAttrs)) {
            return commands.unsetMark(this.name)
          }

          return commands.setMark(this.name, nextAttrs)
        },
      unsetBackgroundColor:
        () =>
        ({ editor, commands }: MarkCommandContext) => {
          const currentAttrs = editor.getAttributes(this.name) as InlineStyleAttrs
          const nextAttrs: InlineStyleAttrs = {
            color: currentAttrs.color ?? null,
            backgroundColor: null,
            fontSize: currentAttrs.fontSize ?? null,
            fontFamily: currentAttrs.fontFamily ?? null,
          }

          if (!hasRenderableAttrs(nextAttrs)) {
            return commands.unsetMark(this.name)
          }

          return commands.setMark(this.name, nextAttrs)
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
            { backgroundColor: DEFAULT_MARK_HIGHLIGHT }
          ),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as Record<string, unknown> & InlineStyleAttrs
    const { color, backgroundColor, fontSize, fontFamily, ...rest } = attrs
    const style = getStyleString({
      color,
      backgroundColor,
      fontSize,
      fontFamily,
    })

    return [
      'span',
      mergeAttributes(rest, style ? { style } : {}),
      0,
    ]
  },
})

export default PastedStyleMark
