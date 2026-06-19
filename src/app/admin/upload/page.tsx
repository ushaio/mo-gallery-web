'use client'

import { useAdmin } from '../layout'
import { UploadTab } from '@/app/admin/upload/UploadTab'

export default function UploadPage() {
  const {
    token,
    categories,
    settings,
    t,
    notify,
    refreshPhotos,
  } = useAdmin()

  return (
    <div className="space-y-8">
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
