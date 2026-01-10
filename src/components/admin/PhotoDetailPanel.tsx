'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Save,
  Star,
  Camera,
  FileText,
  Tag,
  Aperture,
  Clock,
  BookOpen,
  Plus,
  Check,
  ImageIcon,
  Palette,
  RefreshCw,
} from 'lucide-react'
import {
  PhotoDto,
  StoryDto,
  resolveAssetUrl,
  updatePhoto,
  ApiUnauthorizedError,
  getAdminPhotoStory,
  createStory,
  updateStory,
  addPhotosToStory,
  removePhotoFromStory,
  reanalyzePhotoColors,
} from '@/lib/api'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminInput, AdminSelect } from '@/components/admin/AdminFormControls'

interface PhotoDetailPanelProps {
  photo: PhotoDto | null
  isOpen: boolean
  categories: string[]
  allPhotos: PhotoDto[]
  cdnDomain?: string
  token: string | null
  onClose: () => void
  onSave: (photo: PhotoDto) => void
  onUnauthorized: () => void
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
}

export function PhotoDetailPanel({
  photo,
  isOpen,
  categories,
  allPhotos,
  cdnDomain,
  token,
  onClose,
  onSave,
  onUnauthorized,
  t,
  notify,
}: PhotoDetailPanelProps) {
  const [editData, setEditData] = useState({
    title: '',
    category: '',
    isFeatured: false,
    storagePath: '',
  })
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'info' | 'story'>('info')

  // Story state
  const [story, setStory] = useState<StoryDto | null>(null)
  const [storyLoading, setStoryLoading] = useState(false)
  const [storyLoaded, setStoryLoaded] = useState(false)
  const [storyData, setStoryData] = useState({
    title: '',
    content: '',
    isPublished: false,
  })
  const [storySaving, setStorySaving] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [displayColors, setDisplayColors] = useState<string[]>([])

  // Photo selection for adding to story
  const [showPhotoSelector, setShowPhotoSelector] = useState(false)
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set())

  // Reset form when photo changes
  useEffect(() => {
    if (photo) {
      // Extract path from storageKey (remove filename)
      const storageKey = photo.storageKey || ''
      const lastSlash = storageKey.lastIndexOf('/')
      const storagePath = lastSlash >= 0 ? storageKey.substring(0, lastSlash) : ''
      
      setEditData({
        title: photo.title || '',
        category: photo.category || '',
        isFeatured: photo.isFeatured || false,
        storagePath,
      })
      setDisplayColors(photo.dominantColors || [])
      setActiveTab('info')
      setStory(null)
      setStoryLoaded(false)
      setStoryData({ title: '', content: '', isPublished: false })
      setShowPhotoSelector(false)
      setSelectedPhotoIds(new Set())
    }
  }, [photo])

  // Load story when story tab is active
  useEffect(() => {
    if (activeTab === 'story' && photo && token && !storyLoaded && !storyLoading) {
      setStoryLoading(true)
      getAdminPhotoStory(token, photo.id)
        .then((s) => {
          setStory(s)
          if (s) {
            setStoryData({
              title: s.title,
              content: s.content,
              isPublished: s.isPublished,
            })
          }
        })
        .catch(() => setStory(null))
        .finally(() => {
          setStoryLoading(false)
          setStoryLoaded(true)
        })
    }
  }, [activeTab, photo, token, storyLoaded, storyLoading])

  // Photos available to add (not already in story)
  const availablePhotos = useMemo(() => {
    if (!story) return allPhotos
    const storyPhotoIds = new Set(story.photos.map(p => p.id))
    return allPhotos.filter(p => !storyPhotoIds.has(p.id))
  }, [allPhotos, story])

  const handleSave = async () => {
    if (!photo || !token) return

    setSaving(true)
    try {
      // Check if path changed
      const storageKey = photo.storageKey || ''
      const lastSlash = storageKey.lastIndexOf('/')
      const currentPath = lastSlash >= 0 ? storageKey.substring(0, lastSlash) : ''
      const pathChanged = editData.storagePath !== currentPath

      const updated = await updatePhoto({
        token,
        id: photo.id,
        patch: {
          title: editData.title,
          category: editData.category,
          isFeatured: editData.isFeatured,
          ...(pathChanged && { storagePath: editData.storagePath }),
        },
      })
      onSave(updated)
      notify(t('admin.notify_success'), 'success')
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        onUnauthorized()
        return
      }
      notify(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveStory = async () => {
    if (!photo || !token) return
    if (!storyData.title.trim() || !storyData.content.trim()) {
      notify(t('admin.story_title') + ' / ' + t('admin.log_content') + ' required', 'error')
      return
    }

    setStorySaving(true)
    try {
      if (story) {
        // Update existing story
        const updated = await updateStory(token, story.id, {
          title: storyData.title,
          content: storyData.content,
          isPublished: storyData.isPublished,
        })
        setStory(updated)
      } else {
        // Create new story with current photo
        const created = await createStory(token, {
          title: storyData.title,
          content: storyData.content,
          isPublished: storyData.isPublished,
          photoIds: [photo.id],
          coverPhotoId: photo.id,
        })
        setStory(created)
      }
      notify(t('admin.notify_success'), 'success')
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        onUnauthorized()
        return
      }
      notify(t('common.error'), 'error')
    } finally {
      setStorySaving(false)
    }
  }

  const handleSetCover = async (photoId: string) => {
    if (!story || !token) return
    try {
      const updated = await updateStory(token, story.id, { coverPhotoId: photoId })
      setStory(updated)
      notify(t('admin.cover_set'), 'success')
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        onUnauthorized()
        return
      }
      notify(t('common.error'), 'error')
    }
  }

  const handleRemovePhoto = async (photoId: string) => {
    if (!story || !token) return
    // Don't allow removing the last photo
    if (story.photos.length <= 1) {
      notify('Cannot remove the last photo', 'error')
      return
    }
    try {
      const updated = await removePhotoFromStory(token, story.id, photoId)
      setStory(updated)
      notify(t('admin.photo_removed'), 'success')
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        onUnauthorized()
        return
      }
      notify(t('common.error'), 'error')
    }
  }

  const handleAddPhotos = async () => {
    if (!story || !token || selectedPhotoIds.size === 0) return
    try {
      const updated = await addPhotosToStory(token, story.id, Array.from(selectedPhotoIds))
      setStory(updated)
      setSelectedPhotoIds(new Set())
      setShowPhotoSelector(false)
      notify(t('admin.photos_added'), 'success')
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        onUnauthorized()
        return
      }
      notify(t('common.error'), 'error')
    }
  }

  const togglePhotoSelection = (photoId: string) => {
    setSelectedPhotoIds(prev => {
      const next = new Set(prev)
      if (next.has(photoId)) {
        next.delete(photoId)
      } else {
        next.add(photoId)
      }
      return next
    })
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  return (
    <AnimatePresence>
      {isOpen && photo && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 h-full w-full max-w-xl z-[101] bg-background border-l border-border shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/30 flex-shrink-0">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.15em]">
                    {t('admin.edit_photo') || 'Edit Photo'}
                  </h3>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    ID: {photo.id.slice(0, 8)}...
                  </p>
                </div>
              </div>
              <AdminButton
                onClick={onClose}
                adminVariant="icon"
                size="sm"
                className="p-2"
              >
                <X className="w-4 h-4" />
              </AdminButton>
            </div>

            {/* Image Preview - 50% height */}
            <div className="relative flex-1 bg-muted min-h-0" style={{ flex: '1 1 50%' }}>
              <img
                src={resolveAssetUrl(photo.thumbnailUrl || photo.url, cdnDomain)}
                alt={photo.title}
                className="w-full h-full object-contain"
              />
              {/* Featured Badge */}
              <AdminButton
                onClick={async (e) => {
                  e.stopPropagation()
                  if (!photo || !token) return
                  const newFeatured = !editData.isFeatured
                  setEditData(prev => ({ ...prev, isFeatured: newFeatured }))
                  
                  try {
                    const updated = await updatePhoto({
                      token,
                      id: photo.id,
                      patch: {
                        title: editData.title,
                        category: editData.category,
                        isFeatured: newFeatured,
                      },
                    })
                    onSave(updated)
                    notify(newFeatured ? t('admin.notify_featured_added') : t('admin.notify_featured_removed'), 'success')
                  } catch (err) {
                    setEditData(prev => ({ ...prev, isFeatured: !newFeatured }))
                    if (err instanceof ApiUnauthorizedError) {
                      onUnauthorized()
                    } else {
                      notify(t('common.error'), 'error')
                    }
                  }
                }}
                adminVariant={editData.isFeatured ? 'iconAccent' : 'iconOnDark'}
                size="sm"
                className="absolute top-3 right-3 p-2"
                title={editData.isFeatured ? t('admin.notify_featured_removed') : t('admin.notify_featured_added')}
              >
                <Star className={`w-4 h-4 ${editData.isFeatured ? 'fill-current' : ''}`} />
              </AdminButton>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border flex-shrink-0">
              <AdminButton
                onClick={() => setActiveTab('info')}
                adminVariant="tab"
                data-state={activeTab === 'info' ? 'active' : 'inactive'}
              >
                {t('gallery.info') || 'Info'}
              </AdminButton>
              <AdminButton
                onClick={() => setActiveTab('story')}
                adminVariant="tab"
                data-state={activeTab === 'story' ? 'active' : 'inactive'}
              >
                {t('gallery.story') || 'Story'}
              </AdminButton>
            </div>

            {/* Content - 50% height */}
            <div className="overflow-y-auto custom-scrollbar min-h-0" style={{ flex: '1 1 50%' }}>
              {activeTab === 'info' ? (
                <div className="p-6 space-y-6">
                  {/* Title */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      {t('admin.photo_title') || 'Title'}
                    </label>
                    <AdminInput
                      value={editData.title}
                      onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                      placeholder={t('admin.title_hint_single') || 'Enter title'}
                    />
                  </div>

                  {/* Category */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                      <Tag className="w-3 h-3" />
                      {t('admin.categories') || 'Categories'}
                    </label>
                    <AdminSelect
                      value={editData.category}
                      onChange={(val: string) => setEditData({ ...editData, category: val })}
                      options={categories.filter(c => c !== '全部').map(c => ({ value: c, label: c }))}
                    />
                  </div>

                  {/* Technical Info - Read only */}
                  <div className="pt-4 border-t border-border">
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">
                      {t('gallery.technical_specs') || 'Technical Specs'}
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="flex items-center gap-2">
                        <Camera className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">{photo.cameraModel || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Aperture className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">{photo.aperture || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">{photo.shutterSpeed || '-'}</span>
                      </div>
                      <div className="text-muted-foreground">
                        ISO {photo.iso || '-'}
                      </div>
                      <div className="text-muted-foreground">
                        {photo.focalLength || '-'}
                      </div>
                      <div className="text-muted-foreground">
                        {photo.width} × {photo.height}
                      </div>
                    </div>
                  </div>

                  {/* Color Analysis */}
                  <div className="pt-4 border-t border-border">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                        <Palette className="w-3 h-3" />
                        {t('gallery.palette')}
                      </h4>
                      <AdminButton
                        onClick={async () => {
                          if (!token || !photo) return
                          setReanalyzing(true)
                          try {
                            const updated = await reanalyzePhotoColors(token, photo.id)
                            setDisplayColors(updated.dominantColors || [])
                            onSave(updated)
                            notify(t('admin.notify_success'), 'success')
                          } catch (err) {
                            if (err instanceof ApiUnauthorizedError) {
                              onUnauthorized()
                            } else {
                              notify(t('common.error'), 'error')
                            }
                          } finally {
                            setReanalyzing(false)
                          }
                        }}
                        disabled={reanalyzing}
                        adminVariant="link"
                        size="xs"
                        className="flex items-center gap-1 text-[10px]"
                      >
                        <RefreshCw className={`w-3 h-3 ${reanalyzing ? 'animate-spin' : ''}`} />
                        {t('admin.reanalyze_colors')}
                      </AdminButton>
                    </div>
                    {displayColors && displayColors.length > 0 ? (
                      <div className="flex gap-3 flex-wrap">
                        {displayColors.map((color, index) => (
                          <div
                            key={index}
                            className="relative group cursor-pointer"
                            onClick={() => {
                              navigator.clipboard.writeText(color)
                              notify(t('common.copied'), 'success')
                            }}
                            title={color}
                          >
                            <div
                              className="w-8 h-8 rounded-full border-2 border-border shadow-sm transition-transform group-hover:scale-110"
                              style={{ backgroundColor: color }}
                            />
                            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-mono text-muted-foreground uppercase whitespace-nowrap">
                              {color}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t('admin.no_color_data')}</p>
                    )}
                  </div>

                  {/* File Info */}
                  <div className="pt-4 border-t border-border">
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">
                      {t('gallery.file_info') || 'File Info'}
                    </h4>
                    <div className="space-y-2 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>{t('gallery.size') || 'Size'}</span>
                        <span>{formatFileSize(photo.size || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t('gallery.date') || 'Date'}</span>
                        <span>{formatDate(photo.takenAt || photo.createdAt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Storage</span>
                        <span className="uppercase">{photo.storageProvider}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span>{t('admin.path_prefix')}</span>
                        <div className="flex items-stretch">
                          <div className="px-3 py-2 bg-muted/50 border-b border-l border-t border-border text-xs text-muted-foreground font-mono flex items-center">
                            /
                          </div>
                          <AdminInput
                            value={editData.storagePath}
                            onChange={(e) => setEditData({ ...editData, storagePath: e.target.value })}
                            placeholder="uploads/2024"
                            className="flex-1 rounded-l-none"
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {t('admin.filename')}: {(photo.storageKey || photo.url).split('/').pop()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 space-y-6">
                  {storyLoading ? (
                    <div className="space-y-4 animate-pulse">
                      <div className="h-10 bg-muted rounded"></div>
                      <div className="h-32 bg-muted rounded"></div>
                    </div>
                  ) : (
                    <>
                      {/* Story Form */}
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            {t('admin.story_title')}
                          </label>
                          <AdminInput
                            value={storyData.title}
                            onChange={(e) => setStoryData({ ...storyData, title: e.target.value })}
                            placeholder={t('admin.story_title')}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                            <BookOpen className="w-3 h-3" />
                            {t('admin.log_content')}
                          </label>
                          <textarea
                            value={storyData.content}
                            onChange={(e) => setStoryData({ ...storyData, content: e.target.value })}
                            placeholder={t('admin.story_description_hint')}
                            className="w-full h-40 p-4 bg-muted/30 border border-border focus:border-primary outline-none text-sm transition-colors resize-none font-mono"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            {storyData.content.length} {t('admin.characters')}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            {t('admin.publish')}
                          </label>
                          <AdminButton
                            onClick={() => setStoryData({ ...storyData, isPublished: !storyData.isPublished })}
                            adminVariant="switch"
                            data-state={storyData.isPublished ? 'checked' : 'unchecked'}
                            className="relative inline-flex h-5 w-10 shrink-0 items-center rounded-full"
                          >
                            <span
                              className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform ${
                                storyData.isPublished ? 'translate-x-5' : 'translate-x-1'
                              }`}
                            />
                          </AdminButton>
                          <span className="text-xs text-muted-foreground">
                            {storyData.isPublished ? t('admin.published') : t('admin.draft')}
                          </span>
                        </div>
                      </div>

                      {/* Associated Photos */}
                      {story && (
                        <div className="pt-4 border-t border-border space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                              {t('admin.associate_photos')} ({story.photos.length})
                            </h4>
                            <AdminButton
                              onClick={() => setShowPhotoSelector(!showPhotoSelector)}
                              adminVariant="link"
                              size="xs"
                              className="flex items-center gap-1 text-[10px]"
                            >
                              <Plus className="w-3 h-3" />
                              {t('admin.add_photos')}
                            </AdminButton>
                          </div>

                          {/* Photo Selector */}
                          {showPhotoSelector && (
                            <div className="border border-border p-4 space-y-3 bg-muted/20">
                              <div className="text-[10px] text-muted-foreground">
                                {t('admin.select_photos')} ({selectedPhotoIds.size} {t('admin.selected')})
                              </div>
                              <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                                {availablePhotos.slice(0, 20).map((p) => (
                                  <div
                                    key={p.id}
                                    onClick={() => togglePhotoSelection(p.id)}
                                    className={`relative aspect-square cursor-pointer border-2 transition-all ${
                                      selectedPhotoIds.has(p.id)
                                        ? 'border-primary'
                                        : 'border-transparent hover:border-muted-foreground/50'
                                    }`}
                                  >
                                    <img
                                      src={resolveAssetUrl(p.thumbnailUrl || p.url, cdnDomain)}
                                      alt={p.title}
                                      className="w-full h-full object-cover"
                                    />
                                    {selectedPhotoIds.has(p.id) && (
                                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                        <Check className="w-4 h-4 text-primary" />
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {availablePhotos.length === 0 && (
                                  <div className="col-span-4 py-4 text-center text-xs text-muted-foreground">
                                    {t('admin.no_photos_available')}
                                  </div>
                                )}
                              </div>
                              {selectedPhotoIds.size > 0 && (
                                <AdminButton
                                  onClick={handleAddPhotos}
                                  adminVariant="primary"
                                  size="md"
                                  className="w-full py-2 text-xs font-bold uppercase tracking-widest"
                                >
                                  {t('admin.add')} ({selectedPhotoIds.size})
                                </AdminButton>
                              )}
                            </div>
                          )}

                          {/* Current Photos in Story */}
                          <div className="grid grid-cols-3 gap-2">
                            {story.photos.map((p) => (
                              <div key={p.id} className="relative group">
                                <div className={`aspect-square border-2 ${
                                  story.coverPhotoId === p.id ? 'border-primary' : 'border-transparent'
                                }`}>
                                  <img
                                    src={resolveAssetUrl(p.thumbnailUrl || p.url, cdnDomain)}
                                    alt={p.title}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                {story.coverPhotoId === p.id && (
                                  <div className="absolute top-1 left-1 px-1 py-0.5 bg-primary text-primary-foreground text-[8px] font-bold uppercase">
                                    {t('admin.cover')}
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                  {story.coverPhotoId !== p.id && (
                                    <AdminButton
                                      onClick={() => handleSetCover(p.id)}
                                      adminVariant="iconOnDark"
                                      size="xs"
                                      className="p-1.5 text-[8px]"
                                      title={t('admin.set_as_cover')}
                                    >
                                      <ImageIcon className="w-3 h-3" />
                                    </AdminButton>
                                  )}
                                  {story.photos.length > 1 && (
                                    <AdminButton
                                      onClick={() => handleRemovePhoto(p.id)}
                                      adminVariant="iconOnDarkDanger"
                                      size="xs"
                                      className="p-1.5 text-[8px]"
                                      title={t('admin.remove')}
                                    >
                                      <X className="w-3 h-3" />
                                    </AdminButton>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </>
                  )}
                </div>
              )}
            </div>

            {/* Footer - Fixed at bottom */}
            <div className="flex gap-3 p-6 border-t border-border bg-muted/20 flex-shrink-0">
              <AdminButton
                onClick={onClose}
                adminVariant="outline"
                size="lg"
                className="flex-1 px-6 py-3 text-xs font-bold uppercase tracking-widest"
              >
                {t('common.cancel')}
              </AdminButton>
              <AdminButton
                onClick={activeTab === 'info' ? handleSave : handleSaveStory}
                disabled={activeTab === 'info' ? saving : storySaving}
                adminVariant="primary"
                size="lg"
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 text-xs font-bold uppercase tracking-widest"
              >
                <Save className="w-4 h-4" />
                <span>
                  {activeTab === 'info'
                    ? (saving ? t('admin.saving') : t('admin.save'))
                    : (storySaving ? t('admin.saving') : (story ? t('admin.save') : t('admin.create_story_upload')))
                  }
                </span>
              </AdminButton>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

