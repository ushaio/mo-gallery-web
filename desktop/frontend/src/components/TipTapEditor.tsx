import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { useImperativeHandle, forwardRef, useCallback } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code,
  Heading1, Heading2, Heading3, List, ListOrdered, Quote,
  AlignLeft, AlignCenter, AlignRight, Link as LinkIcon, Image as ImageIcon,
  Minus, Undo, Redo,
} from 'lucide-react'

// 对齐 web 端：图片节点保留 data-photo-id / width / style 属性，
// 使插入的图片可与照片库关联（保存时剥离 src，加载时回填）。
const StoryImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: { default: null, parseHTML: (el) => el.getAttribute('src') || '', renderHTML: (attrs) => attrs.src ? { src: attrs.src } : {} },
      alt: { default: null, parseHTML: (el) => el.getAttribute('alt') || '', renderHTML: (attrs) => attrs.alt ? { alt: attrs.alt } : {} },
      title: { default: null },
      'data-photo-id': { default: null, parseHTML: (el) => el.getAttribute('data-photo-id'), renderHTML: (attrs) => attrs['data-photo-id'] ? { 'data-photo-id': attrs['data-photo-id'] } : {} },
      width: { default: null, parseHTML: (el) => el.getAttribute('width'), renderHTML: (attrs) => attrs.width ? { width: attrs.width } : {} },
      style: { default: null, parseHTML: (el) => el.getAttribute('style'), renderHTML: (attrs) => attrs.style ? { style: attrs.style } : {} },
    }
  },
})

export interface TipTapEditorHandle {
  insertHtml: (html: string) => void
  getHTML: () => string
  getJSON: () => any
  focus: () => void
}

interface TipTapEditorProps {
  content: string
  contentJson?: any
  onChange: (html: string) => void
  onJsonChange?: (json: any) => void
  placeholder?: string
}

export const TipTapEditor = forwardRef<TipTapEditorHandle, TipTapEditorProps>(
  function TipTapEditor({ content, contentJson, onChange, onJsonChange, placeholder }, ref) {
    const editor = useEditor({
      extensions: [
        StarterKit.configure({ horizontalRule: false }),
        Link.configure({ openOnClick: false }),
        StoryImage.configure({ inline: false, allowBase64: true }),
        Placeholder.configure({ placeholder: placeholder || '开始写作...' }),
        Underline,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ],
      content: contentJson || content || '',
      onUpdate: ({ editor }) => {
        onChange(editor.getHTML())
        onJsonChange?.(editor.getJSON())
      },
      editorProps: {
        attributes: {
          class: 'prose prose-sm max-w-none focus:outline-none min-h-[300px] px-1 py-2',
        },
      },
    })

    useImperativeHandle(ref, () => ({
      insertHtml: (html: string) => {
        editor?.chain().focus().insertContent(html).run()
      },
      getHTML: () => editor?.getHTML() || '',
      getJSON: () => editor?.getJSON() || null,
      focus: () => editor?.commands.focus(),
    }), [editor])

    // 编辑器为非受控：仅在挂载时用 content/contentJson 初始化。
    // 切换编辑对象时由父组件通过 key 重建实例（对齐 web 端 key={id} 模式）。

    const addImage = useCallback(() => {
      const url = window.prompt('输入图片 URL:')
      if (url && editor) {
        editor.chain().focus().setImage({ src: url }).run()
      }
    }, [editor])

    const setLink = useCallback(() => {
      if (!editor) return
      const previousUrl = editor.getAttributes('link').href
      const url = window.prompt('输入链接 URL:', previousUrl)
      if (url === null) return
      if (url === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run()
        return
      }
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }, [editor])

    if (!editor) return null

    return (
      <div className="rounded-lg border flex flex-col" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
        {/* 工具栏 */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b flex-wrap" style={{ borderColor: 'var(--border)' }}>
          <ToolbarBtn icon={Bold} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
          <ToolbarBtn icon={Italic} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
          <ToolbarBtn icon={UnderlineIcon} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
          <ToolbarBtn icon={Strikethrough} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
          <ToolbarBtn icon={Code} active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />
          <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--border)' }} />
          <ToolbarBtn icon={Heading1} active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
          <ToolbarBtn icon={Heading2} active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
          <ToolbarBtn icon={Heading3} active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
          <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--border)' }} />
          <ToolbarBtn icon={List} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <ToolbarBtn icon={ListOrdered} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
          <ToolbarBtn icon={Quote} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
          <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--border)' }} />
          <ToolbarBtn icon={AlignLeft} active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
          <ToolbarBtn icon={AlignCenter} active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
          <ToolbarBtn icon={AlignRight} active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} />
          <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--border)' }} />
          <ToolbarBtn icon={LinkIcon} active={editor.isActive('link')} onClick={setLink} />
          <ToolbarBtn icon={ImageIcon} onClick={addImage} />
          <ToolbarBtn icon={Minus} onClick={() => editor.chain().focus().setHorizontalRule().run()} />
          <div className="flex-1" />
          <ToolbarBtn icon={Undo} onClick={() => editor.chain().focus().undo().run()} />
          <ToolbarBtn icon={Redo} onClick={() => editor.chain().focus().redo().run()} />
        </div>

        {/* 编辑区 */}
        <div className="flex-1 overflow-auto">
          <EditorContent editor={editor} />
        </div>
      </div>
    )
  }
)

function ToolbarBtn({ icon: Icon, active, onClick }: { icon: any; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-1.5 rounded transition-colors"
      style={{
        backgroundColor: active ? 'var(--accent)' : 'transparent',
        color: active ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
      }}
    >
      <Icon size={15} />
    </button>
  )
}
