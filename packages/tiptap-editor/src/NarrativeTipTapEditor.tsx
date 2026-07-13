/**
 * Narrative TipTap Editor - Rich text editor for story content
 */
'use client'

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useEditorState, EditorContent } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code,
  Pilcrow,
  Link as LinkIcon,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Table as TableIcon,
  Undo,
  Redo,
  Highlighter,
  Palette,
  Clapperboard,
  RemoveFormatting,
} from 'lucide-react'
import TipTapAiAssistant, { type TipTapAiAgentRunner } from './TipTapAiAssistant'
import type { NarrativeEditorRuntime } from './runtime'
import {
  createEditorDocumentSnapshot,
  getTextReplacementOperation,
  runEditorAgent,
  type EditorProposal,
} from '@mo-gallery/ai-agent'
import { linearizeDoc, findDocTextRange } from './tiptap-editor/doc-text'
import { AiDiffPreviewDialog } from './tiptap-editor/AiDiffPreviewDialog'
import { AiSidebar } from './tiptap-editor/AiSidebar'

import {
  DEFAULT_FONT_SIZE_LABEL,
  FONT_SIZE_VALUES,
  FONT_FAMILY_SANS_VALUE,
  FONT_FAMILY_SONG_VALUE,
  FONT_FAMILY_HEI_VALUE,
  FONT_FAMILY_MONO_VALUE,
  FONT_FAMILY_OPTIMA_VALUE,
  DEFAULT_TEXT_HIGHLIGHT,
  DEFAULT_TEXT_COLOR,
  BACKGROUND_COLOR_RECENT_LIMIT,
  TEXT_COLOR_RECENT_LIMIT,
  BASIC_BACKGROUND_COLOR_OPTIONS,
  MORE_BACKGROUND_COLOR_OPTIONS,
  BASIC_TEXT_COLOR_OPTIONS,
  MORE_TEXT_COLOR_OPTIONS,
  AI_CONTEXT_LIMIT,
} from './tiptap-editor/editor-constants'
import {
  normalizeHexColor,
  resolveActiveInlineStyleValue,
  convertPlainTextToEditorHtml,
} from './tiptap-editor/markdown-converter'
import { ToolbarButton, ToolbarSelect, ToolbarDivider } from './tiptap-editor/EditorToolbar'
import { BackgroundColorPicker, TextColorPicker, useColorPickerMenu } from './tiptap-editor/ColorPickerMenu'
import { useNarrativeEditor } from './tiptap-editor/useNarrativeEditor'
import { useEditorImperativeHandle, type NarrativeTipTapEditorHandle } from './tiptap-editor/useEditorImperativeHandle'
import {
  createNarrativeAiTaskLock,
  useNarrativeAiTaskLock,
  type NarrativeAiTaskLock,
} from './tiptap-editor/ai-task-lock'
import { createAiTaskLockNotifier } from './tiptap-editor/ai-task-lock-notifier'
import './tiptap-editor.css'

export interface NarrativeTipTapEditorProps {
  value: string
  jsonValue?: JSONContent | null
  onChange: (value: string) => void
  onJsonChange?: (value: JSONContent) => void
  placeholder?: string
  onPasteFiles?: (files: File[]) => void | Promise<void>
  className?: string
  /** 宿主应用注入的 i18n / 主题 / 后端接口 */
  runtime: NarrativeEditorRuntime
  documentId?: string
  documentKind?: 'story' | 'blog'
  onAiTaskLockChange?: (locked: boolean) => void
  aiOptions?: {
    enabled: boolean
    token?: string | null
    scopeId?: string
    title?: string
  }
}

export type { NarrativeTipTapEditorHandle }

