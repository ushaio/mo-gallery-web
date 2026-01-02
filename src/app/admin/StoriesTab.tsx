'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import {
  BookOpen,
  Plus,
  History,
  FileText,
  Edit3,
  Trash2,
  ChevronLeft,
  Save,
  Eye,
  EyeOff,
  Image as ImageIcon,
  X,
  GripVertical,
  Loader2,
} from 'lucide-react'
import {
  getAdminStories,
  createStory,
  updateStory,
  deleteStory,
  addPhotosToStory,
  removePhotoFromStory,
  reorderStoryPhotos,
  getPhotos,
  resolveAssetUrl,
  type StoryDto,
  type PhotoDto,
} from '@/lib/api'
import { CustomInput } from '@/components/ui/CustomInput'
import { useSettings } from '@/contexts/SettingsContext'
import { PhotoSelectorModal } from '@/components/admin/PhotoSelectorModal'
import type { MilkdownEditorHandle } from '@/components/MilkdownEditor'

// Dynamically import MilkdownEditor to avoid SSR issues
const MilkdownEditor = dynamic(
  () => import('@/components/MilkdownEditor'),
  { 
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center border border-border bg-card/30 rounded-lg">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }
)

interface StoriesTabProps {
  token: string | null
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  editStoryId?: string
}

export function StoriesTab({ token, t, notify, editStoryId }: StoriesTabProps) {
  const { settings } = useSettings()
  const [stories, setStories] = useState<StoryDto[]>([])
  const [loading, setLoading] = useState(true)
  const [currentStory, setCurrentStory] = useState<StoryDto | null>(null)
  const [storyEditMode, setStoryEditMode] = useState<'list' | 'editor'>('list')
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<MilkdownEditorHandle>(null)
  
  // Photo management
  const [allPhotos, setAllPhotos] = useState<PhotoDto[]>([])
  const [showPhotoSelector, setShowPhotoSelector] = useState(false)
  
  // Drag and drop state
  const [draggedPhotoId, setDraggedPhotoId] = useState<string | null>(null)
  const [dragOverPhotoId, setDragOverPhotoId] = useState<string | null>(null)

  useEffect(() => {
    loadStories()
  }, [token])

  // Handle editStoryId - auto-open editor for the specified story
  useEffect(() => {
    if (editStoryId && stories.length > 0) {
      const storyToEdit = stories.find(s => s.id === editStoryId)
      if (storyToEdit) {
        setCurrentStory({ ...storyToEdit })
        setStoryEditMode('editor')
      }
    }
  }, [editStoryId, stories])

  // Load all photos when entering editor mode
  useEffect(() => {
    if (storyEditMode === 'editor' && allPhotos.length === 0) {
      loadAllPhotos()
    }
  }, [storyEditMode])

  async function loadStories() {
    if (!token) return
    try {
      setLoading(true)
      const data = await getAdminStories(token)
      setStories(data)
    } catch (err) {
      console.error('Failed to load stories:', err)
      notify(t('story.load_failed'), 'error')
    } finally {
      setLoading(false)
    }
  }

  async function loadAllPhotos() {
    try {
      const data = await getPhotos({ all: true })
      setAllPhotos(data)
    } catch (err) {
      console.error('Failed to load photos:', err)
    }
  }

  function handleCreateStory() {
    setCurrentStory({
      id: crypto.randomUUID(),
      title: '',
      content: '',
      isPublished: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      photos: [],
    })
    setStoryEditMode('editor')
  }

  function handleEditStory(story: StoryDto) {
    setCurrentStory({ ...story })
    setStoryEditMode('editor')
  }

  async function handleDeleteStory(id: string) {
    if (!token) return
    if (!window.confirm(t('common.confirm') + '?')) return

    try {
      await deleteStory(token, id)
      notify(t('story.deleted'), 'success')
      await loadStories()
    } catch (err) {
      console.error('Failed to delete story:', err)
      notify(t('story.delete_failed'), 'error')
    }
  }

  async function handleSaveStory() {
    if (!token || !currentStory) return
    if (!currentStory.title.trim() || !currentStory.content.trim()) {
      notify(t('story.fill_title_content'), 'error')
      return
    }

    try {
      setSaving(true)
      const isNew = !stories.find((s) => s.id === currentStory.id)

      if (isNew) {
        await createStory(token, {
          title: currentStory.title,
          content: currentStory.content,
          isPublished: currentStory.isPublished,
          photoIds: currentStory.photos?.map(p => p.id) || [],
        })
        notify(t('story.created'), 'success')
      } else {
        await updateStory(token, currentStory.id, {
          title: currentStory.title,
          content: currentStory.content,
          isPublished: currentStory.isPublished,
        })
        notify(t('story.updated'), 'success')
      }

      setStoryEditMode('list')
      setCurrentStory(null)
      await loadStories()
    } catch (err) {
      console.error('Failed to save story:', err)
      notify(t('story.save_failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleTogglePublish(story: StoryDto) {
    if (!token) return

    try {
      await updateStory(token, story.id, {
        isPublished: !story.isPublished,
      })
      notify(story.isPublished ? t('story.unpublished') : t('story.published'), 'success')
      await loadStories()
    } catch (err) {
      console.error('Failed to toggle publish:', err)
      notify(t('story.operation_failed'), 'error')
    }
  }

  async function handleUpdatePhotos(selectedPhotoIds: string[]) {
    if (!token || !currentStory) return
    
    const isNew = !stories.find((s) => s.id === currentStory.id)
    
    // Get the photos in the selected order
    const selectedPhotos = selectedPhotoIds
      .map(id => allPhotos.find(p => p.id === id))
      .filter((p): p is PhotoDto => p !== undefined)
    
    if (isNew) {
      // For new stories, just update local state with the new selection
      setCurrentStory(prev => ({
        ...prev!,
        photos: selectedPhotos
      }))
    } else {
      // For existing stories, we need to sync with the server
      const currentPhotoIds = currentStory.photos?.map(p => p.id) || []
      const photosToAdd = selectedPhotoIds.filter(id => !currentPhotoIds.includes(id))
      const photosToRemove = currentPhotoIds.filter(id => !selectedPhotoIds.includes(id))
      
      try {
        // Remove photos that are no longer selected
        for (const photoId of photosToRemove) {
          await removePhotoFromStory(token, currentStory.id, photoId)
        }
        
        // Add new photos
        if (photosToAdd.length > 0) {
          await addPhotosToStory(token, currentStory.id, photosToAdd)
        }
        
        // Reorder if needed
        if (selectedPhotoIds.length > 0) {
          await reorderStoryPhotos(token, currentStory.id, selectedPhotoIds)
        }
        
        // Update local state
        setCurrentStory(prev => ({
          ...prev!,
          photos: selectedPhotos
        }))
        
        notify(t('admin.photos_updated'), 'success')
      } catch (err) {
        console.error('Failed to update photos:', err)
        notify(t('common.error'), 'error')
      }
    }
    
    setShowPhotoSelector(false)
  }

  async function handleRemovePhoto(photoId: string) {
    if (!token || !currentStory) return
    
    const isNew = !stories.find((s) => s.id === currentStory.id)
    
    if (isNew) {
      // For new stories, just remove from local state
      setCurrentStory(prev => ({
        ...prev!,
        photos: prev?.photos?.filter(p => p.id !== photoId) || []
      }))
    } else {
      // For existing stories, call API
      try {
        const updated = await removePhotoFromStory(token, currentStory.id, photoId)
        setCurrentStory(updated)
        notify(t('admin.photo_removed'), 'success')
      } catch (err) {
        console.error('Failed to remove photo:', err)
        notify(t('common.error'), 'error')
      }
    }
  }

  async function handleSetCover(photoId: string) {
    if (!token || !currentStory) return
    
    const isNew = !stories.find((s) => s.id === currentStory.id)
    
    if (isNew) {
      setCurrentStory(prev => ({
        ...prev!,
        coverPhotoId: photoId
      }))
    } else {
      try {
        const updated = await updateStory(token, currentStory.id, { coverPhotoId: photoId })
        setCurrentStory(updated)
        notify(t('admin.cover_set'), 'success')
      } catch (err) {
        console.error('Failed to set cover:', err)
        notify(t('common.error'), 'error')
      }
    }
  }

  // Drag and drop handlers
  function handleDragStart(e: React.DragEvent, photoId: string) {
    setDraggedPhotoId(photoId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', photoId)
    // Add a slight delay to show the drag effect
    setTimeout(() => {
      const element = e.target as HTMLElement
      element.style.opacity = '0.5'
    }, 0)
  }

  function handleDragEnd(e: React.DragEvent) {
    const element = e.target as HTMLElement
    element.style.opacity = '1'
    setDraggedPhotoId(null)
    setDragOverPhotoId(null)
  }

  function handleDragOver(e: React.DragEvent, photoId: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (photoId !== draggedPhotoId) {
      setDragOverPhotoId(photoId)
    }
  }

  function handleDragLeave() {
    setDragOverPhotoId(null)
  }

  async function handleDrop(e: React.DragEvent, targetPhotoId: string) {
    e.preventDefault()
    setDragOverPhotoId(null)
    
    if (!currentStory?.photos || !draggedPhotoId || draggedPhotoId === targetPhotoId) {
      return
    }

    const photos = [...currentStory.photos]
    const draggedIndex = photos.findIndex(p => p.id === draggedPhotoId)
    const targetIndex = photos.findIndex(p => p.id === targetPhotoId)

    if (draggedIndex === -1 || targetIndex === -1) return

    // Remove dragged item and insert at target position
    const [draggedPhoto] = photos.splice(draggedIndex, 1)
    photos.splice(targetIndex, 0, draggedPhoto)

    // Update local state immediately for smooth UX
    setCurrentStory(prev => ({
      ...prev!,
      photos
    }))

    // If it's an existing story, save the new order to the server
    const isNew = !stories.find((s) => s.id === currentStory.id)
    if (!isNew && token) {
      try {
        const photoIds = photos.map(p => p.id)
        await reorderStoryPhotos(token, currentStory.id, photoIds)
        notify(t('admin.photos_reordered'), 'success')
      } catch (err) {
        console.error('Failed to reorder photos:', err)
        notify(t('common.error'), 'error')
        // Revert on error
        await loadStories()
      }
    }
  }

  const handleContentChange = (content: string) => {
    if (currentStory) {
      setCurrentStory({ ...currentStory, content })
    }
  }

  // Get current photo IDs (for initial selection in modal)
  const currentPhotoIds = currentStory?.photos?.map(p => p.id) || []

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      {storyEditMode === 'list' ? (
        <div className="space-y-8 flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border pb-4 flex-shrink-0">
            <div className="flex items-center gap-4">
              <BookOpen className="w-6 h-6 text-primary" />
              <h3 className="font-serif text-2xl uppercase tracking-tight">
                {t('ui.photo_story')}
              </h3>
            </div>
            <button
              onClick={handleCreateStory}
              className="flex items-center px-6 py-2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all rounded-md"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('ui.create_story')}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-1 gap-4">
              {stories.map((story) => (
                <div
                  key={story.id}
                  className="flex items-center justify-between p-6 border border-border hover:border-primary transition-all group rounded-lg"
                >
                  <div
                    className="flex-1 min-w-0"
                    onClick={() => handleEditStory(story)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="font-serif text-xl group-hover:text-primary transition-colors">
                        {story.title || t('story.untitled')}
                      </h4>
                      <span
                        className={`text-[8px] font-black uppercase px-1.5 py-0.5 border rounded ${
                          story.isPublished
                            ? 'border-primary text-primary bg-primary/10'
                            : 'border-muted-foreground text-muted-foreground'
                        }`}
                      >
                        {story.isPublished ? 'PUBLISHED' : 'DRAFT'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono uppercase">
                      <span className="flex items-center gap-1">
                        <History className="w-3 h-3" />{' '}
                        {new Date(story.updatedAt).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {story.content.length}{' '}
                        {t('admin.characters')}
                      </span>
                      {story.photos && story.photos.length > 0 && (
                        <span className="flex items-center gap-1">
                          <ImageIcon className="w-3 h-3" /> {story.photos.length} {t('ui.photos_count')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleTogglePublish(story)
                      }}
                      className="p-2 text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-muted"
                      title={story.isPublished ? t('story.unpublish') : t('story.publish')}
                    >
                      {story.isPublished ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEditStory(story)
                      }}
                      className="p-2 text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-muted"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteStory(story.id)
                      }}
                      className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-md hover:bg-muted"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {stories.length === 0 && (
                <div className="py-24 text-center border border-dashed border-border rounded-lg">
                  <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-10" />
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {t('ui.no_story')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Header - Back button and Save button */}
          <div className="flex items-center justify-between border-b border-border pb-4 flex-shrink-0">
            <button
              onClick={() => {
                setStoryEditMode('list')
                setCurrentStory(null)
              }}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest hover:text-primary transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> {t('admin.back_list')}
            </button>
            <button
              onClick={handleSaveStory}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-50 rounded-md"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? t('ui.saving') : t('admin.save')}</span>
            </button>
          </div>

          {/* Main Content - Left/Right Layout */}
          <div className="flex-1 flex gap-4 overflow-hidden">
            {/* Left: Editor (70%) */}
            <div className="flex-[7] flex flex-col gap-4 overflow-hidden min-w-0">
              {/* Title Input */}
              <CustomInput
                variant="config"
                type="text"
                value={currentStory?.title || ''}
                onChange={(e) =>
                  setCurrentStory((prev) => ({
                    ...prev!,
                    title: e.target.value,
                  }))
                }
                placeholder={t('story.title_placeholder')}
                className="text-xl md:text-2xl font-serif p-4 md:p-6"
              />
              
              {/* Publish Checkbox and Character Count */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-2">
                {/* Left: Publish Checkbox and Character Count */}
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentStory?.isPublished || false}
                      onChange={(e) =>
                        setCurrentStory((prev) => ({
                          ...prev!,
                          isPublished: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-primary cursor-pointer rounded"
                    />
                    <span className="text-xs font-bold uppercase tracking-widest">
                      {t('ui.publish_now')}
                    </span>
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {currentStory?.content?.length || 0} {t('admin.characters')}
                  </span>
                </div>
              </div>
              
              {/* Content Area - WYSIWYG Editor */}
              <div className="flex-1 relative border border-border bg-card/30 rounded-lg overflow-visible">
                {currentStory && (
                  <MilkdownEditor
                    key={currentStory.id}
                    ref={editorRef}
                    value={currentStory.content}
                    onChange={handleContentChange}
                    placeholder={t('ui.markdown_placeholder')}
                  />
                )}
              </div>
            </div>

            {/* Right: Photos Panel (30%) */}
            <div className="flex-[3] flex flex-col border border-border rounded-lg bg-muted/20 overflow-hidden min-w-[320px]">
              {/* Photos Header */}
              <div className="flex items-center justify-between p-4 border-b border-border bg-background/50">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-widest">
                    {t('story.related_photos')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({currentStory?.photos?.length || 0})
                  </span>
                </div>
                <button
                  onClick={() => setShowPhotoSelector(true)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 rounded-md transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('admin.add_photos')}</span>
                </button>
              </div>

              {/* Photos Grid */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                {currentStory?.photos && currentStory.photos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {currentStory.photos.map((photo, index) => (
                      <div
                        key={photo.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, photo.id)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleDragOver(e, photo.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, photo.id)}
                        className={`relative group aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-grab active:cursor-grabbing ${
                          dragOverPhotoId === photo.id
                            ? 'border-primary border-dashed scale-105 shadow-lg'
                            : currentStory.coverPhotoId === photo.id
                            ? 'border-primary'
                            : 'border-transparent hover:border-border'
                        } ${draggedPhotoId === photo.id ? 'opacity-50' : ''}`}
                      >
                        {/* Drag Handle Indicator */}
                        <div className="absolute top-1 right-1 z-10 p-1 bg-black/40 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          <GripVertical className="w-3 h-3 text-white" />
                        </div>
                        
                        {/* Order Number */}
                        <div className="absolute bottom-1 right-1 z-10 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center">
                          <span className="text-[10px] font-bold text-white">{index + 1}</span>
                        </div>
                        
                        <img
                          src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
                          alt={photo.title}
                          className="w-full h-full object-cover pointer-events-none"
                        />
                        
                        {/* Cover Badge */}
                        {currentStory.coverPhotoId === photo.id && (
                          <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-primary text-primary-foreground text-[8px] font-bold uppercase rounded">
                            {t('admin.cover')}
                          </div>
                        )}
                        
                        {/* Hover Actions */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          {currentStory.coverPhotoId !== photo.id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSetCover(photo.id)
                              }}
                              className="p-1.5 bg-white/20 hover:bg-white/40 text-white rounded text-[10px] font-medium"
                              title={t('admin.set_as_cover')}
                            >
                              Cover
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemovePhoto(photo.id)
                            }}
                            className="p-1.5 bg-white/20 hover:bg-destructive text-white rounded"
                            title={t('admin.remove')}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                    <ImageIcon className="w-12 h-12 mb-3 opacity-20" />
                    <p className="text-xs text-center mb-3">
                      {t('admin.no_photos_available')}
                    </p>
                    <button
                      onClick={() => setShowPhotoSelector(true)}
                      className="text-xs text-primary hover:underline"
                    >
                      {t('admin.add_photos')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo Selector Modal */}
      <PhotoSelectorModal
        isOpen={showPhotoSelector}
        onClose={() => setShowPhotoSelector(false)}
        onConfirm={handleUpdatePhotos}
        initialSelectedPhotoIds={currentPhotoIds}
        t={t}
      />
    </div>
  )
}
