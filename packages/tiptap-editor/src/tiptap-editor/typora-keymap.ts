import { Extension } from '@tiptap/core'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'

/** Keyboard boundaries that differ from ProseMirror's generic defaults. */
export const TyporaKeymap = Extension.create({
  name: 'typoraKeymap',
  priority: 130,

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { editor } = this
        const { state } = editor
        const { selection } = state

        if (selection instanceof NodeSelection && selection.node?.isAtom) {
          return editor.commands.createParagraphNear()
        }

        if (!selection.empty || !selection.$from.parent.isTextblock || selection.$from.parent.content.size > 0) {
          return false
        }

        const parentNames = new Set<string>()
        for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
          parentNames.add(selection.$from.node(depth).type.name)
        }

        if (parentNames.has('heading')) {
          return editor.commands.setNode('paragraph')
        }

        if (parentNames.has('blockquote')) {
          return editor.commands.liftEmptyBlock()
        }

        if (parentNames.has('codeBlock')) {
          return editor.commands.exitCode()
        }

        return false
      },

      Backspace: () => {
        const { editor } = this
        const { selection } = editor.state
        if (!(selection instanceof TextSelection) || !selection.empty || selection.$from.parentOffset !== 0) {
          return false
        }

        const parentName = selection.$from.parent.type.name
        if (parentName === 'heading') {
          return editor.commands.setNode('paragraph')
        }

        if (parentName === 'blockquote' && selection.$from.parent.content.size === 0) {
          return editor.commands.liftEmptyBlock()
        }

        return false
      },
    }
  },
})

export default TyporaKeymap
