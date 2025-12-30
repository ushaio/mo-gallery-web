'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAdmin } from '../layout'
import { UploadTab } from '../UploadTab'
import { StoryUploadTab } from '../StoryUploadTab'
import { Image as ImageIcon, BookOpen } from 'lucide-react'

type UploadMode = 'photos' | 'story'

export default function UploadPage() {
  const router = useRouter()
  const [uploadMode, setUploadMode] = useState<UploadMode>('photos')
  const {
    token,
    categories,
    settings,
    t,
    notify,
    refreshPhotos,
  } = useAdmin()

  const handleStoryCreated = (storyId: string) => {
    // Navigate to story editor
    router.push(`/admin/logs?editStory=${storyId}`)
  }

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-border pb-4">
        <button
          onClick={() => setUploadMode('photos')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all ${
            uploadMode === 'photos'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          {t('admin.upload_tab_photos')}
        </button>
        <button
          onClick={() => setUploadMode('story')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all ${
            uploadMode === 'story'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          {t('admin.upload_tab_story')}
        </button>
      </div>

      {/* Tab Content */}
      {uploadMode === 'photos' ? (
        <UploadTab
          token={token}
          categories={categories}
          settings={settings}
          t={t}
          notify={notify}
          onUploadSuccess={() => {
            refreshPhotos()
          }}
          onPreview={(item) => {
            const url = URL.createObjectURL(item.file)
            window.open(url, '_blank')
          }}
        />
      ) : (
        <StoryUploadTab
          token={token}
          categories={categories}
          settings={settings}
          t={t}
          notify={notify}
          onStoryCreated={handleStoryCreated}
        />
      )}
    </div>
  )
}
