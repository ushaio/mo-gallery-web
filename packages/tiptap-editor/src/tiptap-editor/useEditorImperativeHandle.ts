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
  normalizeHexColor,
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
  /**
   * 读编辑器自身的格式状态（而不是去解析渲染出来的工具栏 DOM）。
   *
   * 为什么要这一条：工具栏是按 `editorUiState` 渲染出来的视图，读它回答的是「按钮长
   * 什么样」；调用方（外部 Agent 与 MCP）真正需要的是「这份文档现在是什么格式」。
   * 两者在工具栏被裁切、页签隐藏、或同一节流帧里连改两次时会分叉，所以状态必须来自
   * editor 本身。
   */
  getFormatState: () => NarrativeEditorFormatState | null
  /**
   * 直接执行一个编辑器命令（白名单内的枚举），走 TipTap 的 chain 而不是点击 DOM。
   *
   * 为什么不再模拟点击：点击依赖工具栏此刻真的被渲染、按钮没有被禁用、菜单需要先
   * 展开；而 chain 命令是编辑器唯一的事实来源，且不随 UI 结构变化。命令的作用范围
   * 与用户点按钮时一致（当前选区）。
   */
  executeFormatCommand: (input: NarrativeEditorFormatCommand) => NarrativeEditorFormatCommandResult
}

