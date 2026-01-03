'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, X, Loader2, Image as ImageIcon, Send, Sparkles, Database, ChevronDown, Check, FolderOpen, Minimize2, Save, Clock } from 'lucide-react'
import imageCompression from 'browser-image-compression'
import { useAuth } from '@/contexts/AuthContext'
import { uploadPhotoWithProgress, createStory, getAdminSettings, getAdminAlbums, addPhotosToAlbum, type PhotoDto, type AlbumDto, resolveAssetUrl } from '@/lib/api'
import { useSettings } from '@/contexts/SettingsContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { useDropzone } from 'react-dropzone'
import { saveDraftToDB, getDraftFromDB, clearDraftFromDB } from '@/lib/client-db'

const AUTO_SAVE_DELAY = 2000 // 2 seconds debounce

interface QuickStoryEditorProps {
  onSuccess: () => void
}

export function QuickStoryEditor({ onSuccess }: QuickStoryEditorProps) {
  const { user, token } = useAuth()
  const { settings } = useSettings()
  const { t } = useLanguage()
  
  // UI State
  const [isExpanded, setIsExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isStorageOpen, setIsStorageOpen] = useState(false)
  const [isAlbumOpen, setIsAlbumOpen] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)

  // Data State
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [photos, setPhotos] = useState<PhotoDto[]>([])
  const [pendingFiles, setPendingFiles] = useState<{ id: string; file: File; preview: string }[]>([])
  const [uploadQueue, setUploadQueue] = useState<{ id: string; progress: number }[]>([])
  const [albums, setAlbums] = useState<AlbumDto[]>([])
  
  // Drag reorder state
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  
  // Configuration State
  const [storageProvider, setStorageProvider] = useState('local')
  const [selectedAlbumIds, setSelectedAlbumIds] = useState<string[]>([])
  const [compressionEnabled, setCompressionEnabled] = useState(false)
  const [maxSizeMB, setMaxSizeMB] = useState(4)

  // Auto-save timer ref
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Internal drag state to disable dropzone
  const [isInternalDragging, setIsInternalDragging] = useState(false)

  // Refs for click outside
  const containerRef = useRef<HTMLDivElement>(null)
  const storageRef = useRef<HTMLDivElement>(null)
  const albumRef = useRef<HTMLDivElement>(null)

  const isAnyPopoverOpen = isStorageOpen || isAlbumOpen

  // Load draft from IndexedDB on mount
  useEffect(() => {
    async function loadDraft() {
      try {
        const draft = await getDraftFromDB()
        if (draft) {
          setTitle(draft.title || '')
          setContent(draft.content || '')
          setSelectedAlbumIds(draft.selectedAlbumIds || [])
          setLastSavedAt(draft.savedAt)
          
          if (draft.files && draft.files.length > 0) {
            const restoredFiles = draft.files.map(f => ({
              id: f.id,
              file: f.file,
              preview: URL.createObjectURL(f.file)
            }))
            setPendingFiles(restoredFiles)
          }

          if (draft.title || draft.content || (draft.files && draft.files.length > 0)) {
            setIsExpanded(true)
          }
        }
      } catch (e) {
        console.error('Failed to load draft', e)
      }
    }
    loadDraft()
  }, [])

  // Initial Data Fetch
  useEffect(() => {
    async function initData() {
      if (token && user?.isAdmin) {
        try {
          const [adminSettings, adminAlbums] = await Promise.all([
            getAdminSettings(token),
            getAdminAlbums(token)
          ])
          setStorageProvider(adminSettings.storage_provider)
          setAlbums(adminAlbums)
        } catch (e) {
          console.error('Failed to init editor data', e)
        }
      }
    }
    initData()
  }, [token, user?.isAdmin])

  // Auto-save draft when title, content, albums or files change
  useEffect(() => {
    if (!title && !content && selectedAlbumIds.length === 0 && pendingFiles.length === 0) return

    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    // Set new timer for auto-save
    autoSaveTimerRef.current = setTimeout(() => {
      saveDraft()
    }, AUTO_SAVE_DELAY)

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [title, content, selectedAlbumIds, pendingFiles])

  // Save draft to IndexedDB
  const saveDraft = useCallback(async () => {
    if (!title && !content && pendingFiles.length === 0) return

    try {
      await saveDraftToDB({
        title,
        content,
        selectedAlbumIds,
        files: pendingFiles.map(f => ({ id: f.id, file: f.file }))
      })
      setLastSavedAt(Date.now())
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 2000)
    } catch (e) {
      console.error('Failed to save draft', e)
    }
  }, [title, content, selectedAlbumIds, pendingFiles])

  // Clear draft from IndexedDB
  const clearDraft = useCallback(async () => {
    try {
      await clearDraftFromDB()
      setLastSavedAt(null)
    } catch (e) {
      console.error('Failed to clear draft', e)
    }
  }, [])

  // Format relative time
  const formatRelativeTime = useMemo(() => {
    if (!lastSavedAt) return null
    const diff = Date.now() - lastSavedAt
    if (diff < 60000) return t('story.draft_just_now') || 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} ${t('story.draft_minutes_ago') || 'min ago'}`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ${t('story.draft_hours_ago') || 'h ago'}`
    return new Date(lastSavedAt).toLocaleDateString()
  }, [lastSavedAt, t])

  // Click Outside Handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (storageRef.current && !storageRef.current.contains(target)) setIsStorageOpen(false)
      if (albumRef.current && !albumRef.current.contains(target)) setIsAlbumOpen(false)
    }
    document.addEventListener('click', handleClickOutside, true)
    return () => document.removeEventListener('click', handleClickOutside, true)
  }, [])

  // File Selection Handler (Deferred Upload)
  const handleFilesSelected = useCallback((acceptedFiles: File[]) => {
    const newPendingFiles = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      preview: URL.createObjectURL(file)
    }))
    setPendingFiles(prev => [...prev, ...newPendingFiles])
  }, [])

  // Remove pending file
  const removePendingFile = useCallback((id: string) => {
    setPendingFiles(prev => {
      const file = prev.find(f => f.id === id)
      if (file) URL.revokeObjectURL(file.preview)
      return prev.filter(f => f.id !== id)
    })
  }, [])

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      pendingFiles.forEach(f => URL.revokeObjectURL(f.preview))
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive, open: openFileDialog } = useDropzone({
    onDrop: handleFilesSelected,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    noClick: true,
    noDrag: isInternalDragging, // Disable dropzone when dragging internal items
    noDragEventsBubbling: true
  })

  // Drag reorder handlers for pending files
  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.stopPropagation() // Vital: prevent bubbling to dropzone
    setIsInternalDragging(true)
    setDraggedItemId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  // Optimized Move Logic
  const movePendingFile = useCallback((sourceId: string, targetId?: string) => {
    setPendingFiles(prev => {
      const sourceIndex = prev.findIndex(f => f.id === sourceId)
      if (sourceIndex === -1) return prev

      const newFiles = [...prev]
      const [draggedItem] = newFiles.splice(sourceIndex, 1)

      if (targetId) {
        const targetIndex = prev.findIndex(f => f.id === targetId)
        if (targetIndex !== -1) {
          newFiles.splice(targetIndex, 0, draggedItem)
        } else {
          newFiles.push(draggedItem)
        }
      } else {
        // Drop on container -> Append to end
        newFiles.push(draggedItem)
      }
      
      return newFiles
    })
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (draggedItemId && draggedItemId !== targetId) {
      movePendingFile(draggedItemId, targetId)
    }
    setDraggedItemId(null)
  }, [draggedItemId, movePendingFile])

  const handleDragEnd = useCallback(() => {
    setIsInternalDragging(false)
    setDraggedItemId(null)
  }, [])

  // Handle drop on empty space (append to end)
  const handleContainerDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (draggedItemId) {
      movePendingFile(draggedItemId)
    }
    setDraggedItemId(null)
  }, [draggedItemId, movePendingFile])

  // Submit Handler - Upload files first, then create story
  const handleSubmit = async () => {
    if (!title.trim() && !content.trim()) return
    if (!token) return

    try {
      setLoading(true)
      const uploadedPhotos: PhotoDto[] = [...photos]

      // Upload all pending files
      if (pendingFiles.length > 0) {
        setUploadQueue(pendingFiles.map(f => ({ id: f.id, progress: 0 })))

        for (const pending of pendingFiles) {
          let fileToUpload = pending.file

          // Compression Logic
          if (compressionEnabled && fileToUpload.size > maxSizeMB * 1024 * 1024) {
            try {
              const blob = await imageCompression(fileToUpload, {
                maxSizeMB,
                maxWidthOrHeight: 4096,
                useWebWorker: true,
                preserveExif: true
              })
              fileToUpload = new File([blob], pending.file.name, { type: blob.type })
            } catch (e) {
              console.error('Compression failed, using original', e)
            }
          }

          try {
            const result = await uploadPhotoWithProgress({
              token,
              file: fileToUpload,
              title: fileToUpload.name,
              category: 'Story',
              storage_provider: storageProvider,
              onProgress: (progress) => {
                setUploadQueue(prev => prev.map(p => p.id === pending.id ? { ...p, progress } : p))
              }
            })

            uploadedPhotos.push(result)

            // Auto-link to albums
            if (selectedAlbumIds.length > 0) {
              await Promise.all(selectedAlbumIds.map(albumId =>
                addPhotosToAlbum(token, albumId, [result.id])
              ))
            }
          } catch (error) {
            console.error('Upload failed:', error)
          } finally {
            setUploadQueue(prev => prev.filter(p => p.id !== pending.id))
          }
        }
      }

      // Create the story with all uploaded photos
      await createStory(token, {
        title,
        content,
        isPublished: true,
        photoIds: uploadedPhotos.map(p => p.id),
        coverPhotoId: uploadedPhotos.length > 0 ? uploadedPhotos[0].id : undefined
      })

      // Cleanup preview URLs
      pendingFiles.forEach(f => URL.revokeObjectURL(f.preview))

      // Clear draft after successful publish
      clearDraft()

      // Reset Form
      setTitle('')
      setContent('')
      setPhotos([])
      setPendingFiles([])
      setUploadQueue([])
      setIsExpanded(false)
      onSuccess()
    } catch (error) {
      console.error('Failed to publish story:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!user?.isAdmin) return null

  return (
    <div className="mb-24 relative z-20">
      <motion.div
        ref={containerRef}
        layout
        initial="collapsed"
        animate={isExpanded ? 'expanded' : 'collapsed'}
        variants={{
          expanded: { borderRadius: 12 },
          collapsed: { borderRadius: 50 }
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className={`
          relative bg-background border border-border/60
          ${isExpanded ? 'shadow-2xl' : 'hover:border-primary/50 cursor-text'}
          ${isExpanded && isAnyPopoverOpen ? 'overflow-visible' : 'overflow-hidden'}
          transition-colors duration-300
        `}
      >
        {/* Trigger (Visible when Closed) */}
        {!isExpanded && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, position: 'absolute' }}
            transition={{ duration: 0.2 }}
            className="flex items-center justify-between px-6 py-4"
            onClick={() => setIsExpanded(true)}
          >
            <div className="flex items-center gap-4 text-muted-foreground/60">
              <Sparkles className="w-4 h-4" />
              <span className="font-serif italic text-sm tracking-wide">
                {t('story.quick_prompt')}
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <PlusIcon className="w-4 h-4 text-muted-foreground" />
            </div>
          </motion.div>
        )}

        {/* Editor Content (Visible when Open) */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              key="editor-body"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, position: 'absolute', top: 0, width: '100%', zIndex: -1 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col"
            >
              <div {...getRootProps({ className: 'flex flex-col h-full outline-none' })}>
                {/* Drag Active Overlay - Only show if not internal dragging */}
                {isDragActive && !isInternalDragging && (
                  <div className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm border-2 border-primary border-dashed rounded-xl flex items-center justify-center pointer-events-none">
                    <div className="flex flex-col items-center gap-2 text-primary animate-bounce">
                      <Upload className="w-8 h-8" />
                      <span className="font-bold uppercase tracking-widest text-xs">{t('story.quick_drop')}</span>
                    </div>
                  </div>
                )}

                {/* Toolbar Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-muted/20 rounded-t-xl">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      {t('story.quick_new')}
                    </span>
                    {/* Draft Status Indicator */}
                    <AnimatePresence mode="wait">
                      {draftSaved && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="flex items-center gap-1 text-[9px] text-green-500"
                        >
                          <Check className="w-3 h-3" />
                          <span>{t('story.draft_saved') || 'Saved'}</span>
                        </motion.div>
                      )}
                      {!draftSaved && lastSavedAt && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex items-center gap-1 text-[9px] text-muted-foreground/60"
                        >
                          <Clock className="w-3 h-3" />
                          <span>{formatRelativeTime}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsExpanded(false)
                    }}
                    className="p-2 hover:bg-muted rounded-full transition-colors"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                {/* Inputs */}
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('story.quick_title_ph')}
                  className="w-full bg-transparent text-3xl font-serif font-light placeholder:text-muted-foreground/30 focus:outline-none"
                  autoFocus
                />
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={t('story.quick_content_ph')}
                  className="w-full min-h-[120px] bg-transparent text-sm leading-relaxed font-sans placeholder:text-muted-foreground/30 focus:outline-none resize-none"
                />

                {/* Photo Grid - Shows pending files and already uploaded photos */}
                {(photos.length > 0 || pendingFiles.length > 0 || uploadQueue.length > 0) && (
                  <div
                    className="grid grid-cols-4 md:grid-cols-6 gap-3 pt-4 border-t border-border/40 min-h-[100px]"
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                    }}
                    onDrop={handleContainerDrop}
                  >
                    {/* Already uploaded photos */}
                    {photos.map((photo) => (
                      <div
                        key={photo.id}
                        className="group relative aspect-square bg-muted rounded-md overflow-hidden"
                      >
                        <img
                          src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
                          className="w-full h-full object-cover pointer-events-none"
                          alt="preview"
                          draggable={false}
                        />
                        <button
                          onClick={() => setPhotos(prev => prev.filter(p => p.id !== photo.id))}
                          className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {/* Pending files (not yet uploaded) - with drag reorder */}
                    {pendingFiles.map((item) => {
                      const isUploading = uploadQueue.some(q => q.id === item.id)
                      const uploadProgress = uploadQueue.find(q => q.id === item.id)?.progress || 0
                      const isDragging = draggedItemId === item.id
                      
                      return (
                        <div
                          key={item.id}
                          draggable={!isUploading}
                          onDragStart={(e) => handleDragStart(e, item.id)}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, item.id)}
                          onDragEnd={handleDragEnd}
                          className={`group relative aspect-square bg-muted rounded-md overflow-hidden cursor-move transition-all duration-200 ${
                            isDragging ? 'opacity-50 scale-95 ring-2 ring-primary' : ''
                          }`}
                        >
                          <img
                            src={item.preview}
                            className={`w-full h-full object-cover pointer-events-none ${isUploading ? 'opacity-50' : ''}`}
                            alt="pending"
                            draggable={false}
                          />
                          {isUploading ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 p-2">
                              <Loader2 className="w-5 h-5 animate-spin text-white mb-2" />
                              <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => removePendingFile(item.id)}
                              className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                  {/* Hidden Input for manual selection via button */}
                  <input {...getInputProps()} />

                  {/* Footer Stats & Actions */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      {/* Upload Trigger */}
                      <button
                        onClick={openFileDialog}
                        className="cursor-pointer group flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/30 hover:bg-muted transition-colors"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground">
                          {t('story.quick_add_photos')}
                        </span>
                      </button>

                    {/* Album Selector */}
                    <div ref={albumRef} className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setIsAlbumOpen(!isAlbumOpen) }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/30 hover:bg-muted transition-colors ${selectedAlbumIds.length ? 'text-primary bg-primary/10' : ''}`}
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-inherit" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-inherit">
                          {selectedAlbumIds.length ? `${selectedAlbumIds.length} Albums` : 'Albums'}
                        </span>
                      </button>
                      <AnimatePresence>
                        {isAlbumOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -5, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -5, scale: 0.95 }}
                            transition={{ duration: 0.1 }}
                            className="absolute top-full left-0 mt-2 w-48 bg-popover border border-border rounded-lg shadow-xl overflow-hidden z-50 max-h-48 overflow-y-auto"
                          >
                            {albums.length === 0 ? (
                              <div className="px-3 py-2 text-[10px] text-muted-foreground text-center">No albums found</div>
                            ) : (
                              albums.map(album => (
                                <button
                                  key={album.id}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedAlbumIds(prev => prev.includes(album.id) ? prev.filter(id => id !== album.id) : [...prev, album.id])
                                  }}
                                  className="w-full text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider flex items-center justify-between hover:bg-muted text-muted-foreground hover:text-foreground"
                                >
                                  <span className="truncate flex-1">{album.name}</span>
                                  {selectedAlbumIds.includes(album.id) && <Check className="w-3 h-3 text-primary flex-shrink-0 ml-2" />}
                                </button>
                              ))
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Storage Selector */}
                    <div ref={storageRef} className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setIsStorageOpen(!isStorageOpen) }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/30 hover:bg-muted transition-colors"
                      >
                        <Database className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {storageProvider}
                        </span>
                        <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${isStorageOpen ? 'rotate-180' : ''}`} />
                      </button>
                      <AnimatePresence>
                        {isStorageOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -5, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -5, scale: 0.95 }}
                            transition={{ duration: 0.1 }}
                            className="absolute top-full left-0 mt-2 w-32 bg-popover border border-border rounded-lg shadow-xl overflow-hidden z-50"
                          >
                            {['local', 'r2', 'github'].map((provider) => (
                              <button
                                key={provider}
                                onClick={(e) => { e.stopPropagation(); setStorageProvider(provider); setIsStorageOpen(false) }}
                                className={`w-full text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider flex items-center justify-between ${storageProvider === provider ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'}`}
                              >
                                {provider}
                                {storageProvider === provider && <Check className="w-3 h-3" />}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Compression Settings */}
                    <div className="flex items-center gap-2">
                      <div
                        onClick={(e) => { e.stopPropagation(); setCompressionEnabled(!compressionEnabled) }}
                        className={`h-6 w-10 px-1 rounded-full cursor-pointer transition-colors relative ${compressionEnabled ? 'bg-primary/20' : 'bg-muted/30 hover:bg-muted'}`}
                        title="Toggle Compression"
                      >
                        <motion.div
                          className={`absolute top-1 w-4 h-4 rounded-full shadow-sm flex items-center justify-center ${compressionEnabled ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}`}
                          animate={{ x: compressionEnabled ? 16 : 0 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        >
                          <Minimize2 className="w-2.5 h-2.5" />
                        </motion.div>
                      </div>
                      <AnimatePresence>
                        {compressionEnabled && (
                          <motion.div
                            initial={{ opacity: 0, width: 0, overflow: 'hidden' }}
                            animate={{ opacity: 1, width: 'auto' }}
                            exit={{ opacity: 0, width: 0 }}
                            className="flex items-center gap-2 whitespace-nowrap overflow-hidden pl-1"
                          >
                            <input
                              type="range" min="0.5" max="10" step="0.5"
                              value={maxSizeMB}
                              onChange={(e) => setMaxSizeMB(parseFloat(e.target.value))}
                              onClick={(e) => e.stopPropagation()}
                              className="w-20 h-1 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                            />
                            <div className="relative flex items-center">
                              <input
                                type="number" min="0.1" max="20" step="0.1"
                                value={maxSizeMB || ''}
                                onChange={(e) => { const val = parseFloat(e.target.value); setMaxSizeMB(isNaN(val) ? 0 : val) }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-8 h-5 text-[10px] text-right bg-transparent hover:bg-muted/50 focus:bg-muted/50 rounded focus:outline-none focus:ring-1 focus:ring-primary/20 font-mono font-bold text-muted-foreground focus:text-foreground transition-colors"
                              />
                              <span className="text-[10px] font-bold text-muted-foreground font-mono ml-0.5">MB</span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Save Draft Button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); saveDraft() }}
                      disabled={loading || (!title && !content)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-xs uppercase tracking-widest transition-all ${loading || (!title && !content) ? 'bg-muted/50 text-muted-foreground/50 cursor-not-allowed' : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'}`}
                      title={t('story.save_draft') || 'Save Draft'}
                    >
                      <Save className="w-3.5 h-3.5" />
                      {t('story.save_draft') || 'Draft'}
                    </button>

                    {/* Publish Button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSubmit() }}
                      disabled={loading || (!title && !content)}
                      className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold text-xs uppercase tracking-widest transition-all ${loading || (!title && !content) ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5'}`}
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      {t('story.quick_publish')}
                    </button>
                  </div>
                </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}