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
            className="fixed top-0 right-0 h-full w-full max-w-2xl z-[101] bg-background border-l border-border shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header - Refined with glass effect */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background sticky top-0 z-20 flex-shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-sm bg-primary/5 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-widest leading-none">
                    {t('admin.edit_photo') || 'Edit Photo'}
                  </h3>
                  <p className="text-xs text-muted-foreground font-mono mt-1 opacity-60">
                    ID: {photo.id}
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

            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
              {/* Hero Image Section */}
              <div className="relative w-full aspect-video bg-muted/50 group overflow-hidden flex-shrink-0">
                <img
                  src={resolveAssetUrl(photo.url, cdnDomain)}
                  alt={photo.title}
                  className="w-full h-full object-contain"
                />
                
                {/* Featured Toggle Overlay */}
                <div className="absolute top-4 right-4">
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
                    className="shadow-sm"
                    title={editData.isFeatured ? t('admin.notify_featured_removed') : t('admin.notify_featured_added')}
                  >
                    <Star className={`w-4 h-4 ${editData.isFeatured ? 'fill-current' : ''}`} />
                  </AdminButton>
                </div>

                {/* Image Info Overlay */}
                <div className="absolute bottom-4 left-6 text-white opacity-0 group-hover:opacity-100 transition-all duration-200">
                  <p className="text-xs font-bold uppercase tracking-widest mb-1 text-white/70">Resolution</p>
                  <p className="text-sm font-mono font-medium">{photo.width} × {photo.height}</p>
                </div>
              </div>

              {/* Navigation Tabs - Editorial Style */}
              <div className="flex px-8 border-b border-border bg-background sticky top-0 z-10">
                <AdminButton
                  onClick={() => setActiveTab('info')}
                  adminVariant="tab"
                  data-state={activeTab === 'info' ? 'active' : 'inactive'}
                  className="py-4 px-6 h-auto rounded-none"
                >
                  {t('gallery.info') || 'Information'}
                </AdminButton>
                <AdminButton
                  onClick={() => setActiveTab('story')}
                  adminVariant="tab"
                  data-state={activeTab === 'story' ? 'active' : 'inactive'}
                  className="py-4 px-6 h-auto rounded-none"
                >
                  {t('gallery.story') || 'Narrative'}
                </AdminButton>
              </div>

              {/* Content Area */}
              <div className="p-8 pb-32">
                <AnimatePresence mode="wait">
                  {activeTab === 'info' ? (
                    <motion.div
                      key="info"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-10"
                    >
                      {/* Basic Metadata */}
                      <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-3">
                          <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                            {t('admin.photo_title') || 'Title'}
                          </label>
                          <AdminInput
                            value={editData.title}
                            onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                            placeholder={t('admin.title_hint_single') || 'Enter title'}
                          />
                        </div>
                        <div className="space-y-3">
                          <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                            <Tag className="w-4 h-4" />
                            {t('admin.categories') || 'Category'}
                          </label>
                          <AdminSelect
                            value={editData.category}
                            onChange={(val: string) => setEditData({ ...editData, category: val })}
                            options={categories.filter(c => c !== '全部').map(c => ({ value: c, label: c }))}
                          />
                        </div>
                      </section>

                      {/* Technical Specs - Grid Layout */}
                      <section className="pt-8 border-t border-border/50">
                        <h4 className="text-xs font-bold text-primary uppercase tracking-widest mb-6 flex items-center gap-3">
                          <span className="w-4 h-px bg-primary/20" />
                          {t('gallery.technical_specs') || 'Technical Specifications'}
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-6 gap-x-4">
                          <div className="space-y-1.5">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Camera</p>
                            <div className="flex items-center gap-2">
                              <Camera className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs font-mono">{photo.cameraModel || 'Unknown'}</span>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Aperture</p>
                            <div className="flex items-center gap-2">
                              <Aperture className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs font-mono">{photo.aperture || 'N/A'}</span>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Shutter</p>
                            <div className="flex items-center gap-2">
                              <Clock className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs font-mono">{photo.shutterSpeed || 'N/A'}</span>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">ISO</p>
                            <p className="text-xs font-mono pl-5">{photo.iso || 'N/A'}</p>
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Focal Length</p>
                            <p className="text-xs font-mono pl-5">{photo.focalLength || 'N/A'}</p>
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Lens</p>
                            <p className="text-xs font-mono pl-5 truncate max-w-[120px]" title={photo.lensModel || ''}>
                              {photo.lensModel || 'Unknown'}
                            </p>
                          </div>
                        </div>
                      </section>

                      {/* Color Palette - Visual Focus */}
                      <section className="pt-8 border-t border-border/50">
                        <div className="flex items-center justify-between mb-8">
                          <h4 className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-3">
                            <span className="w-4 h-px bg-primary/20" />
                            {t('gallery.palette') || 'Color Palette'}
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
                            adminVariant="ghost"
                            size="xs"
                            className="text-[10px] font-bold tracking-widest opacity-60 hover:opacity-100"
                          >
                            <RefreshCw className={`w-3 h-3 mr-2 ${reanalyzing ? 'animate-spin' : ''}`} />
                            RE-ANALYZE
                          </AdminButton>
                        </div>
                        
                        {displayColors && displayColors.length > 0 ? (
                          <div className="flex items-center gap-3 flex-wrap">
                            {displayColors.map((color, index) => (
                              <motion.div
                                key={index}
                                whileHover={{ y: -2 }}
                                className="relative group cursor-pointer"
                                onClick={() => {
                                  navigator.clipboard.writeText(color)
                                  notify(t('common.copied'), 'success')
                                }}
                              >
                                <div
                                  className="w-8 h-8 rounded-sm border border-border shadow-sm transition-all group-hover:shadow-md group-hover:border-primary/30"
                                  style={{ backgroundColor: color }}
                                />
                                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-mono text-muted-foreground uppercase whitespace-nowrap">
                                  {color}
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-6 border border-dashed border-border flex items-center justify-center">
                            <p className="text-xs text-muted-foreground italic">{t('admin.no_color_data')}</p>
                          </div>
                        )}
                      </section>

                      {/* File & Storage Details */}
                      <section className="pt-8 border-t border-border/50">
                        <h4 className="text-xs font-bold text-primary uppercase tracking-widest mb-6 flex items-center gap-3">
                          <span className="w-4 h-px bg-primary/20" />
                          {t('gallery.file_info') || 'Storage & File'}
                        </h4>
                        <div className="bg-muted/20 p-6 border border-border/50 space-y-6">
                          <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-1.5">
                              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">File Size</p>
                              <p className="text-xs font-mono">{formatFileSize(photo.size || 0)}</p>
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Captured On</p>
                              <p className="text-xs font-mono">{formatDate(photo.takenAt || photo.createdAt)}</p>
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Provider</p>
                              <p className="text-xs font-mono uppercase tracking-wider">{photo.storageProvider}</p>
                            </div>
                          </div>
                          
                          <div className="space-y-3 pt-4 border-t border-border/50">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                              {t('admin.path_prefix') || 'Storage Path'}
                            </label>
                            <div className="flex items-stretch">
                              <div className="px-3 py-2 bg-muted/30 border border-r-0 border-border text-xs text-muted-foreground font-mono flex items-center">
                                /
                              </div>
                              <AdminInput
                                value={editData.storagePath}
                                onChange={(e) => setEditData({ ...editData, storagePath: e.target.value })}
                                placeholder="uploads/2024"
                                className="flex-1 border-l-0"
                              />
                            </div>
                            <p className="text-xs text-muted-foreground font-mono opacity-60 pl-1">
                              Filename: {(photo.storageKey || photo.url).split('/').pop()}
                            </p>
                          </div>
                        </div>
                      </section>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="story"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-10"
                    >
                      {storyLoading ? (
                        <div className="space-y-8 animate-pulse">
                          <div className="h-12 bg-muted rounded-xl w-3/4"></div>
                          <div className="h-64 bg-muted rounded-2xl"></div>
                        </div>
                      ) : (
                        <>
                          {/* Story Editor Section */}
                          <div className="space-y-8">
                            <div className="space-y-3">
                              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                {t('admin.story_title') || 'Narrative Title'}
                              </label>
                              <AdminInput
                                value={storyData.title}
                                onChange={(e) => setStoryData({ ...storyData, title: e.target.value })}
                                placeholder={t('admin.story_title')}
                              />
                            </div>

                            <div className="space-y-3">
                              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                <BookOpen className="w-4 h-4" />
                                {t('admin.log_content') || 'The Story'}
                              </label>
                              <textarea
                                value={storyData.content}
                                onChange={(e) => setStoryData({ ...storyData, content: e.target.value })}
                                placeholder={t('admin.story_description_hint')}
                                className="w-full h-64 p-3 bg-background border border-border focus:border-primary outline-none text-xs font-mono transition-colors resize-none"
                              />
                              <div className="flex justify-end">
                                <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest opacity-60">
                                  {storyData.content.length} Characters
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-muted/20 rounded-xl">
                              <div className="flex items-center gap-4">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                  {t('admin.publish') || 'Visibility'}
                                </label>
                                <AdminButton
                                  onClick={() => setStoryData({ ...storyData, isPublished: !storyData.isPublished })}
                                  adminVariant="switch"
                                  data-state={storyData.isPublished ? 'checked' : 'unchecked'}
                                />
                              </div>
                              <span className={`text-xs font-bold uppercase tracking-widest ${
                                storyData.isPublished ? 'text-primary' : 'text-muted-foreground'
                              }`}>
                                {storyData.isPublished ? t('admin.published') : t('admin.draft')}
                              </span>
                            </div>
                          </div>

                          {/* Associated Photos - Visual Grid */}
                          {story && (
                            <section className="pt-8 border-t border-border/50 space-y-6">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-3">
                                  <span className="w-4 h-px bg-primary/20" />
                                  {t('admin.associate_photos') || 'Gallery Collection'} ({story.photos.length})
                                </h4>
                                <AdminButton
                                  onClick={() => setShowPhotoSelector(!showPhotoSelector)}
                                  adminVariant="primarySoft"
                                  size="sm"
                                  className="rounded-none px-4"
                                >
                                  <Plus className="w-3 h-3 mr-2" />
                                  {t('admin.add_photos')}
                                </AdminButton>
                              </div>

                              {/* Photo Selector - Modern Overlay */}
                              <AnimatePresence>
                                {showPhotoSelector && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="border border-primary/10 p-4 space-y-4 bg-primary/5 mb-6">
                                      <div className="flex items-center justify-between">
                                        <p className="text-xs font-bold text-primary/60 uppercase tracking-widest">
                                          {t('admin.select_photos')} — {selectedPhotoIds.size} Selected
                                        </p>
                                        <button onClick={() => setShowPhotoSelector(false)} className="text-primary/40 hover:text-primary">
                                          <X className="w-4 h-4" />
                                        </button>
                                      </div>
                                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                                        {availablePhotos.slice(0, 30).map((p) => (
                                          <motion.div
                                            key={p.id}
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => togglePhotoSelection(p.id)}
                                            className={`relative aspect-square cursor-pointer overflow-hidden border-2 transition-all ${
                                              selectedPhotoIds.has(p.id)
                                                ? 'border-primary ring-2 ring-primary/10'
                                                : 'border-transparent grayscale hover:grayscale-0'
                                            }`}
                                          >
                                            <img
                                              src={resolveAssetUrl(p.thumbnailUrl || p.url, cdnDomain)}
                                              alt={p.title}
                                              className="w-full h-full object-cover"
                                            />
                                            {selectedPhotoIds.has(p.id) && (
                                              <div className="absolute inset-0 bg-primary/40 flex items-center justify-center">
                                                <Check className="w-6 h-6 text-white" />
                                              </div>
                                            )}
                                          </motion.div>
                                        ))}
                                      </div>
                                      {selectedPhotoIds.size > 0 && (
                                        <AdminButton
                                          onClick={handleAddPhotos}
                                          adminVariant="primary"
                                          size="md"
                                          className="w-full py-2"
                                        >
                                          CONFIRM SELECTION ({selectedPhotoIds.size})
                                        </AdminButton>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              {/* Current Photos Grid */}
                              <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                                {story.photos.map((p) => (
                                  <motion.div
                                    key={p.id}
                                    layout
                                    className="relative group aspect-square overflow-hidden border border-border/50"
                                  >
                                    <img
                                      src={resolveAssetUrl(p.thumbnailUrl || p.url, cdnDomain)}
                                      alt={p.title}
                                      className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${
                                        story.coverPhotoId === p.id ? 'ring-2 ring-primary ring-inset' : ''
                                      }`}
                                    />
                                    
                                    {story.coverPhotoId === p.id && (
                                      <div className="absolute top-2 left-2 px-2 py-1 bg-primary text-primary-foreground text-[8px] font-bold uppercase tracking-widest shadow-sm">
                                        {t('admin.cover')}
                                      </div>
                                    )}

                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-2 backdrop-blur-[1px]">
                                      {story.coverPhotoId !== p.id && (
                                        <AdminButton
                                          onClick={() => handleSetCover(p.id)}
                                          adminVariant="iconOnDark"
                                          size="sm"
                                          className="rounded-sm p-1.5"
                                          title={t('admin.set_as_cover')}
                                        >
                                          <ImageIcon className="w-4 h-4" />
                                        </AdminButton>
                                      )}
                                      {story.photos.length > 1 && (
                                        <AdminButton
                                          onClick={() => handleRemovePhoto(p.id)}
                                          adminVariant="iconOnDarkDanger"
                                          size="sm"
                                          className="rounded-sm p-1.5"
                                          title={t('admin.remove')}
                                        >
                                          <X className="w-4 h-4" />
                                        </AdminButton>
                                      )}
                                    </div>
                                  </motion.div>
                                ))}
                              </div>
                            </section>
                          )}
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Footer - Fixed with glass effect */}
            <div className="flex gap-4 p-6 border-t border-border bg-background sticky bottom-0 z-20 flex-shrink-0">
              <AdminButton
                onClick={onClose}
                adminVariant="outline"
                size="lg"
                className="flex-1 border-border hover:bg-muted transition-all rounded-none"
              >
                {t('common.cancel')}
              </AdminButton>
              <AdminButton
                onClick={activeTab === 'info' ? handleSave : handleSaveStory}
                disabled={activeTab === 'info' ? saving : storySaving}
                adminVariant="primary"
                size="lg"
                className="flex-[1.5] flex items-center justify-center gap-3 transition-all active:scale-[0.98] rounded-none"
              >
                {activeTab === 'info' ? (
                  saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />
                ) : (
                  storySaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />
                )}
                <span className="tracking-widest">
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

