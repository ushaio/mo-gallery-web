/**
 * 列表键盘交互（Typora 对齐）+ 自定义列表节点。
 *
 * 本模块把 useNarrativeEditor 中与「有序/无序列表」相关的节点、扩展和
 * 键盘处理集中在一起，使行为可以被 headless 测试直接驱动（见 tests/）。
 * 运行时只有一个消费者：useNarrativeEditor 组装 editorProps 时调用
 * createListEditorHandlers，把同一份逻辑同时用在上层编辑器。
 */
import { Extension, Mark, mergeAttributes, Node } from '@tiptap/core'
import { Fragment, type Node as ProseMirrorNode, type ResolvedPos } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { liftListItem, sinkListItem, splitListItemKeepMarks } from '@tiptap/pm/schema-list'
import { joinBackward, joinForward } from '@tiptap/pm/commands'
import { canJoin, joinPoint } from '@tiptap/pm/transform'
import { TAB_INDENT } from './editor-constants'

const LEGACY_TAB_INDENTS = ['\t', '    ', '　　'] as const
const LIST_MARKER_PATTERN = /^(?:[-+*]|\d+[.)])$/
const LIST_MARKER_WITH_SPACE_PATTERN = /^(?:[-+*]|\d+[.)])[ \t]$/

/** Semantic mark for the literal Tab used by an exited list-row placeholder. */
export const TabPlaceholderMark = Mark.create({
  name: 'tabPlaceholder',
  inclusive: false,
  parseHTML() {
    return [{ tag: 'span[data-tab-placeholder="true"]' }]
  },
  renderHTML() {
    return ['span', { 'data-tab-placeholder': 'true' }, 0]
  },
})

type ListName = 'bulletList' | 'orderedList'

interface ListMarker {
  listName: ListName
  start?: number
}

function parseListMarker(value: string): ListMarker | null {
  if (!LIST_MARKER_PATTERN.test(value)) return null
  if (/^\d/.test(value)) {
    const start = Number.parseInt(value, 10)
    return {
      listName: 'orderedList',
      start: Number.isFinite(start) && start > 0 ? start : 1,
    }
  }
  return { listName: 'bulletList' }
}

function getIndentToRemove(textBeforeCursor: string) {
  for (const indent of LEGACY_TAB_INDENTS) {
    if (textBeforeCursor.endsWith(indent)) return indent
  }
  return ''
}

function getLeadingIndent(text: string) {
  if (text.startsWith('\t')) return '\t'
  if (text.startsWith('    ')) return '    '
  if (text.startsWith('　　')) return '　　'
  return ''
}

function selectedTextblockStarts(view: EditorView) {
  const { from, to } = view.state.selection
  const starts: Array<{ pos: number; node: ProseMirrorNode }> = []
  view.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) starts.push({ pos, node })
  })
  return starts
}

function findListItemDepth(
  $from: ResolvedPos,
  listItemType: ProseMirrorNode['type'] | undefined,
) {
  if (!listItemType) return -1
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type === listItemType) return depth
  }
  return -1
}

/**
 * Return whether there is a real block after the current list item. The
 * editor's TrailingNode extension appends an empty paragraph after a list;
 * treating that implementation detail as a forward deletion target creates
 * a surprising new empty list row when Delete is pressed at the end of the
 * final item.
 */
function hasMeaningfulNodeAfterListItem(
  $from: ResolvedPos,
  listItemDepth: number,
) {
  for (let depth = listItemDepth; depth > 0; depth -= 1) {
    const parent = $from.node(depth - 1)
    const index = $from.index(depth - 1)
    for (let siblingIndex = index + 1; siblingIndex < parent.childCount; siblingIndex += 1) {
      const sibling = parent.child(siblingIndex)
      // Only the document-level trailing paragraph is synthetic. Empty
      // paragraphs inside list items remain meaningful editing targets.
      if (
        parent.type.name === 'doc'
        && siblingIndex === parent.childCount - 1
        && sibling.type.name === 'paragraph'
        && sibling.content.size === 0
      ) {
        continue
      }
      return true
    }
  }
  return false
}

/**
 * Handle Delete while the caret is at the end of the first paragraph in a
 * list item. The stock list keymap is intentionally conservative here: in a
 * few boundary cases it treats the editor's trailing paragraph as another
 * list item, or leaves the caret in a newly-created empty paragraph. The
 * behavior layer owns those boundaries so one key press always produces one
 * predictable transaction.
 */
