'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { BookText, BookOpen, FileArchive, Clock, Trash2, Eye, X } from 'lucide-react'
import { PhotoDto, PublicSettingsDto } from '@/lib/api'
import { BlogTab } from './BlogTab'
import { StoriesTab } from './StoriesTab'
import {
  getAllDraftsFromDB,
  clearDraftFromDB,
  clearBlogDraftFromDB,
  type StoryDraftData,
  type BlogDraftData
} from '@/lib/client-db'
import { motion, AnimatePresence } from 'framer-motion'

interface LogsTabProps {
  token: string | null
  photos: PhotoDto[]
  settings: PublicSettingsDto | null
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  initialTab?: 'blog' | 'stories' | 'drafts'
  editStoryId?: string
}

export function LogsTab({ token, photos, settings, t, notify, initialTab, editStoryId }: LogsTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'blog' | 'stories' | 'drafts'>(initialTab || 'stories')
  
  // Drafts state
  const [storyDraft, setStoryDraft] = useState<StoryDraftData | null>(null)
  const [blogDrafts, setBlogDrafts] = useState<BlogDraftData[]>([])
  const [loadingDrafts, setLoadingDrafts] = useState(false)
  const [selectedDraft, setSelectedDraft] = useState<StoryDraftData | BlogDraftData | null>(null)
  
  // Load drafts when switching to drafts tab
  useEffect(() => {
    if (activeSubTab === 'drafts') {
      loadDrafts()
    }
  }, [activeSubTab])

  async function loadDrafts() {
    setLoadingDrafts(true)
    try {
      const { storyDraft, blogDrafts } = await getAllDraftsFromDB()
      setStoryDraft(storyDraft)
      setBlogDrafts(blogDrafts)
    } catch (err) {
      console.error('Failed to load drafts:', err)
    } finally {
      setLoadingDrafts(false)
    }
  }

  async function handleDeleteStoryDraft() {
    if (!window.confirm(t('common.confirm') + '?')) return
    try {
      await clearDraftFromDB()
      setStoryDraft(null)
      notify(t('admin.notify_log_deleted'))
    } catch (err) {
      console.error('Failed to delete story draft:', err)
      notify(t('common.error'), 'error')
    }
  }

  async function handleDeleteBlogDraft(blogId?: string) {
    if (!window.confirm(t('common.confirm') + '?')) return
    try {
      await clearBlogDraftFromDB(blogId)
      setBlogDrafts(prev => prev.filter(d => d.blogId !== blogId))
      notify(t('admin.notify_log_deleted'))
    } catch (err) {
      console.error('Failed to delete blog draft:', err)
      notify(t('common.error'), 'error')
    }
  }

  // Format relative time
  function formatRelativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp
    if (diff < 60000) return t('story.draft_just_now') || '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} ${t('story.draft_minutes_ago') || '分钟前'}`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ${t('story.draft_hours_ago') || '小时前'}`
    return new Date(timestamp).toLocaleDateString()
  }

  // Count total drafts
  const totalDrafts = useMemo(() => {
    let count = blogDrafts.length
    if (storyDraft) count++
    return count
  }, [storyDraft, blogDrafts])

  return (
    <div className="h-full flex flex-col">
      {/* Sub-tab Navigation */}
      <div className="flex space-x-1 border-b border-border flex-shrink-0">
        <button
          onClick={() => setActiveSubTab('stories')}
          className={`flex items-center gap-2 px-6 py-4 text-xs font-bold uppercase tracking-[0.2em] border-b-2 transition-colors ${
            activeSubTab === 'stories'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          {t('nav.story') || '叙事'}
        </button>
        <button
          onClick={() => setActiveSubTab('blog')}
          className={`flex items-center gap-2 px-6 py-4 text-xs font-bold uppercase tracking-[0.2em] border-b-2 transition-colors ${
            activeSubTab === 'blog'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <BookText className="w-4 h-4" />
          {t('admin.blog') || '博客'}
        </button>
        <button
          onClick={() => setActiveSubTab('drafts')}
          className={`flex items-center gap-2 px-6 py-4 text-xs font-bold uppercase tracking-[0.2em] border-b-2 transition-colors ${
            activeSubTab === 'drafts'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
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
        {activeSubTab === 'blog' && (
          <BlogTab
            photos={photos}
            settings={settings}
            t={t}
            notify={notify}
          />
        )}
        {activeSubTab === 'stories' && (
          <StoriesTab
            token={token}
            t={t}
            notify={notify}
            editStoryId={editStoryId}
          />
        )}
        {activeSubTab === 'drafts' && (
          <div className="h-full flex flex-col gap-6 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border pb-4 flex-shrink-0">
              <div className="flex items-center gap-4">
                <FileArchive className="w-6 h-6 text-primary" />
                <h3 className="font-serif text-2xl uppercase tracking-tight">
                  {t('admin.local_drafts') || '本地草稿'}
                </h3>
              </div>
              <button
                onClick={loadDrafts}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
              >
                {t('common.refresh') || '刷新'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6">
              {loadingDrafts ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Story Draft Section */}
                  {storyDraft && (
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
                              {storyDraft.title || t('story.untitled') || '未命名叙事'}
                            </h4>
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                              {storyDraft.content?.substring(0, 150) || t('admin.no_content') || '无内容'}
                              {storyDraft.content?.length > 150 ? '...' : ''}
                            </p>
                            <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono uppercase">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatRelativeTime(storyDraft.savedAt)}
                              </span>
                              {storyDraft.files && storyDraft.files.length > 0 && (
                                <span>{storyDraft.files.length} {t('admin.photos') || '张照片'}</span>
                              )}
                              {storyDraft.selectedAlbumIds && storyDraft.selectedAlbumIds.length > 0 && (
                                <span>{storyDraft.selectedAlbumIds.length} {t('admin.albums') || '个相册'}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setSelectedDraft(storyDraft)}
                              className="p-2 text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-muted"
                              title={t('common.view') || '查看'}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={handleDeleteStoryDraft}
                              className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-md hover:bg-muted"
                              title={t('common.delete') || '删除'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Blog Drafts Section */}
                  {blogDrafts.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        <BookText className="w-3.5 h-3.5" />
                        <span>{t('admin.blog_drafts') || '博客草稿'}</span>
                        <span className="text-muted-foreground/50">({blogDrafts.length})</span>
                      </div>
                      <div className="space-y-3">
                        {blogDrafts.map((draft) => (
                          <div
                            key={draft.id}
                            className="p-5 border border-border hover:border-primary/50 transition-colors rounded-lg group"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-serif text-xl">
                                    {draft.title || t('admin.untitled') || '未命名'}
                                  </h4>
                                  {draft.blogId ? (
                                    <span className="text-[8px] font-black uppercase px-1.5 py-0.5 border border-muted-foreground text-muted-foreground rounded">
                                      {t('common.edit') || '编辑中'}
                                    </span>
                                  ) : (
                                    <span className="text-[8px] font-black uppercase px-1.5 py-0.5 border border-primary text-primary rounded">
                                      {t('admin.new') || '新建'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                                  {draft.content?.substring(0, 150) || t('admin.no_content') || '无内容'}
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
                                    <span>{draft.content.length} {t('admin.characters') || '字符'}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => setSelectedDraft(draft)}
                                  className="p-2 text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-muted"
                                  title={t('common.view') || '查看'}
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteBlogDraft(draft.blogId)}
                                  className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-md hover:bg-muted"
                                  title={t('common.delete') || '删除'}
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
                  {!storyDraft && blogDrafts.length === 0 && (
                    <div className="py-24 text-center border border-dashed border-border rounded-lg">
                      <FileArchive className="w-12 h-12 mx-auto mb-4 opacity-10" />
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                        {t('admin.no_drafts') || '暂无草稿'}
                      </p>
                      <p className="text-xs text-muted-foreground/60 max-w-sm mx-auto">
                        {t('admin.drafts_hint') || '编辑博客或叙事时会自动保存草稿到本地'}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
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
                    {selectedDraft.title || t('admin.untitled') || '未命名'}
                  </h3>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground font-mono uppercase">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatRelativeTime(selectedDraft.savedAt)}
                    </span>
                    {'blogId' in selectedDraft ? (
                      <span className="flex items-center gap-1">
                        <BookText className="w-3 h-3" />
                        {t('admin.blog') || '博客'}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <BookOpen className="w-3 h-3" />
                        {t('nav.story') || '叙事'}
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
                    {selectedDraft.content || t('admin.no_content') || '无内容'}
                  </pre>
                </div>
                
                {/* Blog-specific metadata */}
                {'category' in selectedDraft && (
                  <div className="mt-6 pt-6 border-t border-border">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t('ui.category_filter') || '分类'}</span>
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
                {'files' in selectedDraft && (selectedDraft as StoryDraftData).files?.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-border">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {t('admin.pending_files') || '待上传文件'} ({(selectedDraft as StoryDraftData).files.length})
                    </span>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {(selectedDraft as StoryDraftData).files.slice(0, 8).map((f, i) => (
                        <div key={f.id || i} className="aspect-square bg-muted rounded-md flex items-center justify-center text-muted-foreground text-xs">
                          {f.file?.name?.substring(0, 10) || `文件 ${i + 1}`}
                        </div>
                      ))}
                      {(selectedDraft as StoryDraftData).files.length > 8 && (
                        <div className="aspect-square bg-muted rounded-md flex items-center justify-center text-muted-foreground text-xs">
                          +{(selectedDraft as StoryDraftData).files.length - 8}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-border bg-muted/20">
                <p className="text-[10px] text-muted-foreground text-center">
                  {t('admin.draft_preview_hint') || '这是本地保存的草稿预览，内容存储在浏览器中'}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
