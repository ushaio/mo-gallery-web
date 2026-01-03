'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
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
import {
  PhotoDto,
  resolveAssetUrl,
  PublicSettingsDto,
  BlogDto,
  getAdminBlogs,
  createBlog,
  updateBlog,
  deleteBlog,
  ApiUnauthorizedError
} from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import type { MilkdownEditorHandle } from '@/components/MilkdownEditor'
import {
  saveBlogDraftToDB,
  getBlogDraftFromDB,
  clearBlogDraftFromDB,
  getAllBlogDraftsFromDB,
  type BlogDraftData
} from '@/lib/client-db'

// Dynamically import MilkdownEditor to avoid SSR issues
const MilkdownEditor = dynamic(
  () => import('@/components/MilkdownEditor'),
  { 
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center border border-border bg-card/30">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }
)

const AUTO_SAVE_DELAY = 2000 // 2 seconds debounce

interface BlogTabProps {
  photos: PhotoDto[]
  settings: PublicSettingsDto | null
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
}

interface BlogFormData {
  id?: string
  title: string
  content: string
  category: string
  tags: string
  isPublished: boolean
}

export function BlogTab({ photos, settings, t, notify }: BlogTabProps) {
  const { token, logout } = useAuth()
  const router = useRouter()
  const [blogs, setBlogs] = useState<BlogDto[]>([])
  const [loading, setLoading] = useState(true)
  const [currentBlog, setCurrentBlog] = useState<BlogFormData | null>(null)
  const [editMode, setEditMode] = useState<'list' | 'editor'>('list')
  const [isInsertingPhoto, setIsInsertingPhoto] = useState(false)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<MilkdownEditorHandle>(null)
  
  // Auto-save state
  const [draftSaved, setDraftSaved] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)

  const handleUnauthorized = () => {
    logout()
    router.push('/login')
  }

  const fetchBlogs = async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await getAdminBlogs(token)
      setBlogs(data)
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized()
        return
      }
      notify(t('common.error'), 'error')
      console.error('Failed to fetch blogs:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBlogs()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load draft when entering editor mode
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

  // Save draft to IndexedDB
  const saveDraft = useCallback(async () => {
    if (!currentBlog) return
    if (!currentBlog.title && !currentBlog.content) return

    try {
      await saveBlogDraftToDB({
        blogId: currentBlog.id,
        title: currentBlog.title,
        content: currentBlog.content,
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

  // Clear draft from IndexedDB
  const clearDraft = useCallback(async (blogId?: string) => {
    try {
      await clearBlogDraftFromDB(blogId)
      setLastSavedAt(null)
    } catch (e) {
      console.error('Failed to clear blog draft', e)
    }
  }, [])

  // Format relative time
  const formatRelativeTime = useMemo(() => {
    if (!lastSavedAt) return null
    const diff = Date.now() - lastSavedAt
    if (diff < 60000) return t('story.draft_just_now') || '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} ${t('story.draft_minutes_ago') || '分钟前'}`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ${t('story.draft_hours_ago') || '小时前'}`
    return new Date(lastSavedAt).toLocaleDateString()
  }, [lastSavedAt, t])

  // Auto-save draft when content changes
  useEffect(() => {
    if (!currentBlog) return
    if (!currentBlog.title && !currentBlog.content) return

    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    // Set new timer for auto-save
    autoSaveTimerRef.current = setTimeout(() => {
      saveDraft()
    }, AUTO_SAVE_DELAY)

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [currentBlog?.title, currentBlog?.content, currentBlog?.category, currentBlog?.tags, currentBlog?.isPublished, saveDraft])

  const handleCreateBlog = async () => {
    // Check for existing draft for new blog
    const draft = await loadDraftForBlog(undefined)
    if (draft) {
      setCurrentBlog({
        title: draft.title,
        content: draft.content,
        category: draft.category || t('blog.uncategorized'),
        tags: draft.tags || '',
        isPublished: draft.isPublished,
      })
      if (draft.title || draft.content) {
        notify(t('story.draft_restored') || '已恢复草稿', 'info')
      }
    } else {
      setCurrentBlog({
        title: '',
        content: '',
        category: t('blog.uncategorized'),
        tags: '',
        isPublished: false,
      })
    }
    setEditMode('editor')
  }

  const handleEditBlog = async (blog: BlogDto) => {
    // Check for existing draft for this blog
    const draft = await loadDraftForBlog(blog.id)
    if (draft && draft.savedAt > new Date(blog.updatedAt).getTime()) {
      // Draft is newer than saved version
      setCurrentBlog({
        id: blog.id,
        title: draft.title,
        content: draft.content,
        category: draft.category || t('blog.uncategorized'),
        tags: draft.tags || '',
        isPublished: draft.isPublished,
      })
      notify(t('story.draft_restored') || '已恢复草稿', 'info')
    } else {
      setCurrentBlog({
        id: blog.id,
        title: blog.title,
        content: blog.content,
        category: blog.category || t('blog.uncategorized'),
        tags: blog.tags || '',
        isPublished: blog.isPublished,
      })
      setLastSavedAt(null)
    }
    setEditMode('editor')
  }

  const handleDeleteBlog = async (id: string) => {
    if (!token) return
    if (!window.confirm(t('common.confirm') + '?')) return

    try {
      await deleteBlog(token, id)
      await fetchBlogs()
      notify(t('admin.notify_log_deleted'))
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized()
        return
      }
      notify(t('common.error'), 'error')
      console.error('Failed to delete blog:', error)
    }
  }

  const handleSaveBlog = async () => {
    if (!currentBlog || !token) return
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
      if (currentBlog.id) {
        // Update existing blog
        await updateBlog(token, currentBlog.id, {
          title: currentBlog.title,
          content: currentBlog.content,
          category: currentBlog.category,
          tags: currentBlog.tags,
          isPublished: currentBlog.isPublished,
        })
      } else {
        // Create new blog
        await createBlog(token, {
          title: currentBlog.title,
          content: currentBlog.content,
          category: currentBlog.category,
          tags: currentBlog.tags,
          isPublished: currentBlog.isPublished,
        })
      }
      // Clear draft after successful save
      await clearDraft(currentBlog.id)
      
      await fetchBlogs()
      setEditMode('list')
      setCurrentBlog(null)
      setLastSavedAt(null)
      notify(t('admin.notify_log_saved'))
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized()
        return
      }
      notify(t('common.error'), 'error')
      console.error('Failed to save blog:', error)
    } finally {
      setSaving(false)
    }
  }

  const insertPhotoIntoBlog = (photo: PhotoDto) => {
    const markdown = `\n![${photo.title}](${resolveAssetUrl(
      photo.url,
      settings?.cdn_domain
    )})\n`
    if (currentBlog) {
      setCurrentBlog({ ...currentBlog, content: currentBlog.content + markdown })
    }
    setIsInsertingPhoto(false)
    notify(t('admin.notify_photo_inserted'), 'info')
  }

  const handleContentChange = (content: string) => {
    if (currentBlog) {
      setCurrentBlog({ ...currentBlog, content })
    }
  }

  const resolvedCdnDomain = settings?.cdn_domain?.trim() || undefined

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      {editMode === 'list' ? (
        <div className="space-y-8 flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border pb-4 flex-shrink-0">
            <div className="flex items-center gap-4">
              <BookText className="w-6 h-6 text-primary" />
              <h3 className="font-serif text-2xl uppercase tracking-tight">
                {t('nav.logs')}
              </h3>
            </div>
            <button
              onClick={handleCreateBlog}
              className="flex items-center px-6 py-2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('ui.create_blog')}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-1 gap-4">
              {blogs.map((blog) => (
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
                        {new Date(blog.updatedAt).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {blog.content.length}{' '}
                        {t('admin.characters')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEditBlog(blog)}
                      className="p-2 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteBlog(blog.id)}
                      className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border pb-4 flex-shrink-0">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setEditMode('list')
                  setCurrentBlog(null)
                  setLastSavedAt(null)
                }}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest hover:text-primary transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> {t('admin.back_list')}
              </button>
              {/* Draft Status Indicator */}
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
              <button
                onClick={handleSaveBlog}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{t('admin.save')}</span>
              </button>
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-4 overflow-hidden relative">
            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
              <input
                type="text"
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
                {currentBlog && (
                  <MilkdownEditor
                    key={currentBlog.id || 'new'}
                    ref={editorRef}
                    value={currentBlog.content}
                    onChange={handleContentChange}
                    placeholder={t('ui.markdown_placeholder')}
                  />
                )}
                <button
                  onClick={() => setIsInsertingPhoto(true)}
                  className="absolute bottom-6 right-6 p-4 bg-background border border-border hover:border-primary text-primary transition-all shadow-2xl z-10"
                  title={t('blog.insert_photo')}
                >
                  <ImageIcon className="w-6 h-6" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo Selection Modal */}
      {isInsertingPhoto && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-12 bg-background/95 backdrop-blur-sm">
          <div className="w-full h-full max-w-6xl bg-background border border-border flex flex-col overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="font-serif text-2xl uppercase tracking-tight">
                {t('blog.insert_photo')}
              </h3>
              <button
                onClick={() => setIsInsertingPhoto(false)}
                className="p-2 hover:bg-muted"
              >
                <X className="w-6 h-6" />
              </button>
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
    </div>
  )
}
