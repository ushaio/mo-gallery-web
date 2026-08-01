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
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import type { SelectOption } from '@/components/admin/AdminFormControls'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminLoading } from '@/components/admin/AdminLoading'
import type { StoryDto } from '@/lib/api/types'
import { resolveAssetUrl } from '@/lib/api/core'
import { countStoryCharacters } from '@/lib/story-rich-content'

interface StoryListViewProps {
  stories: StoryDto[]
  loading: boolean
  statusFilter: string
  onStatusFilterChange: (value: string) => void
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
  onCreateStory,
  onEditStory,
  onTogglePublish,
  onRequestDelete,
  t,
  cdnDomain,
  onRefresh,
}: StoryListViewProps) {
  const [searchQuery, setSearchQuery] = useState('')

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

  const inputStyle = {
    borderColor: 'var(--border)',
    backgroundColor: 'var(--card)',
    color: 'var(--foreground)',
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden">
      {/* 工具栏：搜索 / 状态筛选 / 刷新 / 新建 */}
      <div
        className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b pb-4"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative">
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
          <AdminButton onClick={onCreateStory} adminVariant="primary" size="sm" className="flex items-center rounded-md px-3 py-1.5">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t('ui.create_story')}
          </AdminButton>
        </div>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {loading ? (
          <AdminLoading text={t('common.loading')} className="min-h-[320px]" />
        ) : (
          <div className="space-y-2">
            {filteredStories.map((story) => {
              const coverPhoto = story.coverPhotoId
                ? story.photos.find((p) => p.id === story.coverPhotoId) || story.photos[0]
                : story.photos[0]
              return (
                <div
                  key={story.id}
                  className="group flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors hover:border-primary/50"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
                >
                  {/* 封面帧 */}
                  <div
                    className="h-16 w-24 shrink-0 cursor-pointer overflow-hidden rounded-md border"
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
                        <BookOpen className="h-5 w-5" style={{ color: 'var(--muted-foreground)' }} />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onEditStory(story)}>
                    <div className="mb-1 flex items-center gap-3">
                      <h4 className="truncate font-serif text-lg transition-colors group-hover:text-primary">
                        {story.title || t('story.untitled')}
                      </h4>
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px]"
                        style={
                          story.isPublished
                            ? {
                                backgroundColor: 'var(--accent)',
                                color: 'var(--accent-foreground)',
                              }
                            : {
                                backgroundColor: 'var(--muted)',
                                color: 'var(--muted-foreground)',
                              }
                        }
                      >
                        {story.isPublished ? t('admin.published') : t('admin.draft')}
                      </span>
                    </div>
                    <div
                      className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[10px] uppercase tracking-wide"
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
                      {story.photos && story.photos.length > 0 ? (
                        <span className="flex items-center gap-1.5">
                          <ImageIcon className="h-3 w-3" />
                          {story.photos.length} {t('ui.photos_count')}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="ml-auto flex shrink-0 items-center gap-1.5 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <AdminButton
                      onClick={(event) => {
                        event.stopPropagation()
                        onTogglePublish(story)
                      }}
                      adminVariant="iconPrimary"
                      title={story.isPublished ? t('story.unpublish') : t('story.publish')}
                    >
                      {story.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </AdminButton>
                    <AdminButton
                      onClick={(event) => {
                        event.stopPropagation()
                        onEditStory(story)
                      }}
                      adminVariant="iconPrimary"
                    >
                      <Edit3 className="h-4 w-4" />
                    </AdminButton>
                    <AdminButton
                      onClick={(event) => {
                        event.stopPropagation()
                        onRequestDelete(story.id)
                      }}
                      adminVariant="iconDestructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </AdminButton>
                  </div>
                </div>
              )
            })}

            {hasNoStories ? (
              <div
                className="flex flex-col items-center justify-center rounded-lg border border-dashed px-4 py-20 text-center"
                style={{ borderColor: 'var(--border)', backgroundColor: 'color-mix(in srgb, var(--card) 50%, transparent)' }}
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)' }}>
                  <BookOpen className="h-6 w-6" style={{ color: 'var(--muted-foreground)' }} />
                </div>
                <h3 className="mb-1 text-sm font-semibold">{t('ui.no_story')}</h3>
                <p className="mb-4 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {t('admin.no_stories')}
                </p>
              </div>
            ) : hasNoMatches ? (
              <div
                className="flex flex-col items-center justify-center rounded-lg border border-dashed px-4 py-20 text-center"
                style={{ borderColor: 'var(--border)', backgroundColor: 'color-mix(in srgb, var(--card) 50%, transparent)' }}
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)' }}>
                  <Search className="h-6 w-6" style={{ color: 'var(--muted-foreground)' }} />
                </div>
                <h3 className="mb-2 text-sm font-semibold">{t('common.search')}</h3>
                <p className="mb-4 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {t('admin.no_albums_match_filters') || 'No stories match the current filters'}
                </p>
                {hasActiveFilters && (
                  <div className="flex items-center gap-2">
                    {!!searchQuery.trim() && (
                      <AdminButton
                        onClick={() => setSearchQuery('')}
                        adminVariant="outline"
                        size="sm"
                        className="flex items-center gap-1.5 rounded-md"
                      >
                        <X className="h-3.5 w-3.5" />
                        {t('common.search')}
                      </AdminButton>
                    )}
                    {!!statusFilter && (
                      <AdminButton
                        onClick={() => onStatusFilterChange('')}
                        adminVariant="outline"
                        size="sm"
                        className="flex items-center gap-1.5 rounded-md"
                      >
                        <X className="h-3.5 w-3.5" />
                        {t('admin.filter') || 'Filter'}
                      </AdminButton>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
