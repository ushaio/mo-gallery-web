'use client'

import { useEffect, useState } from 'react'
import { Settings, Upload, X } from 'lucide-react'
import { getAdminAlbums, type AlbumDto } from '@/lib/api'
import { AdminButton } from '@/components/admin/AdminButton'

export interface UploadSettings {
  maxSizeMB?: number
  storageProvider?: string
  category?: string
  albumId?: string
}

interface ImageUploadSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (settings: UploadSettings) => void
  pendingCount: number
  t: (key: string) => string
  token: string | null
  initialSettings?: UploadSettings
  confirmLabel?: string
}

export function ImageUploadSettingsModal({
  isOpen,
  onClose,
  onConfirm,
  pendingCount,
  t,
  token,
  initialSettings,
  confirmLabel,
}: ImageUploadSettingsModalProps) {
  const [maxSizeMB, setMaxSizeMB] = useState('')
  const [storageProvider, setStorageProvider] = useState('')
  const [category, setCategory] = useState('')
  const [albumId, setAlbumId] = useState('')
  const [albums, setAlbums] = useState<AlbumDto[]>([])
  const [loadingAlbums, setLoadingAlbums] = useState(false)

  useEffect(() => {
    if (isOpen && token) {
      loadAlbums()
    }
  }, [isOpen, token])

  useEffect(() => {
    if (isOpen) {
      setMaxSizeMB(initialSettings?.maxSizeMB ? String(initialSettings.maxSizeMB) : '')
      setStorageProvider(initialSettings?.storageProvider || '')
      setCategory(initialSettings?.category || '')
      setAlbumId(initialSettings?.albumId || '')
      return
    }

    setMaxSizeMB('')
    setStorageProvider('')
    setCategory('')
    setAlbumId('')
  }, [initialSettings, isOpen])

  async function loadAlbums() {
    if (!token) return

    try {
      setLoadingAlbums(true)
      const data = await getAdminAlbums(token)
      setAlbums(data)
    } catch (error) {
      console.error('Failed to load albums:', error)
    } finally {
      setLoadingAlbums(false)
    }
  }

  function handleConfirm() {
    const settings: UploadSettings = {}

    if (maxSizeMB && parseFloat(maxSizeMB) > 0) {
      settings.maxSizeMB = parseFloat(maxSizeMB)
    }
    if (storageProvider) {
      settings.storageProvider = storageProvider
    }
    if (category.trim()) {
      settings.category = category.trim()
    }
    if (albumId) {
      settings.albumId = albumId
    }

    onConfirm(settings)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-lg border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-3">
            <Settings className="h-5 w-5 text-primary" />
            <h3 className="font-bold">{t('admin.upload_settings') || 'Upload Settings'}</h3>
          </div>
          <AdminButton
            onClick={onClose}
            adminVariant="icon"
            className="rounded-md p-2 hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </AdminButton>
        </div>

        <div className="space-y-5 p-6">
          <p className="text-sm text-muted-foreground">
            {t('admin.upload_settings_hint') || `即将上传 ${pendingCount} 张图片，可选配置上传参数。`}
          </p>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t('admin.compression_size') || 'Compression Size (MB)'}
              </label>
              <input
                type="number"
                min="0.5"
                max="20"
                step="0.5"
                value={maxSizeMB}
                onChange={(event) => setMaxSizeMB(event.target.value)}
                placeholder={t('admin.optional') || 'Optional'}
                className="w-full rounded-md border border-border bg-background p-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t('admin.storage_provider') || 'Storage Provider'}
              </label>
              <select
                value={storageProvider}
                onChange={(event) => setStorageProvider(event.target.value)}
                className="w-full rounded-md border border-border bg-background p-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="local">Local Storage</option>
                <option value="r2">Cloudflare R2</option>
                <option value="github">GitHub</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t('admin.category') || 'Category'}
              </label>
              <input
                type="text"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder={t('admin.optional') || 'Optional'}
                className="w-full rounded-md border border-border bg-background p-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t('admin.album') || 'Album'}
              </label>
              <select
                value={albumId}
                onChange={(event) => setAlbumId(event.target.value)}
                disabled={loadingAlbums}
                className="w-full rounded-md border border-border bg-background p-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              >
                <option value="">{t('admin.none') || 'Do not add to album'}</option>
                {albums.map((album) => (
                  <option key={album.id} value={album.id}>
                    {album.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border p-4">
          <AdminButton
            onClick={onClose}
            adminVariant="link"
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {t('common.cancel') || 'Cancel'}
          </AdminButton>
          <AdminButton
            onClick={handleConfirm}
            adminVariant="primary"
            size="md"
            className="flex items-center gap-2 rounded-md text-sm"
          >
            <Upload className="h-4 w-4" />
            {confirmLabel || t('admin.start_upload') || 'Start Upload'}
          </AdminButton>
        </div>
      </div>
    </div>
  )
}
