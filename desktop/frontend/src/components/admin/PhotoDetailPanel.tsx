import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Save,
  Star,
  Camera,
  Film,
  FileText,
  Tag,
  Aperture,
  Clock,
  Sun,
  Crosshair,
  Focus,
  BookOpen,
  Plus,
  Check,
  ImageIcon,
  RefreshCw,
  Copy,
} from 'lucide-react'
import {
  resolveAssetUrl,
  updatePhoto,
  ApiUnauthorizedError,
  getAdminPhotoStory,
  createStory,
  updateStory,
  addPhotosToStory,
  removePhotoFromStory,
  reanalyzePhotoColors,
  getFilmRolls,
  type PhotoDto,
  type StoryDto,
  type FilmRollDto,
} from '@/lib/api'
import { normalizeDominantColors } from '@/lib/photoColors'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminInput, AdminSelect } from '@/components/admin/AdminFormControls'
import { FilmRollSelectorModal } from '@/components/admin/FilmRollSelectorModal'
import { countStoryCharacters } from '@/lib/story-rich-content'

interface PhotoDetailPanelProps {
  photo: PhotoDto | null
  isOpen: boolean
  categories: string[]
  allPhotos: PhotoDto[]
  token: string | null
  initialTab?: 'info' | 'story'
  onClose: () => void
  onSave: (photo: PhotoDto) => void
  onUnauthorized: () => void
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
}

