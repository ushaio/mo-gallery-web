'use client'

import { useAdmin } from '../layout'
import { FilmRollsTab } from './FilmRollsTab'
import { useSettings } from '@/contexts/SettingsContext'

export default function FilmRollsPage() {
  const {
    token,
    photos,
    t,
    notify,
    handleUnauthorized,
    setSelectedPhoto: onPreview,
  } = useAdmin()
  const { settings } = useSettings()
  const cdnDomain = settings?.cdn_domain || ''

  return (
    <FilmRollsTab
      token={token}
      photos={photos}
      cdnDomain={cdnDomain}
      t={t}
      notify={notify}
      onUnauthorized={handleUnauthorized}
      onPreview={onPreview}
    />
  )
}
