/**
 * Imperative handle hook for TipTap editor
 */
'use client'

import { useMemo, useCallback } from 'react'
import type { Editor } from '@tiptap/core'
import type { MutableRefObject } from 'react'
import {
  convertMarkdownToHtml,
  convertMarkdownImageToHtmlAttrs,
  convertHtmlImageToAttrs,
  isMarkdownImageSyntax,
  isMarkdownContent,
  ensureFirstParagraphHasDropCap,
} from './markdown-converter'
import { IMAGE_WIDTH_PRESETS } from './editor-constants'

export interface NarrativeTipTapEditorHandle {
  getValue: () => string
  setValue: (html: string) => void
  insertValue: (html: string) => void
  insertMarkdown: (markdown: string) => void
  replaceText: (searchValue: string, nextValue: string) => boolean
  scaleLastImage: (mode: 'sm' | 'md' | 'lg') => boolean
  focus: () => void
}

interface UseEditorImperativeHandleOptions {
  editor: Editor | null
  currentValueRef: MutableRefObject<string>
  onChange: (value: string) => void
  focusEditor: () => void
  insertInlineImage: (attrs: { src: string; alt?: string; width?: number }) => void
}

export function useEditorImperativeHandle({
  editor,
  currentValueRef,
  onChange,
  focusEditor,
  insertInlineImage,
}: UseEditorImperativeHandleOptions): NarrativeTipTapEditorHandle {
  const handle = useMemo<NarrativeTipTapEditorHandle>(() => ({
    getValue: () => {
      return editor?.getHTML() || currentValueRef.current || ''
    },

    setValue: (html: string) => {
      if (editor) {
        const processed = isMarkdownContent(html) ? convertMarkdownToHtml(html) : html
        editor.commands.setContent(processed)
        ensureFirstParagraphHasDropCap(editor)
        currentValueRef.current = html
      }
    },

    insertValue: (content: string) => {
      if (editor) {
        const imageAttrs = convertMarkdownImageToHtmlAttrs(content) || convertHtmlImageToAttrs(content)
        if (imageAttrs) {
          insertInlineImage(imageAttrs)
          return
        }

        // Convert Markdown images to HTML images for TipTap
        let processedContent = content
        if (isMarkdownImageSyntax(content)) {
          const attrs = convertMarkdownImageToHtmlAttrs(content)
          if (attrs) {
            const widthAttr = attrs.width ? ` width="${attrs.width}"` : ''
            processedContent = `<img src="${attrs.src}" alt="${attrs.alt || ''}"${widthAttr} />`
          }
        }

        editor.commands.insertContent(processedContent)
        focusEditor()
      }
    },

    insertMarkdown: (markdown: string) => {
      if (editor) {
        const imageAttrs = convertMarkdownImageToHtmlAttrs(markdown)
        if (imageAttrs) {
          insertInlineImage(imageAttrs)
          return
        }

        const html = convertMarkdownToHtml(markdown)
        editor.commands.insertContent(html)
        focusEditor()
      }
    },

    replaceText: (searchValue: string, nextValue: string) => {
      if (!searchValue || !editor) return false
      const currentHtml = editor.getHTML()
      if (!currentHtml.includes(searchValue)) return false

      // Convert Markdown images to HTML for TipTap
      let processedNext = nextValue
      if (isMarkdownImageSyntax(nextValue)) {
        const attrs = convertMarkdownImageToHtmlAttrs(nextValue)
        if (attrs) {
          const widthAttr = attrs.width ? ` width="${attrs.width}"` : ''
          processedNext = `<img src="${attrs.src}" alt="${attrs.alt || ''}"${widthAttr} />`
        }
      }

      const newHtml = currentHtml.replace(searchValue, processedNext)
      editor.commands.setContent(newHtml)
      ensureFirstParagraphHasDropCap(editor)
      currentValueRef.current = newHtml
      onChange(newHtml)
      focusEditor()
      return true
    },

    scaleLastImage: (mode: 'sm' | 'md' | 'lg') => {
      if (!editor) return false
      const width = IMAGE_WIDTH_PRESETS[mode]

      // Find the last image node and update its width
      const { state } = editor
      let found = false
      let imagePos = -1

      state.doc.descendants((node, pos) => {
        if (node.type.name === 'image' && !found) {
          imagePos = pos
          found = true
        }
      })

      if (imagePos >= 0) {
        // Use TipTap's chain command to update image attributes
        editor
          .chain()
          .focus()
          .command(({ tr }) => {
            const node = state.doc.nodeAt(imagePos)
            if (node) {
              const attrs = { ...node.attrs, width }
              tr.setNodeMarkup(imagePos, undefined, attrs)
            }
            return true
          })
          .run()

        // Trigger onChange to save
        const latestHtml = editor.getHTML()
        currentValueRef.current = latestHtml
        onChange(latestHtml)
        return true
      }

      return false
    },

    focus: focusEditor,
  }), [editor, focusEditor, insertInlineImage, onChange, currentValueRef])

  return handle
}