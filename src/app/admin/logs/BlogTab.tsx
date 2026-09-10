/**
 * 博客管理标签页 - 博客文章的创建、编辑、删除及草稿恢复
 */
'use client'

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { EditorContentPrompt } from '@mo-gallery/milkdown/editor-content'
import { convertToMilkdown } from '@mo-gallery/milkdown/migration'
import { hasEditorContent } from '@mo-gallery/api-client/editor-content'
import {
  BookText,
  Plus,
  History,
  FileText,
  Edit3,
  Trash2,
  ChevronLeft,
  Save,
  ImageIcon,
  X,
  Loader2,
  Check,
  Clock,
} from 'lucide-react'
import type { PhotoDto, AdminSettingsDto, ArticleContentDto, BlogDto } from '@/lib/api/types'
import { resolveAssetUrl, ApiUnauthorizedError } from '@/lib/api/core'
import { getAdminBlogs, createBlog, updateBlog, deleteBlog } from '@/lib/api/blogs'
import { buildMediaMarkdown, hasPendingMilkdownUploads } from '@mo-gallery/milkdown/media'
import { getArticlePlainText } from '@/lib/article-content'
import { mergeSavedFields } from '@/lib/article-editor'
import { formatRelativeTimeLabel } from '@/lib/utils'
import { createBlogDraftDocumentId, resolveBlogDocumentId, rotateBlogDraftDocumentId } from '@/lib/blog-draft-document'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { AdminSelect, type SelectOption } from '@/components/admin/AdminFormControls'
import { useAdmin } from '../layout'
import type { NarrativeMilkdownEditorHandle } from '@/components/NarrativeMilkdownEditor'
import {
  saveBlogDraftToDB,
  getBlogDraftFromDB,
  clearBlogDraftFromDB,
  type BlogDraftData
} from '@/lib/client-db'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { DraftRestoreDialog } from '@/components/admin/DraftRestoreDialog'
import { AdminButton } from '@/components/admin/AdminButton'
import { ListSkeleton } from '@/components/admin/Skeleton'

// 动态导入 MilkdownEditor，避免 SSR 问题
const NarrativeMilkdownEditor = dynamic(
  () => import('@/components/NarrativeMilkdownEditor'),
  { 
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center border border-border bg-card/30">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }
)

const AUTO_SAVE_DELAY = 2000 // 自动保存防抖延迟（毫秒）

interface BlogTabProps {
  photos: PhotoDto[]
  settings: AdminSettingsDto | null
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  refreshKey?: number
}

interface BlogFormData extends ArticleContentDto {
  id?: string
  title: string
  category: string
  tags: string
  isPublished: boolean
}

const BLOG_FORM_FIELDS: readonly (keyof BlogFormData)[] = ['title', 'editorType', 'contentEditorTypes', 'tiptapContent', 'tiptapContentJson', 'milkContent', 'category', 'tags', 'isPublished']
const blogFormChanged = (left: BlogFormData, right: BlogFormData) => BLOG_FORM_FIELDS.some((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]))

function createEmptyBlog(category: string): BlogFormData {
  return {
    title: '',
    editorType: 'milkdown',
    contentEditorTypes: ['milkdown'],
    tiptapContent: '',
    tiptapContentJson: null,
    milkContent: '',
    category,
    tags: '',
    isPublished: false,
  }
}

