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
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus'
import DragHandle from '@tiptap/extension-drag-handle-react'
import type { JSONContent } from '@tiptap/core'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
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
  RemoveFormatting,
  Plus,
  Copy,
  GripVertical,
  MoreHorizontal,
  RotateCcw,
  MoveHorizontal,
  Trash2,
} from 'lucide-react'
import TipTapAiAssistant, { type TipTapAiAgentRunner } from './TipTapAiAssistant'
import type { NarrativeEditorRuntime } from './runtime'
import {
  runDirectEditAgent,
} from '@mo-gallery/ai-agent'
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
import {
  CommandMenuItem,
  FloatingToolbarButton,
  ToolbarButton,
  ToolbarDivider,
  ToolbarPopover,
  ToolbarSelect,
} from './tiptap-editor/EditorToolbar'
import {
  createEditorCommandRegistry,
  getCommandsForSurface,
  type EditorCommandDescriptor,
} from './tiptap-editor/editor-command-registry'
import { BackgroundColorPicker, TextColorPicker, useColorPickerMenu } from './tiptap-editor/ColorPickerMenu'
import { useNarrativeEditor } from './tiptap-editor/useNarrativeEditor'
import { useEditorImperativeHandle, type NarrativeTipTapEditorHandle } from './tiptap-editor/useEditorImperativeHandle'
import {
  createNarrativeAiTask,
  createNarrativeAiTaskLock,
  useNarrativeAiTaskLock,
  type NarrativeAiTaskLock,
} from './tiptap-editor/ai-task-lock'
import { createAiTaskLockNotifier } from './tiptap-editor/ai-task-lock-notifier'
import { createNarrativeDirectEditHost } from './tiptap-editor/narrative-direct-edit-host'
import { WechatIcon } from './tiptap-editor/WechatIcon'
import './tiptap-editor.css'

export interface NarrativeTipTapEditorProps {
  value: string
  jsonValue?: JSONContent | null
  onChange: (value: string) => void
  onJsonChange?: (value: JSONContent) => void
  placeholder?: string
  onPasteFiles?: (files: File[]) => void | Promise<void>
  className?: string
  toolbarAfterRedoAction?: {
    title: string
    onClick: () => void
    icon: React.ReactNode
    disabled?: boolean
  }
  /** 宿主应用注入的 i18n / 主题 / 后端接口 */
  runtime: NarrativeEditorRuntime
  documentId?: string
  documentKind?: 'story' | 'blog'
  /** 文档内容版本号：变化时原地重置编辑器内容（见 useNarrativeEditor） */
  contentVersion?: string | number
  onAiTaskLockChange?: (locked: boolean) => void
  aiOptions?: {
    enabled: boolean
    token?: string | null
    scopeId?: string
    title?: string
  }
}

export type { NarrativeTipTapEditorHandle }

type BubbleMenuShouldShow = NonNullable<React.ComponentProps<typeof BubbleMenu>['shouldShow']>
type FloatingMenuShouldShow = NonNullable<React.ComponentProps<typeof FloatingMenu>['shouldShow']>
type DragHandlePositionConfig = NonNullable<React.ComponentProps<typeof DragHandle>['computePositionConfig']>