// 参照 web 端 src/components/admin/PhotoDetailPanel.tsx 移植；
// 差异：桌面端 resolveAssetUrl 无需 cdnDomain（走服务器基地址/绝对 URL）。
export function PhotoDetailPanel({
  photo,
  isOpen,
  categories,
  allPhotos,
  token,
  initialTab = 'info',
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
    showFlag: true,
    storagePath: '',
    photoType: 'digital' as 'digital' | 'film',
    filmRollId: '',
    filmRollName: '',
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
  const [filmRolls, setFilmRolls] = useState<FilmRollDto[]>([])
  const [filmRollsLoading, setFilmRollsLoading] = useState(false)
  const [showFilmRollSelector, setShowFilmRollSelector] = useState(false)

  // Photo selection for adding to story
  const [showPhotoSelector, setShowPhotoSelector] = useState(false)
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set())
  const filmRollButtonLabel = editData.filmRollName || t('admin.no_film_roll')

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
        showFlag: photo.showFlag ?? true,
        storagePath,
        photoType: photo.photoType || 'digital',
        filmRollId: photo.filmRollId || '',
        filmRollName: photo.filmRollName || '',
      })
      setDisplayColors(normalizeDominantColors(photo.dominantColors))
      setActiveTab(initialTab)
      setStory(null)
      setStoryLoaded(false)
      setStoryData({ title: '', content: '', isPublished: false })
      setShowPhotoSelector(false)
      setShowFilmRollSelector(false)
      setSelectedPhotoIds(new Set())
    }
  }, [photo, initialTab])

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

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    setFilmRollsLoading(true)

    getFilmRolls()
      .then((data) => {
        if (!cancelled) {
          setFilmRolls(data)
        }
      })
      .catch((err) => {
        console.error('Failed to load film rolls:', err)
        if (!cancelled) {
          notify(t('common.error'), 'error')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setFilmRollsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, notify, t])

  // Esc 关闭面板（桌面客户端惯例）
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Photos available to add (not already in story)
  const availablePhotos = useMemo(() => {
    if (!story) return allPhotos
    const storyPhotoIds = new Set(story.photos.map(p => p.id))
    return allPhotos.filter(p => !storyPhotoIds.has(p.id))
  }, [allPhotos, story])

  const handleCopyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      notify(t('common.copied'), 'success')
    } catch (error) {
      console.error('Failed to copy text:', error)
      notify(t('common.error'), 'error')
    }
  }

  const handleSave = async () => {
    if (!photo || !token) return
    if (editData.photoType === 'film' && !editData.filmRollId) {
      notify(t('admin.film_roll_select'), 'error')
      return
    }

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
          showFlag: editData.showFlag,
          photoType: editData.photoType,
          filmRollId: editData.photoType === 'film' ? editData.filmRollId : null,
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
      notify(err instanceof Error ? err.message : t('common.error'), 'error')
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
      notify(t('admin.cannot_remove_last_photo'), 'error')
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

  const technicalSpecs = useMemo(() => {
    if (!photo) return []
    const missing = '—'
    return [
      { label: t('admin.camera'), icon: Camera, value: photo.cameraModel || t('admin.not_available') },
      { label: t('gallery.aperture'), icon: Aperture, value: photo.aperture || missing },
      { label: t('gallery.shutter'), icon: Clock, value: photo.shutterSpeed || missing },
      { label: t('gallery.iso'), icon: Sun, value: photo.iso ? String(photo.iso) : missing },
      { label: t('gallery.focal'), icon: Crosshair, value: photo.focalLength || missing },
      { label: t('admin.lens'), icon: Focus, value: photo.lensModel || t('admin.not_available') },
    ]
  }, [photo, t])

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
            role="dialog"
            aria-modal="true"
            aria-label={t('admin.edit_photo')}
            className="fixed top-0 right-0 h-full w-full max-w-2xl z-[101] bg-background border-l border-border shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border bg-background z-20 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 shrink-0 rounded-md bg-primary/5 border border-primary/10 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-serif text-base font-light tracking-wide leading-tight truncate">
                    {t('admin.edit_photo') || 'Edit Photo'}
                  </h3>
                  <p className="text-[10px] font-mono text-muted-foreground mt-1 truncate opacity-70">
                    {t('admin.photo_id')} · {photo.id}
                  </p>
                </div>
              </div>
              <AdminButton
                onClick={onClose}
                adminVariant="icon"
                size="sm"
                className="p-2 shrink-0"
                aria-label={t('common.cancel')}
              >
                <X className="w-4 h-4" />
              </AdminButton>
            </div>

            <div className="flex flex-1 min-h-0 flex-col">
              {/* Hero Image Section */}
              <div className="relative w-full bg-muted/30 border-b border-border overflow-hidden flex-shrink-0">
                <div className="flex items-center justify-center max-h-[36vh] min-h-[200px]">
                  <img
                    src={resolveAssetUrl(photo.url)}
                    alt={photo.title || t('admin.untitled_photo')}
                    className="max-h-[36vh] min-h-[200px] w-full object-contain"
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
                              showFlag: editData.showFlag,
                              photoType: editData.photoType,
                              filmRollId: editData.photoType === 'film' ? editData.filmRollId : null,
                            },
                          })
                          onSave(updated)
                          notify(newFeatured ? t('admin.notify_featured_added') : t('admin.notify_featured_removed'), 'success')
                        } catch (err) {
                          setEditData(prev => ({ ...prev, isFeatured: !newFeatured }))
                          if (err instanceof ApiUnauthorizedError) {
                            onUnauthorized()
                          } else {
                            notify(err instanceof Error ? err.message : t('common.error'), 'error')
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

                  {/* Persistent image info strip */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-6 pt-12 pb-4">
                    <div className="flex items-end justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate font-serif text-lg font-light leading-tight text-white">
                          {photo.title || t('admin.untitled_photo')}
                        </p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/70">
                          {photo.width && photo.height ? `${photo.width} × ${photo.height}` : '—'}
                          {photo.takenAt ? ` · ${formatDate(photo.takenAt)}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex px-6 border-b border-border bg-background z-10 flex-shrink-0">
                <AdminButton
                  onClick={() => setActiveTab('info')}
                  adminVariant="tab"
                  data-state={activeTab === 'info' ? 'active' : 'inactive'}
                  className="py-3.5 px-6 h-auto rounded-none"
                >
                  {t('gallery.info') || 'Information'}
                </AdminButton>
                <AdminButton
                  onClick={() => setActiveTab('story')}
                  adminVariant="tab"
                  data-state={activeTab === 'story' ? 'active' : 'inactive'}
                  className="py-3.5 px-6 h-auto rounded-none"
                >
                  {t('gallery.story') || 'Narrative'}
                </AdminButton>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6 pb-24">
                <AnimatePresence mode="wait">
                  {activeTab === 'info' ? (
                    <motion.div
                      key="info"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-8"
                    >
                      {/* Basic Metadata */}
                      <section>
                        <h4 className="text-[11px] font-bold text-primary uppercase tracking-[0.2em] mb-5 flex items-center gap-3">
                          <span className="w-4 h-px bg-primary/20" />
                          {t('admin.basic_info')}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.16em]">
                              {t('admin.photo_title')}
                            </label>
                            <AdminInput
                              value={editData.title}
                              onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                              placeholder={t('admin.title_hint_single')}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.16em] flex items-center gap-1.5">
                              <Tag className="w-3 h-3" />
                              {t('admin.categories')}
                            </label>
                            <AdminSelect
                              value={editData.category}
                              onChange={(val: string) => setEditData({ ...editData, category: val })}
                              options={categories.filter(c => c !== '全部').map(c => ({ value: c, label: c }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.16em] flex items-center gap-1.5">
                              <Film className="w-3 h-3" />
                              {t('admin.all_types')}
                            </label>
                            <AdminSelect
                              value={editData.photoType}
                              onChange={(val: string) =>
                                setEditData((prev) => ({
                                  ...prev,
                                  photoType: val as 'digital' | 'film',
                                  ...(val === 'digital' ? { filmRollId: '', filmRollName: '' } : {}),
                                }))
                              }
                              options={[
                                { value: 'digital', label: t('admin.upload_type_digital') },
                                { value: 'film', label: t('admin.upload_type_film') },
                              ]}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.16em] flex items-center gap-1.5">
                              <ImageIcon className="w-3 h-3" />
                              {t('admin.show_in_gallery')}
                            </label>
                            <button
                              type="button"
                              onClick={() => setEditData((prev) => ({ ...prev, showFlag: !prev.showFlag }))}
                              className="flex w-full items-center justify-between border border-border bg-background px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/50"
                            >
                              <span className={editData.showFlag ? 'text-foreground' : 'text-muted-foreground'}>
                                {editData.showFlag ? t('common.enabled') : t('common.disabled')}
                              </span>
                              <span
                                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                                  editData.showFlag ? 'bg-primary' : 'bg-muted'
                                }`}
                              >
                                <span
                                  className={`pointer-events-none block size-4 rounded-full bg-background shadow-lg transition-transform ${
                                    editData.showFlag ? 'translate-x-4' : 'translate-x-0.5'
                                  }`}
                                />
                              </span>
                            </button>
                          </div>
                          {editData.photoType === 'film' && (
                            <div className="space-y-2 md:col-span-2">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.16em]">
                                {t('admin.film_roll_select')}
                              </label>
                              <AdminButton
                                onClick={() => setShowFilmRollSelector(true)}
                                adminVariant="outline"
                                size="lg"
                                className="w-full justify-between"
                                disabled={filmRollsLoading}
                              >
                                <span className={editData.filmRollName ? 'text-foreground' : 'text-muted-foreground'}>
                                  {filmRollsLoading
                                    ? `${t('common.loading')}...`
                                    : filmRollButtonLabel}
                                </span>
                                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                                  {t('admin.upload_type_film')}
                                </span>
                              </AdminButton>
                            </div>
                          )}
                        </div>
                      </section>

                      {/* Technical Specs */}
                      <section className="pt-6 border-t border-border/50">
                        <h4 className="text-[11px] font-bold text-primary uppercase tracking-[0.2em] mb-5 flex items-center gap-3">
                          <span className="w-4 h-px bg-primary/20" />
                          {t('gallery.technical_specs') || 'Technical Specifications'}
                        </h4>
                        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-5">
                          {technicalSpecs.map(({ label, icon: Icon, value }) => (
                            <div key={label} className="min-w-0">
                              <dt className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.16em]">
                                {label}
                              </dt>
                              <dd className="mt-1.5 flex items-center gap-2 min-w-0">
                                <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70" />
                                <span className="truncate font-mono text-xs" title={value}>{value}</span>
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </section>

                      {/* Color Palette */}
                      <section className="pt-6 border-t border-border/50">
                        <div className="flex items-center justify-between mb-5">
                          <h4 className="text-[11px] font-bold text-primary uppercase tracking-[0.2em] flex items-center gap-3">
                            <span className="w-4 h-px bg-primary/20" />
                            {t('gallery.palette') || 'Color Palette'}
                          </h4>
                          <AdminButton
                            onClick={async () => {
                              if (!token || !photo) return
                              setReanalyzing(true)
                              try {
                                const updated = await reanalyzePhotoColors(token, photo.id)
                                setDisplayColors(normalizeDominantColors(updated.dominantColors))
                                onSave(updated)
                                notify(t('admin.notify_success'), 'success')
                              } catch (err) {
                                if (err instanceof ApiUnauthorizedError) {
                                  onUnauthorized()
                                } else {
                                  notify(err instanceof Error ? err.message : t('common.error'), 'error')
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
                            <RefreshCw className={`w-3 h-3 mr-1.5 ${reanalyzing ? 'animate-spin' : ''}`} />
                            {t('admin.re_analyze')}
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
                                  handleCopyText(color)
                                }}
                                title={t('admin.copy_link')}
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
                          <div className="py-5 border border-dashed border-border flex items-center justify-center">
                            <p className="text-xs text-muted-foreground italic">{t('admin.no_color_data')}</p>
                          </div>
                        )}
                      </section>

                      {/* File & Storage Details */}
                      <section className="pt-6 border-t border-border/50">
                        <h4 className="text-[11px] font-bold text-primary uppercase tracking-[0.2em] mb-5 flex items-center gap-3">
                          <span className="w-4 h-px bg-primary/20" />
                          {t('gallery.file_info') || 'Storage & File'}
                        </h4>
                        <div className="bg-muted/15 p-5 border border-border/50 space-y-5">
                          <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
                            <div className="min-w-0">
                              <dt className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.16em]">
                                {t('admin.file_size')}
                              </dt>
                              <dd className="mt-1.5 font-mono text-xs">{formatFileSize(photo.size || 0)}</dd>
                            </div>
                            <div className="min-w-0">
                              <dt className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.16em]">
                                {t('admin.captured_on')}
                              </dt>
                              <dd className="mt-1.5 font-mono text-xs">{formatDate(photo.takenAt || photo.createdAt)}</dd>
                            </div>
                            <div className="min-w-0">
                              <dt className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.16em]">
                                {t('admin.provider')}
                              </dt>
                              <dd className="mt-1.5 font-mono text-xs uppercase tracking-wider">{photo.storageProvider}</dd>
                            </div>
                            <div className="min-w-0">
                              <dt className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.16em]">
                                {t('gallery.dimensions')}
                              </dt>
                              <dd className="mt-1.5 font-mono text-xs">
                                {photo.width && photo.height ? `${photo.width} × ${photo.height}` : '—'}
                              </dd>
                            </div>
                          </dl>

                          <div className="space-y-2.5 pt-4 border-t border-border/50">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.16em]">
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
                            <div className="space-y-2 pl-0.5">
                              {[
                                {
                                  label: t('admin.thumbnail_url'),
                                  value: photo.thumbnailUrl ? resolveAssetUrl(photo.thumbnailUrl) : '',
                                },
                                {
                                  label: t('admin.original_url'),
                                  value: resolveAssetUrl(photo.url),
                                },
                              ].map((item) => (
                                <div key={item.label} className="space-y-1">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                                    {item.label}
                                  </p>
                                  {item.value ? (
                                    <button
                                      type="button"
                                      onClick={() => handleCopyText(item.value)}
                                      className="flex w-full items-start gap-2 rounded-md border border-border/50 bg-background/60 px-3 py-2 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
                                      title={t('admin.copy_link')}
                                    >
                                      <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                      <span className="min-w-0 break-all text-xs font-mono text-muted-foreground">
                                        {item.value}
                                      </span>
                                    </button>
                                  ) : (
                                    <p className="text-xs font-mono text-muted-foreground opacity-60">
                                      {t('admin.not_available')}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
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
                      className="space-y-8"
                    >
                      {storyLoading ? (
                        <div className="space-y-8 animate-pulse">
                          <div className="h-12 bg-muted rounded-xl w-3/4"></div>
                          <div className="h-64 bg-muted rounded-2xl"></div>
                        </div>
                      ) : (
                        <>
                          {/* Story Editor Section */}
                          <div className="space-y-6">
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.16em]">
                                {t('admin.story_title') || 'Narrative Title'}
                              </label>
                              <AdminInput
                                value={storyData.title}
                                onChange={(e) => setStoryData({ ...storyData, title: e.target.value })}
                                placeholder={t('admin.story_title')}
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.16em] flex items-center gap-1.5">
                                <BookOpen className="w-3 h-3" />
                                {t('admin.log_content') || 'The Story'}
                              </label>
                              <textarea
                                value={storyData.content}
                                onChange={(e) => setStoryData({ ...storyData, content: e.target.value })}
                                placeholder={t('admin.story_description_hint')}
                                className="w-full h-64 p-4 bg-background border border-border focus:border-primary outline-none text-sm leading-relaxed transition-colors resize-none"
                              />
                              <div className="flex justify-end">
                                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.16em] opacity-70">
                                  {countStoryCharacters(storyData.content)} {t('admin.characters')}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-muted/15 rounded-md border border-border/50">
                              <div className="flex items-center gap-4">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.16em]">
                                  {t('admin.publish') || 'Visibility'}
                                </label>
                                <AdminButton
                                  onClick={() => setStoryData({ ...storyData, isPublished: !storyData.isPublished })}
                                  adminVariant="switch"
                                  data-state={storyData.isPublished ? 'checked' : 'unchecked'}
                                />
                              </div>
                              <span className={`text-[10px] font-bold uppercase tracking-widest ${
                                storyData.isPublished ? 'text-primary' : 'text-muted-foreground'
                              }`}>
                                {storyData.isPublished ? t('admin.published') : t('admin.draft')}
                              </span>
                            </div>
                          </div>

                          {/* Associated Photos */}
                          {story && (
                            <section className="pt-6 border-t border-border/50 space-y-5">
                              <div className="flex items-center justify-between">
                                <h4 className="text-[11px] font-bold text-primary uppercase tracking-[0.2em] flex items-center gap-3">
                                  <span className="w-4 h-px bg-primary/20" />
                                  {t('admin.associate_photos') || 'Gallery Collection'} ({story.photos.length})
                                </h4>
                                <AdminButton
                                  onClick={() => setShowPhotoSelector(!showPhotoSelector)}
                                  adminVariant="primarySoft"
                                  size="sm"
                                  className="px-4"
                                >
                                  <Plus className="w-3 h-3 mr-1.5" />
                                  {t('admin.add_photos')}
                                </AdminButton>
                              </div>

                              {/* Photo Selector */}
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
                                        <p className="text-[10px] font-bold text-primary/60 uppercase tracking-[0.16em]">
                                          {t('admin.select_photos')} — {selectedPhotoIds.size} {t('admin.selected_count')}
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
                                              src={resolveAssetUrl(p.thumbnailUrl || p.url)}
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
                                          {t('admin.confirm_selection')} ({selectedPhotoIds.size})
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
                                      src={resolveAssetUrl(p.thumbnailUrl || p.url)}
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

            <FilmRollSelectorModal
              isOpen={showFilmRollSelector}
              onClose={() => setShowFilmRollSelector(false)}
              onSelect={(rollId, rollName) => {
                setEditData((prev) => ({
                  ...prev,
                  filmRollId: rollId || '',
                  filmRollName: rollName || '',
                }))
              }}
              filmRolls={filmRolls}
              selectedRollId={editData.filmRollId || undefined}
              loading={filmRollsLoading}
              t={t}
            />

            {/* Footer */}
            <div className="flex gap-4 p-5 border-t border-border bg-background sticky bottom-0 z-20 flex-shrink-0">
              <AdminButton
                onClick={onClose}
                adminVariant="outline"
                size="lg"
                className="flex-1 border-border hover:bg-muted transition-all"
              >
                {t('common.cancel')}
              </AdminButton>
              <AdminButton
                onClick={activeTab === 'info' ? handleSave : handleSaveStory}
                disabled={activeTab === 'info' ? saving : storySaving}
                adminVariant="primary"
                size="lg"
                className="flex-[1.5] flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
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
