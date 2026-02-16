/**
 * 故事上传标签页 - 批量上传照片并快速创建故事
 */
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
  Edit3,
  ArrowRight,
  Minimize2,
} from 'lucide-react'
import { AdminSettingsDto, uploadPhoto, createStory } from '@/lib/api'
import { compressImage, type CompressionMode } from '@/lib/image-compress'
import { formatFileSize } from '@/lib/utils'
import { useUploadQueue } from '@/contexts/UploadQueueContext'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminInput, AdminMultiSelect } from '@/components/admin/AdminFormControls'

interface StoryUploadFile {
  id: string
  file: File
  title: string
  previewUrl?: string
  status: 'pending' | 'uploading' | 'success' | 'failed'
  uploadedPhotoId?: string
}

interface StoryUploadTabProps {
  token: string | null
  categories: string[]
  settings: AdminSettingsDto | null
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  onStoryCreated: (storyId: string) => void
}

export function StoryUploadTab({
  token,
  categories,
  settings,
  t,
  notify,
  onStoryCreated,
}: StoryUploadTabProps) {
  const { addTasks } = useUploadQueue()

  // 故事字段
  const [storyTitle, setStoryTitle] = useState('')
  const [storyDescription, setStoryDescription] = useState('')

  // 照片字段
  const [uploadFiles, setUploadFiles] = useState<StoryUploadFile[]>([])
  const [uploadViewMode, setUploadViewMode] = useState<'list' | 'grid'>('list')
  const [selectedUploadIds, setSelectedUploadIds] = useState<Set<string>>(new Set())
  const [isDragging, setIsDragging] = useState(false)

  // 分类
  const [uploadCategories, setUploadCategories] = useState<string[]>([])

  // 批量标题
  const [batchPhotoTitle, setBatchPhotoTitle] = useState('')

  // 存储配置
  const [uploadSource, setUploadSource] = useState('local')
  const [isInitialized, setIsInitialized] = useState(false)
  const [uploadPath, setUploadPath] = useState('')

  // 上传状态
  const [uploadError, setUploadError] = useState('')

  // 压缩设置
  const [compressionMode, setCompressionMode] = useState<CompressionMode>('none')
  const [maxSizeMB, setMaxSizeMB] = useState(4)
  const [compressing, setCompressing] = useState(false)
  const [compressionProgress, setCompressionProgress] = useState({ current: 0, total: 0 })

  // 从设置初始化默认值
  useEffect(() => {
    if (settings?.storage_provider && !isInitialized) {
      queueMicrotask(() => {
        setUploadSource(settings.storage_provider)
        setIsInitialized(true)
      })
    }
  }, [settings, isInitialized])

  const categoryOptions = useMemo(
    () =>
      categories
        .filter((c) => c !== 'all' && c !== '全部')
        .map((c) => ({ value: c, label: c })),
    [categories]
  )

  // 生成文件缩略图预览
  const generatePreview = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.src = url
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const maxSize = 120
        let width = img.width
        let height = img.height
        if (width > height) {
          if (width > maxSize) {
            height *= maxSize / width
            width = maxSize
          }
        } else {
          if (height > maxSize) {
            width *= maxSize / height
            height = maxSize
          }
        }
        canvas.width = width
        canvas.height = height
        ctx?.drawImage(img, 0, 0, width, height)
        const thumbUrl = canvas.toDataURL('image/webp', 0.8)
        URL.revokeObjectURL(url)
        resolve(thumbUrl)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve('')
      }
    })
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith('image/')
    )
    if (files.length > 0) {
      const newFiles: StoryUploadFile[] = await Promise.all(
        files.map(async (f) => {
          const previewUrl = await generatePreview(f)
          return {
            id: crypto.randomUUID(),
            file: f,
            title: f.name.replace(/\.[^/.]+$/, ''),
            previewUrl,
            status: 'pending' as const,
          }
        })
      )
      setUploadFiles((prev) => [...prev, ...newFiles])
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      const newFiles: StoryUploadFile[] = await Promise.all(
        files.map(async (f) => {
          const previewUrl = await generatePreview(f)
          return {
            id: crypto.randomUUID(),
            file: f,
            title: f.name.replace(/\.[^/.]+$/, ''),
            previewUrl,
            status: 'pending' as const,
          }
        })
      )
      setUploadFiles((prev) => [...prev, ...newFiles])
    }
  }

  const handleUpload = async () => {
    if (!token) return
    if (uploadFiles.length === 0) {
      setUploadError(t('admin.select_files'))
      return
    }
    if (!storyTitle.trim()) {
      setUploadError(t('admin.story_title'))
      return
    }
    if (uploadCategories.length === 0) {
      setUploadError(t('admin.categories'))
      return
    }

    setUploadError('')

    // 仅上传待处理的文件
    let filesToUpload = uploadFiles.filter(f => f.status === 'pending')

    // 如果启用了压缩，先压缩图片
    if (compressionMode !== 'none') {
      setCompressing(true)
      setCompressionProgress({ current: 0, total: filesToUpload.length })

      const compressedFiles: StoryUploadFile[] = []
      for (let i = 0; i < filesToUpload.length; i++) {
        const item = filesToUpload[i]
        try {
          const file = await compressImage(item.file, { mode: compressionMode, maxSizeMB })
          compressedFiles.push({ ...item, file })
        } catch {
          compressedFiles.push(item)
        }
        setCompressionProgress({ current: i + 1, total: filesToUpload.length })
      }
      filesToUpload = compressedFiles
      setCompressing(false)
    }

    // 先创建故事（不含照片）
    try {
      const story = await createStory(token, {
        title: storyTitle.trim(),
        content: storyDescription.trim() || '',
        isPublished: false,
        photoIds: [],
      })

      // 将任务添加到上传队列，队列将处理上传并关联照片到故事
      await addTasks({
        files: filesToUpload.map(item => ({ id: item.id, file: item.file })),
        title: batchPhotoTitle.trim() || '', // Will use filename if empty
        categories: uploadCategories,
        storageProvider: uploadSource || undefined,
        storagePath: uploadPath.trim() || undefined,
        storyId: story.id,
        albumIds: undefined,
        token,
      })

      // 清空表单
      setUploadFiles([])
      setSelectedUploadIds(new Set())
      setStoryTitle('')
      setStoryDescription('')

      notify(t('admin.upload_started'), 'info')

      // 跳转到故事编辑器
      onStoryCreated(story.id)
    } catch (err) {
      console.error('Failed to create story:', err)
      setUploadError(err instanceof Error ? err.message : t('common.error'))
      notify(t('common.error'), 'error')
    }
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

  const handleTitleChange = (id: string, title: string) => {
    setUploadFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, title } : f))
    )
  }

  const pendingCount = uploadFiles.filter(f => f.status === 'pending').length

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
      {/* 左侧面板 - 故事信息 */}
      <div className="lg:col-span-4 space-y-8">
        <div className="border border-border p-8 space-y-8 bg-card/50">
          <h3 className="font-serif text-xl font-light uppercase tracking-tight flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            {t('admin.upload_tab_story')}
          </h3>
          <div className="space-y-6">
            {/* 故事标题 */}
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                {t('admin.story_title')} *
              </label>
              <AdminInput
                type="text"
                value={storyTitle}
                onChange={(e) => setStoryTitle(e.target.value)}
                placeholder="e.g., 春日漫步"
              />
            </div>

            {/* 故事描述 */}
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                {t('admin.story_description')}
              </label>
              <textarea
                value={storyDescription}
                onChange={(e) => setStoryDescription(e.target.value)}
                rows={3}
                className="w-full p-3 bg-background border-b border-border focus:border-primary outline-none text-sm transition-colors rounded-none placeholder:text-muted-foreground/30 resize-none"
                placeholder={t('admin.story_description_hint')}
              />
            </div>

            {/* 分类（多选、可搜索、可创建） */}
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                {t('admin.categories')} *
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

            {/* 批量照片标题 */}
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                {t('admin.batch_photo_title')}
              </label>
              <AdminInput
                type="text"
                value={batchPhotoTitle}
                onChange={(e) => setBatchPhotoTitle(e.target.value)}
                placeholder={t('admin.batch_photo_title_hint')}
              />
            </div>

            {/* 存储配置 */}
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                  {t('admin.storage_provider')}
                </label>
                <select
                  value={uploadSource}
                  onChange={(e) => setUploadSource(e.target.value)}
                  className="w-full p-3 bg-background border-b border-border focus:border-primary outline-none text-xs font-bold uppercase tracking-wider"
                >
                  <option value="local">Local Storage</option>
                  <option value="r2">Cloudflare R2</option>
                  <option value="github">GitHub</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                  {t('admin.path_prefix')}
                </label>
                <AdminInput
                  type="text"
                  value={uploadPath}
                  onChange={(e) => setUploadPath(e.target.value)}
                  placeholder="e.g., 2025/stories"
                />
              </div>
            </div>

            {/* 图片压缩 */}
            <div className="border-t border-border pt-6">
              <label className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                <Minimize2 className="w-3 h-3" />
                {t('admin.image_compression')}
              </label>
              <select
                value={compressionMode}
                onChange={(e) => setCompressionMode(e.target.value as CompressionMode)}
                className="w-full p-3 bg-background border-b border-border focus:border-primary outline-none text-xs font-bold uppercase tracking-wider"
              >
                <option value="none">{t('admin.compression_none')}</option>
                <option value="quality">{t('admin.compression_quality')}</option>
                <option value="size">{t('admin.compression_size')}</option>
              </select>
              {compressionMode === 'quality' && (
                <div className="flex items-center gap-3 mt-3">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                    {t('admin.max_size_mb')}
                  </label>
                  <AdminInput
                    type="number"
                    min="0.5"
                    max="10"
                    step="0.5"
                    value={maxSizeMB}
                    onChange={(e) => setMaxSizeMB(parseFloat(e.target.value) || 4)}
                    className="w-20 text-center"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 上传按钮 */}
          <div className="pt-4">
            <AdminButton
              onClick={handleUpload}
              disabled={compressing || pendingCount === 0}
              adminVariant="primary"
              size="lg"
              className="w-full py-4 bg-foreground text-background text-xs font-bold uppercase tracking-[0.2em] hover:bg-primary hover:text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
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
                  <span>{t('admin.create_story_upload')}</span>
                </>
              )}
            </AdminButton>
            {uploadError && (
              <p className="mt-4 text-[10px] text-destructive text-center font-bold uppercase tracking-widest">
                {uploadError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 右侧面板 - 上传区域 */}
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
              {/* 工具栏 */}
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
                      className="w-4 h-4 accent-primary cursor-pointer"
                    />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      {selectedUploadIds.size > 0
                        ? `${selectedUploadIds.size} Selected`
                        : `${uploadFiles.length} ${t('admin.items')}`}
                    </span>
                  </div>
                  {selectedUploadIds.size > 0 && (
                    <AdminButton
                      onClick={handleBulkRemoveUploads}
                      adminVariant="iconDestructive"
                      size="xs"
                      className="p-1.5 rounded"
                      title="Delete Selected"
                    >
                      <Trash2 className="w-4 h-4" />
                    </AdminButton>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex bg-muted p-1 border border-border">
                    <AdminButton
                      onClick={() => setUploadViewMode('list')}
                      adminVariant="icon"
                      size="xs"
                      className={`p-1.5 ${
                        uploadViewMode === 'list'
                          ? 'bg-background text-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <ListIcon className="w-3.5 h-3.5" />
                    </AdminButton>
                    <AdminButton
                      onClick={() => setUploadViewMode('grid')}
                      adminVariant="icon"
                      size="xs"
                      className={`p-1.5 ${
                        uploadViewMode === 'grid'
                          ? 'bg-background text-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </AdminButton>
                  </div>
                  <AdminButton
                    onClick={() => {
                      setUploadFiles([])
                    }}
                    adminVariant="link"
                    size="xs"
                    className="text-destructive hover:opacity-80 text-[10px] font-bold uppercase tracking-widest"
                  >
                    Clear
                  </AdminButton>
                  <div className="h-4 w-[1px] bg-border"></div>
                  <label className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors text-[10px] font-bold uppercase tracking-widest">
                    <Plus className="w-3.5 h-3.5" />
                    {t('admin.add_more')}
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </label>
                </div>
              </div>

              {/* 文件列表 */}
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                <div
                  className={
                    uploadViewMode === 'grid'
                      ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4'
                      : 'flex flex-col'
                  }
                >
                  {uploadFiles.map((item) => (
                    <StoryUploadFileItem
                      key={item.id}
                      item={item}
                      viewMode={uploadViewMode}
                      selected={selectedUploadIds.has(item.id)}
                      uploading={false}
                      onSelect={handleSelectUploadToggle}
                      onRemove={handleRemoveUpload}
                      onTitleChange={handleTitleChange}
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
                  onChange={handleFileSelect}
                />
              </label>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// 文件项组件 - 支持标题编辑
function StoryUploadFileItem({
  item,
  viewMode,
  selected,
  uploading,
  onSelect,
  onRemove,
  onTitleChange,
}: {
  item: StoryUploadFile
  viewMode: 'list' | 'grid'
  selected: boolean
  uploading: boolean
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onTitleChange: (id: string, title: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(item.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSaveTitle = () => {
    onTitleChange(item.id, editTitle.trim() || item.file.name.replace(/\.[^/.]+$/, ''))
    setIsEditing(false)
  }

  const statusIcon = () => {
    switch (item.status) {
      case 'uploading':
        return <Loader2 className="w-4 h-4 animate-spin text-primary" />
      case 'success':
        return <Check className="w-4 h-4 text-green-500" />
      case 'failed':
        return <X className="w-4 h-4 text-destructive" />
      default:
        return null
    }
  }

  if (viewMode === 'grid') {
    return (
      <div
        className={`relative aspect-square border border-border transition-all group overflow-hidden ${
          item.status === 'uploading' ? 'ring-2 ring-primary' : ''
        } ${item.status === 'failed' ? 'ring-2 ring-destructive' : ''} ${
          selected ? 'border-primary bg-primary/5' : 'bg-background'
        }`}
      >
        {item.previewUrl ? (
          <img
            src={item.previewUrl}
            alt=""
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Upload className="w-6 h-6 text-muted-foreground/20" />
          </div>
        )}

        {/* 选择复选框 */}
        <div
          className={`absolute top-2 left-2 z-20 transition-opacity ${
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect(item.id)}
            disabled={uploading}
            className="w-4 h-4 accent-primary cursor-pointer border-border bg-background"
          />
        </div>

        {/* 状态遮罩 */}
        {item.status !== 'pending' && (
          <div
            className={`absolute inset-0 flex items-center justify-center z-20 ${
              item.status === 'success'
                ? 'bg-green-500/20'
                : item.status === 'failed'
                ? 'bg-destructive/20'
                : 'bg-background/40'
            }`}
          >
            {statusIcon()}
          </div>
        )}

        {/* 删除按钮 */}
        {!uploading && item.status !== 'success' && (
          <AdminButton
            onClick={() => onRemove(item.id)}
            adminVariant="iconDestructive"
            size="xs"
            className="absolute top-2 right-2 p-1.5 bg-background/80 opacity-0 group-hover:opacity-100 transition-all z-20"
          >
            <X className="w-3 h-3" />
          </AdminButton>
        )}

        {/* 底部标题 */}
        <div className="absolute bottom-0 left-0 w-full p-2 bg-background/90 opacity-0 group-hover:opacity-100 transition-opacity">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle()
                if (e.key === 'Escape') {
                  setEditTitle(item.title)
                  setIsEditing(false)
                }
              }}
              className="w-full bg-transparent border-b border-primary text-[10px] font-mono outline-none"
            />
          ) : (
            <div
              className="text-[10px] font-mono truncate cursor-pointer hover:text-primary flex items-center gap-1"
              onClick={() => !uploading && setIsEditing(true)}
            >
              <span className="truncate">{item.title}</span>
              <Edit3 className="w-2.5 h-2.5 flex-shrink-0 opacity-50" />
            </div>
          )}
        </div>
      </div>
    )
  }

  // 列表视图
  return (
    <div
      className={`flex items-center gap-4 p-3 border border-border mb-2 transition-colors ${
        item.status === 'uploading'
          ? 'bg-primary/5 border-primary/30'
          : item.status === 'failed'
          ? 'bg-destructive/5 border-destructive/30'
          : 'bg-background hover:bg-muted/30'
      } ${selected ? 'border-primary/50 bg-primary/5' : ''}`}
    >
      {/* 复选框 */}
      <div className="flex items-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(item.id)}
          disabled={uploading}
          className="w-4 h-4 accent-primary cursor-pointer"
        />
      </div>

      {/* 缩略图预览 */}
      <div className="w-12 h-12 flex-shrink-0 bg-muted overflow-hidden border border-border">
        {item.previewUrl ? (
          <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Upload className="w-4 h-4 text-muted-foreground/20" />
          </div>
        )}
      </div>

      {/* 标题（可编辑） */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveTitle()
              if (e.key === 'Escape') {
                setEditTitle(item.title)
                setIsEditing(false)
              }
            }}
            className="w-full bg-transparent border-b border-primary text-xs font-bold uppercase tracking-wider outline-none"
          />
        ) : (
          <div
            className="flex items-center gap-2 cursor-pointer group/title"
            onClick={() => !uploading && setIsEditing(true)}
          >
            <p className="text-xs font-bold uppercase tracking-wider truncate text-foreground group-hover/title:text-primary transition-colors">
              {item.title}
            </p>
            <Edit3 className="w-3 h-3 text-muted-foreground opacity-0 group-hover/title:opacity-100 transition-opacity flex-shrink-0" />
          </div>
        )}
        <p className="text-[10px] font-mono text-muted-foreground">
          {formatFileSize(item.file.size)}
        </p>
      </div>

      {/* 状态 / 操作 */}
      <div className="flex items-center gap-3">
        {item.status === 'success' ? (
          <div className="flex items-center gap-1 text-green-500">
            <Check className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">
              Done
            </span>
          </div>
        ) : item.status === 'uploading' ? (
          <div className="flex items-center gap-2 text-primary">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline animate-pulse">
              Processing
            </span>
          </div>
        ) : item.status === 'failed' ? (
          <div className="flex items-center gap-1 text-destructive">
            <X className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">
              Failed
            </span>
          </div>
        ) : uploading ? (
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-50">
            Waiting
          </span>
        ) : (
          <AdminButton
            onClick={() => onRemove(item.id)}
            adminVariant="iconDestructive"
            size="xs"
            className="p-2"
          >
            <X className="w-4 h-4" />
          </AdminButton>
        )}
      </div>
    </div>
  )
}

