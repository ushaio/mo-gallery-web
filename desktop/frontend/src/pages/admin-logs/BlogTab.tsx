/**
 * 博客管理（master-detail）：左栏列表 + 右栏编辑器。
 * 选中行即编辑；切换/退出前先落盘草稿（IndexedDB 自动保存兜底）；
 * 保存后留在编辑态并清除草稿。草稿恢复/删除对话框与自动保存逻辑沿用原实现。
 */
'use client'

import React, { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import type { PhotoDto, BlogDto } from '@/lib/api/types'
import { createBlogDraftDocumentId, resolveBlogDocumentId, rotateBlogDraftDocumentId } from '@/lib/blog-draft-document'
import { persistDesktopBlog, type DesktopBlogSaveApi } from '@/lib/desktop-blog-save'
import { useAuth } from '@/contexts/AuthContext'
import {
  saveBlogDraftToDB,
  getBlogDraftFromDB,
  clearBlogDraftFromDB,
  type BlogDraftData
} from '@/lib/client-db'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { DraftRestoreDialog } from '@/components/admin/DraftRestoreDialog'
import { BlogListView } from './BlogListView'
import { BlogEditorView, type BlogFormData } from './BlogEditorView'
import { EditorEmptyState } from './shared/EditorEmptyState'
import { CollapsibleListPane } from './shared/CollapsibleListPane'
import { useDirtyLeaveGuard, useSaveShortcut } from './shared/useDirtyLeaveGuard'
import { cn } from '@/lib/utils'
import { BookText } from 'lucide-react'

const AUTO_SAVE_DELAY = 2000 // 自动保存防抖延迟（毫秒）

interface BlogTabProps {
  photos: PhotoDto[]
  settings: Record<string, string> | null
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  refreshKey?: number
  editBlogFromDraft?: BlogDraftData | null
  onDraftConsumed?: () => void
  onEditingChange?: (editing: boolean) => void
  listPaneCollapsed?: boolean
  onToggleListPane?: () => void
  subTabNav?: ReactNode
}

interface DesktopBlogApp extends DesktopBlogSaveApi {
  GetBlogs: () => Promise<BlogDto[]>
  DeleteBlog: (id: string) => Promise<void>
}

function getDesktopBlogApp() {
  return (window as unknown as { go: { main: { App: DesktopBlogApp } } }).go.main.App
}

export function BlogTab({ photos, settings, t, notify, refreshKey, editBlogFromDraft, onDraftConsumed, onEditingChange, listPaneCollapsed = false, onToggleListPane, subTabNav }: BlogTabProps) {
  const { token } = useAuth()
  const [blogs, setBlogs] = useState<BlogDto[]>([])
  const [loading, setLoading] = useState(true)
  const [currentBlog, setCurrentBlog] = useState<BlogFormData | null>(null)
  const [saving, setSaving] = useState(false)
  const [isAiTaskLocked, setIsAiTaskLocked] = useState(false)
  const [draftDocumentId, setDraftDocumentId] = useState(createBlogDraftDocumentId)

  // 自动保存状态
  const [draftSaved, setDraftSaved] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 记录初始状态，用于脏检查
  const [isDirty, setIsDirty] = useState(false)
  const initialBlogRef = useRef<{
    title: string
    content: string
    contentJson?: BlogDto['contentJson']
    category: string
    tags: string
    isPublished: boolean
  } | null>(null)

  // 删除确认对话框状态
  const [deleteBlogId, setDeleteBlogId] = useState<string | null>(null)

  // 发布状态筛选
  const [statusFilter, setStatusFilter] = useState('')

  // 文档内容修订号：整篇内容被替换（草稿恢复/跳转）时递增，驱动编辑器重挂载
  const [editorRevision, setEditorRevision] = useState(0)

  // 草稿恢复对话框状态
  const [draftRestoreDialog, setDraftRestoreDialog] = useState<{
    isOpen: boolean
    draft: BlogDraftData | null
    blog: BlogDto | null
    isNew: boolean
  }>({ isOpen: false, draft: null, blog: null, isNew: false })

  const editing = currentBlog !== null

  // 通知父级编辑状态（用于内容区 padding 切换）
  useEffect(() => {
    onEditingChange?.(editing)
  }, [editing, onEditingChange])

  // 沉浸模式状态（博客编辑器本地管理，退出编辑时复位）
  const [isImmersiveMode, setIsImmersiveMode] = useState(false)

  useEffect(() => {
    if (!currentBlog) setIsImmersiveMode(false)
  }, [currentBlog, setIsImmersiveMode])

  // 离开保护 + Ctrl+S
  useDirtyLeaveGuard(isDirty && editing, editing)
  useSaveShortcut(() => handleSaveBlog(), editing && !isAiTaskLocked)

  const fetchBlogs = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getDesktopBlogApp().GetBlogs()
      setBlogs(data || [])
    } catch (error) {
      notify(t('common.error'), 'error')
      console.error('Failed to fetch blogs:', error)
    } finally {
      setLoading(false)
    }
  }, [notify, t])

  useEffect(() => {
    void fetchBlogs()
  }, [fetchBlogs])

  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      void fetchBlogs()
    }
  }, [fetchBlogs, refreshKey])

  // 进入编辑模式时加载草稿
  const loadDraftForBlog = useCallback(async (blogId?: string) => {
    try {
      const draft = await getBlogDraftFromDB(blogId)
      if (draft) {
        setLastSavedAt(draft.savedAt)
        return draft
      }
    } catch (e) {
      console.error('Failed to load blog draft', e)
    }
    return null
  }, [])

  // 保存草稿到 IndexedDB
  const saveDraft = useCallback(async () => {
    if (!currentBlog) return
    if (!currentBlog.title && !currentBlog.content) return

    try {
      await saveBlogDraftToDB({
        blogId: currentBlog.id,
        title: currentBlog.title,
        content: currentBlog.content,
        contentJson: currentBlog.contentJson ?? null,
        category: currentBlog.category,
        tags: currentBlog.tags,
        isPublished: currentBlog.isPublished,
      })
      setLastSavedAt(Date.now())
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 2000)
    } catch (e) {
      console.error('Failed to save blog draft', e)
    }
  }, [currentBlog])

  // 从 IndexedDB 清除草稿
  const clearDraft = useCallback(async (blogId?: string) => {
    try {
      await clearBlogDraftFromDB(blogId)
      setLastSavedAt(null)
    } catch (e) {
      console.error('Failed to clear blog draft', e)
    }
  }, [])

  // 检查内容是否变更（脏检查）
  useEffect(() => {
    if (!currentBlog || !initialBlogRef.current) {
      setIsDirty(false)
      return
    }

    const initial = initialBlogRef.current
    const hasChanged =
      currentBlog.title !== initial.title ||
      currentBlog.content !== initial.content ||
      JSON.stringify(currentBlog.contentJson ?? null) !== JSON.stringify(initial.contentJson ?? null) ||
      currentBlog.category !== initial.category ||
      currentBlog.tags !== initial.tags ||
      currentBlog.isPublished !== initial.isPublished

    setIsDirty(hasChanged)
  }, [currentBlog?.title, currentBlog?.content, currentBlog?.contentJson, currentBlog?.category, currentBlog?.tags, currentBlog?.isPublished])

  // 内容变更时自动保存草稿（仅在有修改时）
  useEffect(() => {
    if (isAiTaskLocked || !currentBlog || !isDirty) return
    if (!currentBlog.title && !currentBlog.content) return

    // 清除已有定时器
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    // 设置新的自动保存定时器
    autoSaveTimerRef.current = setTimeout(() => {
      saveDraft()
    }, AUTO_SAVE_DELAY)

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [currentBlog?.title, currentBlog?.content, currentBlog?.contentJson, currentBlog?.category, currentBlog?.tags, currentBlog?.isPublished, saveDraft, isAiTaskLocked, isDirty])

  // 将草稿应用到当前博客
  const applyDraft = useCallback((draft: BlogDraftData, blogId?: string) => {
    const normalized: BlogFormData = {
      id: blogId,
      title: draft.title,
      content: draft.content,
      contentJson: draft.contentJson ?? null,
      category: draft.category || t('blog.uncategorized'),
      tags: draft.tags || '',
      isPublished: draft.isPublished,
    }
    setCurrentBlog(normalized)
    setLastSavedAt(draft.savedAt)
    // 更新初始引用以匹配恢复的草稿（不视为脏数据）
    initialBlogRef.current = {
      title: normalized.title,
      content: normalized.content,
      contentJson: normalized.contentJson,
      category: normalized.category,
      tags: normalized.tags,
      isPublished: normalized.isPublished,
    }
    notify(t('admin.restored_from_draft'), 'info')
  }, [t, notify])

  // 草稿恢复对话框 - 确认恢复
  const handleDraftRestore = useCallback(() => {
    setEditorRevision((r) => r + 1)
    if (draftRestoreDialog.draft) {
      applyDraft(draftRestoreDialog.draft, draftRestoreDialog.blog?.id)
    }
    setDraftRestoreDialog({ isOpen: false, draft: null, blog: null, isNew: false })
  }, [draftRestoreDialog, applyDraft])

  // 草稿恢复对话框 - 丢弃草稿
  const handleDraftDiscard = useCallback(() => {
    setEditorRevision((r) => r + 1)
    if (draftRestoreDialog.isNew) {
      setCurrentBlog({
        title: '',
        content: '',
        contentJson: null,
        category: t('blog.uncategorized'),
        tags: '',
        isPublished: false,
      })
    } else if (draftRestoreDialog.blog) {
      setCurrentBlog({
        id: draftRestoreDialog.blog.id,
        title: draftRestoreDialog.blog.title,
        content: draftRestoreDialog.blog.content,
        contentJson: draftRestoreDialog.blog.contentJson ?? null,
        category: draftRestoreDialog.blog.category || t('blog.uncategorized'),
        tags: draftRestoreDialog.blog.tags || '',
        isPublished: draftRestoreDialog.blog.isPublished,
      })
    }
    setLastSavedAt(null)
    setDraftRestoreDialog({ isOpen: false, draft: null, blog: null, isNew: false })
  }, [draftRestoreDialog, t])

  // 草稿恢复对话框 - 取消（关闭不操作，回到空选择态）
  const handleDraftCancel = useCallback(() => {
    setDraftRestoreDialog({ isOpen: false, draft: null, blog: null, isNew: false })
    setCurrentBlog(null)
  }, [])

  // 切换选中前先落盘当前草稿（毫秒级，无感）
  const flushCurrentDraft = useCallback(() => {
    if (currentBlog && isDirty) {
      void saveDraft()
    }
  }, [currentBlog, isDirty, saveDraft])

  const handleCreateBlog = async () => {
    setDraftDocumentId(rotateBlogDraftDocumentId)
    flushCurrentDraft()
    // 设置脏检查的初始状态
    initialBlogRef.current = {
      title: '',
      content: '',
      contentJson: null,
      category: t('blog.uncategorized'),
      tags: '',
      isPublished: false,
    }

    // 检查是否存在新博客的草稿
    const draft = await loadDraftForBlog(undefined)
    if (draft && (draft.title || draft.content)) {
      // 弹出对话框询问用户是否恢复草稿
      setCurrentBlog({
        title: '',
        content: '',
        contentJson: null,
        category: t('blog.uncategorized'),
        tags: '',
        isPublished: false,
      })
      setDraftRestoreDialog({ isOpen: true, draft, blog: null, isNew: true })
      return
    }

    setCurrentBlog({
      title: '',
      content: '',
      contentJson: null,
      category: t('blog.uncategorized'),
      tags: '',
      isPublished: false,
    })
  }

  const handleEditBlog = async (blog: BlogDto) => {
    flushCurrentDraft()
    // 设置脏检查的初始状态
    initialBlogRef.current = {
      title: blog.title,
      content: blog.content,
      contentJson: blog.contentJson ?? null,
      category: blog.category || t('blog.uncategorized'),
      tags: blog.tags || '',
      isPublished: blog.isPublished,
    }

    // 检查是否存在该博客的草稿
    const draft = await loadDraftForBlog(blog.id)
    if (draft && draft.savedAt > new Date(blog.updatedAt).getTime()) {
      // 草稿比已保存版本更新，弹出对话框
      setCurrentBlog({
        id: blog.id,
        title: blog.title,
        content: blog.content,
        contentJson: blog.contentJson ?? null,
        category: blog.category || t('blog.uncategorized'),
        tags: blog.tags || '',
        isPublished: blog.isPublished,
      })
      setDraftRestoreDialog({ isOpen: true, draft, blog, isNew: false })
      return
    }

    setCurrentBlog({
      id: blog.id,
      title: blog.title,
      content: blog.content,
      contentJson: blog.contentJson ?? null,
      category: blog.category || t('blog.uncategorized'),
      tags: blog.tags || '',
      isPublished: blog.isPublished,
    })
    setLastSavedAt(null)
  }

  const confirmDeleteBlog = async () => {
    if (!deleteBlogId) return
    try {
      await getDesktopBlogApp().DeleteBlog(deleteBlogId)
      // 若删除的是当前编辑中的文章，回到空选择态
      if (currentBlog?.id === deleteBlogId) {
        setCurrentBlog(null)
        setLastSavedAt(null)
        initialBlogRef.current = null
        // 删除当前编辑项即退出编辑，自动展开左栏
        if (listPaneCollapsed) onToggleListPane?.()
      }
      await fetchBlogs()
      notify(t('admin.notify_log_deleted'))
    } catch (error) {
      notify(t('common.error'), 'error')
      console.error('Failed to delete blog:', error)
    } finally {
      setDeleteBlogId(null)
    }
  }

  const handleSaveBlog = async () => {
    if (isAiTaskLocked || !currentBlog) return
    if (!currentBlog.title.trim()) {
      notify(t('blog.enter_title'), 'error')
      return
    }
    if (!currentBlog.content.trim()) {
      notify(t('blog.enter_content'), 'error')
      return
    }

    setSaving(true)
    try {
      const savedId = currentBlog.id
      await persistDesktopBlog({
        api: getDesktopBlogApp(),
        blogId: currentBlog.id,
        data: {
          title: currentBlog.title,
          content: currentBlog.content,
          contentJson: currentBlog.contentJson ?? null,
          category: currentBlog.category,
          tags: currentBlog.tags,
          isPublished: currentBlog.isPublished,
        },
        onCreated: (blogId) => {
          setCurrentBlog((blog) => (blog ? { ...blog, id: blogId } : blog))
        },
      })
      await clearDraft(savedId || currentBlog.id)

      await fetchBlogs()
      // 保存后保持编辑态：以当前内容重置初始引用，标记为已清洁
      const saved = currentBlog
      initialBlogRef.current = {
        title: saved.title,
        content: saved.content,
        contentJson: saved.contentJson ?? null,
        category: saved.category,
        tags: saved.tags,
        isPublished: saved.isPublished,
      }
      setIsDirty(false)
      notify(t('admin.notify_log_saved'))
    } catch (error) {
      notify(t('common.error'), 'error')
      console.error('Failed to save blog:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleCloseEditor = useCallback(() => {
    flushCurrentDraft()
    setCurrentBlog(null)
    setLastSavedAt(null)
    initialBlogRef.current = null
    setIsDirty(false)
    // 退出编辑时自动展开左栏列表（编辑态可能已收起）
    if (listPaneCollapsed) onToggleListPane?.()
  }, [flushCurrentDraft, listPaneCollapsed, onToggleListPane])

  const handleBlogChange = useCallback((patch: Partial<BlogFormData>) => {
    setCurrentBlog((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  // 从草稿页签跳转并应用博客草稿（对齐叙事 editFromDraft 流程）
  useEffect(() => {
    if (!editBlogFromDraft) return
    setEditorRevision((r) => r + 1)

    queueMicrotask(() => {
      const normalized: BlogFormData = {
        id: editBlogFromDraft.blogId,
        title: editBlogFromDraft.title,
        content: editBlogFromDraft.content,
        contentJson: editBlogFromDraft.contentJson ?? null,
        category: editBlogFromDraft.category || t('blog.uncategorized'),
        tags: editBlogFromDraft.tags || '',
        isPublished: editBlogFromDraft.isPublished,
      }
      initialBlogRef.current = {
        title: normalized.title,
        content: normalized.content,
        contentJson: normalized.contentJson,
        category: normalized.category,
        tags: normalized.tags,
        isPublished: normalized.isPublished,
      }
      setCurrentBlog(normalized)
      setLastSavedAt(editBlogFromDraft.savedAt)
      notify(t('admin.restored_from_draft'), 'info')
      onDraftConsumed?.()
    })
  }, [editBlogFromDraft, notify, onDraftConsumed, t])

  const resolvedCdnDomain = settings?.cdn_domain?.trim() || undefined
  const blogDocumentId = resolveBlogDocumentId(currentBlog?.id, draftDocumentId)

  return (
    <div className={cn('flex h-full min-h-0 overflow-hidden', isImmersiveMode ? 'fixed inset-0 z-[45] h-dvh w-screen gap-3 bg-background p-3 sm:p-4' : 'gap-5')}>
      {/* 左栏：博客列表（可折叠） */}
      <CollapsibleListPane
        collapsed={listPaneCollapsed}
        onToggle={() => onToggleListPane?.()}
        t={t}
        header={subTabNav}
        showCollapsedRail={!currentBlog}
      >
        <BlogListView
          blogs={blogs}
          loading={loading}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          selectedBlogId={currentBlog?.id}
          onCreateBlog={() => void handleCreateBlog()}
          onSelectBlog={(blog) => void handleEditBlog(blog)}
          onRequestDelete={setDeleteBlogId}
          onRefresh={() => void fetchBlogs()}
          t={t}
        />
      </CollapsibleListPane>

      {/* 右栏：编辑器 / 空状态 */}
      <main className="min-w-0 flex-1 overflow-hidden">
        {currentBlog ? (
          <BlogEditorView
            key={`${blogDocumentId}-${editorRevision}`}
            blog={currentBlog}
            onChange={handleBlogChange}
            saving={saving}
            draftSaved={draftSaved}
            lastSavedAt={lastSavedAt}
            isAiTaskLocked={isAiTaskLocked}
            onAiTaskLockChange={setIsAiTaskLocked}
            onSave={() => void handleSaveBlog()}
            onClose={handleCloseEditor}
            photos={photos}
            cdnDomain={resolvedCdnDomain}
            token={token}
            documentId={blogDocumentId}
            t={t}
            notify={notify}
            listPaneCollapsed={listPaneCollapsed}
            onToggleListPane={() => onToggleListPane?.()}
            isImmersiveMode={isImmersiveMode}
            setIsImmersiveMode={setIsImmersiveMode}
          />
        ) : (
          <EditorEmptyState
            icon={BookText}
            title={t('ui.no_blog')}
            hint={t('admin.select_article_hint')}
            actionLabel={t('ui.create_blog')}
            onAction={() => void handleCreateBlog()}
          />
        )}
      </main>

      <SimpleDeleteDialog isOpen={!!deleteBlogId} onConfirm={confirmDeleteBlog} onCancel={() => setDeleteBlogId(null)} t={t} />
      <DraftRestoreDialog
        isOpen={draftRestoreDialog.isOpen}
        draftTime={draftRestoreDialog.draft?.savedAt || 0}
        onRestore={handleDraftRestore}
        onDiscard={handleDraftDiscard}
        onCancel={handleDraftCancel}
        t={t}
      />
    </div>
  )
}
