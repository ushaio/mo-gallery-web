import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import type { Blog } from '@/types'
import { TipTapEditor } from '@/components/TipTapEditor'
import { ListSkeleton } from '@/components/admin/Skeleton'
import {
  Plus, Trash2, PenTool, Eye, EyeOff, ChevronLeft, Save, Loader2,
} from 'lucide-react'

type View = 'list' | 'edit'

export function BlogsPage() {
  const { language } = usePreferences()
  const [blogs, setBlogs] = useState<Blog[]>([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<View>('list')
  const [editingBlog, setEditingBlog] = useState<Blog | null>(null)

  const fetchBlogs = useCallback(async () => {
    setLoading(true)
    try {
      const result = await (window as any).go.main.App.GetBlogs()
      setBlogs(result || [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchBlogs() }, [fetchBlogs])

  const handleCreate = () => {
    setEditingBlog(null)
    setView('edit')
  }

  const handleEdit = (blog: Blog) => {
    setEditingBlog(blog)
    setView('edit')
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此博客吗？')) return
    try {
      await (window as any).go.main.App.DeleteBlog(id)
      toast.success('已删除')
      fetchBlogs()
    } catch (err: any) {
      toast.error(err?.message || '删除失败')
    }
  }

  const togglePublished = async (blog: Blog) => {
    try {
      await (window as any).go.main.App.UpdateBlog(blog.id, { isPublished: !blog.isPublished })
      toast.success(blog.isPublished ? '已取消发布' : '已发布')
      fetchBlogs()
    } catch (err: any) {
      toast.error(err?.message || '操作失败')
    }
  }

  const handleBack = () => {
    setView('list')
    setEditingBlog(null)
    fetchBlogs()
  }

  if (view === 'edit') {
    return <BlogEditor blog={editingBlog} onBack={handleBack} />
  }

  return (
    <>
      <PageHeader
        title={t('admin.page_blogs', language)}
        description={`${blogs.length} posts`}
        actions={
          <button onClick={handleCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            <Plus size={14} /> {t('admin.create_blog', language)}
          </button>
        }
      />
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <ListSkeleton count={5} />
        ) : blogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64" style={{ color: 'var(--muted-foreground)' }}>
            <PenTool size={32} className="mb-2 opacity-40" />
            <p className="text-sm">{t('common.noData', language)}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {blogs.map(blog => (
              <div key={blog.id}
                className="flex items-center gap-4 px-4 py-3 rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
                onClick={() => handleEdit(blog)}>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium truncate">{blog.title}</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                    {blog.category || '-'} · {blog.tags || 'no tags'} · {new Date(blog.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded shrink-0"
                  style={{
                    backgroundColor: blog.isPublished ? 'var(--accent)' : 'var(--muted)',
                    color: blog.isPublished ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                  }}>
                  {blog.isPublished ? '已发布' : '草稿'}
                </span>
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  <button onClick={() => togglePublished(blog)}
                    className="p-1 rounded hover:opacity-80" style={{ color: 'var(--muted-foreground)' }}>
                    {blog.isPublished ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button onClick={() => handleDelete(blog.id)}
                    className="p-1 rounded hover:opacity-80" style={{ color: 'var(--destructive)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ─── 博客编辑器 ──────────────────────────────────────

interface BlogEditorProps {
  blog: Blog | null // null = 新建
  onBack: () => void
}

function BlogEditor({ blog, onBack }: BlogEditorProps) {
  const isNew = !blog
  const [title, setTitle] = useState(blog?.title || '')
  const [content, setContent] = useState(blog?.content || '')
  const [contentJson, setContentJson] = useState(blog?.contentJson || null)
  const [category, setCategory] = useState(blog?.category || '')
  const [tags, setTags] = useState(blog?.tags || '')
  const [isPublished, setIsPublished] = useState(blog?.isPublished ?? false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('请输入标题')
      return
    }
    setSaving(true)
    try {
      if (isNew) {
        await (window as any).go.main.App.CreateBlog({
          title: title.trim(),
          content,
          contentJson: contentJson || undefined,
          category,
          tags,
          isPublished,
        })
        toast.success('博客已创建')
      } else {
        await (window as any).go.main.App.UpdateBlog(blog!.id, {
          title: title.trim(),
          content,
          contentJson: contentJson || undefined,
          category,
          tags,
          isPublished,
        })
        toast.success('已保存')
      }
    } catch (err: any) {
      toast.error(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title={isNew ? '创建博客' : `编辑: ${blog?.title || ''}`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md"
              style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
              <ChevronLeft size={14} /> 返回
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md disabled:opacity-50"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-hidden flex">
        {/* 左侧：编辑区 */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-3xl space-y-4">
            {/* 标题 */}
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="博客标题"
              className="w-full text-xl font-semibold px-0 py-2 border-0 outline-none bg-transparent"
              style={{ color: 'var(--foreground)' }} />

            {/* 元数据行 */}
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isPublished}
                  onChange={e => setIsPublished(e.target.checked)}
                  className="rounded" />
                <span className="text-xs">发布</span>
              </label>
              <input type="text" value={category} onChange={e => setCategory(e.target.value)}
                placeholder="分类"
                className="px-2 py-1 text-xs rounded border outline-none"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }} />
              <input type="text" value={tags} onChange={e => setTags(e.target.value)}
                placeholder="标签（逗号分隔）"
                className="px-2 py-1 text-xs rounded border outline-none"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }} />
            </div>

            {/* 富文本编辑器 */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
                内容
              </label>
              <TipTapEditor
                content={content}
                contentJson={contentJson}
                onChange={setContent}
                onJsonChange={setContentJson}
                placeholder="在此输入博客内容..."
              />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
