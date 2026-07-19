
'use client'

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  Upload,
  Loader2,
  X,
  Trash2,
  Plus,
  GripVertical,
  Eye,
  CloudUpload,
  AlertTriangle,
  ExternalLink,
  Camera,
  Film,
  Zap,
  MapPinOff,
  Minimize2,
} from 'lucide-react'
import type { AdminSettingsDto, AlbumDto } from '@/lib/api/types'
import { checkDuplicatePhotos } from '@/lib/api/photos'
import { getAdminAlbums } from '@/lib/api/albums'
import { compressImage } from '@/lib/image-compress'
import { calculateFileHashes } from '@/lib/file-hash'
import { useUploadQueue } from '@/contexts/UploadQueueContext'
import { formatFileSize } from '@/lib/utils'
import { AdminButton } from '@/components/admin/AdminButton'
import { DuplicatePhotosDialog, type DuplicateInfo } from '@/components/admin/DuplicatePhotosDialog'
import { PhotoUploadParams, type PhotoUploadSettings } from '@/components/admin/PhotoUploadParams'

interface UploadTabProps {
  token: string | null
  categories: string[]
  settings: AdminSettingsDto | null
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  onUploadSuccess: () => void
  onPreview: (file: { id: string, file: File }) => void
}

interface UploadFile {
  id: string
  file: File
  preview?: string
}

// Confirmation Modal Component
function ConfirmModal({
  open,
  onClose,
  onConfirm,
  fileCount,
  categories,
  albumNames,
  storyName,
  storageProvider,
  storagePath,
  compressionEnabled,
  privacyStripEnabled,
  t
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  fileCount: number
  categories: string[]
  albumNames: string[]
  storyName?: string
  storageProvider: string
  storagePath?: string
  compressionEnabled: boolean
  privacyStripEnabled: boolean
  t: (key: string) => string
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border w-full max-w-md mx-4 p-8 shadow-2xl">
        <h3 className="text-lg font-light tracking-wide mb-6">{t('admin.confirm_upload')}</h3>
        
        <div className="space-y-4 mb-8">
          <div className="flex justify-between py-3 border-b border-border/50">
            <span className="text-muted-foreground text-sm">{t('admin.files')}</span>
            <span className="font-medium">{fileCount}</span>
          </div>
          {categories.length > 0 && (
            <div className="flex justify-between py-3 border-b border-border/50">
              <span className="text-muted-foreground text-sm">{t('admin.categories')}</span>
              <span className="font-medium">{categories.join(', ')}</span>
            </div>
          )}
          {albumNames.length > 0 && (
            <div className="flex justify-between py-3 border-b border-border/50">
              <span className="text-muted-foreground text-sm">{t('admin.albums')}</span>
              <span className="font-medium">{albumNames.join(', ')}</span>
            </div>
          )}
          {storyName && (
            <div className="flex justify-between py-3 border-b border-border/50">
              <span className="text-muted-foreground text-sm">{t('ui.photo_story')}</span>
              <span className="font-medium">{storyName}</span>
            </div>
          )}
          <div className="flex justify-between py-3 border-b border-border/50">
            <span className="text-muted-foreground text-sm">{t('admin.storage_provider')}</span>
            <span className="font-medium capitalize">{storageProvider}</span>
          </div>
          {storagePath && (
            <div className="flex justify-between py-3 border-b border-border/50">
              <span className="text-muted-foreground text-sm">{t('admin.path_prefix')}</span>
              <span className="font-medium font-mono text-xs">{storagePath}</span>
            </div>
          )}
          <div className="flex justify-between py-3 border-b border-border/50">
            <span className="text-muted-foreground text-sm flex items-center gap-2">
              <MapPinOff className="w-3 h-3" />
              {t('admin.privacy_strip') || '隐私擦除'}
            </span>
            <span className={`font-medium ${privacyStripEnabled ? 'text-primary' : ''}`}>
              {privacyStripEnabled ? t('common.enabled') : t('common.disabled')}
            </span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-muted-foreground text-sm">{t('admin.image_compression')}</span>
       <span className="font-medium">{compressionEnabled ? t('common.enabled') : t('common.disabled')}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <AdminButton
            onClick={onClose}
            adminVariant="outline"
            size="lg"
            className="flex-1 py-3 text-sm font-medium"
          >
            {t('common.cancel')}
          </AdminButton>
          <AdminButton
            onClick={onConfirm}
            adminVariant="primary"
            size="lg"
            className="flex-1 py-3 bg-foreground text-background text-sm font-medium hover:bg-primary hover:text-primary-foreground flex items-center justify-center gap-2"
          >
            <CloudUpload className="w-4 h-4" />
            {t('admin.start_upload')}
       </AdminButton>
        </div>
      </div>
    </div>
    )
  }

