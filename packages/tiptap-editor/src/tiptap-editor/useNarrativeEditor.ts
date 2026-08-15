/**
 * Hook for creating and configuring TipTap editor instance
 */
'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useEditor } from '@tiptap/react'
import { Extension, mergeAttributes, Node, type JSONContent } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list'
import { canJoin } from '@tiptap/pm/transform'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { ResizableImage } from '../tiptap-extensions/ResizableImage'
import { PastedStyleMark } from '../tiptap-extensions/PastedStyleMark'
import { PastedBlockStyle } from '../tiptap-extensions/PastedBlockStyle'
import { StyledHorizontalRule } from '../tiptap-extensions/StyledHorizontalRule'
import { MediaEmbed } from '../tiptap-extensions/MediaEmbed'
import { StoryLinkCard } from '../tiptap-extensions/StoryLinkCard'
import { ImageUploadPlaceholder } from '../tiptap-extensions/ImageUploadPlaceholder'
import type { NarrativeEditorRuntime } from '../runtime'
import { parseMediaEmbedInfo } from '../lib/media-embed'
import { buildStoryLinkCardAttrs, parseStoryLink } from '../lib/story-link-card'
import { convertMarkdownToHtml, isMarkdownContent } from './markdown-converter'
import { TAB_INDENT } from './editor-constants'

const MarkerHiddenListItem = Node.create({
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
      Enter: () => this.editor.commands.splitListItem(this.name),
      Tab: () => this.editor.commands.sinkListItem(this.name),
      'Shift-Tab': () => this.editor.commands.liftListItem(this.name),
    }
  },
})

function isMergeableListPair(first: ProseMirrorNode, second: ProseMirrorNode) {
  return (
    (first.type.name === 'orderedList' || first.type.name === 'bulletList')
    && first.sameMarkup(second)
  )
}

const MergeAdjacentLists = Extension.create({
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

function updateStoryLinkCardNode(
  view: EditorView,
  storyId: string,
  attrs: object,
) {
  const storyLinkCardType = view.state.schema.nodes.storyLinkCard
  if (!storyLinkCardType) return

  let targetPos: number | null = null
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'storyLinkCard' && node.attrs.storyId === storyId) {
      targetPos = pos
      return false
    }
    return true
  })

  if (targetPos === null) return
  view.dispatch(view.state.tr.setNodeMarkup(targetPos, storyLinkCardType, attrs))
}

interface UseNarrativeEditorOptions {
  value: string
  jsonValue?: JSONContent | null
  onChange: (value: string) => void
  onJsonChange?: (value: JSONContent) => void
  placeholder?: string
  onPasteFiles?: (files: File[]) => void | Promise<void>
  token?: string | null
  t: (key: string) => string
  getAdminStory: NarrativeEditorRuntime['getAdminStory']
  isAiTaskLocked: boolean
  /** 文档内容版本号：宿主在「整篇内容替换」（切换文章 / 草稿恢复）时递增，
   *  驱动编辑器原地重置内容，避免通过 key 重挂载造成占位闪烁（沉浸模式下表现像页面刷新） */
  contentVersion?: string | number
}

