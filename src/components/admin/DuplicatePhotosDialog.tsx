'use client'

import React from 'react'
import { X, AlertTriangle, ExternalLink } from 'lucide-react'
import { AdminButton } from './AdminButton'

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border w-full max-w-lg mx-4 shadow-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="text-lg font-light tracking-wide">
              {t('admin.duplicate_photos_found') || '发现重复图片'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-sm text-muted-foreground mb-4">
            {t('admin.duplicate_photos_desc') || 
              `以下 ${duplicates.length} 张图片已存在于图库中，您可以选择跳过这些重复图片或强制上传。`}
          </p>

          <div className="space-y-3">
            {duplicates.map((dup) => (
              <div
                key={dup.fileId}
                className="flex items-center gap-4 p-3 bg-muted/30 border border-border/50 rounded"
              >
                {/* Existing photo thumbnail */}
                <div className="w-12 h-12 bg-muted overflow-hidden flex-shrink-0 rounded">
                  {dup.existingPhoto.thumbnailUrl ? (
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
                    {t('admin.matches_existing') || '匹配已有图片'}: {dup.existingPhoto.title}
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
                  title={t('admin.view_original') || '查看原图'}
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-border">
          <AdminButton
            onClick={onClose}
            adminVariant="outline"
            size="lg"
            className="flex-1 py-3 text-sm font-medium"
          >
            {t('common.cancel') || '取消'}
          </AdminButton>
          <AdminButton
            onClick={onSkipDuplicates}
            adminVariant="outline"
            size="lg"
            className="flex-1 py-3 text-sm font-medium"
          >
            {t('admin.skip_duplicates') || '跳过重复'}
          </AdminButton>
          <AdminButton
            onClick={onUploadAnyway}
            adminVariant="primary"
            size="lg"
            className="flex-1 py-3 text-sm font-medium"
          >
            {t('admin.upload_anyway') || '仍然上传'}
          </AdminButton>
        </div>
      </div>
    </div>
  )
}