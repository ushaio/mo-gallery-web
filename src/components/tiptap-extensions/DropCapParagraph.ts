import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    dropCapParagraph: {
      setParagraphDropCap: (enabled: boolean | null) => ReturnType
    }
  }
}

export const DropCapParagraph = Extension.create({
  name: 'dropCapParagraph',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          dropCap: {
            default: null,
            parseHTML: (element) => {
              const value = (element as HTMLElement).getAttribute('data-drop-cap')
              if (value === 'true') return true
              if (value === 'false') return false
              return null
            },
            renderHTML: (attributes) => {
              const dropCap = attributes.dropCap as boolean | null
              if (dropCap === null || typeof dropCap === 'undefined') {
                return {}
              }

              return {
                'data-drop-cap': dropCap ? 'true' : 'false',
              }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setParagraphDropCap:
        (enabled: boolean | null) =>
        ({ commands }) =>
          commands.updateAttributes('paragraph', { dropCap: enabled }),
    }
  },

  addProseMirrorPlugins() {
    let shouldResetDropCapOnNextParagraph = false

    return [
      new Plugin({
        key: new PluginKey('dropCapParagraphResetOnEnter'),
        props: {
          handleKeyDown: (view, event) => {
            const { selection } = view.state
            const { $from } = selection

            shouldResetDropCapOnNextParagraph = (
              event.key === 'Enter'
              && !event.shiftKey
              && !event.altKey
              && !event.ctrlKey
              && !event.metaKey
              && $from.parent.type.name === 'paragraph'
              && $from.parent.attrs.dropCap === true
            )

            return false
          },
        },
        appendTransaction: (transactions, _oldState, newState) => {
          const hasDocChanged = transactions.some((transaction) => transaction.docChanged)
          if (!hasDocChanged) {
            return null
          }

          let nextTransaction = newState.tr
          let modified = false

          if (shouldResetDropCapOnNextParagraph) {
            shouldResetDropCapOnNextParagraph = false

            const { $from } = newState.selection
            if ($from.parent.type.name === 'paragraph' && $from.parent.attrs.dropCap === true) {
              const paragraphPos = $from.before($from.depth)
              nextTransaction = nextTransaction.setNodeMarkup(paragraphPos, undefined, {
                ...$from.parent.attrs,
                dropCap: false,
              })
              modified = true
            }
          }

          newState.doc.descendants((node, pos) => {
            if (node.type.name !== 'paragraph' || node.attrs.dropCap !== true) {
              return true
            }

            const textAlign = typeof node.attrs.textAlign === 'string' ? node.attrs.textAlign : null
            if (textAlign !== 'center' && textAlign !== 'right') {
              return true
            }

            nextTransaction = nextTransaction.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              dropCap: false,
            })
            modified = true
            return true
          })

          return modified ? nextTransaction : null
        },
      }),
    ]
  },
})

export default DropCapParagraph