// Draggable File Item
function DraggableFileItem({
  item,
  index,
  selected,
  duplicateInfo,
  estimatedSize,
  isActualSize,
  onSelect,
  onRemove,
  onPreview,
  onTestCompression,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
  t,
}: {
  item: UploadFile
  index: number
  selected: boolean
  duplicateInfo?: DuplicateInfo
  estimatedSize?: number
  isActualSize?: boolean
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onPreview: (item: UploadFile) => void
  onTestCompression?: (item: UploadFile) => void
  onDragStart: (e: React.DragEvent, index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDrop: (e: React.DragEvent) => void
  isDragging: boolean
  t: (key: string) => string
}) {
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(item.file)
    let revoked = false
    const img = new Image()
    img.src = url
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const maxSize = 80
      let w = img.width, h = img.height
      if (w > h) { if (w > maxSize) { h *= maxSize / w; w = maxSize } }
      else { if (h > maxSize) { w *= maxSize / h; h = maxSize } }
      canvas.width = w
      canvas.height = h
      ctx?.drawImage(img, 0, 0, w, h)
      setPreview(canvas.toDataURL('image/webp', 0.7))
      if (!revoked) { URL.revokeObjectURL(url); revoked = true }
    }
    return () => { if (!revoked) { URL.revokeObjectURL(url); revoked = true } }
  }, [item.file])

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={onDrop}
      className={`group flex items-center gap-4 p-4 bg-background border transition-all cursor-move ${
        isDragging ? 'opacity-50 border-primary' : 'border-transparent hover:border-border'
      } ${selected ? 'bg-primary/5' : ''} ${duplicateInfo ? 'border-amber-300/60 bg-amber-50/20' : ''}`}
    >
      <div className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">
        <GripVertical className="w-4 h-4" />
      </div>
      
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onSelect(item.id)}
        className="w-4 h-4 accent-primary cursor-pointer"
      />

      <div 
        className="w-14 h-14 bg-muted/50 overflow-hidden flex-shrink-0 cursor-pointer group/img relative"
        onClick={() => onPreview(item)}
      >
        {preview ? (
          <img src={preview} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity">
          <Eye className="w-4 h-4 text-white" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.file.name}</p>
        <p className="text-xs text-muted-foreground font-mono tabular-nums">
          {formatFileSize(item.file.size)}
          {estimatedSize !== undefined && estimatedSize < item.file.size && (
            <>
              <span className="mx-1 text-muted-foreground/50">→</span>
              <span className="text-primary">
                {isActualSize ? '' : '~'}{formatFileSize(estimatedSize)}
              </span>
              <span className="ml-1.5 text-[10px] text-emerald-600 dark:text-emerald-500">
                ↓{Math.round((1 - estimatedSize / item.file.size) * 100)}%
              </span>
            </>
          )}
        </p>
        {duplicateInfo && (
          <div className="mt-1 flex items-center gap-2 text-[10px] text-amber-600">
            <AlertTriangle className="w-3 h-3" />
            <span>{t('admin.duplicate_found')}</span>
            <a
              href={duplicateInfo.existingPhoto.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-800"
              title={duplicateInfo.existingPhoto.title}
            >
              {duplicateInfo.existingPhoto.thumbnailUrl ? (
                <img
                  src={duplicateInfo.existingPhoto.thumbnailUrl}
                  alt={duplicateInfo.existingPhoto.title}
                  className="w-5 h-5 rounded border border-amber-200/60 object-cover"
                />
              ) : (
                <ExternalLink className="w-3 h-3" />
              )}
              <span className="max-w-[120px] truncate">{duplicateInfo.existingPhoto.title}</span>
            </a>
          </div>
        )}
      </div>

      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
        {onTestCompression && (
          <AdminButton
            onClick={() => onTestCompression(item)}
            adminVariant="link"
            size="sm"
            className="p-2 text-muted-foreground/60 hover:text-primary"
            title={t('admin.compression_test') || '试压一下'}
          >
            <Zap className="w-4 h-4" />
          </AdminButton>
        )}
        <AdminButton
          onClick={() => onRemove(item.id)}
          adminVariant="iconDestructive"
          size="sm"
          className="p-2 text-muted-foreground/50"
        >
          <X className="w-4 h-4" />
        </AdminButton>
      </div>
    </div>
  )
}

