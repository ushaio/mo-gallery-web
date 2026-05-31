/**
 * Imperative handle hook for TipTap editor
 */
'use client'

import { useMemo } from 'react'
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
  scaleFirstImage: (mode: 'sm' | 'md' | 'lg') => boolean
  focus: () => void
}

interface UseEditorImperativeHandleOptions {
  editor: Editor | null
  currentValueRef: MutableRefObject<string>
  onChange: (value: string) => void
  focusEditor: () => void
  insertInlineImage: (attrs: { src: string; alt?: string; width?: number; photoId?: string }) => void
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

      // Try direct match first
      if (currentHtml.includes(searchValue)) {
        // Convert Markdown images to HTML for TipTap
        let processedNext = nextValue
        if (isMarkdownImageSyntax(nextValue)) {
          const attrs = convertMarkdownImageToHtmlAttrs(nextValue)
          if (attrs) {
            const widthAttr = attrs.width ? ` width="${attrs.width}"` : ''
            const photoIdAttr = attrs.photoId ? ` data-photo-id="${attrs.photoId}"` : ''
            processedNext = `<img src="${attrs.src}" alt="${attrs.alt || ''}"${photoIdAttr}${widthAttr} />`
          }
        }

        const newHtml = currentHtml.replace(searchValue, processedNext)
        editor.commands.setContent(newHtml)
        ensureFirstParagraphHasDropCap(editor)
        currentValueRef.current = newHtml
        onChange(newHtml)
        focusEditor()
        return true
      }

      // Try to find story-paste-upload comment marker
      const commentMatch = searchValue.match(/<!-- story-paste-upload:([a-f0-9-]+) -->/)
      if (commentMatch) {
        const uploadId = commentMatch[1]
        const commentPattern = `<!-- story-paste-upload:${uploadId} -->`

        if (currentHtml.includes(commentPattern)) {
          // Find the comment and the following content until next paragraph or end
          const commentIndex = currentHtml.indexOf(commentPattern)
          const afterComment = currentHtml.substring(commentIndex)

          // Match the comment and the following paragraph with the placeholder text
          // Pattern: <!-- comment --></p><p><a>text</a> or <!-- comment -->\n[text]
          const placeholderPattern = new RegExp(
            `${commentPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?:</p>\\s*<p>.*?</p>|\\n\\[.*?\\]\\(\\)\\n?)`,
            'i'
          )

          const match = currentHtml.match(placeholderPattern)
          if (match) {
            // Convert Markdown images to HTML for TipTap
            let processedNext = nextValue
            if (isMarkdownImageSyntax(nextValue)) {
              const attrs = convertMarkdownImageToHtmlAttrs(nextValue)
              if (attrs) {
                const widthAttr = attrs.width ? ` width="${attrs.width}"` : ''
                const photoIdAttr = attrs.photoId ? ` data-photo-id="${attrs.photoId}"` : ''
                processedNext = `<p><img src="${attrs.src}" alt="${attrs.alt || ''}"${photoIdAttr}${widthAttr} /></p>`
              }
            }

            const newHtml = currentHtml.replace(match[0], processedNext)
            editor.commands.setContent(newHtml)
            ensureFirstParagraphHasDropCap(editor)
            currentValueRef.current = newHtml
            onChange(newHtml)
            focusEditor()
            return true
          }
        }
      }

      return false
    },

    scaleFirstImage: (mode: 'sm' | 'md' | 'lg') => {
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
        return true
      }

      return false
    },

    focus: focusEditor,
  }), [editor, focusEditor, insertInlineImage, onChange, currentValueRef])

  return handle
}
