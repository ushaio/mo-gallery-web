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
import type { Editor } from '@tiptap/core'
import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { ResizableImage } from '@/components/tiptap-extensions/ResizableImage'
import { PastedStyleMark } from '@/components/tiptap-extensions/PastedStyleMark'
import { PastedBlockStyle } from '@/components/tiptap-extensions/PastedBlockStyle'
import { DropCapParagraph } from '@/components/tiptap-extensions/DropCapParagraph'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
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
} from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'
import { useTheme } from '@/contexts/ThemeContext'
import './tiptap-editor.css'

export interface NarrativeTipTapEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  onPasteFiles?: (files: File[]) => void | Promise<void>
  className?: string
}

export interface NarrativeTipTapEditorHandle {
  getValue: () => string
  setValue: (html: string) => void
  insertValue: (html: string) => void
  insertMarkdown: (markdown: string) => void
  replaceText: (searchValue: string, nextValue: string) => boolean
  scaleLastImage: (mode: 'sm' | 'md' | 'lg') => boolean
  focus: () => void
}

const IMAGE_WIDTH_PRESETS: Record<'sm' | 'md' | 'lg', number> = {
  sm: 320,
  md: 480,
  lg: 720,
}

const TAB_INDENT = '\u3000\u3000'
const DEFAULT_FONT_SIZE_LABEL = '18px'
const FONT_SIZE_VALUES = ['12px', '14px', '16px', '20px', '24px', '28px'] as const
const FONT_FAMILY_SANS_VALUE = 'var(--font-sans), ui-sans-serif, system-ui, sans-serif'
const FONT_FAMILY_SONG_VALUE = '"STSong", "Songti SC", "Noto Serif SC", serif'
const FONT_FAMILY_HEI_VALUE = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif'
const FONT_FAMILY_MONO_VALUE = 'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace'
const FONT_FAMILY_OPTIMA_VALUE = '"Optima", "Optima-Regular", "PingFang TC", "PingFang SC", "Helvetica Neue", sans-serif'
const FONT_FAMILY_VALUES = [
  FONT_FAMILY_SANS_VALUE,
  FONT_FAMILY_SONG_VALUE,
  FONT_FAMILY_HEI_VALUE,
  FONT_FAMILY_MONO_VALUE,
  FONT_FAMILY_OPTIMA_VALUE,
] as const
const DEFAULT_TEXT_HIGHLIGHT = '#fff3a3'
const BACKGROUND_COLOR_RECENT_LIMIT = 8
const BASIC_BACKGROUND_COLOR_OPTIONS = [
  '#ffffff', '#f4cccc', '#f9cb9c', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#ead1dc',
  '#f3f3f3', '#f4b6b6', '#f6b26b', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#d5a6bd',
  '#d9d9d9', '#ea9999', '#ffb366', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#c27ba0',
  '#b7b7b7', '#e06666', '#ff8c42', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#a64d79',
] as const
const MORE_BACKGROUND_COLOR_OPTIONS = [
  '#999999', '#cc0000', '#e69138', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#741b47',
  '#666666', '#990000', '#b45f06', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#4c1130',
  '#000000', '#ff0000', '#ff6d01', '#f6b400', '#00d000', '#00c6e8', '#4a86e8', '#b03af2',
  '#ff2d55', '#ff5f5f', '#ff9f0a', '#ffd60a', '#32d74b', '#64d2ff', '#5e5ce6', '#bf5af2',
] as const
const PRESET_BACKGROUND_COLOR_VALUES = [
  ...BASIC_BACKGROUND_COLOR_OPTIONS,
  ...MORE_BACKGROUND_COLOR_OPTIONS,
] as const
const DEFAULT_TEXT_COLOR = '#1f1f1f'
const TEXT_COLOR_RECENT_LIMIT = 8
const BASIC_TEXT_COLOR_OPTIONS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#d9d9d9', '#efefef', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#9900ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#ead1dc',
] as const
const MORE_TEXT_COLOR_OPTIONS = [
  '#7f0000', '#cc4125', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#674ea7',
  '#a61c00', '#cc0000', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb',
  '#8e7cc3', '#c27ba0', '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9',
  '#a4c2f4', '#b4a7d6', '#d5a6bd', '#fff2f0', '#f4f4f4', '#1c1c1c', '#0b5394', '#38761d',
] as const
const PRESET_TEXT_COLOR_VALUES = [
  ...BASIC_TEXT_COLOR_OPTIONS,
  ...MORE_TEXT_COLOR_OPTIONS,
] as const