function handleListDelete(
  view: EditorView,
  listItemType: ProseMirrorNode['type'],
  listItemDepth: number,
) {
  const { state } = view
  const { selection } = state
  if (!selection.empty) return false

  const { $from } = selection
  if (!$from.parent.isTextblock || $from.parentOffset !== $from.parent.content.size) {
    return false
  }

  // Delete at the end of a later paragraph is a normal paragraph operation;
  // only the first paragraph marks the list-row boundary.
  if ($from.index(listItemDepth) !== 0) return false

  const currentItem = $from.node(listItemDepth)
  const listDepth = listItemDepth - 1
  const currentList = $from.node(listDepth)
  const currentItemIndex = $from.index(listDepth)
  const nextItem = currentItemIndex + 1 < currentList.childCount
    ? currentList.child(currentItemIndex + 1)
    : null

  // A list item may contain multiple paragraphs. Delete at the end of its
  // first paragraph should join that paragraph with the next paragraph using
  // the normal textblock behavior; it must not be mistaken for the end of the
  // list row.
  const nextBlock = currentItem.childCount > 1 ? currentItem.child(1) : null
  if (
    nextBlock
    && nextBlock.type.name !== 'bulletList'
    && nextBlock.type.name !== 'orderedList'
  ) {
    return false
  }

  // A nested list immediately follows the paragraph. Joining forward here
  // removes that boundary while retaining the nested item's text and marks.
  // Keep the original caret position instead of the implicit near-selection
  // chosen by ProseMirror.
  const nestedList = nextBlock
  if (nestedList && (nestedList.type.name === 'bulletList' || nestedList.type.name === 'orderedList')) {
    let joinedTransaction: Transaction | undefined
    const joined = joinForward(state, transaction => {
      joinedTransaction = transaction
    })
    if (joined && joinedTransaction) {
      const mappedCaret = joinedTransaction.mapping.map(selection.from, -1)
      joinedTransaction.setSelection(
        TextSelection.near(
          joinedTransaction.doc.resolve(
            Math.min(joinedTransaction.doc.content.size, Math.max(1, mappedCaret)),
          ),
          -1,
        ),
      )
      revealListMarker(joinedTransaction, listItemType)
      view.dispatch(joinedTransaction.scrollIntoView())
      return true
    }
  }

  // Adjacent rows in the same list are joined at list-item depth. This keeps
  // nested lists and additional paragraphs intact, unlike a generic forward
  // join which can flatten a child list into the parent row.
  if (nextItem?.type === listItemType) {
    if (joinListItemForward(view, listItemType)) return true
    // A malformed/unsupported row should not fall through to the browser's
    // Delete implementation and create an implicit empty list item.
    return true
  }

  // There is no list row after this item. If no ancestor list has a following
  // row/block, this is the end of the document from the list's perspective;
  // consume Delete as a no-op so the TrailingNode paragraph is not converted
  // into a new list item.
  if (!hasMeaningfulNodeAfterListItem($from, listItemDepth)) return true

  return false
}

/**
 * Join the current list item with its next sibling and keep the caret at the
 * original forward-deletion point. `joinItemForward` in Tiptap performs the
 * same `joinPoint(..., 1)` + depth-2 join, but using the transaction directly
 * lets this behavior layer normalize the selection in every host (Web and
 * Desktop WebView) instead of relying on browser selection mapping.
 */