export function useNarrativeEditor({
  value,
  jsonValue,
  onChange,
  onJsonChange,
  placeholder,
  onPasteFiles,
  token,
  t,
  getAdminStory,
  isAiTaskLocked,
  contentVersion,
}: UseNarrativeEditorOptions) {
  const currentValueRef = useRef(value)
  const onPasteFilesRef = useRef(onPasteFiles)
  const tokenRef = useRef(token)
  // 编辑器实例只创建一次，粘贴回调经 ref 取最新实现
  const getAdminStoryRef = useRef(getAdminStory)
  const isAiTaskLockedRef = useRef(isAiTaskLocked)

  useEffect(() => {
    currentValueRef.current = value
  }, [value])

  useEffect(() => {
    onPasteFilesRef.current = onPasteFiles
  }, [onPasteFiles])

  useEffect(() => {
    tokenRef.current = token
  }, [token])

  useEffect(() => {
    getAdminStoryRef.current = getAdminStory
  }, [getAdminStory])

  useEffect(() => {
    isAiTaskLockedRef.current = isAiTaskLocked
  }, [isAiTaskLocked])

  // 记录最近一次已应用的内容版本，仅在版本号变化时原地替换文档
  const lastContentVersionRef = useRef<string | number | undefined>(contentVersion)

  const processedContent = useCallback(() => {
    if (jsonValue) return jsonValue
    if (!value) return ''
    if (isMarkdownContent(value)) {
      return convertMarkdownToHtml(value)
    }
    return value
  }, [jsonValue, value])

  const editor = useEditor({
    extensions: [
      PastedBlockStyle,
      StarterKit.configure({
        horizontalRule: false,
        listItem: false,
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      MarkerHiddenListItem,
      MergeAdjacentLists,
      StyledHorizontalRule,
      Placeholder.configure({
        placeholder: placeholder || t('editor.placeholder'),
        emptyEditorClass: 'is-editor-empty',
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline',
        },
      }),
      ResizableImage.configure({
        resize: {
          enabled: true,
          directions: ['bottom-left', 'bottom-right', 'top-left', 'top-right'],
          minWidth: 100,
          minHeight: 100,
          alwaysPreserveAspectRatio: true,
        },
      }),
      MediaEmbed,
      StoryLinkCard,
      ImageUploadPlaceholder,
      Underline,
      PastedStyleMark,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'border-collapse table-auto w-full',
        },
      }),
      TableRow,
      TableCell.configure({
        HTMLAttributes: {
          class: 'border border-border p-2',
        },
      }),
      TableHeader.configure({
        HTMLAttributes: {
          class: 'border border-border bg-muted p-2 font-bold',
        },
      }),
    ],
    content: processedContent() || '',
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      // 内容未变化时（例如扩展合成的空事务）不向上游广播，避免宿主误判为「已修改」。
      if (html === currentValueRef.current) return
      currentValueRef.current = html
      onChange(html)
      onJsonChange?.(editor.getJSON())
    },
    editorProps: {
      attributes: {
        class: 'tiptap focus:outline-none',
        autocapitalize: 'off',
      },
      handlePaste: (view, event) => {
        if (isAiTaskLockedRef.current) return true

        const files = Array.from(event.clipboardData?.files || []).filter((file) =>
          file.type.startsWith('image/')
        )
        if (files.length > 0) {
          event.preventDefault()
          void onPasteFilesRef.current?.(files)
          return true
        }

        const plainText = event.clipboardData?.getData('text/plain')?.trim() || ''
        const htmlText = event.clipboardData?.getData('text/html')?.trim() || ''
        const storyLink = parseStoryLink(plainText)
        const storyLinkCardType = view.state.schema.nodes.storyLinkCard

        if (storyLink && storyLinkCardType) {
          const authToken = tokenRef.current
          if (!authToken) return false

          event.preventDefault()
          const { state } = view
          view.dispatch(
            state.tr
              .replaceSelectionWith(storyLinkCardType.create({
                storyId: storyLink.storyId,
                url: storyLink.url,
                title: t('common.loading'),
              }))
              .scrollIntoView()
          )

          void getAdminStoryRef.current(authToken, storyLink.storyId)
            .then((story) => {
              const attrs = buildStoryLinkCardAttrs(story, storyLink.url)
              updateStoryLinkCardNode(view, storyLink.storyId, attrs)
            })
            .catch(() => {
              updateStoryLinkCardNode(view, storyLink.storyId, {
                storyId: storyLink.storyId,
                url: storyLink.url,
                title: 'Story not found',
                summary: storyLink.url,
                isPublished: false,
              })
            })

          return true
        }

        const embedInfo = parseMediaEmbedInfo(plainText) || parseMediaEmbedInfo(htmlText)
        const mediaEmbedType = view.state.schema.nodes.mediaEmbed

        if (embedInfo && mediaEmbedType) {
          event.preventDefault()
          view.dispatch(
            view.state.tr
              .replaceSelectionWith(
                mediaEmbedType.create({
                  provider: embedInfo.provider,
                  url: embedInfo.url,
                  src: embedInfo.src,
                  title: embedInfo.title,
                  height: embedInfo.height,
                  allow: embedInfo.allow,
                  allowFullScreen: embedInfo.allowFullScreen,
                  frameBorder: embedInfo.frameBorder,
                  marginWidth: embedInfo.marginWidth,
                  marginHeight: embedInfo.marginHeight,
                  scrolling: embedInfo.scrolling,
                  border: embedInfo.border,
                  frameSpacing: embedInfo.frameSpacing,
                })
              )
              .scrollIntoView()
          )
          return true
        }

        return false
      },
      handleKeyDown: (view, event) => {
        if (isAiTaskLockedRef.current) return true

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
              event.preventDefault()
              view.dispatch(transaction.scrollIntoView())
              return true
            }
          }

          if (event.key === 'Delete') return false

          const listDepth = listItemDepth - 1
          const parentListItemDepth = listItemDepth - 2
          const isAtNestedListItemStart = empty
            && $from.parent.isTextblock
            && $from.parentOffset === 0
            && listItemType
            && listDepth > 0
            && parentListItemDepth > 0
            && $from.node(parentListItemDepth).type === listItemType

          if (!isAtNestedListItemStart) return false

          const listItemStart = $from.before(listItemDepth)
          const currentListItem = $from.node(listItemDepth)

          // An empty nested item is a structural placeholder. Hiding its marker
          // leaves it at the nested level, so the following item can be promoted
          // when the user continues deleting. Lift it immediately instead.
          if ($from.parent.content.size === 0) {
            let liftedTransaction: Transaction | undefined
            const lifted = liftListItem(listItemType)(view.state, transaction => {
              liftedTransaction = transaction
            })

            if (!lifted || !liftedTransaction) return false

            event.preventDefault()
            view.dispatch(liftedTransaction)
            return true
          }

          if (currentListItem.attrs.markerHidden === true) {
            let liftedTransaction: Transaction | undefined
            const lifted = liftListItem(listItemType)(view.state, transaction => {
              liftedTransaction = transaction
            })

            if (!lifted || !liftedTransaction) return false

            const liftedFrom = liftedTransaction.selection.$from
            for (let depth = liftedFrom.depth; depth > 0; depth -= 1) {
              if (liftedFrom.node(depth).type !== listItemType) continue

              const liftedListItemStart = liftedFrom.before(depth)
              const liftedListItem = liftedTransaction.doc.nodeAt(liftedListItemStart)
              if (liftedListItem) {
                liftedTransaction.setNodeMarkup(liftedListItemStart, undefined, {
                  ...liftedListItem.attrs,
                  markerHidden: false,
                })
              }
              break
            }

            event.preventDefault()
            view.dispatch(liftedTransaction)
            return true
          }

          const transaction = view.state.tr.setNodeMarkup(listItemStart, undefined, {
            ...currentListItem.attrs,
            markerHidden: true,
          })

          event.preventDefault()
          view.dispatch(transaction)
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
          const command = event.shiftKey ? liftListItem(listItemType) : sinkListItem(listItemType)
          command(view.state, view.dispatch)
          return true
        }

        event.preventDefault()
        view.dispatch(view.state.tr.insertText(TAB_INDENT))
        return true
      },
    },
  })

  useEffect(() => {
    // emitUpdate=false：setEditable 默认会合成一个空事务的 update 事件，
    // 会让宿主在「未修改内容」时也收到 onChange/onJsonChange，从而误触发自动保存。
    editor?.setEditable(!isAiTaskLocked, false)
  }, [editor, isAiTaskLocked])

  useEffect(() => {
    if (!editor) return
    if (lastContentVersionRef.current === contentVersion) return
    lastContentVersionRef.current = contentVersion

    const nextContent = processedContent()
    try {
      // emitUpdate:false —— 重置是「切换到另一篇文档」而非用户编辑，
      // 不向上游广播，避免宿主误判当前文档已被修改。
      editor.commands.setContent(nextContent || '', { emitUpdate: false })
    } catch (error) {
      console.error('Failed to reset editor content:', error)
    }
    currentValueRef.current = editor.getHTML()
    // 新文档从顶部开始
    editor.commands.setTextSelection(1)
    editor.commands.scrollIntoView()
  }, [contentVersion, editor, processedContent])


  return {
    editor,
    currentValueRef,
  }
}
