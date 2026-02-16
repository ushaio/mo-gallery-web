'use client'

import { useAdmin } from '../layout'
import { AlbumsTab } from '@/app/admin/albums/AlbumsTab'
import { useSettings } from '@/contexts/SettingsContext'

/**
 * 相册管理页面
 * 从 Admin 布局获取公共状态，传递给 AlbumsTab 组件
 */
export default function AlbumsPage() {
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
    <AlbumsTab
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