function joinListItemForward(view: EditorView, listItemType: ProseMirrorNode['type']) {
  const { state } = view
  const { selection } = state
  if (!selection.empty) return false

  const point = joinPoint(state.doc, selection.from, 1)
  if (typeof point !== 'number' || !canJoin(state.doc, point)) return false
  const $point = state.doc.resolve(point)
  if ($point.nodeBefore?.type !== listItemType || $point.nodeAfter?.type !== listItemType) {
    return false
  }

  let transaction: Transaction
  try {
    transaction = state.tr.join(point, 2)
  } catch {
    return false
  }

  const mappedCaret = transaction.mapping.map(selection.from, 1)
  transaction.setSelection(
    TextSelection.near(
      transaction.doc.resolve(
        Math.min(transaction.doc.content.size, Math.max(1, mappedCaret)),
      ),
      -1,
    ),
  )
  revealListMarker(transaction, listItemType)
  view.dispatch(transaction.scrollIntoView())
  return true
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

  if (!selection.$from.parent.isTextblock) {
    if (shiftKey) return true
    view.dispatch(state.tr.insertText(TAB_INDENT).scrollIntoView())
    return true
  }

  if (!selection.empty) {
    const blocks = selectedTextblockStarts(view)
    if (blocks.length === 0) return true

    const transaction = state.tr
    // Apply from the end so the original block positions remain valid. A
    // selected range is indented line-by-line, preserving its text instead of
    // replacing the entire selection with a single tab character.
    for (const { pos, node } of [...blocks].sort((left, right) => right.pos - left.pos)) {
      const blockStart = pos + 1
      if (!shiftKey) {
        transaction.insertText(TAB_INDENT, blockStart)
        continue
      }

      const indent = getLeadingIndent(node.textContent)
      if (indent) transaction.delete(blockStart, blockStart + indent.length)
    }

    if (transaction.steps.length > 0) {
      view.dispatch(transaction.scrollIntoView())
    }
    return true
  }

  if (!shiftKey) {
    view.dispatch(state.tr.insertText(TAB_INDENT).scrollIntoView())
    return true
  }

  // Shift+Tab is an outdent operation, not a browser focus shortcut. Prefer
  // removing an indentation unit immediately before the caret (this keeps the
  // historical `text\t|` behavior), then fall back to the current visual line's
  // leading indentation so `\ttext|` and `    text|` work from any caret offset.
  const textBeforeCursor = selection.$from.parent.textBetween(0, selection.$from.parentOffset, '\n', '￼')
  let indent = getIndentToRemove(textBeforeCursor)
  let deleteFrom = selection.from - indent.length

  if (!indent) {
    const lineStartOffset = textBeforeCursor.lastIndexOf('\n') + 1
    const linePrefix = textBeforeCursor.slice(lineStartOffset)
    indent = getLeadingIndent(linePrefix)
    if (indent) deleteFrom = selection.from - linePrefix.length
  }

  if (!indent) return true

  view.dispatch(
    state.tr
      .delete(deleteFrom, deleteFrom + indent.length)
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
 * Legacy helper for documents that still contain a markerless list item.
 * New Backspace handling exits directly through the Tab-placeholder path.
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

/**
 * Exit an empty nested list row into a literal Tab-indented paragraph.
 *
 * Keeping the Tab in the document is intentional: it gives the user a real
 * editable placeholder (rather than an empty list node that swallows Delete)
 * and lets the markdown handler turn `\t- ` / `\t1. ` back into a nested list.
 */
function convertEmptyNestedListItemToTabPlaceholder(
  view: EditorView,
  listItemDepth: number,
) {
  const { state } = view
  const { $from } = state.selection
  const listDepth = listItemDepth - 1
  if (listDepth <= 0) return false

  const currentList = $from.node(listDepth)
  const listStart = $from.before(listDepth)
  const listEnd = $from.after(listDepth)
  const currentItemIndex = $from.index(listDepth)
  const paragraphType = state.schema.nodes.paragraph
  if (!paragraphType) return false

  const tabMark = state.schema.marks.tabPlaceholder?.create()
  const placeholder = paragraphType.create(
    null,
    state.schema.text(TAB_INDENT, tabMark ? [tabMark] : undefined),
  )
  const transaction = state.tr

  const parentItemDepth = listDepth - 1
  const outerListDepth = listDepth - 2
  const nestedListIndex = parentItemDepth > 0 ? $from.index(parentItemDepth) : -1

  // When the empty row is the final block of its parent item, move the
  // placeholder out of the list tree entirely. A literal Tab then represents
  // exactly one source-level indentation instead of being added to the
  // indentation already supplied by the outer <li>.
  if (
    currentItemIndex === currentList.childCount - 1
    && parentItemDepth > 0
    // Only a two-level list can be represented by a single document-level
    // Tab. For deeper lists, keeping the placeholder inside its parent item
    // preserves the ancestor list indentation and avoids dropping a level.
    && outerListDepth === 1
    && nestedListIndex === $from.node(parentItemDepth).childCount - 1
  ) {
    const parentItem = $from.node(parentItemDepth)
    const outerList = $from.node(outerListDepth)
    const outerItemIndex = $from.index(outerListDepth)
    const parentChildren: ProseMirrorNode[] = []
    parentItem.forEach((child) => parentChildren.push(child))
    const nestedItemsBeforeCurrent = Array.from(
      { length: currentItemIndex },
      (_, index) => currentList.child(index),
    )
    const nestedListBeforeCurrent = nestedItemsBeforeCurrent.length > 0
      ? currentList.copy(Fragment.fromArray(nestedItemsBeforeCurrent))
      : null
    parentChildren.splice(
      nestedListIndex,
      1,
      ...(nestedListBeforeCurrent ? [nestedListBeforeCurrent] : []),
    )
    const parentItemWithoutNestedList = parentItem.type.create(
      parentItem.attrs,
      Fragment.fromArray(parentChildren),
    )

    const beforeItems = Array.from({ length: outerItemIndex }, (_, index) => outerList.child(index))
    beforeItems.push(parentItemWithoutNestedList)
    const afterItems = Array.from(
      { length: outerList.childCount - outerItemIndex - 1 },
      (_, index) => outerList.child(outerItemIndex + 1 + index),
    )
    const outerListStart = $from.before(outerListDepth)
    const outerListEnd = $from.after(outerListDepth)
    const replacement: ProseMirrorNode[] = [
      outerList.copy(Fragment.fromArray(beforeItems)),
      placeholder,
    ]
    if (afterItems.length > 0) {
      replacement.push(outerList.copy(Fragment.fromArray(afterItems)))
    }

    transaction.replaceWith(outerListStart, outerListEnd, Fragment.fromArray(replacement))
    const placeholderStart = outerListStart + replacement[0].nodeSize
    transaction.setSelection(
      TextSelection.near(
        transaction.doc.resolve(Math.min(transaction.doc.content.size, placeholderStart + 2)),
      ),
    )
    view.dispatch(transaction.scrollIntoView())
    return true
  }

  const replacement: ProseMirrorNode[] = []

  if (currentItemIndex > 0) {
    replacement.push(currentList.copy(
      Fragment.fromArray(Array.from({ length: currentItemIndex }, (_, index) => currentList.child(index))),
    ))
  }

  // Keep the placeholder exactly where the removed list marker was. When
  // there are rows on both sides, split the nested list instead of appending
  // the paragraph after the whole list.
  replacement.push(placeholder)

  if (currentItemIndex + 1 < currentList.childCount) {
    replacement.push(currentList.copy(
      Fragment.fromArray(Array.from(
        { length: currentList.childCount - currentItemIndex - 1 },
        (_, index) => currentList.child(currentItemIndex + 1 + index),
      )),
    ))
  }

  transaction.replaceWith(listStart, listEnd, Fragment.fromArray(replacement))
  const placeholderOffset = currentItemIndex > 0
    ? replacement[0].nodeSize
    : 0
  transaction.setSelection(
    TextSelection.near(
      transaction.doc.resolve(
        Math.min(transaction.doc.content.size, Math.max(1, listStart + placeholderOffset + 2)),
      ),
    ),
  )

  view.dispatch(transaction.scrollIntoView())
  return true
}

function findParentListItemDepth($from: ResolvedPos, listItemType: ProseMirrorNode['type']) {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type === listItemType) return depth
  }
  return -1
}

