'use client'

import { useState, useRef, useCallback } from 'react'
import { X, Upload, Loader2, Minimize2 } from 'lucide-react'
import { compressImage, type CompressionMode } from '@/lib/image-compress'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminSelect } from '@/components/admin/AdminFormControls'

interface MissingFileInfo {
  photoId: string
  photoTitle: string
  storageKey: string
  storageProvider: string
  missingType?: 'original' | 'thumbnail' | 'both'
}

interface MissingFileUploadModalProps {
  isOpen: boolean
  fileInfo: MissingFileInfo | null
  token: string | null
  onClose: () => void
  onSuccess: () => void
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
}

export function MissingFileUploadModal({
  isOpen,
  fileInfo,
  token,
  onClose,
  onSuccess,
  t,
  notify,
}: MissingFileUploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [compressionMode, setCompressionMode] = useState<CompressionMode>('none')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith('image/')) return
    setFile(f)
    const url = URL.createObjectURL(f)
    setPreview(url)
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleUpload = async () => {
    if (!file || !fileInfo || !token) return

    setUploading(true)
    try {
      let uploadFile = file
      if (compressionMode !== 'none') {
        uploadFile = await compressImage(file, { mode: compressionMode })
      }

      const form = new FormData()
      form.set('file', uploadFile)

      const typeParam = fileInfo.missingType ? `?type=${fileInfo.missingType}` : ''
      const res = await fetch(`/api/admin/photos/${fileInfo.photoId}/reupload${typeParam}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Upload failed')
      }

      notify(t('admin.notify_success'), 'success')
      onSuccess()
      handleClose()
    } catch (err) {
      notify(err instanceof Error ? err.message : t('common.error'), 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleClose = () => {
    setFile(null)
    setPreview(null)
    setCompressionMode('none')
    onClose()
  }

  if (!isOpen || !fileInfo) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-background border border-border w-full max-w-lg mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest">{t('admin.storage_reupload')}</h3>
            <p className="text-xs text-muted-foreground mt-1 font-mono truncate max-w-[300px]">
              {fileInfo.photoTitle}
            </p>
          </div>
          <AdminButton onClick={handleClose} adminVariant="icon" className="p-2 hover:bg-muted">
            <X className="w-4 h-4" />
          </AdminButton>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* File Info */}
          <div className="p-4 bg-muted/30 border border-border text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('admin.storage_provider')}</span>
              <span className="font-medium uppercase">{fileInfo.storageProvider}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('admin.storage_file_key')}</span>
              <span className="font-mono truncate max-w-[200px]" title={fileInfo.storageKey}>
                {fileInfo.storageKey}
              </span>
            </div>
          </div>

          {/* Drop Zone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed transition-all cursor-pointer min-h-[200px] flex items-center justify-center ${
              isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground'
            }`}
          >
            {preview ? (
              <div className="relative w-full h-full p-4">
                <img src={preview} alt="" className="w-full h-48 object-contain" />
                <AdminButton
                  onClick={e => { e.stopPropagation(); setFile(null); setPreview(null) }}
                  adminVariant="iconDestructive"
                  className="absolute top-2 right-2 p-1 bg-background/80 hover:bg-destructive hover:text-white"
                >
                  <X className="w-3 h-3" />
                </AdminButton>
                <p className="text-center text-xs text-muted-foreground mt-2">{file?.name}</p>
              </div>
            ) : (
              <div className="text-center p-8">
                <Upload className="w-10 h-10 mx-auto mb-4 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">{t('admin.drop_here')}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">{t('admin.support_types')}</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>

          {/* Compression */}
          <div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Minimize2 className="w-3 h-3" />
              {t('admin.image_compression')}
            </label>
            <AdminSelect
              value={compressionMode}
              onChange={v => setCompressionMode(v as CompressionMode)}
              options={[
                { value: 'none', label: t('admin.compression_none') },
                { value: 'quality', label: t('admin.compression_quality') },
                { value: 'balanced', label: t('admin.compression_balanced') },
                { value: 'size', label: t('admin.compression_size') },
              ]}
            />
          </div>

          {/* Missing Type Info */}
          {fileInfo.missingType && fileInfo.missingType !== 'both' && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-xs text-amber-600 dark:text-amber-400">
              {fileInfo.missingType === 'original'
                ? t('admin.storage_missing_original_hint')
                : t('admin.storage_missing_thumbnail_hint')}
            </div>
          )}

          {/* Note */}
          <p className="text-xs text-muted-foreground">
            {t('admin.storage_reupload_hint')}
          </p>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-border">
          <AdminButton
            onClick={handleClose}
            adminVariant="outline"
            size="xl"
            className="flex-1"
          >
            {t('common.cancel')}
          </AdminButton>
          <AdminButton
            onClick={handleUpload}
            disabled={!file || uploading}
            adminVariant="primary"
            size="xl"
            className="flex-1 flex items-center justify-center gap-2 bg-foreground text-background hover:bg-primary hover:text-primary-foreground"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('admin.uploading')}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                {t('admin.start_upload')}
              </>
            )}
          </AdminButton>
        </div>
      </div>
    </div>
  )
}