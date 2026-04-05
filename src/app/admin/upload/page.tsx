'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAdmin } from '../layout'
import { UploadTab } from '@/app/admin/upload/UploadTab'

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
    <div className="space-y-8">
      {/* Tab Switcher - temporarily hidden, only showing photos tab */}
      {/* <div className="flex space-x-1 border-b border-border">
        <AdminButton
          onClick={() => setUploadMode('photos')}
          className={`flex items-center gap-2 px-6 py-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
            uploadMode === 'photos'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          {t('admin.upload_tab_photos')}
        </AdminButton>
        <AdminButton
          onClick={() => setUploadMode('story')}
          className={`flex items-center gap-2 px-6 py-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
            uploadMode === 'story'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          {t('admin.upload_tab_story')}
        </AdminButton>
      </div> */}

      {/* Tab Content - only showing photos upload for now */}
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
          // Defer revoke to allow the new tab to load the blob
          setTimeout(() => URL.revokeObjectURL(url), 60_000)
        }}
      />
    </div>
  )
}