/** Convert a Tab-indented placeholder paragraph back into a nested list. */
function restoreTabPlaceholderAsList(
  view: EditorView,
  marker: ListMarker,
  typedMarker?: string,
) {
  const { state } = view
  const { $from } = state.selection
  const listItemType = state.schema.nodes.listItem
  const listType = state.schema.nodes[marker.listName]
  const paragraph = $from.parent
  if (!listItemType || !listType || paragraph.type.name !== 'paragraph') return false

  const parentListItemDepth = findParentListItemDepth($from, listItemType)
  const expectedText = typedMarker ? `${TAB_INDENT}${typedMarker}` : TAB_INDENT
  if (paragraph.textContent !== TAB_INDENT && paragraph.textContent !== expectedText) return false

  // A placeholder that was lifted out of a completed nested list sits at the
  // document level, immediately after the outer list. Reattach its marker
  // as a nested list on that outer list's final item.
  if (parentListItemDepth <= 0 && $from.depth === 1 && $from.index(0) > 0) {
    const previousIndex = $from.index(0) - 1
    const outerList = $from.node(0).child(previousIndex)
    const outerLastItem = outerList.lastChild
    if (
      (outerList.type.name === 'bulletList' || outerList.type.name === 'orderedList')
      && outerLastItem?.type === listItemType
    ) {
      const nestedItem = listItemType.create({}, [state.schema.nodes.paragraph.create()])
      const nestedList = listType.create(
        marker.listName === 'orderedList' ? { start: marker.start ?? 1 } : undefined,
        [nestedItem],
      )
      const updatedOuterItem = outerLastItem.copy(
        outerLastItem.content.append(Fragment.from(nestedList)),
      )
      const updatedOuterList = outerList.copy(
        outerList.content.replaceChild(outerList.childCount - 1, updatedOuterItem),
      )
      const paragraphStart = $from.before($from.depth)
      const paragraphEnd = $from.after($from.depth)
      const outerListStart = paragraphStart - outerList.nodeSize
      const transaction = state.tr.delete(paragraphStart, paragraphEnd)
      const mappedOuterListStart = transaction.mapping.map(outerListStart, -1)
      transaction.replaceWith(
        mappedOuterListStart,
        mappedOuterListStart + outerList.nodeSize,
        updatedOuterList,
      )
      transaction.setSelection(
        TextSelection.near(
          transaction.doc.resolve(
            Math.min(transaction.doc.content.size, mappedOuterListStart + updatedOuterList.nodeSize - 2),
          ),
        ),
      )
      view.dispatch(transaction.scrollIntoView())
      return true
    }
    return false
  }

  if (parentListItemDepth <= 0 || $from.index(parentListItemDepth) === 0) return false

  const paragraphStart = $from.before($from.depth)
  const paragraphEnd = $from.after($from.depth)
  const item = listItemType.create({}, [state.schema.nodes.paragraph.create()])
  const nestedList = listType.create(
    marker.listName === 'orderedList' ? { start: marker.start ?? 1 } : undefined,
    [item],
  )
  const transaction = state.tr.replaceWith(paragraphStart, paragraphEnd, nestedList)
  transaction.setSelection(
    TextSelection.near(
      transaction.doc.resolve(
        Math.min(transaction.doc.content.size, Math.max(1, paragraphStart + 3)),
      ),
    ),
  )
  view.dispatch(transaction.scrollIntoView())
  return true
}

/**
 * Re-enable a marker typed on a markerless placeholder. Keeping this as a
 * list-row operation (instead of lifting the row) preserves the visual Tab
 * indentation and lets `- ` / `1. ` choose the nested list type in place.
 */
function restoreHiddenListItem(
  view: EditorView,
  listItemDepth: number,
  marker: ListMarker,
  markerRange?: { from: number; to: number },
) {
  const { state } = view
  const { $from } = state.selection
  const listDepth = listItemDepth - 1
  if (listDepth <= 0) return false

  const currentList = $from.node(listDepth)
  const currentItemIndex = $from.index(listDepth)
  const targetListType = state.schema.nodes[marker.listName]
  if (!targetListType || currentItemIndex < 0 || currentItemIndex >= currentList.childCount) {
    return false
  }

  const listStart = $from.before(listDepth)
  const listEnd = $from.after(listDepth)
  const transaction = state.tr
  if (markerRange) transaction.delete(markerRange.from, markerRange.to)

  const mappedListStart = transaction.mapping.map(listStart)
  const mappedListEnd = transaction.mapping.map(listEnd)
  const listNode = transaction.doc.nodeAt(mappedListStart)
  if (!listNode || listNode.type !== currentList.type) return false

  const currentItem = listNode.child(currentItemIndex)
  const visibleItem = currentItem.type.create(
    { ...currentItem.attrs, markerHidden: false },
    currentItem.content,
  )

  // When the marker type is unchanged, only reveal the row. An ordered marker
  // that restarts numbering in the middle of an existing list instead splits
  // the list below, so earlier rows keep their numbering.
  const isOrderedRestart = listNode.type === targetListType
    && marker.listName === 'orderedList'
    && marker.start !== Number(listNode.attrs.start ?? 1) + currentItemIndex
  if (listNode.type === targetListType && !isOrderedRestart) {
    const listAttrs = marker.listName === 'orderedList'
      ? { ...listNode.attrs, start: marker.start ?? Number(listNode.attrs.start ?? 1) }
      : listNode.attrs
    transaction.setNodeMarkup(mappedListStart, targetListType, listAttrs)
    const mappedItemStart = transaction.mapping.map($from.before(listItemDepth))
    transaction.setNodeMarkup(mappedItemStart, currentItem.type, visibleItem.attrs)
    const mappedCaret = transaction.mapping.map($from.pos, -1)
    transaction.setSelection(
      TextSelection.near(
        transaction.doc.resolve(
          Math.min(transaction.doc.content.size, Math.max(1, mappedCaret)),
        ),
      ),
    )
    view.dispatch(transaction.scrollIntoView())
    return true
  }

  // A different marker (`1. ` on a bullet row, or `- ` on an ordered row)
  // starts a sibling list at the same indentation. Split the current list
  // around the placeholder so preceding/following rows keep their structure.
  const children = Array.from({ length: listNode.childCount }, (_, index) => listNode.child(index))
  const beforeChildren = children.slice(0, currentItemIndex)
  const afterChildren = children.slice(currentItemIndex + 1)
  const beforeList = beforeChildren.length > 0
    ? listNode.copy(Fragment.fromArray(beforeChildren))
    : null
  const afterList = afterChildren.length > 0
    ? listNode.type.create(
        listNode.type.name === 'orderedList'
          ? {
              ...listNode.attrs,
              start: Number(listNode.attrs.start ?? 1) + currentItemIndex + 1,
            }
          : listNode.attrs,
        Fragment.fromArray(afterChildren),
      )
    : null

  const targetList = targetListType.create(
    marker.listName === 'orderedList'
      ? { start: marker.start ?? 1 }
      : undefined,
    [visibleItem],
  )
  const replacement = [beforeList, targetList, afterList].filter(
    (node): node is ProseMirrorNode => node !== null,
  )
  transaction.replaceWith(mappedListStart, mappedListEnd, Fragment.fromArray(replacement))

  const targetListStart = mappedListStart + (beforeList?.nodeSize ?? 0)
  const targetCaret = targetListStart + 3
  transaction.setSelection(
    TextSelection.near(
      transaction.doc.resolve(
        Math.min(transaction.doc.content.size, Math.max(1, targetCaret)),
      ),
    ),
  )
  view.dispatch(transaction.scrollIntoView())
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

  return moveFirstListItemToPreviousList(view, listItemDepth, currentList.type.name as ListName, {
    orderedStart: currentList.type.name === 'orderedList'
      ? Number(currentList.attrs.start ?? 1)
      : undefined,
  })
}

