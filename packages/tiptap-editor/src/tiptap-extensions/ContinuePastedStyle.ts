import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Mark as ProseMirrorMark, Node as ProseMirrorNode } from '@tiptap/pm/model'

/**
 * 空文本块中的行内样式续接：光标位于空段落（如回车新建的列表项、文档末尾空行）
 * 输入文字时，向前继承最近一个非空文本块末尾文字的 pastedStyle 标记
 * （字号/颜色等），避免「全选设置字体大小后，空行里输入仍是默认样式」的问题。
 * 非空位置的输入不受影响（浏览器会自然延续相邻文字的样式）。
 */

function trailingPastedStyleMark(block: ProseMirrorNode): ProseMirrorMark | null {
  let found: ProseMirrorMark | null = null
  block.descendants((node) => {
    if (!node.isText) return true
    const mark = node.marks.find(item => item.type.name === 'pastedStyle')
    if (mark) found = mark
    return true
  })
  return found
}

function findInheritedMark(doc: ProseMirrorNode, pos: number): ProseMirrorMark | null {
  let inherited: ProseMirrorMark | null = null
  doc.descendants((node, nodePos) => {
    if (!node.isTextblock) return true
    // 目标位置之前的文本块才参与继承，取最后一个带样式的
    if (nodePos + node.nodeSize > pos) return false
    const mark = trailingPastedStyleMark(node)
    if (mark) inherited = mark
    return true
  })
  return inherited
}

export const ContinuePastedStyle = Extension.create({
  name: 'continuePastedStyle',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('continuePastedStyle'),
        props: {
          handleTextInput: (view, from, to, text) => {
            if (!text || from !== to) return false

            const { state } = view
            const $from = state.doc.resolve(from)
            if (!$from.parent.isTextblock || $from.parent.content.size !== 0) return false

            const mark = findInheritedMark(state.doc, from)
            if (!mark) return false

            const transaction = state.tr.insertText(text, from, to)
            transaction.addMark(from, from + text.length, mark)
            view.dispatch(transaction.scrollIntoView())
            return true
          },
        },
      }),
    ]
  },
})

export default ContinuePastedStyle
