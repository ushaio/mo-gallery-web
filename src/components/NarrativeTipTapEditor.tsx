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
} from 'lucide-react'
import TipTapAiAssistant from '@/components/TipTapAiAssistant'
import { useLanguage } from '@/contexts/LanguageContext'
import { useTheme } from '@/contexts/ThemeContext'

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
import './tiptap-editor.css'

export interface NarrativeTipTapEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  onPasteFiles?: (files: File[]) => void | Promise<void>
  className?: string
  aiOptions?: {
    enabled: boolean
    token?: string | null
    scopeId?: string
    title?: string
  }
}

export type { NarrativeTipTapEditorHandle }

export const NarrativeTipTapEditor = forwardRef<NarrativeTipTapEditorHandle, NarrativeTipTapEditorProps>(
  ({ value, onChange, placeholder, onPasteFiles, className, aiOptions }, ref) => {
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

    const { t } = useLanguage()
    const { resolvedTheme } = useTheme()

    const { editor, currentValueRef } = useNarrativeEditor({
      value,
      onChange,
      placeholder,
      onPasteFiles,
      t,
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

    const insertInlineImage = useCallback((attrs: { src: string; alt?: string; width?: number }) => {
      if (!editor) return

      editor
        .chain()
        .focus()
        .insertContent({
          type: 'image',
          attrs: {
            src: attrs.src,
            alt: attrs.alt || '',
            ...(attrs.width ? { width: attrs.width } : {}),
          },
        })
        .run()

      focusEditor()
    }, [editor, focusEditor])

    const applyAiResult = useCallback((
      mode: 'replace' | 'insert' | 'append',
      preview: string,
      selectionRange: { from: number; to: number } | null,
    ) => {
      if (!editor || !preview.trim()) return

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
    }, [editor, focusEditor])

    const imperativeHandle = useEditorImperativeHandle({
      editor,
      currentValueRef,
      onChange,
      focusEditor,
      insertInlineImage,
    })

    useImperativeHandle(ref, () => imperativeHandle, [imperativeHandle])

    const toggleBold = () => editor?.chain().focus().toggleBold().run()
    const toggleItalic = () => editor?.chain().focus().toggleItalic().run()
    const toggleUnderline = () => editor?.chain().focus().toggleUnderline().run()
    const toggleStrike = () => editor?.chain().focus().toggleStrike().run()
    const toggleBulletList = () => editor?.chain().focus().toggleBulletList().run()
    const toggleOrderedList = () => editor?.chain().focus().toggleOrderedList().run()
    const toggleBlockquote = () => editor?.chain().focus().toggleBlockquote().run()
    const toggleCode = () => editor?.chain().focus().toggleCode().run()

    const setLink = useCallback(() => {
      if (!editor) return
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
        setShowLinkInput(true)
      }
    }, [editor, linkUrl, showLinkInput])

    const addImage = useCallback(() => {
      if (!editor) return
      if (showImageInput) {
        if (imageUrl) {
          insertInlineImage({ src: imageUrl })
        }
        setShowImageInput(false)
        setImageUrl('')
      } else {
        setShowImageInput(true)
      }
    }, [editor, imageUrl, insertInlineImage, showImageInput])

    const addTable = useCallback(() => {
      if (!editor) return
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    }, [editor])

    const setTextAlign = useCallback((align: 'left' | 'center' | 'right') => {
      if (!editor) return
      const chain = editor.chain().focus()
      if ((align === 'center' || align === 'right') && resolvedEditorUiState.hasDropCap) {
        chain.setParagraphDropCap(false)
      }
      chain.setTextAlign(align).run()
    }, [editor, resolvedEditorUiState.hasDropCap])

    const toggleDropCap = useCallback(() => {
      if (!editor) return
      const chain = editor.chain().focus()
      if (resolvedEditorUiState.hasDropCap) {
        chain.setParagraphDropCap(false).run()
        return
      }
      if (resolvedEditorUiState.isAlignCenter || resolvedEditorUiState.isAlignRight) {
        chain.setTextAlign('left')
      }
      chain.setParagraphDropCap(true).run()
    }, [editor, resolvedEditorUiState.hasDropCap, resolvedEditorUiState.isAlignCenter, resolvedEditorUiState.isAlignRight])

    const setHeadingLevel = useCallback((level: string) => {
      if (!editor) return
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
    }, [editor])

    const setFontSize = useCallback((fontSize: string) => {
      if (!editor) return
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
    }, [editor])

    const setFontFamily = useCallback((fontFamily: string) => {
      if (!editor) return
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
    }, [editor])

    const setTextColor = useCallback((color: string) => {
      if (!editor) return
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
    }, [editor])

    const setBackgroundColor = useCallback((backgroundColor: string) => {
      if (!editor) return
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
    }, [editor])

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
      if (!editor) return
      editor
        .chain()
        .focus()
        .clearNodes()
        .unsetAllMarks()
        .run()
    }, [editor])

    const undo = () => editor?.chain().focus().undo().run()
    const redo = () => editor?.chain().focus().redo().run()

    if (!editor) {
      return (
        <div className={`h-full flex items-center justify-center bg-muted/30 ${className || ''}`}>
          <div className="animate-pulse w-full h-full min-h-[300px] bg-muted/50" />
        </div>
      )
    }

    return (
      <div className={`tiptap-editor h-full flex flex-col border-x border-border/60 bg-background ${resolvedTheme === 'dark' ? 'tiptap-dark' : 'tiptap-light'} ${className || ''}`}>
        {/* Toolbar */}
        <div className="scrollbar-hide flex flex-nowrap items-center gap-0.5 overflow-x-auto border-b border-border/70 bg-gradient-to-r from-muted/20 via-background to-muted/5 px-2 py-1.5 whitespace-nowrap">
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

          <ToolbarButton onClick={addTable} title={t('editor.table')}>
            <TableIcon className="w-4 h-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton onClick={clearFormatting} title={t('editor.clear_formatting')}>
            <RemoveFormatting className="w-4 h-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton onClick={undo} disabled={!editor.can().undo()} title={t('editor.undo')}>
            <Undo className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={redo} disabled={!editor.can().redo()} title={t('editor.redo')}>
            <Redo className="w-4 h-4" />
          </ToolbarButton>
        </div>

        {/* Color Picker Menus */}
        <BackgroundColorPicker
          isOpen={showBackgroundColorMenu}
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
          isOpen={showTextColorMenu}
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

        {/* Editor Content */}
        <div className="flex-1 overflow-y-auto bg-[linear-gradient(to_bottom,rgba(127,127,127,0.03),transparent_96px)]">
          <div className="relative h-full">
            <EditorContent editor={editor} className="h-full custom-scrollbar" />
          </div>
        </div>

        {/* AI Assistant */}
        <TipTapAiAssistant
          options={aiOptions}
          context={{
            selectionRange: aiSelectionRange,
            hasSelection: aiHasSelection,
            selectedText: aiSelectedText,
            currentParagraph: aiCurrentParagraph,
            contextBefore: aiContextBefore,
            contextAfter: aiContextAfter,
          }}
          onSyncContext={syncAiSelectionState}
          onApplyResult={applyAiResult}
        />
      </div>
    )
  }
)

NarrativeTipTapEditor.displayName = 'NarrativeTipTapEditor'

export default NarrativeTipTapEditor
