/**
 * 列表键盘交互（Typora 对齐）+ 自定义列表节点。
 *
 * 本模块把 useNarrativeEditor 中与「有序/无序列表」相关的节点、扩展和
 * 键盘处理集中在一起，使行为可以被 headless 测试直接驱动（见 tests/）。
 * 运行时只有一个消费者：useNarrativeEditor 组装 editorProps 时调用
 * createListEditorHandlers，把同一份逻辑同时用在上层编辑器。
 */
import { Extension, mergeAttributes, Node } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list'
import { canJoin } from '@tiptap/pm/transform'
import { TAB_INDENT } from './editor-constants'

const LEGACY_TAB_INDENTS = ['\t', '    ', '　　'] as const

function getIndentToRemove(textBeforeCursor: string) {
  for (const indent of LEGACY_TAB_INDENTS) {
    if (textBeforeCursor.endsWith(indent)) return indent
  }
  return ''
}

/**
 * Apply Typora-like indentation to a normal paragraph. Tab inserts a literal
 * tab; Shift+Tab removes one indentation unit at the cursor instead of moving
 * focus away from the editor. List items are handled separately by
 * sinkListItem/liftListItem.
 */
export function handlePlainTextIndent(view: EditorView, shiftKey: boolean) {
  const { state } = view
  const { selection } = state

  if (!selection.empty || !selection.$from.parent.isTextblock) {
    if (shiftKey) return false
    view.dispatch(state.tr.insertText(TAB_INDENT).scrollIntoView())
    return true
  }

  if (!shiftKey) {
    view.dispatch(state.tr.insertText(TAB_INDENT).scrollIntoView())
    return true
  }

  const textBeforeCursor = selection.$from.parent.textBetween(0, selection.$from.parentOffset, '\n', '￼')
  const indent = getIndentToRemove(textBeforeCursor)

  if (!indent) return true

  view.dispatch(
    state.tr
      .delete(selection.from - indent.length, selection.from)
      .scrollIntoView(),
  )
  return true
}

export function revealListMarker(transaction: Transaction, listItemType: ProseMirrorNode['type']) {
  const { $from } = transaction.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type !== listItemType) continue
    const itemStart = $from.before(depth)
    const item = transaction.doc.nodeAt(itemStart)
    if (item?.attrs.markerHidden === true) {
      transaction.setNodeMarkup(itemStart, undefined, {
        ...item.attrs,
        markerHidden: false,
      })
    }
    break
  }
}

/**
 * Empty nested rows keep their indentation after the first Backspace, while
 * their marker disappears. A second Backspace can then remove the row without
 * unexpectedly lifting it into the parent list.
 */
export function hideListMarker(view: EditorView, listItemDepth: number) {
  const { state } = view
  const { $from } = state.selection
  const item = $from.node(listItemDepth)
  const itemStart = $from.before(listItemDepth)
  if (item.attrs.markerHidden === true) return false

  const transaction = state.tr.setNodeMarkup(itemStart, undefined, {
    ...item.attrs,
    markerHidden: true,
  })
  view.dispatch(transaction.scrollIntoView())
  return true
}

/** Remove an empty list row, removing its now-empty list container as well. */
export function deleteEmptyListItem(view: EditorView, listItemDepth: number) {
  const { state } = view
  const { $from } = state.selection
  const listDepth = listItemDepth - 1
  const currentList = $from.node(listDepth)
  const itemStart = $from.before(listItemDepth)
  const item = $from.node(listItemDepth)
  const deleteFrom = currentList.childCount === 1 ? $from.before(listDepth) : itemStart
  const deleteTo = currentList.childCount === 1 ? $from.after(listDepth) : itemStart + item.nodeSize
  const transaction = state.tr.delete(deleteFrom, deleteTo).scrollIntoView()
  view.dispatch(transaction)
  return true
}

/**
 * ProseMirror's sinkListItem only nests an item under a previous sibling in
 * the same list. Typora also allows the first item of a list to be indented
 * under the previous adjacent list, preserving its own marker type (for
 * example an ordered list under a bullet item). This helper performs that
 * cross-list move while keeping the current list's attributes and content.
 */
