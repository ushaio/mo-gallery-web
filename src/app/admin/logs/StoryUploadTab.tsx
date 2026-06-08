/**
 * 故事上传标签页 - 批量上传照片并快速创建故事
 */
'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
  Upload,
  Loader2,
  X,
  Trash2,
  List as ListIcon,
  LayoutGrid,
  Plus,
  BookOpen,
  Edit3,
} from 'lucide-react'
import type { AdminSettingsDto } from '@/lib/api/types'
import { createStory } from '@/lib/api/stories'
import { compressImage } from '@/lib/image-compress'
import { formatFileSize } from '@/lib/utils'
import { useUploadQueue } from '@/contexts/UploadQueueContext'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminInput } from '@/components/admin/AdminFormControls'
import { DigitalPhotoUploadParams, type DigitalPhotoUploadSettings } from '@/components/admin/DigitalPhotoUploadParams'

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

  // 上传设置（从子组件获取）
  const [uploadSettings, setUploadSettings] = useState<DigitalPhotoUploadSettings>({
    title: '',
    categories: [],
    compressionEnabled: true,
    maxSizeMB: 0,
    showFlag: true,
    privacyStripEnabled: false,
  })

  // 上传状态
  const [uploadError, setUploadError] = useState('')
  const [compressing, setCompressing] = useState(false)
  const [compressionProgress, setCompressionProgress] = useState({ current: 0, total: 0 })

  const totalOriginalSize = useMemo(
    () => uploadFiles.reduce((sum, f) => sum + f.file.size, 0),
    [uploadFiles]
  )

  const estimateFileSize = (file: File): number => {
    if (!uploadSettings.compressionEnabled) return file.size
    if (uploadSettings.maxSizeMB <= 0) return Math.min(file.size * 0.7, file.size)
    const target = uploadSettings.maxSizeMB * 1024 * 1024
    if (file.size <= target) return file.size
    return Math.min(file.size * 0.45, target)
  }

  const estimatedTotalSize = useMemo(() => {
    if (!uploadSettings.compressionEnabled || uploadFiles.length === 0) return totalOriginalSize
    return uploadFiles.reduce((sum, f) => sum + estimateFileSize(f.file), 0)
  }, [uploadFiles, uploadSettings.compressionEnabled, uploadSettings.maxSizeMB, totalOriginalSize])

  const savingsPercent = useMemo(() => {
    if (!uploadSettings.compressionEnabled || totalOriginalSize === 0) return 0
    return Math.round((1 - estimatedTotalSize / totalOriginalSize) * 100)
  }, [uploadSettings.compressionEnabled, totalOriginalSize, estimatedTotalSize])

  const compressionSuggestion = useMemo(() => {
    if (uploadFiles.length === 0) return null
    const targetBytes = uploadSettings.maxSizeMB * 1024 * 1024
    const avgSize = totalOriginalSize / uploadFiles.length

    if (!uploadSettings.compressionEnabled) {
      if (avgSize > 5 * 1024 * 1024) {
        return { type: 'suggest_enable' as const, text: t('admin.compression_suggest_enable') || '图片较大，启用压缩可显著节省体积' }
      }
      if (avgSize < 1024 * 1024) {
        return { type: 'info' as const, text: t('admin.compression_already_small') || '图片已较小，可保持关闭' }
      }
      return null
    }

    if (uploadSettings.maxSizeMB <= 0) return null

    const filesUnderTarget = uploadFiles.filter(f => f.file.size <= targetBytes).length
    if (filesUnderTarget === uploadFiles.length) {
      return { type: 'suggest_disable' as const, text: t('admin.compression_suggest_disable') || '所有图片已小于上限，可关闭压缩' }
    }

    if (filesUnderTarget > 0) {
      const tmpl = t('admin.compression_partial_skip') || '{under}/{total} 张已小于上限，将原样上传'
      return { type: 'info' as const, text: tmpl.replace('{under}', String(filesUnderTarget)).replace('{total}', String(uploadFiles.length)) }
    }

    return null
  }, [uploadFiles, uploadSettings.compressionEnabled, uploadSettings.maxSizeMB, totalOriginalSize, t])

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
    if (uploadSettings.categories.length === 0) {
      setUploadError(t('admin.categories'))
      return
    }

    setUploadError('')

    // 仅上传待处理的文件
    let filesToUpload = uploadFiles.filter(f => f.status === 'pending')

    // 如果启用了压缩，先压缩图片
    if (uploadSettings.compressionEnabled) {
      setCompressing(true)
      setCompressionProgress({ current: 0, total: filesToUpload.length })

      const compressedFiles: StoryUploadFile[] = []
      for (let i = 0; i < filesToUpload.length; i++) {
        const item = filesToUpload[i]
        try {
          const file = await compressImage(item.file, {
            mode: 'compress',
            maxSizeMB: uploadSettings.maxSizeMB > 0 ? uploadSettings.maxSizeMB : undefined,
          })
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
        title: uploadSettings.title.trim() || '', // Will use filename if empty
        categories: uploadSettings.categories,
        storageProvider: uploadSettings.storageSourceId ? undefined : 'local',
        storageSourceId: uploadSettings.storageSourceId,
        storagePath: uploadSettings.storagePath,
        storagePathFull: uploadSettings.storagePathFull,
        storyId: story.id,
        albumIds: uploadSettings.albumIds,
        showFlag: uploadSettings.showFlag,
        compressionMode: uploadSettings.compressionEnabled ? 'compress' : undefined,
        maxSizeMB: uploadSettings.compressionEnabled && uploadSettings.maxSizeMB > 0 ? uploadSettings.maxSizeMB : undefined,
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

  const handleRemoveSelected = () => {
    setUploadFiles((prev) => prev.filter((item) => !selectedUploadIds.has(item.id)))
    setSelectedUploadIds(new Set())
  }

  const handleSelectAll = () => {
    if (selectedUploadIds.size === uploadFiles.length) {
      setSelectedUploadIds(new Set())
    } else {
      setSelectedUploadIds(new Set(uploadFiles.map((f) => f.id)))
    }
  }

  const pendingCount = uploadFiles.filter((f) => f.status === 'pending').length

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
      {/* 左侧面板 - 故事信息 + 上传设置 */}
      <div className="lg:col-span-4 space-y-8">
        {/* 故事信息 */}
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
                placeholder={t('admin.title_hint_single')}
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
          </div>
        </div>

        {/* 照片上传设置 - 使用复用组件 */}
        <DigitalPhotoUploadParams
          token={token}
          categories={categories}
          t={t}
          fileCount={uploadFiles.length}
          totalOriginalSize={totalOriginalSize}
          estimatedTotalSize={estimatedTotalSize}
          savingsPercent={savingsPercent}
          compressionSuggestion={compressionSuggestion}
          onSettingsChange={setUploadSettings}
          onUploadClick={handleUpload}
          uploading={compressing}
          uploadError={uploadError}
        />
      </div>

      {/* 右侧面板 - 照片列表 */}
      <div className="lg:col-span-8">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`min-h-[600px] border-2 border-dashed transition-all ${
            isDragging ? 'border-primary bg-primary/5' : 'border-border/50 bg-muted/10'
          }`}
        >
          {uploadFiles.length > 0 ? (
            <div className="p-6">
              {/* 工具栏 */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-border/50">
                <div className="flex items-center gap-4">
                  <input
                    type="checkbox"
                    checked={uploadFiles.length > 0 && selectedUploadIds.size === uploadFiles.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 accent-primary cursor-pointer"
                  />
                  <span className="text-sm text-muted-foreground">
                    {selectedUploadIds.size
                      ? `${selectedUploadIds.size} ${t('admin.selected')}`
                      : `${uploadFiles.length} ${t('admin.files')}`}
                  </span>
                  {uploadFiles.length > 0 && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {formatFileSize(totalOriginalSize)}
                      {uploadSettings.compressionEnabled && estimatedTotalSize < totalOriginalSize && (
                        <>
                          <span className="mx-1">→</span>
                          <span className="text-primary">~{formatFileSize(estimatedTotalSize)}</span>
                          {savingsPercent > 0 && (
                            <span className="ml-1.5 text-[10px] text-emerald-600">
                              ↓{savingsPercent}%
                            </span>
                          )}
                        </>
                      )}
                    </span>
                  )}
                  {selectedUploadIds.size > 0 && (
                    <AdminButton
                      onClick={handleRemoveSelected}
                      adminVariant="iconDestructive"
                      size="xs"
                      className="p-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </AdminButton>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 border border-border rounded">
                    <button
                      onClick={() => setUploadViewMode('list')}
                      className={`p-2 transition-colors ${
                        uploadViewMode === 'list'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <ListIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setUploadViewMode('grid')}
                      className={`p-2 transition-colors ${
                        uploadViewMode === 'grid'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary cursor-pointer transition-colors">
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
              {uploadViewMode === 'list' ? (
                <div className="space-y-1">
                  {uploadFiles.map((item) => (
                    <div
                      key={item.id}
                      className="group flex items-center gap-4 p-4 bg-background border border-transparent hover:border-border transition-all"
                    >
                      <input
                        type="checkbox"
                        checked={selectedUploadIds.has(item.id)}
                        onChange={() => handleSelectUploadToggle(item.id)}
                        className="w-4 h-4 accent-primary cursor-pointer"
                      />
                      <div className="w-14 h-14 bg-muted/50 overflow-hidden flex-shrink-0">
                        {item.previewUrl && (
                          <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.file.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {formatFileSize(item.file.size)}
                        </p>
                      </div>
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <AdminButton
                          onClick={() => handleRemoveUpload(item.id)}
                          adminVariant="iconDestructive"
                          size="sm"
                          className="p-2"
                        >
                          <X className="w-4 h-4" />
                        </AdminButton>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {uploadFiles.map((item) => (
                    <div
                      key={item.id}
                      className="group relative aspect-square bg-muted/50 overflow-hidden border border-transparent hover:border-border transition-all"
                    >
                      {item.previewUrl && (
                        <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <AdminButton
                          onClick={() => handleRemoveUpload(item.id)}
                          adminVariant="iconDestructive"
                          size="sm"
                          className="p-2"
                        >
                          <X className="w-4 h-4" />
                        </AdminButton>
                      </div>
                      <div className="absolute top-2 left-2">
                        <input
                          type="checkbox"
                          checked={selectedUploadIds.has(item.id)}
                          onChange={() => handleSelectUploadToggle(item.id)}
                          className="w-4 h-4 accent-primary cursor-pointer"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                  onChange={handleFileSelect}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* 压缩进度提示 */}
      {compressing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-border p-8 shadow-2xl">
            <div className="flex items-center gap-4">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <div>
                <p className="text-sm font-medium">{t('admin.compressing')}</p>
                <p className="text-xs text-muted-foreground">
                  {compressionProgress.current} / {compressionProgress.total}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
