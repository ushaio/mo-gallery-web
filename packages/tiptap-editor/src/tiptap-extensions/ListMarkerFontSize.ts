import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/**
 * Ordered/bulleted list markers (`li::marker`) inherit their font size from the
 * originating `<li>` element, not from the inline text marks inside it. Because
 * this editor applies font size as a `pastedStyle` mark on a `<span>`, the
 * number glyph always keeps the container's default size even when the list
 * item text is enlarged.
 *
 * This extension mirrors a list item's dominant font size onto the `<li>` via a
 * node decoration, so the marker scales with its text. It only mirrors when
 * every text node inside the item carries the same font size (e.g. the whole
 * item was selected and enlarged), leaving mixed-size items untouched. Nested
 * sub-lists are ignored — each child `<li>` mirrors its own text, so adding an
 * unstyled sub-item never resets the parent item's marker.
 */

function listItemFontSize(listItem: ProseMirrorNode): string | null {
  let size: string | null = null
  let inconsistent = false
  let sawUnstyled = false

  listItem.descendants((child) => {
    // 嵌套子列表的文字由各自的 <li> 决定标记大小，不计入本项
    if (child.type.name === 'orderedList' || child.type.name === 'bulletList') {
      return false
    }
    if (!child.isText) return true

    let textSize: string | undefined
    for (const mark of child.marks) {
      if (mark.type.name !== 'pastedStyle') continue
      const markSize = mark.attrs?.fontSize as string | null | undefined
      if (markSize) {
        textSize = markSize
        break
      }
    }

    if (!textSize) {
      sawUnstyled = true
      return true
    }

    if (size && size !== textSize) {
      inconsistent = true
      return false
    }
    size = textSize
    return true
  })

  if (inconsistent || sawUnstyled || !size) return null
  return size
}

export const ListMarkerFontSize = Extension.create({
  name: 'listMarkerFontSize',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('listMarkerFontSize'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'listItem') return
              const fontSize = listItemFontSize(node)
              if (fontSize) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    style: `font-size: ${fontSize}`,
                  })
                )
              }
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})

export default ListMarkerFontSize