// Test Compression Modal - runs compression on a single file and shows before/after
function TestCompressionModal({
  file,
  maxSizeMB,
  onClose,
  onResult,
  t,
}: {
  file: UploadFile | null
  maxSizeMB: number
  onClose: () => void
  onResult?: (fileId: string, compressedSize: number) => void
  t: (key: string) => string
}) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ compressed: File; durationMs: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null)
  const [afterUrl, setAfterUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file) return
    setRunning(true)
    setResult(null)
    setError(null)
    if (beforeUrl) URL.revokeObjectURL(beforeUrl)
    if (afterUrl) URL.revokeObjectURL(afterUrl)
    setBeforeUrl(URL.createObjectURL(file.file))
    setAfterUrl(null)

    const start = performance.now()
    compressImage(file.file, {
      mode: 'compress',
      maxSizeMB: maxSizeMB > 0 ? maxSizeMB : undefined,
    })
      .then(compressed => {
        setResult({ compressed, durationMs: performance.now() - start })
        setAfterUrl(URL.createObjectURL(compressed))
        onResult?.(file.id, compressed.size)
      })
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setRunning(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, maxSizeMB])

  useEffect(() => {
    return () => {
      if (beforeUrl) URL.revokeObjectURL(beforeUrl)
      if (afterUrl) URL.revokeObjectURL(afterUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!file) return null

  const savings = result ? Math.round((1 - result.compressed.size / file.file.size) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border w-full max-w-2xl mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-sm font-medium tracking-wide flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            {t('admin.compression_test_title') || '压缩预览'}
          </h3>
          <button onClick={onClose} className="text-muted-foreground/60 hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 gap-4">
            {/* Before */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                {t('admin.compression_test_before') || '原图'}
              </div>
              <div className="aspect-square bg-muted/30 overflow-hidden flex items-center justify-center">
                {beforeUrl && <img src={beforeUrl} alt="" className="w-full h-full object-contain" />}
              </div>
              <div className="mt-2 space-y-0.5">
                <div className="text-sm font-mono tabular-nums">{formatFileSize(file.file.size)}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{file.file.type || 'unknown'}</div>
              </div>
            </div>

            {/* After */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                {t('admin.compression_test_after') || '压缩后'}
              </div>
              <div className="aspect-square bg-muted/30 overflow-hidden flex items-center justify-center">
                {running ? (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span className="text-[10px]">{t('admin.compressing') || '压缩中'}</span>
                  </div>
                ) : error ? (
                  <div className="text-xs text-destructive p-4 text-center">{error}</div>
                ) : afterUrl ? (
                  <img src={afterUrl} alt="" className="w-full h-full object-contain" />
                ) : null}
              </div>
              <div className="mt-2 space-y-0.5">
                {result ? (
                  <>
                    <div className="text-sm font-mono tabular-nums flex items-center gap-2">
                      {formatFileSize(result.compressed.size)}
                      {savings > 0 && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-500 tabular-nums">
                          ↓{savings}%
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {result.compressed.type} · {Math.round(result.durationMs)}ms
                    </div>
                  </>
                ) : (
                  <div className="h-[34px]" />
                )}
              </div>
            </div>
          </div>

         {/* Settings used */}
         <div className="mt-5 pt-4 border-t border-border/50 flex justify-end text-[10px]">
        <div className="flex justify-between">
        <span className="text-muted-foreground">{t('admin.compression_size_label')}</span>
        <span className="font-mono tabular-nums">{maxSizeMB.toFixed(1)} MB</span>
         </div>
         </div>
     </div>
    </div>
    </div>
   )
  }

export function UploadTab({
  token,
  categories,
  settings,
  t,
  notify,
  onPreview,
}: UploadTabProps) {
  const { addTasks } = useUploadQueue()

  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDragging, setIsDragging] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  // Upload type: digital or film
  const [uploadType, setUploadType] = useState<'digital' | 'film'>('digital')

  // Settings from child component
  const [uploadSettings, setUploadSettings] = useState<PhotoUploadSettings>({
    title: '',
    categories: [],
    compressionEnabled: false,
    maxSizeMB: 0,
    showFlag: true,
    privacyStripEnabled: false,
  })

  const [albums, setAlbums] = useState<AlbumDto[]>([])
  useEffect(() => {
    if (!token) return
    let cancelled = false
    getAdminAlbums(token).then(data => { if (!cancelled) setAlbums(data) }).catch(() => {})
    return () => { cancelled = true }
  }, [token])

  const albumNameMap = useMemo(() => {
    const map = new Map<string, string>()
    albums.forEach(a => map.set(a.id, a.name))
    return map
  }, [albums])

  const [testCompressionFile, setTestCompressionFile] = useState<UploadFile | null>(null)
  const [testedSizeMap, setTestedSizeMap] = useState<Map<string, number>>(new Map())

  // Invalidate cached test results whenever compression settings change
  const currentSettings = uploadSettings
  useEffect(() => {
    setTestedSizeMap(new Map())
  }, [currentSettings.maxSizeMB, currentSettings.compressionEnabled])

  // Duplicate check
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [duplicateProgress, setDuplicateProgress] = useState({ current: 0, total: 0 })
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [duplicateInfos, setDuplicateInfos] = useState<DuplicateInfo[]>([])
  const [fileHashMap, setFileHashMap] = useState<Map<string, string>>(new Map())
  const [pendingUploadFiles, setPendingUploadFiles] = useState<UploadFile[]>([])

  const [uploadError, setUploadError] = useState('')

  const duplicateInfoMap = useMemo(() => {
    const map = new Map<string, DuplicateInfo>()
    duplicateInfos.forEach(info => map.set(info.fileId, info))
    return map
  }, [duplicateInfos])

  const totalOriginalSize = useMemo(
    () => uploadFiles.reduce((sum, f) => sum + f.file.size, 0),
    [uploadFiles]
  )

  const estimateFileSize = useCallback((file: File): number => {
    if (!currentSettings.compressionEnabled) return file.size
    if (currentSettings.maxSizeMB <= 0) return Math.min(file.size * 0.7, file.size)
    const target = currentSettings.maxSizeMB * 1024 * 1024
    if (file.size <= target) return file.size
    return Math.min(file.size * 0.45, target)
  }, [currentSettings.compressionEnabled, currentSettings.maxSizeMB])

  const estimatedTotalSize = useMemo(() => {
    if (!currentSettings.compressionEnabled || uploadFiles.length === 0) return totalOriginalSize
    return uploadFiles.reduce((sum, f) => {
      const tested = testedSizeMap.get(f.id)
      return sum + (tested ?? estimateFileSize(f.file))
    }, 0)
  }, [uploadFiles, currentSettings.compressionEnabled, totalOriginalSize, estimateFileSize, testedSizeMap])

  const savingsPercent = useMemo(() => {
    if (!currentSettings.compressionEnabled || totalOriginalSize === 0) return 0
    return Math.round((1 - estimatedTotalSize / totalOriginalSize) * 100)
  }, [currentSettings.compressionEnabled, totalOriginalSize, estimatedTotalSize])

  const compressionSuggestion = useMemo(() => {
    if (uploadFiles.length === 0) return null
    const targetBytes = currentSettings.maxSizeMB * 1024 * 1024
    const filesUnderTarget = uploadFiles.filter(f => f.file.size <= targetBytes).length
    const filesOverTarget = uploadFiles.length - filesUnderTarget
    const avgSize = totalOriginalSize / uploadFiles.length

    if (!currentSettings.compressionEnabled) {
      // Off + most files would benefit
      if (avgSize > 5 * 1024 * 1024) {
        return { type: 'suggest_enable' as const, text: t('admin.compression_suggest_enable') || '图片较大，启用压缩可显著节省体积' }
      }
      // Off + all small
      if (avgSize < 1024 * 1024) {
        return { type: 'info' as const, text: t('admin.compression_already_small') || '图片已较小，可保持关闭' }
      }
      return null
    }

    if (currentSettings.maxSizeMB <= 0) return null

    // On + all already small
    if (filesUnderTarget === uploadFiles.length) {
      return { type: 'suggest_disable' as const, text: t('admin.compression_suggest_disable') || '所有图片已小于上限，可关闭压缩' }
    }

    // On + mixed
    if (filesUnderTarget > 0) {
      const tmpl = t('admin.compression_partial_skip') || '{under}/{total} 张已小于上限，将原样上传'
      return { type: 'info' as const, text: tmpl.replace('{under}', String(filesUnderTarget)).replace('{total}', String(uploadFiles.length)) }
    }

    // On + all need compression: silence
    if (filesOverTarget === uploadFiles.length) return null
    return null
  }, [uploadFiles, currentSettings.compressionEnabled, currentSettings.maxSizeMB, totalOriginalSize, t])
  
  const checkDuplicatesForFiles = async (files: UploadFile[]) => {
    if (!token || files.length === 0) return
    setCheckingDuplicates(true)
    setDuplicateProgress({ current: 0, total: files.length })
    
    const hashInput = files.map(f => ({ id: f.id, file: f.file }))
    const hashResults = await calculateFileHashes(hashInput)
    
    const nextHashMap = new Map(fileHashMap)
    hashResults.forEach((hash, id) => nextHashMap.set(id, hash))
    setFileHashMap(nextHashMap)
    
    setDuplicateProgress({ current: files.length, total: files.length })
    
    const hashes = files
      .map(f => nextHashMap.get(f.id))
      .filter((hash): hash is string => Boolean(hash))
    
    const fileIdSet = new Set(files.map(f => f.id))
    
    if (hashes.length > 0) {
      try {
        const result = await checkDuplicatePhotos(token, hashes)
        const newDuplicates: DuplicateInfo[] = []
        
        if (result.hasDuplicates) {
          for (const file of files) {
            const hash = nextHashMap.get(file.id)
            if (!hash) continue
            const existing = result.duplicates[hash]
            if (existing) {
              newDuplicates.push({
                fileId: file.id,
                fileName: file.file.name,
                existingPhoto: {
                  ...existing,
                  createdAt: String(existing.createdAt),
                },
              })
            }
          }
        }
        
        setDuplicateInfos(prev => {
          const remaining = prev.filter(d => !fileIdSet.has(d.fileId))
          return [...remaining, ...newDuplicates]
        })
      } catch (err) {
        console.error('Failed to check duplicates:', err)
      }
    } else {
      setDuplicateInfos(prev => prev.filter(d => !fileIdSet.has(d.fileId)))
    }
    
    setCheckingDuplicates(false)
  }
  
  const addUploadFiles = (files: File[]) => {
    const MAX_FRONTEND_SIZE = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 50) * 1024 * 1024
    const imageFiles = files.filter(f => {
      if (!f.type.startsWith('image/') || f.type === 'image/svg+xml') return false
      return true
    })

    const oversized = files.filter(f => f.type.startsWith('image/') && f.size > MAX_FRONTEND_SIZE)
    const svgFiles = files.filter(f => f.type === 'image/svg+xml')
    if (oversized.length > 0) {
      notify(`${oversized.length} file(s) exceed 100 MB limit and were skipped`, 'error')
    }
    if (svgFiles.length > 0) {
      notify(`${svgFiles.length} SVG file(s) skipped (not supported)`, 'info')
    }

    const validFiles = imageFiles.filter(f => f.size <= MAX_FRONTEND_SIZE)
    if (!validFiles.length) return

    const existingFileKeys = new Set(uploadFiles.map(f => `${f.file.name}::${f.file.size}::${f.file.lastModified}`))

    const newItems = validFiles
      .filter(f => !existingFileKeys.has(`${f.name}::${f.size}::${f.lastModified}`))
      .map(f => ({ id: crypto.randomUUID(), file: f }))

    if (newItems.length === 0) {
      notify(t('admin.duplicate_file_not_added') || '重复的文件已忽略', 'info')
      return
    }

    if (newItems.length < validFiles.length) {
      notify(t('admin.duplicate_files_ignored') || '部分重复的文件已忽略', 'info')
    }

    setUploadFiles(prev => [...prev, ...newItems])
    void checkDuplicatesForFiles(newItems)
  }
  
  const removeUploadFile = (id: string) => {
    setUploadFiles(prev => prev.filter(f => f.id !== id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setDuplicateInfos(prev => prev.filter(d => d.fileId !== id))
    setFileHashMap(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }
  
  const removeSelectedFiles = () => {
    if (selectedIds.size === 0) return
    setUploadFiles(prev => prev.filter(f => !selectedIds.has(f.id)))
    setDuplicateInfos(prev => prev.filter(d => !selectedIds.has(d.fileId)))
    setFileHashMap(prev => {
      const next = new Map(prev)
      selectedIds.forEach(id => next.delete(id))
      return next
    })
    setSelectedIds(new Set())
  }
  
  const clearAllFiles = () => {
    setUploadFiles([])
    setSelectedIds(new Set())
    setDuplicateInfos([])
    setFileHashMap(new Map())
  }
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    addUploadFiles(Array.from(e.dataTransfer.files))
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    setUploadFiles(prev => {
      const items = [...prev]
      const [dragged] = items.splice(dragIndex, 1)
      items.splice(index, 0, dragged)
      return items
    })
    setDragIndex(index)
  }

  const handleDragEnd = () => setDragIndex(null)

  const handleUploadTypeChange = (type: 'digital' | 'film') => {
    if (type === uploadType) return
    setUploadType(type)
    // Settings will be reset by child components
  }

  const handleUploadClick = () => {
    if (!token) return
    if (!uploadFiles.length) { setUploadError(t('admin.select_files')); return }
    setUploadError('')
    setShowConfirm(true)
  }

  const handleConfirmUpload = async () => {
    setShowConfirm(false)
    if (!token) return

    const filesToUpload = uploadFiles

    if (duplicateInfos.length > 0) {
      setPendingUploadFiles(filesToUpload)
      setShowDuplicateDialog(true)
      return
    }

    await proceedWithUpload(filesToUpload, fileHashMap)
  }

  const proceedWithUpload = async (filesToUpload: UploadFile[], hashMap: Map<string, string>) => {
    if (!token) return

    // GPS stripping now happens inside the upload queue via EXIF JSON
    // (see UploadQueueContext.extractExifToJson + stripGpsFromExifJson), so
    // there is no separate binary pass here. fileHash stays anchored to the
    // original file content so duplicate detection is stable regardless of
    // whether GPS stripping is enabled.
    await addTasks({
      files: filesToUpload.map(f => ({
        id: f.id,
        file: f.file,
        fileHash: hashMap.get(f.id),
      })),
      title: currentSettings.title.trim(),
      categories: currentSettings.categories,
      storageProvider: currentSettings.storageSourceId ? undefined : 'local',
      storageSourceId: currentSettings.storageSourceId,
      storagePath: currentSettings.storagePath,
      storagePathFull: currentSettings.storagePathFull,
      storyId: currentSettings.storyId,
      albumIds: currentSettings.albumIds,
      filmRollId: uploadType === 'film' ? (uploadSettings.filmRollId || undefined) : undefined,
      showFlag: currentSettings.showFlag,
      compressionMode: currentSettings.compressionEnabled ? 'compress' : undefined,
      maxSizeMB: currentSettings.compressionEnabled && currentSettings.maxSizeMB > 0 ? currentSettings.maxSizeMB : undefined,
      stripGps: currentSettings.privacyStripEnabled,
      token,
    })

    setUploadFiles([])
    setSelectedIds(new Set())
    setDuplicateInfos([])
    setFileHashMap(new Map())
    setPendingUploadFiles([])
  }

  // Handle duplicate dialog actions
  const handleSkipDuplicates = async () => {
    setShowDuplicateDialog(false)
    const duplicateIds = new Set(duplicateInfos.map(d => d.fileId))
    const nonDuplicateFiles = pendingUploadFiles.filter(f => !duplicateIds.has(f.id))
    
    if (nonDuplicateFiles.length === 0) {
      notify(t('admin.all_files_duplicates'), 'info')
      setUploadFiles([])
      setSelectedIds(new Set())
      setDuplicateInfos([])
      setFileHashMap(new Map())
      setPendingUploadFiles([])
      return
    }
    
    await proceedWithUpload(nonDuplicateFiles, fileHashMap)
  }

  const handleUploadAnyway = async () => {
    setShowDuplicateDialog(false)
    // Clear hashes for duplicates so they won't be rejected by backend
    const newHashMap = new Map(fileHashMap)
    duplicateInfos.forEach(d => newHashMap.delete(d.fileId))
    await proceedWithUpload(pendingUploadFiles, newHashMap)
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          if (event.target.files) {
            addUploadFiles(Array.from(event.target.files))
          }
          event.target.value = ''
        }}
      />

      {/* Upload Type Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        <button
          onClick={() => handleUploadTypeChange('digital')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            uploadType === 'digital'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Camera className="w-4 h-4" />
          {t('admin.upload_type_digital')}
        </button>
        <button
          onClick={() => handleUploadTypeChange('film')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            uploadType === 'film'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Film className="w-4 h-4" />
          {t('admin.upload_type_film')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        {/* Left Panel - Settings */}
        <div className="lg:col-span-4">
          <PhotoUploadParams
            mode={uploadType}
            token={token}
            categories={categories}
            t={t}
            fileCount={uploadFiles.length}
            totalOriginalSize={totalOriginalSize}
            estimatedTotalSize={estimatedTotalSize}
            savingsPercent={savingsPercent}
            compressionSuggestion={compressionSuggestion}
            onSettingsChange={setUploadSettings}
            onUploadClick={handleUploadClick}
            onSelectFilesClick={() => fileInputRef.current?.click()}
            uploading={checkingDuplicates}
            uploadError={uploadError}
          />
        </div>

        {/* Right Panel - Files */}
        <div className="lg:col-span-8">
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`min-h-[600px] border-2 border-dashed transition-all ${
              isDragging ? 'border-primary bg-primary/5' : 'border-border/50 bg-muted/10'
            }`}
          >
            {uploadFiles.length ? (
              <div className="p-6">
                {/* Toolbar */}
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-border/50">
                  <div className="flex items-center gap-4">
                    <input
                      type="checkbox"
                      checked={uploadFiles.length > 0 && selectedIds.size === uploadFiles.length}
                      onChange={() => setSelectedIds(selectedIds.size === uploadFiles.length ? new Set() : new Set(uploadFiles.map(f => f.id)))}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="text-sm text-muted-foreground">
                      {selectedIds.size ? `${selectedIds.size} ${t('admin.selected')}` : `${uploadFiles.length} ${t('admin.files')}`}
                    </span>
                    {uploadFiles.length > 0 && (
                      <span className="text-xs text-muted-foreground font-mono transition-colors">
                        {!currentSettings.compressionEnabled || estimatedTotalSize >= totalOriginalSize ? (
                          formatFileSize(totalOriginalSize)
                        ) : (
                          <>
                            {formatFileSize(totalOriginalSize)}
                            <span className="mx-1 text-muted-foreground/50">→</span>
                            <span className="text-primary tabular-nums">~{formatFileSize(estimatedTotalSize)}</span>
                            {savingsPercent > 0 && (
                              <span className="ml-1.5 text-[10px] text-emerald-600 dark:text-emerald-500 tabular-nums">
                                ↓{savingsPercent}%
                              </span>
                            )}
                          </>
                        )}
                      </span>
                    )}
                    {selectedIds.size > 0 && (
                      <AdminButton
                        onClick={removeSelectedFiles}
                        adminVariant="iconDestructive"
                        size="xs"
                        className="p-1.5"
                      >
                        <Trash2 className="w-4 h-4" />
                      </AdminButton>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {duplicateInfos.length > 0 && (
                      <span className="text-xs text-amber-600">
                        {t('admin.duplicate_found')}: {duplicateInfos.length}
                      </span>
                    )}
                    <AdminButton
                      onClick={clearAllFiles}
                      adminVariant="link"
                      size="xs"
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      {t('admin.clear_all')}
                    </AdminButton>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary cursor-pointer transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                      {t('admin.add_more')}
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          if (e.target.files) {
                            addUploadFiles(Array.from(e.target.files))
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* File List */}
                <div className="space-y-1" onDragEnd={handleDragEnd}>
                  {uploadFiles.map((item, index) => (
                    <DraggableFileItem
                      key={item.id}
                      item={item}
                      index={index}
                      selected={selectedIds.has(item.id)}
                      duplicateInfo={duplicateInfoMap.get(item.id)}
                      estimatedSize={currentSettings.compressionEnabled ? (testedSizeMap.get(item.id) ?? estimateFileSize(item.file)) : undefined}
                      isActualSize={testedSizeMap.has(item.id)}
                      onSelect={id => setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })}
                      onRemove={removeUploadFile}
                      onPreview={() => onPreview(item)}
                      onTestCompression={currentSettings.compressionEnabled ? setTestCompressionFile : undefined}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDragEnd}
                      isDragging={dragIndex === index}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[600px] flex flex-col items-center justify-center text-muted-foreground p-8">
                <Upload className="w-16 h-16 mb-6 opacity-10" />
                <p className="text-sm font-medium mb-2">{t('admin.drop_here')}</p>
                <p className="text-xs text-muted-foreground/60 mb-8">{t('admin.support_types')}</p>
                <label className="px-6 py-3 border border-border hover:border-primary hover:text-primary transition-all cursor-pointer text-sm">
                  {t('admin.select_files')}
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      if (e.target.files) {
                        addUploadFiles(Array.from(e.target.files))
                      }
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirmUpload}
        fileCount={uploadFiles.length}
        categories={currentSettings.categories}
        albumNames={currentSettings.albumIds?.map(id => albumNameMap.get(id) || id) || []}
        storyName={currentSettings.storyId}
        storageProvider={currentSettings.storageSourceId || 'local'}
        storagePath={currentSettings.storagePath}
        compressionEnabled={currentSettings.compressionEnabled}
        privacyStripEnabled={currentSettings.privacyStripEnabled}
        t={t}
      />

      <DuplicatePhotosDialog
        open={showDuplicateDialog}
        duplicates={duplicateInfos}
        onClose={() => {
          setShowDuplicateDialog(false)
          setPendingUploadFiles([])
        }}
        onSkipDuplicates={handleSkipDuplicates}
        onUploadAnyway={handleUploadAnyway}
        t={t}
      />

      <TestCompressionModal
        file={testCompressionFile}
        maxSizeMB={currentSettings.maxSizeMB}
        onClose={() => setTestCompressionFile(null)}
        onResult={(fileId, compressedSize) => {
          setTestedSizeMap(prev => {
            const next = new Map(prev)
            next.set(fileId, compressedSize)
            return next
          })
        }}
        t={t}
      />
    </>
  )
}