/**
 * Move the first row of a list below the last row of the preceding list. This
 * is the missing half of ProseMirror's `sinkListItem`: a first row has no
 * previous sibling in its own list, but Typora still lets it be indented under
 * the previous adjacent list. The target list type is explicit so a bullet
 * and ordered list can be mixed without flattening either one.
 */
function moveFirstListItemToPreviousList(
  view: EditorView,
  listItemDepth: number,
  targetListName: ListName,
  options: {
    orderedStart?: number
    markerRange?: { from: number; to: number }
  } = {},
) {
  const { state } = view
  const { $from } = state.selection
  const listDepth = listItemDepth - 1
  const parentDepth = listDepth - 1
  if (listDepth <= 0 || parentDepth < 0 || $from.index(listDepth) !== 0) return false

  const parent = $from.node(parentDepth)
  const listIndex = $from.index(parentDepth)
  if (listIndex <= 0) return false

  const previousList = parent.child(listIndex - 1)
  const currentList = $from.node(listDepth)
  const targetListType = state.schema.nodes[targetListName]
  if (!targetListType || !['bulletList', 'orderedList'].includes(previousList.type.name)) return false

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
  const canAppendToExistingList = Boolean(
    existingNestedList && existingNestedList.type === targetListType,
  )
  const transaction = state.tr
  if (options.markerRange) transaction.delete(options.markerRange.from, options.markerRange.to)

  const mappedCurrentItemStart = transaction.mapping.map(currentItemStart)
  const mappedCurrentItemEnd = transaction.mapping.map(currentItemEnd)
  const currentItem = transaction.doc.nodeAt(mappedCurrentItemStart)
  if (!currentItem) return false
  const itemToInsert = currentItem.attrs.markerHidden === true
    ? currentItem.type.create({ ...currentItem.attrs, markerHidden: false }, currentItem.content)
    : currentItem
  const orderedStart = options.orderedStart && options.orderedStart > 0
    ? Math.floor(options.orderedStart)
    : 1
  const targetList = targetListType.create(
    targetListName === 'orderedList'
      ? {
          ...(currentList.type === targetListType ? currentList.attrs : {}),
          start: orderedStart,
        }
      : undefined,
    [itemToInsert],
  )

  transaction.delete(
    currentList.childCount === 1 ? transaction.mapping.map(currentListStart) : mappedCurrentItemStart,
    currentList.childCount === 1 ? transaction.mapping.map(currentListEnd) : mappedCurrentItemEnd,
  )

  // Removing the first row from an ordered list must advance its start value,
  // otherwise the remaining rows unexpectedly jump back to 1 after a Tab.
  if (currentList.type.name === 'orderedList' && currentList.childCount > 1) {
    const nextListStart = transaction.mapping.map(currentListStart)
    const nextList = transaction.doc.nodeAt(nextListStart)
    if (nextList?.type.name === 'orderedList') {
      transaction.setNodeMarkup(nextListStart, undefined, {
        ...nextList.attrs,
        start: Math.max(1, Number(nextList.attrs.start ?? 1) + 1),
      })
    }
  }

  // The preceding list is before the deleted range, so its position is stable.
  // Insert before the parent item's closing token (or before the nested list's
  // closing token when appending to an existing list).
  const insertionPosition = canAppendToExistingList
    ? previousItemEnd - 2
    : previousItemEnd - 1
  transaction.insert(insertionPosition, canAppendToExistingList ? itemToInsert : targetList)

  const insertedTextPosition = insertionPosition + (canAppendToExistingList ? 2 : 3)
  transaction.setSelection(
    TextSelection.near(
      transaction.doc.resolve(
        Math.min(transaction.doc.content.size, Math.max(1, insertedTextPosition)),
      ),
    ),
  )
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
  targetListName: ListName,
  options: {
    orderedStart?: number
    markerRange?: { from: number; to: number }
  } = {},
) {
  const { state } = view
  const { $from } = state.selection
  const listDepth = listItemDepth - 1
  if (listDepth <= 0) return false

  const currentList = $from.node(listDepth)
  const currentItemIndex = $from.index(listDepth)

  // A marker typed in the first item of a list has no previous sibling in the
  // current list. If there is an adjacent list immediately before it, apply
  // the same cross-list nesting used by Tab. This is what makes
  // `- A\n1. |` and `1. A\n- |` behave like Typora instead of leaving the
  // literal marker in a top-level row.
  if (currentItemIndex === 0) {
    return moveFirstListItemToPreviousList(view, listItemDepth, targetListName, options)
  }

  const currentItemStart = $from.before(listItemDepth)
  const currentItemEnd = $from.after(listItemDepth)
  const transaction = state.tr

  // Some WebViews report the marker and the trailing space as two separate
  // events. Remove the marker in the same transaction as the structural move
  // so one user gesture remains one undo unit and the marker is never moved
  // into the nested item by accident.
  if (options.markerRange) {
    transaction.delete(options.markerRange.from, options.markerRange.to)
  }

  const mappedCurrentItemStart = transaction.mapping.map(currentItemStart)
  const mappedCurrentItemEnd = transaction.mapping.map(currentItemEnd)
  const currentItem = transaction.doc.nodeAt(mappedCurrentItemStart)
  if (!currentItem) return false
  const previousItem = currentList.child(currentItemIndex - 1)
  const targetListType = state.schema.nodes[targetListName]
  if (!targetListType || previousItem.type !== currentItem.type) return false

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
  transaction.delete(mappedCurrentItemStart, mappedCurrentItemEnd)

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
    const orderedStart = options.orderedStart && options.orderedStart > 0
      ? Math.floor(options.orderedStart)
      : 1
    const targetList = targetListType.create(
      targetListName === 'orderedList'
        ? {
            ...(currentList.type === targetListType ? currentList.attrs : {}),
            start: orderedStart,
          }
        : undefined,
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
        // Use the ProseMirror command directly so the split, marker
        // normalization and carried marks are committed as one transaction.
        // Calling editor.commands.splitListItem() first would dispatch once,
        // then require a second transaction for marker/mark repair, producing
        // an unexpected extra undo step for a single Enter key.
        return splitListItemKeepMarks(this.type)(state, transaction => {
          // A hidden marker is only a temporary state for an empty placeholder
          // row. A newly split row must always show its own list marker.
          revealListMarker(transaction, this.type)
          if (carriedMarks.length > 0) transaction.setStoredMarks(carriedMarks)
          editor.view.dispatch(transaction)
        })
      },
      // Tab/Shift-Tab are handled by editorProps.handleKeyDown below. Keeping
      // them here as well would steal Tab navigation from lists inside tables,
      // because the node shortcut would run after handleKeyDown returns false.
    }
  },
})

