import { Extension, type InputRule, wrappingInputRule } from '@tiptap/core'

/**
 * Markdown shortcuts that Typora users expect while typing.  The rules are
 * intentionally limited to syntax that is not already supplied by
 * StarterKit. Business blocks such as cards and media embeds are inserted
 * by commands.
 */
export const TyporaInputRules = Extension.create({
  name: 'typoraInputRules',
  priority: 120,

  addInputRules() {
    const { schema } = this.editor
    const rules: InputRule[] = []

    const orderedList = schema.nodes.orderedList
    if (orderedList) {
      rules.push(wrappingInputRule({
        // StarterKit handles `1. `; Typora also accepts `1) `.
        find: /^(\d+)\)\s$/,
        type: orderedList,
        getAttributes: (match) => ({ start: Number.parseInt(match[1], 10) || 1 }),
      }))
    }

    return rules
  },
})

export default TyporaInputRules