export function sinkListItemIntoPreviousList(view: EditorView, listItemDepth: number) {
  const { state } = view
  const { selection } = state
  const { $from } = selection
  const listDepth = listItemDepth - 1
  const parentDepth = listDepth - 1
  if (listDepth <= 0 || parentDepth < 0 || $from.index(listDepth) !== 0) return false

  const parent = $from.node(parentDepth)
  const listIndex = $from.index(parentDepth)
  if (listIndex <= 0) return false

  const previousList = parent.child(listIndex - 1)
  const currentList = $from.node(listDepth)
  if (!['bulletList', 'orderedList'].includes(previousList.type.name)) return false

  const currentItem = $from.node(listItemDepth)
  const currentListStart = $from.before(listDepth)
  const currentListEnd = $from.after(listDepth)
  const currentItemStart = $from.before(listItemDepth)
  const currentItemEnd = $from.after(listItemDepth)
  const previousListStart = currentListStart - previousList.nodeSize
  const previousItem = previousList.lastChild
  if (!previousItem) return false

  let previousItemStart = previousListStart + 1
  for (let index = 0; index < previousList.childCount - 1; index += 1) {
    previousItemStart += previousList.child(index).nodeSize
  }
  const previousItemEnd = previousItemStart + previousItem.nodeSize
  const existingNestedList = previousItem.lastChild
  const itemToInsert = currentItem.attrs.markerHidden === true
    ? currentItem.type.create({ ...currentItem.attrs, markerHidden: false }, currentItem.content)
    : currentItem
  const targetList = existingNestedList && existingNestedList.type === currentList.type
    ? existingNestedList
    : currentList.type.create(currentList.attrs, [itemToInsert])
  const deleteFrom = currentList.childCount === 1 ? currentListStart : currentItemStart
  const deleteTo = currentList.childCount === 1 ? currentListEnd : currentItemEnd
  const canAppendToExistingList = Boolean(existingNestedList && existingNestedList.type === currentList.type)
  // A list item must be inserted inside an existing nested list, not after
  // that list as a sibling block of the parent item. When the nested list is
  // newly created, the position before the parent item's closing token is the
  // correct insertion point for the list node itself.
  const insertionPosition = canAppendToExistingList
    ? previousItemEnd - 2
    : previousItemEnd - 1

  const transaction = state.tr.delete(deleteFrom, deleteTo)
  if (canAppendToExistingList) {
    transaction.insert(insertionPosition, itemToInsert)
  } else {
    transaction.insert(insertionPosition, targetList)
  }

  const insertedTextPosition = insertionPosition + (canAppendToExistingList ? 2 : 3)
  const mappedPosition = Math.min(transaction.doc.content.size, Math.max(1, insertedTextPosition))
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(mappedPosition)))
  view.dispatch(transaction.scrollIntoView())
  return true
}

/**
 * Convert the current empty list row into a nested list row of the requested
 * type. This is the interaction users expect from Typora when they type
 * "- " (or "1. ") at the beginning of the freshly-created row after an
 * ordered/bullet item.
 */
export function nestListItemAsType(
  view: EditorView,
  listItemDepth: number,
  targetListName: 'bulletList' | 'orderedList',
) {
  const { state } = view
  const { $from } = state.selection
  const listDepth = listItemDepth - 1
  if (listDepth <= 0 || $from.index(listDepth) === 0) return false

  const currentList = $from.node(listDepth)
  const currentItem = $from.node(listItemDepth)
  const currentItemIndex = $from.index(listDepth)
  const previousItem = currentList.child(currentItemIndex - 1)
  const targetListType = state.schema.nodes[targetListName]
  if (!targetListType || previousItem.type !== currentItem.type) return false

  const currentItemStart = $from.before(listItemDepth)
  const currentItemEnd = $from.after(listItemDepth)
  const currentListStart = $from.before(listDepth)
  let previousItemStart = currentListStart + 1
  for (let index = 0; index < currentItemIndex - 1; index += 1) {
    previousItemStart += currentList.child(index).nodeSize
  }
  const previousItemEnd = previousItemStart + previousItem.nodeSize
  const existingNestedList = previousItem.lastChild
  const itemToInsert = currentItem.attrs.markerHidden === true
    ? currentItem.type.create({ ...currentItem.attrs, markerHidden: false }, currentItem.content)
    : currentItem
  const canAppendToExistingList = Boolean(
    existingNestedList && existingNestedList.type === targetListType,
  )
  const transaction = state.tr.delete(currentItemStart, currentItemEnd)

  if (canAppendToExistingList && existingNestedList) {
    // The existing list ends immediately before the parent item's closing
    // token; insert before that list's closing token.
    const nestedListEnd = previousItemEnd - 1
    const insertionPosition = nestedListEnd - 1
    transaction.insert(insertionPosition, itemToInsert)
    transaction.setSelection(
      TextSelection.near(transaction.doc.resolve(insertionPosition + 2)),
    )
  } else {
    const targetList = targetListType.create(
      targetListName === 'orderedList' ? { order: 1 } : undefined,
      [itemToInsert],
    )
    const insertionPosition = previousItemEnd - 1
    transaction.insert(insertionPosition, targetList)
    transaction.setSelection(
      TextSelection.near(transaction.doc.resolve(insertionPosition + 3)),
    )
  }

  view.dispatch(transaction.scrollIntoView())
  return true
}

