/**
 * 博客管理（master-detail）：左栏列表 + 右栏编辑器。
 * 选中行即编辑；切换/退出前先落盘草稿（桌面 SQLite/浏览器 IndexedDB 兜底）；
 * 保存后留在编辑态并标记草稿已与云端同步。草稿恢复/删除对话框与自动保存逻辑沿用原实现。
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
  markBlogDraftSynced,
  rekeyBlogDraft,
  type BlogDraftData
} from '@/lib/client-db'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { DraftRestoreDialog } from '@/components/admin/DraftRestoreDialog'
import { BlogListView } from './BlogListView'
import { BlogEditorView, type BlogFormData, type BlogEditorHandle } from './BlogEditorView'
import { BlogPhotoPanel, BLOG_PHOTO_PANEL_COLLAPSED_KEY } from './shared/BlogPhotoPanel'
import { EditorEmptyState } from './shared/EditorEmptyState'
import { CollapsibleListPane } from './shared/CollapsibleListPane'
import { useDirtyLeaveGuard, useSaveShortcut } from './shared/useDirtyLeaveGuard'
import { useImmersiveMode } from './shared/useImmersiveMode'
import { cn } from '@/lib/utils'
import { resolveAssetUrl } from '@/lib/api/core'
import { buildMediaMarkdown, hasPendingMilkdownUploads } from '@mo-gallery/milkdown/media'
import { getMilkdownContent } from '@mo-gallery/milkdown/migration'
import { BookText } from 'lucide-react'

const AUTO_SAVE_DELAY = 2000 // 自动保存防抖延迟（毫秒）

interface BlogTabProps {
  photos: PhotoDto[]
  settings: Record<string, string> | null
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  refreshKey?: number
  createRequestKey?: number
  editBlogFromDraft?: BlogDraftData | null
  editBlogId?: string
  editSource?: 'draft' | 'database'
  onDraftConsumed?: () => void
  listPaneCollapsed?: boolean
  onToggleListPane?: () => void
  subTabNav?: ReactNode
  /** 当前子页签是否可见（沉浸模式仅在编辑器可见时保持） */
  active?: boolean
  isImmersiveMode: boolean
  setIsImmersiveMode: React.Dispatch<React.SetStateAction<boolean>>
}

interface DesktopBlogApp extends DesktopBlogSaveApi {
  GetBlogs: () => Promise<BlogDto[]>
  DeleteBlog: (id: string) => Promise<void>
}

function getDesktopBlogApp() {
  return (window as unknown as { go: { main: { App: DesktopBlogApp } } }).go.main.App
}

function sameBlogContent(left: BlogFormData, right: BlogFormData) {
  return left.title === right.title && left.editorType === right.editorType &&
    left.milkContent === right.milkContent && left.tiptapContent === right.tiptapContent &&
    JSON.stringify(left.tiptapContentJson ?? null) === JSON.stringify(right.tiptapContentJson ?? null) &&
    [...left.contentEditorTypes].sort().join(',') === [...right.contentEditorTypes].sort().join(',') &&
    left.category === right.category && left.tags === right.tags && left.isPublished === right.isPublished
}