export function BlogTab({ photos, settings, t, notify, refreshKey }: BlogTabProps) {
  const { token } = useAuth()
  const { locale } = useLanguage()
  const { handleUnauthorized } = useAdmin()
  const [blogs, setBlogs] = useState<BlogDto[]>([])
  const [loading, setLoading] = useState(true)
  const [currentBlog, setCurrentBlog] = useState<BlogFormData | null>(null)
  const currentBlogRef = useRef<BlogFormData | null>(null)
  const blogSessionRef = useRef(0)
  const savingRef = useRef(false)
  useLayoutEffect(() => { currentBlogRef.current = currentBlog }, [currentBlog])
  const [editMode, setEditMode] = useState<'list' | 'editor'>('list')
  const [isInsertingPhoto, setIsInsertingPhoto] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isAiTaskLocked, setIsAiTaskLocked] = useState(false)
  const [draftDocumentId, setDraftDocumentId] = useState(createBlogDraftDocumentId)
  const editorRef = useRef<NarrativeMilkdownEditorHandle>(null)
  
  // 自动保存状态
  const [draftSaved, setDraftSaved] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  
  // 记录初始状态，用于脏检查
  const [isDirty, setIsDirty] = useState(false)
  const initialBlogRef = useRef<BlogFormData | null>(null)
  
  // 删除确认对话框状态
  const [deleteBlogId, setDeleteBlogId] = useState<string | null>(null)
  
  // 发布状态筛选
  const [statusFilter, setStatusFilter] = useState('')
  
  // 草稿恢复对话框状态
  const [draftRestoreDialog, setDraftRestoreDialog] = useState<{
    isOpen: boolean
    draft: BlogDraftData | null
    blog: BlogDto | null
    isNew: boolean
  }>({ isOpen: false, draft: null, blog: null, isNew: false })

  const hasMilkdownContent = !!currentBlog && hasEditorContent(currentBlog, 'milkdown')
  const isMilkdownReady = hasMilkdownContent && currentBlog?.editorType === 'milkdown'

  const activateMilkdown = () => {
    setCurrentBlog((previous) => {
      if (!previous) return previous
      if (!hasEditorContent(previous, 'milkdown') && !hasEditorContent(previous, 'tiptap')) return previous
      return {
        ...previous,
        editorType: 'milkdown',
        contentEditorTypes: Array.from(new Set<ArticleContentDto['editorType']>([...previous.contentEditorTypes, 'milkdown'])),
        milkContent: hasEditorContent(previous, 'milkdown') ? previous.milkContent ?? '' : convertToMilkdown(previous),
      }
    })
  }

  const fetchBlogs = useCallback(async () => {
    if (!token) {
      setBlogs([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const data = await getAdminBlogs(token)
      setBlogs(data)
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized(error)
        return
      }
      notify(t('common.error'), 'error')
      console.error('Failed to fetch blogs:', error)
    } finally {
      setLoading(false)
    }
  }, [handleUnauthorized, notify, t, token])
  
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

    try {
      await saveBlogDraftToDB({
        blogId: currentBlog.id,
        title: currentBlog.title,
        editorType: currentBlog.editorType,
        contentEditorTypes: currentBlog.contentEditorTypes,
        tiptapContent: currentBlog.tiptapContent,
        tiptapContentJson: currentBlog.tiptapContentJson ?? null,
        milkContent: currentBlog.milkContent,
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

  // 格式化相对时间
  const formatRelativeTime = useMemo(() => {
    if (!lastSavedAt) return null
    return formatRelativeTimeLabel(lastSavedAt, t)
  }, [lastSavedAt, t])

  // 检查内容是否变更（脏检查）
  useEffect(() => {
    if (editMode !== 'editor' || !currentBlog || !initialBlogRef.current) {
      setIsDirty(false)
      return
    }
    
    const initial = initialBlogRef.current
    const hasChanged =
      currentBlog.title !== initial.title ||
      currentBlog.editorType !== initial.editorType ||
      currentBlog.tiptapContent !== initial.tiptapContent ||
      currentBlog.milkContent !== initial.milkContent ||
      JSON.stringify(currentBlog.tiptapContentJson ?? null) !== JSON.stringify(initial.tiptapContentJson ?? null) ||
      JSON.stringify(currentBlog.contentEditorTypes) !== JSON.stringify(initial.contentEditorTypes) ||
      currentBlog.category !== initial.category ||
      currentBlog.tags !== initial.tags ||
      currentBlog.isPublished !== initial.isPublished
    
    setIsDirty(hasChanged)
  }, [editMode, currentBlog])

  // 内容变更时自动保存草稿（仅在有修改时）
  useEffect(() => {
    if (saving || isAiTaskLocked || !currentBlog || !isDirty) return

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
  }, [currentBlog, saveDraft, isAiTaskLocked, isDirty, saving])

  // 将草稿应用到当前博客
  const applyDraft = useCallback((draft: BlogDraftData, blogId?: string) => {
    const restoredBlog: BlogFormData = {
      ...draft,
      id: blogId,
      category: draft.category ?? t('blog.uncategorized'),
      tags: draft.tags ?? '',
    }
    setCurrentBlog(restoredBlog)
    setLastSavedAt(draft.savedAt)
    // 更新初始引用以匹配恢复的草稿（不视为脏数据）
    initialBlogRef.current = restoredBlog
    notify(t('admin.restored_from_draft'), 'info')
  }, [t, notify])

  // 草稿恢复对话框 - 确认恢复
  const handleDraftRestore = useCallback(() => {
    if (draftRestoreDialog.draft) {
      applyDraft(draftRestoreDialog.draft, draftRestoreDialog.blog?.id)
    }
    setDraftRestoreDialog({ isOpen: false, draft: null, blog: null, isNew: false })
    setEditMode('editor')
  }, [draftRestoreDialog, applyDraft])

  // 草稿恢复对话框 - 丢弃草稿
  const handleDraftDiscard = useCallback(() => {
    if (draftRestoreDialog.isNew) {
      setCurrentBlog(createEmptyBlog(t('blog.uncategorized')))
    } else if (draftRestoreDialog.blog) {
      setCurrentBlog({
        ...draftRestoreDialog.blog,
        category: draftRestoreDialog.blog.category ?? t('blog.uncategorized'),
        tags: draftRestoreDialog.blog.tags ?? '',
      })
    }
    setLastSavedAt(null)
    setDraftRestoreDialog({ isOpen: false, draft: null, blog: null, isNew: false })
    setEditMode('editor')
  }, [draftRestoreDialog, t])

  // 草稿恢复对话框 - 取消（关闭不操作）
  const handleDraftCancel = useCallback(() => {
    setDraftRestoreDialog({ isOpen: false, draft: null, blog: null, isNew: false })
    setCurrentBlog(null)
  }, [])

  const handleCreateBlog = async () => {
    blogSessionRef.current += 1
    setDraftDocumentId(rotateBlogDraftDocumentId)
    // 设置脏检查的初始状态
    initialBlogRef.current = createEmptyBlog(t('blog.uncategorized'))
    
    // 检查是否存在新博客的草稿
    const draft = await loadDraftForBlog(undefined)
    if (draft) {
      // 弹出对话框询问用户是否恢复草稿
      setCurrentBlog(createEmptyBlog(t('blog.uncategorized')))
      setDraftRestoreDialog({ isOpen: true, draft, blog: null, isNew: true })
      return
    }
    
    setCurrentBlog(createEmptyBlog(t('blog.uncategorized')))
    setEditMode('editor')
  }

  const handleEditBlog = async (blog: BlogDto) => {
    blogSessionRef.current += 1
    setDraftDocumentId(blog.id)
    // 设置脏检查的初始状态
    initialBlogRef.current = {
      ...blog,
      category: blog.category ?? t('blog.uncategorized'),
      tags: blog.tags ?? '',
    }
    
    // 检查是否存在该博客的草稿
    const draft = await loadDraftForBlog(blog.id)
    if (draft && draft.savedAt > new Date(blog.updatedAt).getTime()) {
      // 草稿比已保存版本更新，弹出对话框
      setCurrentBlog({
        ...blog,
        category: blog.category ?? t('blog.uncategorized'),
        tags: blog.tags ?? '',
      })
      setDraftRestoreDialog({ isOpen: true, draft, blog, isNew: false })
      return
    }
    
    setCurrentBlog({
      ...blog,
      category: blog.category ?? t('blog.uncategorized'),
      tags: blog.tags ?? '',
    })
    setLastSavedAt(null)
    setEditMode('editor')
  }

  const confirmDeleteBlog = async () => {
    if (!token || !deleteBlogId) return
    try {
      await deleteBlog(token, deleteBlogId)
      await fetchBlogs()
      notify(t('admin.notify_log_deleted'))
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized(error)
        return
      }
      notify(t('common.error'), 'error')
      console.error('Failed to delete blog:', error)
    } finally {
      setDeleteBlogId(null)
    }
  }

  const handleSaveBlog = async () => {
    if (isAiTaskLocked || !currentBlog || !token || !isMilkdownReady) return
    if (savingRef.current) return
    if (!currentBlog.title.trim()) {
      notify(t('blog.enter_title'), 'error')
      return
    }
    if (hasPendingMilkdownUploads(currentBlog.milkContent ?? '')) {
      notify(t('admin.uploading'), 'info')
      return
    }
    const submitted: BlogFormData = { ...currentBlog, milkContent: editorRef.current?.getValue() ?? currentBlog.milkContent ?? '' }
    const session = blogSessionRef.current
    savingRef.current = true
    setSaving(true)
    try {
      const payload = {
        title: submitted.title,
        editorType: 'milkdown' as const,
        milkContent: submitted.milkContent ?? '',
        category: submitted.category,
        tags: submitted.tags,
        isPublished: submitted.isPublished,
      }
      const saved = submitted.id ? await updateBlog(token, submitted.id, payload) : await createBlog(token, payload)
      setBlogs((previous) => previous.some((blog) => blog.id === saved.id) ? previous.map((blog) => blog.id === saved.id ? saved : blog) : [saved, ...previous])
      if (blogSessionRef.current !== session) return

      const savedForm: BlogFormData = { ...saved, category: saved.category ?? '', tags: saved.tags ?? '' }
      initialBlogRef.current = savedForm
      setCurrentBlog((previous) => previous ? { ...mergeSavedFields(previous, submitted, savedForm, BLOG_FORM_FIELDS), id: saved.id } : previous)
      await clearBlogDraftFromDB(submitted.id)
      if (blogSessionRef.current !== session) return
      const latest = currentBlogRef.current
      if (latest && blogFormChanged(latest, savedForm)) {
        await saveBlogDraftToDB({ ...latest, blogId: saved.id })
      }
      setLastSavedAt(new Date(saved.updatedAt).getTime())
      setDraftSaved(true)
      window.setTimeout(() => setDraftSaved(false), 2000)
      notify(t('admin.notify_log_saved'))
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized(error)
        return
      }
      notify(t('common.error'), 'error')
      console.error('Failed to save blog:', error)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const insertPhotoIntoBlog = (photo: PhotoDto) => {
    if (isAiTaskLocked || !isMilkdownReady) return
    const markdown = buildMediaMarkdown({
      kind: 'image',
      src: photo.url ?? undefined,
      title: photo.title,
      photoId: photo.id,
    })
    if (editorRef.current) {
      editorRef.current.insertMarkdown(markdown)
      const nextValue = editorRef.current.getValue()
      setCurrentBlog((prev) => (prev ? { ...prev, milkContent: nextValue } : prev))
    } else if (currentBlog) {
      setCurrentBlog({ ...currentBlog, milkContent: (currentBlog.milkContent ?? '') + markdown })
    }
    setIsInsertingPhoto(false)
    notify(t('admin.notify_photo_inserted'), 'info')
  }

  const handleContentChange = (milkContent: string) => {
    setCurrentBlog((prev) => (prev ? { ...prev, milkContent } : prev))
  }

  const resolvedCdnDomain = settings?.cdn_domain?.trim() || undefined
  const blogDocumentId = resolveBlogDocumentId(currentBlog?.id, draftDocumentId)


  // 博客发布状态筛选选项
  const statusOptions: SelectOption[] = [
    { value: '', label: t('admin.all_status') || '全部状态' },
    { value: 'published', label: t('admin.published') || '已发布' },
    { value: 'draft', label: t('admin.draft') || '草稿' },
  ]

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      {editMode === 'list' ? (
        <div className="space-y-8 flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border pb-4 flex-shrink-0">
            <div className="flex items-center gap-4">
              <input
                type="text"
                placeholder={t('admin.search_placeholder') || '搜索...'}
                className="px-3 py-2 text-sm bg-transparent border border-border rounded-md focus:border-primary outline-none w-48"
              />
              <AdminSelect
                value={statusFilter}
                options={statusOptions}
                onChange={setStatusFilter}
                placeholder={t('admin.all_status') || '全部状态'}
                className="w-32"
              />
            </div>
            <AdminButton
              onClick={handleCreateBlog}
              adminVariant="primary"
              size="lg"
              className="flex items-center rounded-md"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('ui.create_blog')}
            </AdminButton>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="p-6"><ListSkeleton count={5} /></div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
              {blogs
                .filter((blog) => {
                  if (!statusFilter) return true
                  if (statusFilter === 'published') return blog.isPublished
                  if (statusFilter === 'draft') return !blog.isPublished
                  return true
                })
                .map((blog) => (
                <div
                  key={blog.id}
                  className="flex items-center justify-between p-6 border border-border hover:border-primary transition-all group"
                >
                  <div
                    className="flex-1 min-w-0"
                    onClick={() => handleEditBlog(blog)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="font-serif text-xl group-hover:text-primary transition-colors">
                        {blog.title || t('admin.untitled')}
                      </h4>
                      <span
                        className={`text-[8px] font-black uppercase px-1.5 py-0.5 border ${
                          blog.isPublished
                            ? 'border-primary text-primary'
                            : 'border-muted-foreground text-muted-foreground'
                        }`}
                      >
                        {blog.isPublished ? 'published' : 'draft'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono uppercase">
                      <span className="flex items-center gap-1">
                        <History className="w-3 h-3" />{' '}
                        {new Date(blog.updatedAt).toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {getArticlePlainText(blog).length}{' '}
                        {t('admin.characters')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <AdminButton
                      onClick={() => handleEditBlog(blog)}
                      adminVariant="iconPrimary"
                    >
                      <Edit3 className="w-4 h-4" />
                    </AdminButton>
                    <AdminButton
                      onClick={() => setDeleteBlogId(blog.id)}
                      adminVariant="iconDestructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </AdminButton>
                  </div>
                </div>
              ))}
              {blogs.length === 0 && (
                <div className="py-24 text-center border border-dashed border-border">
                  <BookText className="w-12 h-12 mx-auto mb-4 opacity-10" />
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {t('ui.no_blog')}
                  </p>
                </div>
              )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border pb-4 flex-shrink-0">
            <div className="flex items-center gap-4">
              <AdminButton
                onClick={() => {
                  setEditMode('list')
                  setCurrentBlog(null)
                  setLastSavedAt(null)
                  initialBlogRef.current = null
                  setIsDirty(false)
                }}
                disabled={isAiTaskLocked}
                adminVariant="link"
                className="flex items-center gap-2 hover:no-underline"
              >
                <ChevronLeft className="w-4 h-4" /> {t('admin.back_list')}
              </AdminButton>
              {/* 草稿状态指示器 */}
              {draftSaved && (
                <div className="flex items-center gap-1 text-[10px] text-green-500">
                  <Check className="w-3 h-3" />
                  <span>{t('story.draft_saved') || '已保存'}</span>
                </div>
              )}
              {!draftSaved && lastSavedAt && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                  <Clock className="w-3 h-3" />
                  <span>{formatRelativeTime}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  disabled={isAiTaskLocked}
                  checked={currentBlog?.isPublished || false}
                  onChange={(e) =>
                    setCurrentBlog((prev) => ({
                      ...prev!,
                      isPublished: e.target.checked,
                    }))
                  }
                  className="w-4 h-4"
                />
                <span className="font-bold uppercase tracking-widest">{t('admin.publish')}</span>
              </label>
              <AdminButton
                onClick={handleSaveBlog}
                disabled={saving || isAiTaskLocked || !isMilkdownReady}
                adminVariant="primary"
                size="lg"
                className="flex items-center gap-2"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{t('admin.save')}</span>
              </AdminButton>
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-4 overflow-hidden relative">
            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
              <input
                type="text"
                disabled={isAiTaskLocked}
                value={currentBlog?.title || ''}
                onChange={(e) =>
                  setCurrentBlog((prev) => ({
                    ...prev!,
                    title: e.target.value,
                  }))
                }
                placeholder={t('blog.title_placeholder')}
                className="w-full p-6 bg-transparent border border-border focus:border-primary outline-none text-2xl font-serif rounded-none"
              />
              <div className="flex gap-4">
                <input
                  type="text"
                  disabled={isAiTaskLocked}
                  value={currentBlog?.category || ''}
                  onChange={(e) =>
                    setCurrentBlog((prev) => ({
                      ...prev!,
                      category: e.target.value,
                    }))
                  }
                  placeholder={t('ui.category_filter')}
                  className="flex-1 p-3 bg-transparent border border-border focus:border-primary outline-none text-sm rounded-none"
                />
                <input
                  type="text"
                  disabled={isAiTaskLocked}
                  value={currentBlog?.tags || ''}
                  onChange={(e) =>
                    setCurrentBlog((prev) => ({
                      ...prev!,
                      tags: e.target.value,
                    }))
                  }
                  placeholder="Tags"
                  className="flex-1 p-3 bg-transparent border border-border focus:border-primary outline-none text-sm rounded-none"
                />
              </div>
              <div className="flex-1 relative border border-border bg-card/30 overflow-visible">
                {currentBlog && !isMilkdownReady ? (
                  <EditorContentPrompt language={locale} targetEditor="Milkdown" sourceEditor="TipTap" scenario={hasMilkdownContent ? 'use-existing' : hasEditorContent(currentBlog, 'tiptap') ? 'convert' : 'unavailable'} onAction={activateMilkdown} />
                ) : currentBlog ? (
                  <NarrativeMilkdownEditor
                    contentVersion={draftDocumentId}
                    ref={editorRef}
                    value={currentBlog.milkContent ?? ''}
                    onChange={handleContentChange}
                    className="overflow-hidden bg-background"
                    token={token}
                    documentId={blogDocumentId}
                    documentTitle={currentBlog.title}
                    photos={photos}
                    cdnDomain={resolvedCdnDomain}
                    onBusyChange={setIsAiTaskLocked}
                    onError={(error) => notify(error.message, 'error')}
                  />
                ) : null}
                <AdminButton
                  onClick={() => setIsInsertingPhoto(true)}
                  disabled={isAiTaskLocked || !isMilkdownReady}
                  adminVariant="unstyled"
                  className="absolute bottom-6 right-6 p-4 bg-background border border-border hover:border-primary text-primary transition-all shadow-2xl z-10"
                  title={t('blog.insert_photo')}
                >
                  <ImageIcon className="w-6 h-6" />
                </AdminButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 插入照片弹窗 */}
      {isInsertingPhoto && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-12 bg-background/95 backdrop-blur-sm">
          <div className="w-full h-full max-w-6xl bg-background border border-border flex flex-col overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="font-serif text-2xl uppercase tracking-tight">
                {t('blog.insert_photo')}
              </h3>
              <AdminButton
                onClick={() => setIsInsertingPhoto(false)}
                adminVariant="icon"
              >
                <X className="w-6 h-6" />
              </AdminButton>
            </div>
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    onClick={() => insertPhotoIntoBlog(photo)}
                    className="group relative aspect-square bg-muted cursor-pointer overflow-hidden border border-transparent hover:border-primary transition-all"
                  >
                    <img
                      src={resolveAssetUrl(
                        photo.thumbnailUrl || photo.url,
                        resolvedCdnDomain
                      )}
                      alt=""
                      className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all"
                    />
                    <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Plus className="w-8 h-8 text-white" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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