/**
 * 将嵌套列表项提升到外层列表，成为外层列表项的同级兄弟。
 * 适用于 liftListItem 无法处理的嵌套列表项（例如 PM 的
 * liftListItem 对嵌套项会提升整个父容器）。
 */
export function liftNestedItemToParentList(
  view: EditorView,
  listItemDepth: number,
) {
  const { state } = view
  const { tr, selection } = state
  const { $from } = selection

  const currentItem = $from.node(listItemDepth)
  // 嵌套列表（包含当前项的列表）
  const nestedList = $from.node(listItemDepth - 1)
  // 外层列表项（包含嵌套列表的项）
  const outerListItem = $from.node(listItemDepth - 2)
  const outerListItemStart = $from.before(listItemDepth - 2)
  // 最外层列表
  const outerList = $from.node(listItemDepth - 3)

  // 无效的表单（非嵌套列表）
  if (
    !nestedList || !outerListItem || !outerList
    || !['bulletList', 'orderedList'].includes(outerList.type.name)
  ) return false

  // 当前项的位置
  const currentItemStart = $from.before(listItemDepth)
  const currentItemSize = currentItem.nodeSize

  // 外层列表项结束位置（在外层列表中）
  const outerItemEnd = outerListItemStart + outerListItem.nodeSize

  // 1. 从嵌套列表中删除当前项
  tr.delete(currentItemStart, currentItemStart + currentItemSize)

  // 2. 删除后，外层列表项结束位置在映射中自动更新
  const newOuterItemEnd = tr.mapping.map(outerItemEnd)

  // 3. 创建提升后的项（恢复标记显示）
  const liftedItem = currentItem.type.create(
    { ...currentItem.attrs, markerHidden: false },
    currentItem.content,
  )

  // 4. 在外层列表中，在外层列表项之后插入提升后的项
  tr.insert(newOuterItemEnd, liftedItem)

  // 5. 光标移至提升后的项中
  const insertedPos = newOuterItemEnd + 1 // +1 = listItem 开标签
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertedPos)))

  view.dispatch(tr.scrollIntoView())
  return true
}

export const MarkerHiddenListItem = Node.create({
  name: 'listItem',

  content: 'paragraph block*',

  defining: true,

  addAttributes() {
    return {
      markerHidden: {
        default: false,
        parseHTML: element => element.getAttribute('data-list-marker-hidden') === 'true',
        renderHTML: attributes => (
          attributes.markerHidden ? { 'data-list-marker-hidden': 'true' } : {}
        ),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'li' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['li', mergeAttributes(HTMLAttributes), 0]
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { editor } = this
        const { state } = editor
        const { empty, $from } = state.selection
        // 拆分前记录光标处的行内样式（字号/颜色等 pastedStyle 标记）。
        // 拆分后写入 storedMarks：空段落中输入首个字符时，视图会用
        // storedMarks 生成带样式的光标容器，使新列表项延续上一项的样式。
        const carriedMarks = empty
          ? $from.marks().filter(mark => mark.type.name === 'pastedStyle')
          : []
        const split = editor.commands.splitListItem(this.name)
        if (!split) return false
        const transaction = editor.state.tr
        // A hidden marker is only a temporary state for an empty placeholder
        // row. A newly split row must always show its own list marker.
        revealListMarker(transaction, this.type)
        if (carriedMarks.length > 0) transaction.setStoredMarks(carriedMarks)
        if (transaction.steps.length > 0 || carriedMarks.length > 0) {
          editor.view.dispatch(transaction)
        }
        return true
      },
      // Tab/Shift-Tab are handled by editorProps.handleKeyDown below. Keeping
      // them here as well would steal Tab navigation from lists inside tables,
      // because the node shortcut would run after handleKeyDown returns false.
    }
  },
})

function isMergeableListPair(first: ProseMirrorNode, second: ProseMirrorNode) {
  return (
    (first.type.name === 'orderedList' || first.type.name === 'bulletList')
    && first.sameMarkup(second)
  )
}