export function BlogTab({ photos, settings, t, notify, refreshKey, createRequestKey = 0, editBlogFromDraft, editBlogId, editSource = 'draft', onDraftConsumed, listPaneCollapsed = false, onToggleListPane, subTabNav, active = true, isImmersiveMode, setIsImmersiveMode }: BlogTabProps) {
  const { token } = useAuth()
  const [blogs, setBlogs] = useState<BlogDto[]>([])
  const [loading, setLoading] = useState(true)
  const [currentBlog, setCurrentBlog] = useState<BlogFormData | null>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [isAiTaskLocked, setIsAiTaskLocked] = useState(false)
  const [draftDocumentId, setDraftDocumentId] = useState(createBlogDraftDocumentId)
  const [editorSessionId, setEditorSessionId] = useState<string>(createBlogDraftDocumentId)
  const editorSessionRef = useRef<string>(editorSessionId)
  const draftWritesRef = useRef<Promise<void>>(Promise.resolve())
  const draftCloudIdsRef = useRef(new Map<string, string>())
  const handledCreateRequestRef = useRef(0)
  const startEditorSession = useCallback((id: string) => {
    editorSessionRef.current = id
    setEditorSessionId(id)
  }, [])
  const enqueueDraftWrite = useCallback((operation: () => Promise<void>) => {
    const write = draftWritesRef.current.then(operation)
    draftWritesRef.current = write.catch(() => undefined)
    return write
  }, [])

  // 自动保存状态
  const [draftSaved, setDraftSaved] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const handledEditBlogIdRef = useRef<string | null>(null)

  // 记录初始状态，用于脏检查
  const [isDirty, setIsDirty] = useState(false)
  const initialBlogRef = useRef<BlogFormData | null>(null)

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

  const blogEditorRef = useRef<BlogEditorHandle>(null)
  const [isPhotoPanelCollapsed, setIsPhotoPanelCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(BLOG_PHOTO_PANEL_COLLAPSED_KEY) === 'true'
    } catch {
      return false
    }
  })

  const togglePhotoPanelCollapse = () => {
    setIsPhotoPanelCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(BLOG_PHOTO_PANEL_COLLAPSED_KEY, String(next))
      } catch {
      }
      return next
    })
  }

  const resolvedCdnDomain = settings?.cdn_domain?.trim() || undefined

  const handleInsertPhoto = useCallback((photo: PhotoDto) => {
    if (isAiTaskLocked) return
    const markdown = buildMediaMarkdown({
      kind: 'image',
      src: resolveAssetUrl(photo.url, resolvedCdnDomain),
      title: photo.title,
    })
    blogEditorRef.current?.insertMarkdown(markdown)
    notify(t('admin.notify_photo_inserted'), 'info')
  }, [isAiTaskLocked, resolvedCdnDomain, t, notify])

  // 沉浸全屏/Esc 放在稳定的页签层持有：切换文章时编辑器不再重挂载
  // （内容经 contentVersion 原地重置），若放在编辑器内会反复退/进全屏，表现为页面刷新。
  useImmersiveMode(isImmersiveMode, () => setIsImmersiveMode(false))

  useEffect(() => {
    if (!currentBlog || !active) setIsImmersiveMode(false)
  }, [active, currentBlog, setIsImmersiveMode])

  // 离开保护 + Ctrl+S
  useDirtyLeaveGuard(isDirty && editing, editing)

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

  // 保存草稿到本地存储
  const saveDraft = useCallback(async () => {
    if (!currentBlog) return

    try {
      await enqueueDraftWrite(async () => {
        await saveBlogDraftToDB({
          blogId: draftCloudIdsRef.current.get(editorSessionId) ?? currentBlog.id,
          title: currentBlog.title,
          editorType: currentBlog.editorType,
          contentEditorTypes: currentBlog.contentEditorTypes,
          tiptapContent: currentBlog.tiptapContent,
          tiptapContentJson: currentBlog.tiptapContentJson ?? null,
          milkContent: currentBlog.milkContent ?? null,
          category: currentBlog.category,
          tags: currentBlog.tags,
          isPublished: currentBlog.isPublished,
        })
      })
      setLastSavedAt(Date.now())
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 2000)
    } catch (e) {
      console.error('Failed to save blog draft', e)
    }
  }, [currentBlog, editorSessionId, enqueueDraftWrite])

  // 检查内容是否变更（脏检查）
  useEffect(() => {
    if (!currentBlog || !initialBlogRef.current) {
      setIsDirty(false)
      return
    }

    setIsDirty(!sameBlogContent(currentBlog, initialBlogRef.current))
  }, [currentBlog])

  // 内容变更时自动保存草稿（仅在有修改时）
  useEffect(() => {
    if (isAiTaskLocked || !currentBlog || !isDirty) return

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
  }, [currentBlog?.title, currentBlog?.editorType, currentBlog?.tiptapContent, currentBlog?.tiptapContentJson, currentBlog?.milkContent, currentBlog?.category, currentBlog?.tags, currentBlog?.isPublished, saveDraft, isAiTaskLocked, isDirty])

  // 将草稿应用到当前博客
  const applyDraft = useCallback((draft: BlogDraftData, blogId?: string) => {
    const normalized: BlogFormData = {
      id: blogId,
      title: draft.title,
      editorType: draft.editorType,
      contentEditorTypes: draft.contentEditorTypes,
      tiptapContent: draft.tiptapContent,
      tiptapContentJson: draft.tiptapContentJson ?? null,
      milkContent: draft.milkContent ?? null,
      category: draft.category || t('blog.uncategorized'),
      tags: draft.tags || '',
      isPublished: draft.isPublished,
    }
    setCurrentBlog(normalized)
    setLastSavedAt(draft.savedAt)
    // 更新初始引用以匹配恢复的草稿（不视为脏数据）
    initialBlogRef.current = {
      title: normalized.title,
      editorType: normalized.editorType,
      contentEditorTypes: normalized.contentEditorTypes,
      tiptapContent: normalized.tiptapContent,
      tiptapContentJson: normalized.tiptapContentJson,
      milkContent: normalized.milkContent,
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
        editorType: 'milkdown',
        contentEditorTypes: ['milkdown'],
        tiptapContent: '',
        tiptapContentJson: null,
        milkContent: '',
        category: t('blog.uncategorized'),
        tags: '',
        isPublished: false,
      })
    } else if (draftRestoreDialog.blog) {
      setCurrentBlog({
        id: draftRestoreDialog.blog.id,
        title: draftRestoreDialog.blog.title,
        editorType: draftRestoreDialog.blog.editorType,
        contentEditorTypes: draftRestoreDialog.blog.contentEditorTypes,
        tiptapContent: draftRestoreDialog.blog.tiptapContent,
        tiptapContentJson: draftRestoreDialog.blog.tiptapContentJson ?? null,
        milkContent: draftRestoreDialog.blog.milkContent ?? null,
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

  const handleCreateBlog = useCallback(async () => {
    startEditorSession(createBlogDraftDocumentId())
    setDraftDocumentId(rotateBlogDraftDocumentId)
    flushCurrentDraft()
    // 设置脏检查的初始状态
    initialBlogRef.current = {
      title: '',
      editorType: 'milkdown',
      contentEditorTypes: ['milkdown'],
      tiptapContent: '',
      tiptapContentJson: null,
      milkContent: '',
      category: t('blog.uncategorized'),
      tags: '',
      isPublished: false,
    }

    // 检查是否存在新博客的草稿
    const draft = await loadDraftForBlog(undefined)
    if (draft && !draft.cloudSynced && (draft.title || draft.milkContent || draft.tiptapContent)) {
      // 弹出对话框询问用户是否恢复草稿
      setCurrentBlog({
        title: '',
        editorType: 'milkdown',
        contentEditorTypes: ['milkdown'],
        tiptapContent: '',
        tiptapContentJson: null,
        milkContent: '',
        category: t('blog.uncategorized'),
        tags: '',
        isPublished: false,
      })
      setDraftRestoreDialog({ isOpen: true, draft, blog: null, isNew: true })
      return
    }

    setCurrentBlog({
      title: '',
      editorType: 'milkdown',
      contentEditorTypes: ['milkdown'],
      tiptapContent: '',
      tiptapContentJson: null,
      milkContent: '',
      category: t('blog.uncategorized'),
      tags: '',
      isPublished: false,
    })
  }, [flushCurrentDraft, loadDraftForBlog, startEditorSession, t])

  useEffect(() => {
    if (createRequestKey > 0 && handledCreateRequestRef.current !== createRequestKey) {
      handledCreateRequestRef.current = createRequestKey
      void handleCreateBlog()
    }
  }, [createRequestKey, handleCreateBlog])

  const handleEditBlog = async (blog: BlogDto) => {
    startEditorSession(blog.id)
    flushCurrentDraft()
    // 设置脏检查的初始状态
    initialBlogRef.current = {
      title: blog.title,
      editorType: blog.editorType,
      contentEditorTypes: blog.contentEditorTypes,
      tiptapContent: blog.tiptapContent,
      tiptapContentJson: blog.tiptapContentJson ?? null,
      milkContent: blog.milkContent ?? null,
      category: blog.category || t('blog.uncategorized'),
      tags: blog.tags || '',
      isPublished: blog.isPublished,
    }

    // 检查是否存在该博客的草稿
    const draft = await loadDraftForBlog(blog.id)
    if (draft && !draft.cloudSynced && draft.savedAt > new Date(blog.updatedAt).getTime()) {
      // 草稿比已保存版本更新，弹出对话框
      setCurrentBlog({
        id: blog.id,
        title: blog.title,
        editorType: blog.editorType,
        contentEditorTypes: blog.contentEditorTypes,
        tiptapContent: blog.tiptapContent,
        tiptapContentJson: blog.tiptapContentJson ?? null,
        milkContent: blog.milkContent ?? null,
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
      editorType: blog.editorType,
      contentEditorTypes: blog.contentEditorTypes,
      tiptapContent: blog.tiptapContent,
      tiptapContentJson: blog.tiptapContentJson ?? null,
      milkContent: blog.milkContent ?? null,
      category: blog.category || t('blog.uncategorized'),
      tags: blog.tags || '',
      isPublished: blog.isPublished,
    })
    setLastSavedAt(null)
  }

  useEffect(() => {
    if (!editBlogId) {
      handledEditBlogIdRef.current = null
      return
    }
    const editRequestKey = `${editBlogId}:${editSource}`
    if (handledEditBlogIdRef.current === editRequestKey) return
    const blog = blogs.find((item) => item.id === editBlogId)
    if (!blog) return

    handledEditBlogIdRef.current = editRequestKey
    startEditorSession(blog.id)
    if (editSource === 'database') {
      initialBlogRef.current = {
        title: blog.title,
        editorType: blog.editorType,
        contentEditorTypes: blog.contentEditorTypes,
        tiptapContent: blog.tiptapContent,
        tiptapContentJson: blog.tiptapContentJson ?? null,
        milkContent: blog.milkContent ?? null,
        category: blog.category || t('blog.uncategorized'),
        tags: blog.tags || '',
        isPublished: blog.isPublished,
      }
      setCurrentBlog({ ...initialBlogRef.current, id: blog.id })
      setLastSavedAt(null)
      return
    }

    void loadDraftForBlog(blog.id).then((draft) => {
      if (draft) {
        applyDraft(draft, blog.id)
        return
      }
      initialBlogRef.current = {
        title: blog.title,
        editorType: blog.editorType,
        contentEditorTypes: blog.contentEditorTypes,
        tiptapContent: blog.tiptapContent,
        tiptapContentJson: blog.tiptapContentJson ?? null,
        milkContent: blog.milkContent ?? null,
        category: blog.category || t('blog.uncategorized'),
        tags: blog.tags || '',
        isPublished: blog.isPublished,
      }
      setCurrentBlog({ ...initialBlogRef.current, id: blog.id })
      setLastSavedAt(null)
    })
  }, [applyDraft, blogs, editBlogId, editSource, loadDraftForBlog, startEditorSession, t])

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
    if (savingRef.current || isAiTaskLocked || !currentBlog) return
    if (!currentBlog.title.trim()) {
      notify(t('blog.enter_title'), 'error')
      return
    }
    if (currentBlog.editorType !== 'milkdown' || !currentBlog.contentEditorTypes.includes('milkdown')) {
      notify('请先选择或转换 Milkdown 内容。', 'info')
      return
    }

    if (hasPendingMilkdownUploads(currentBlog.milkContent ?? '')) {
      notify('请等待图片上传完成，或移除未完成的上传卡片。', 'error')
      return
    }

    const snapshot: BlogFormData = { ...currentBlog, milkContent: blogEditorRef.current?.getValue() ?? getMilkdownContent(currentBlog) }
    const savingSessionId = editorSessionId
    savingRef.current = true
    setSaving(true)
    try {
      const saved = await persistDesktopBlog({
        api: getDesktopBlogApp(),
        blogId: draftCloudIdsRef.current.get(savingSessionId) ?? snapshot.id,
        data: {
          title: snapshot.title,
          editorType: 'milkdown',
          milkContent: snapshot.milkContent,
          category: snapshot.category,
          tags: snapshot.tags,
          isPublished: snapshot.isPublished,
        },
      })
      setBlogs((previous) => previous.some((blog) => blog.id === saved.id)
        ? previous.map((blog) => blog.id === saved.id ? saved : blog)
        : [saved, ...previous])
      if (editorSessionRef.current === savingSessionId) {
        initialBlogRef.current = { ...snapshot, id: saved.id, contentEditorTypes: saved.contentEditorTypes }
        setCurrentBlog((blog) => blog ? {
          ...blog,
          id: saved.id,
          contentEditorTypes: saved.contentEditorTypes,
          milkContent: blog.milkContent === currentBlog.milkContent ? snapshot.milkContent : blog.milkContent,
        } : blog)
      }
      let draftSynced = true
      if (editorSessionRef.current === savingSessionId) {
        // Resolve the ID inside queued writes so a pending autosave cannot
        // recreate the old draft key after the first cloud save moves it.
        draftCloudIdsRef.current.set(savingSessionId, saved.id)
        try {
          await enqueueDraftWrite(async () => {
            await rekeyBlogDraft(snapshot.id, saved.id)
            const draft = await getBlogDraftFromDB(saved.id)
            if (draft && sameBlogContent(draft, snapshot)) await markBlogDraftSynced(saved.id, draft.savedAt)
          })
        } catch (error) {
          draftSynced = false
          console.error('Blog saved, but local draft reconciliation failed:', error)
        }
      }
      notify(draftSynced ? t('admin.notify_log_saved') : '文章已保存，但本地草稿同步失败。', draftSynced ? 'success' : 'info')
    } catch (error) {
      notify(t('common.error'), 'error')
      console.error('Failed to save blog:', error)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  useSaveShortcut(() => handleSaveBlog(), editing && !saving && !isAiTaskLocked)

  const handleCloseEditor = useCallback(() => {
    startEditorSession(createBlogDraftDocumentId())
    flushCurrentDraft()
    setCurrentBlog(null)
    setLastSavedAt(null)
    initialBlogRef.current = null
    setIsDirty(false)
    // 退出编辑时自动展开左栏列表（编辑态可能已收起）
    if (listPaneCollapsed) onToggleListPane?.()
  }, [flushCurrentDraft, listPaneCollapsed, onToggleListPane, startEditorSession])

  const handleBlogChange = useCallback((patch: Partial<BlogFormData>) => {
    setCurrentBlog((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  // 从草稿页签跳转并应用博客草稿（对齐叙事 editFromDraft 流程）
  useEffect(() => {
    if (!editBlogFromDraft) return
    setEditorRevision((r) => r + 1)

    queueMicrotask(() => {
      startEditorSession(editBlogFromDraft.id)
      const normalized: BlogFormData = {
        id: editBlogFromDraft.blogId,
        title: editBlogFromDraft.title,
        editorType: editBlogFromDraft.editorType,
        contentEditorTypes: editBlogFromDraft.contentEditorTypes,
        tiptapContent: editBlogFromDraft.tiptapContent,
        tiptapContentJson: editBlogFromDraft.tiptapContentJson ?? null,
        milkContent: editBlogFromDraft.milkContent ?? null,
        category: editBlogFromDraft.category || t('blog.uncategorized'),
        tags: editBlogFromDraft.tags || '',
        isPublished: editBlogFromDraft.isPublished,
      }
      initialBlogRef.current = {
        title: normalized.title,
        editorType: normalized.editorType,
        contentEditorTypes: normalized.contentEditorTypes,
        tiptapContent: normalized.tiptapContent,
        tiptapContentJson: normalized.tiptapContentJson,
        milkContent: normalized.milkContent,
        category: normalized.category,
        tags: normalized.tags,
        isPublished: normalized.isPublished,
      }
      setCurrentBlog(normalized)
      setLastSavedAt(editBlogFromDraft.savedAt)
      notify(t('admin.restored_from_draft'), 'info')
      onDraftConsumed?.()
    })
  }, [editBlogFromDraft, notify, onDraftConsumed, startEditorSession, t])

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

      {/* 右栏：编辑器 + 素材库（无间隙） */}
      <div className="flex min-w-0 flex-1 overflow-hidden">
        <main className="min-w-0 flex-1 overflow-hidden">
          {currentBlog ? (
          <BlogEditorView
            ref={blogEditorRef}
            blog={currentBlog}
            onChange={handleBlogChange}
            editorRevision={editorRevision}
            editorSessionId={editorSessionId}
            saving={saving}
            draftSaved={draftSaved}
            lastSavedAt={lastSavedAt}
            isAiTaskLocked={isAiTaskLocked}
            onAiTaskLockChange={setIsAiTaskLocked}
            onSave={() => void handleSaveBlog()}
            onClose={handleCloseEditor}
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

      {/* 右栏：素材库 - 仅在编辑态显示；分隔线由 BlogPhotoPanel 内部 border-l 提供，不再加 border-l，避免相邻叠加显粗 */}
      {currentBlog ? (
        <aside className="w-[260px] shrink-0 overflow-hidden xl:w-[300px]">
          <BlogPhotoPanel
            photos={photos}
            cdnDomain={resolvedCdnDomain}
            isCollapsed={isPhotoPanelCollapsed}
            onToggleCollapse={togglePhotoPanelCollapse}
            onInsertPhoto={handleInsertPhoto}
            disabled={isAiTaskLocked}
            t={t}
          />
        </aside>
      ) : null}
      </div>

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
