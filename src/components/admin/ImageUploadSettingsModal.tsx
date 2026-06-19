'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { AdminSettingsDto } from '@/lib/api/types'
import type { CompressionMode } from '@/lib/image-compress'
import { normalizeCompressionMode } from '@/lib/image-compress'
import { AdminButton } from '@/components/admin/AdminButton'
import { PhotoUploadParams, type PhotoUploadSettings } from '@/components/admin/PhotoUploadParams'

export interface UploadSettings {
  maxSizeMB?: number
  storageProvider?: string
  storageSourceId?: string
  storagePath?: string
  storagePathFull?: boolean
  compressionMode?: CompressionMode
  showFlag?: boolean
  stripGps?: boolean
  categories?: string[]
  albumIds?: string[]
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
  settings?: AdminSettingsDto | null
  categories?: string[]
  currentStoryId?: string
}

function getInitialCategories(initialSettings?: UploadSettings) {
  if (initialSettings?.categories?.length) return initialSettings.categories
  if (initialSettings?.category?.trim()) return [initialSettings.category.trim()]
  return []
}

function getInitialAlbumIds(initialSettings?: UploadSettings) {
  if (initialSettings?.albumIds?.length) return initialSettings.albumIds
  if (initialSettings?.albumId) return [initialSettings.albumId]
  return []
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
  categories = [],
  currentStoryId,
}: ImageUploadSettingsModalProps) {
  const [uploadSettings, setUploadSettings] = useState<PhotoUploadSettings>({
    title: '',
    categories: [],
    compressionEnabled: true,
    maxSizeMB: 0,
    showFlag: true,
    privacyStripEnabled: false,
  })

  // Initialize settings when modal opens
  useEffect(() => {
    if (!isOpen) return

    const compressionMode = normalizeCompressionMode(initialSettings?.compressionMode ?? 'compress')

    setUploadSettings({
      title: '',
      categories: getInitialCategories(initialSettings),
      storyId: undefined,
      albumIds: getInitialAlbumIds(initialSettings),
      storageSourceId: initialSettings?.storageSourceId,
      storagePath: initialSettings?.storagePath,
      storagePathFull: initialSettings?.storagePathFull,
      compressionEnabled: compressionMode !== 'none',
      maxSizeMB: initialSettings?.maxSizeMB ?? 0,
      showFlag: initialSettings?.showFlag ?? true,
      privacyStripEnabled: Boolean(initialSettings?.stripGps),
    })
  }, [initialSettings, isOpen])

  const handleConfirm = () => {
    const settingsToSave: UploadSettings = {
      compressionMode: uploadSettings.compressionEnabled ? 'compress' : 'none',
      showFlag: uploadSettings.showFlag,
      stripGps: uploadSettings.privacyStripEnabled,
      categories: uploadSettings.categories,
      albumIds: uploadSettings.albumIds,
    }

    if (uploadSettings.compressionEnabled && uploadSettings.maxSizeMB > 0) {
      settingsToSave.maxSizeMB = uploadSettings.maxSizeMB
    }

    if (uploadSettings.storageSourceId) {
      settingsToSave.storageSourceId = uploadSettings.storageSourceId
    }

    if (uploadSettings.storagePath?.trim()) {
      settingsToSave.storagePath = uploadSettings.storagePath.trim()
    }

    if (uploadSettings.storagePathFull) {
      settingsToSave.storagePathFull = true
    }

    onConfirm(settingsToSave)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border px-8 py-6 flex items-center justify-between z-10">
          <h3 className="text-lg font-light tracking-wide">
            {t('admin.upload_settings')} ({pendingCount} {t('admin.files')})
          </h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - Hide upload button, we'll use footer buttons */}
        <div className="p-8">
          <div className="space-y-4">
            <PhotoUploadParams
              mode="digital"
              token={token}
              categories={categories}
              t={t}
              fileCount={pendingCount}
              totalOriginalSize={0}
              estimatedTotalSize={0}
              savingsPercent={0}
              compressionSuggestion={null}
              onSettingsChange={setUploadSettings}
              onUploadClick={handleConfirm}
              uploading={false}
              uploadError=""
              hideStorySelector={!!currentStoryId}
              initialStoryId={currentStoryId}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-background border-t border-border px-8 py-6 flex gap-4 z-10">
          <AdminButton
            onClick={onClose}
            adminVariant="outline"
            size="lg"
            className="flex-1 py-3"
          >
            {t('common.cancel')}
          </AdminButton>
          <AdminButton
            onClick={handleConfirm}
            adminVariant="primary"
            size="lg"
            className="flex-1 py-3"
          >
            {confirmLabel || t('admin.confirm_upload')}
          </AdminButton>
        </div>
      </div>
    </div>
  )
}
