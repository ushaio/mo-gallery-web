
'use client'

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  Upload,
  Loader2,
  X,
  Trash2,
  Plus,
  BookOpen,
  Minimize2,
  FolderOpen,
  GripVertical,
  Eye,
  Settings2,
  CloudUpload,
  MapPinOff,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  Check,
} from 'lucide-react'
import { AdminSettingsDto, getAdminStories, getAdminAlbums, checkDuplicatePhotos, type StoryDto, type AlbumDto } from '@/lib/api'
import { type CompressionMode } from '@/lib/image-compress'
import { stripGpsData } from '@/lib/privacy-strip'
import { calculateFileHash } from '@/lib/file-hash'
import { useUploadQueue } from '@/contexts/UploadQueueContext'
import { formatFileSize } from '@/lib/utils'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminInput, AdminMultiSelect, AdminSelect } from '@/components/admin/AdminFormControls'
import { DuplicatePhotosDialog, type DuplicateInfo } from '@/components/admin/DuplicatePhotosDialog'
import { StorySelectorModal } from '@/components/admin/StorySelectorModal'

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

// Inline Prefix Dropdown - matches admin style, integrates with input group
function PrefixDropdown({
  value,
  options,
  onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)
  const displayLabel = selectedOption?.label || value

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen && containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside, true)
    return () => document.removeEventListener('click', handleClickOutside, true)
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative self-stretch">
      <div
        className="h-full px-3 bg-muted/50 border border-r-0 border-border text-[10px] text-muted-foreground font-mono flex items-center gap-0.5 cursor-pointer hover:bg-muted/80 transition-colors select-none"
        onClick={() => setIsOpen(!isOpen)}
        title={displayLabel}
      >
        <span className="truncate max-w-[80px]">{displayLabel}</span>
        <ChevronDown className={`w-2.5 h-2.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && (
        <div className="absolute z-20 left-0 top-full mt-0.5 min-w-full bg-background border border-border shadow-2xl">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              className={`w-full text-left px-3 py-2 text-[10px] font-mono hover:bg-primary hover:text-primary-foreground flex items-center justify-between gap-2 transition-colors whitespace-nowrap ${
                value === option.value ? 'bg-primary/10 text-primary' : ''
              }`}
            >
              <span>{option.label}</span>
              {value === option.value && <Check className="w-2.5 h-2.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Draggable File Item
function DraggableFileItem({
  item,
  index,
  selected,
  duplicateInfo,
  onSelect,
  onRemove,
  onPreview,
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
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onPreview: (item: UploadFile) => void
  onDragStart: (e: React.DragEvent, index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDrop: (e: React.DragEvent) => void
  isDragging: boolean
  t: (key: string) => string
}) {
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(item.file)
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
      URL.revokeObjectURL(url)
    }
    return () => URL.revokeObjectURL(url)
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
        <p className="text-xs text-muted-foreground font-mono">{formatFileSize(item.file.size)}</p>
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

      <AdminButton
        onClick={() => onRemove(item.id)}
        adminVariant="iconDestructive"
        size="sm"
        className="p-2 text-muted-foreground/50 opacity-0 group-hover:opacity-100"
      >
        <X className="w-4 h-4" />
      </AdminButton>
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDragging, setIsDragging] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadCategories, setUploadCategories] = useState<string[]>([])

  const [uploadStoryId, setUploadStoryId] = useState('')
  const [uploadStoryTitle, setUploadStoryTitle] = useState('')
  const [stories, setStories] = useState<StoryDto[]>([])
  const [loadingStories, setLoadingStories] = useState(false)
  const [showStorySelector, setShowStorySelector] = useState(false)

  const [uploadAlbumIds, setUploadAlbumIds] = useState<string[]>([])
  const [albums, setAlbums] = useState<AlbumDto[]>([])
  const [loadingAlbums, setLoadingAlbums] = useState(false)

  const [uploadSource, setUploadSource] = useState('local')
  const [useCustomPrefix, setUseCustomPrefix] = useState(false)
  const [uploadPath, setUploadPath] = useState('')
  const [isInitialized, setIsInitialized] = useState(false)

  const [compressionMode, setCompressionMode] = useState<CompressionMode>('none')
  const [maxSizeMB, setMaxSizeMB] = useState(4)

  // Privacy strip - remove GPS/location data
  const [privacyStripEnabled, setPrivacyStripEnabled] = useState(false)
  const [strippingPrivacy, setStrippingPrivacy] = useState(false)
  const [privacyProgress, setPrivacyProgress] = useState({ current: 0, total: 0 })

  // Duplicate check
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [duplicateProgress, setDuplicateProgress] = useState({ current: 0, total: 0 })
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [duplicateInfos, setDuplicateInfos] = useState<DuplicateInfo[]>([])
  const [fileHashMap, setFileHashMap] = useState<Map<string, string>>(new Map())
  const [pendingUploadFiles, setPendingUploadFiles] = useState<UploadFile[]>([])

  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    if (settings?.storage_provider && !isInitialized) {
      queueMicrotask(() => {
        setUploadSource(settings.storage_provider)
        setUseCustomPrefix(false)
        setIsInitialized(true)
      })
    }
  }, [settings, isInitialized])

  // Reset custom prefix when storage provider changes
  useEffect(() => {
    if (!isInitialized) return
    setUseCustomPrefix(false)
    setUploadPath('')
  }, [uploadSource, isInitialized])

  // Get the system prefix for current provider
  const configPrefix = uploadSource === 'r2'
    ? settings?.r2_path
    : uploadSource === 'github'
      ? settings?.github_path
      : undefined

  // Load stories only when modal opens
  const loadStories = useCallback(async () => {
    if (!token || stories.length > 0) return
    setLoadingStories(true)
    try {
      const data = await getAdminStories(token)
      setStories(data)
    } finally {
      setLoadingStories(false)
    }
  }, [token, stories.length])

  useEffect(() => {
    if (showStorySelector) {
      loadStories()
    }
  }, [showStorySelector, loadStories])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    queueMicrotask(() => !cancelled && setLoadingAlbums(true))
    getAdminAlbums(token).then(data => !cancelled && setAlbums(data)).finally(() => !cancelled && setLoadingAlbums(false))
    return () => { cancelled = true }
  }, [token])

  const categoryOptions = useMemo(
    () =>
      categories
        .filter((c) => c !== 'all' && c !== '全部')
        .map((c) => ({ value: c, label: c })),
    [categories]
  )

  const albumOptions = useMemo(
    () =>
      albums.map((a) => ({
        value: a.id,
        label: a.name,
        suffix: !a.isPublished ? `(${t('admin.draft')})` : undefined,
      })),
    [albums, t]
  )

  const duplicateInfoMap = useMemo(() => {
    const map = new Map<string, DuplicateInfo>()
    duplicateInfos.forEach(info => map.set(info.fileId, info))
    return map
  }, [duplicateInfos])
  
  const checkDuplicatesForFiles = async (files: UploadFile[]) => {
    if (!token || files.length === 0) return
    setCheckingDuplicates(true)
    setDuplicateProgress({ current: 0, total: files.length })
    
    const nextHashMap = new Map(fileHashMap)
    for (let i = 0; i < files.length; i++) {
      const item = files[i]
      try {
        const hash = await calculateFileHash(item.file)
        nextHashMap.set(item.id, hash)
      } catch (err) {
        console.error('Failed to calculate hash for', item.file.name, err)
      }
      setDuplicateProgress({ current: i + 1, total: files.length })
    }
    setFileHashMap(nextHashMap)
    
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
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    if (!imageFiles.length) return

    const existingFileKeys = new Set(uploadFiles.map(f => `${f.file.name}-${f.file.size}`))

    const newItems = imageFiles
      .filter(f => !existingFileKeys.has(`${f.name}-${f.size}`))
      .map(f => ({ id: crypto.randomUUID(), file: f }))

    if (newItems.length === 0) {
      notify(t('admin.duplicate_file_not_added') || '重复的文件已忽略', 'info')
      return
    }

    if (newItems.length < imageFiles.length) {
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

  const handleUploadClick = () => {
    if (!token) return
    if (!uploadFiles.length) { setUploadError(t('admin.select_files')); return }
    if (uploadFiles.length === 1 && !uploadTitle.trim()) { setUploadError(t('admin.photo_title')); return }
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

    // Step 1: Strip GPS/location data if enabled
    if (privacyStripEnabled) {
      setStrippingPrivacy(true)
      setPrivacyProgress({ current: 0, total: filesToUpload.length })
      const stripped: UploadFile[] = []
      for (let i = 0; i < filesToUpload.length; i++) {
        const item = filesToUpload[i]
        try {
          const file = await stripGpsData(item.file)
          stripped.push({ id: item.id, file })
        } catch { stripped.push(item) }
        setPrivacyProgress({ current: i + 1, total: filesToUpload.length })
      }
      filesToUpload = stripped
      setStrippingPrivacy(false)
    }

    // Step 2: Upload with file hashes (compression happens in upload queue)
    await addTasks({
      files: filesToUpload.map(f => ({
        id: f.id,
        file: f.file,
        fileHash: hashMap.get(f.id),
      })),
      title: uploadTitle.trim(),
      categories: uploadCategories,
      storageProvider: uploadSource,
      storagePath: useCustomPrefix ? (uploadPath.trim() || undefined) : (uploadPath.trim() || undefined),
      storagePathFull: useCustomPrefix,
      storyId: uploadStoryId || undefined,
      albumIds: uploadAlbumIds.length ? uploadAlbumIds : undefined,
      compressionMode: compressionMode !== 'none' ? compressionMode : undefined,
      maxSizeMB: compressionMode !== 'none' ? maxSizeMB : undefined,
      token,
    })

    setUploadFiles([])
    setSelectedIds(new Set())
    setUploadTitle('')
    setUploadStoryId('')
    setUploadStoryTitle('')
    setUploadAlbumIds([])
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

  const selectedAlbumNames = uploadAlbumIds.map(id => albums.find(a => a.id === id)?.name || '').filter(Boolean)
  const selectedStoryName = stories.find(s => s.id === uploadStoryId)?.title
  
  // Calculate full storage path for display
  const fullStoragePath = useCustomPrefix
    ? (uploadPath.trim() || undefined)
    : (configPrefix
      ? (uploadPath.trim() ? `${configPrefix}/${uploadPath.trim()}` : configPrefix)
      : uploadPath.trim() || undefined)

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        {/* Left Panel - Settings */}
        <div className="lg:col-span-4">
          <div className="sticky top-6">
            <div className="flex items-center gap-3 mb-4">
              <Settings2 className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-xs font-medium tracking-wide uppercase text-muted-foreground">{t('admin.upload_params')}</h2>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">{t('admin.photo_title')}</label>
                <AdminInput
                  value={uploadTitle}
                  onChange={e => setUploadTitle(e.target.value)}
                  disabled={uploadFiles.length > 1}
                  placeholder={uploadFiles.length > 1 ? t('admin.title_hint_multi') : t('admin.title_hint_single')}
                />
              </div>

              {/* Categories & Albums - 2 column grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">{t('admin.categories')}</label>
                  <AdminMultiSelect
                    values={uploadCategories}
                    options={categoryOptions}
                    onChange={setUploadCategories}
                    placeholder={t('admin.search_create')}
                    inputPlaceholder={t('admin.search_create')}
                    allowCreate
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                    <FolderOpen className="w-3 h-3" />
                    {t('admin.album_select')}
                  </label>
                  <AdminMultiSelect
                    values={uploadAlbumIds}
                    options={albumOptions}
                    onChange={setUploadAlbumIds}
                    placeholder={t('admin.search_album')}
                    inputPlaceholder={t('admin.search_album')}
                    disabled={loadingAlbums}
                  />
                </div>
              </div>

              {/* Story */}
              <div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                  <BookOpen className="w-3 h-3" />
                  {t('ui.photo_story')}
                </label>
                <button
                  type="button"
                  onClick={() => setShowStorySelector(true)}
                  disabled={loadingStories}
                  className="w-full flex items-center justify-between px-3 py-2 bg-background border border-border text-sm text-left hover:border-primary/50 transition-colors disabled:opacity-50"
                >
                  <span className={uploadStoryTitle ? 'text-foreground' : 'text-muted-foreground'}>
                    {uploadStoryTitle || t('ui.no_association')}
                  </span>
                  <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              {/* Storage - compact layout */}
              <div className="pt-3 border-t border-border/50">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">{t('admin.storage_provider')}</label>
                    <AdminSelect
                      value={uploadSource}
                      onChange={setUploadSource}
                      options={[
                        { value: 'local', label: 'Local' },
                        { value: 'r2', label: 'R2' },
                        { value: 'github', label: 'GitHub' },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">{t('admin.path_prefix')}</label>
                    <div className="flex items-stretch">
                      {configPrefix ? (
                        <PrefixDropdown
                          value={useCustomPrefix ? '/' : configPrefix}
                          options={[
                            { value: configPrefix, label: `${configPrefix}/` },
                            { value: '/', label: '/' },
                          ]}
                          onChange={(v) => {
                            setUseCustomPrefix(v === '/')
                            setUploadPath('')
                          }}
                        />
                      ) : (
                        <div className="self-stretch px-3 bg-muted/50 border border-r-0 border-border text-[10px] text-muted-foreground font-mono flex items-center">
                          <span>/</span>
                        </div>
                      )}
                      <AdminInput
                        value={uploadPath}
                        onChange={e => setUploadPath(e.target.value)}
                        placeholder="path"
                        className="flex-1 rounded-l-none border-l-0"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Privacy & Compression - inline toggles */}
              <div className="pt-3 border-t border-border/50 space-y-3">
                {/* Privacy Strip */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPinOff className="w-3 h-3" />
                    {t('admin.strip_gps') || '移除地理位置'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setPrivacyStripEnabled(!privacyStripEnabled)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      privacyStripEnabled ? 'bg-primary' : 'bg-muted'
                    }`}
                  >
                    <span
                      className={`pointer-events-none block size-4 rounded-full bg-background shadow-lg transition-transform ${
                        privacyStripEnabled ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Compression */}
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Minimize2 className="w-3 h-3" />
                    {t('admin.image_compression')}
                  </label>
                  <AdminSelect
                    value={compressionMode}
                    onChange={(v) => setCompressionMode(v as CompressionMode)}
                    className="w-28"
                    options={[
                      { value: 'none', label: t('admin.compression_none') || '原图' },
                      { value: 'quality', label: t('admin.compression_quality') || '质量优先' },
                      { value: 'size', label: t('admin.compression_size') || '体积优先' },
                    ]}
                  />
                </div>
                {compressionMode === 'quality' && (
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-[10px] text-muted-foreground">{t('admin.max_size_mb')}</span>
                    <AdminInput
                      type="number"
                      min="0.5"
                      max="10"
                      step="0.5"
                      value={maxSizeMB}
                      onChange={e => setMaxSizeMB(parseFloat(e.target.value) || 4)}
                      className="w-16 text-center text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Upload Button */}
              <AdminButton
                onClick={handleUploadClick}
                disabled={strippingPrivacy || checkingDuplicates || !uploadFiles.length}
                adminVariant="primary"
                size="lg"
                className="w-full py-3 mt-2 bg-foreground text-background text-sm font-medium tracking-wide hover:bg-primary hover:text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {checkingDuplicates ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('admin.checking_duplicates')} ({duplicateProgress.current}/{duplicateProgress.total})
                  </>
                ) : strippingPrivacy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('admin.stripping_privacy') || '擦除隐私'} ({privacyProgress.current}/{privacyProgress.total})
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    {t('admin.start_upload')}
                  </>
                )}
              </AdminButton>
              {uploadError && <p className="text-xs text-destructive text-center mt-1">{uploadError}</p>}
            </div>
          </div>
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
                      onSelect={id => setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })}
                      onRemove={removeUploadFile}
                      onPreview={() => onPreview(item)}
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
        categories={uploadCategories}
        albumNames={selectedAlbumNames}
        storyName={selectedStoryName}
        storageProvider={uploadSource}
        storagePath={fullStoragePath}
        compressionEnabled={compressionMode !== 'none'}
        privacyStripEnabled={privacyStripEnabled}
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

      <StorySelectorModal
        isOpen={showStorySelector}
        onClose={() => setShowStorySelector(false)}
        onSelect={(storyId, storyTitle) => {
          setUploadStoryId(storyId || '')
          setUploadStoryTitle(storyTitle || '')
        }}
        stories={stories}
        selectedStoryId={uploadStoryId}
        loading={loadingStories}
        t={t}
      />
    </>
  )
}

