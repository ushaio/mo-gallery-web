/**
 * Hook for creating and configuring TipTap editor instance
 */
'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useEditor } from '@tiptap/react'
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
import { convertMarkdownToHtml, ensureFirstParagraphHasDropCap, isMarkdownContent } from './markdown-converter'
import { TAB_INDENT } from './editor-constants'

interface UseNarrativeEditorOptions {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  onPasteFiles?: (files: File[]) => void | Promise<void>
  t: (key: string) => string
}

export function useNarrativeEditor({
  value,
  onChange,
  placeholder,
  onPasteFiles,
  t,
}: UseNarrativeEditorOptions) {
  const currentValueRef = useRef(value)
  const onPasteFilesRef = useRef(onPasteFiles)

  useEffect(() => {
    currentValueRef.current = value
  }, [value])

  useEffect(() => {
    onPasteFilesRef.current = onPasteFiles
  }, [onPasteFiles])

  const processedContent = useCallback(() => {
    if (!value) return ''
    if (isMarkdownContent(value)) {
      return convertMarkdownToHtml(value)
    }
    return value
  }, [value])

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
    },
    editorProps: {
      attributes: {
        class: 'tiptap focus:outline-none',
      },
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files || []).filter((file) =>
          file.type.startsWith('image/')
        )
        if (files.length === 0) return false
        event.preventDefault()
        void onPasteFilesRef.current?.(files)
        return true
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

  useEffect(() => {
    if (!editor) return
    ensureFirstParagraphHasDropCap(editor)
  }, [editor, processedContent])

  return {
    editor,
    currentValueRef,
  }
}