function isMergeableListPair(first: ProseMirrorNode, second: ProseMirrorNode) {
  if (first.type !== second.type) return false
  if (first.type.name === 'bulletList') return first.sameMarkup(second)
  if (first.type.name !== 'orderedList') return false
  if (first.sameMarkup(second)) return true

  // `start` is presentation state, not a reason to keep two sequential
  // ordered lists separate. Merge the common cases (`1.` + `1.` from HTML,
  // and an explicit continuation such as `3.` + `4.`), while preserving an
  // intentional restart (`3.` + `1.`).
  const firstStart = Number(first.attrs.start ?? 1)
  const secondStart = Number(second.attrs.start ?? 1)
  const sameNonStartAttrs = Object.keys(first.attrs).every((key) => (
    key === 'start' || first.attrs[key] === second.attrs[key]
  )) && Object.keys(second.attrs).every((key) => (
    key === 'start' || first.attrs[key] === second.attrs[key]
  ))
  if (!sameNonStartAttrs) return false
  return secondStart === firstStart + first.childCount
}

function isListNode(node: ProseMirrorNode | null | undefined) {
  return node?.type.name === 'bulletList' || node?.type.name === 'orderedList'
}

/**
 * Backspace at the first character of a list item normally lifts that item.
 * When an empty paragraph separates it from a preceding list, the paragraph
 * is the boundary the user is deleting. Remove it first, and only join the
 * lists when their list types are compatible.
 */
function removeSpacerBeforeListItem(
  view: EditorView,
  listItemType: ProseMirrorNode['type'],
  listItemDepth: number,
) {
  const { state } = view
  const { selection } = state
  if (!selection.empty || !selection.$from.parent.isTextblock || selection.$from.parentOffset !== 0) {
    return false
  }

  const { $from } = selection
  if (listItemDepth <= 0 || $from.index(listItemDepth) !== 0) return false

  const listDepth = listItemDepth - 1
  const parentDepth = listDepth - 1
  if (parentDepth < 0) return false

  const parent = $from.node(parentDepth)
  const listIndex = $from.index(parentDepth)
  if (listIndex < 2) return false

  const currentList = parent.child(listIndex)
  const spacer = parent.child(listIndex - 1)
  const previousList = parent.child(listIndex - 2)
  if (
    !isListNode(currentList)
    || !isListNode(previousList)
    || spacer.type.name !== 'paragraph'
    || spacer.content.size !== 0
  ) {
    return false
  }

  const currentListStart = $from.before(listDepth)
  const spacerStart = currentListStart - spacer.nodeSize
  const previousListStart = spacerStart - previousList.nodeSize
  const transaction = state.tr.delete(spacerStart, currentListStart)
  const boundary = transaction.mapping.map(currentListStart, -1)
  const canMerge = isMergeableListPair(previousList, currentList)

  if (canMerge) {
    if (
      currentList.type.name === 'orderedList'
      && !previousList.sameMarkup(currentList)
    ) {
      transaction.setNodeMarkup(boundary, currentList.type, previousList.attrs)
    }
    if (canJoin(transaction.doc, boundary)) transaction.join(boundary)
  }

  let lastTextEnd = -1
  previousList.descendants((node, pos) => {
    if (node.isText) lastTextEnd = pos + node.nodeSize
  })
  const targetPosition = lastTextEnd >= 0
    ? transaction.mapping.map(previousListStart + 1 + lastTextEnd, -1)
    : transaction.mapping.map(selection.from, -1)
  transaction.setSelection(
    TextSelection.near(
      transaction.doc.resolve(
        Math.min(transaction.doc.content.size, Math.max(1, targetPosition)),
      ),
    ),
  )
  view.dispatch(transaction.scrollIntoView())
  return true
}

