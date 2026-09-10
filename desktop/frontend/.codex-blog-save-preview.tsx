import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from './src/contexts/AuthContext'
import { BlogTab } from './src/pages/admin-logs/BlogTab'
import type { BlogDto, PhotoDto } from './src/lib/api/types'
import './src/index.css'

let record: BlogDto | null = null
const counts = { list: 0, create: 0, update: 0 }
const changed = () => window.dispatchEvent(new Event('codex-save-counts'))
const wait = () => new Promise(resolve => setTimeout(resolve, 1200))
const app = {
  GetApiConfig: async () => ({ baseUrl: '', token: '' }),
  SetAuth: async () => {}, ClearAuth: async () => {},
  GetBlogs: async () => { counts.list += 1; changed(); return record ? [record] : [] },
  CreateBlog: async (data: Partial<BlogDto>) => {
    counts.create += 1; changed(); await wait()
    record = { id: 'qa-saved-blog-20260908', title: '', editorType: 'milkdown', contentEditorTypes: ['milkdown'], tiptapContent: '', milkContent: '', category: '', tags: '', isPublished: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...data }
    return structuredClone(record)
  },
  UpdateBlog: async (id: string, data: Partial<BlogDto>) => {
    counts.update += 1; changed(); await wait()
    if (!record || id !== record.id) throw new Error('Unexpected document identity')
    record = { ...record, ...data, updatedAt: new Date().toISOString() }
    return structuredClone(record)
  },
  DeleteBlog: async () => {},
}
;(window as unknown as { go: { main: { App: typeof app } } }).go = { main: { App: app } }
const photos: PhotoDto[] = []
const labels: Record<string, string> = { 'admin.save': '保存', 'ui.saving': '保存中', 'admin.preview': '预览', 'admin.published': '已发布', 'admin.draft': '草稿', 'blog.title_placeholder': '文章标题', 'ui.immersive': '沉浸模式', 'ui.category_filter': '分类', 'ui.markdown_placeholder': '开始写作', 'story.draft_saved': '草稿已保存', 'admin.notify_log_saved': '文章已保存', 'blog.enter_title': '请输入标题' }
const translate = (key: string) => labels[key] ?? key

function SaveVerification() {
  const [metrics, setMetrics] = useState({ ...counts })
  const [message, setMessage] = useState('等待操作')
  const [immersive, setImmersive] = useState(false)
  const notify = useCallback((text: string) => setMessage(text), [])
  useEffect(() => {
    const refresh = () => setMetrics({ ...counts })
    window.addEventListener('codex-save-counts', refresh)
    refresh()
    return () => window.removeEventListener('codex-save-counts', refresh)
  }, [])
  return <div className="flex h-screen flex-col bg-background text-foreground">
    <output className="border-b p-2 text-sm">列表请求 {metrics.list}；创建 {metrics.create}；更新 {metrics.update}；{message}</output>
    <div className="min-h-0 flex-1 p-3">
      <BlogTab photos={photos} settings={null} t={translate} notify={notify} createRequestKey={1} isImmersiveMode={immersive} setIsImmersiveMode={setImmersive} />
    </div>
  </div>
}
createRoot(document.getElementById('root')!).render(<MemoryRouter><AuthProvider><SaveVerification /></AuthProvider></MemoryRouter>)
