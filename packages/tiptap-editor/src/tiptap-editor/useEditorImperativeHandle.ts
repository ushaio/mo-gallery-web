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
  insertImageUploadPlaceholder: (placeholder: ImageUploadPlaceholderInput) => boolean
  resolveImageUploadPlaceholder: (uploadId: string, image: ImageUploadResult) => boolean
  failImageUploadPlaceholder: (uploadId: string) => boolean
  scaleFirstImage: (mode: 'sm' | 'md' | 'lg') => boolean
  focus: () => void
}

export interface ImageUploadPlaceholderInput {
  uploadId: string
  fileName: string
  imageWidth: number
  imageHeight: number
}

export interface ImageUploadResult {
  src: string
  alt?: string
  photoId?: string
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
        currentValueRef.current = placeholderReplacement.html
        onChange(placeholderReplacement.html)
        onJsonChange?.(editor.getJSON())
        focusEditor()
        return true
      }

      return false
    },

    insertImageUploadPlaceholder: ({ uploadId, fileName, imageWidth, imageHeight }) => {
      if (isAiTaskLocked || !editor || !uploadId) return false

      const editorDom = editor.view.dom
      const computedStyle = window.getComputedStyle(editorDom)
      const contentWidth = editorDom.clientWidth
        - (parseFloat(computedStyle.paddingLeft) || 0)
        - (parseFloat(computedStyle.paddingRight) || 0)
      const safeImageWidth = Number.isFinite(imageWidth) && imageWidth > 0 ? imageWidth : 4
      const safeImageHeight = Number.isFinite(imageHeight) && imageHeight > 0 ? imageHeight : 3
      const displayWidth = Math.max(120, Math.min(contentWidth || 640, safeImageWidth))

      focusEditor()
      return editor.chain().insertContent({
        type: 'paragraph',
        attrs: { textAlign: 'center' },
        content: [{
          type: 'imageUploadPlaceholder',
          attrs: {
            uploadId,
            fileName,
            imageWidth: safeImageWidth,
            imageHeight: safeImageHeight,
            displayWidth,
            state: 'loading',
          },
        }],
      }).run()
    },

    resolveImageUploadPlaceholder: (uploadId, image) => {
      if (isAiTaskLocked || !editor || !uploadId || !image.src) return false

      let placeholderPos = -1
      let placeholderWidth: number | null = null
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'imageUploadPlaceholder' && node.attrs.uploadId === uploadId) {
          placeholderPos = pos
          placeholderWidth = typeof node.attrs.displayWidth === 'number' ? node.attrs.displayWidth : null
          return false
        }
        return true
      })
      if (placeholderPos < 0) return false

      const imageType = editor.state.schema.nodes.image
      if (!imageType) return false
      const imageNode = imageType.create({
        src: image.src,
        alt: image.alt || '',
        width: placeholderWidth,
        height: null,
        ...(image.photoId ? { photoId: image.photoId } : {}),
      })
      editor.view.dispatch(
        editor.state.tr
          .replaceWith(placeholderPos, placeholderPos + 1, imageNode)
          .scrollIntoView(),
      )
      return true
    },

    failImageUploadPlaceholder: (uploadId) => {
      if (isAiTaskLocked || !editor || !uploadId) return false

      let placeholderPos = -1
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'imageUploadPlaceholder' && node.attrs.uploadId === uploadId) {
          placeholderPos = pos
          return false
        }
        return true
      })
      if (placeholderPos < 0) return false

      const placeholderNode = editor.state.doc.nodeAt(placeholderPos)
      if (!placeholderNode) return false
      editor.view.dispatch(editor.state.tr.setNodeMarkup(placeholderPos, undefined, {
        ...placeholderNode.attrs,
        state: 'failed',
      }))
      return true
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