export const NarrativeTipTapEditor = forwardRef<NarrativeTipTapEditorHandle, NarrativeTipTapEditorProps>(
  ({
    value,
    jsonValue,
    onChange,
    onJsonChange,
    placeholder,
    onPasteFiles,
    className,
    runtime,
    documentId,
    documentKind,
    onAiTaskLockChange,
    aiOptions,
  }, ref) => {
    const pendingSelectionRef = useRef<{ from: number; to: number } | null>(null)
    const backgroundColorButtonRef = useRef<HTMLButtonElement | null>(null)
    const backgroundColorMenuRef = useRef<HTMLDivElement | null>(null)
    const backgroundColorPickerRef = useRef<HTMLInputElement | null>(null)
    const textColorButtonRef = useRef<HTMLButtonElement | null>(null)
    const textColorMenuRef = useRef<HTMLDivElement | null>(null)
    const textColorPickerRef = useRef<HTMLInputElement | null>(null)

    const [showLinkInput, setShowLinkInput] = useState(false)
    const [linkUrl, setLinkUrl] = useState('')
    const [showImageInput, setShowImageInput] = useState(false)
    const [imageUrl, setImageUrl] = useState('')
    const [showBackgroundColorMenu, setShowBackgroundColorMenu] = useState(false)
    const [backgroundColorMenuPosition, setBackgroundColorMenuPosition] = useState({ top: 0, left: 0 })
    const [customBackgroundColor, setCustomBackgroundColor] = useState(DEFAULT_TEXT_HIGHLIGHT)
    const [recentBackgroundColors, setRecentBackgroundColors] = useState<string[]>([])
    const [backgroundColorTab, setBackgroundColorTab] = useState<'basic' | 'more'>('basic')
    const [showTextColorMenu, setShowTextColorMenu] = useState(false)
    const [textColorMenuPosition, setTextColorMenuPosition] = useState({ top: 0, left: 0 })
    const [customTextColor, setCustomTextColor] = useState(DEFAULT_TEXT_COLOR)
    const [recentTextColors, setRecentTextColors] = useState<string[]>([])
    const [textColorTab, setTextColorTab] = useState<'basic' | 'more'>('basic')
    const [aiSelectedText, setAiSelectedText] = useState('')
    const [aiCurrentParagraph, setAiCurrentParagraph] = useState('')
    const [aiContextBefore, setAiContextBefore] = useState('')
    const [aiContextAfter, setAiContextAfter] = useState('')
    const [aiSelectionRange, setAiSelectionRange] = useState<{ from: number; to: number } | null>(null)
    const [aiHasSelection, setAiHasSelection] = useState(false)
    // 替换选区前的 diff 确认
    const [aiApplyPreview, setAiApplyPreview] = useState<{
      preview: string
      selectionRange: { from: number; to: number }
      originalText: string
    } | null>(null)
    // Agent 修改提案的逐条审阅队列
    const [agentReview, setAgentReview] = useState<{
      proposals: EditorProposal[]
      index: number
      error: string
    } | null>(null)
    const [aiTaskLock] = useState<NarrativeAiTaskLock>(() => createNarrativeAiTaskLock())
    const isAiTaskLocked = useNarrativeAiTaskLock(aiTaskLock)
    const [aiTaskLockNotifier] = useState(() => createAiTaskLockNotifier())

    const { t, resolvedTheme } = runtime

    useEffect(() => {
      aiTaskLockNotifier.update(onAiTaskLockChange, isAiTaskLocked)
    }, [aiTaskLockNotifier, isAiTaskLocked, onAiTaskLockChange])

    useEffect(() => () => {
      aiTaskLockNotifier.dispose()
    }, [aiTaskLockNotifier])

    const { editor, currentValueRef } = useNarrativeEditor({
      value,
      jsonValue,
      onChange,
      onJsonChange,
      placeholder,
      onPasteFiles,
      token: aiOptions?.token,
      t,
      getAdminStory: runtime.getAdminStory,
      isAiTaskLocked,
    })

    const headingOptions = useMemo(() => [
      { label: t('editor.heading_paragraph'), value: '' },
      { label: 'H1', value: '1' },
      { label: 'H2', value: '2' },
      { label: 'H3', value: '3' },
      { label: 'H4', value: '4' },
      { label: 'H5', value: '5' },
      { label: 'H6', value: '6' },
    ], [t])

    const fontSizeOptions = useMemo(() => [
      { label: DEFAULT_FONT_SIZE_LABEL, value: '' },
      ...FONT_SIZE_VALUES.map((size) => ({ label: size, value: size })),
    ], [])

    const fontFamilyOptions = useMemo(() => [
      { label: 'PingFang SC', value: '' },
      { label: t('editor.font_family_sans'), value: FONT_FAMILY_SANS_VALUE },
      { label: t('editor.font_family_song'), value: FONT_FAMILY_SONG_VALUE },
      { label: t('editor.font_family_hei'), value: FONT_FAMILY_HEI_VALUE },
      { label: t('editor.font_family_mono'), value: FONT_FAMILY_MONO_VALUE },
      { label: t('editor.font_family_optima'), value: FONT_FAMILY_OPTIMA_VALUE },
    ], [t])

    const editorUiState = useEditorState({
      editor,
      selector: ({ editor: currentEditor }) => {
        if (!currentEditor) {
          return {
            isBold: false,
            isItalic: false,
            isUnderline: false,
            isStrike: false,
            isCode: false,
            isHeading1: false,
            isHeading2: false,
            isHeading3: false,
            isBulletList: false,
            isOrderedList: false,
            isBlockquote: false,
            isLink: false,
            isMediaEmbed: false,
            isAlignLeft: false,
            isAlignCenter: false,
            isAlignRight: false,
            isImageSelected: false,
            hasDropCap: false,
            headingLevel: '',
            fontSize: '',
            fontFamily: '',
            color: '',
            backgroundColor: '',
          }
        }

        return {
          isBold: currentEditor.isActive('bold'),
          isItalic: currentEditor.isActive('italic'),
          isUnderline: currentEditor.isActive('underline'),
          isStrike: currentEditor.isActive('strike'),
          isCode: currentEditor.isActive('code'),
          isHeading1: currentEditor.isActive('heading', { level: 1 }),
          isHeading2: currentEditor.isActive('heading', { level: 2 }),
          isHeading3: currentEditor.isActive('heading', { level: 3 }),
          isBulletList: currentEditor.isActive('bulletList'),
          isOrderedList: currentEditor.isActive('orderedList'),
          isBlockquote: currentEditor.isActive('blockquote'),
          isLink: currentEditor.isActive('link'),
          isMediaEmbed: currentEditor.isActive('mediaEmbed'),
          isAlignLeft: currentEditor.isActive({ textAlign: 'left' }),
          isAlignCenter: currentEditor.isActive({ textAlign: 'center' }),
          isAlignRight: currentEditor.isActive({ textAlign: 'right' }),
          isImageSelected: currentEditor.isActive('image'),
          hasDropCap: currentEditor.getAttributes('paragraph').dropCap === true,
          headingLevel: (
            ['1', '2', '3', '4', '5', '6'].find((level) =>
              currentEditor.isActive('heading', { level: Number.parseInt(level, 10) })
            ) ?? ''
          ),
          fontSize: resolveActiveInlineStyleValue(currentEditor, 'fontSize', FONT_SIZE_VALUES),
          fontFamily: resolveActiveInlineStyleValue(currentEditor, 'fontFamily', [
            FONT_FAMILY_SANS_VALUE,
            FONT_FAMILY_SONG_VALUE,
            FONT_FAMILY_HEI_VALUE,
            FONT_FAMILY_MONO_VALUE,
            FONT_FAMILY_OPTIMA_VALUE,
          ]),
          color: resolveActiveInlineStyleValue(
            currentEditor,
            'color',
            [...BASIC_TEXT_COLOR_OPTIONS, ...MORE_TEXT_COLOR_OPTIONS],
            true
          ),
          backgroundColor: resolveActiveInlineStyleValue(
            currentEditor,
            'backgroundColor',
            [...BASIC_BACKGROUND_COLOR_OPTIONS, ...MORE_BACKGROUND_COLOR_OPTIONS],
            true
          ),
        }
      },
    })

    const resolvedEditorUiState = editorUiState ?? {
      isBold: false,
      isItalic: false,
      isUnderline: false,
      isStrike: false,
      isCode: false,
      isHeading1: false,
      isHeading2: false,
      isHeading3: false,
      isBulletList: false,
      isOrderedList: false,
      isBlockquote: false,
      isLink: false,
      isMediaEmbed: false,
      isAlignLeft: false,
      isAlignCenter: false,
      isAlignRight: false,
      isImageSelected: false,
      hasDropCap: false,
      headingLevel: '',
      fontSize: '',
      fontFamily: '',
      color: '',
      backgroundColor: '',
    }

    const focusEditor = useCallback(() => {
      editor?.commands.focus()
    }, [editor])

    const syncAiSelectionState = useCallback(() => {
      if (!editor) return
      const { from, to } = editor.state.selection
      const hasSelection = from !== to
      const selectedText = hasSelection ? editor.state.doc.textBetween(from, to, '\n\n').trim() : ''
      const currentParagraph = (() => {
        const { $from } = editor.state.selection
        for (let depth = $from.depth; depth >= 0; depth -= 1) {
          const node = $from.node(depth)
          if (node.type.name === 'paragraph' || node.type.name === 'heading') {
            return node.textContent.trim()
          }
        }
        return ''
      })()
      const contextBefore = editor.state.doc.textBetween(
        Math.max(0, from - AI_CONTEXT_LIMIT),
        from,
        '\n\n',
      ).trim()
      const contextAfter = editor.state.doc.textBetween(
        to,
        Math.min(editor.state.doc.content.size, to + AI_CONTEXT_LIMIT),
        '\n\n',
      ).trim()

      setAiSelectionRange(hasSelection ? { from, to } : null)
      setAiHasSelection(hasSelection)
      setAiSelectedText(selectedText)
      setAiCurrentParagraph(currentParagraph)
      setAiContextBefore(contextBefore)
      setAiContextAfter(contextAfter)
    }, [editor])

    useEffect(() => {
      if (!editor) return
      editor.on('selectionUpdate', syncAiSelectionState)
      return () => {
        editor.off('selectionUpdate', syncAiSelectionState)
      }
    }, [editor, syncAiSelectionState])

    const insertInlineImage = useCallback((attrs: { src: string; alt?: string; width?: number; photoId?: string }) => {
      if (!editor || isAiTaskLocked) return

      // Compute default width from editor content width before inserting to avoid flicker
      let width = attrs.width
      if (!width) {
        const editorDom = editor.view.dom
        const computedStyle = window.getComputedStyle(editorDom)
        const contentWidth = editorDom.clientWidth - (parseFloat(computedStyle.paddingLeft) || 0) - (parseFloat(computedStyle.paddingRight) || 0)
        width = Math.max(40, Math.round(contentWidth * 0.5))
      }

      // Focus first as a separate step so that ProseMirror's selection is
      // properly restored from EditorState before insertContent runs.
      // Previously focus() was in the same chain as insertContent, which could
      // cause the insert to happen at a stale position when the editor lost
      // focus due to clicking an external button (e.g. the photo panel).
      focusEditor()
      editor
        .chain()
        .insertContent({
          type: 'paragraph',
          attrs: { textAlign: 'center' },
          content: [{
              type: 'image',
              attrs: {
                src: attrs.src,
                alt: attrs.alt || '',
                width,
                ...(attrs.photoId ? { photoId: attrs.photoId } : {}),
              },
            }],
        })
        .run()
    }, [editor, focusEditor, isAiTaskLocked])

    // AI 结果的实际落库操作（diff 确认后调用）
    const performAiApply = useCallback((
      mode: 'replace' | 'insert' | 'append',
      preview: string,
      selectionRange: { from: number; to: number } | null,
    ) => {
      if (!editor || isAiTaskLocked || !preview.trim()) return

      const html = convertPlainTextToEditorHtml(preview)
      if (!html) return

      if (mode === 'replace' && selectionRange) {
        editor
          .chain()
          .focus()
          .setTextSelection(selectionRange)
          .insertContent(html)
          .run()
      } else if (mode === 'append') {
        editor
          .chain()
          .focus('end')
          .insertContent(html)
          .run()
      } else {
        editor
          .chain()
          .focus()
          .insertContent(html)
          .run()
      }

      focusEditor()
    }, [editor, focusEditor, isAiTaskLocked])

    // 替换选区前先弹 diff 预览确认；插入/追加无覆盖风险，直接应用
    const applyAiResult = useCallback((
      mode: 'replace' | 'insert' | 'append',
      preview: string,
      selectionRange: { from: number; to: number } | null,
    ) => {
      if (!editor || isAiTaskLocked || !preview.trim()) return

      if (mode === 'replace' && selectionRange) {
        const originalText = editor.state.doc.textBetween(selectionRange.from, selectionRange.to, '\n')
        setAiApplyPreview({ preview, selectionRange, originalText })
        return
      }

      performAiApply(mode, preview, selectionRange)
    }, [editor, isAiTaskLocked, performAiApply])

    // ── Agent：/agent 指令的执行与提案审阅 ─────────────

    const agentRunner = useMemo<TipTapAiAgentRunner | undefined>(() => {
      if (!runtime.getAgentEndpoint || !editor) return undefined
      const getAgentEndpoint = runtime.getAgentEndpoint
      return async ({ instruction, model, signal, onEvent }) => {
        const token = aiOptions?.token ?? ''
        const endpoint = await getAgentEndpoint(token)
        let modelId = model
        if (!modelId) {
          const models = await runtime.ai.getStoryAiModels(token)
          modelId = models.defaultModel
        }
        if (!modelId) throw new Error(t('editor.ai_agent_unavailable'))

        const result = await runEditorAgent({
          endpoint,
          model: modelId,
          instruction,
          document: createEditorDocumentSnapshot({
            title: aiOptions?.title,
            text: linearizeDoc(editor.state.doc).text,
          }),
          signal,
          onEvent,
        })

        if (result.proposals.length > 0) {
          setAgentReview({ proposals: result.proposals, index: 0, error: '' })
        }
        return { summary: result.summary, proposalCount: result.proposals.length }
      }
    }, [editor, runtime, aiOptions?.token, aiOptions?.title, t])

    const advanceAgentReview = useCallback(() => {
      setAgentReview((current) => {
        if (!current) return null
        const nextIndex = current.index + 1
        return nextIndex >= current.proposals.length
          ? null
          : { ...current, index: nextIndex, error: '' }
      })
    }, [])

    const handleAgentProposalApply = useCallback(() => {
      if (!editor || isAiTaskLocked || !agentReview) return
      const proposal = agentReview.proposals[agentReview.index]
      const operation = getTextReplacementOperation(proposal)
      if (!operation) {
        setAgentReview({ ...agentReview, error: t('editor.ai_diff_not_found') })
        return
      }
      const range = findDocTextRange(editor.state.doc, operation.match.text)
      if (!range) {
        setAgentReview({ ...agentReview, error: t('editor.ai_diff_not_found') })
        return
      }
      if (operation.replacement) {
        const html = convertPlainTextToEditorHtml(operation.replacement)
        editor.chain().focus().setTextSelection(range).insertContent(html).run()
      } else {
        editor.chain().focus().setTextSelection(range).deleteSelection().run()
      }
      advanceAgentReview()
    }, [editor, agentReview, advanceAgentReview, isAiTaskLocked, t])

    const currentAgentProposal = agentReview ? agentReview.proposals[agentReview.index] : null
    const currentAgentOperation = currentAgentProposal
      ? getTextReplacementOperation(currentAgentProposal)
      : null

    const imperativeHandle = useEditorImperativeHandle({
      editor,
      currentValueRef,
      onChange,
      onJsonChange,
      focusEditor,
      insertInlineImage,
      isAiTaskLocked,
    })

    useImperativeHandle(ref, () => imperativeHandle, [imperativeHandle])

    const toggleBold = () => !isAiTaskLocked && editor?.chain().focus().toggleBold().run()
    const toggleItalic = () => !isAiTaskLocked && editor?.chain().focus().toggleItalic().run()
    const toggleUnderline = () => !isAiTaskLocked && editor?.chain().focus().toggleUnderline().run()
    const toggleStrike = () => !isAiTaskLocked && editor?.chain().focus().toggleStrike().run()
    const toggleBulletList = () => !isAiTaskLocked && editor?.chain().focus().toggleBulletList().run()
    const toggleOrderedList = () => !isAiTaskLocked && editor?.chain().focus().toggleOrderedList().run()
    const toggleBlockquote = () => !isAiTaskLocked && editor?.chain().focus().toggleBlockquote().run()
    const toggleCode = () => !isAiTaskLocked && editor?.chain().focus().toggleCode().run()

    const setLink = useCallback(() => {
      if (!editor || isAiTaskLocked) return
      if (showLinkInput) {
        if (linkUrl) {
          editor.chain().focus().setLink({ href: linkUrl }).run()
        } else {
          editor.chain().focus().unsetLink().run()
        }
        setShowLinkInput(false)
        setLinkUrl('')
      } else {
        const previousUrl = editor.getAttributes('link').href
        setLinkUrl(previousUrl || '')
        setShowImageInput(false)
        setShowLinkInput(true)
      }
    }, [editor, isAiTaskLocked, linkUrl, showLinkInput])

    const addImage = useCallback(() => {
      if (!editor || isAiTaskLocked) return
      if (showImageInput) {
        if (imageUrl) {
          insertInlineImage({ src: imageUrl })
        }
        setShowImageInput(false)
        setImageUrl('')
      } else {
        setShowLinkInput(false)
        setShowImageInput(true)
      }
    }, [editor, imageUrl, insertInlineImage, isAiTaskLocked, showImageInput])

    const addTable = useCallback(() => {
      if (!editor || isAiTaskLocked) return
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    }, [editor, isAiTaskLocked])

    const setTextAlign = useCallback((align: 'left' | 'center' | 'right') => {
      if (!editor || isAiTaskLocked) return
      const chain = editor.chain().focus()
      if ((align === 'center' || align === 'right') && resolvedEditorUiState.hasDropCap) {
        chain.setParagraphDropCap(false)
      }
      chain.setTextAlign(align).run()
    }, [editor, isAiTaskLocked, resolvedEditorUiState.hasDropCap])

    const toggleDropCap = useCallback(() => {
      if (!editor || isAiTaskLocked) return
      const chain = editor.chain().focus()
      if (resolvedEditorUiState.hasDropCap) {
        chain.setParagraphDropCap(false).run()
        return
      }
      if (resolvedEditorUiState.isAlignCenter || resolvedEditorUiState.isAlignRight) {
        chain.setTextAlign('left')
      }
      chain.setParagraphDropCap(true).run()
    }, [editor, isAiTaskLocked, resolvedEditorUiState.hasDropCap, resolvedEditorUiState.isAlignCenter, resolvedEditorUiState.isAlignRight])

    const setHeadingLevel = useCallback((level: string) => {
      if (!editor || isAiTaskLocked) return
      const chain = editor.chain().focus()
      const pendingSelection = pendingSelectionRef.current
      if (pendingSelection) {
        chain.setTextSelection(pendingSelection)
      }
      if (['1', '2', '3', '4', '5', '6'].includes(level)) {
        chain.setHeading({ level: Number.parseInt(level, 10) as 1 | 2 | 3 | 4 | 5 | 6 }).run()
      } else {
        chain.setParagraph().run()
      }
      pendingSelectionRef.current = null
    }, [editor, isAiTaskLocked])

    const setFontSize = useCallback((fontSize: string) => {
      if (!editor || isAiTaskLocked) return
      const chain = editor.chain().focus()
      const pendingSelection = pendingSelectionRef.current
      if (pendingSelection) {
        chain.setTextSelection(pendingSelection)
      }
      if (fontSize) {
        chain.setFontSize(fontSize).run()
      } else {
        chain.unsetFontSize().run()
      }
      pendingSelectionRef.current = null
    }, [editor, isAiTaskLocked])

    const setFontFamily = useCallback((fontFamily: string) => {
      if (!editor || isAiTaskLocked) return
      const chain = editor.chain().focus()
      const pendingSelection = pendingSelectionRef.current
      if (pendingSelection) {
        chain.setTextSelection(pendingSelection)
      }
      if (fontFamily) {
        chain.setFontFamily(fontFamily).run()
      } else {
        chain.unsetFontFamily().run()
      }
      pendingSelectionRef.current = null
    }, [editor, isAiTaskLocked])

    const setTextColor = useCallback((color: string) => {
      if (!editor || isAiTaskLocked) return
      const normalizedColor = color ? normalizeHexColor(color) : ''
      if (color && !normalizedColor) return

      const chain = editor.chain().focus()
      const pendingSelection = pendingSelectionRef.current
      if (pendingSelection) {
        chain.setTextSelection(pendingSelection)
      }

      if (normalizedColor) {
        chain.setTextColor(normalizedColor).run()
        setCustomTextColor(normalizedColor)
        setRecentTextColors((current) => {
          const nextColors = [normalizedColor, ...current.filter((item) => item !== normalizedColor)]
          return nextColors.slice(0, TEXT_COLOR_RECENT_LIMIT)
        })
      } else {
        chain.unsetTextColor().run()
      }

      pendingSelectionRef.current = null
      setShowTextColorMenu(false)
    }, [editor, isAiTaskLocked])

    const setBackgroundColor = useCallback((backgroundColor: string) => {
      if (!editor || isAiTaskLocked) return
      const normalizedBackgroundColor = backgroundColor ? normalizeHexColor(backgroundColor) : ''
      if (backgroundColor && !normalizedBackgroundColor) return

      const chain = editor.chain().focus()
      const pendingSelection = pendingSelectionRef.current
      if (pendingSelection) {
        chain.setTextSelection(pendingSelection)
      }

      if (normalizedBackgroundColor) {
        chain.setBackgroundColor(normalizedBackgroundColor).run()
        setCustomBackgroundColor(normalizedBackgroundColor)
        setRecentBackgroundColors((current) => {
          const nextColors = [normalizedBackgroundColor, ...current.filter((c) => c !== normalizedBackgroundColor)]
          return nextColors.slice(0, BACKGROUND_COLOR_RECENT_LIMIT)
        })
      } else {
        chain.unsetBackgroundColor().run()
      }

      pendingSelectionRef.current = null
      setShowBackgroundColorMenu(false)
    }, [editor, isAiTaskLocked])

    useColorPickerMenu({
      isOpen: showTextColorMenu,
      buttonRef: textColorButtonRef,
      menuRef: textColorMenuRef,
      onSetIsOpen: setShowTextColorMenu,
      onSetPosition: setTextColorMenuPosition,
    })

    useColorPickerMenu({
      isOpen: showBackgroundColorMenu,
      buttonRef: backgroundColorButtonRef,
      menuRef: backgroundColorMenuRef,
      onSetIsOpen: setShowBackgroundColorMenu,
      onSetPosition: setBackgroundColorMenuPosition,
    })

    const preserveSelectionOnToolbarMouseDown = useCallback((event: React.MouseEvent<Element>) => {
      event.preventDefault()
    }, [])

    const preserveSelectionOnSelectMouseDown = useCallback(() => {
      if (!editor) return
      const { from, to } = editor.state.selection
      pendingSelectionRef.current = { from, to }
    }, [editor])

    const clearFormatting = useCallback(() => {
      if (!editor || isAiTaskLocked) return
      editor
        .chain()
        .focus()
        .clearNodes()
        .unsetAllMarks()
        .run()
    }, [editor, isAiTaskLocked])

    const undo = () => !isAiTaskLocked && editor?.chain().focus().undo().run()
    const redo = () => !isAiTaskLocked && editor?.chain().focus().redo().run()

    if (!editor) {
      return (
        <div className={`h-full flex items-center justify-center bg-muted/30 ${className || ''}`}>
          <div className="animate-pulse w-full h-full min-h-[300px] bg-muted/50" />
        </div>
      )
    }

    return (
      <div
        className={`tiptap-editor h-full flex flex-col border-x border-border/60 bg-background ${resolvedTheme === 'dark' ? 'tiptap-dark' : 'tiptap-light'} ${className || ''}`}
        aria-busy={isAiTaskLocked}
        aria-readonly={isAiTaskLocked}
        data-document-id={documentId}
        data-document-kind={documentKind}
      >
        {/* Toolbar */}
        <fieldset
          disabled={isAiTaskLocked}
          aria-disabled={isAiTaskLocked}
          className="scrollbar-hide flex min-w-0 flex-nowrap items-center gap-0.5 overflow-x-auto border-0 border-b border-border/70 bg-gradient-to-r from-muted/20 via-background to-muted/5 px-2 py-1.5 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ToolbarSelect
            value={resolvedEditorUiState.headingLevel}
            onChange={setHeadingLevel}
            onMouseDown={preserveSelectionOnSelectMouseDown}
            title={t('editor.heading_level')}
            options={headingOptions}
          />
          <ToolbarSelect
            value={resolvedEditorUiState.fontFamily}
            onChange={setFontFamily}
            onMouseDown={preserveSelectionOnSelectMouseDown}
            title={t('editor.font_family')}
            options={fontFamilyOptions}
          />
          <ToolbarSelect
            value={resolvedEditorUiState.fontSize}
            onChange={setFontSize}
            onMouseDown={preserveSelectionOnSelectMouseDown}
            title={t('editor.font_size')}
            options={fontSizeOptions}
          />

          <ToolbarDivider />

          <ToolbarButton onClick={toggleBold} isActive={resolvedEditorUiState.isBold} title={t('editor.bold')}>
            <Bold className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={toggleItalic} isActive={resolvedEditorUiState.isItalic} title={t('editor.italic')}>
            <Italic className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={toggleUnderline} isActive={resolvedEditorUiState.isUnderline} title={t('editor.underline')}>
            <UnderlineIcon className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={toggleStrike} isActive={resolvedEditorUiState.isStrike} title={t('editor.strike')}>
            <Strikethrough className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={toggleCode} isActive={resolvedEditorUiState.isCode} title={t('editor.inline_code')}>
            <Code className="w-4 h-4" />
          </ToolbarButton>

          {/* Text Color */}
          <div className="relative">
            <ToolbarButton
              buttonRef={textColorButtonRef}
              onMouseDown={preserveSelectionOnToolbarMouseDown}
              onClick={() => {
                if (!showTextColorMenu) {
                  setCustomTextColor(resolvedEditorUiState.color || DEFAULT_TEXT_COLOR)
                  setTextColorTab(
                    MORE_TEXT_COLOR_OPTIONS.includes(
                      (resolvedEditorUiState.color || '').toLowerCase() as (typeof MORE_TEXT_COLOR_OPTIONS)[number]
                    )
                      ? 'more'
                      : 'basic'
                  )
                }
                setShowBackgroundColorMenu(false)
                setShowTextColorMenu((current) => !current)
              }}
              isActive={Boolean(resolvedEditorUiState.color)}
              title={t('editor.text_color')}
            >
              <span className="relative flex items-center justify-center">
                <Palette className="h-4 w-4" />
                <span
                  className="absolute bottom-0 left-1/2 h-1.5 w-3 -translate-x-1/2 rounded-sm border border-black/5"
                  style={{ backgroundColor: resolvedEditorUiState.color || DEFAULT_TEXT_COLOR }}
                />
              </span>
            </ToolbarButton>
          </div>

          {/* Background Color */}
          <div className="relative">
            <ToolbarButton
              buttonRef={backgroundColorButtonRef}
              onMouseDown={preserveSelectionOnToolbarMouseDown}
              onClick={() => {
                if (!showBackgroundColorMenu) {
                  setCustomBackgroundColor(resolvedEditorUiState.backgroundColor || DEFAULT_TEXT_HIGHLIGHT)
                  setBackgroundColorTab(
                    MORE_BACKGROUND_COLOR_OPTIONS.includes(
                      (resolvedEditorUiState.backgroundColor || '').toLowerCase() as (typeof MORE_BACKGROUND_COLOR_OPTIONS)[number]
                    )
                      ? 'more'
                      : 'basic'
                  )
                }
                setShowTextColorMenu(false)
                setShowBackgroundColorMenu((current) => !current)
              }}
              isActive={Boolean(resolvedEditorUiState.backgroundColor)}
              title={t('editor.background_color')}
            >
              <span className="relative flex items-center justify-center">
                <Highlighter className="h-4 w-4" />
                <span
                  className="absolute bottom-0 left-1/2 h-1.5 w-3 -translate-x-1/2 rounded-sm border border-black/5"
                  style={{ backgroundColor: resolvedEditorUiState.backgroundColor || DEFAULT_TEXT_HIGHLIGHT }}
                />
              </span>
            </ToolbarButton>
          </div>

          <ToolbarDivider />

          <ToolbarButton onClick={toggleBulletList} isActive={resolvedEditorUiState.isBulletList} title={t('editor.bullet_list')}>
            <List className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={toggleOrderedList} isActive={resolvedEditorUiState.isOrderedList} title={t('editor.ordered_list')}>
            <ListOrdered className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={toggleBlockquote} isActive={resolvedEditorUiState.isBlockquote} title={t('editor.blockquote')}>
            <Quote className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={toggleDropCap} isActive={resolvedEditorUiState.hasDropCap} title={t('editor.drop_cap')}>
            <Pilcrow className="w-4 h-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton onMouseDown={preserveSelectionOnToolbarMouseDown} onClick={() => setTextAlign('left')} isActive={resolvedEditorUiState.isAlignLeft} title={t('editor.align_left')}>
            <AlignLeft className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onMouseDown={preserveSelectionOnToolbarMouseDown} onClick={() => setTextAlign('center')} isActive={resolvedEditorUiState.isAlignCenter} title={t('editor.align_center')}>
            <AlignCenter className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onMouseDown={preserveSelectionOnToolbarMouseDown} onClick={() => setTextAlign('right')} isActive={resolvedEditorUiState.isAlignRight} title={t('editor.align_right')}>
            <AlignRight className="w-4 h-4" />
          </ToolbarButton>

          <ToolbarDivider />

          {/* Link */}
          <div className="relative">
            <ToolbarButton onClick={setLink} isActive={resolvedEditorUiState.isLink} title={t('editor.link')}>
              <LinkIcon className="w-4 h-4" />
            </ToolbarButton>
            {showLinkInput && (
              <div className="absolute top-full left-0 z-10 mt-1 flex items-center gap-1 border border-border bg-background p-2 shadow-lg">
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder={t('editor.link_placeholder')}
                  className="w-40 border border-border px-2 py-1 text-xs focus:border-primary outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setLink()
                    if (e.key === 'Escape') setShowLinkInput(false)
                  }}
                  autoFocus
                />
                <button
                  onClick={setLink}
                  className="bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
                >
                  {t('editor.confirm')}
                </button>
              </div>
            )}
          </div>

          {/* Image */}
          <div className="relative">
            <ToolbarButton onClick={addImage} title={t('editor.image')}>
              <ImageIcon className="w-4 h-4" />
            </ToolbarButton>
            {showImageInput && (
              <div className="absolute top-full left-0 z-10 mt-1 flex items-center gap-1 border border-border bg-background p-2 shadow-lg">
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder={t('editor.image_placeholder')}
                  className="w-40 border border-border px-2 py-1 text-xs focus:border-primary outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addImage()
                    if (e.key === 'Escape') setShowImageInput(false)
                  }}
                  autoFocus
                />
                <button
                  onClick={addImage}
                  className="bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
                >
                  {t('editor.confirm')}
                </button>
              </div>
            )}
          </div>

          <div className="relative">
            <ToolbarButton
              onMouseDown={preserveSelectionOnToolbarMouseDown}
              onClick={focusEditor}
              isActive={resolvedEditorUiState.isMediaEmbed}
              title={t('editor.media')}
            >
              <Clapperboard className="w-4 h-4" />
            </ToolbarButton>
          </div>

          <ToolbarButton onClick={addTable} title={t('editor.table')}>
            <TableIcon className="w-4 h-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton onClick={clearFormatting} title={t('editor.clear_formatting')}>
            <RemoveFormatting className="w-4 h-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton onClick={undo} disabled={isAiTaskLocked || !editor.can().undo()} title={t('editor.undo')}>
            <Undo className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={redo} disabled={isAiTaskLocked || !editor.can().redo()} title={t('editor.redo')}>
            <Redo className="w-4 h-4" />
          </ToolbarButton>
        </fieldset>

        {/* Color Picker Menus */}
        <BackgroundColorPicker
          isOpen={showBackgroundColorMenu && !isAiTaskLocked}
          position={backgroundColorMenuPosition}
          currentColor={resolvedEditorUiState.backgroundColor}
          recentColors={recentBackgroundColors}
          customColor={customBackgroundColor}
          tab={backgroundColorTab}
          menuRef={backgroundColorMenuRef}
          pickerRef={backgroundColorPickerRef}
          onSetColor={setBackgroundColor}
          onSetCustomColor={setCustomBackgroundColor}
          onSetTab={setBackgroundColorTab}
          onMouseDown={preserveSelectionOnToolbarMouseDown}
          t={t}
        />

        <TextColorPicker
          isOpen={showTextColorMenu && !isAiTaskLocked}
          position={textColorMenuPosition}
          currentColor={resolvedEditorUiState.color}
          recentColors={recentTextColors}
          customColor={customTextColor}
          tab={textColorTab}
          menuRef={textColorMenuRef}
          pickerRef={textColorPickerRef}
          onSetColor={setTextColor}
          onSetCustomColor={setCustomTextColor}
          onSetTab={setTextColorTab}
          onMouseDown={preserveSelectionOnToolbarMouseDown}
          t={t}
        />

        {aiOptions?.enabled ? (
          <AiSidebar label={t('editor.ai_button')} onExpand={syncAiSelectionState}>
            <AiSidebar.Content>
              <div className="h-full overflow-y-auto bg-[linear-gradient(to_bottom,rgba(127,127,127,0.03),transparent_96px)]">
                <div className="relative h-full">
                  <EditorContent editor={editor} className="h-full custom-scrollbar" />
                </div>
              </div>
            </AiSidebar.Content>
            <AiSidebar.Toggle />
            <AiSidebar.Panel>
              <TipTapAiAssistant
                t={t}
                api={runtime.ai}
                agentRunner={agentRunner}
                options={aiOptions}
                documentId={documentId}
                documentKind={documentKind}
                aiTaskLock={aiTaskLock}
                context={{
                  selectionRange: aiSelectionRange,
                  hasSelection: aiHasSelection,
                  selectedText: aiSelectedText,
                  currentParagraph: aiCurrentParagraph,
                  contextBefore: aiContextBefore,
                  contextAfter: aiContextAfter,
                }}
                onApplyResult={applyAiResult}
              />
            </AiSidebar.Panel>
          </AiSidebar>
        ) : (
          <div className="flex-1 overflow-y-auto bg-[linear-gradient(to_bottom,rgba(127,127,127,0.03),transparent_96px)]">
            <div className="relative h-full">
              <EditorContent editor={editor} className="h-full custom-scrollbar" />
            </div>
          </div>
        )}

        {/* 替换选区前的 diff 确认 */}
        <AiDiffPreviewDialog
          open={!!aiApplyPreview}
          title={t('editor.ai_diff_title')}
          originalText={aiApplyPreview?.originalText ?? ''}
          newText={aiApplyPreview?.preview ?? ''}
          onConfirm={() => {
            if (aiApplyPreview) {
              performAiApply('replace', aiApplyPreview.preview, aiApplyPreview.selectionRange)
            }
            setAiApplyPreview(null)
          }}
          onCancel={() => setAiApplyPreview(null)}
          t={t}
        />

        {/* Agent 修改提案逐条审阅 */}
        <AiDiffPreviewDialog
          open={!!currentAgentOperation}
          title={t('editor.ai_diff_agent_title')}
          originalText={currentAgentOperation?.match.text ?? ''}
          newText={currentAgentOperation?.replacement ?? ''}
          reason={currentAgentProposal?.reason}
          progress={agentReview ? { index: agentReview.index + 1, total: agentReview.proposals.length } : undefined}
          error={agentReview?.error || undefined}
          onConfirm={handleAgentProposalApply}
          onSkip={advanceAgentReview}
          onCancel={() => setAgentReview(null)}
          t={t}
        />
      </div>
    )
  }
)

NarrativeTipTapEditor.displayName = 'NarrativeTipTapEditor'

export default NarrativeTipTapEditor
