/**
 * Imperative handle hook for TipTap editor
 */
'use client'

import { useMemo } from 'react'
import type { Editor } from '@tiptap/core'
import type { JSONContent } from '@tiptap/core'
import { joinBackward } from '@tiptap/pm/commands'
import type { MutableRefObject } from 'react'
import {
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
  getAutomationState: () => NarrativeEditorAutomationState | null
  automationTypeText: (text: string) => boolean
  automationPressKey: (input: NarrativeEditorAutomationKeyInput) => boolean
  automationSetSelection: (from: number, to?: number) => boolean
}

export interface NarrativeEditorAutomationKeyInput {
  key: string
  code?: string
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  metaKey?: boolean
}

export interface NarrativeEditorAutomationState {
  html: string
  json: JSONContent
  selection: {
    from: number
    to: number
    anchor: number
    head: number
    empty: boolean
  }
  blockType: string
  marks: string[]
  editable: boolean
  focused: boolean
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
        const markdown = isMarkdownContent(html)
        editor.commands.setContent(html, { contentType: markdown ? 'markdown' : 'html' })
        const nextHtml = editor.getHTML()
        currentValueRef.current = nextHtml
        onChange(nextHtml)
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

        editor.commands.insertContent(markdown, { contentType: 'markdown' })
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
    getAutomationState: () => {
      if (!editor) return null
      const { selection } = editor.state
      const marks = editor.state.storedMarks ?? selection.$from.marks()
      return {
        html: editor.getHTML(),
        json: editor.getJSON(),
        selection: {
          from: selection.from,
          to: selection.to,
          anchor: selection.anchor,
          head: selection.head,
          empty: selection.empty,
        },
        blockType: selection.$from.parent.type.name,
        marks: marks.map((mark) => mark.type.name),
        editable: editor.isEditable,
        focused: document.activeElement === editor.view.dom || editor.view.dom.contains(document.activeElement),
      }
    },
    automationTypeText: (text: string) => {
      if (isAiTaskLocked || !editor) return false
      editor.commands.focus()

      for (const character of text) {
        if (character === '\n') {
          editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            bubbles: true,
            cancelable: true,
          }))
          continue
        }

        const { from, to } = editor.state.selection
        const handled = editor.view.someProp(
          'handleTextInput',
          (handler) => handler(
            editor.view,
            from,
            to,
            character,
            () => editor.state.tr.insertText(character, from, to),
          ),
        ) === true
        if (!handled) {
          editor.view.dispatch(editor.state.tr.insertText(character, from, to).scrollIntoView())
        }
      }
      return true
    },
    automationPressKey: (input: NarrativeEditorAutomationKeyInput) => {
      if (isAiTaskLocked || !editor || !input.key) return false
      editor.commands.focus()
      const event = new KeyboardEvent('keydown', {
        key: input.key,
        code: input.code || input.key,
        ctrlKey: input.ctrlKey === true,
        altKey: input.altKey === true,
        shiftKey: input.shiftKey === true,
        metaKey: input.metaKey === true,
        bubbles: true,
        cancelable: true,
      })

      // Wails/WebView automation can dispatch on the detached editor DOM
      // without reaching ProseMirror's native listener. Run the same view
      // prop pipeline first, then let the DOM event cover plugins that only
      // subscribe to the element.
      const beforeDoc = editor.state.doc
      const beforeSelection = editor.state.selection
      const handled = editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event))
      if (!handled) editor.view.dom.dispatchEvent(event)

      const unchanged = editor.state.doc.eq(beforeDoc)
        && editor.state.selection.eq(beforeSelection)
      const isPlainBackspace = input.key === 'Backspace'
        && input.ctrlKey !== true
        && input.altKey !== true
        && input.metaKey !== true

      // A synthetic keydown has no browser default action. If neither the
      // TipTap keymap nor a DOM listener handled an ordinary Backspace,
      // reproduce the native deletion/join step used by a real keyboard.
      if (unchanged && isPlainBackspace) {
        const { selection } = editor.state
        if (!selection.empty) {
          editor.view.dispatch(
            editor.state.tr.delete(selection.from, selection.to).scrollIntoView(),
          )
        } else if (selection.$from.parent.isTextblock && selection.$from.parentOffset > 0) {
          const textBefore = selection.$from.parent.textBetween(
            0,
            selection.$from.parentOffset,
            undefined,
            '\ufffc',
          )
          const previousCodePoint = Array.from(textBefore).at(-1)
          const deleteSize = previousCodePoint?.length ?? 1
          editor.view.dispatch(
            editor.state.tr
              .delete(selection.from - deleteSize, selection.from)
              .scrollIntoView(),
          )
        } else {
          joinBackward(
            editor.state,
            transaction => editor.view.dispatch(transaction),
            editor.view,
          )
        }
      }
      return true
    },
    automationSetSelection: (from: number, to = from) => {
      if (isAiTaskLocked || !editor || !Number.isInteger(from) || !Number.isInteger(to)) return false
      const min = Math.min(from, to)
      const max = Math.max(from, to)
      if (min < 1 || max > editor.state.doc.content.size + 1) return false
      editor.commands.setTextSelection({ from: min, to: max })
      editor.commands.focus()
      return true
    },
  }), [editor, focusEditor, insertInlineImage, isAiTaskLocked, onChange, onJsonChange, currentValueRef])

  return handle
}
