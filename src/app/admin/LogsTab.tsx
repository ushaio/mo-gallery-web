'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { BookText, BookOpen, FileArchive, Clock, Trash2, Eye, X, Image as ImageIcon, Edit3, ArrowRight } from 'lucide-react'
import { PhotoDto, AdminSettingsDto } from '@/lib/api'
import { BlogTab } from './BlogTab'
import { StoriesTab } from './StoriesTab'
import { CustomSelect, type SelectOption } from '@/components/ui/CustomSelect'
import {
  getAllDraftsFromDB,
  clearDraftFromDB,
  clearBlogDraftFromDB,
  clearStoryEditorDraftFromDB,
  clearAllDraftsFromDB,
  type StoryDraftData,
  type BlogDraftData,
  type StoryEditorDraftData
} from '@/lib/client-db'
import { motion, AnimatePresence } from 'framer-motion'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'

// Extended type with preview URLs for display
interface StoryDraftWithPreviews extends Omit<StoryDraftData, 'files'> {
  files: { id: string; file: File; preview: string }[]
}

interface LogsTabProps {
  token: string | null
  photos: PhotoDto[]
  settings: AdminSettingsDto | null
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  initialTab?: 'blog' | 'stories' | 'drafts'
  editStoryId?: string
}

export function LogsTab({ token, photos, settings, t, notify, initialTab, editStoryId }: LogsTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'blog' | 'stories' | 'drafts'>(initialTab || 'stories')
  
  // Drafts state - use extended type with preview URLs
  const [storyDraft, setStoryDraft] = useState<StoryDraftWithPreviews | null>(null)
  const [blogDrafts, setBlogDrafts] = useState<BlogDraftData[]>([])
  const [storyEditorDrafts, setStoryEditorDrafts] = useState<StoryEditorDraftData[]>([])
  const [loadingDrafts, setLoadingDrafts] = useState(false)
  const [selectedDraft, setSelectedDraft] = useState<StoryDraftWithPreviews | BlogDraftData | StoryEditorDraftData | null>(null)
  
  // State for editing story from draft
  const [editFromDraft, setEditFromDraft] = useState<StoryEditorDraftData | null>(null)
  
  // Delete dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean
    type: 'story' | 'blog' | 'storyEditor' | 'all'
    id?: string
  }>({ isOpen: false, type: 'story' })
  
  // Keep track of preview URLs for cleanup
  const previewUrlsRef = useRef<string[]>([])
  
  // Track last click for double-click refresh
  const lastClickRef = useRef<{ tab: string; time: number }>({ tab: '', time: 0 })
  const [storiesRefreshKey, setStoriesRefreshKey] = useState(0)
  const [blogRefreshKey, setBlogRefreshKey] = useState(0)
  
  // Filter state for drafts
  const [draftTypeFilter, setDraftTypeFilter] = useState('')
  const [draftSearchQuery, setDraftSearchQuery] = useState('')
  
  // Load drafts every time switching to drafts tab
  useEffect(() => {
    if (activeSubTab === 'drafts') {
      loadDrafts()
    }
  }, [activeSubTab])

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
    }
  }, [])

  async function loadDrafts() {
    setLoadingDrafts(true)
    
    // Cleanup old preview URLs
    previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
    previewUrlsRef.current = []
    
    try {
      const { storyDraft: rawStoryDraft, blogDrafts, storyEditorDrafts } = await getAllDraftsFromDB()
      
      // Process story draft: generate preview URLs for files
      if (rawStoryDraft && rawStoryDraft.files && rawStoryDraft.files.length > 0) {
        const filesWithPreviews = rawStoryDraft.files.map(f => {
          let preview = ''
          if (f.file instanceof File) {
            try {
              preview = URL.createObjectURL(f.file)
              previewUrlsRef.current.push(preview)
            } catch (e) {
              console.error('Failed to create object URL:', e)
            }
          }
          return { id: f.id, file: f.file, preview }
        })
        
        setStoryDraft({
          ...rawStoryDraft,
          files: filesWithPreviews
        })
      } else if (rawStoryDraft) {
        setStoryDraft({
          ...rawStoryDraft,
          files: []
        })
      } else {
        setStoryDraft(null)
      }
      
      setBlogDrafts(blogDrafts)
      setStoryEditorDrafts(storyEditorDrafts)
    } catch (err) {
      console.error('Failed to load drafts:', err)
    } finally {
      setLoadingDrafts(false)
    }
  }

  async function confirmDelete() {
    try {
      if (deleteDialog.type === 'all') {
        await clearAllDraftsFromDB()
        setStoryDraft(null)
        setBlogDrafts([])
        setStoryEditorDrafts([])
      } else if (deleteDialog.type === 'story') {
        await clearDraftFromDB()
        setStoryDraft(null)
      } else if (deleteDialog.type === 'blog') {
        await clearBlogDraftFromDB(deleteDialog.id)
        setBlogDrafts(prev => prev.filter(d => d.blogId !== deleteDialog.id))
      } else if (deleteDialog.type === 'storyEditor') {
        await clearStoryEditorDraftFromDB(deleteDialog.id)
        setStoryEditorDrafts(prev => prev.filter(d => d.storyId !== deleteDialog.id))
      }
      notify(t('admin.notify_log_deleted'))
    } catch (err) {
      console.error('Failed to delete draft:', err)
      notify(t('common.error'), 'error')
    } finally {
      setDeleteDialog({ isOpen: false, type: 'story' })
    }
  }

  function handleEditStoryFromDraft(draft: StoryEditorDraftData) {
    setEditFromDraft(draft)
    setActiveSubTab('stories')
  }

  // Format relative time
  function formatRelativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp
    if (diff < 60000) return t('story.draft_just_now') || '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} ${t('story.draft_minutes_ago') || '分钟前'}`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ${t('story.draft_hours_ago') || '小时前'}`
    return new Date(timestamp).toLocaleString()
  }

  // Count total drafts
  const totalDrafts = useMemo(() => {
    let count = blogDrafts.length + storyEditorDrafts.length
    if (storyDraft) count++
    return count
  }, [storyDraft, blogDrafts, storyEditorDrafts])

  // Draft type filter options
  const draftTypeOptions: SelectOption[] = useMemo(() => [
    { value: '', label: t('admin.all_types') },
    { value: 'story', label: t('nav.story') },
    { value: 'blog', label: t('admin.blog') },
  ], [t])

  // Filtered drafts based on type and search query
  const filteredStoryDraft = useMemo(() => {
    if (draftTypeFilter === 'blog') return null
    if (!storyDraft) return null
    if (draftSearchQuery) {
      const query = draftSearchQuery.toLowerCase()
      if (!storyDraft.title?.toLowerCase().includes(query) && !storyDraft.content?.toLowerCase().includes(query)) {
        return null
      }
    }
    return storyDraft
  }, [storyDraft, draftTypeFilter, draftSearchQuery])

  const filteredStoryEditorDrafts = useMemo(() => {
    if (draftTypeFilter === 'blog') return []
    if (!draftSearchQuery) return storyEditorDrafts
    const query = draftSearchQuery.toLowerCase()
    return storyEditorDrafts.filter(d =>
      d.title?.toLowerCase().includes(query) || d.content?.toLowerCase().includes(query)
    )
  }, [storyEditorDrafts, draftTypeFilter, draftSearchQuery])

  const filteredBlogDrafts = useMemo(() => {
    if (draftTypeFilter === 'story') return []
    if (!draftSearchQuery) return blogDrafts
    const query = draftSearchQuery.toLowerCase()
    return blogDrafts.filter(d =>
      d.title?.toLowerCase().includes(query) || d.content?.toLowerCase().includes(query)
    )
  }, [blogDrafts, draftTypeFilter, draftSearchQuery])

  // Handle tab click with double-click refresh
  function handleTabClick(tab: 'blog' | 'stories' | 'drafts') {
    const now = Date.now()
    if (lastClickRef.current.tab === tab && now - lastClickRef.current.time < 300) {
      // Double click - refresh
      if (tab === 'drafts') {
        loadDrafts()
      } else if (tab === 'stories') {
        setStoriesRefreshKey(k => k + 1)
      } else if (tab === 'blog') {
        setBlogRefreshKey(k => k + 1)
      }
    }
    lastClickRef.current = { tab, time: now }
    setActiveSubTab(tab)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Sub-tab Navigation */}
      <div className="flex space-x-1 border-b border-border flex-shrink-0">
        <button
          onClick={() => handleTabClick('stories')}
          className={`flex items-center gap-2 px-6 py-4 text-xs font-bold uppercase tracking-[0.2em] border-b-2 transition-colors ${
            activeSubTab === 'stories'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          title={t('admin.double_click_refresh') || '双击刷新'}
        >
          <BookOpen className="w-4 h-4" />
          {t('nav.story') || '叙事'}
        </button>
        <button
          onClick={() => handleTabClick('blog')}
          className={`flex items-center gap-2 px-6 py-4 text-xs font-bold uppercase tracking-[0.2em] border-b-2 transition-colors ${
            activeSubTab === 'blog'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          title={t('admin.double_click_refresh') || '双击刷新'}
        >
          <BookText className="w-4 h-4" />
          {t('admin.blog') || '博客'}
        </button>
        <button
          onClick={() => handleTabClick('drafts')}
          className={`flex items-center gap-2 px-6 py-4 text-xs font-bold uppercase tracking-[0.2em] border-b-2 transition-colors ${
            activeSubTab === 'drafts'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          title={t('admin.double_click_refresh') || '双击刷新'}
        >
          <FileArchive className="w-4 h-4" />
          {t('admin.drafts') || '草稿'}
          {totalDrafts > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-primary/10 text-primary rounded-full">
              {totalDrafts}
            </span>
          )}
        </button>
      </div>

      {/* Sub-tab Content */}
      <div className="flex-1 overflow-hidden pt-6">
        <div className={activeSubTab === 'blog' ? 'h-full' : 'hidden'}>
          <BlogTab
            photos={photos}
            settings={settings}
            t={t}
            notify={notify}
            refreshKey={blogRefreshKey}
          />
        </div>
        <div className={activeSubTab === 'stories' ? 'h-full' : 'hidden'}>
          <StoriesTab
            token={token}
            t={t}
            notify={notify}
            editStoryId={editStoryId}
            editFromDraft={editFromDraft}
            onDraftConsumed={() => setEditFromDraft(null)}
            refreshKey={storiesRefreshKey}
          />
        </div>
        {activeSubTab === 'drafts' ? (
          <div className="h-full flex flex-col gap-6 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border pb-4 flex-shrink-0">
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  value={draftSearchQuery}
                  onChange={(e) => setDraftSearchQuery(e.target.value)}
                  placeholder={t('admin.search_placeholder')}
                  className="px-3 py-2 text-sm bg-transparent border border-border rounded-md focus:border-primary outline-none w-48"
                />
                <CustomSelect
                  value={draftTypeFilter}
                  options={draftTypeOptions}
                  onChange={setDraftTypeFilter}
                  placeholder={t('admin.all_types')}
                  className="w-32"
                />
              </div>
              <div className="flex items-center gap-2">
                {totalDrafts > 0 && (
                  <button
                    onClick={() => setDeleteDialog({ isOpen: true, type: 'all' })}
                    className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive text-xs font-bold uppercase tracking-widest hover:bg-destructive/20 transition-all rounded-md"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t('admin.delete_all')}
                  </button>
                )}
                <button
                  onClick={loadDrafts}
                  className="flex items-center px-6 py-2 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest hover:bg-primary/20 transition-all rounded-md"
                >
                  {t('common.refresh')}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6">
              {loadingDrafts ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Story Draft Section */}
                  {filteredStoryDraft && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>{t('admin.story_draft') || '叙事草稿'}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-600 rounded">
                          {t('admin.read_only') || '只读'}
                        </span>
                      </div>
                      <div className="p-5 border border-border hover:border-primary/50 transition-colors rounded-lg group">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-serif text-xl mb-1">
                              {filteredStoryDraft.title || t('story.untitled')}
                            </h4>
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                              {filteredStoryDraft.content?.substring(0, 150) || t('admin.no_content')}
                              {filteredStoryDraft.content?.length > 150 ? '...' : ''}
                            </p>
                            <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono uppercase">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatRelativeTime(filteredStoryDraft.savedAt)}
                              </span>
                              {filteredStoryDraft.files && filteredStoryDraft.files.length > 0 && (
                                <span>{filteredStoryDraft.files.length} {t('admin.photos')}</span>
                              )}
                              {filteredStoryDraft.selectedAlbumIds && filteredStoryDraft.selectedAlbumIds.length > 0 && (
                                <span>{filteredStoryDraft.selectedAlbumIds.length} {t('admin.albums')}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setSelectedDraft(filteredStoryDraft)}
                              className="p-2 text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-muted"
                              title={t('common.view')}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteDialog({ isOpen: true, type: 'story' })}
                              className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-md hover:bg-muted"
                              title={t('common.delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Story Editor Drafts Section */}
                  {filteredStoryEditorDrafts.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{t('admin.story_editor_drafts')}</span>
                        <span className="text-muted-foreground/50">({filteredStoryEditorDrafts.length})</span>
                      </div>
                      <div className="space-y-3">
                        {filteredStoryEditorDrafts.map((draft) => (
                          <div
                            key={draft.id}
                            className="p-5 border border-border hover:border-primary/50 transition-colors rounded-lg group"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-serif text-xl">
                                      {draft.title || t('story.untitled')}
                                    </h4>
                                    {draft.storyId ? (
                                      <span className="text-[8px] font-black uppercase px-1.5 py-0.5 border border-muted-foreground text-muted-foreground rounded">
                                        {t('common.edit')}
                                      </span>
                                    ) : (
                                      <span className="text-[8px] font-black uppercase px-1.5 py-0.5 border border-primary text-primary rounded">
                                        {t('admin.new')}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                                    {draft.content?.substring(0, 150) || t('admin.no_content')}
                                    {draft.content?.length > 150 ? '...' : ''}
                                  </p>
                                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono uppercase">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {formatRelativeTime(draft.savedAt)}
                                    </span>
                                    {draft.photoIds?.length > 0 && (
                                      <span>{draft.photoIds.length} {t('admin.photos')}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => handleEditStoryFromDraft(draft)}
                                    className="p-2 text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-muted flex items-center gap-1"
                                    title={t('common.edit')}
                                  >
                                    <ArrowRight className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setSelectedDraft(draft)}
                                    className="p-2 text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-muted"
                                    title={t('common.view')}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteDialog({ isOpen: true, type: 'storyEditor', id: draft.storyId })}
                                    className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-md hover:bg-muted"
                                    title={t('common.delete')}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Blog Drafts Section */}
                  {filteredBlogDrafts.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        <BookText className="w-3.5 h-3.5" />
                        <span>{t('admin.blog_drafts')}</span>
                        <span className="text-muted-foreground/50">({filteredBlogDrafts.length})</span>
                      </div>
                      <div className="space-y-3">
                        {filteredBlogDrafts.map((draft) => (
                          <div
                            key={draft.id}
                            className="p-5 border border-border hover:border-primary/50 transition-colors rounded-lg group"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-serif text-xl">
                                    {draft.title || t('admin.untitled')}
                                  </h4>
                                  {draft.blogId ? (
                                    <span className="text-[8px] font-black uppercase px-1.5 py-0.5 border border-muted-foreground text-muted-foreground rounded">
                                      {t('common.edit')}
                                    </span>
                                  ) : (
                                    <span className="text-[8px] font-black uppercase px-1.5 py-0.5 border border-primary text-primary rounded">
                                      {t('admin.new')}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                                  {draft.content?.substring(0, 150) || t('admin.no_content')}
                                  {draft.content?.length > 150 ? '...' : ''}
                                </p>
                                <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono uppercase">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatRelativeTime(draft.savedAt)}
                                  </span>
                                  {draft.category && (
                                    <span>{draft.category}</span>
                                  )}
                                  {draft.content && (
                                    <span>{draft.content.length} {t('admin.characters')}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => setSelectedDraft(draft)}
                                  className="p-2 text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-muted"
                                  title={t('common.view')}
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setDeleteDialog({ isOpen: true, type: 'blog', id: draft.blogId })}
                                  className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-md hover:bg-muted"
                                  title={t('common.delete')}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty State */}
                  {!filteredStoryDraft && filteredBlogDrafts.length === 0 && filteredStoryEditorDrafts.length === 0 && (
                    <div className="py-24 text-center border border-dashed border-border rounded-lg">
                      <FileArchive className="w-12 h-12 mx-auto mb-4 opacity-10" />
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                        {t('admin.no_drafts')}
                      </p>
                      <p className="text-xs text-muted-foreground/60 max-w-sm mx-auto">
                        {t('admin.drafts_hint')}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Draft Preview Modal */}
      <AnimatePresence>
        {selectedDraft && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 md:p-12"
            onClick={() => setSelectedDraft(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl max-h-[80vh] bg-background border border-border shadow-2xl flex flex-col overflow-hidden rounded-lg"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-border">
                <div>
                  <h3 className="font-serif text-2xl">
                    {selectedDraft.title || t('admin.untitled')}
                  </h3>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground font-mono uppercase">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatRelativeTime(selectedDraft.savedAt)}
                    </span>
                    {'blogId' in selectedDraft ? (
                      <span className="flex items-center gap-1">
                        <BookText className="w-3 h-3" />
                        {t('admin.blog')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <BookOpen className="w-3 h-3" />
                        {t('nav.story')}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDraft(null)}
                  className="p-2 hover:bg-muted rounded-md transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <pre className="whitespace-pre-wrap font-mono text-sm bg-muted/30 p-4 rounded-lg overflow-x-auto">
                    {selectedDraft.content || t('admin.no_content')}
                  </pre>
                </div>
                
                {/* Blog-specific metadata */}
                {'category' in selectedDraft && (
                  <div className="mt-6 pt-6 border-t border-border">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t('ui.category_filter')}</span>
                        <p className="mt-1">{(selectedDraft as BlogDraftData).category || '-'}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tags</span>
                        <p className="mt-1">{(selectedDraft as BlogDraftData).tags || '-'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Story-specific metadata */}
                {'files' in selectedDraft && (selectedDraft as StoryDraftWithPreviews).files?.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-border">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {t('admin.pending_files')} ({(selectedDraft as StoryDraftWithPreviews).files.length})
                    </span>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {(selectedDraft as StoryDraftWithPreviews).files.slice(0, 8).map((f, i) => (
                        <div key={f.id || i} className="aspect-square bg-muted rounded-md overflow-hidden">
                          {f.preview ? (
                            <img
                              src={f.preview}
                              alt={f.file?.name || `文件 ${i + 1}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-1">
                              <ImageIcon className="w-4 h-4 opacity-30" />
                              <span className="text-[10px] truncate max-w-full px-1">
                                {f.file?.name?.substring(0, 10) || `文件 ${i + 1}`}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                      {(selectedDraft as StoryDraftWithPreviews).files.length > 8 && (
                        <div className="aspect-square bg-muted rounded-md flex items-center justify-center text-muted-foreground text-xs">
                          +{(selectedDraft as StoryDraftWithPreviews).files.length - 8}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-border bg-muted/20">
                <p className="text-[10px] text-muted-foreground text-center">
                  {t('admin.draft_preview_hint')}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SimpleDeleteDialog
        isOpen={deleteDialog.isOpen}
        message={deleteDialog.type === 'all' ? t('admin.confirm_delete_all_drafts') : undefined}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteDialog({ isOpen: false, type: 'story' })}
        t={t}
      />
    </div>
  )
}