export const MergeAdjacentLists = Extension.create({
  name: 'mergeAdjacentLists',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('mergeAdjacentLists'),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some(transaction => transaction.docChanged)) return null

          const boundaries: number[] = []
          newState.doc.descendants((node, pos, parent, index) => {
            if (!parent || index >= parent.childCount - 1) return

            const nextNode = parent.child(index + 1)
            if (isMergeableListPair(node, nextNode)) {
              boundaries.push(pos + node.nodeSize)
            }
          })

          if (boundaries.length === 0) return null

          // Join from the end so earlier positions remain valid as nodes collapse.
          const transaction = newState.tr
          for (const boundary of boundaries.sort((left, right) => right - left)) {
            if (canJoin(transaction.doc, boundary)) transaction.join(boundary)
          }

          return transaction.steps.length > 0 ? transaction : null
        },
      }),
    ]
  },
})

export interface ListEditorHandlers {
  handleTextInput: NonNullable<import('@tiptap/pm/view').EditorProps['handleTextInput']>
  handleKeyDown: NonNullable<import('@tiptap/pm/view').EditorProps['handleKeyDown']>
}

/**
 * The markdown-syntax + keyboard interactions that make lists feel like
 * Typora. Extracted here so the production editor and headless tests share
 * the exact same behavior.
 */
