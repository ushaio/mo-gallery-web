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
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import ImageResize from 'tiptap-extension-resize-image'
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
  Heading1,
  Heading2,
  Heading3,
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
    (match, alt, url, width, height) => {
      let style = ''
      if (width) {
        style = ` style="width: ${width}px; max-width: 100%;"`
      }
      return `<img src="${url}" alt="${alt}"${style} />`
    }
  )
  
  result = result.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    '<a href="$2">$1</a>'
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
  
  if (!result.includes('<') && !result.includes('>')) {
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
  isActive?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}

function ToolbarButton({ onClick, isActive, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        isActive
          ? 'bg-primary/20 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-border mx-1" />
}

export const NarrativeTipTapEditor = forwardRef<NarrativeTipTapEditorHandle, NarrativeTipTapEditorProps>(
  ({ value, onChange, placeholder, onPasteFiles, className }, ref) => {
    const editorRef = useRef<ReturnType<typeof useEditor> | null>(null)
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
        Image,
        ImageResize,
        Underline,
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
      onUpdate: ({ editor }) => {
        const html = editor.getHTML()
        currentValueRef.current = html
        onChange(html)
      },
      editorProps: {
        attributes: {
          class: 'prose prose-sm sm:prose max-w-none focus:outline-none min-h-[300px] p-4',
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

    editorRef.current = editor

    const focusEditor = useCallback(() => {
      editor?.commands.focus()
    }, [editor])

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
          // Convert Markdown images to HTML images for TipTap
          let processedContent = content
          if (isMarkdownImageSyntax(content)) {
            const attrs = convertMarkdownImageToHtmlAttrs(content)
            if (attrs) {
              const style = attrs.width ? ` style="width: ${attrs.width}px; max-width: 100%;"` : ''
              processedContent = `<img src="${attrs.src}" alt="${attrs.alt || ''}"${style} />`
            }
          }
          
          const separator = currentValueRef.current && !currentValueRef.current.endsWith('<p>') ? '<p><br></p>' : ''
          editor.commands.insertContent(separator + processedContent)
          focusEditor()
        }
      },
      insertMarkdown: (markdown: string) => {
        if (editor) {
          const html = convertMarkdownToHtml(markdown)
          const separator = currentValueRef.current && !currentValueRef.current.endsWith('<p>') ? '<p><br></p>' : ''
          editor.commands.insertContent(separator + html)
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
            const style = attrs.width ? ` style="width: ${attrs.width}px; max-width: 100%;"` : ''
            processedNext = `<img src="${attrs.src}" alt="${attrs.alt || ''}"${style} />`
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
        const { tr } = state
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
    }), [editor, focusEditor, onChange])

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
          editor.chain().focus().setImage({ src: imageUrl }).run()
        }
        setShowImageInput(false)
        setImageUrl('')
      } else {
        setShowImageInput(true)
      }
    }, [editor, imageUrl, showImageInput])

    const addTable = useCallback(() => {
      if (!editor) return
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    }, [editor])

    const setTextAlign = (align: 'left' | 'center' | 'right') => {
      editor?.chain().focus().setTextAlign(align).run()
    }

    const undo = () => editor?.chain().focus().undo().run()
    const redo = () => editor?.chain().focus().redo().run()

    if (!editor) {
      return (
        <div className={`h-full flex items-center justify-center bg-muted/30 rounded-lg ${className || ''}`}>
          <div className="animate-pulse w-full h-full min-h-[300px] bg-muted/50 rounded-lg" />
        </div>
      )
    }

    return (
      <div className={`tiptap-editor h-full flex flex-col ${resolvedTheme === 'dark' ? 'tiptap-dark' : 'tiptap-light'} ${className || ''}`}>
        <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-border bg-muted/20 rounded-t-lg">
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

          <ToolbarButton onClick={() => setTextAlign('left')} isActive={editor.isActive({ textAlign: 'left' })} title="左对齐">
            <AlignLeft className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => setTextAlign('center')} isActive={editor.isActive({ textAlign: 'center' })} title="居中">
            <AlignCenter className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => setTextAlign('right')} isActive={editor.isActive({ textAlign: 'right' })} title="右对齐">
            <AlignRight className="w-4 h-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <div className="relative">
            <ToolbarButton onClick={setLink} isActive={editor.isActive('link')} title="链接">
              <LinkIcon className="w-4 h-4" />
            </ToolbarButton>
            {showLinkInput && (
              <div className="absolute top-full left-0 mt-1 flex items-center gap-1 p-2 bg-background border border-border rounded-lg shadow-lg z-10">
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="输入链接 URL"
                  className="px-2 py-1 text-xs border border-border rounded focus:border-primary outline-none w-40"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setLink()
                    if (e.key === 'Escape') setShowLinkInput(false)
                  }}
                  autoFocus
                />
                <button
                  onClick={setLink}
                  className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
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
              <div className="absolute top-full left-0 mt-1 flex items-center gap-1 p-2 bg-background border border-border rounded-lg shadow-lg z-10">
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="输入图片 URL"
                  className="px-2 py-1 text-xs border border-border rounded focus:border-primary outline-none w-40"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addImage()
                    if (e.key === 'Escape') setShowImageInput(false)
                  }}
                  autoFocus
                />
                <button
                  onClick={addImage}
                  className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
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

        <div className="flex-1 overflow-y-auto">
          <EditorContent editor={editor} className="h-full" />
        </div>
      </div>
    )
  }
)

NarrativeTipTapEditor.displayName = 'NarrativeTipTapEditor'

export default NarrativeTipTapEditor