function normalizeInlineStyleValue(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, ' ') || ''
}

function resolveActiveInlineStyleValue(
  currentEditor: Editor,
  attribute: 'fontSize' | 'fontFamily' | 'backgroundColor' | 'color',
  supportedValues: readonly string[],
  preserveRawValue = false
) {
  const activeValue = supportedValues.find((value) =>
    currentEditor.isActive('pastedStyle', { [attribute]: value })
  )
  if (activeValue) {
    return activeValue
  }

  const rawValue = (currentEditor.getAttributes('pastedStyle') as {
    fontSize?: string
    fontFamily?: string
    backgroundColor?: string
    color?: string
  })[attribute]
  const normalizedValue = normalizeInlineStyleValue(rawValue)

  return supportedValues.find((value) => normalizeInlineStyleValue(value) === normalizedValue)
    ?? (preserveRawValue ? normalizedValue : '')
}

function normalizeHexColor(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null

  const withHash = normalized.startsWith('#') ? normalized : `#${normalized}`
  if (/^#[0-9a-f]{3}$/i.test(withHash)) {
    return `#${withHash[1]}${withHash[1]}${withHash[2]}${withHash[2]}${withHash[3]}${withHash[3]}`
  }

  if (/^#[0-9a-f]{6}$/i.test(withHash)) {
    return withHash
  }

  return null
}

function ensureFirstParagraphHasDropCap(currentEditor: Editor) {
  let offset = 0

  for (let index = 0; index < currentEditor.state.doc.childCount; index += 1) {
    const child = currentEditor.state.doc.child(index)

    if (child.type.name === 'paragraph') {
      if (typeof child.attrs.dropCap === 'boolean') {
        return
      }

      const nextAttrs = {
        ...child.attrs,
        dropCap: true,
      }

      const transaction = currentEditor.state.tr.setNodeMarkup(offset, undefined, nextAttrs)
      currentEditor.view.dispatch(transaction)
      return
    }

    offset += child.nodeSize
  }
}

function convertMarkdownToHtml(input: string): string {
  if (!input) return ''

  let result = input.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+=(\d+)x(\d+))?\)/g,
    (_match, alt, url, width) => {
      let widthAttr = ''
      if (width) {
        widthAttr = ` width="${width}"`
      }
      return `<img src="${url}" alt="${alt}"${widthAttr} />`
    }
  )

  result = result.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    '<a href="$2">$1</a>'
  )

  result = result.replace(
    /^(?:>\s?.+(?:\r?\n>\s?.+)*)/gm,
    (match) => {
      const quoteContent = match
        .split(/\r?\n/)
        .map((line) => line.replace(/^>\s?/, '').trim())
        .join('<br>')

      return `<blockquote><p>${quoteContent}</p></blockquote>`
    }
  )

  result = result
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^\s*[-*]\s+/gm, '<li>')
    .replace(/^\s*\d+\.\s+/gm, '<li>')
    .replace(/\n/g, '<br>')

  if (!/<[a-z][\s\S]*>/i.test(result)) {
    result = result.split('<br>').map(p => `<p>${p}</p>`).join('')
  }

  return result
}

function convertMarkdownImageToHtmlAttrs(markdown: string): { src: string; alt?: string; width?: number } | null {
  const trimmed = markdown.trim()
  const match = trimmed.match(/!\[([^\]]*)\]\(([^)]+)\)/)
  if (!match) return null

  const alt = match[1] || ''
  const urlPart = match[2]

  // Extract URL and optional width: "url =480x" or just "url"
  const widthMatch = urlPart.match(/\s*=\s*(\d+)x\s*$/)
  const src = widthMatch ? urlPart.replace(/\s*=\s*\d+x\s*$/, '').trim() : urlPart.trim()
  const width = widthMatch ? parseInt(widthMatch[1], 10) : undefined

  return { src, alt, width }
}

