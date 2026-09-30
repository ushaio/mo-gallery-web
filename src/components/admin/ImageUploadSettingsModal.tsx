'use client'

import { useState } from 'react'
import { Settings2 } from 'lucide-react'
import { ConsoleButton, ConsoleModal } from '@mo-gallery/admin-console'
import type { AdminSettingsDto } from '@/lib/api/types'
import type { CompressionMode, CompressionFormat } from '@/lib/image-compress'
import { normalizeCompressionMode, normalizeCompressionFormat } from '@/lib/image-compress'
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
  tags?: string[]
  albumIds?: string[]
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
  tags?: string[]
  currentStoryId?: string
}

function getInitialTags(initialSettings?: UploadSettings) {
  if (initialSettings?.tags?.length) return initialSettings.tags
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
    title: '',
    tags: getInitialTags(initialSettings),
    storyId: undefined,
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

/**
 * 上传参数设置弹窗。
 *
 * 阶段 3 起，弹窗外壳（portal、遮罩、面板、头部、动作区、Esc/遮罩关闭）由共享包
 * `@mo-gallery/admin-console` 的 `ConsoleModal` 承担；本文件只保留 web 后台上传流程的
 * 表单内容（`PhotoUploadParams`）与设置聚合逻辑（`UploadSettings` 组装、仅在有值时
 * 回填压缩/存储字段、按 `storageSourceId` 决定确认可用）。对外 props 与改造前一字
 * 不差，调用点零改动。
 */
export function ImageUploadSettingsModal({ isOpen, ...props }: ImageUploadSettingsModalProps) {
  // 关闭即卸载：保持改造前「每次打开都用最新的 initialSettings 重建表单」的语义
  if (!isOpen) return null
  return (
    <ImageUploadSettingsModalContent
      key={JSON.stringify(props.initialSettings ?? {})}
      isOpen={isOpen}
      {...props}
    />
  )
}

function ImageUploadSettingsModalContent({
  isOpen,
  onClose,
  onConfirm,
  pendingCount,
  t,
  token,
  initialSettings,
  confirmLabel,
  tags = [],
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
      tags: uploadSettings.tags,
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
    <ConsoleModal
      open={isOpen}
      size="lg"
      title={t('admin.upload_settings')}
      eyebrow={`${pendingCount} ${t('admin.files')}`}
      description={t('admin.upload_settings_hint')}
      icon={<Settings2 className="h-4 w-4" />}
      onClose={onClose}
      footer={
        <>
          <ConsoleButton variant="outline" size="lg" className="min-w-28" onClick={onClose}>
            {t('common.cancel')}
          </ConsoleButton>
          <ConsoleButton
            variant="primary"
            size="lg"
            className="min-w-36"
            disabled={!uploadSettings.storageSourceId}
            onClick={handleConfirm}
          >
            {confirmLabel || t('admin.confirm_upload')}
          </ConsoleButton>
        </>
      }
    >
      <PhotoUploadParams
        mode="digital"
        token={token}
        tags={tags}
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
    </ConsoleModal>
  )
}
