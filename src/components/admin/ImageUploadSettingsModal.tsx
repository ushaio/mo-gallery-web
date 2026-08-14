'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Settings2, X } from 'lucide-react'
import type { AdminSettingsDto } from '@/lib/api/types'
import type { CompressionMode } from '@/lib/image-compress'
import { normalizeCompressionMode } from '@/lib/image-compress'
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

function getInitialUploadSettings(initialSettings?: UploadSettings): PhotoUploadSettings {
  const compressionMode = normalizeCompressionMode(initialSettings?.compressionMode ?? 'compress')
  return {
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
  }
}

export function ImageUploadSettingsModal({
  ...props
}: ImageUploadSettingsModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(props.onClose)

  useEffect(() => {
    onCloseRef.current = props.onClose
  }, [props.onClose])

  useEffect(() => {
    if (!props.isOpen) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])
      if (!focusable.length) return
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
  }, [props.isOpen])

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {props.isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-sm" onClick={props.onClose} />
          <div className="pointer-events-none fixed inset-0 z-[121] flex items-center justify-center p-4">
            <motion.div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1} initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }} className="pointer-events-auto flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-background shadow-2xl outline-none">
              <ImageUploadSettingsModalContent key={JSON.stringify(props.initialSettings ?? {})} {...props} />
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
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
      <div className="flex items-start gap-3 border-b border-border p-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary"><Settings2 className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{t('admin.upload_settings')}</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t('admin.upload_settings_hint')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium tabular-nums text-muted-foreground">{pendingCount} {t('admin.files')}</span>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="rounded-md p-1.5 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
      </div>
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
              uploadError=""
              hideStorySelector={!!currentStoryId}
              initialStoryId={currentStoryId}
              initialSettings={getInitialUploadSettings(initialSettings)}
              embedded
            />
      </div>
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
