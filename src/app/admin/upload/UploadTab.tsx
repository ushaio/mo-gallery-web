
'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
  Upload,
  Loader2,
  Check,
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
} from 'lucide-react'
import { AdminSettingsDto, getAdminStories, getAdminAlbums, type StoryDto, type AlbumDto } from '@/lib/api'
import { compressImage, type CompressionMode } from '@/lib/image-compress'
import { useUploadQueue } from '@/contexts/UploadQueueContext'
import { formatFileSize } from '@/lib/utils'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminInput, AdminMultiSelect, AdminSelect } from '@/components/admin/AdminFormControls'

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
  onSelect,
  onRemove,
  onPreview,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
}: {
  item: UploadFile
  index: number
  selected: boolean
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onPreview: (item: UploadFile) => void
  onDragStart: (e: React.DragEvent, index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDrop: (e: React.DragEvent) => void
  isDragging: boolean
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
      } ${selected ? 'bg-primary/5' : ''}`}
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
  const [stories, setStories] = useState<StoryDto[]>([])
  const [loadingStories, setLoadingStories] = useState(false)

  const [uploadAlbumIds, setUploadAlbumIds] = useState<string[]>([])
  const [albums, setAlbums] = useState<AlbumDto[]>([])
  const [loadingAlbums, setLoadingAlbums] = useState(false)

  const [uploadSource, setUploadSource] = useState('local')
  const [uploadPath, setUploadPath] = useState('')
  const [isInitialized, setIsInitialized] = useState(false)

  const [compressionMode, setCompressionMode] = useState<CompressionMode>('none')
  const [maxSizeMB, setMaxSizeMB] = useState(4)
  const [compressing, setCompressing] = useState(false)
  const [compressionProgress, setCompressionProgress] = useState({ current: 0, total: 0 })

  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    if (settings?.storage_provider && !isInitialized) {
      queueMicrotask(() => {
        setUploadSource(settings.storage_provider)
        setIsInitialized(true)
      })
    }
  }, [settings, isInitialized])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    queueMicrotask(() => !cancelled && setLoadingStories(true))
    getAdminStories(token).then(data => !cancelled && setStories(data)).finally(() => !cancelled && setLoadingStories(false))
    return () => { cancelled = true }
  }, [token])

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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length) {
      setUploadFiles(prev => [...prev, ...files.map(f => ({ id: crypto.randomUUID(), file: f }))])
    }
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

    let filesToUpload = uploadFiles
    if (compressionMode !== 'none') {
      setCompressing(true)
      setCompressionProgress({ current: 0, total: uploadFiles.length })
      const compressed: UploadFile[] = []
      for (let i = 0; i < uploadFiles.length; i++) {
        const item = uploadFiles[i]
        try {
          const file = await compressImage(item.file, { mode: compressionMode, maxSizeMB })
          compressed.push({ id: item.id, file })
        } catch { compressed.push(item) }
        setCompressionProgress({ current: i + 1, total: uploadFiles.length })
      }
      filesToUpload = compressed
      setCompressing(false)
    }

    await addTasks({
      files: filesToUpload,
      title: uploadTitle.trim(),
      categories: uploadCategories,
      storageProvider: uploadSource,
      storagePath: uploadPath.trim() || undefined,
      storyId: uploadStoryId || undefined,
      albumIds: uploadAlbumIds.length ? uploadAlbumIds : undefined,
      token,
    })

    setUploadFiles([])
    setSelectedIds(new Set())
    setUploadTitle('')
    setUploadStoryId('')
    setUploadAlbumIds([])
    notify(t('admin.upload_started'), 'info')
  }

  const selectedAlbumNames = uploadAlbumIds.map(id => albums.find(a => a.id === id)?.name || '').filter(Boolean)
  const selectedStoryName = stories.find(s => s.id === uploadStoryId)?.title
  
  // Calculate full storage path for display
  const systemPrefix = uploadSource === 'r2'
    ? settings?.r2_path
    : uploadSource === 'github'
      ? settings?.github_path
      : undefined
  const fullStoragePath = systemPrefix
    ? (uploadPath.trim() ? `${systemPrefix}/${uploadPath.trim()}` : systemPrefix)
    : uploadPath.trim() || undefined

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        {/* Left Panel - Settings */}
        <div className="lg:col-span-4 space-y-6">
          <div className="sticky top-6">
            <div className="flex items-center gap-3 mb-8">
              <Settings2 className="w-5 h-5 text-muted-foreground" />
              <h2 className="text-sm font-medium tracking-wide uppercase text-muted-foreground">{t('admin.upload_params')}</h2>
            </div>

            <div className="space-y-6">
              {/* Title */}
              <div>
                <label className="block text-xs text-muted-foreground mb-2">{t('admin.photo_title')}</label>
                <AdminInput
                  value={uploadTitle}
                  onChange={e => setUploadTitle(e.target.value)}
                  disabled={uploadFiles.length > 1}
                  placeholder={uploadFiles.length > 1 ? t('admin.title_hint_multi') : t('admin.title_hint_single')}
                />
              </div>

              {/* Categories (multi-select, searchable, creatable) */}
              <div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  {t('admin.categories')}
                  <span className="text-muted-foreground/50">({t('common.optional')})</span>
                </label>
                <AdminMultiSelect
                  values={uploadCategories}
                  options={categoryOptions}
                  onChange={setUploadCategories}
                  placeholder={t('admin.search_create')}
                  inputPlaceholder={t('admin.search_create')}
                  allowCreate
                />
              </div>

              {/* Albums (multi-select, searchable, not creatable) */}
              <div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <FolderOpen className="w-3 h-3" />
                  {t('admin.album_select')}
                  <span className="text-muted-foreground/50">({t('common.optional')})</span>
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

              {/* Story */}
              <div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <BookOpen className="w-3 h-3" />
                  {t('ui.photo_story')}
                  <span className="text-muted-foreground/50">({t('common.optional')})</span>
                </label>
                <AdminSelect
                  value={uploadStoryId}
                  onChange={setUploadStoryId}
                  disabled={loadingStories}
                  placeholder={t('ui.no_association')}
                  options={[
                    { value: '', label: t('ui.no_association') },
                    ...stories.map(s => ({ value: s.id, label: s.title, suffix: !s.isPublished ? `(${t('admin.draft')})` : undefined }))
                  ]}
                />
              </div>

              {/* Storage */}
              <div className="pt-4 border-t border-border/50 space-y-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-2">{t('admin.storage_provider')}</label>
                  <AdminSelect
                    value={uploadSource}
                    onChange={setUploadSource}
                    options={[
                      { value: 'local', label: 'Local Storage' },
                      { value: 'r2', label: 'Cloudflare R2' },
                      { value: 'github', label: 'GitHub' },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-2">{t('admin.path_prefix')}</label>
                  {/* System configured prefix (read-only) - always show root path */}
                  {(() => {
                    const systemPrefix = uploadSource === 'r2'
                      ? settings?.r2_path
                      : uploadSource === 'github'
                        ? settings?.github_path
                        : undefined
                    
                    const displayPrefix = systemPrefix || '/'
                    
                    return (
                      <div className="flex items-stretch">
                        <div className="px-3 py-2 bg-muted/50 border-b border-l border-t border-border text-xs text-muted-foreground font-mono flex items-center min-w-0">
                          <span className="truncate" title={displayPrefix}>{displayPrefix}{systemPrefix ? '/' : ''}</span>
                        </div>
                        <AdminInput
                          value={uploadPath}
                          onChange={e => setUploadPath(e.target.value)}
                          placeholder="e.g., 2025/vacation"
                          className="flex-1 rounded-l-none"
                        />
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Compression */}
              <div className="pt-4 border-t border-border/50">
                <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Minimize2 className="w-3 h-3" />
                  {t('admin.image_compression')}
                </label>
                <AdminSelect
                  value={compressionMode}
                  onChange={(v) => setCompressionMode(v as CompressionMode)}
                  options={[
                    { value: 'none', label: t('admin.compression_none') || '原图无压缩' },
                    { value: 'quality', label: t('admin.compression_quality') || '质量优先' },
                    { value: 'balanced', label: t('admin.compression_balanced') || '平衡模式' },
                    { value: 'size', label: t('admin.compression_size') || '体积优先' },
                  ]}
                />
                {compressionMode !== 'none' && (
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-xs text-muted-foreground">{t('admin.max_size_mb')}</span>
                    <AdminInput
                      type="number"
                      min="0.5"
                      max="10"
                      step="0.5"
                      value={maxSizeMB}
                      onChange={e => setMaxSizeMB(parseFloat(e.target.value) || 4)}
                      className="w-20 text-center"
                    />
                  </div>
                )}
              </div>

              {/* Upload Button */}
              <AdminButton
                onClick={handleUploadClick}
                disabled={compressing || !uploadFiles.length}
                adminVariant="primary"
                size="lg"
                className="w-full py-4 mt-6 bg-foreground text-background text-sm font-medium tracking-wide hover:bg-primary hover:text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {compressing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('admin.compressing')} ({compressionProgress.current}/{compressionProgress.total})
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    {t('admin.start_upload')}
                  </>
                )}
              </AdminButton>
              {uploadError && <p className="text-xs text-destructive text-center mt-2">{uploadError}</p>}
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
                      {selectedIds.size ? `${selectedIds.size} selected` : `${uploadFiles.length} files`}
                    </span>
                    {selectedIds.size > 0 && (
                      <AdminButton
                        onClick={() => { setUploadFiles(prev => prev.filter(f => !selectedIds.has(f.id))); setSelectedIds(new Set()) }}
                        adminVariant="iconDestructive"
                        size="xs"
                        className="p-1.5"
                      >
                        <Trash2 className="w-4 h-4" />
                      </AdminButton>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <AdminButton
                      onClick={() => setUploadFiles([])}
                      adminVariant="link"
                      size="xs"
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      Clear all
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
                            setUploadFiles(prev => [...prev, ...Array.from(e.target.files!).map(f => ({ id: crypto.randomUUID(), file: f }))])
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
                      onSelect={id => setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })}
                      onRemove={id => { setUploadFiles(prev => prev.filter(f => f.id !== id)); setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next }) }}
                      onPreview={() => onPreview(item)}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDragEnd}
                      isDragging={dragIndex === index}
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
                        setUploadFiles(prev => [...prev, ...Array.from(e.target.files!).map(f => ({ id: crypto.randomUUID(), file: f }))])
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
        t={t}
      />
    </>
  )
}

