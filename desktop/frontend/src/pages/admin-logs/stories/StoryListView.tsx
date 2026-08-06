'use client'

import { useMemo, useState } from 'react'
import {
  BookOpen,
  Calendar,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import type { SelectOption } from '@/components/admin/AdminFormControls'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/ContextMenu'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminLoading } from '@/components/admin/AdminLoading'
import type { StoryDto } from '@/lib/api/types'
import { resolveAssetUrl } from '@/lib/api/core'
import { countStoryCharacters } from '@/lib/story-rich-content'
import { getStoryCoverImageStyle, getStoryCoverPhoto } from '@/lib/story-cover'

type StoryViewMode = 'grid' | 'list'

const VIEW_MODE_KEY = 'mo-gallery:journal:story-view'

function readViewMode(): StoryViewMode {
  try {
    return window.localStorage.getItem(VIEW_MODE_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

interface StoryListViewProps {
  stories: StoryDto[]
  loading: boolean
  statusFilter: string
  onStatusFilterChange: (value: string) => void
  selectedStoryId?: string | null
  compact?: boolean
  onCreateStory: () => void
  onEditStory: (story: StoryDto) => void
  onTogglePublish: (story: StoryDto) => void
  onRequestDelete: (storyId: string) => void
  t: (key: string) => string
  cdnDomain?: string
  onRefresh?: () => void
}

export function StoryListView({
  stories,
  loading,
  statusFilter,
  onStatusFilterChange,
  selectedStoryId,
  compact = false,
  onCreateStory,
  onEditStory,
  onTogglePublish,
  onRequestDelete,
  t,
  cdnDomain,
  onRefresh,
}: StoryListViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<StoryViewMode>(readViewMode)

  const changeViewMode = (mode: StoryViewMode) => {
    setViewMode(mode)
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, mode)
    } catch {
      // ignore quota / privacy mode errors
    }
  }

  const statusOptions: SelectOption[] = [
    { value: '', label: t('admin.all_status') },
    { value: 'published', label: t('admin.published') },
    { value: 'draft', label: t('admin.draft') },
  ]

  const filteredStories = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase()

    return stories.filter((story) => {
      const matchesStatus = (() => {
        if (!statusFilter) return true
        if (statusFilter === 'published') return story.isPublished
        if (statusFilter === 'draft') return !story.isPublished
        return true
      })()

      const matchesSearch =
        !normalizedSearch ||
        (story.title || '').toLowerCase().includes(normalizedSearch)

      return matchesStatus && matchesSearch
    })
  }, [stories, statusFilter, searchQuery])

  const hasActiveFilters = !!statusFilter || !!searchQuery.trim()

  const hasNoStories = stories.length === 0
  const hasNoMatches = stories.length > 0 && filteredStories.length === 0
  // master-detail 窄栏下强制列表视图（grid 卡片在窄栏无意义）
  const effectiveViewMode: StoryViewMode = compact ? 'list' : viewMode

  const inputStyle = {
    borderColor: 'var(--border)',
    backgroundColor: 'var(--card)',
    color: 'var(--foreground)',
  }

  const statusBadge = (story: StoryDto) => (
    <span
      className="absolute right-2 top-1.5 z-10 shrink-0 rounded px-1.5 py-0.5 text-[10px]"
      style={
        story.isPublished
          ? { backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }
          : { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }
      }
    >
      {story.isPublished ? t('admin.published') : t('admin.draft')}
    </span>
  )

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden">
      {/* 工具栏：搜索 ｜ 筛选 / 刷新 / 新建 全部在搜索框右侧（窄栏单行） */}
      <div
        className={`flex shrink-0 items-center border-b ${compact ? 'gap-1.5 pb-3' : 'flex-wrap justify-between gap-3 pb-4'}`}
        style={{ borderColor: 'var(--border)' }}
      >
        {compact ? (
          <>
            <div className="relative min-w-0 flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--muted-foreground)' }}
              />
              <input
                type="text"
                placeholder={t('admin.search_placeholder')}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full rounded-md border py-1.5 pl-8 pr-3 text-xs outline-none transition-colors focus:border-primary"
                style={inputStyle}
              />
            </div>
            <SelectDropdown
              value={statusFilter}
              options={statusOptions}
              onChange={(value) => onStatusFilterChange(value as string)}
              placeholder={t('admin.all_status')}
              className="w-28 shrink-0"
            />
            {onRefresh && (
              <AdminButton
                onClick={onRefresh}
                adminVariant="outline"
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md p-0"
                title={t('common.refresh')}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </AdminButton>
            )}
            <AdminButton
              onClick={onCreateStory}
              adminVariant="primary"
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md p-0"
              title={t('ui.create_story')}
            >
              <Plus className="h-4 w-4" />
            </AdminButton>
          </>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--muted-foreground)' }}
                />
                <input
                  type="text"
                  placeholder={t('admin.search_placeholder')}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-56 rounded-md border py-1.5 pl-8 pr-3 text-xs outline-none transition-colors focus:border-primary"
                  style={inputStyle}
                />
              </div>
              <SelectDropdown
                value={statusFilter}
                options={statusOptions}
                onChange={(value) => onStatusFilterChange(value as string)}
                placeholder={t('admin.all_status')}
                className="w-32"
              />
            </div>
            <div className="flex items-center gap-2">
              {onRefresh && (
                <AdminButton
                  onClick={onRefresh}
                  adminVariant="outline"
                  size="sm"
                  className="flex items-center rounded-md px-3 py-1.5"
                  title={t('common.refresh')}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </AdminButton>
              )}
              <div
                className="flex items-center overflow-hidden rounded-md border"
                style={{ borderColor: 'var(--border)' }}
              >
                {([
                  { mode: 'grid' as const, icon: LayoutGrid, label: t('admin.grid_view') },
                  { mode: 'list' as const, icon: List, label: t('admin.list_view') },
                ]).map(({ mode, icon: Icon, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => changeViewMode(mode)}
                    title={label}
                    aria-pressed={viewMode === mode}
                    className="p-[7px] transition-colors"
                    style={
                      viewMode === mode
                        ? { backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }
                        : { color: 'var(--muted-foreground)' }
                    }
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
              <AdminButton onClick={onCreateStory} adminVariant="primary" size="sm" className="flex items-center rounded-md px-3 py-1.5">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t('ui.create_story')}
              </AdminButton>
            </div>
          </>
        )}
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto px-3">
        {loading ? (
          <AdminLoading text={t('common.loading')} className="min-h-[320px]" />
        ) : hasNoStories || hasNoMatches ? (
          <div
            className="flex flex-col items-center justify-center rounded-lg border border-dashed px-4 py-20 text-center"
            style={{ borderColor: 'var(--border)', backgroundColor: 'color-mix(in srgb, var(--card) 50%, transparent)' }}
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)' }}>
              {hasNoStories ? (
                <BookOpen className="h-6 w-6" style={{ color: 'var(--muted-foreground)' }} />
              ) : (
                <Search className="h-6 w-6" style={{ color: 'var(--muted-foreground)' }} />
              )}
            </div>
            {hasNoStories ? (
              <>
                <h3 className="mb-1 text-sm font-semibold">{t('ui.no_story')}</h3>
                <p className="mb-4 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {t('admin.no_stories')}
                </p>
                <AdminButton onClick={onCreateStory} adminVariant="outline" size="sm" className="flex items-center gap-1.5 rounded-md">
                  <Plus className="h-3.5 w-3.5" />
                  {t('ui.create_story')}
                </AdminButton>
              </>
            ) : (
              <>
                <p className="mb-4 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {t('admin.no_albums_match_filters') || 'No stories match the current filters'}
                </p>
                {hasActiveFilters && (
                  <AdminButton
                    onClick={() => {
                      setSearchQuery('')
                      onStatusFilterChange('')
                    }}
                    adminVariant="outline"
                    size="sm"
                    className="flex items-center gap-1.5 rounded-md"
                  >
                    <X className="h-3.5 w-3.5" />
                    {t('admin.clear_filters')}
                  </AdminButton>
                )}
              </>
            )}
          </div>
        ) : effectiveViewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 pb-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredStories.map((story) => {
              const coverPhoto = getStoryCoverPhoto(story)
              const isSelected = selectedStoryId === story.id
              return (
                <div
                  key={story.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onEditStory(story)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onEditStory(story)
                    }
                  }}
                  className="group cursor-pointer overflow-hidden rounded-lg border transition-colors hover:border-primary/50"
                  style={{
                    borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                    backgroundColor: isSelected ? 'color-mix(in srgb, var(--primary) 6%, transparent)' : 'var(--card)',
                    boxShadow: isSelected ? '0 0 0 1px var(--primary)' : undefined,
                  }}
                >
                  {/* 封面区：状态角标 + 照片数 + 悬停操作 */}
                  <div className="relative aspect-[3/2] overflow-hidden" style={{ backgroundColor: 'var(--muted)' }}>
                    {coverPhoto ? (
                      <img
                        src={resolveAssetUrl(coverPhoto.thumbnailUrl || coverPhoto.url, cdnDomain)}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                        style={getStoryCoverImageStyle(story)}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <BookOpen className="h-7 w-7" style={{ color: 'var(--muted-foreground)' }} />
                      </div>
                    )}
                    <span
                      className="absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] backdrop-blur-sm"
                      style={
                        story.isPublished
                          ? { backgroundColor: 'color-mix(in srgb, var(--accent) 85%, transparent)', color: 'var(--accent-foreground)' }
                          : { backgroundColor: 'rgb(0 0 0 / 0.55)', color: 'rgb(255 255 255 / 0.9)' }
                      }
                    >
                      {story.isPublished ? t('admin.published') : t('admin.draft')}
                    </span>
                    {story.photos && story.photos.length > 0 ? (
                      <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm">
                        <ImageIcon className="h-3 w-3" />
                        {story.photos.length}
                      </span>
                    ) : null}
                    <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <AdminButton
                        onClick={(event) => {
                          event.stopPropagation()
                          onTogglePublish(story)
                        }}
                        adminVariant="iconOnDark"
                        title={story.isPublished ? t('story.unpublish') : t('story.publish')}
                      >
                        {story.isPublished ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </AdminButton>
                      <AdminButton
                        onClick={(event) => {
                          event.stopPropagation()
                          onEditStory(story)
                        }}
                        adminVariant="iconOnDark"
                        title={t('common.edit')}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </AdminButton>
                      <AdminButton
                        onClick={(event) => {
                          event.stopPropagation()
                          onRequestDelete(story.id)
                        }}
                        adminVariant="iconOnDarkDanger"
                        title={t('common.delete')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </AdminButton>
                    </div>
                  </div>

                  <div className="p-3">
                    <h4 className="truncate font-serif text-base transition-colors group-hover:text-primary">
                      {story.title || t('story.untitled')}
                    </h4>
                    <div
                      className="mt-1.5 flex items-center gap-x-4 font-mono text-[10px] uppercase tracking-wide"
                      style={{ color: 'var(--muted-foreground)' }}
                    >
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" />
                        {new Date(story.createdAt).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3 w-3" />
                        {countStoryCharacters(story.content)} {t('admin.characters')}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="space-y-2 pb-2">
            {filteredStories.map((story) => {
              const coverPhoto = getStoryCoverPhoto(story)
              const isSelected = selectedStoryId === story.id
              return (
                <ContextMenu key={story.id}>
                  <ContextMenuTrigger asChild>
                    <div
                      className={`group relative flex items-center gap-3 rounded-lg border transition-colors hover:border-primary/50 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}
                      style={{
                        borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                        backgroundColor: isSelected
                          ? 'color-mix(in srgb, var(--primary) 6%, transparent)'
                          : 'var(--card)',
                        boxShadow: isSelected ? '0 0 0 1px var(--primary)' : undefined,
                      }}
                    >
                      {statusBadge(story)}
                      {/* 封面帧 */}
                      <div
                        className={`shrink-0 cursor-pointer overflow-hidden rounded-md border ${compact ? 'h-11 w-14' : 'h-16 w-24'}`}
                        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)' }}
                        onClick={() => onEditStory(story)}
                      >
                        {coverPhoto ? (
                          <img
                            src={resolveAssetUrl(coverPhoto.thumbnailUrl || coverPhoto.url, cdnDomain)}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <BookOpen className={compact ? 'h-4 w-4' : 'h-5 w-5'} style={{ color: 'var(--muted-foreground)' }} />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onEditStory(story)}>
                        <div className={`flex items-center gap-2 ${compact ? 'mb-0.5' : 'mb-1'}`}>
                          <h4 className={`truncate font-serif transition-colors group-hover:text-primary ${compact ? 'pr-10 text-sm' : 'pr-12 text-lg'}`}>
                            {story.title || t('story.untitled')}
                          </h4>
                        </div>
                        <div
                          className={`flex flex-wrap items-center gap-y-1 font-mono text-[10px] uppercase tracking-wide ${compact ? 'gap-x-2.5' : 'gap-x-4'}`}
                          style={{ color: 'var(--muted-foreground)' }}
                        >
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3 w-3" />
                            {new Date(story.createdAt).toLocaleDateString()}
                          </span>
                          {compact ? null : (
                            <span className="flex items-center gap-1.5">
                              <FileText className="h-3 w-3" />
                              {countStoryCharacters(story.content)} {t('admin.characters')}
                            </span>
                          )}
                          {story.photos && story.photos.length > 0 ? (
                            <span className="flex items-center gap-1.5">
                              <ImageIcon className="h-3 w-3" />
                              {story.photos.length}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuLabel className="max-w-56 truncate">
                      {story.title || t('story.untitled')}
                    </ContextMenuLabel>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={() => onEditStory(story)}>
                      <Edit3 className="size-3.5" />
                      {t('common.edit')}
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => onTogglePublish(story)}>
                      {story.isPublished ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      {story.isPublished ? t('story.unpublish') : t('story.publish')}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onSelect={() => onRequestDelete(story.id)}>
                      <Trash2 className="size-3.5" />
                      {t('common.delete')}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
