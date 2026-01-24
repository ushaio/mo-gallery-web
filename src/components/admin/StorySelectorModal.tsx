'use client'

import { useState, useEffect, useMemo } from 'react'
import { BookOpen, X, Search, Check } from 'lucide-react'
import { type StoryDto } from '@/lib/api'
import { AdminButton } from '@/components/admin/AdminButton'

interface StorySelectorModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (storyId: string | null, storyTitle?: string) => void
  stories: StoryDto[]
  selectedStoryId?: string
  loading?: boolean
  t: (key: string) => string
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function StorySelectorModal({
  isOpen,
  onClose,
  onSelect,
  stories,
  selectedStoryId,
  loading,
  t,
}: StorySelectorModalProps) {
  const [search, setSearch] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setSearch('')
    }
  }, [isOpen])

  const filteredStories = useMemo(() => {
    if (!search.trim()) return stories
    const q = search.toLowerCase()
    return stories.filter(s => s.title.toLowerCase().includes(q))
  }, [stories, search])

  const handleSelect = (story: StoryDto | null) => {
    onSelect(story?.id || null, story?.title)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-background border border-border shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <BookOpen className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-medium">{t('ui.photo_story')}</h3>
          </div>
          <AdminButton
            onClick={onClose}
            adminVariant="icon"
            className="p-1.5 hover:bg-muted"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </AdminButton>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={t('common.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-4 bg-muted/30 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </div>

        {/* Story List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {t('common.loading')}...
            </div>
          ) : (
            <div className="py-1">
              {/* No association option */}
              <button
                onClick={() => handleSelect(null)}
                onMouseEnter={() => setHoveredId('none')}
                onMouseLeave={() => setHoveredId(null)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  !selectedStoryId ? 'bg-primary/5' : hoveredId === 'none' ? 'bg-muted/50' : ''
                }`}
              >
                <div className={`size-4 rounded-full border-2 flex items-center justify-center ${
                  !selectedStoryId ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                }`}>
                  {!selectedStoryId && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </div>
                <span className="text-sm text-muted-foreground">{t('ui.no_association')}</span>
              </button>

              {/* Stories */}
              {filteredStories.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  {search ? t('common.no_results') : t('admin.no_stories')}
                </div>
              ) : (
                filteredStories.map(story => (
                  <button
                    key={story.id}
                    onClick={() => handleSelect(story)}
                    onMouseEnter={() => setHoveredId(story.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      selectedStoryId === story.id ? 'bg-primary/5' : hoveredId === story.id ? 'bg-muted/50' : ''
                    }`}
                  >
                    <div className={`size-4 rounded-full border-2 flex items-center justify-center ${
                      selectedStoryId === story.id ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                    }`}>
                      {selectedStoryId === story.id && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{story.title}</p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {formatDateTime(story.createdAt)}
                        <span className="mx-1.5">·</span>
                        {story.photos?.length || 0} {t('admin.photos')}
                        {!story.isPublished && (
                          <span className="ml-1.5 text-amber-600">({t('admin.draft')})</span>
                        )}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
