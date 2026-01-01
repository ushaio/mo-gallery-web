'use client'

import React, { useState, useEffect } from 'react'
import { BookText, BookOpen } from 'lucide-react'
import { PhotoDto, PublicSettingsDto } from '@/lib/api'
import { BlogTab } from './BlogTab'
import { StoriesTab } from './StoriesTab'

interface LogsTabProps {
  token: string | null
  photos: PhotoDto[]
  settings: PublicSettingsDto | null
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  initialTab?: 'blog' | 'stories'
  editStoryId?: string
}

export function LogsTab({ token, photos, settings, t, notify, initialTab, editStoryId }: LogsTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'blog' | 'stories'>(initialTab || 'blog')

  // Update tab when initialTab changes (e.g., from URL params)
  useEffect(() => {
    if (initialTab) {
      setActiveSubTab(initialTab)
    }
  }, [initialTab])

  return (
    <div className="space-y-8">
      {/* Sub-tab Navigation */}
      <div className="flex space-x-1 border-b border-border">
        <button
          onClick={() => setActiveSubTab('blog')}
          className={`flex items-center gap-2 px-6 py-4 text-xs font-bold uppercase tracking-[0.2em] border-b-2 transition-colors ${
            activeSubTab === 'blog'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <BookText className="w-4 h-4" />
          博客
        </button>
        <button
          onClick={() => setActiveSubTab('stories')}
          className={`flex items-center gap-2 px-6 py-4 text-xs font-bold uppercase tracking-[0.2em] border-b-2 transition-colors ${
            activeSubTab === 'stories'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          叙事
        </button>
      </div>

      {/* Sub-tab Content */}
      <div>
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
      </div>
    </div>
  )
}
