'use client'

import {
  BookOpen,
  Calendar,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  History,
  Image as ImageIcon,
  Plus,
  Trash2,
} from 'lucide-react'
import type { SelectOption } from '@/components/admin/AdminFormControls'
import { AdminSelect } from '@/components/admin/AdminFormControls'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminLoading } from '@/components/admin/AdminLoading'
import type { StoryDto } from '@/lib/api'
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
}: StoryListViewProps) {
  const statusOptions: SelectOption[] = [
    { value: '', label: t('admin.all_status') },
    { value: 'published', label: t('admin.published') },
    { value: 'draft', label: t('admin.draft') },
  ]

  const filteredStories = stories.filter((story) => {
    if (!statusFilter) return true
    if (statusFilter === 'published') return story.isPublished
    if (statusFilter === 'draft') return !story.isPublished
    return true
  })

  return (
    <div className="flex flex-1 flex-col space-y-8 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border pb-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <input
            type="text"
            placeholder={t('admin.search_placeholder')}
            className="w-48 border border-border bg-background px-3 py-2 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <AdminSelect
            value={statusFilter}
            options={statusOptions}
            onChange={onStatusFilterChange}
            placeholder={t('admin.all_status')}
            className="w-32"
          />
        </div>
        <AdminButton onClick={onCreateStory} adminVariant="primary" size="lg" className="flex items-center">
          <Plus className="mr-2 h-4 w-4" />
          {t('ui.create_story')}
        </AdminButton>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {loading ? (
          <AdminLoading text={t('common.loading')} className="min-h-[320px]" />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredStories.map((story) => (
              <div
                key={story.id}
                className="group flex items-center justify-between border border-border bg-card px-5 py-5 transition-colors hover:border-primary/50"
              >
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onEditStory(story)}>
                  <div className="mb-2 flex items-center gap-3">
                    <h4 className="truncate text-lg font-semibold transition-colors group-hover:text-primary">
                      {story.title || t('story.untitled')}
                    </h4>
                    <span
                      className={`shrink-0 border px-2 py-0.5 text-[10px] font-bold uppercase ${
                        story.isPublished
                          ? 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400'
                          : 'border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {story.isPublished ? 'PUBLISHED' : 'DRAFT'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5" title="Created At">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(story.createdAt).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1.5" title="Updated At">
                      <History className="h-3.5 w-3.5" />
                      {new Date(story.updatedAt).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1.5" title="Word Count">
                      <FileText className="h-3.5 w-3.5" />
                      {countStoryCharacters(story.content)} {t('admin.characters')}
                    </span>
                    {story.photos && story.photos.length > 0 ? (
                      <span className="flex items-center gap-1.5" title="Photos">
                        <ImageIcon className="h-3.5 w-3.5" />
                        {story.photos.length} {t('ui.photos_count')}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5 opacity-100 transition-opacity duration-200 sm:gap-2 sm:opacity-0 sm:group-hover:opacity-100">
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
            ))}

            {stories.length === 0 ? (
              <div className="flex flex-col items-center justify-center border border-dashed border-border bg-card/50 px-4 py-20 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center border border-border bg-muted">
                  <BookOpen className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <h3 className="mb-1 text-sm font-semibold text-foreground">{t('ui.no_story')}</h3>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