export const MergeAdjacentLists = Extension.create({
  name: 'mergeAdjacentLists',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('mergeAdjacentLists'),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some(transaction => transaction.docChanged)) return null

          const boundaries: Array<{
            position: number
            first: ProseMirrorNode
            second: ProseMirrorNode
          }> = []
          newState.doc.descendants((node, pos, parent, index) => {
            if (!parent || index >= parent.childCount - 1) return

            const nextNode = parent.child(index + 1)
            if (isMergeableListPair(node, nextNode)) {
              boundaries.push({ position: pos + node.nodeSize, first: node, second: nextNode })
            }
          })

          if (boundaries.length === 0) return null

          // Join from the end so earlier positions remain valid as nodes collapse.
          const transaction = newState.tr
          for (const boundary of boundaries.sort((left, right) => right.position - left.position)) {
            // ProseMirror joins only nodes with identical markup. Normalize a
            // sequential ordered list's start attr immediately before the
            // join; the first list's start remains the source of truth.
            if (
              boundary.first.type.name === 'orderedList'
              && !boundary.first.sameMarkup(boundary.second)
            ) {
              const secondPos = boundary.position
              transaction.setNodeMarkup(secondPos, boundary.second.type, boundary.first.attrs)
            }
            if (canJoin(transaction.doc, boundary.position)) transaction.join(boundary.position)
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
    if (view.composing) return false

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
    const hasTabPlaceholder = textBeforeInput === TAB_INDENT
      || textBeforeInput.startsWith(TAB_INDENT)
    const markerTextBeforeInput = textBeforeInput.startsWith(TAB_INDENT)
      ? textBeforeInput.slice(TAB_INDENT.length)
      : textBeforeInput
    const completeMarker = LIST_MARKER_WITH_SPACE_PATTERN.test(text)
    const splitMarker = /^[ \t]$/.test(text) && LIST_MARKER_PATTERN.test(markerTextBeforeInput)
    if (!completeMarker && !splitMarker) return false
    if (completeMarker && $from.parentOffset !== 0 && !hasTabPlaceholder) return false
    if (completeMarker && $from.parent.content.size !== 0 && !hasTabPlaceholder) return false

    const marker = parseListMarker(splitMarker ? markerTextBeforeInput : text.trim())
    if (!marker) return false

    if (hasTabPlaceholder && $from.parent.textContent === TAB_INDENT) {
      return restoreTabPlaceholderAsList(view, marker, completeMarker ? text.trim() : undefined)
    }
    if (hasTabPlaceholder && splitMarker) {
      return restoreTabPlaceholderAsList(view, marker, markerTextBeforeInput)
    }

    const listItemDepth = findListItemDepth($from, listItemType)
    if (listItemDepth <= 0 || $from.index(listItemDepth) !== 0) return false

    const currentListItem = $from.node(listItemDepth)
    if (currentListItem.attrs.markerHidden === true
      && currentListItem.firstChild === $from.parent
      && currentListItem.firstChild.content.size === 0) {
      return restoreHiddenListItem(view, listItemDepth, marker, splitMarker
        ? { from: from - textBeforeInput.length, to: from }
        : undefined)
    }

    return nestListItemAsType(view, listItemDepth, marker.listName, {
      orderedStart: marker.start,
      markerRange: splitMarker
        ? { from: from - textBeforeInput.length, to: from }
        : undefined,
    })
  }

  const handleKeyDown: ListEditorHandlers['handleKeyDown'] = (view, event) => {
    if (view.composing) return false

    if (isAiTaskLocked()) return true

    const { $from, empty } = view.state.selection
    const listItemType = view.state.schema.nodes.listItem
    const listItemDepth = findListItemDepth($from, listItemType)

    // WebViews can deliver the trailing space as a keydown without a
    // preceding handleTextInput callback. Mirror the input-rule path here
    // so `- ` still creates a nested bullet in those hosts.
    if (event.key === ' ' && empty && $from.parent.isTextblock) {
      const markerText = $from.parent.textBetween(0, $from.parentOffset)
      const hasTabPlaceholder = markerText.startsWith(TAB_INDENT)
      const markerWithoutTab = hasTabPlaceholder ? markerText.slice(TAB_INDENT.length) : markerText
      const isDocumentTabPlaceholder = hasTabPlaceholder
        && $from.depth === 1
        && listItemDepth <= 0
      if (
        LIST_MARKER_PATTERN.test(markerWithoutTab)
        && $from.parent.content.size === markerText.length
        && (listItemDepth > 0 || isDocumentTabPlaceholder)
      ) {
        const marker = parseListMarker(markerWithoutTab)
        if (!marker) return true
        if (hasTabPlaceholder && $from.parent.textContent === `${TAB_INDENT}${markerWithoutTab}`) {
          const handled = restoreTabPlaceholderAsList(view, marker, markerWithoutTab)
          if (handled) {
            event.preventDefault()
            return true
          }
        }
        // A document-level Tab placeholder has no list-item ancestor to
        // mutate. If it is not immediately after a list, leave the event to
        // ProseMirror instead of resolving an invalid negative depth below.
        if (isDocumentTabPlaceholder) return false
        const currentListItem = $from.node(listItemDepth)
        const markerRange = { from: $from.pos - markerText.length, to: $from.pos }
        const handled = currentListItem.attrs.markerHidden === true
          ? restoreHiddenListItem(view, listItemDepth, marker, markerRange)
          : nestListItemAsType(view, listItemDepth, marker.listName, {
              orderedStart: marker.start,
              markerRange,
            })
        if (handled) {
          event.preventDefault()
          return true
        }
        return false
      }
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      // Modified deletion shortcuts (Ctrl/Cmd/Alt + Delete/Backspace) retain
      // ProseMirror's word/selection semantics. Structural list transitions
      // are reserved for the unmodified keys so a Ctrl+Delete at an item end
      // cannot unexpectedly merge two rows.
      if (event.ctrlKey || event.metaKey || event.altKey) return false

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

        if (
          previousNode.type.name === 'orderedList'
          && !previousNode.sameMarkup(nextNode)
        ) {
          // The lists are semantically sequential but carry different `start`
          // attrs. Normalize the second list before joining, matching the
          // append-transaction merge path above.
          transaction.setNodeMarkup(listBoundary, nextNode.type, previousNode.attrs)
        }

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
              // Descendant positions are relative to the list's content, so
              // include the list's opening token when converting to a document
              // position. Map backwards to keep the caret on that text end.
              const mapped = transaction.mapping.map(previousListStart + 1 + lastTextEnd, -1)
              transaction.setSelection(
                TextSelection.near(transaction.doc.resolve(mapped)),
              )
            } else {
              const mappedBoundary = transaction.mapping.map(listBoundary, -1)
              transaction.setSelection(
                TextSelection.near(
                  transaction.doc.resolve(
                    Math.min(transaction.doc.content.size, Math.max(0, mappedBoundary)),
                  ),
                  -1,
                ),
              )
            }
          }
          event.preventDefault()
          view.dispatch(transaction.scrollIntoView())
          return true
        }
      }

      if (event.key === 'Backspace' && listItemType && listItemDepth > 0) {
        if (removeSpacerBeforeListItem(view, listItemType, listItemDepth)) {
          event.preventDefault()
          return true
        }
      }

      // Delete at an empty nested row exits directly to a literal Tab
      // placeholder. Unlike Backspace, Delete has no marker-hidden
      // intermediate state, so one press is enough to leave an editable
      // indentation and the next input can be `- ` / `1. `.
      const isEmptyNestedListItemForDelete = event.key === 'Delete'
        && empty
        && $from.parent.isTextblock
        && $from.parentOffset === 0
        && listItemDepth === $from.depth - 1
        && $from.index(listItemDepth) === 0
        && listItemDepth > 1
        && $from.node(listItemDepth - 2).type === listItemType
        && $from.node(listItemDepth).firstChild?.type.name === 'paragraph'
        && $from.node(listItemDepth).firstChild?.content.size === 0

      if (isEmptyNestedListItemForDelete) {
        event.preventDefault()
        convertEmptyNestedListItemToTabPlaceholder(view, listItemDepth)
        return true
      }

      if (event.key === 'Delete' && listItemType && listItemDepth > 0) {
        const handled = handleListDelete(view, listItemType, listItemDepth)
        if (handled) {
          event.preventDefault()
          return true
        }
      }

      // A list item may contain more than one paragraph. Backspace at the
      // start of a later paragraph joins it to the paragraph above; it must
      // not be interpreted as an outdent of the entire list item.
      const isAtStartOfLaterListParagraph = empty
        && $from.parent.isTextblock
        && $from.parentOffset === 0
        && listItemDepth === $from.depth - 1
        && $from.index(listItemDepth) > 0

      if (isAtStartOfLaterListParagraph) {
        let joinedTransaction: Transaction | undefined
        const joined = joinBackward(view.state, transaction => {
          joinedTransaction = transaction
        })
        if (!joined || !joinedTransaction) return false
        event.preventDefault()
        view.dispatch(joinedTransaction.scrollIntoView())
        return true
      }

      // Synthetic keyboard events used by desktop automation do not always
      // reach ProseMirror's built-in text deletion keymap. Keep ordinary
      // character deletion deterministic inside list paragraphs.
      if (
        event.key === 'Backspace'
        && empty
        && $from.parent.isTextblock
        && $from.parentOffset > 0
        && listItemDepth > 0
      ) {
        event.preventDefault()
        view.dispatch(view.state.tr.delete(view.state.selection.from - 1, view.state.selection.from).scrollIntoView())
        return true
      }

      // 光标位于列表项第一个段落行首时接管 Backspace，行为与 Typora 一致：
      // 空的嵌套项直接退出列表，恢复为原列表符号位置的 Tab 占位段落；
      // 有内容的嵌套项仍按原有规则逐级退位，顶层项则转回普通段落。
      const isAtListItemTextStart = empty
        && $from.parent.isTextblock
        && $from.parentOffset === 0
        && listItemDepth === $from.depth - 1
        // Only the first paragraph of a list item is a list row boundary.
        // A later paragraph belongs to the same item and should use the
        // editor's normal paragraph-join behavior instead of lifting the row.
        && $from.index(listItemDepth) === 0

      if (!isAtListItemTextStart) return false

      const currentListItem = $from.node(listItemDepth)
      const isNestedListItem = listItemDepth > 1
        && $from.node(listItemDepth - 2).type === listItemType
      const isEmptyListItem = currentListItem.firstChild?.type.name === 'paragraph'
        && currentListItem.firstChild.content.size === 0

      if (isNestedListItem && isEmptyListItem) {
        event.preventDefault()
        // One Backspace is enough: replace the empty nested list row with a
        // literal Tab-indented paragraph at the same visual depth. Typing
        // `- ` or `1. ` afterwards can recreate a nested list in place.
        convertEmptyNestedListItemToTabPlaceholder(view, listItemDepth)
        return true
      }

      // Non-empty nested rows and top-level rows use the normal one-level lift
      // command, matching Shift+Tab without merging or deleting a sibling row.
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
      if (empty && !event.shiftKey && sinkListItemIntoPreviousList(view, listItemDepth)) {
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
