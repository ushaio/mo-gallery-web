/**
 * Imperative handle hook for TipTap editor
 */
'use client'

import { useMemo } from 'react'
import type { Editor } from '@tiptap/core'
import type { JSONContent } from '@tiptap/core'
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
import {
  convertStoryPasteUploadPlaceholderToHtml,
  isStoryPasteUploadPlaceholder,
  replaceStoryPasteUploadPlaceholderHtml,
} from './story-paste-upload-placeholder'

export interface NarrativeTipTapEditorHandle {
  getValue: () => string
  getJsonValue: () => JSONContent | null
  setValue: (html: string) => void
  insertValue: (html: string) => void
  insertMarkdown: (markdown: string) => void
  replaceText: (searchValue: string, nextValue: string) => boolean
  scaleFirstImage: (mode: 'sm' | 'md' | 'lg') => boolean
  focus: () => void
}

interface UseEditorImperativeHandleOptions {
  editor: Editor | null
  currentValueRef: MutableRefObject<string>
  onChange: (value: string) => void
  onJsonChange?: (value: JSONContent) => void
  focusEditor: () => void
  insertInlineImage: (attrs: { src: string; alt?: string; width?: number; photoId?: string }) => void
  isAiTaskLocked: boolean
}

export function useEditorImperativeHandle({
  editor,
  currentValueRef,
  onChange,
  onJsonChange,
  focusEditor,
  insertInlineImage,
  isAiTaskLocked,
}: UseEditorImperativeHandleOptions): NarrativeTipTapEditorHandle {
  const handle = useMemo<NarrativeTipTapEditorHandle>(() => ({
    getValue: () => {
      return editor?.getHTML() || currentValueRef.current || ''
    },

    getJsonValue: () => {
      return editor?.getJSON() || null
    },

    setValue: (html: string) => {
      if (isAiTaskLocked) return
      if (editor) {
        const processed = isMarkdownContent(html) ? convertMarkdownToHtml(html) : html
        editor.commands.setContent(processed)
        ensureFirstParagraphHasDropCap(editor)
        currentValueRef.current = html
        onChange(editor.getHTML())
        onJsonChange?.(editor.getJSON())
      }
    },

    insertValue: (content: string) => {
      if (isAiTaskLocked) return
      if (editor) {
        // Handle image content (markdown or HTML img tag)
        const imageAttrs = convertMarkdownImageToHtmlAttrs(content) || convertHtmlImageToAttrs(content)
        if (imageAttrs) {
          insertInlineImage(imageAttrs)
          return
        }

        editor.commands.insertContent(content)
        focusEditor()
      }
    },

    insertMarkdown: (markdown: string) => {
      if (isAiTaskLocked) return
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
      if (isAiTaskLocked) return false
      if (!searchValue || !editor) return false
      const currentHtml = editor.getHTML()

      const prepareNextValue = () => {
        if (isStoryPasteUploadPlaceholder(nextValue)) {
          return convertStoryPasteUploadPlaceholderToHtml(nextValue)
        }

        if (!isMarkdownImageSyntax(nextValue)) {
          return nextValue
        }

        const attrs = convertMarkdownImageToHtmlAttrs(nextValue)
        if (!attrs) {
          return nextValue
        }

        const widthAttr = attrs.width ? ` width="${attrs.width}"` : ''
        const photoIdAttr = attrs.photoId ? ` data-photo-id="${attrs.photoId}"` : ''
        return `<img src="${attrs.src}" alt="${attrs.alt || ''}"${photoIdAttr}${widthAttr} />`
      }

      // Try direct match first
      if (currentHtml.includes(searchValue)) {
        const processedNext = prepareNextValue()
        const newHtml = currentHtml.replace(searchValue, processedNext)
        editor.commands.setContent(newHtml)
        ensureFirstParagraphHasDropCap(editor)
        currentValueRef.current = newHtml
        onChange(newHtml)
        onJsonChange?.(editor.getJSON())
        focusEditor()
        return true
      }

      const placeholderReplacement = replaceStoryPasteUploadPlaceholderHtml(
        currentHtml,
        searchValue,
        prepareNextValue(),
      )
      if (placeholderReplacement?.replaced) {
        editor.commands.setContent(placeholderReplacement.html)
        ensureFirstParagraphHasDropCap(editor)
        currentValueRef.current = placeholderReplacement.html
        onChange(placeholderReplacement.html)
        onJsonChange?.(editor.getJSON())
        focusEditor()
        return true
      }

      return false
    },

    scaleFirstImage: (mode: 'sm' | 'md' | 'lg') => {
      if (isAiTaskLocked) return false
      if (!editor) return false
      const editorDom = editor.view.dom
      const computedStyle = window.getComputedStyle(editorDom)
      const contentWidth = editorDom.clientWidth - (parseFloat(computedStyle.paddingLeft) || 0) - (parseFloat(computedStyle.paddingRight) || 0)
      const width = Math.round(contentWidth * IMAGE_WIDTH_PRESETS[mode])

      // Find the first image node and update its width
      const { state } = editor
      let imagePos = -1

      state.doc.descendants((node, pos) => {
        if (node.type.name === 'image' && imagePos < 0) {
          imagePos = pos
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
        onJsonChange?.(editor.getJSON())
        return true
      }

      return false
    },

    focus: focusEditor,
  }), [editor, focusEditor, insertInlineImage, isAiTaskLocked, onChange, onJsonChange, currentValueRef])

  return handle
}
