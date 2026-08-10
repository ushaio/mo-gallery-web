/**
 * 照片日志页 —— 叙事 + 博客 + 草稿三个子页签。
 * 数据/交互逻辑与 web 后台 logs/page.tsx 一致（直接调用 @/lib/api 与 @/lib/client-db）；
 * UI 遵循桌面端自己的设计语言：页头 + 下划线页签 + 卡片式列表行（对齐相册/胶卷页）。
 */
'use client'

import { useState, useEffect, useMemo, useRef, useCallback, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { useAdmin, AdminLogsProvider } from '@/pages/admin-logs/layout'
import { type PhotoDto } from '@/lib/api'
import { StoriesTab } from '@/pages/admin-logs/StoriesTab'
import { BlogTab } from '@/pages/admin-logs/BlogTab'
import { CollapsibleListPane, LIST_PANE_COLLAPSED_KEY } from '@/pages/admin-logs/shared/CollapsibleListPane'
import { PageHeader } from '@/components/layout/PageHeader'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import { useDataRevision } from '@/hooks/useDataRevision'
import {
  getAllDraftsFromDB,
  clearDraftFromDB,
  clearBlogDraftFromDB,
  clearStoryEditorDraftFromDB,
  clearAllDraftsFromDB,
  type StoryDraftData,
  type BlogDraftData,
  type StoryEditorDraftData,
} from '@/lib/client-db'
import { motion, AnimatePresence } from 'framer-motion'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { AdminButton } from '@/components/admin/AdminButton'
import { SelectDropdown, type SelectDropdownOption } from '@/components/ui/SelectDropdown'
import { countStoryCharacters } from '@/lib/story-rich-content'
import { formatRelativeTimeLabel } from '@/lib/utils'
import {
  BookText,
  BookOpen,
  FileArchive,
  Clock,
  Trash2,
  Eye,
  X,
  Image as ImageIcon,
  Edit3,
  ArrowRight,
  Search,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react'

interface StoryDraftWithPreviews extends Omit<StoryDraftData, 'files'> {
  files: { id: string; file: File; preview: string }[]
}

type DraftTone = 'default' | 'primary' | 'amber'

const DRAFT_TONE_STYLES: Record<DraftTone, { backgroundColor: string; color: string }> = {
  default: {
    backgroundColor: 'color-mix(in srgb, var(--muted) 60%, transparent)',
    color: 'var(--muted-foreground)',
  },
  primary: {
    backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)',
    color: 'var(--primary)',
  },
  amber: {
    backgroundColor: 'color-mix(in srgb, #f59e0b 14%, transparent)',
    color: '#d97706',
  },
}

interface DraftCardProps {
  icon: LucideIcon
  title: string
  snippet: string
  badge?: ReactNode
  meta: ReactNode
  actions: ReactNode
  tone?: DraftTone
  onOpen?: () => void
}

function DraftCard({ icon: Icon, title, snippet, badge, meta, actions, tone = 'default', onOpen }: DraftCardProps) {
  const toneStyle = DRAFT_TONE_STYLES[tone]
  return (
    <div
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (!onOpen) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className={`group flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors hover:border-primary/50 ${onOpen ? 'cursor-pointer' : ''}`}
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: toneStyle.backgroundColor }}
      >
        <Icon className="h-5 w-5" style={{ color: toneStyle.color }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate font-serif text-base">{title}</h4>
          {badge}
        </div>
        <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--muted-foreground)' }}>
          {snippet}
        </p>
        <div
          className="mt-1.5 flex items-center gap-4 font-mono text-[10px] uppercase tracking-wide"
          style={{ color: 'var(--muted-foreground)' }}
        >
          {meta}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {actions}
      </div>
    </div>
  )
}

function DraftSectionLabel({ icon: Icon, label, count }: { icon: LucideIcon; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
      {typeof count === 'number' && <span style={{ opacity: 0.5 }}>({count})</span>}
    </div>
  )
}

type JournalSubTab = 'blog' | 'stories' | 'drafts'

/**
 * 左栏面板头内的子页签导航（叙事/博客/草稿），紧凑分段控件，双击刷新。
 */
