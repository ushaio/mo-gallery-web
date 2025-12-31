'use client'

import React, { useState, useRef, useMemo, useEffect } from 'react'
import {
  Upload,
  Save,
  Loader2,
  Check,
  X,
  Trash2,
  List as ListIcon,
  LayoutGrid,
  Plus,
  BookOpen,
  Minimize2,
} from 'lucide-react'
import imageCompression from 'browser-image-compression'
import { AdminSettingsDto, getAdminStories, type StoryDto } from '@/lib/api'
import { UploadFileItem } from '@/components/admin/UploadFileItem'
import { useUploadQueue } from '@/contexts/UploadQueueContext'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { CustomInput } from '@/components/ui/CustomInput'

interface UploadTabProps {
  token: string | null
  categories: string[]
  settings: AdminSettingsDto | null
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  onUploadSuccess: () => void
  onPreview: (file: { id: string, file: File }) => void
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

  const [uploadFiles, setUploadFiles] = useState<{ id: string; file: File }[]>([])
  const [uploadViewMode, setUploadViewMode] = useState<'list' | 'grid'>('list')
  const [selectedUploadIds, setSelectedUploadIds] = useState<Set<string>>(new Set())
  const [isDragging, setIsDragging] = useState(false)

  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadCategories, setUploadCategories] = useState<string[]>([])
  const [categoryInput, setCategoryInput] = useState('')
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false)
  const categoryContainerRef = useRef<HTMLDivElement>(null)

  const [uploadStoryId, setUploadStoryId] = useState<string>('')
  const [stories, setStories] = useState<StoryDto[]>([])
  const [loadingStories, setLoadingStories] = useState(false)

  const [uploadError, setUploadError] = useState('')

  const [uploadSource, setUploadSource] = useState('local')
  const [isInitialized, setIsInitialized] = useState(false)
  const [uploadPath, setUploadPath] = useState('')

  // Compression settings
  const [compressionEnabled, setCompressionEnabled] = useState(false)
  const [maxSizeMB, setMaxSizeMB] = useState(4)
  const [compressing, setCompressing] = useState(false)
  const [compressionProgress, setCompressionProgress] = useState({ current: 0, total: 0 })

  // Initialize defaults from settings
  useEffect(() => {
    if (settings?.storage_provider && !isInitialized) {
      setUploadSource(settings.storage_provider)
      setIsInitialized(true)
    }
  }, [settings, isInitialized])

  // Load stories
  useEffect(() => {
    async function loadStories() {
      if (!token) return
      try {
        setLoadingStories(true)
        const data = await getAdminStories(token)
        setStories(data)
      } catch (err) {
        console.error('Failed to load stories:', err)
      } finally {
        setLoadingStories(false)
      }
    }
    loadStories()
  }, [token])

  const filteredCategories = useMemo(() => {
    return categories.filter(
      (c) =>
        c !== '全部' &&
        c.toLowerCase().includes(categoryInput.toLowerCase()) &&
        !uploadCategories.includes(c)
    )
  }, [categories, categoryInput, uploadCategories])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        isCategoryDropdownOpen &&
        categoryContainerRef.current &&
        !categoryContainerRef.current.contains(target)
      ) {
        setIsCategoryDropdownOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside, true)
    return () => document.removeEventListener('click', handleClickOutside, true)
  }, [isCategoryDropdownOpen])

  const addCategory = (cat: string) => {
    const trimmed = cat.trim()
    if (trimmed && !uploadCategories.includes(trimmed)) {
      setUploadCategories([...uploadCategories, trimmed])
    }
    setCategoryInput('')
  }

  const removeCategory = (cat: string) => {
    setUploadCategories(uploadCategories.filter((c) => c !== cat))
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith('image/')
    )
    if (files.length > 0) {
      const newFiles = files.map((f) => ({ id: crypto.randomUUID(), file: f }))
      setUploadFiles((prev) => [...prev, ...newFiles])
    }
  }

  const handleUpload = async () => {
    if (!token) return
    if (uploadFiles.length === 0) {
      setUploadError(t('admin.select_files'))
      return
    }
    if (uploadFiles.length === 1 && !uploadTitle.trim()) {
      setUploadError(t('admin.photo_title'))
      return
    }
    if (uploadCategories.length === 0) {
      setUploadError(t('admin.categories'))
      return
    }
    setUploadError('')

    // Compress images if enabled
    let filesToUpload = uploadFiles
    if (compressionEnabled) {
      setCompressing(true)
      setCompressionProgress({ current: 0, total: uploadFiles.length })

      const compressedFiles: { id: string; file: File }[] = []
      for (let i = 0; i < uploadFiles.length; i++) {
        const item = uploadFiles[i]
        try {
          // Only compress if file is larger than target size
          if (item.file.size > maxSizeMB * 1024 * 1024) {
            const compressedBlob = await imageCompression(item.file, {
              maxSizeMB: maxSizeMB,
              maxWidthOrHeight: 4096,
              useWebWorker: true,
              preserveExif: true,
            })
            // Ensure the compressed result is a File with the original name
            const compressedFile = new File(
              [compressedBlob],
              item.file.name,
              { type: compressedBlob.type, lastModified: Date.now() }
            )
            compressedFiles.push({ id: item.id, file: compressedFile })
          } else {
            compressedFiles.push(item)
          }
        } catch (err) {
          console.error(`Failed to compress ${item.file.name}:`, err)
          compressedFiles.push(item) // Use original if compression fails
        }
        setCompressionProgress({ current: i + 1, total: uploadFiles.length })
      }
      filesToUpload = compressedFiles
      setCompressing(false)
    }

    // Add tasks to the upload queue
    await addTasks({
      files: filesToUpload,
      title: uploadTitle.trim(),
      categories: uploadCategories,
      storageProvider: uploadSource || undefined,
      storagePath: uploadPath.trim() || undefined,
      storyId: uploadStoryId || undefined,
      token,
    })

    // Clear the form
    setUploadFiles([])
    setSelectedUploadIds(new Set())
    setUploadTitle('')
    setUploadStoryId('')

    notify(t('admin.upload_started'), 'info')
  }

  const handleRemoveUpload = (id: string) => {
    setUploadFiles((prev) => prev.filter((item) => item.id !== id))
    setSelectedUploadIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const handleSelectUploadToggle = (id: string) => {
    setSelectedUploadIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAllUploads = () => {
    if (selectedUploadIds.size === uploadFiles.length) {
      setSelectedUploadIds(new Set())
    } else {
      setSelectedUploadIds(new Set(uploadFiles.map((f) => f.id)))
    }
  }

  const handleBulkRemoveUploads = () => {
    if (selectedUploadIds.size === 0) return
    setUploadFiles((prev) => prev.filter((item) => !selectedUploadIds.has(item.id)))
    setSelectedUploadIds(new Set())
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
      <div className="lg:col-span-4 space-y-8">
        <div className="border border-border p-8 space-y-8 bg-card/50">
          <h3 className="font-serif text-xl font-light uppercase tracking-tight flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            {t('admin.upload_params')}
          </h3>
          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                {t('admin.photo_title')}
              </label>
              <CustomInput
                variant="config"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                disabled={uploadFiles.length > 1}
                placeholder={
                  uploadFiles.length > 1
                    ? t('admin.title_hint_multi')
                    : t('admin.title_hint_single')
                }
              />
            </div>
            <div ref={categoryContainerRef} className="relative">
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                {t('admin.categories')}
              </label>
              <div
                className="min-h-12 p-2 bg-background border-b border-border flex flex-wrap gap-2 cursor-text items-center transition-colors focus-within:border-primary"
                onClick={() => {
                  setIsCategoryDropdownOpen(true)
                  categoryContainerRef.current?.querySelector('input')?.focus()
                }}
              >
                {uploadCategories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider"
                  >
                    {cat}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeCategory(cat)
                      }}
                      className="hover:text-primary/70"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={categoryInput}
                  onChange={(e) => {
                    setCategoryInput(e.target.value)
                    setIsCategoryDropdownOpen(true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (categoryInput.trim()) addCategory(categoryInput)
                    } else if (
                      e.key === 'Backspace' &&
                      !categoryInput &&
                      uploadCategories.length > 0
                    ) {
                      removeCategory(uploadCategories[uploadCategories.length - 1])
                    }
                  }}
                  className="flex-1 min-w-[80px] outline-none bg-transparent text-sm font-mono"
                  placeholder={
                    uploadCategories.length === 0 ? t('admin.search_create') : ''
                  }
                />
              </div>
              {isCategoryDropdownOpen && (
                <div className="absolute z-10 w-full mt-1 bg-background border border-border shadow-2xl max-h-48 overflow-y-auto">
                  {filteredCategories.length > 0 ? (
                    filteredCategories.map((cat) => (
                      <button
                        key={cat}
                        onClick={(e) => {
                          e.stopPropagation()
                          addCategory(cat)
                        }}
                        className="w-full text-left px-4 py-3 text-xs font-bold uppercase tracking-wider hover:bg-primary hover:text-primary-foreground flex items-center justify-between group transition-colors"
                      >
                        <span>{cat}</span>
                        <Check className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                      </button>
                    ))
                  ) : categoryInput.trim() ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        addCategory(categoryInput)
                      }}
                      className="w-full text-left px-4 py-3 text-xs font-bold uppercase tracking-wider hover:bg-primary hover:text-primary-foreground text-primary flex items-center justify-between transition-colors"
                    >
                      <span>
                        Create "{categoryInput}"
                      </span>
                      <Plus className="w-3 h-3" />
                    </button>
                  ) : (
                    <div className="px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-widest text-center">
                      Start typing...
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-2">
                <BookOpen className="w-3 h-3" />
                照片叙事 (可选)
              </label>
              <CustomSelect
                value={uploadStoryId}
                onChange={setUploadStoryId}
                disabled={loadingStories}
                placeholder="不关联叙事"
                options={[
                  { value: '', label: '不关联叙事' },
                  ...stories.map((story) => ({
                    value: story.id,
                    label: story.title,
                    suffix: !story.isPublished ? '(草稿)' : undefined,
                  })),
                ]}
              />
              {loadingStories && (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  加载叙事列表...
                </p>
              )}
            </div>
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                  {t('admin.storage_provider')}
                </label>
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
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                  {t('admin.path_prefix')}
                </label>
                <CustomInput
                  variant="config"
                  value={uploadPath}
                  onChange={(e) => setUploadPath(e.target.value)}
                  placeholder="e.g., 2025/vacation"
                />
              </div>
            </div>

            {/* Image Compression */}
            <div className="border-t border-border pt-6">
              <div className="flex items-center justify-between mb-4">
                <label className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  <Minimize2 className="w-3 h-3" />
                  {t('admin.image_compression')}
                </label>
                <button
                  onClick={() => setCompressionEnabled(!compressionEnabled)}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                    compressionEnabled ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span
                    className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                      compressionEnabled ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {compressionEnabled && (
                <div className="space-y-3">
                  <p className="text-[10px] text-muted-foreground">
                    {t('admin.compression_hint')}
                  </p>
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                      {t('admin.max_size_mb')}
                    </label>
                    <CustomInput
                      variant="config"
                      type="number"
                      min="0.5"
                      max="10"
                      step="0.5"
                      value={maxSizeMB}
                      onChange={(e) => setMaxSizeMB(parseFloat(e.target.value) || 4)}
                      className="w-20 text-center"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="pt-4">
            <button
              onClick={handleUpload}
              disabled={compressing || uploadFiles.length === 0}
              className="w-full py-4 bg-foreground text-background text-xs font-bold uppercase tracking-[0.2em] hover:bg-primary hover:text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2"
            >
              {compressing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {t('admin.compressing')} ({compressionProgress.current}/
                    {compressionProgress.total})
                  </span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{t('admin.start_upload')}</span>
                </>
              )}
            </button>
            {uploadError && (
              <p className="mt-4 text-[10px] text-destructive text-center font-bold uppercase tracking-widest">
                {uploadError}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="lg:col-span-8 flex flex-col">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`h-[600px] border border-dashed transition-all flex flex-col relative ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-border bg-muted/20'
          }`}
        >
          {uploadFiles.length > 0 ? (
            <div className="flex-1 flex flex-col p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-4 px-2">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 mr-2">
                    <input
                      type="checkbox"
                      checked={
                        uploadFiles.length > 0 &&
                        selectedUploadIds.size === uploadFiles.length
                      }
                      onChange={handleSelectAllUploads}
                      disabled={uploadFiles.length === 0}
                      className="w-4 h-4 accent-primary cursor-pointer"
                    />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      {selectedUploadIds.size > 0
                        ? `${selectedUploadIds.size} Selected`
                        : `${uploadFiles.length} ${t('admin.items')}`}
                    </span>
                  </div>
                  {selectedUploadIds.size > 0 && (
                    <button
                      onClick={handleBulkRemoveUploads}
                      className="p-1.5 text-destructive hover:bg-destructive/10 transition-colors rounded"
                      title="Delete Selected"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex bg-muted p-1 border border-border">
                    <button
                      onClick={() => setUploadViewMode('list')}
                      className={`p-1.5 transition-all ${
                        uploadViewMode === 'list'
                          ? 'bg-background text-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <ListIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setUploadViewMode('grid')}
                      className={`p-1.5 transition-all ${
                        uploadViewMode === 'grid'
                          ? 'bg-background text-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button
                    onClick={() => setUploadFiles([])}
                    className="flex items-center gap-2 text-destructive hover:opacity-80 transition-opacity text-[10px] font-bold uppercase tracking-widest"
                  >
                    Clear
                  </button>
                  <div className="h-4 w-[1px] bg-border"></div>
                  <label className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors text-[10px] font-bold uppercase tracking-widest">
                    <Plus className="w-3.5 h-3.5" />
                    {t('admin.add_more')}
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) {
                          const newFiles = Array.from(e.target.files).map(
                            (f) => ({
                              id: crypto.randomUUID(),
                              file: f,
                            })
                          )
                          setUploadFiles((prev) => [...prev, ...newFiles])
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                <div
                  className={
                    uploadViewMode === 'grid'
                      ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4'
                      : 'flex flex-col'
                  }
                >
                  {uploadFiles.map((item) => (
                    <UploadFileItem
                      key={item.id}
                      id={item.id}
                      file={item.file}
                      onRemove={handleRemoveUpload}
                      uploading={false}
                      isUploaded={false}
                      isCurrent={false}
                      viewMode={uploadViewMode}
                      selected={selectedUploadIds.has(item.id)}
                      onSelect={handleSelectUploadToggle}
                      onPreview={() => onPreview(item)}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
              <Upload className="w-16 h-16 mb-6 opacity-10" />
              <p className="text-sm font-bold uppercase tracking-[0.2em] mb-4">
                {t('admin.drop_here')}
              </p>
              <p className="text-[10px] font-mono opacity-50 mb-8">
                {t('admin.support_types')}
              </p>
              <label className="px-8 py-3 border border-border hover:border-primary hover:text-primary transition-all cursor-pointer text-xs font-bold uppercase tracking-[0.2em]">
                {t('admin.select_files')}
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      const newFiles = Array.from(e.target.files).map((f) => ({
                        id: crypto.randomUUID(),
                        file: f,
                      }))
                      setUploadFiles((prev) => [...prev, ...newFiles])
                    }
                  }}
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