/** 编辑器命令的枚举取值。工具栏按钮与下拉各对应其中一项。 */
export type NarrativeEditorFormatCommand =
  | { command: 'toggleMark'; mark: NarrativeEditorFormatMark }
  | { command: 'setBlock'; block: 'paragraph' }
  | { command: 'setBlock'; block: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { command: 'setAlign'; align: 'left' | 'center' | 'right' }
  | { command: 'toggleList'; list: 'bulletList' | 'orderedList' }
  | { command: 'setBlockquote' }
  | { command: 'clearFormatting' }
  | { command: 'setFontSize'; value: string | null }
  | { command: 'setFontFamily'; value: string | null }
  | { command: 'setTextColor'; value: string | null }
  | { command: 'setBackgroundColor'; value: string | null }
  | { command: 'undo' }
  | { command: 'redo' }

/** 可切换的行内 mark。与工具栏的按钮一一对应。 */
export type NarrativeEditorFormatMark =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'

export interface NarrativeEditorFormatCommandResult {
  ok: boolean
  /** 失败原因：命令不适用于当前位置、AI 任务占用编辑器、参数非法。 */
  reason?: string
}

/** 编辑器格式状态：全部来自 editor 的查询方法，不读 DOM。 */
export interface NarrativeEditorFormatState {
  /** 当前光标所在的块类型（paragraph / heading / bulletList / ...）。 */
  blockType: string
  /** 标题级别；正文为 null。 */
  headingLevel: 1 | 2 | 3 | 4 | 5 | 6 | null
  /** 生效的行内 mark，按 NarrativeEditorFormatMark 的顺序给出。 */
  marks: NarrativeEditorFormatMark[]
  align: 'left' | 'center' | 'right'
  /** 行内样式值；未设置时为 null（而不是空串 —— 空串是「点过清除」的结果）。 */
  fontSize: string | null
  fontFamily: string | null
  color: string | null
  backgroundColor: string | null
  /** 列表与引用这类整体块属性的状态。 */
  inBulletList: boolean
  inOrderedList: boolean
  inBlockquote: boolean
  /** 撤销栈是否还有内容（决定 undo / redo 命令是否可能生效）。 */
  canUndo: boolean
  canRedo: boolean
  /** 与 getAutomationState 一致的可编辑标志。 */
  editable: boolean
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

/**
 * 格式状态里 marks 的输出顺序：与工具栏从左到右一致，读起来稳定。
 * `code` 是 NarrativeEditorFormatMark 的对外名字，对应 editor 的 inlineCode mark。
 */
const FORMAT_MARK_ORDER: readonly NarrativeEditorFormatMark[] = ['bold', 'italic', 'underline', 'strike', 'code']

/** 空串与 undefined 统一成 null：让调用方只需判断「有没有设置过」。 */
function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value : null
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

    getFormatState: () => {
      if (!editor) return null
      const { selection, doc, storedMarks } = editor.state
      const activeMarks = storedMarks ?? selection.$from.marks()
      const activeMarkNames = new Set(activeMarks.map((mark) => mark.type.name))
      const pastedStyle = editor.getAttributes('pastedStyle') as {
        color?: string | null
        backgroundColor?: string | null
        fontSize?: string | null
        fontFamily?: string | null
      }
      const headingLevel = ([1, 2, 3, 4, 5, 6] as const)
        .find((level) => editor.isActive('heading', { level })) ?? null
      return {
        blockType: selection.$from.parent.type.name,
        headingLevel,
        marks: FORMAT_MARK_ORDER.filter((mark) => (
          // code 是 inlineCode mark 的对外名字。
          activeMarkNames.has(mark === 'code' ? 'code' : mark)
        )),
        align: editor.isActive({ textAlign: 'center' })
          ? 'center'
          : editor.isActive({ textAlign: 'right' }) ? 'right' : 'left',
        fontSize: nonEmpty(pastedStyle.fontSize),
        fontFamily: nonEmpty(pastedStyle.fontFamily),
        color: nonEmpty(pastedStyle.color),
        backgroundColor: nonEmpty(pastedStyle.backgroundColor),
        inBulletList: editor.isActive('bulletList'),
        inOrderedList: editor.isActive('orderedList'),
        inBlockquote: editor.isActive('blockquote'),
        canUndo: editor.can().undo(),
        canRedo: editor.can().redo(),
        editable: editor.isEditable,
      } satisfies NarrativeEditorFormatState
    },

    executeFormatCommand: (input: NarrativeEditorFormatCommand) => {
      if (!editor) return { ok: false, reason: '编辑器尚未就绪' }
      // 与工具栏按钮同样的门禁：AI 任务持锁时不许改文档。
      if (isAiTaskLocked) return { ok: false, reason: '编辑器正被 AI 任务占用' }
      if (!editor.isEditable) return { ok: false, reason: '当前文档是只读的' }

      const chain = editor.chain().focus()
      switch (input.command) {
        case 'toggleMark': {
          const toggle = {
            bold: () => chain.toggleBold(),
            italic: () => chain.toggleItalic(),
            underline: () => chain.toggleUnderline(),
            strike: () => chain.toggleStrike(),
            code: () => chain.toggleCode(),
          }[input.mark]
          if (!toggle()) return { ok: false, reason: `${input.mark} 不适用于当前选区` }
          break
        }
        case 'setBlock': {
          const applied = input.block === 'heading'
            ? chain.setHeading({ level: input.level }).run()
            : chain.setParagraph().run()
          if (!applied) return { ok: false, reason: '当前选区不能改成该块类型' }
          break
        }
        case 'setAlign': {
          if (!chain.setTextAlign(input.align).run()) {
            return { ok: false, reason: '当前块不支持对齐设置' }
          }
          break
        }
        case 'toggleList': {
          const applied = input.list === 'bulletList'
            ? chain.toggleBulletList().run()
            : chain.toggleOrderedList().run()
          if (!applied) return { ok: false, reason: '当前选区不能转成该列表' }
          break
        }
        case 'setBlockquote': {
          if (!chain.toggleBlockquote().run()) return { ok: false, reason: '当前块不能转成引用' }
          break
        }
        case 'clearFormatting': {
          if (!chain.clearNodes().unsetAllMarks().run()) {
            return { ok: false, reason: '当前选区没有可清除的格式' }
          }
          break
        }
        case 'setFontSize': {
          if (input.value === null) chain.unsetFontSize()
          else chain.setFontSize(input.value)
          if (!chain.run()) return { ok: false, reason: '字号设置未生效' }
          break
        }
        case 'setFontFamily': {
          if (input.value === null) chain.unsetFontFamily()
          else chain.setFontFamily(input.value)
          if (!chain.run()) return { ok: false, reason: '字体设置未生效' }
          break
        }
        case 'setTextColor': {
          const color = input.value === null ? '' : normalizeHexColor(input.value)
          if (color === null) return { ok: false, reason: `无效的颜色值: ${input.value}` }
          if (color) chain.setTextColor(color)
          else chain.unsetTextColor()
          if (!chain.run()) return { ok: false, reason: '文字颜色设置未生效' }
          break
        }
        case 'setBackgroundColor': {
          const color = input.value === null ? '' : normalizeHexColor(input.value)
          if (color === null) return { ok: false, reason: `无效的颜色值: ${input.value}` }
          if (color) chain.setBackgroundColor(color)
          else chain.unsetBackgroundColor()
          if (!chain.run()) return { ok: false, reason: '底色设置未生效' }
          break
        }
        case 'undo': {
          if (!chain.undo().run()) return { ok: false, reason: '没有可撤销的操作' }
          break
        }
        case 'redo': {
          if (!chain.redo().run()) return { ok: false, reason: '没有可重做的操作' }
          break
        }
        default: {
          // 穷尽检查：新增命令忘了实现时这里会编译失败。
          const unreachable: never = input
          return { ok: false, reason: `未知的编辑器命令: ${JSON.stringify(unreachable)}` }
        }
      }
      return { ok: true }
    },

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
