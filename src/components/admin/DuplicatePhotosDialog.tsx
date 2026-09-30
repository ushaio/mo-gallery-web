'use client'

import { AlertTriangle, ExternalLink } from 'lucide-react'
import { AdminButton, AdminModal } from '@mo-gallery/admin-console'

/**
 * 上传前的重复照片处置弹窗。
 *
 * 本阶段起，弹窗本体（结构、观感、portal、Esc/遮罩关闭、右上角 ✕、滚动内容区与
 * 动作区布局）由共享包 `@mo-gallery/admin-console` 的 `AdminModal` 承担；本文件只
 * 保留 web 后台自己的**差异部分**（差异登记点③）：
 * - 文案键：`admin.duplicate_photos_found` / `admin.duplicate_photos_desc`（含
 *   `{count}` 占位）/ `admin.matches_existing` / `admin.view_original` /
 *   `admin.skip_duplicates` / `admin.upload_anyway` / `common.cancel`
 * - 图标：AlertTriangle（`tone="warn"`）
 * - 内容插槽：重复文件清单（缩略图 + 文件名 + 命中的已有照片 + 查看原图外链）
 * - 三个动作：取消（原 ✕ / 底部取消）、跳过重复、仍然上传
 *
 * 对外 props 与改造前一致，调用点零改动。
 */
export interface DuplicateInfo {
  fileId: string
  fileName: string
  existingPhoto: {
    id: string
    title: string
    thumbnailUrl: string | null
    url: string
    createdAt: string
  }
}

interface DuplicatePhotosDialogProps {
  open: boolean
  duplicates: DuplicateInfo[]
  onClose: () => void
  onSkipDuplicates: () => void
  onUploadAnyway: () => void
  t: (key: string) => string
}

export function DuplicatePhotosDialog({
  open,
  duplicates,
  onClose,
  onSkipDuplicates,
  onUploadAnyway,
  t,
}: DuplicatePhotosDialogProps) {
  if (!open || duplicates.length === 0) return null

  const desc = t('admin.duplicate_photos_desc').replace('{count}', String(duplicates.length))

  return (
    <AdminModal
      open
      tone="warn"
      icon={<AlertTriangle className="h-4 w-4" />}
      title={t('admin.duplicate_photos_found')}
      description={desc}
      onClose={onClose}
      footer={
        <>
          <AdminButton variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </AdminButton>
          <AdminButton variant="outline" onClick={onSkipDuplicates}>
            {t('admin.skip_duplicates')}
          </AdminButton>
          <AdminButton variant="primary" onClick={onUploadAnyway}>
            {t('admin.upload_anyway')}
          </AdminButton>
        </>
      }
    >
      <div className="space-y-3">
        {duplicates.map((dup) => (
          <div
            key={dup.fileId}
            className="flex items-center gap-4 p-3 bg-muted/30 border border-border/50 rounded"
          >
            {/* Existing photo thumbnail */}
            <div className="w-12 h-12 bg-muted overflow-hidden flex-shrink-0 rounded">
              {dup.existingPhoto.thumbnailUrl ? (
                // 缩略图来自任意存储后端（本地 / S3 / R2 / GitHub），48px 小图用
                // 原生 img 即可（next.config 已是 images.unoptimized）。
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={dup.existingPhoto.thumbnailUrl}
                  alt={dup.existingPhoto.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                  N/A
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{dup.fileName}</p>
              <p className="text-xs text-muted-foreground">
                {t('admin.matches_existing')}: {dup.existingPhoto.title}
              </p>
              <p className="text-xs text-muted-foreground/60">
                {new Date(dup.existingPhoto.createdAt).toLocaleDateString()}
              </p>
            </div>

            {/* View link */}
            <a
              href={dup.existingPhoto.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-primary"
              title={t('admin.view_original')}
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ))}
      </div>
    </AdminModal>
  )
}