function convertHtmlImageToAttrs(content: string): { src: string; alt?: string; width?: number } | null {
  const trimmed = content.trim()
  const match = trimmed.match(/^<img\s+([^>]*?)\/?>$/i)
  if (!match) return null

  const attrs = match[1]
  const src = attrs.match(/\bsrc=(['"])(.*?)\1/i)?.[2]?.trim()
  if (!src) return null

  const alt = attrs.match(/\balt=(['"])(.*?)\1/i)?.[2] || ''
  const widthValue = attrs.match(/\bwidth=(['"])?(\d+)\1?/i)?.[2]
  const width = widthValue ? Number.parseInt(widthValue, 10) : undefined

  return { src, alt, width }
}

function isMarkdownImageSyntax(content: string): boolean {
  const trimmed = content.trim()
  return /!\[([^\]]*)\]\([^)]+\)/.test(trimmed)
}

function isMarkdownContent(content: string): boolean {
  if (!content) return false
  const markdownPatterns = [
    /^#{1,6}\s+/m,
    /!\[.*\]\(.*\)/,
    /\[.*\]\(.*\)/,
    /\*\*[^*]+\*\*/,
    /\*[^*]+\*/,
    /~~.+~~/,
    /`[^`]+`/,
    /^\s*[-*+]\s+/m,
    /^\s*\d+\.\s+/m,
    /^>\s+/m,
    /^```[\s\S]*?```/m,
  ]
  return markdownPatterns.some(pattern => pattern.test(content))
}

interface ToolbarButtonProps {
  onClick: () => void
  onMouseDown?: (event: React.MouseEvent<HTMLButtonElement>) => void
  isActive?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
  buttonRef?: React.Ref<HTMLButtonElement>
}

function ToolbarButton({ onClick, onMouseDown, isActive, disabled, title, children, buttonRef }: ToolbarButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      onMouseDown={onMouseDown}
      disabled={disabled}
      title={title}
      className={`flex h-7 min-w-7 items-center justify-center border px-1.5 text-[11px] transition-all duration-200 ${isActive
          ? 'border-border bg-background text-accent-foreground'
          : 'border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-accent-foreground'
        } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  )
}

interface ToolbarSelectProps {
  value: string
  onChange: (value: string) => void
  onMouseDown?: (event: React.MouseEvent<HTMLSelectElement>) => void
  title: string
  options: ReadonlyArray<{ label: string; value: string }>
}

function ToolbarSelect({ value, onChange, onMouseDown, title, options }: ToolbarSelectProps) {
  const selectWidth = useMemo(() => {
    const longestLabelLength = options.reduce((max, option) => {
      return Math.max(max, option.label.length)
    }, 0)

    return `${Math.max(longestLabelLength + 4, 7)}ch`
  }, [options])

  return (
    <select
      value={value}
      title={title}
      onMouseDown={onMouseDown}
      onChange={(event) => onChange(event.target.value)}
      style={{ width: selectWidth }}
      className="h-7 appearance-none border border-transparent bg-transparent px-1.5 text-[11px] text-muted-foreground transition-all duration-200 hover:border-border hover:bg-background hover:text-accent-foreground focus:border-primary/30 focus:bg-background focus:text-foreground focus:outline-none"
    >
      {options.map((option) => (
        <option key={`${title}-${option.label}`} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function ToolbarDivider() {
  return <div className="mx-1 h-3.5 w-px bg-border/80" />
}

export const NarrativeTipTapEditor = forwardRef<NarrativeTipTapEditorHandle, NarrativeTipTapEditorProps>(
  ({ value, onChange, placeholder, onPasteFiles, className }, ref) => {
    const currentValueRef = useRef(value)
    const onPasteFilesRef = useRef(onPasteFiles)
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
    const { t } = useLanguage()
    const { resolvedTheme } = useTheme()

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
      {
        label: 'PingFang SC',
        value: '',
      },
      {
        label: t('editor.font_family_sans'),
        value: FONT_FAMILY_SANS_VALUE,
      },
      {
        label: t('editor.font_family_song'),
        value: FONT_FAMILY_SONG_VALUE,
      },
      {
        label: t('editor.font_family_hei'),
        value: FONT_FAMILY_HEI_VALUE,
      },
      {
        label: t('editor.font_family_mono'),
        value: FONT_FAMILY_MONO_VALUE,
      },
      {
        label: t('editor.font_family_optima'),
        value: FONT_FAMILY_OPTIMA_VALUE,
      },
    ], [t])

    useEffect(() => {
      currentValueRef.current = value
    }, [value])

    useEffect(() => {
      onPasteFilesRef.current = onPasteFiles
    }, [onPasteFiles])

    const processedContent = useMemo(() => {
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
          heading: {
            levels: [1, 2, 3, 4, 5, 6],
          },
        }),
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
      content: processedContent || '',
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
          fontFamily: resolveActiveInlineStyleValue(currentEditor, 'fontFamily', FONT_FAMILY_VALUES),
          color: resolveActiveInlineStyleValue(
            currentEditor,
            'color',
            PRESET_TEXT_COLOR_VALUES,
            true
          ),
          backgroundColor: resolveActiveInlineStyleValue(
            currentEditor,
            'backgroundColor',
            PRESET_BACKGROUND_COLOR_VALUES,
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

    const imperativeHandle = useMemo<NarrativeTipTapEditorHandle>(() => ({
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
    }), [editor, focusEditor, insertInlineImage, onChange])

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
    }, [
      editor,
      resolvedEditorUiState.hasDropCap,
      resolvedEditorUiState.isAlignCenter,
      resolvedEditorUiState.isAlignRight,
    ])

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
        pendingSelectionRef.current = null
        return
      }

      chain.unsetFontSize().run()
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
        pendingSelectionRef.current = null
        return
      }

      chain.unsetFontFamily().run()
      pendingSelectionRef.current = null
    }, [editor])

    const setTextColor = useCallback((color: string) => {
      if (!editor) return

      const normalizedColor = color ? normalizeHexColor(color) : ''
      if (color && !normalizedColor) {
        return
      }

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
      if (backgroundColor && !normalizedBackgroundColor) {
        return
      }

      const chain = editor.chain().focus()
      const pendingSelection = pendingSelectionRef.current
      if (pendingSelection) {
        chain.setTextSelection(pendingSelection)
      }

      if (normalizedBackgroundColor) {
        chain.setBackgroundColor(normalizedBackgroundColor).run()
        setCustomBackgroundColor(normalizedBackgroundColor)
        setRecentBackgroundColors((current) => {
          const nextColors = [normalizedBackgroundColor, ...current.filter((color) => color !== normalizedBackgroundColor)]
          return nextColors.slice(0, BACKGROUND_COLOR_RECENT_LIMIT)
        })
      } else {
        chain.unsetBackgroundColor().run()
      }

      pendingSelectionRef.current = null
      setShowBackgroundColorMenu(false)
    }, [editor])

    const updateTextColorMenuPosition = useCallback(() => {
      const buttonElement = textColorButtonRef.current
      if (!buttonElement) return

      const rect = buttonElement.getBoundingClientRect()
      const menuWidth = 360
      const viewportPadding = 12
      const left = Math.max(
        viewportPadding,
        Math.min(rect.left, window.innerWidth - menuWidth - viewportPadding)
      )

      setTextColorMenuPosition({
        top: rect.bottom + 6,
        left,
      })
    }, [])

    const updateBackgroundColorMenuPosition = useCallback(() => {
      const buttonElement = backgroundColorButtonRef.current
      if (!buttonElement) return

      const rect = buttonElement.getBoundingClientRect()
      const menuWidth = 360
      const viewportPadding = 12
      const left = Math.max(
        viewportPadding,
        Math.min(rect.left, window.innerWidth - menuWidth - viewportPadding)
      )

      setBackgroundColorMenuPosition({
        top: rect.bottom + 6,
        left,
      })
    }, [])

    useEffect(() => {
      if (!showBackgroundColorMenu) return

      updateBackgroundColorMenuPosition()

      const handlePointerDown = (event: MouseEvent) => {
        const target = event.target as Node | null
        if (
          backgroundColorMenuRef.current?.contains(target)
          || backgroundColorButtonRef.current?.contains(target)
        ) {
          return
        }

        setShowBackgroundColorMenu(false)
      }

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setShowBackgroundColorMenu(false)
        }
      }

      const handleViewportChange = () => {
        updateBackgroundColorMenuPosition()
      }

      window.addEventListener('mousedown', handlePointerDown)
      window.addEventListener('keydown', handleKeyDown)
      window.addEventListener('resize', handleViewportChange)
      window.addEventListener('scroll', handleViewportChange, true)

      return () => {
        window.removeEventListener('mousedown', handlePointerDown)
        window.removeEventListener('keydown', handleKeyDown)
        window.removeEventListener('resize', handleViewportChange)
        window.removeEventListener('scroll', handleViewportChange, true)
      }
    }, [showBackgroundColorMenu, updateBackgroundColorMenuPosition])

    useEffect(() => {
      if (!showTextColorMenu) return

      updateTextColorMenuPosition()

      const handlePointerDown = (event: MouseEvent) => {
        const target = event.target as Node | null
        if (
          textColorMenuRef.current?.contains(target)
          || textColorButtonRef.current?.contains(target)
        ) {
          return
        }

        setShowTextColorMenu(false)
      }

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setShowTextColorMenu(false)
        }
      }

      const handleViewportChange = () => {
        updateTextColorMenuPosition()
      }

      window.addEventListener('mousedown', handlePointerDown)
      window.addEventListener('keydown', handleKeyDown)
      window.addEventListener('resize', handleViewportChange)
      window.addEventListener('scroll', handleViewportChange, true)

      return () => {
        window.removeEventListener('mousedown', handlePointerDown)
        window.removeEventListener('keydown', handleKeyDown)
        window.removeEventListener('resize', handleViewportChange)
        window.removeEventListener('scroll', handleViewportChange, true)
      }
    }, [showTextColorMenu, updateTextColorMenuPosition])

    const preserveSelectionOnToolbarMouseDown = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
    }, [])

    const preserveSelectionOnSelectMouseDown = useCallback(() => {
      if (!editor) return

      const { from, to } = editor.state.selection
      pendingSelectionRef.current = { from, to }
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
                  style={{
                    backgroundColor: resolvedEditorUiState.color || DEFAULT_TEXT_COLOR,
                  }}
                />
              </span>
            </ToolbarButton>
          </div>
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
                  style={{
                    backgroundColor: resolvedEditorUiState.backgroundColor || DEFAULT_TEXT_HIGHLIGHT,
                  }}
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

          <ToolbarButton onClick={undo} disabled={!editor.can().undo()} title={t('editor.undo')}>
            <Undo className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={redo} disabled={!editor.can().redo()} title={t('editor.redo')}>
            <Redo className="w-4 h-4" />
          </ToolbarButton>
        </div>

        {showBackgroundColorMenu && (
          <div
            ref={backgroundColorMenuRef}
            className="fixed z-50 flex w-[360px] flex-col gap-3 rounded-md border border-border bg-background p-4 shadow-xl"
            style={{
              top: backgroundColorMenuPosition.top,
              left: backgroundColorMenuPosition.left,
            }}
          >
            <div className="space-y-2">
              <div className="text-sm text-foreground">{t('editor.background_color_recent')}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onMouseDown={preserveSelectionOnToolbarMouseDown}
                  onClick={() => setBackgroundColor('')}
                  className={`h-8 w-8 rounded-sm border bg-[linear-gradient(135deg,transparent_46%,#ff6b6b_46%,#ff6b6b_54%,transparent_54%)] transition-colors ${resolvedEditorUiState.backgroundColor
                      ? 'border-border hover:border-foreground/30'
                      : 'border-foreground/60'
                    }`}
                  title={t('editor.background_color_clear')}
                />
                {recentBackgroundColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onMouseDown={preserveSelectionOnToolbarMouseDown}
                    onClick={() => setBackgroundColor(color)}
                    className={`h-8 w-8 rounded-sm border transition-colors ${resolvedEditorUiState.backgroundColor === color
                        ? 'border-foreground/60'
                        : 'border-border hover:border-foreground/30'
                      }`}
                    title={color}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onMouseDown={preserveSelectionOnToolbarMouseDown}
                  onClick={() => setBackgroundColorTab('basic')}
                  className={`text-sm transition-colors ${backgroundColorTab === 'basic'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  {t('editor.background_color_basic')}
                </button>
                <button
                  type="button"
                  onMouseDown={preserveSelectionOnToolbarMouseDown}
                  onClick={() => {
                    setBackgroundColorTab('more')
                    backgroundColorPickerRef.current?.click()
                  }}
                  className={`text-sm transition-colors ${backgroundColorTab === 'more'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  {t('editor.background_color_more')}
                </button>
                <input
                  ref={backgroundColorPickerRef}
                  type="color"
                  value={normalizeHexColor(customBackgroundColor) || DEFAULT_TEXT_HIGHLIGHT}
                  onChange={(event) => {
                    const nextColor = normalizeHexColor(event.target.value)
                    if (!nextColor) return
                    setCustomBackgroundColor(nextColor)
                    setBackgroundColorTab('more')
                  }}
                  className="sr-only"
                  tabIndex={-1}
                />
              </div>
              <div className="grid grid-cols-8 gap-2">
                {(backgroundColorTab === 'basic'
                  ? BASIC_BACKGROUND_COLOR_OPTIONS
                  : MORE_BACKGROUND_COLOR_OPTIONS
                ).map((color) => (
                  <button
                    key={`${backgroundColorTab}-${color}`}
                    type="button"
                    onMouseDown={preserveSelectionOnToolbarMouseDown}
                    onClick={() => {
                      setCustomBackgroundColor(color)
                      setBackgroundColor(color)
                    }}
                    className={`h-7 w-7 rounded-sm border transition-colors ${resolvedEditorUiState.backgroundColor === color
                        ? 'border-foreground/60'
                        : 'border-border hover:border-foreground/30'
                      }`}
                    title={color}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onMouseDown={preserveSelectionOnToolbarMouseDown}
                  className="h-9 w-12 shrink-0 rounded-sm border border-border"
                  style={{ backgroundColor: normalizeHexColor(customBackgroundColor) || DEFAULT_TEXT_HIGHLIGHT }}
                  onClick={() => setBackgroundColor(customBackgroundColor)}
                  title={customBackgroundColor}
                />
                <input
                  type="text"
                  value={customBackgroundColor}
                  onChange={(event) => setCustomBackgroundColor(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setBackgroundColor(customBackgroundColor)
                    }
                  }}
                  className="h-9 min-w-0 flex-1 rounded-sm border border-border px-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
                />
                <button
                  type="button"
                  onMouseDown={preserveSelectionOnToolbarMouseDown}
                  onClick={() => setBackgroundColor(customBackgroundColor)}
                  className="h-9 shrink-0 rounded-sm border border-border px-4 text-sm text-foreground transition-colors hover:border-foreground/30"
                >
                  {t('editor.confirm')}
                </button>
              </div>
            </div>
          </div>
        )}

        {showTextColorMenu && (
          <div
            ref={textColorMenuRef}
            className="fixed z-50 flex w-[360px] flex-col gap-3 rounded-md border border-border bg-background p-4 shadow-xl"
            style={{
              top: textColorMenuPosition.top,
              left: textColorMenuPosition.left,
            }}
          >
            <div className="space-y-2">
              <div className="text-sm text-foreground">{t('editor.text_color_recent')}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onMouseDown={preserveSelectionOnToolbarMouseDown}
                  onClick={() => setTextColor('')}
                  className={`h-8 w-8 rounded-sm border bg-[linear-gradient(135deg,transparent_46%,#ff6b6b_46%,#ff6b6b_54%,transparent_54%)] transition-colors ${resolvedEditorUiState.color
                      ? 'border-border hover:border-foreground/30'
                      : 'border-foreground/60'
                    }`}
                  title={t('editor.text_color_clear')}
                />
                {recentTextColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onMouseDown={preserveSelectionOnToolbarMouseDown}
                    onClick={() => setTextColor(color)}
                    className={`h-8 w-8 rounded-sm border transition-colors ${resolvedEditorUiState.color === color
                        ? 'border-foreground/60'
                        : 'border-border hover:border-foreground/30'
                      }`}
                    title={color}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onMouseDown={preserveSelectionOnToolbarMouseDown}
                  onClick={() => setTextColorTab('basic')}
                  className={`text-sm transition-colors ${textColorTab === 'basic'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  {t('editor.text_color_basic')}
                </button>
                <button
                  type="button"
                  onMouseDown={preserveSelectionOnToolbarMouseDown}
                  onClick={() => {
                    setTextColorTab('more')
                    textColorPickerRef.current?.click()
                  }}
                  className={`text-sm transition-colors ${textColorTab === 'more'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  {t('editor.text_color_more')}
                </button>
                <input
                  ref={textColorPickerRef}
                  type="color"
                  value={normalizeHexColor(customTextColor) || DEFAULT_TEXT_COLOR}
                  onChange={(event) => {
                    const nextColor = normalizeHexColor(event.target.value)
                    if (!nextColor) return
                    setCustomTextColor(nextColor)
                    setTextColorTab('more')
                  }}
                  className="sr-only"
                  tabIndex={-1}
                />
              </div>
              <div className="grid grid-cols-8 gap-2">
                {(textColorTab === 'basic'
                  ? BASIC_TEXT_COLOR_OPTIONS
                  : MORE_TEXT_COLOR_OPTIONS
                ).map((color) => (
                  <button
                    key={`${textColorTab}-${color}`}
                    type="button"
                    onMouseDown={preserveSelectionOnToolbarMouseDown}
                    onClick={() => {
                      setCustomTextColor(color)
                      setTextColor(color)
                    }}
                    className={`h-7 w-7 rounded-sm border transition-colors ${resolvedEditorUiState.color === color
                        ? 'border-foreground/60'
                        : 'border-border hover:border-foreground/30'
                      }`}
                    title={color}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onMouseDown={preserveSelectionOnToolbarMouseDown}
                  className="h-9 w-12 shrink-0 rounded-sm border border-border"
                  style={{ backgroundColor: normalizeHexColor(customTextColor) || DEFAULT_TEXT_COLOR }}
                  onClick={() => setTextColor(customTextColor)}
                  title={customTextColor}
                />
                <input
                  type="text"
                  value={customTextColor}
                  onChange={(event) => setCustomTextColor(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setTextColor(customTextColor)
                    }
                  }}
                  className="h-9 min-w-0 flex-1 rounded-sm border border-border px-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
                />
                <button
                  type="button"
                  onMouseDown={preserveSelectionOnToolbarMouseDown}
                  onClick={() => setTextColor(customTextColor)}
                  className="h-9 shrink-0 rounded-sm border border-border px-4 text-sm text-foreground transition-colors hover:border-foreground/30"
                >
                  {t('editor.confirm')}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-[linear-gradient(to_bottom,rgba(127,127,127,0.03),transparent_96px)]">
          <EditorContent editor={editor} className="h-full custom-scrollbar" />
        </div>
      </div>
    )
  }
)

NarrativeTipTapEditor.displayName = 'NarrativeTipTapEditor'

export default NarrativeTipTapEditor
