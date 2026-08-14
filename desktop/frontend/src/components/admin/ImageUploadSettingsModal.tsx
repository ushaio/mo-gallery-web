'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings2, X } from 'lucide-react'
import type { CompressionMode, CompressionFormat } from '@/lib/image-compress'
import { normalizeCompressionMode, normalizeCompressionFormat } from '@/lib/image-compress'
import { AdminButton } from '@/components/admin/AdminButton'
import { PhotoUploadParams, type PhotoUploadSettings } from '@/components/admin/PhotoUploadParams'

export interface UploadSettings {
  maxSizeMB?: number
  title?: string
  storyId?: string
  storageProvider?: string
  storageSourceId?: string
  storagePath?: string
  storagePathFull?: boolean
  compressionMode?: CompressionMode
  compressionFormat?: CompressionFormat
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
  settings?: Record<string, string> | null
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

function getInitialUploadSettings(initialSettings?: UploadSettings): PhotoUploadSettings {
  const compressionMode = normalizeCompressionMode(initialSettings?.compressionMode ?? 'compress')
  const compressionFormat = normalizeCompressionFormat(initialSettings?.compressionFormat)
  return {
    title: initialSettings?.title ?? '',
    categories: getInitialCategories(initialSettings),
    storyId: initialSettings?.storyId,
    albumIds: getInitialAlbumIds(initialSettings),
    storageSourceId: initialSettings?.storageSourceId,
    storagePath: initialSettings?.storagePath,
    storagePathFull: initialSettings?.storagePathFull,
    compressionEnabled: compressionMode !== 'none',
    compressionFormat,
    maxSizeMB: initialSettings?.maxSizeMB ?? 0,
    showFlag: initialSettings?.showFlag ?? true,
    privacyStripEnabled: Boolean(initialSettings?.stripGps),
  }
}

export function ImageUploadSettingsModal(props: ImageUploadSettingsModalProps) {
  const { isOpen, onClose } = props
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Remember the element that had focus before opening, so we can restore it on close
  if (isOpen && !wasOpenRef.current && typeof document !== 'undefined') {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  wasOpenRef.current = isOpen

  // Escape to close + Tab focus trap (same pattern as SimpleDeleteDialog)
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? [])
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
      previousFocusRef.current = null
    }
  }, [isOpen])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-[121] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="pointer-events-auto flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-background shadow-2xl outline-none"
            >
              <ImageUploadSettingsModalContent key={JSON.stringify(props.initialSettings ?? {})} {...props} />
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

function ImageUploadSettingsModalContent({
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
  const [uploadSettings, setUploadSettings] = useState<PhotoUploadSettings>(() => getInitialUploadSettings(initialSettings))

  const handleConfirm = () => {
    const settingsToSave: UploadSettings = {
      title: uploadSettings.title,
      storyId: uploadSettings.storyId,
      compressionMode: uploadSettings.compressionEnabled ? 'compress' : 'none',
      compressionFormat: uploadSettings.compressionFormat,
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

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-border p-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
          <Settings2 className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{t('admin.upload_settings')}</h2>
          <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
            {t('admin.upload_settings_hint')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium tabular-nums"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {pendingCount} {t('admin.files')}
          </span>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="rounded-md p-1.5 hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
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
          initialSettings={getInitialUploadSettings(initialSettings)}
          uploadError=""
          hideStorySelector={!!currentStoryId}
          initialStoryId={currentStoryId}
          embedded
        />
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 border-t border-border bg-background px-5 py-4">
        <AdminButton
          onClick={onClose}
          adminVariant="outline"
          size="lg"
          className="min-w-28 rounded-md"
        >
          {t('common.cancel')}
        </AdminButton>
        <AdminButton
          onClick={handleConfirm}
          adminVariant="primary"
          size="lg"
          className="min-w-36 rounded-md"
          disabled={!uploadSettings.storageSourceId}
        >
          {confirmLabel || t('admin.confirm_upload')}
        </AdminButton>
      </div>
    </>
  )
}
