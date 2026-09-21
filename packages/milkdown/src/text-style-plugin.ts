import { $mark } from '@milkdown/kit/utils'
import type { Mark } from '@milkdown/kit/prose/model'
import { Plugin } from '@milkdown/kit/prose/state'
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

/** Preserve the inline text style when Enter creates a new block. */
export function createTextStyleInheritancePlugin() {
  return new Plugin({
    appendTransaction: (transactions, oldState, newState) => {
      const oldSelection = oldState.selection
      const newSelection = newState.selection
      if (!transactions.some((transaction) => transaction.docChanged)
        || !oldSelection.empty || !newSelection.empty
        || oldSelection.$from.parent === newSelection.$from.parent
        || newSelection.$from.parentOffset !== 0) return null

      const type = newState.schema.marks.text_style
      if (!type || !newSelection.$from.parent.type.allowsMarkType(type)) return null
      const style = styleFromMarks(oldSelection.$from.marks())
      const marks = (newState.storedMarks ?? newSelection.$from.marks()).filter((mark) => mark.type !== type)
      if (Object.values(style).some(Boolean)) marks.push(type.create(style))
      return newState.tr.setStoredMarks(marks)
    },
  })
}

export type TextStyleField = 'font' | 'size' | 'color' | 'background'
/** Undefined means a mixed selection; null means the document's default. */
export function getSelectedTextStyle(state: EditorState): { font: string | null | undefined; size: string | null | undefined; color?: string; background?: string } {
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
        if (selected.color !== attrs.color) selected.color = undefined
        if (selected.background !== attrs.background) selected.background = undefined
      }
    })
  }
  return selected ?? styleFromMarks(selection.$from.marks())
}

/** Changing one field preserves the other field and all unrelated marks. */
export function setTextStyle(field: TextStyleField, value: string | null): Command {
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
