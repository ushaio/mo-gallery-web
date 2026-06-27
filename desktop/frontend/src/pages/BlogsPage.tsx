import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import type { Blog } from '@/types'
import { Plus, Trash2, PenTool } from 'lucide-react'

export function BlogsPage() {
  const { language } = usePreferences()
  const [blogs, setBlogs] = useState<Blog[]>([])
  const [loading, setLoading] = useState(false)

  const fetchBlogs = useCallback(async () => {
    setLoading(true)
    try {
      const result = await (window as any).go.main.App.GetBlogs()
      setBlogs(result || [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchBlogs() }, [fetchBlogs])

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此博客吗？')) return
    try {
      await (window as any).go.main.App.DeleteBlog(id)
      fetchBlogs()
    } catch {}
  }

  return (
    <>
      <PageHeader
        title={t('blogs.title', language)}
        description={`${blogs.length} posts`}
        actions={
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            <Plus size={14} /> {t('blogs.create', language)}
          </button>
        }
      />
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64" style={{ color: 'var(--muted-foreground)' }}>{t('common.loading', language)}</div>
        ) : blogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64" style={{ color: 'var(--muted-foreground)' }}>
            <PenTool size={32} className="mb-2 opacity-40" />
            <p className="text-sm">{t('common.noData', language)}</p>
            <p className="text-xs mt-1">(Phase 4 实现富文本编辑器)</p>
          </div>
        ) : (
          <div className="space-y-2">
            {blogs.map(blog => (
              <div key={blog.id} className="flex items-center gap-4 px-4 py-3 rounded-lg border"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium truncate">{blog.title}</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                    {blog.category} · {blog.tags || 'no tags'} · {new Date(blog.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded shrink-0"
                  style={{
                    backgroundColor: blog.isPublished ? 'var(--accent)' : 'var(--muted)',
                    color: blog.isPublished ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                  }}>
                  {blog.isPublished ? '已发布' : '草稿'}
                </span>
                <button onClick={() => handleDelete(blog.id)}
                  className="p-1 rounded hover:opacity-80 shrink-0" style={{ color: 'var(--destructive)' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