export const NarrativeTipTapEditor = forwardRef<NarrativeTipTapEditorHandle, NarrativeTipTapEditorProps>(
  ({
    value,
    jsonValue,
    onChange,
    onJsonChange,
    placeholder,
    onPasteFiles,
    className,
    toolbarAfterRedoAction,
    runtime,
    documentId,
    documentKind,
    contentVersion,
    onAiTaskLockChange,
    aiOptions,
  }, ref) => {
    const pendingSelectionRef = useRef<{ from: number; to: number } | null>(null)
    const toolbarRef = useRef<HTMLFieldSetElement | null>(null)
    const backgroundColorButtonRef = useRef<HTMLButtonElement | null>(null)
    const bubbleBackgroundColorButtonRef = useRef<HTMLButtonElement | null>(null)
    const backgroundColorMenuRef = useRef<HTMLDivElement | null>(null)
    const backgroundColorPickerRef = useRef<HTMLInputElement | null>(null)
    const textColorButtonRef = useRef<HTMLButtonElement | null>(null)
    const bubbleTextColorButtonRef = useRef<HTMLButtonElement | null>(null)
    const textColorMenuRef = useRef<HTMLDivElement | null>(null)
    const textColorPickerRef = useRef<HTMLInputElement | null>(null)
    const copyStatusTimerRef = useRef<number | null>(null)

    const [showLinkInput, setShowLinkInput] = useState(false)
    const [linkUrl, setLinkUrl] = useState('')
    const [showImageInput, setShowImageInput] = useState(false)
    const [imageUrl, setImageUrl] = useState('')
    const [openToolbarMenu, setOpenToolbarMenu] = useState<'insert' | 'format' | 'copy' | null>(null)
    const [copyStatus, setCopyStatus] = useState<'success' | 'error' | null>(null)
    const [showBackgroundColorMenu, setShowBackgroundColorMenu] = useState(false)
    const [backgroundColorAnchor, setBackgroundColorAnchor] = useState<'toolbar' | 'bubble'>('toolbar')
    const [backgroundColorMenuPosition, setBackgroundColorMenuPosition] = useState({ top: 0, left: 0 })
    const [customBackgroundColor, setCustomBackgroundColor] = useState(DEFAULT_TEXT_HIGHLIGHT)
    const [recentBackgroundColors, setRecentBackgroundColors] = useState<string[]>([])
    const [backgroundColorTab, setBackgroundColorTab] = useState<'basic' | 'more'>('basic')
    const [showTextColorMenu, setShowTextColorMenu] = useState(false)
    const [textColorAnchor, setTextColorAnchor] = useState<'toolbar' | 'bubble'>('toolbar')
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
    const [aiTaskLock] = useState<NarrativeAiTaskLock>(() => createNarrativeAiTaskLock())
    const [directEditTaskTokens] = useState(
      () => new Map<string, ReturnType<typeof createNarrativeAiTask>>(),
    )
    const isAiTaskLocked = useNarrativeAiTaskLock(aiTaskLock)
    const [aiTaskLockNotifier] = useState(() => createAiTaskLockNotifier())

    const { t, resolvedTheme } = runtime

    useEffect(() => {
      aiTaskLockNotifier.update(onAiTaskLockChange, isAiTaskLocked)
    }, [aiTaskLockNotifier, isAiTaskLocked, onAiTaskLockChange])

    useEffect(() => () => {
      aiTaskLockNotifier.dispose()
      if (copyStatusTimerRef.current !== null) {
        window.clearTimeout(copyStatusTimerRef.current)
      }
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
      contentVersion,
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
      headingLevel: '',
      fontSize: '',
      fontFamily: '',
      color: '',
      backgroundColor: '',
    }

    const focusEditor = useCallback(() => {
      editor?.commands.focus()
    }, [editor])

    // 斜杠菜单由段落开头的 '/' 触发；执行命令前先删掉触发字符，
    // 否则选中的块级命令会作用在残留的 '/' 文本上。
    const runFloatingCommand = useCallback((command: EditorCommandDescriptor) => {
      if (!editor) return
      const { $from } = editor.state.selection
      if ($from.parent.type.name === 'paragraph' && $from.parent.textContent.startsWith('/')) {
        const paragraphStart = $from.before($from.depth)
        editor.view.dispatch(editor.state.tr.delete(paragraphStart + 1, paragraphStart + 2))
      }
      command.execute()
    }, [editor])

    const shouldShowImageBubbleMenu = useCallback<BubbleMenuShouldShow>(({ editor: currentEditor, state }) => (
      !isAiTaskLocked
      && currentEditor.isEditable
      && state.selection instanceof NodeSelection
      && state.selection.node.type.name === 'image'
    ), [isAiTaskLocked])

    const resetImageSize = useCallback(() => {
      if (!editor || isAiTaskLocked) return
      editor.chain().focus().updateAttributes('image', { width: null, height: null }).run()
    }, [editor, isAiTaskLocked])

    const fitImageToContentWidth = useCallback(() => {
      if (!editor || isAiTaskLocked) return
      const editorDom = editor.view.dom
      const computedStyle = window.getComputedStyle(editorDom)
      const contentWidth = editorDom.clientWidth
        - (parseFloat(computedStyle.paddingLeft) || 0)
        - (parseFloat(computedStyle.paddingRight) || 0)
      editor
        .chain()
        .focus()
        .updateAttributes('image', { width: Math.max(100, Math.round(contentWidth)), height: null })
        .run()
    }, [editor, isAiTaskLocked])

    const deleteSelectedImage = useCallback(() => {
      if (!editor || isAiTaskLocked) return
      editor.chain().focus().deleteSelection().run()
    }, [editor, isAiTaskLocked])

    // 下拉（标题/字体/字号）收起且未产生变更时，把编辑器选区和焦点还回去，
    // 避免选区变灰、下一次格式化丢失作用范围。
    const restoreSelectionOnSelectBlur = useCallback((event: React.FocusEvent<HTMLSelectElement>) => {
      const pendingSelection = pendingSelectionRef.current
      if (!pendingSelection || !editor) return
      const nextTarget = event.relatedTarget as HTMLElement | null
      if (nextTarget && !nextTarget.isContentEditable) return
      pendingSelectionRef.current = null
      editor.chain().focus().setTextSelection(pendingSelection).run()
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
                // 未显式指定宽度时按原始尺寸展示（CSS max-width 兜底），
                // 不再强制缩放到 50%，用户可后续拖拽或用图片气泡调整。
                width: attrs.width ?? null,
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

    const directEditHost = useMemo(() => {
      if (!editor || !documentId || !documentKind) return undefined
      return createNarrativeDirectEditHost({
        documentId,
        documentKind,
        editorWidth: editor.view.dom.clientWidth,
        getDocument: () => editor.getJSON(),
        getEditorState: () => editor.state,
        dispatchTransaction: (transaction) => editor.view.dispatch(transaction),
        lockTask: (taskId) => {
          const task = createNarrativeAiTask(taskId)
          if (!aiTaskLock.acquire(task)) {
            throw new Error('The narrative editor is already running another AI task')
          }
          directEditTaskTokens.set(taskId, task)
        },
        unlockTask: (taskId) => {
          const task = directEditTaskTokens.get(taskId)
          if (task === undefined || !aiTaskLock.release(task)) {
            throw new Error(`Narrative AI task ${taskId} does not own the editor lock`)
          }
          directEditTaskTokens.delete(taskId)
        },
      })
    }, [aiTaskLock, directEditTaskTokens, documentId, documentKind, editor])

    const agentRunner = useMemo<TipTapAiAgentRunner | undefined>(() => {
      if (!runtime.getAgentEndpoint || !directEditHost) return undefined
      const getAgentEndpoint = runtime.getAgentEndpoint
      return async ({ taskId, instruction, model, signal, onEvent }) => {
        const token = aiOptions?.token ?? ''
        const endpoint = await getAgentEndpoint(token)
        const models = await runtime.ai.getStoryAiModels(token)
        const modelId = model || models.defaultModel
        if (!modelId) throw new Error(t('editor.ai_agent_unavailable'))
        const modelOption = models.models.find((candidate) => candidate.id === modelId)

        return await runDirectEditAgent({
          endpoint,
          model: modelId,
          instruction,
          taskType: 'instruction',
          host: directEditHost,
          modelCapabilities: {
            vision: modelOption?.vision ?? false,
            toolCalling: modelOption?.tools ?? false,
            structuredOutput: modelOption?.structuredOutput ?? false,
            ...(modelOption?.contextWindow
              ? { maxInputTokens: modelOption.contextWindow }
              : {}),
          },
          authorization: { allowDelete: false, deleteTargetIds: [] },
          taskId,
          signal,
          onEvent,
        })
      }
    }, [directEditHost, runtime, aiOptions?.token, t])

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

    useEffect(() => {
      if (!editor) return
      const handleToolbarShortcut = (event: KeyboardEvent) => {
        if (!event.altKey || event.key !== 'F10' || !editor.view.hasFocus()) return
        event.preventDefault()
        toolbarRef.current?.querySelector<HTMLElement>('button:not([disabled]), select:not([disabled])')?.focus()
      }
      window.addEventListener('keydown', handleToolbarShortcut)
      return () => window.removeEventListener('keydown', handleToolbarShortcut)
    }, [editor])

    const handleToolbarKeyDown = useCallback((event: React.KeyboardEvent<HTMLFieldSetElement>) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      if ((event.target as HTMLElement).closest('input, select, textarea, [contenteditable="true"]')) return
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled])',
      )).filter((control) => control.offsetParent !== null)
      if (controls.length === 0) return

      event.preventDefault()
      const currentIndex = controls.indexOf(document.activeElement as HTMLElement)
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? controls.length - 1
          : event.key === 'ArrowRight'
            ? (currentIndex + 1 + controls.length) % controls.length
            : (currentIndex - 1 + controls.length) % controls.length
      controls[nextIndex]?.focus()
    }, [])

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
      editor.chain().focus().setTextAlign(align).run()
    }, [editor, isAiTaskLocked])

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
      buttonRef: textColorAnchor === 'bubble' ? bubbleTextColorButtonRef : textColorButtonRef,
      menuRef: textColorMenuRef,
      onSetIsOpen: setShowTextColorMenu,
      onSetPosition: setTextColorMenuPosition,
    })

    useColorPickerMenu({
      isOpen: showBackgroundColorMenu,
      buttonRef: backgroundColorAnchor === 'bubble' ? bubbleBackgroundColorButtonRef : backgroundColorButtonRef,
      menuRef: backgroundColorMenuRef,
      onSetIsOpen: setShowBackgroundColorMenu,
      onSetPosition: setBackgroundColorMenuPosition,
    })

    const toggleTextColorMenu = useCallback((anchor: 'toolbar' | 'bubble') => {
      if (!showTextColorMenu) {
        setTextColorAnchor(anchor)
        setCustomTextColor(resolvedEditorUiState.color || DEFAULT_TEXT_COLOR)
        setTextColorTab(
          MORE_TEXT_COLOR_OPTIONS.includes(
            (resolvedEditorUiState.color || '').toLowerCase() as (typeof MORE_TEXT_COLOR_OPTIONS)[number]
          ) ? 'more' : 'basic'
        )
      }
      setShowBackgroundColorMenu(false)
      setShowTextColorMenu((current) => !current)
    }, [resolvedEditorUiState.color, showTextColorMenu])

    const toggleBackgroundColorMenu = useCallback((anchor: 'toolbar' | 'bubble') => {
      if (!showBackgroundColorMenu) {
        setBackgroundColorAnchor(anchor)
        setCustomBackgroundColor(resolvedEditorUiState.backgroundColor || DEFAULT_TEXT_HIGHLIGHT)
        setBackgroundColorTab(
          MORE_BACKGROUND_COLOR_OPTIONS.includes(
            (resolvedEditorUiState.backgroundColor || '').toLowerCase() as (typeof MORE_BACKGROUND_COLOR_OPTIONS)[number]
          ) ? 'more' : 'basic'
        )
      }
      setShowTextColorMenu(false)
      setShowBackgroundColorMenu((current) => !current)
    }, [resolvedEditorUiState.backgroundColor, showBackgroundColorMenu])

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
    const copyCurrentContentToWechat = useCallback(async () => {
      if (!editor || !runtime.copyToWechat || isAiTaskLocked) return

      try {
        await runtime.copyToWechat({
          html: editor.getHTML(),
          title: aiOptions?.title,
          documentId,
          documentKind,
          token: aiOptions?.token || undefined,
        })
        setCopyStatus('success')
      } catch (error) {
        console.error('Failed to copy editor content for WeChat:', error)
        setCopyStatus('error')
      } finally {
        setOpenToolbarMenu(null)
        if (copyStatusTimerRef.current !== null) {
          window.clearTimeout(copyStatusTimerRef.current)
        }
        copyStatusTimerRef.current = window.setTimeout(() => setCopyStatus(null), 2200)
      }
    }, [aiOptions?.title, aiOptions?.token, documentId, documentKind, editor, isAiTaskLocked, runtime])

    // The registry only stores callbacks for later user events; it never executes them during render.
    const editorCommands = createEditorCommandRegistry([
      { id: 'bold', group: 'inline', label: t('editor.bold'), keywords: ['bold', 'strong'], icon: Bold, shortcut: 'Mod+B', surfaces: ['main', 'bubble'] },
      { id: 'italic', group: 'inline', label: t('editor.italic'), keywords: ['italic', 'emphasis'], icon: Italic, shortcut: 'Mod+I', surfaces: ['main', 'bubble'] },
      { id: 'underline', group: 'inline', label: t('editor.underline'), keywords: ['underline'], icon: UnderlineIcon, shortcut: 'Mod+U', surfaces: ['main', 'bubble'] },
      { id: 'strike', group: 'inline', label: t('editor.strike'), keywords: ['strike', 'strikethrough'], icon: Strikethrough, surfaces: ['main', 'bubble'] },
      { id: 'inlineCode', group: 'inline', label: t('editor.inline_code'), keywords: ['code', 'inline code'], icon: Code, surfaces: ['main', 'bubble'] },
      { id: 'link', group: 'inline', label: t('editor.link'), keywords: ['link', 'url'], icon: LinkIcon, shortcut: 'Mod+K', surfaces: ['bubble'] },
      { id: 'heading1', group: 'block', label: t('editor.heading_1'), keywords: ['h1', 'heading'], icon: Pilcrow, surfaces: ['floating', 'slash'] },
      { id: 'heading2', group: 'block', label: t('editor.heading_2'), keywords: ['h2', 'heading'], icon: Pilcrow, surfaces: ['floating', 'slash'] },
      { id: 'bulletList', group: 'block', label: t('editor.bullet_list'), keywords: ['bullet', 'list'], icon: List, surfaces: ['main', 'floating', 'slash'] },
      { id: 'orderedList', group: 'block', label: t('editor.ordered_list'), keywords: ['ordered', 'numbered', 'list'], icon: ListOrdered, surfaces: ['main', 'floating', 'slash'] },
      { id: 'blockquote', group: 'block', label: t('editor.blockquote'), keywords: ['quote', 'blockquote'], icon: Quote, surfaces: ['main', 'floating', 'slash'] },
      { id: 'alignLeft', group: 'format', label: t('editor.align_left'), keywords: ['align left'], icon: AlignLeft, surfaces: ['main'] },
      { id: 'alignCenter', group: 'format', label: t('editor.align_center'), keywords: ['align center'], icon: AlignCenter, surfaces: ['main'] },
      { id: 'alignRight', group: 'format', label: t('editor.align_right'), keywords: ['align right'], icon: AlignRight, surfaces: ['main'] },
      { id: 'textColor', group: 'format', label: t('editor.text_color'), keywords: ['text color'], icon: Palette, surfaces: ['format'] },
      { id: 'backgroundColor', group: 'format', label: t('editor.background_color'), keywords: ['highlight', 'background color'], icon: Highlighter, surfaces: ['format'] },
      { id: 'image', group: 'insert', label: t('editor.image'), keywords: ['image', 'photo'], icon: ImageIcon, surfaces: ['insert', 'slash'] },
      { id: 'table', group: 'insert', label: t('editor.table'), keywords: ['table', 'grid'], icon: TableIcon, surfaces: ['insert', 'slash'] },
      { id: 'clearFormatting', group: 'format', label: t('editor.clear_formatting'), keywords: ['clear formatting'], icon: RemoveFormatting, surfaces: ['main', 'bubble'] },
      { id: 'undo', group: 'history', label: t('editor.undo'), keywords: ['undo'], icon: Undo, shortcut: 'Mod+Z', surfaces: ['main'] },
      { id: 'redo', group: 'history', label: t('editor.redo'), keywords: ['redo'], icon: Redo, shortcut: 'Mod+Shift+Z', surfaces: ['main'] },
    ], {
      bold: { active: resolvedEditorUiState.isBold, disabled: isAiTaskLocked, execute: toggleBold },
      italic: { active: resolvedEditorUiState.isItalic, disabled: isAiTaskLocked, execute: toggleItalic },
      underline: { active: resolvedEditorUiState.isUnderline, disabled: isAiTaskLocked, execute: toggleUnderline },
      strike: { active: resolvedEditorUiState.isStrike, disabled: isAiTaskLocked, execute: toggleStrike },
      inlineCode: { active: resolvedEditorUiState.isCode, disabled: isAiTaskLocked, execute: toggleCode },
      link: { active: resolvedEditorUiState.isLink, disabled: isAiTaskLocked, execute: setLink },
      heading1: { active: resolvedEditorUiState.isHeading1, disabled: isAiTaskLocked, execute: () => setHeadingLevel('1') },
      heading2: { active: resolvedEditorUiState.isHeading2, disabled: isAiTaskLocked, execute: () => setHeadingLevel('2') },
      bulletList: { active: resolvedEditorUiState.isBulletList, disabled: isAiTaskLocked, execute: toggleBulletList },
      orderedList: { active: resolvedEditorUiState.isOrderedList, disabled: isAiTaskLocked, execute: toggleOrderedList },
      blockquote: { active: resolvedEditorUiState.isBlockquote, disabled: isAiTaskLocked, execute: toggleBlockquote },
      alignLeft: { active: resolvedEditorUiState.isAlignLeft, disabled: isAiTaskLocked, execute: () => setTextAlign('left') },
      alignCenter: { active: resolvedEditorUiState.isAlignCenter, disabled: isAiTaskLocked, execute: () => setTextAlign('center') },
      alignRight: { active: resolvedEditorUiState.isAlignRight, disabled: isAiTaskLocked, execute: () => setTextAlign('right') },
      textColor: { active: Boolean(resolvedEditorUiState.color), disabled: isAiTaskLocked, execute: () => toggleTextColorMenu('toolbar') },
      backgroundColor: { active: Boolean(resolvedEditorUiState.backgroundColor), disabled: isAiTaskLocked, execute: () => toggleBackgroundColorMenu('toolbar') },
      image: { disabled: isAiTaskLocked, execute: addImage },
      table: { disabled: isAiTaskLocked, execute: addTable },
      clearFormatting: { disabled: isAiTaskLocked, execute: clearFormatting },
      undo: { disabled: isAiTaskLocked || !editor?.can().undo(), execute: undo },
      redo: { disabled: isAiTaskLocked || !editor?.can().redo(), execute: redo },
    })
    const mainCommands = getCommandsForSurface(editorCommands, 'main')
    const mainInlineCommands = mainCommands.filter((command) => (
      command.id === 'bold'
      || command.id === 'italic'
      || command.id === 'underline'
      || command.id === 'strike'
      || command.id === 'inlineCode'
    ))
    const mainListCommands = mainCommands.filter((command) => (
      command.id === 'bulletList'
      || command.id === 'orderedList'
      || command.id === 'blockquote'
    ))
    const mainLayoutCommands = mainCommands.filter((command) => (
      command.id === 'alignLeft'
      || command.id === 'alignCenter'
      || command.id === 'alignRight'
      || command.id === 'clearFormatting'
    ))
    const bubbleCommands = getCommandsForSurface(editorCommands, 'bubble')
    const floatingCommands = getCommandsForSurface(editorCommands, 'floating')
    const insertCommands = getCommandsForSurface(editorCommands, 'insert')
    const formatCommands = getCommandsForSurface(editorCommands, 'format')

    const bubbleMenuOptions = useMemo(() => ({ placement: 'top' as const }), [])
    const floatingMenuOptions = useMemo(() => ({ placement: 'right-start' as const }), [])
    const dragHandlePositionConfig = useMemo<DragHandlePositionConfig>(() => ({
      placement: 'left-start',
      middleware: [{
        name: 'fixed-block-handle-x',
        fn: ({ x, elements }) => {
          if (!editor || editor.isDestroyed) {
            return {}
          }

          const editorDom = editor.view.dom
          const editorRect = editorDom.getBoundingClientRect()
          const referenceRect = elements.reference.getBoundingClientRect()
          const contentLeft = editorRect.left + (Number.parseFloat(window.getComputedStyle(editorDom).paddingLeft) || 0)

          return { x: x - (referenceRect.left - contentLeft) }
        },
      }],
    }), [editor])
    const handleBlockDragEnd = useCallback(() => {
      if (!editor) {
        return
      }

      const currentEditor = editor
      requestAnimationFrame(() => {
        if (currentEditor.isDestroyed) {
          return
        }

        const { selection, doc } = currentEditor.state
        if (selection instanceof NodeSelection) {
          const cursorPosition = Math.min(selection.from + 1, doc.content.size)
          currentEditor.view.dispatch(
            currentEditor.state.tr.setSelection(TextSelection.near(doc.resolve(cursorPosition))),
          )
        }

        currentEditor.view.focus()
      })
    }, [editor])

    const shouldShowBubbleMenu = useCallback<BubbleMenuShouldShow>(({ editor: currentEditor, from, to }) => (
      !isAiTaskLocked
      && currentEditor.isEditable
      && from !== to
      && !currentEditor.isActive('image')
      && !currentEditor.isActive('mediaEmbed')
      && !currentEditor.isActive('codeBlock')
    ), [isAiTaskLocked])

    const shouldShowFloatingMenu = useCallback<FloatingMenuShouldShow>(({ editor: currentEditor, state }) => {
      if (isAiTaskLocked || !currentEditor.isEditable || currentEditor.isActive('table')) return false
      // 任意层级的空段落（含列表项、引用内）输入 '/' 均可唤出，仅排除表格等容器
      const { $from } = state.selection
      return state.selection.empty
        && $from.depth === 1
        && $from.parent.type.name === 'paragraph'
        && $from.parent.textContent.startsWith('/')
    }, [isAiTaskLocked])

    if (!editor) {
      return (
        <div className={`h-full flex items-center justify-center bg-muted/30 ${className || ''}`}>
          <div className="animate-pulse w-full h-full min-h-[300px] bg-muted/50" />
        </div>
      )
    }

    const editorCanvas = (
      <div className="h-full overflow-y-auto bg-[linear-gradient(to_bottom,rgba(127,127,127,0.03),transparent_96px)]">
        <div className="relative h-full">
          {!isAiTaskLocked ? (
            <DragHandle
              editor={editor}
              computePositionConfig={dragHandlePositionConfig}
              onElementDragEnd={handleBlockDragEnd}
              nested
            >
              <div
                className="relative z-20 flex h-7 w-6 cursor-grab items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground/70 shadow-none transition-[border-color,background-color,box-shadow,color,opacity] hover:border-border hover:bg-background hover:text-foreground hover:shadow-sm active:cursor-grabbing"
                title={t('editor.block_drag_handle')}
              >
                <GripVertical className="h-4 w-4" />
              </div>
            </DragHandle>
          ) : null}

          <BubbleMenu
            editor={editor}
            options={bubbleMenuOptions}
            shouldShow={shouldShowBubbleMenu}
          >
            <div
              role="toolbar"
              aria-label={t('editor.selection_toolbar')}
              className="z-30 flex max-w-[calc(100vw-1rem)] items-center gap-0.5 overflow-x-auto rounded-md border border-border/80 bg-background/95 p-1 text-foreground shadow-[0_12px_28px_rgba(15,23,42,0.14)] backdrop-blur-md"
            >
              {bubbleCommands.map((command, index) => {
                const Icon = command.icon
                return (
                  <React.Fragment key={command.id}>
                    {index === bubbleCommands.length - 1 ? <div className="mx-0.5 h-4 w-px bg-border/80" aria-hidden="true" /> : null}
                    <FloatingToolbarButton
                      onClick={command.execute}
                      isActive={command.active}
                      disabled={command.disabled}
                      title={command.label}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </FloatingToolbarButton>
                  </React.Fragment>
                )
              })}
              <div className="mx-0.5 h-4 w-px bg-border/80" aria-hidden="true" />
              <FloatingToolbarButton
                buttonRef={bubbleTextColorButtonRef}
                onClick={() => toggleTextColorMenu('bubble')}
                isActive={Boolean(resolvedEditorUiState.color) || showTextColorMenu}
                disabled={isAiTaskLocked}
                title={t('editor.text_color')}
                ariaHasPopup="dialog"
                ariaExpanded={showTextColorMenu}
              >
                <span className="relative flex h-5 w-5 items-center justify-center pb-1" aria-hidden="true">
                  <Palette className="h-3.5 w-3.5" />
                  <span
                    className="absolute inset-x-0 bottom-0 h-1 rounded-[1px] border border-foreground/15"
                    style={{ backgroundColor: resolvedEditorUiState.color || DEFAULT_TEXT_COLOR }}
                  />
                </span>
              </FloatingToolbarButton>
              <FloatingToolbarButton
                buttonRef={bubbleBackgroundColorButtonRef}
                onClick={() => toggleBackgroundColorMenu('bubble')}
                isActive={Boolean(resolvedEditorUiState.backgroundColor) || showBackgroundColorMenu}
                disabled={isAiTaskLocked}
                title={t('editor.background_color')}
                ariaHasPopup="dialog"
                ariaExpanded={showBackgroundColorMenu}
              >
                <span className="relative flex h-5 w-5 items-center justify-center pb-1" aria-hidden="true">
                  <Highlighter className="h-3.5 w-3.5" />
                  <span
                    className="absolute inset-x-0 bottom-0 h-1 rounded-[1px] border border-foreground/15"
                    style={{ backgroundColor: resolvedEditorUiState.backgroundColor || DEFAULT_TEXT_HIGHLIGHT }}
                  />
                </span>
              </FloatingToolbarButton>
              {showLinkInput ? (
                <div className="ml-1 flex items-center gap-1 border-l border-border/80 pl-1">
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(event) => setLinkUrl(event.target.value)}
                    placeholder={t('editor.link_placeholder')}
                    className="h-8 w-44 rounded-sm border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') setLink()
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        event.stopPropagation()
                        setShowLinkInput(false)
                        focusEditor()
                      }
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={setLink}
                    className="h-8 rounded-sm bg-primary px-2 text-xs text-primary-foreground hover:bg-primary/90"
                  >
                    {t('editor.confirm')}
                  </button>
                </div>
              ) : null}
            </div>
          </BubbleMenu>

          <BubbleMenu
            editor={editor}
            options={bubbleMenuOptions}
            shouldShow={shouldShowImageBubbleMenu}
          >
            <div
              role="toolbar"
              aria-label={t('editor.image_toolbar')}
              className="z-30 flex max-w-[calc(100vw-1rem)] items-center gap-0.5 overflow-x-auto rounded-md border border-border/80 bg-background/95 p-1 text-foreground shadow-[0_12px_28px_rgba(15,23,42,0.14)] backdrop-blur-md"
            >
              <FloatingToolbarButton
                onClick={resetImageSize}
                disabled={isAiTaskLocked}
                title={t('editor.image_reset_width')}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </FloatingToolbarButton>
              <FloatingToolbarButton
                onClick={fitImageToContentWidth}
                disabled={isAiTaskLocked}
                title={t('editor.image_fit_width')}
              >
                <MoveHorizontal className="h-3.5 w-3.5" />
              </FloatingToolbarButton>
              <div className="mx-0.5 h-4 w-px bg-border/80" aria-hidden="true" />
              <FloatingToolbarButton
                onClick={deleteSelectedImage}
                disabled={isAiTaskLocked}
                title={t('editor.image_delete')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </FloatingToolbarButton>
            </div>
          </BubbleMenu>

          <FloatingMenu
            editor={editor}
            options={floatingMenuOptions}
            shouldShow={shouldShowFloatingMenu}
          >
            <div
              role="toolbar"
              aria-label={t('editor.block_toolbar')}
              className="z-30 flex max-w-[calc(100vw-1rem)] items-center gap-0.5 overflow-x-auto rounded-md border border-border/80 bg-background/95 p-1 text-foreground shadow-[0_12px_28px_rgba(15,23,42,0.14)] backdrop-blur-md"
            >
              <span className="flex h-7 w-7 items-center justify-center text-primary" aria-hidden="true">
                <Plus className="h-3.5 w-3.5" />
              </span>
              <div className="mx-0.5 h-4 w-px bg-border/80" aria-hidden="true" />
              {floatingCommands.map((command) => {
                const Icon = command.icon
                return (
                  <FloatingToolbarButton
                    key={command.id}
                    onClick={() => runFloatingCommand(command)}
                    isActive={command.active}
                    disabled={command.disabled}
                    title={command.label}
                  >
                    {command.id === 'heading1' || command.id === 'heading2' ? (
                      <span className="font-mono text-[10px] font-bold">{command.id === 'heading1' ? 'H1' : 'H2'}</span>
                    ) : (
                      <Icon className="h-3.5 w-3.5" />
                    )}
                  </FloatingToolbarButton>
                )
              })}
            </div>
          </FloatingMenu>

          <EditorContent editor={editor} className="h-full custom-scrollbar" />
        </div>
      </div>
    )

    return (
      <div
        className={`tiptap-editor relative z-0 isolate h-full flex flex-col border-x border-border/60 bg-background ${resolvedTheme === 'dark' ? 'tiptap-dark' : 'tiptap-light'} ${className || ''}`}
        aria-busy={isAiTaskLocked}
        aria-readonly={isAiTaskLocked}
        data-document-id={documentId}
        data-document-kind={documentKind}
      >
        {/* Toolbar */}
        <fieldset
          ref={toolbarRef}
          disabled={isAiTaskLocked}
          aria-disabled={isAiTaskLocked}
          aria-label={t('editor.main_toolbar')}
          onKeyDown={handleToolbarKeyDown}
          className="relative z-20 flex min-w-0 items-center justify-between gap-1 overflow-visible border-0 border-b border-border/70 bg-background/96 px-2 py-1 shadow-[0_1px_0_rgba(15,23,42,0.03)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {/* 命令条：空间不足时水平滚动；插入/格式/撤销重做固定常驻右侧 */}
          <div className="tiptap-toolbar-scroll flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto overflow-y-clip overscroll-x-contain py-1 -my-1">
            <ToolbarSelect
              value={resolvedEditorUiState.headingLevel}
              onChange={setHeadingLevel}
              onMouseDown={preserveSelectionOnSelectMouseDown}
              onBlur={restoreSelectionOnSelectBlur}
              title={t('editor.heading_level')}
              options={headingOptions}
              className="max-w-[4.5rem] min-[360px]:max-w-[5.5rem] sm:max-w-[7.5rem]"
            />
            <ToolbarSelect
              value={resolvedEditorUiState.fontFamily}
              onChange={setFontFamily}
              onMouseDown={preserveSelectionOnSelectMouseDown}
              onBlur={restoreSelectionOnSelectBlur}
              title={t('editor.font_family')}
              options={fontFamilyOptions}
              className="max-w-[7rem]"
            />
            <ToolbarSelect
              value={resolvedEditorUiState.fontSize}
              onChange={setFontSize}
              onMouseDown={preserveSelectionOnSelectMouseDown}
              onBlur={restoreSelectionOnSelectBlur}
              title={t('editor.font_size')}
              options={fontSizeOptions}
              className="max-w-[5.5rem]"
            />
            <ToolbarDivider />
            {mainInlineCommands.map((command) => {
              const Icon = command.icon
              return (
                <ToolbarButton
                  key={command.id}
                  onClick={command.execute}
                  isActive={command.active}
                  disabled={command.disabled}
                  title={command.label}
                >
                  <Icon className="h-4 w-4" />
                </ToolbarButton>
              )
            })}
            <ToolbarDivider />
            {mainListCommands.map((command) => {
              const Icon = command.icon
              return (
                <ToolbarButton
                  key={command.id}
                  onClick={command.execute}
                  isActive={command.active}
                  disabled={command.disabled}
                  title={command.label}
                >
                  <Icon className="h-4 w-4" />
                </ToolbarButton>
              )
            })}
            <ToolbarDivider />
            {mainLayoutCommands.map((command) => {
              const Icon = command.icon
              return (
                <ToolbarButton
                  key={command.id}
                  onClick={command.execute}
                  isActive={command.active}
                  disabled={command.disabled}
                  title={command.label}
                >
                  <Icon className="h-4 w-4" />
                </ToolbarButton>
              )
            })}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <ToolbarPopover
              open={openToolbarMenu === 'insert'}
              onOpenChange={(open) => {
                setOpenToolbarMenu(open ? 'insert' : null)
                if (open) {
                  setShowLinkInput(false)
                  setShowTextColorMenu(false)
                  setShowBackgroundColorMenu(false)
                }
              }}
              label={t('editor.insert_menu')}
              icon={Plus}
              disabled={isAiTaskLocked}
              panelClassName="right-0 left-auto max-h-[calc(100vh-5rem)] w-64 overflow-y-auto"
            >
              {insertCommands.map((command) => (
                <CommandMenuItem
                  key={command.id}
                  command={command}
                  onSelect={command.id === 'image' ? undefined : () => setOpenToolbarMenu(null)}
                />
              ))}
              {showImageInput ? (
                <div className="mt-1 border-t border-border/70 p-2">
                  <label className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">
                    {t('editor.image_placeholder')}
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={(event) => setImageUrl(event.target.value)}
                      placeholder="https://"
                      className="h-9 min-w-0 flex-1 rounded-sm border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          addImage()
                          setOpenToolbarMenu(null)
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          event.stopPropagation()
                          setShowImageInput(false)
                        }
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        addImage()
                        setOpenToolbarMenu(null)
                      }}
                      className="h-9 rounded-sm bg-primary px-2 text-xs text-primary-foreground hover:bg-primary/90"
                    >
                      {t('editor.confirm')}
                    </button>
                  </div>
                </div>
              ) : null}
            </ToolbarPopover>

            <ToolbarPopover
              open={openToolbarMenu === 'format'}
              onOpenChange={(open) => {
                setOpenToolbarMenu(open ? 'format' : null)
                if (open) {
                  setShowImageInput(false)
                  setShowLinkInput(false)
                }
              }}
              label={t('editor.format_menu')}
              icon={MoreHorizontal}
              disabled={isAiTaskLocked}
              panelClassName="right-0 left-auto max-h-[calc(100vh-5rem)] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto"
            >
              {/* 仅保留工具栏没有的命令：文字颜色、背景颜色 */}
              {formatCommands.filter((command) => command.id !== 'textColor' && command.id !== 'backgroundColor').map((command) => (
                <CommandMenuItem key={command.id} command={command} onSelect={() => setOpenToolbarMenu(null)} />
              ))}
              <div className="my-1 h-px bg-border/70" />
              <button
                ref={textColorButtonRef}
                type="button"
                role="menuitem"
                onMouseDown={preserveSelectionOnToolbarMouseDown}
                onClick={() => toggleTextColorMenu('toolbar')}
                className="flex h-9 w-full items-center gap-2 rounded-sm px-2 text-left text-xs transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <Palette className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{t('editor.text_color')}</span>
                <span className="h-3 w-6 rounded-sm border border-border" style={{ backgroundColor: resolvedEditorUiState.color || DEFAULT_TEXT_COLOR }} />
              </button>
              <button
                ref={backgroundColorButtonRef}
                type="button"
                role="menuitem"
                onMouseDown={preserveSelectionOnToolbarMouseDown}
                onClick={() => toggleBackgroundColorMenu('toolbar')}
                className="flex h-9 w-full items-center gap-2 rounded-sm px-2 text-left text-xs transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <Highlighter className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{t('editor.background_color')}</span>
                <span className="h-3 w-6 rounded-sm border border-border" style={{ backgroundColor: resolvedEditorUiState.backgroundColor || DEFAULT_TEXT_HIGHLIGHT }} />
              </button>
            </ToolbarPopover>

            <ToolbarDivider className="hidden sm:block" />
            {mainCommands.filter((command) => command.id === 'undo' || command.id === 'redo').map((command) => {
              const Icon = command.icon
              return (
                <ToolbarButton
                  key={command.id}
                  onClick={command.execute}
                  disabled={command.disabled}
                  title={command.label}
                >
                  <Icon className="h-4 w-4" />
                </ToolbarButton>
              )
            })}
            {runtime.copyToWechat ? (
              <ToolbarPopover
                open={openToolbarMenu === 'copy'}
                onOpenChange={(open) => setOpenToolbarMenu(open ? 'copy' : null)}
                label={t('editor.copy_for_platform')}
                icon={Copy}
                disabled={isAiTaskLocked}
                panelClassName="right-0 left-auto w-52"
              >
                <button
                  type="button"
                  role="menuitem"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void copyCurrentContentToWechat()}
                  className="flex h-10 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#07c160] text-white">
                    <WechatIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{t('editor.copy_wechat')}</span>
                </button>
              </ToolbarPopover>
            ) : null}
            {toolbarAfterRedoAction ? (
              <ToolbarButton
                onClick={toolbarAfterRedoAction.onClick}
                disabled={toolbarAfterRedoAction.disabled || isAiTaskLocked}
                title={toolbarAfterRedoAction.title}
              >
                {toolbarAfterRedoAction.icon}
              </ToolbarButton>
            ) : null}
          </div>

          {copyStatus ? (
            <div
              role={copyStatus === 'error' ? 'alert' : 'status'}
              className={`pointer-events-none absolute right-2 top-[calc(100%+0.5rem)] z-40 rounded-sm border bg-background px-3 py-2 text-xs shadow-lg ${copyStatus === 'error' ? 'border-destructive/30 text-destructive' : 'border-border text-foreground'}`}
            >
              {t(copyStatus === 'error' ? 'editor.copy_failed' : 'editor.copy_success')}
            </div>
          ) : null}
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
              {editorCanvas}
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
                taskHistory={directEditHost}
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
          <div className="min-h-0 flex-1">
            {editorCanvas}
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

      </div>
    )
  }
)

NarrativeTipTapEditor.displayName = 'NarrativeTipTapEditor'

export default NarrativeTipTapEditor
