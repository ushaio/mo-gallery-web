import { $mark } from '@milkdown/kit/utils'
import type { Mark } from '@milkdown/kit/prose/model'
import type { Command, EditorState } from '@milkdown/kit/prose/state'
import type { MarkSchema } from '@milkdown/kit/transformer'
import { normalizeTextStyle, textStyleDomAttributes, textStyleToAttributes, TEXT_STYLE_FIELDS } from './text-style'
import type { TextStyleAttributes } from './text-style'

export const textStyleSpec: MarkSchema = {
  attrs: Object.fromEntries(TEXT_STYLE_FIELDS.map((key) => [key, { default: null }])),
  parseDOM: [{
    tag: 'span[data-milkdown-text-style]',
    getAttrs: (dom) => normalizeTextStyle(Object.fromEntries(TEXT_STYLE_FIELDS.map((key) => [key, dom.getAttribute(`data-milkdown-${key}`)]))),
  }],
  toDOM: (mark) => ['span', textStyleDomAttributes(mark.attrs), 0],
  parseMarkdown: {
    match: (node) => node.type === 'textDirective' && node.name === 'text-style',
    runner: (state, node, type) => {
      const attrs = normalizeTextStyle(node.attributes)
      if (Object.values(attrs).some(Boolean)) {
        state.openMark(type, attrs)
        state.next(node.children)
        state.closeMark(type)
      } else {
        state.next(node.children)
      }
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'text_style',
    runner: (state, mark) => {
      const attributes = textStyleToAttributes(mark.attrs)
      state.withMark(mark, 'textDirective', undefined, { name: 'text-style', attributes })
    },
  },
}

export const textStyleSchema = $mark('text_style', () => textStyleSpec)

function styleFromMarks(marks: readonly Mark[]): TextStyleAttributes {
  return normalizeTextStyle(marks.find((mark) => mark.type.name === 'text_style')?.attrs)
}

/** Undefined means a mixed selection; null means the document's default. */
export function getSelectedTextStyle(state: EditorState): { font: string | null | undefined; size: string | null | undefined } {
  const { selection } = state
  if (selection.empty) return styleFromMarks(state.storedMarks ?? selection.$from.marks())
  let selected: ReturnType<typeof getSelectedTextStyle> | undefined
  for (const { $from, $to } of selection.ranges) {
    state.doc.nodesBetween($from.pos, $to.pos, (node) => {
      if (!node.isText) return
      const attrs = styleFromMarks(node.marks)
      if (!selected) selected = attrs
      else {
        if (selected.font !== attrs.font) selected.font = undefined
        if (selected.size !== attrs.size) selected.size = undefined
      }
    })
  }
  return selected ?? styleFromMarks(selection.$from.marks())
}

/** Changing one field preserves the other field and all unrelated marks. */
export function setTextStyle(field: 'font' | 'size', value: string | null): Command {
  return (state, dispatch, view) => {
    const type = state.schema.marks.text_style
    const normalized = normalizeTextStyle({ [field]: value })[field]
    if (!type || (view && !view.editable) || (value !== null && normalized === null)) return false
    const transaction = state.tr
    const { selection } = state

    if (selection.empty) {
      if (!selection.$from.parent.type.allowsMarkType(type)) return false
      const attrs = { ...styleFromMarks(state.storedMarks ?? selection.$from.marks()), [field]: normalized }
      transaction.removeStoredMark(type)
      if (Object.values(attrs).some(Boolean)) transaction.addStoredMark(type.create(attrs))
    } else {
      for (const { $from, $to } of selection.ranges) {
        state.doc.nodesBetween($from.pos, $to.pos, (node, pos, parent) => {
          if (!node.isText || !parent?.type.allowsMarkType(type)) return
          const attrs = { ...styleFromMarks(node.marks), [field]: normalized }
          const from = Math.max(pos, $from.pos)
          const to = Math.min(pos + node.nodeSize, $to.pos)
          transaction.removeMark(from, to, type)
          if (Object.values(attrs).some(Boolean)) transaction.addMark(from, to, type.create(attrs))
        })
      }
    }

    dispatch?.(transaction.scrollIntoView())
    return true
  }
}
