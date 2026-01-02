
'use client'

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react'
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
import imageCompression from 'browser-image-compression'
import { AdminSettingsDto, getAdminStories, getAdminAlbums, type StoryDto, type AlbumDto } from '@/lib/api'
import { useUploadQueue } from '@/contexts/UploadQueueContext'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { CustomInput } from '@/components/ui/CustomInput'
import { formatFileSize } from '@/lib/utils'

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
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 bg-foreground text-background text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors flex items-center justify-center gap-2"
          >
            <CloudUpload className="w-4 h-4" />
            {t('admin.start_upload')}
          </button>
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

      <button
        onClick={() => onRemove(item.id)}
        className="p-2 text-muted-foreground/50 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
      >
        <X className="w-4 h-4" />
      </button>
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
  const [categoryInput, setCategoryInput] = useState('')
  const [isCategoryOpen, setIsCategoryOpen] = useState(false)
  const categoryRef = useRef<HTMLDivElement>(null)

  const [uploadStoryId, setUploadStoryId] = useState('')
  const [stories, setStories] = useState<StoryDto[]>([])
  const [loadingStories, setLoadingStories] = useState(false)

  const [uploadAlbumIds, setUploadAlbumIds] = useState<string[]>([])
  const [albums, setAlbums] = useState<AlbumDto[]>([])
  const [loadingAlbums, setLoadingAlbums] = useState(false)
  const [albumInput, setAlbumInput] = useState('')
  const [isAlbumOpen, setIsAlbumOpen] = useState(false)
  const albumRef = useRef<HTMLDivElement>(null)

  const [uploadSource, setUploadSource] = useState('local')
  const [uploadPath, setUploadPath] = useState('')
  const [isInitialized, setIsInitialized] = useState(false)

  const [compressionEnabled, setCompressionEnabled] = useState(false)
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

  const filteredCategories = useMemo(() =>
    categories.filter(c => c !== 'all' && c !== '全部' && c.toLowerCase().includes(categoryInput.toLowerCase()) && !uploadCategories.includes(c)),
    [categories, categoryInput, uploadCategories]
  )

  const filteredAlbums = useMemo(() =>
    albums.filter(a => a.name.toLowerCase().includes(albumInput.toLowerCase()) && !uploadAlbumIds.includes(a.id)),
    [albums, albumInput, uploadAlbumIds]
  )

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (isCategoryOpen && categoryRef.current && !categoryRef.current.contains(e.target as Node)) setIsCategoryOpen(false)
      if (isAlbumOpen && albumRef.current && !albumRef.current.contains(e.target as Node)) setIsAlbumOpen(false)
    }
    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [isCategoryOpen, isAlbumOpen])

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
    if (compressionEnabled) {
      setCompressing(true)
      setCompressionProgress({ current: 0, total: uploadFiles.length })
      const compressed: UploadFile[] = []
      for (let i = 0; i < uploadFiles.length; i++) {
        const item = uploadFiles[i]
        if (item.file.size > maxSizeMB * 1024 * 1024) {
          try {
            const blob = await imageCompression(item.file, { maxSizeMB, maxWidthOrHeight: 4096, useWebWorker: true, preserveExif: true })
            compressed.push({ id: item.id, file: new File([blob], item.file.name, { type: blob.type }) })
          } catch { compressed.push(item) }
        } else compressed.push(item)
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
                <CustomInput
                  variant="config"
                  value={uploadTitle}
                  onChange={e => setUploadTitle(e.target.value)}
                  disabled={uploadFiles.length > 1}
                  placeholder={uploadFiles.length > 1 ? t('admin.title_hint_multi') : t('admin.title_hint_single')}
                />
              </div>

              {/* Categories */}
              <div ref={categoryRef} className="relative">
                <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  {t('admin.categories')}
                  <span className="text-muted-foreground/50">({t('common.optional')})</span>
                </label>
                <div
                  className="min-h-[48px] p-3 bg-muted/30 border-b border-border flex flex-wrap gap-2 cursor-text focus-within:border-primary transition-colors"
                  onClick={() => { setIsCategoryOpen(true); categoryRef.current?.querySelector('input')?.focus() }}
                >
                  {uploadCategories.map(cat => (
                    <span key={cat} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-foreground/10 text-xs font-medium">
                      {cat}
                      <button onClick={e => { e.stopPropagation(); setUploadCategories(prev => prev.filter(c => c !== cat)) }} className="hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={categoryInput}
                    onChange={e => { setCategoryInput(e.target.value); setIsCategoryOpen(true) }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && categoryInput.trim()) {
                        e.preventDefault()
                        if (!uploadCategories.includes(categoryInput.trim())) setUploadCategories(prev => [...prev, categoryInput.trim()])
                        setCategoryInput('')
                      } else if (e.key === 'Backspace' && !categoryInput && uploadCategories.length) {
                        setUploadCategories(prev => prev.slice(0, -1))
                      }
                    }}
                    className="flex-1 min-w-[60px] outline-none bg-transparent text-sm"
                    placeholder={uploadCategories.length ? '' : t('admin.search_create')}
                  />
                </div>
                {isCategoryOpen && (
                  <div className="absolute z-20 w-full mt-1 bg-background border border-border shadow-xl max-h-40 overflow-y-auto">
                    {filteredCategories.length ? filteredCategories.map(cat => (
                      <button
                        key={cat}
                        onClick={e => { e.stopPropagation(); setUploadCategories(prev => [...prev, cat]); setCategoryInput('') }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted flex items-center justify-between"
                      >
                        {cat}
                        <Check className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                      </button>
                    )) : categoryInput.trim() ? (
                      <button
                        onClick={e => { e.stopPropagation(); setUploadCategories(prev => [...prev, categoryInput.trim()]); setCategoryInput('') }}
                        className="w-full text-left px-4 py-2.5 text-sm text-primary hover:bg-muted flex items-center gap-2"
                      >
                        <Plus className="w-3 h-3" />
                        Create &ldquo;{categoryInput}&rdquo;
                      </button>
                    ) : (
                      <div className="px-4 py-3 text-xs text-muted-foreground text-center">Start typing...</div>
                    )}
                  </div>
                )}
              </div>

              {/* Albums */}
              <div ref={albumRef} className="relative">
                <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <FolderOpen className="w-3 h-3" />
                  {t('admin.album_select')}
                  <span className="text-muted-foreground/50">({t('common.optional')})</span>
                </label>
                <div
                  className="min-h-[48px] p-3 bg-muted/30 border-b border-border flex flex-wrap gap-2 cursor-text focus-within:border-primary transition-colors"
                  onClick={() => { setIsAlbumOpen(true); albumRef.current?.querySelector('input')?.focus() }}
                >
                  {uploadAlbumIds.map(id => {
                    const album = albums.find(a => a.id === id)
                    return (
                      <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-foreground/10 text-xs font-medium">
                        {album?.name}
                        <button onClick={e => { e.stopPropagation(); setUploadAlbumIds(prev => prev.filter(i => i !== id)) }} className="hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )
                  })}
                  <input
                    type="text"
                    value={albumInput}
                    onChange={e => { setAlbumInput(e.target.value); setIsAlbumOpen(true) }}
                    onKeyDown={e => { if (e.key === 'Backspace' && !albumInput && uploadAlbumIds.length) setUploadAlbumIds(prev => prev.slice(0, -1)) }}
                    className="flex-1 min-w-[60px] outline-none bg-transparent text-sm"
                    placeholder={uploadAlbumIds.length ? '' : t('admin.search_album')}
                    disabled={loadingAlbums}
                  />
                </div>
                {isAlbumOpen && (
                  <div className="absolute z-20 w-full mt-1 bg-background border border-border shadow-xl max-h-40 overflow-y-auto">
                    {filteredAlbums.length ? filteredAlbums.map(album => (
                      <button
                        key={album.id}
                        onClick={e => { e.stopPropagation(); setUploadAlbumIds(prev => [...prev, album.id]); setAlbumInput('') }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted"
                      >
                        {album.name}
                        {!album.isPublished && <span className="ml-2 text-muted-foreground">({t('admin.draft')})</span>}
                      </button>
                    )) : (
                      <div className="px-4 py-3 text-xs text-muted-foreground text-center">
                        {loadingAlbums ? t('common.loading') : t('admin.no_albums_found')}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Story */}
              <div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <BookOpen className="w-3 h-3" />
                  {t('ui.photo_story')}
                  <span className="text-muted-foreground/50">({t('common.optional')})</span>
                </label>
                <CustomSelect
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
                  <CustomSelect
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
                  {/* System configured prefix (read-only) */}
                  {(() => {
                    const systemPrefix = uploadSource === 'r2'
                      ? settings?.r2_path
                      : uploadSource === 'github'
                        ? settings?.github_path
                        : undefined
                    
                    return systemPrefix ? (
                      <div className="flex items-stretch">
                        <div className="px-3 py-2 bg-muted/50 border-b border-l border-t border-border text-xs text-muted-foreground font-mono flex items-center min-w-0">
                          <span className="truncate" title={systemPrefix}>{systemPrefix}/</span>
                        </div>
                        <CustomInput
                          variant="config"
                          value={uploadPath}
                          onChange={e => setUploadPath(e.target.value)}
                          placeholder="e.g., 2025/vacation"
                          className="flex-1 rounded-l-none"
                        />
                      </div>
                    ) : (
                      <CustomInput
                        variant="config"
                        value={uploadPath}
                        onChange={e => setUploadPath(e.target.value)}
                        placeholder="e.g., 2025/vacation"
                      />
                    )
                  })()}
                </div>
              </div>

              {/* Compression */}
              <div className="pt-4 border-t border-border/50">
                <div className="flex items-center justify-between mb-3">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Minimize2 className="w-3 h-3" />
                    {t('admin.image_compression')}
                  </label>
                  <button
                    onClick={() => setCompressionEnabled(!compressionEnabled)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${compressionEnabled ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-background shadow transition-transform ${compressionEnabled ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
                {compressionEnabled && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{t('admin.max_size_mb')}</span>
                    <CustomInput
                      variant="config"
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
              <button
                onClick={handleUploadClick}
                disabled={compressing || !uploadFiles.length}
                className="w-full py-4 mt-6 bg-foreground text-background text-sm font-medium tracking-wide hover:bg-primary hover:text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
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
              </button>
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
                      <button
                        onClick={() => { setUploadFiles(prev => prev.filter(f => !selectedIds.has(f.id))); setSelectedIds(new Set()) }}
                        className="p-1.5 text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setUploadFiles([])}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      Clear all
                    </button>
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
        compressionEnabled={compressionEnabled}
        t={t}
      />
    </>
  )
}
