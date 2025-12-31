'use client'

import { useAdmin } from '../layout'
import { AlbumsTab } from '../AlbumsTab'

export default function AlbumsPage() {
  const { token, photos, t, notify, handleUnauthorized } = useAdmin()

  return (
    <AlbumsTab
      token={token}
      photos={photos}
      t={t}
      notify={notify}
      onUnauthorized={handleUnauthorized}
    />
  )
}