export function createListEditorHandlers(options: {
  isAiTaskLocked: () => boolean
}): ListEditorHandlers {
  const { isAiTaskLocked } = options

  const handleTextInput: ListEditorHandlers['handleTextInput'] = (view, from, to, text) => {
    const { $from } = view.state.selection
    const listItemType = view.state.schema.nodes.listItem
    if (from !== to || !listItemType || !$from.parent.isTextblock) {
      return false
    }

    // Depending on the browser, `handleTextInput` receives either the
    // complete marker (`"- "`) or the marker and trailing space as two
    // separate events. Account for both forms so the conversion is
    // deterministic across Chromium/WebView versions.
    const textBeforeInput = $from.parent.textBetween(0, $from.parentOffset)
    const completeMarker = /^(?:[-+*]|\d+[.)])\s$/.test(text)
    const splitMarker = text === ' '
      && /^(?:[-+*]|\d+[.)])$/.test(textBeforeInput)
    if (!completeMarker && !splitMarker) return false
    if (completeMarker && $from.parentOffset !== 0) return false

    let listItemDepth = -1
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type === listItemType) {
        listItemDepth = depth
        break
      }
    }
    if (listItemDepth <= 0 || $from.index(listItemDepth) !== 0) return false

    const targetListName: 'bulletList' | 'orderedList' = /^\d/.test(text)
      || /^\d/.test(textBeforeInput)
        ? 'orderedList'
        : 'bulletList'
    if (splitMarker) {
      view.dispatch(view.state.tr.delete(from - textBeforeInput.length, from))
    }
    return nestListItemAsType(view, listItemDepth, targetListName)
  }

  const handleKeyDown: ListEditorHandlers['handleKeyDown'] = (view, event) => {
    if (isAiTaskLocked()) return true

    const { $from, empty } = view.state.selection
    const listItemType = view.state.schema.nodes.listItem
    let listItemDepth = -1

    if (listItemType) {
      for (let depth = $from.depth; depth > 0; depth -= 1) {
        if ($from.node(depth).type === listItemType) {
          listItemDepth = depth
          break
        }
      }
    }

    // WebViews can deliver the trailing space as a keydown without a
    // preceding handleTextInput callback. Mirror the input-rule path here
    // so `- ` still creates a nested bullet in those hosts.
    if (event.key === ' ' && empty && listItemDepth > 0 && $from.parent.isTextblock) {
      const marker = $from.parent.textBetween(0, $from.parentOffset)
      if (
        /^(?:[-+*]|\d+[.)])$/.test(marker)
        && $from.index(listItemDepth) === 0
        && $from.index(listItemDepth - 1) > 0
      ) {
        event.preventDefault()
        view.dispatch(view.state.tr.delete($from.pos - marker.length, $from.pos))
        return nestListItemAsType(
          view,
          listItemDepth,
          /^\d/.test(marker) ? 'orderedList' : 'bulletList',
        )
      }
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      const paragraph = $from.parent
      const parent = $from.node($from.depth - 1)
      const paragraphIndex = $from.index($from.depth - 1)
      const previousNode = paragraphIndex > 0 ? parent.child(paragraphIndex - 1) : null
      const nextNode = paragraphIndex + 1 < parent.childCount ? parent.child(paragraphIndex + 1) : null
      const isEmptyParagraphBetweenLists = empty
        && paragraph.type.name === 'paragraph'
        && paragraph.content.size === 0
        && paragraphIndex > 0
        && paragraphIndex < parent.childCount - 1
        && previousNode
        && nextNode
        && isMergeableListPair(previousNode, nextNode)

      if (isEmptyParagraphBetweenLists) {
        const paragraphStart = $from.before($from.depth)
        const previousListStart = paragraphStart - previousNode.nodeSize
        const transaction = view.state.tr.delete(
          paragraphStart,
          paragraphStart + paragraph.nodeSize,
        )
        const listBoundary = previousListStart + previousNode.nodeSize

        if (canJoin(transaction.doc, listBoundary)) {
          transaction.join(listBoundary)
          // 删除两列表间空段并合并后，把光标放到上一列表最后一项的
          // 文字末尾（Typora 行为），而不是下一列表开头。
          const previousList = previousNode
          const lastItem = previousList.lastChild
          if (lastItem) {
            // 上一列表最后一项中最后一个文本节点的结束位置。
            let lastTextEnd = -1
            previousList.descendants((node, pos) => {
              if (node.isText) lastTextEnd = pos + node.nodeSize
            })
            if (lastTextEnd >= 0) {
              const mapped = transaction.mapping.map(previousListStart + lastTextEnd)
              transaction.setSelection(
                TextSelection.near(transaction.doc.resolve(mapped)),
              )
            }
          }
          event.preventDefault()
          view.dispatch(transaction.scrollIntoView())
          return true
        }
      }

      if (event.key === 'Delete') return false

      // 光标位于列表项第一个段落行首时接管 Backspace，行为与 Typora 一致：
      // 空项且前面还有同级项时删除该行（上方分支），
      // 其余情况提升一级 —— 嵌套项回到上级列表继续编号，顶层项转回普通段落。
      const isAtListItemTextStart = empty
        && $from.parent.isTextblock
        && $from.parentOffset === 0
        && listItemDepth === $from.depth - 1
        // 注意：此处不要求 $from.index(listItemDepth) === 0，
        // 因为 Backspace 应作用于列表中的任意行，不仅仅第一项。

      if (!isAtListItemTextStart) return false

      const currentListItem = $from.node(listItemDepth)
      const isNestedListItem = listItemDepth > 1
        && $from.node(listItemDepth - 2).type === listItemType
      const isEmptyListItem = currentListItem.firstChild?.type.name === 'paragraph'
        && currentListItem.firstChild.content.size === 0

      if (isNestedListItem && isEmptyListItem) {
        event.preventDefault()
        if (currentListItem.attrs.markerHidden === true) {
          deleteEmptyListItem(view, listItemDepth)
        } else {
          hideListMarker(view, listItemDepth)
        }
        return true
      }


      let liftedTransaction: Transaction | undefined
      const lifted = liftListItem(listItemType)(view.state, transaction => {
        liftedTransaction = transaction
      })

      if (!lifted || !liftedTransaction) return false

      // 归一化旧版本「隐藏标记」产生的列表项：提升时恢复标记显示。
      const liftedFrom = liftedTransaction.selection.$from
      for (let depth = liftedFrom.depth; depth > 0; depth -= 1) {
        if (liftedFrom.node(depth).type !== listItemType) continue

        const liftedListItemStart = liftedFrom.before(depth)
        const liftedListItem = liftedTransaction.doc.nodeAt(liftedListItemStart)
        if (liftedListItem && liftedListItem.attrs.markerHidden === true) {
          liftedTransaction.setNodeMarkup(liftedListItemStart, undefined, {
            ...liftedListItem.attrs,
            markerHidden: false,
          })
        }
        break
      }

      event.preventDefault()
      view.dispatch(liftedTransaction.scrollIntoView())
      return true
    }

    if (event.key !== 'Tab') {
      return false
    }

    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const nodeName = $from.node(depth).type.name
      if (nodeName === 'tableCell' || nodeName === 'tableHeader') {
        return false
      }
    }

    if (listItemType && listItemDepth > 0) {
      event.preventDefault()
      if (!event.shiftKey && sinkListItemIntoPreviousList(view, listItemDepth)) {
        return true
      }

      const command = event.shiftKey ? liftListItem(listItemType) : sinkListItem(listItemType)
      // Keep the editor focused even when the requested structural change
      // is not possible (for example Tab on the first top-level item).
      command(view.state, transaction => {
        revealListMarker(transaction, listItemType)
        view.dispatch(transaction)
      })
      return true
    }

    event.preventDefault()
    handlePlainTextIndent(view, event.shiftKey)
    return true
  }

  return { handleTextInput, handleKeyDown }
}
