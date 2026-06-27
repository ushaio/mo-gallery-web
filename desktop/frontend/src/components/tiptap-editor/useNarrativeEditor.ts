/**
 * Hook for creating and configuring TipTap editor instance
 */
'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useEditor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import type { EditorView } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { ResizableImage } from '@/components/tiptap-extensions/ResizableImage'
import { PastedStyleMark } from '@/components/tiptap-extensions/PastedStyleMark'
import { PastedBlockStyle } from '@/components/tiptap-extensions/PastedBlockStyle'
import { DropCapParagraph } from '@/components/tiptap-extensions/DropCapParagraph'
import { StyledHorizontalRule } from '@/components/tiptap-extensions/StyledHorizontalRule'
import { MediaEmbed } from '@/components/tiptap-extensions/MediaEmbed'
import { StoryLinkCard } from '@/components/tiptap-extensions/StoryLinkCard'
import { getAdminStory } from '@/lib/api/stories'
import { parseMediaEmbedInfo } from '@/lib/media-embed'
import { buildStoryLinkCardAttrs, parseStoryLink } from '@/lib/story-link-card'
import { convertMarkdownToHtml, isMarkdownContent } from './markdown-converter'
import { TAB_INDENT } from './editor-constants'

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
}: UseNarrativeEditorOptions) {
  const currentValueRef = useRef(value)
  const onPasteFilesRef = useRef(onPasteFiles)
  const tokenRef = useRef(token)

  useEffect(() => {
    currentValueRef.current = value
  }, [value])

  useEffect(() => {
    onPasteFilesRef.current = onPasteFiles
  }, [onPasteFiles])

  useEffect(() => {
    tokenRef.current = token
  }, [token])

  const processedContent = useCallback(() => {
    if (jsonValue) return jsonValue
    if (!value) return ''
    if (isMarkdownContent(value)) {
      return convertMarkdownToHtml(value)
    }
    return value
  }, [jsonValue, value])

  // @ts-expect-error — tiptap v3 overload resolution
  const editor = useEditor({
    extensions: [
      PastedBlockStyle,
      DropCapParagraph,
      StarterKit.configure({
        horizontalRule: false,
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
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

          void getAdminStory(authToken, storyLink.storyId)
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
        if (event.key !== 'Tab') {
          return false
        }

        const { $from } = view.state.selection
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          const nodeName = $from.node(depth).type.name
          if (nodeName === 'tableCell' || nodeName === 'tableHeader') {
            return false
          }
        }

        event.preventDefault()
        view.dispatch(view.state.tr.insertText(TAB_INDENT))
        return true
      },
    },
  })


  return {
    editor,
    currentValueRef,
  }
}
