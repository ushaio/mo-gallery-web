'use client'

import { useMemo, useState } from 'react'
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
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import type { SelectOption } from '@/components/admin/AdminFormControls'
import { AdminSelect } from '@/components/admin/AdminFormControls'
import { AdminButton } from '@/components/admin/AdminButton'
import { ListSkeleton } from '@/components/admin/Skeleton'
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
  selectedStoryId?: string | null
  compact?: boolean
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
  selectedStoryId,
  compact = false,
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

  return (
    <div className={`flex flex-1 flex-col overflow-hidden ${compact ? 'gap-3' : 'space-y-8'}`}>
      <div className={`flex shrink-0 items-center border-b border-border ${compact ? 'gap-1.5 pb-3' : 'justify-between pb-4'}`}>
        {compact ? (
          <>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder={t('admin.search_placeholder')}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-[30px] w-full rounded-md border border-border bg-card px-3 pl-8 text-xs outline-none transition-colors focus:border-primary"
              />
            </div>
            <AdminSelect
              value={statusFilter}
              options={statusOptions}
              onChange={onStatusFilterChange}
              placeholder={t('admin.all_status')}
              className="w-28 shrink-0"
            />
            {onRefresh ? (
              <AdminButton onClick={onRefresh} adminVariant="outline" className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md p-0" title={t('common.refresh')}>
                <RefreshCw className="h-3.5 w-3.5" />
              </AdminButton>
            ) : null}
            <AdminButton onClick={onCreateStory} adminVariant="primary" className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md p-0" title={t('ui.create_story')}>
              <Plus className="h-4 w-4" />
            </AdminButton>
          </>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input type="text" placeholder={t('admin.search_placeholder')} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-9 w-56 rounded-md border border-border bg-card px-3 pl-8 text-sm outline-none transition-colors focus:border-primary" />
              </div>
              <AdminSelect value={statusFilter} options={statusOptions} onChange={onStatusFilterChange} placeholder={t('admin.all_status')} className="w-32" />
            </div>
            <div className="flex items-center gap-2">
              {onRefresh ? <AdminButton onClick={onRefresh} adminVariant="outline" size="sm" className="flex items-center rounded-md" title={t('common.refresh')}><RefreshCw className="h-3.5 w-3.5" /></AdminButton> : null}
              <AdminButton onClick={onCreateStory} adminVariant="primary" size="sm" className="flex items-center rounded-md"><Plus className="mr-1.5 h-3.5 w-3.5" />{t('ui.create_story')}</AdminButton>
            </div>
          </>
        )}
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6"><ListSkeleton count={5} /></div>
        ) : (
          <div className={`grid grid-cols-1 ${compact ? 'gap-1.5' : 'gap-4'}`}>
            {filteredStories.map((story) => {
              const coverPhoto = story.coverPhotoId
                ? story.photos.find((photo) => photo.id === story.coverPhotoId) || story.photos[0]
                : story.photos[0]
              const isSelected = selectedStoryId === story.id
              return (
                <div
                  key={story.id}
                  className={`group relative flex items-center transition-colors hover:border-primary/50 ${compact ? 'gap-2.5 rounded-md px-2.5 py-2' : 'gap-5 border px-5 py-5 sm:gap-6'} ${isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-card'}`}
                >
                  <div className={`${compact ? 'h-11 w-14 rounded-md' : 'hidden h-16 w-24 sm:block'} shrink-0 cursor-pointer overflow-hidden border border-border/70 bg-muted`} onClick={() => onEditStory(story)}>
                    {coverPhoto ? (
                      <img src={resolveAssetUrl(coverPhoto.thumbnailUrl || coverPhoto.url, cdnDomain)} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center"><BookOpen className={compact ? 'h-4 w-4 text-muted-foreground/60' : 'h-5 w-5 text-muted-foreground/60'} /></div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 cursor-pointer pr-1" onClick={() => onEditStory(story)}>
                    <div className={`flex items-center gap-2 ${compact ? 'mb-1' : 'mb-2'}`}>
                      <h4 className={`${compact ? 'pr-10 text-sm' : 'pr-12 text-lg'} truncate font-serif transition-colors group-hover:text-primary`}>
                        {story.title || t('story.untitled')}
                      </h4>
                    </div>
                    <div className={`flex flex-wrap items-center gap-y-1 text-[10px] uppercase tracking-wide text-muted-foreground ${compact ? 'gap-x-3' : 'gap-x-6 text-xs'}`}>
                      <span className="flex items-center gap-1.5" title="Created At"><Calendar className="h-3 w-3" />{new Date(story.createdAt).toLocaleDateString()}</span>
                      <span className={`${compact ? 'hidden' : 'flex'} items-center gap-1.5`} title="Updated At"><History className="h-3 w-3" />{new Date(story.updatedAt).toLocaleString()}</span>
                      <span className={`${compact ? 'hidden' : 'flex'} items-center gap-1.5`} title={t('admin.characters')}><FileText className="h-3 w-3" />{countStoryCharacters(story.content)} {t('admin.characters')}</span>
                      {story.photos && story.photos.length > 0 ? <span className="flex items-center gap-1.5" title={t('story.material_library')}><ImageIcon className="h-3 w-3" />{story.photos.length}</span> : null}
                    </div>
                  </div>

                  <span className={`absolute right-2 top-1.5 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${story.isPublished ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {story.isPublished ? t('admin.published') : t('admin.draft')}
                  </span>

                  <div className={`${compact ? 'absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100' : 'ml-auto opacity-100 sm:opacity-0 sm:group-hover:opacity-100'} flex shrink-0 items-center gap-0.5 transition-opacity`}>
                    <AdminButton onClick={(event) => { event.stopPropagation(); onTogglePublish(story) }} adminVariant="iconPrimary" className={compact ? 'p-1' : undefined} title={story.isPublished ? t('story.unpublish') : t('story.publish')}>
                      {story.isPublished ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </AdminButton>
                    <AdminButton onClick={(event) => { event.stopPropagation(); onEditStory(story) }} adminVariant="iconPrimary" className={compact ? 'p-1' : undefined} title={t('common.edit')}><Edit3 className="h-3.5 w-3.5" /></AdminButton>
                    <AdminButton onClick={(event) => { event.stopPropagation(); onRequestDelete(story.id) }} adminVariant="iconDestructive" className={compact ? 'p-1' : undefined} title={t('common.delete')}><Trash2 className="h-3.5 w-3.5" /></AdminButton>
                  </div>
                </div>
              )
            })}

            {stories.length === 0 ? (
              <div className="flex flex-col items-center justify-center border border-dashed border-border bg-card/50 px-4 py-20 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center border border-border bg-muted">
                  <BookOpen className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <h3 className="mb-1 text-sm font-semibold text-foreground">{t('ui.no_story')}</h3>
              </div>
            ) : filteredStories.length === 0 ? (
              <div className="flex flex-col items-center justify-center border border-dashed border-border bg-card/50 px-4 py-20 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center border border-border bg-muted">
                  <BookOpen className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  {t('common.search')}
                </h3>
                <p className="mb-4 text-xs text-muted-foreground">
                  {t('admin.no_albums_match_filters') || 'No stories match the current filters'}
                </p>
                {hasActiveFilters && (
                  <div className="flex items-center gap-2">
                    {!!searchQuery.trim() && (
                      <AdminButton
                        onClick={() => setSearchQuery('')}
                        adminVariant="outline"
                        size="sm"
                        className="flex items-center gap-1.5"
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
                        className="flex items-center gap-1.5"
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
