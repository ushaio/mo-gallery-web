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
import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { ResizableImage } from '@/components/tiptap-extensions/ResizableImage'
import { PastedStyleMark } from '@/components/tiptap-extensions/PastedStyleMark'
import { PastedBlockStyle } from '@/components/tiptap-extensions/PastedBlockStyle'
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
  Link as LinkIcon,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Table as TableIcon,
  Undo,
  Redo,
} from 'lucide-react'
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
}

function ToolbarButton({ onClick, onMouseDown, isActive, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={onMouseDown}
      disabled={disabled}
      title={title}
      className={`flex h-8 min-w-8 items-center justify-center border px-2 text-[11px] transition-all duration-200 ${
        isActive
          ? 'border-primary/30 bg-primary/10 text-primary shadow-sm'
          : 'border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-accent-foreground'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return <div className="mx-2 h-4 w-px bg-border/80" />
}

export const NarrativeTipTapEditor = forwardRef<NarrativeTipTapEditorHandle, NarrativeTipTapEditorProps>(
  ({ value, onChange, placeholder, onPasteFiles, className }, ref) => {
    const currentValueRef = useRef(value)
    const onPasteFilesRef = useRef(onPasteFiles)
    const [showLinkInput, setShowLinkInput] = useState(false)
    const [linkUrl, setLinkUrl] = useState('')
    const [showImageInput, setShowImageInput] = useState(false)
    const [imageUrl, setImageUrl] = useState('')
    const { resolvedTheme } = useTheme()

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
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3],
          },
        }),
        Placeholder.configure({
          placeholder: placeholder || '开始编写你的故事...',
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
      },
    })

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
        }
      },
    })

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
    const toggleH1 = () => editor?.chain().focus().toggleHeading({ level: 1 }).run()
    const toggleH2 = () => editor?.chain().focus().toggleHeading({ level: 2 }).run()
    const toggleH3 = () => editor?.chain().focus().toggleHeading({ level: 3 }).run()
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

    const setTextAlign = (align: 'left' | 'center' | 'right') => {
      if (!editor) return
      editor.chain().focus().setTextAlign(align).run()
    }

    const preserveSelectionOnToolbarMouseDown = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
    }, [])

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
        <div className="scrollbar-hide flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-border/70 bg-gradient-to-r from-muted/20 via-background to-muted/5 px-3 py-2 whitespace-nowrap">
          <ToolbarButton onClick={toggleH1} isActive={editor.isActive('heading', { level: 1 })} title="标题1">
            <span className="text-xs font-bold">H1</span>
          </ToolbarButton>
          <ToolbarButton onClick={toggleH2} isActive={editor.isActive('heading', { level: 2 })} title="标题2">
            <span className="text-xs font-bold">H2</span>
          </ToolbarButton>
          <ToolbarButton onClick={toggleH3} isActive={editor.isActive('heading', { level: 3 })} title="标题3">
            <span className="text-xs font-bold">H3</span>
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton onClick={toggleBold} isActive={editor.isActive('bold')} title="粗体">
            <Bold className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={toggleItalic} isActive={editor.isActive('italic')} title="斜体">
            <Italic className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={toggleUnderline} isActive={editor.isActive('underline')} title="下划线">
            <UnderlineIcon className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={toggleStrike} isActive={editor.isActive('strike')} title="删除线">
            <Strikethrough className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={toggleCode} isActive={editor.isActive('code')} title="行内代码">
            <Code className="w-4 h-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton onClick={toggleBulletList} isActive={editor.isActive('bulletList')} title="无序列表">
            <List className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={toggleOrderedList} isActive={editor.isActive('orderedList')} title="有序列表">
            <ListOrdered className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={toggleBlockquote} isActive={editor.isActive('blockquote')} title="引用">
            <Quote className="w-4 h-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton onMouseDown={preserveSelectionOnToolbarMouseDown} onClick={() => setTextAlign('left')} isActive={editor.isActive({ textAlign: 'left' })} title="左对齐">
            <AlignLeft className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onMouseDown={preserveSelectionOnToolbarMouseDown} onClick={() => setTextAlign('center')} isActive={editor.isActive({ textAlign: 'center' })} title="居中">
            <AlignCenter className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onMouseDown={preserveSelectionOnToolbarMouseDown} onClick={() => setTextAlign('right')} isActive={editor.isActive({ textAlign: 'right' })} title="右对齐">
            <AlignRight className="w-4 h-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <div className="relative">
            <ToolbarButton onClick={setLink} isActive={editor.isActive('link')} title="链接">
              <LinkIcon className="w-4 h-4" />
            </ToolbarButton>
            {showLinkInput && (
              <div className="absolute top-full left-0 z-10 mt-1 flex items-center gap-1 border border-border bg-background p-2 shadow-lg">
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="输入链接 URL"
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
                  确认
                </button>
              </div>
            )}
          </div>

          <div className="relative">
            <ToolbarButton onClick={addImage} title="图片">
              <ImageIcon className="w-4 h-4" />
            </ToolbarButton>
            {showImageInput && (
              <div className="absolute top-full left-0 z-10 mt-1 flex items-center gap-1 border border-border bg-background p-2 shadow-lg">
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="输入图片 URL"
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
                  确认
                </button>
              </div>
            )}
          </div>

          <ToolbarButton onClick={addTable} title="表格">
            <TableIcon className="w-4 h-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton onClick={undo} disabled={!editor.can().undo()} title="撤销">
            <Undo className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={redo} disabled={!editor.can().redo()} title="重做">
            <Redo className="w-4 h-4" />
          </ToolbarButton>
        </div>

        <div className="flex-1 overflow-y-auto bg-[linear-gradient(to_bottom,rgba(127,127,127,0.03),transparent_96px)]">
          <EditorContent editor={editor} className="h-full custom-scrollbar" />
        </div>
      </div>
    )
  }
)

NarrativeTipTapEditor.displayName = 'NarrativeTipTapEditor'

export default NarrativeTipTapEditor