function JournalSubTabNav({
  activeSubTab,
  onTabClick,
  totalDrafts,
  t,
}: {
  activeSubTab: JournalSubTab
  onTabClick: (tab: JournalSubTab) => void
  totalDrafts: number
  t: (key: string) => string
}) {
  return (
    <div
      className="inline-flex min-w-0 flex-1 items-center gap-0.5 rounded-md border p-0.5"
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'color-mix(in srgb, var(--muted) 45%, transparent)',
      }}
    >
      {([
        { key: 'stories' as const, icon: BookOpen, label: t('nav.story') },
        { key: 'blog' as const, icon: BookText, label: t('admin.blog') },
        { key: 'drafts' as const, icon: FileArchive, label: t('admin.drafts') },
      ]).map(({ key, icon: Icon, label }) => {
        const active = activeSubTab === key
        return (
          <button
            key={key}
            onClick={() => onTabClick(key)}
            title={t('admin.double_click_refresh')}
            className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded border px-1.5 py-1 text-[10px] transition-colors"
            style={
              active
                ? {
                    borderColor: 'var(--border)',
                    backgroundColor: 'var(--card)',
                    color: 'var(--foreground)',
                    boxShadow: '0 1px 2px rgb(0 0 0 / 0.06)',
                  }
                : { borderColor: 'transparent', color: 'var(--muted-foreground)' }
            }
          >
            <Icon size={12} className="shrink-0" />
            <span className="truncate">{label}</span>
            {key === 'drafts' && totalDrafts > 0 && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[9px] leading-none"
                style={{
                  backgroundColor: active ? 'var(--primary)' : 'var(--accent)',
                  color: active ? 'var(--primary-foreground)' : 'var(--accent-foreground)',
                }}
              >
                {totalDrafts}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function PhotoJournalPage() {
  return (
    <AdminLogsProvider>
      <PhotoJournalContent />
    </AdminLogsProvider>
  )
}

function PhotoJournalContent() {
  const { t } = useLanguage()
  const { token } = useAuth()
  const { settings, isImmersiveMode } = useAdmin()
  const [photos, setPhotos] = useState<PhotoDto[]>([])

  const [activeSubTab, setActiveSubTab] = useState<'blog' | 'stories' | 'drafts'>('stories')

  const [storyDraft, setStoryDraft] = useState<StoryDraftWithPreviews | null>(null)
  const [blogDrafts, setBlogDrafts] = useState<BlogDraftData[]>([])
  const [storyEditorDrafts, setStoryEditorDrafts] = useState<StoryEditorDraftData[]>([])
  const [loadingDrafts, setLoadingDrafts] = useState(false)
  const [selectedDraft, setSelectedDraft] = useState<StoryDraftWithPreviews | BlogDraftData | StoryEditorDraftData | null>(null)

  const [editFromDraft, setEditFromDraft] = useState<StoryEditorDraftData | null>(null)
  const [editBlogFromDraft, setEditBlogFromDraft] = useState<BlogDraftData | null>(null)

  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean
    type: 'story' | 'blog' | 'storyEditor' | 'all'
    id?: string
  }>({ isOpen: false, type: 'story' })

  const previewUrlsRef = useRef<string[]>([])
  const photosRevision = useDataRevision('photos')

  const lastClickRef = useRef<{ tab: string; time: number }>({ tab: '', time: 0 })
  const [storiesRefreshKey, setStoriesRefreshKey] = useState(0)
  const [blogRefreshKey, setBlogRefreshKey] = useState(0)
  const [isStoriesEditing, setIsStoriesEditing] = useState(false)
  const [isBlogEditing, setIsBlogEditing] = useState(false)

  // 左栏列表折叠状态（叙事/博客共用，跨页面保留）
  const [listPaneCollapsed, setListPaneCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(LIST_PANE_COLLAPSED_KEY) === 'true'
    } catch {
      return false
    }
  })

  const toggleListPane = useCallback(() => {
    setListPaneCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(LIST_PANE_COLLAPSED_KEY, String(next))
      } catch {
        // ignore quota / privacy mode errors
      }
      return next
    })
  }, [])

  const [draftTypeFilter, setDraftTypeFilter] = useState('')
  const [draftSearchQuery, setDraftSearchQuery] = useState('')

  const notify = useCallback((message: string, type?: 'success' | 'error' | 'info') => {
    if (type === 'error') toast.error(message)
    else if (type === 'success') toast.success(message)
    else toast(message)
  }, [])

  // 博客插入照片需要全部照片
  useCachedPageEffect(() => {
    if (activeSubTab !== 'blog') return
    ;(async () => {
      try {
        const data = await (
          window as unknown as { go: { main: { App: { GetAllPhotos: () => Promise<PhotoDto[]> } } } }
        ).go.main.App.GetAllPhotos()
        setPhotos(data || [])
      } catch (err) {
        console.error('Failed to load photos:', err)
      }
    })()
  }, [activeSubTab, photosRevision])

  useCachedPageEffect(() => {
    if (activeSubTab === 'drafts') {
      void loadDrafts()
    }
  }, [activeSubTab])

  function revokeDraftPreviewUrls() {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrlsRef.current = []
  }

  async function loadDrafts() {
    setLoadingDrafts(true)

    revokeDraftPreviewUrls()

    try {
      const { storyDraft: rawStoryDraft, blogDrafts, storyEditorDrafts } = await getAllDraftsFromDB()

      if (rawStoryDraft && rawStoryDraft.files && rawStoryDraft.files.length > 0) {
        const filesWithPreviews = rawStoryDraft.files.map((f) => {
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
          files: filesWithPreviews,
        })
      } else if (rawStoryDraft) {
        setStoryDraft({
          ...rawStoryDraft,
          files: [],
        })
      } else {
        setStoryDraft(null)
      }

      setBlogDrafts(blogDrafts)
      setStoryEditorDrafts(storyEditorDrafts)
    } catch (err) {
      console.error('Failed to load drafts:', err)
      notify(t('common.error'), 'error')
    } finally {
      setLoadingDrafts(false)
    }
  }

  async function confirmDelete() {
    try {
      if (deleteDialog.type === 'all') {
        await clearAllDraftsFromDB()
        revokeDraftPreviewUrls()
        setStoryDraft(null)
        setBlogDrafts([])
        setStoryEditorDrafts([])
      } else if (deleteDialog.type === 'story') {
        await clearDraftFromDB()
        revokeDraftPreviewUrls()
        setStoryDraft(null)
      } else if (deleteDialog.type === 'blog') {
        await clearBlogDraftFromDB(deleteDialog.id)
        setBlogDrafts((prev) => prev.filter((d) => d.blogId !== deleteDialog.id))
      } else if (deleteDialog.type === 'storyEditor') {
        await clearStoryEditorDraftFromDB(deleteDialog.id)
        setStoryEditorDrafts((prev) => prev.filter((d) => d.id !== deleteDialog.id))
      }
      notify(t('admin.draft_deleted'))
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

  function handleEditBlogFromDraft(draft: BlogDraftData) {
    setEditBlogFromDraft(draft)
    setActiveSubTab('blog')
  }

  function formatRelativeTime(timestamp: number): string {
    return formatRelativeTimeLabel(timestamp, t, 'datetime')
  }

  const totalDrafts = useMemo(() => {
    let count = blogDrafts.length + storyEditorDrafts.length
    if (storyDraft) count++
    return count
  }, [storyDraft, blogDrafts, storyEditorDrafts])

  const draftTypeOptions: SelectDropdownOption[] = useMemo(
    () => [
      { value: '', label: t('admin.all_types') },
      { value: 'story', label: t('nav.story') },
      { value: 'blog', label: t('admin.blog') },
    ],
    [t],
  )

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
    return storyEditorDrafts.filter(
      (d) => d.title?.toLowerCase().includes(query) || d.content?.toLowerCase().includes(query),
    )
  }, [storyEditorDrafts, draftTypeFilter, draftSearchQuery])

  const filteredBlogDrafts = useMemo(() => {
    if (draftTypeFilter === 'story') return []
    if (!draftSearchQuery) return blogDrafts
    const query = draftSearchQuery.toLowerCase()
    return blogDrafts.filter((d) => d.title?.toLowerCase().includes(query) || d.content?.toLowerCase().includes(query))
  }, [blogDrafts, draftTypeFilter, draftSearchQuery])

  function handleTabClick(tab: 'blog' | 'stories' | 'drafts') {
    const now = Date.now()
    if (lastClickRef.current.tab === tab && now - lastClickRef.current.time < 300) {
      if (tab === 'drafts') {
        loadDrafts()
      } else if (tab === 'stories') {
        setStoriesRefreshKey((k) => k + 1)
      } else if (tab === 'blog') {
        setBlogRefreshKey((k) => k + 1)
      }
    }
    lastClickRef.current = { tab, time: now }
    setActiveSubTab(tab)
  }

  const chromeVisible = !((isStoriesEditing && activeSubTab === 'stories') || (isBlogEditing && activeSubTab === 'blog') || isImmersiveMode)
  const contentPadding =
    (isStoriesEditing && activeSubTab === 'stories') || (isBlogEditing && activeSubTab === 'blog') || isImmersiveMode
      ? 'pt-0'
      : 'px-6 pb-6 pt-3'

  // 左栏面板头内的子页签导航（叙事/博客/草稿）
  const subTabNav = (
    <JournalSubTabNav
      activeSubTab={activeSubTab}
      onTabClick={handleTabClick}
      totalDrafts={totalDrafts}
      t={t}
    />
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 桌面端页头 */}
      <div className={chromeVisible ? 'block' : 'hidden'}>
        <PageHeader
          title={t('admin.page_photo_journal')}
        />
      </div>

      {/* 子页签内容（导航已并入左栏面板头） */}
      <div className={`flex-1 overflow-hidden ${contentPadding}`}>
        <div className={activeSubTab === 'blog' ? 'h-full' : 'hidden'}>
          <BlogTab
            photos={photos}
            settings={settings}
            t={t}
            notify={notify}
            refreshKey={blogRefreshKey}
            editBlogFromDraft={editBlogFromDraft}
            onDraftConsumed={() => setEditBlogFromDraft(null)}
            onEditingChange={setIsBlogEditing}
            listPaneCollapsed={listPaneCollapsed}
            onToggleListPane={toggleListPane}
            subTabNav={subTabNav}
          />
        </div>
        <div className={activeSubTab === 'stories' ? 'h-full' : 'hidden'}>
          <StoriesTab
            token={token}
            t={t}
            notify={notify}
            editFromDraft={editFromDraft}
            onDraftConsumed={() => setEditFromDraft(null)}
            refreshKey={storiesRefreshKey}
            onEditingChange={setIsStoriesEditing}
            listPaneCollapsed={listPaneCollapsed}
            onToggleListPane={toggleListPane}
            subTabNav={subTabNav}
          />
        </div>
        {activeSubTab === 'drafts' ? (
          <div className="flex h-full min-h-0 gap-5 overflow-hidden">
            <CollapsibleListPane
              collapsed={listPaneCollapsed}
              onToggle={toggleListPane}
              icon={FileArchive}
              t={t}
              header={subTabNav}
            >
              <div />
            </CollapsibleListPane>
            <main className="min-w-0 flex-1 overflow-hidden">
            <div className="flex h-full flex-col gap-5 overflow-hidden px-3">
              <div
                className="flex shrink-0 items-center justify-between border-b pb-4"
                style={{ borderColor: 'var(--border)' }}
              >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="relative min-w-0 flex-1">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--muted-foreground)' }}
                  />
                  <input
                    type="text"
                    value={draftSearchQuery}
                    onChange={(e) => setDraftSearchQuery(e.target.value)}
                    placeholder={t('admin.search_placeholder')}
                    className="w-60 rounded-md border py-1.5 pl-8 pr-3 text-xs outline-none transition-colors focus:border-primary"
                    style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
                  />
                </div>
                <SelectDropdown
                  value={draftTypeFilter}
                  options={draftTypeOptions}
                  onChange={(value) => setDraftTypeFilter(value as string)}
                  placeholder={t('admin.all_types')}
                  className="w-32"
                />
              </div>
              <div className="flex items-center gap-2">
                {totalDrafts > 0 && (
                  <AdminButton
                    onClick={() => setDeleteDialog({ isOpen: true, type: 'all' })}
                    adminVariant="destructiveOutline"
                    size="sm"
                    className="flex items-center gap-1.5 rounded-md"
                  >
                    <Trash2 size={13} />
                    {t('admin.delete_all')}
                  </AdminButton>
                )}
                <AdminButton
                  onClick={loadDrafts}
                  adminVariant="outline"
                  size="sm"
                  className="flex items-center gap-1.5 rounded-md"
                  title={t('common.refresh')}
                >
                  <RefreshCw size={13} />
                  {t('common.refresh')}
                </AdminButton>
              </div>
            </div>

            <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto pb-2">
              {loadingDrafts ? (
                <div className="flex items-center justify-center py-20">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : (
                <>
                  {/* 叙事上传草稿（只读） */}
                  {filteredStoryDraft && (
                    <div className="space-y-3">
                      <DraftSectionLabel
                        icon={BookOpen}
                        label={t('admin.story_draft')}
                      />
                      <DraftCard
                        icon={BookOpen}
                        tone="amber"
                        onOpen={() => setSelectedDraft(filteredStoryDraft)}
                        title={filteredStoryDraft.title || t('story.untitled')}
                        snippet={`${filteredStoryDraft.content?.substring(0, 150) || t('admin.no_content')}${
                          (filteredStoryDraft.content?.length || 0) > 150 ? '...' : ''
                        }`}
                        badge={
                          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                            {t('admin.read_only')}
                          </span>
                        }
                        meta={
                          <>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatRelativeTime(filteredStoryDraft.savedAt)}
                            </span>
                            {filteredStoryDraft.files && filteredStoryDraft.files.length > 0 && (
                              <span>
                                {filteredStoryDraft.files.length} {t('admin.photos')}
                              </span>
                            )}
                            {filteredStoryDraft.selectedAlbumIds && filteredStoryDraft.selectedAlbumIds.length > 0 && (
                              <span>
                                {filteredStoryDraft.selectedAlbumIds.length} {t('admin.albums')}
                              </span>
                            )}
                          </>
                        }
                        actions={
                          <>
                            <AdminButton
                              onClick={(event) => {
                                event.stopPropagation()
                                setSelectedDraft(filteredStoryDraft)
                              }}
                              adminVariant="icon"
                              size="xs"
                              className="rounded-md p-2"
                              title={t('common.view')}
                            >
                              <Eye className="h-4 w-4" />
                            </AdminButton>
                            <AdminButton
                              onClick={(event) => {
                                event.stopPropagation()
                                setDeleteDialog({ isOpen: true, type: 'story' })
                              }}
                              adminVariant="iconDestructive"
                              size="xs"
                              className="rounded-md p-2"
                              title={t('common.delete')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </AdminButton>
                          </>
                        }
                      />
                    </div>
                  )}

                  {/* 叙事编辑器草稿区 */}
                  {filteredStoryEditorDrafts.length > 0 && (
                    <div className="space-y-3">
                      <DraftSectionLabel
                        icon={Edit3}
                        label={t('admin.story_editor_drafts')}
                        count={filteredStoryEditorDrafts.length}
                      />
                      {filteredStoryEditorDrafts.map((draft) => (
                        <DraftCard
                          key={draft.id}
                          icon={Edit3}
                          tone="primary"
                          onOpen={() => handleEditStoryFromDraft(draft)}
                          title={draft.title || t('story.untitled')}
                          snippet={`${draft.content?.substring(0, 150) || t('admin.no_content')}${
                            (draft.content?.length || 0) > 150 ? '...' : ''
                          }`}
                          badge={
                            draft.storyId ? (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                                {t('common.edit')}
                              </span>
                            ) : (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                                {t('admin.new')}
                              </span>
                            )
                          }
                          meta={
                            <>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatRelativeTime(draft.savedAt)}
                              </span>
                              {draft.content && (
                                <span>
                                  {countStoryCharacters(draft.content)} {t('admin.characters')}
                                </span>
                              )}
                              {draft.photoIds?.length > 0 && (
                                <span>
                                  {draft.photoIds.length} {t('admin.photos')}
                                </span>
                              )}
                            </>
                          }
                          actions={
                            <>
                              <AdminButton
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleEditStoryFromDraft(draft)
                                }}
                                adminVariant="icon"
                                size="xs"
                                className="flex items-center gap-1 rounded-md p-2"
                                title={t('common.edit')}
                              >
                                <ArrowRight className="h-4 w-4" />
                              </AdminButton>
                              <AdminButton
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setSelectedDraft(draft)
                                }}
                                adminVariant="icon"
                                size="xs"
                                className="rounded-md p-2"
                                title={t('common.view')}
                              >
                                <Eye className="h-4 w-4" />
                              </AdminButton>
                              <AdminButton
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setDeleteDialog({ isOpen: true, type: 'storyEditor', id: draft.id })
                                }}
                                adminVariant="iconDestructive"
                                size="xs"
                                className="rounded-md p-2"
                                title={t('common.delete')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </AdminButton>
                            </>
                          }
                        />
                      ))}
                    </div>
                  )}

                  {/* 博客草稿区 */}
                  {filteredBlogDrafts.length > 0 && (
                    <div className="space-y-3">
                      <DraftSectionLabel
                        icon={BookText}
                        label={t('admin.blog_drafts')}
                        count={filteredBlogDrafts.length}
                      />
                      {filteredBlogDrafts.map((draft) => (
                        <DraftCard
                          key={draft.id}
                          icon={BookText}
                          onOpen={() => handleEditBlogFromDraft(draft)}
                          title={draft.title || t('admin.untitled')}
                          snippet={`${draft.content?.substring(0, 150) || t('admin.no_content')}${
                            (draft.content?.length || 0) > 150 ? '...' : ''
                          }`}
                          badge={
                            draft.blogId ? (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                                {t('common.edit')}
                              </span>
                            ) : (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                                {t('admin.new')}
                              </span>
                            )
                          }
                          meta={
                            <>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatRelativeTime(draft.savedAt)}
                              </span>
                              {draft.category && <span>{draft.category}</span>}
                              {draft.content && (
                                <span>
                                  {draft.content.length} {t('admin.characters')}
                                </span>
                              )}
                            </>
                          }
                          actions={
                            <>
                              <AdminButton
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleEditBlogFromDraft(draft)
                                }}
                                adminVariant="icon"
                                size="xs"
                                className="flex items-center gap-1 rounded-md p-2"
                                title={t('common.edit')}
                              >
                                <ArrowRight className="h-4 w-4" />
                              </AdminButton>
                              <AdminButton
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setSelectedDraft(draft)
                                }}
                                adminVariant="icon"
                                size="xs"
                                className="rounded-md p-2"
                                title={t('common.view')}
                              >
                                <Eye className="h-4 w-4" />
                              </AdminButton>
                              <AdminButton
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setDeleteDialog({ isOpen: true, type: 'blog', id: draft.blogId })
                                }}
                                adminVariant="iconDestructive"
                                size="xs"
                                className="rounded-md p-2"
                                title={t('common.delete')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </AdminButton>
                            </>
                          }
                        />
                      ))}
                    </div>
                  )}

                  {/* 空状态提示 */}
                  {!filteredStoryDraft && filteredBlogDrafts.length === 0 && filteredStoryEditorDrafts.length === 0 && (
                    <div
                      className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <div
                        className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl"
                        style={{ backgroundColor: 'var(--muted)' }}
                      >
                        <FileArchive className="h-6 w-6" style={{ color: 'var(--muted-foreground)' }} />
                      </div>
                      <p className="mb-1 text-sm">{t('admin.no_drafts')}</p>
                      <p className="max-w-sm text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        {t('admin.drafts_hint')}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
            </main>
          </div>
        ) : null}
      </div>

      {/* 草稿预览弹窗 */}
      <AnimatePresence>
        {selectedDraft && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm md:p-12"
            onClick={() => setSelectedDraft(null)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-background shadow-2xl"
              style={{ borderColor: 'var(--border)' }}
            >
              {/* 弹窗头部 */}
              <div className="flex items-center justify-between border-b p-6" style={{ borderColor: 'var(--border)' }}>
                <div className="min-w-0">
                  <h3 className="truncate font-serif text-xl">{selectedDraft.title || t('admin.untitled')}</h3>
                  <div
                    className="mt-1 flex items-center gap-3 font-mono text-[10px] uppercase tracking-wide"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(selectedDraft.savedAt)}
                    </span>
                    {'blogId' in selectedDraft ? (
                      <span className="flex items-center gap-1">
                        <BookText className="h-3 w-3" />
                        {t('admin.blog')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        {t('nav.story')}
                      </span>
                    )}
                  </div>
                </div>
                <AdminButton onClick={() => setSelectedDraft(null)} adminVariant="icon" size="sm" className="rounded-md p-2">
                  <X className="h-5 w-5" />
                </AdminButton>
              </div>

              {/* 弹窗内容 */}
              <div className="custom-scrollbar flex-1 overflow-y-auto p-6">
                <pre
                  className="whitespace-pre-wrap rounded-lg bg-muted/40 p-4 font-mono text-sm leading-relaxed"
                  style={{ color: 'var(--foreground)' }}
                >
                  {selectedDraft.content || t('admin.no_content')}
                </pre>

                {/* 博客草稿元信息 */}
                {'category' in selectedDraft && (
                  <div className="mt-6 border-t pt-5" style={{ borderColor: 'var(--border)' }}>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span
                          className="text-[10px] font-bold uppercase tracking-widest"
                          style={{ color: 'var(--muted-foreground)' }}
                        >
                          {t('ui.category_filter')}
                        </span>
                        <p className="mt-1">{(selectedDraft as BlogDraftData).category || '-'}</p>
                      </div>
                      <div>
                        <span
                          className="text-[10px] font-bold uppercase tracking-widest"
                          style={{ color: 'var(--muted-foreground)' }}
                        >
                          Tags
                        </span>
                        <p className="mt-1">{(selectedDraft as BlogDraftData).tags || '-'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 叙事草稿元信息 */}
                {'files' in selectedDraft &&
                  (selectedDraft as StoryDraftWithPreviews).files?.length > 0 && (
                    <div className="mt-6 border-t pt-5" style={{ borderColor: 'var(--border)' }}>
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: 'var(--muted-foreground)' }}
                      >
                        {t('admin.pending_files')} ({(selectedDraft as StoryDraftWithPreviews).files.length})
                      </span>
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        {(selectedDraft as StoryDraftWithPreviews).files.slice(0, 8).map((f, i) => (
                          <div key={f.id || i} className="aspect-square overflow-hidden rounded-md bg-muted">
                            {f.preview ? (
                              <img
                                src={f.preview}
                                alt={f.file?.name || `${t('admin.files')} ${i + 1}`}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div
                                className="flex h-full w-full flex-col items-center justify-center gap-1"
                                style={{ color: 'var(--muted-foreground)' }}
                              >
                                <ImageIcon className="h-4 w-4 opacity-30" />
                                <span className="max-w-full truncate px-1 text-[10px]">
                                  {f.file?.name?.substring(0, 10) || `${t('admin.files')} ${i + 1}`}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                        {(selectedDraft as StoryDraftWithPreviews).files.length > 8 && (
                          <div
                            className="flex aspect-square items-center justify-center rounded-md bg-muted text-xs"
                            style={{ color: 'var(--muted-foreground)' }}
                          >
                            +{(selectedDraft as StoryDraftWithPreviews).files.length - 8}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
              </div>

              {/* 弹窗底部 */}
              <div className="border-t bg-muted/20 p-4" style={{ borderColor: 'var(--border)' }}>
                <p className="text-center text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
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
