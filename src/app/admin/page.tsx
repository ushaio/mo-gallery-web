'use client'

import React, { useEffect, useMemo, useState, useRef } from 'react'
import {
  Upload,
  Image as ImageIcon,
  Settings,
  LogOut,
  Plus,
  X,
  ChevronDown,
  Check,
  Globe,
  FolderTree,
  Cloud,
  MessageSquare,
  Search,
  Trash2,
  ExternalLink,
  Save,
  Menu,
  Ruler,
  HardDrive,
  Calendar,
  Maximize2,
  Star,
  Camera,
  Aperture,
  Clock,
  Gauge,
  MapPin,
  Code,
  LayoutGrid,
  List as ListIcon,
  ChevronLeft,
  ChevronRight,
  BookText,
  Eye,
  Edit3,
  FileText,
  MoreVertical,
  History,
  AlertCircle,
  Info,
  Loader2
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Toast, type Notification } from '@/components/admin/Toast'
import { UploadFileItem } from '@/components/admin/UploadFileItem'
import { formatFileSize } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useSettings } from '@/contexts/SettingsContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { useRouter } from 'next/navigation'
import {
  ApiUnauthorizedError,
  deletePhoto,
  getAdminSettings,
  getCategories,
  getComments,
  getPhotos,
  resolveAssetUrl,
  updateAdminSettings,
  updateCommentStatus,
  deleteComment,
  uploadPhoto,
  updatePhoto,
  type AdminSettingsDto,
  type CommentDto,
  type PhotoDto,
} from '@/lib/api'

// --- Types ---
interface PhotoLog {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
  status: 'draft' | 'published'
}

// --- Helper Components ---

function AdminDashboard() {
  const { logout, token, user } = useAuth()
  const { settings: globalSettings, refresh: refreshGlobalSettings } = useSettings()
  const { t } = useLanguage()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('photos')
  const [settingsTab, setSettingsTab] = useState('site')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const [notifications, setNotifications] = useState<Notification[]>([])
  const notify = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9)
    setNotifications(prev => [...prev, { id, message, type }])
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000)
  }

  const siteTitle = globalSettings?.site_title || 'MO GALLERY'

  // --- Photo Library State ---
  const [categories, setCategories] = useState<string[]>([])
  const [photos, setPhotos] = useState<PhotoDto[]>([])
  const [photosLoading, setPhotosLoading] = useState(false)
  const [photosError, setPhotosError] = useState('')
  const [photosViewMode, setPhotosViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set())
  const [photoSearch, setPhotoSearch] = useState('')
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoDto | null>(null)
  const [dominantColors, setDominantColors] = useState<string[]>([])
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{ photoIds: string[], isBulk: boolean } | null>(null)
  const [deleteFromStorage, setDeleteFromStorage] = useState(true)

  // --- Photo Log State ---
  const [photoLogs, setPhotoLogs] = useState<PhotoLog[]>([
    { id: '1', title: 'Winter in Tokyo', content: 'Morning walk in Shibuya...', createdAt: '2025-12-20', updatedAt: '2025-12-21', status: 'published' },
    { id: '2', title: 'Draft: Mountain Peak', content: 'Gear used: Leica M11...', createdAt: '2025-12-22', updatedAt: '2025-12-22', status: 'draft' }
  ])
  const [currentLog, setCurrentLog] = useState<PhotoLog | null>(null)
  const [logEditMode, setLogEditMode] = useState<'list' | 'editor'>('list')
  const [logPreviewActive, setLogPreviewActive] = useState(false)
  const [isLogInsertingPhoto, setIsLogInsertingPhoto] = useState(false)

  useEffect(() => {
    if (selectedPhoto) {
      const img = new Image(); img.crossOrigin = "Anonymous"; img.src = resolveAssetUrl(selectedPhoto.url)
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas"); const ctx = canvas.getContext("2d", { willReadFrequently: true })
          if (!ctx) return; canvas.width = 40; canvas.height = 40; ctx.drawImage(img, 0, 0, 40, 40)
          const imageData = ctx.getImageData(0, 0, 40, 40).data; const colorCounts: Record<string, number> = {}
          for (let i = 0; i < imageData.length; i += 16) {
            const r = Math.round(imageData[i] / 10) * 10; const g = Math.round(imageData[i+1] / 10) * 10; const b = Math.round(imageData[i+2] / 10) * 10
            const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
            colorCounts[hex] = (colorCounts[hex] || 0) + 1
          }
          const sorted = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(c => c[0])
          setDominantColors(sorted)
        } catch (e) { console.error('Palette extraction failed', e); }
      }
    } else { setDominantColors([]); }
  }, [selectedPhoto])

  const [uploadFiles, setUploadFiles] = useState<{ id: string, file: File }[]>([])
  const [uploadViewMode, setUploadViewMode] = useState<'list' | 'grid'>('list')
  const [selectedUploadIds, setSelectedUploadIds] = useState<Set<string>>(new Set())
  const [previewUploadItem, setPreviewUploadItem] = useState<{ id: string, file: File } | null>(null)
  const [previewUploadUrl, setPreviewUploadUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadCategories, setUploadCategories] = useState<string[]>([])
  const [categoryInput, setCategoryInput] = useState('')
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false)
  const categoryContainerRef = useRef<HTMLDivElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const [uploadError, setUploadError] = useState('')

  const [settings, setSettings] = useState<AdminSettingsDto | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState('')

  const [uploadSource, setUploadSource] = useState('')
  const [uploadPath, setUploadPath] = useState('')

  // --- Comments State ---
  const [comments, setComments] = useState<CommentDto[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentTab, setCommentTab] = useState<'manage' | 'config'>('manage')

  const resolvedCdnDomain = useMemo(() => settings?.cdn_domain?.trim() || undefined, [settings?.cdn_domain])

  const filteredPhotos = useMemo(() => {
    return photos.filter(p => p.title.toLowerCase().includes(photoSearch.toLowerCase()) || p.category.toLowerCase().includes(photoSearch.toLowerCase()))
  }, [photos, photoSearch])

  // ... (existing helper functions)

  const refreshComments = async () => {
    if (!token) return
    setCommentsLoading(true)
    try {
      const data = await getComments(token)
      setComments(data)
    } catch (err) {
      // If API is not implemented yet, just clear comments or show error
      console.error(err)
      // setComments([]) // specific error handling if needed
    } finally {
      setCommentsLoading(false)
    }
  }

  const handleUpdateCommentStatus = async (id: string, status: 'approved' | 'rejected') => {
    if (!token) return
    try {
      await updateCommentStatus(token, id, status)
      await refreshComments()
      notify(t('admin.notify_success'))
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) { handleUnauthorized(); return }
      notify(err instanceof Error ? err.message : t('common.error'), 'error')
    }
  }

  const handleDeleteComment = async (id: string) => {
    if (!token || !window.confirm(t('common.confirm'))) return
    try {
      await deleteComment(token, id)
      await refreshComments()
      notify(t('admin.notify_success'))
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) { handleUnauthorized(); return }
      notify(err instanceof Error ? err.message : t('common.error'), 'error')
    }
  }

  useEffect(() => {
    if (activeTab === 'settings' && settingsTab === 'comments') {
      refreshComments()
    }
  }, [activeTab, settingsTab, token])

  const filteredCategories = useMemo(() => {
    return categories.filter(c => c !== '全部' && c.toLowerCase().includes(categoryInput.toLowerCase()) && !uploadCategories.includes(c))
  }, [categories, categoryInput, uploadCategories])

  const addCategory = (cat: string) => {
    const trimmed = cat.trim()
    if (trimmed && !uploadCategories.includes(trimmed)) { setUploadCategories([...uploadCategories, trimmed]); }
    setCategoryInput('')
  }

  const removeCategory = (cat: string) => { setUploadCategories(uploadCategories.filter(c => c !== cat)); }

  const handleUnauthorized = () => { logout(); router.push('/login'); }

  const refreshCategories = async () => {
    try { const data = await getCategories(); setCategories(data); if (uploadCategories.length === 0) { const first = data.find((c) => c && c !== '全部'); if (first) setUploadCategories([first]); } } catch { }
  }

  const refreshPhotos = async () => {
    setPhotosError(''); setPhotosLoading(true)
    try { const data = await getPhotos(); setPhotos(data); } catch (err) { if (err instanceof ApiUnauthorizedError) { handleUnauthorized(); return; } setPhotosError(err instanceof Error ? err.message : t('common.error')); } finally { setPhotosLoading(false); }
  }

  const refreshSettings = async () => {
    if (!token) return; setSettingsError(''); setSettingsLoading(true)
    try { const data = await getAdminSettings(token); setSettings(data); if (data.storage_provider) setUploadSource(data.storage_provider); } catch (err) { if (err instanceof ApiUnauthorizedError) { handleUnauthorized(); return; } setSettingsError(err instanceof Error ? err.message : t('common.error')); } finally { setSettingsLoading(false); }
  }

  useEffect(() => {
    refreshCategories()
    const handleClickOutside = (event: MouseEvent) => { if (categoryContainerRef.current && !categoryContainerRef.current.contains(event.target as Node)) { setIsCategoryDropdownOpen(false); } }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => { if (activeTab === 'photos' || activeTab === 'logs') refreshPhotos(); if (activeTab === 'settings') refreshSettings(); }, [activeTab, token])

  const handleDelete = async (photoId: string) => {
    if (!token) return
    setDeleteConfirmDialog({ photoIds: [photoId], isBulk: false })
  }

  const confirmDelete = async () => {
    if (!deleteConfirmDialog || !token) return

    try {
      if (deleteConfirmDialog.isBulk) {
        setPhotosLoading(true)
        for (const id of deleteConfirmDialog.photoIds) {
          await deletePhoto({ token, id, deleteFromStorage })
        }
        setSelectedPhotoIds(new Set())
      } else {
        await deletePhoto({ token, id: deleteConfirmDialog.photoIds[0], deleteFromStorage })
      }
      await refreshPhotos()
      notify(t('admin.notify_photo_deleted'))
      setDeleteConfirmDialog(null)
      setDeleteFromStorage(true)
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) { handleUnauthorized(); return }
      notify(err instanceof Error ? err.message : t('common.error'), 'error')
    } finally {
      setPhotosLoading(false)
    }
  }

  const handleToggleFeatured = async (photo: PhotoDto) => {
    if (!token) return
    try { 
      await updatePhoto({ token, id: photo.id, patch: { isFeatured: !photo.isFeatured } }); 
      await refreshPhotos(); 
      notify(photo.isFeatured ? t('admin.notify_featured_removed') : t('admin.notify_featured_added'));
    } catch (err) { 
      if (err instanceof ApiUnauthorizedError) { handleUnauthorized(); return; } 
      notify(err instanceof Error ? err.message : t('common.error'), 'error'); 
    }
  }

  const handleUpload = async () => {
    if (!token) return; if (uploadFiles.length === 0) { setUploadError(t('admin.select_files')); return; }
    if (uploadFiles.length === 1 && !uploadTitle.trim()) { setUploadError(t('admin.photo_title')); return; }
    if (uploadCategories.length === 0) { setUploadError(t('admin.categories')); return; }
    setUploadError(''); setUploading(true); setUploadProgress({ current: 0, total: uploadFiles.length })
    try {
      for (let i = 0; i < uploadFiles.length; i++) {
        setUploadProgress(prev => ({ ...prev, current: i + 1 })); const { file } = uploadFiles[i]
        const title = uploadFiles.length === 1 ? uploadTitle.trim() : file.name.replace(/\.[^/.]+$/, "")
        await uploadPhoto({ token, file: file, title: title, category: uploadCategories, storage_provider: uploadSource || undefined, storage_path: uploadPath.trim() || undefined, })
      }
      const count = uploadFiles.length
      setUploadFiles([]); setSelectedUploadIds(new Set()); setUploadTitle(''); setUploadCategories([]); setActiveTab('photos'); 
      await refreshPhotos();
      notify(`${count} ${t('admin.notify_upload_success')}`);
    } catch (err) { 
      if (err instanceof ApiUnauthorizedError) { handleUnauthorized(); return; } 
      setUploadError(err instanceof Error ? err.message : t('common.error')); 
      notify("Upload failed", 'error');
    } finally { setUploading(false); setUploadProgress({ current: 0, total: 0 }); }
  }

  const handleSaveSettings = async () => {
    if (!token || !settings) return; setSettingsError(''); setSettingsSaving(true)
    try { 
      const updated = await updateAdminSettings(token, settings); 
      setSettings(updated); 
      await refreshGlobalSettings(); 
      notify(t('admin.notify_config_saved'));
    } catch (err) { 
      if (err instanceof ApiUnauthorizedError) { handleUnauthorized(); return; } 
      setSettingsError(err instanceof Error ? err.message : t('common.error')); 
      notify("Failed to save settings", 'error');
    } finally { setSettingsSaving(false); }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'))
    if (files.length > 0) { const newFiles = files.map(f => ({ id: crypto.randomUUID(), file: f })); setUploadFiles(prev => [...prev, ...newFiles]); }
  }

  const handleRemoveUpload = React.useCallback((id: string) => {
    setUploadFiles(prev => prev.filter(item => item.id !== id)); setSelectedUploadIds(prev => { const next = new Set(prev); next.delete(id); return next; })
  }, [])

  const handleSelectUploadToggle = React.useCallback((id: string) => { setSelectedUploadIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }) }, [])
  const handleSelectAllUploads = () => { if (selectedUploadIds.size === uploadFiles.length) { setSelectedUploadIds(new Set()); } else { setSelectedUploadIds(new Set(uploadFiles.map(f => f.id))); } }
  const handleBulkRemoveUploads = () => { if (selectedUploadIds.size === 0) return; setUploadFiles(prev => prev.filter(item => !selectedUploadIds.has(item.id))); setSelectedUploadIds(new Set()); }

  const handlePreviewUpload = React.useCallback((id: string) => { const item = uploadFiles.find(f => f.id === id); if (item) setPreviewUploadItem(item); }, [uploadFiles])
  useEffect(() => { if (previewUploadItem) { const url = URL.createObjectURL(previewUploadItem.file); setPreviewUploadUrl(url); return () => URL.revokeObjectURL(url); } else { setPreviewUploadUrl(null); } }, [previewUploadItem])
  const navigatePreviewUpload = React.useCallback((direction: 'prev' | 'next') => { if (!previewUploadItem) return; const idx = uploadFiles.findIndex(f => f.id === previewUploadItem.id); if (idx === -1) return; let nextIdx = direction === 'next' ? idx + 1 : idx - 1; if (nextIdx < 0) nextIdx = uploadFiles.length - 1; if (nextIdx >= uploadFiles.length) nextIdx = 0; setPreviewUploadItem(uploadFiles[nextIdx]); }, [previewUploadItem, uploadFiles])
  useEffect(() => { const handleKeyDown = (e: KeyboardEvent) => { if (!previewUploadItem) return; if (e.key === 'ArrowLeft') navigatePreviewUpload('prev'); if (e.key === 'ArrowRight') navigatePreviewUpload('next'); if (e.key === 'Escape') setPreviewUploadItem(null); }; window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown); }, [previewUploadItem, navigatePreviewUpload])

  const handleSelectPhotoToggle = (id: string) => { setSelectedPhotoIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }) }
  const handleSelectAllPhotos = () => { if (selectedPhotoIds.size === filteredPhotos.length) { setSelectedPhotoIds(new Set()); } else { setSelectedPhotoIds(new Set(filteredPhotos.map(p => p.id))); } }
  const handleBulkDeletePhotos = async () => {
    if (selectedPhotoIds.size === 0 || !token) return
    setDeleteConfirmDialog({ photoIds: Array.from(selectedPhotoIds), isBulk: true })
  }

  // --- Photo Log Handlers ---
  const handleCreateLog = () => { setCurrentLog({ id: crypto.randomUUID(), title: '', content: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'draft' }); setLogEditMode('editor'); setLogPreviewActive(false); }
  const handleEditLog = (log: PhotoLog) => { setCurrentLog({ ...log }); setLogEditMode('editor'); setLogPreviewActive(false); }
  const handleDeleteLog = (id: string) => { if (!window.confirm(t('common.confirm') + '?')) return; setPhotoLogs(prev => prev.filter(l => l.id !== id)); notify(t('admin.notify_log_deleted')); }
  const handleSaveLog = () => { 
    if (!currentLog) return; 
    setPhotoLogs(prev => { 
      const idx = prev.findIndex(l => l.id === currentLog.id); 
      if (idx !== -1) { const next = [...prev]; next[idx] = { ...currentLog, updatedAt: new Date().toISOString() }; return next; } 
      return [...prev, { ...currentLog, updatedAt: new Date().toISOString() }]; 
    }); 
    setLogEditMode('list'); 
    setCurrentLog(null); 
    notify(t('admin.notify_log_saved'));
  }
  const insertPhotoIntoLog = (photo: PhotoDto) => { 
    const markdown = `\n![${photo.title}](${resolveAssetUrl(photo.url)})\n`; 
    if (currentLog) setCurrentLog({ ...currentLog, content: currentLog.content + markdown }); 
    setIsLogInsertingPhoto(false); 
    notify(t('admin.notify_photo_inserted'), 'info');
  }

  const sidebarItems = [
    { id: 'photos', label: t('admin.library'), icon: ImageIcon },
    { id: 'upload', label: t('admin.upload'), icon: Upload },
    { id: 'logs', label: t('admin.logs'), icon: BookText },
    { id: 'settings', label: t('admin.config'), icon: Settings },
  ]

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Toast notifications={notifications} remove={(id) => setNotifications(prev => prev.filter(n => n.id !== id))} />
      
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-background border-r border-border transform transition-transform duration-300 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="p-8 border-b border-border"><h2 className="font-serif text-2xl font-bold tracking-tight">{siteTitle}</h2><p className="font-sans text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{t('admin.console')}</p></div>
          <nav className="flex-1 p-6 space-y-2">
            {sidebarItems.map(item => (
              <button key={item.id} onClick={() => { setActiveTab(item.id); setIsMobileMenuOpen(false); if (item.id === 'logs') setLogEditMode('list'); }} className={`w-full flex items-center space-x-3 px-4 py-3 text-xs font-bold tracking-widest uppercase transition-all ${activeTab === item.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><item.icon className="w-4 h-4" /><span>{item.label}</span></button>
            ))}
          </nav>
          <div className="p-6 border-t border-border">
            <div className="flex items-center space-x-3 mb-6 px-2"><div className="w-8 h-8 bg-primary flex items-center justify-center text-xs text-primary-foreground font-bold">{user?.username?.substring(0, 1).toUpperCase() || 'A'}</div><div className="flex-1 min-w-0"><p className="text-xs font-bold truncate uppercase tracking-wider">{user?.username || 'ADMIN'}</p><p className="text-[10px] text-muted-foreground truncate uppercase tracking-widest">{t('admin.super_user')}</p></div></div>
            <button onClick={() => { logout(); router.push('/'); }} className="w-full flex items-center space-x-3 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-destructive hover:bg-destructive/10 transition-colors"><LogOut className="w-4 h-4" /><span>{t('nav.logout')}</span></button>
          </div>
        </div>
      </aside>

      <main className="flex-1 md:ml-64 flex flex-col h-screen overflow-hidden">
        <header className="flex-shrink-0 flex items-center justify-between px-8 py-4 bg-background/95 backdrop-blur-xl border-b border-border">
          <div className="flex items-center"><button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 mr-4 md:hidden hover:bg-muted"><Menu className="w-5 h-5" /></button>
            <h1 className="font-serif text-2xl font-light tracking-tight uppercase">
              {activeTab === 'photos' && t('admin.library')}
              {activeTab === 'upload' && t('admin.upload')}
              {activeTab === 'logs' && t('admin.logs')}
              {activeTab === 'settings' && t('admin.config')}
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            {activeTab === 'photos' && <div className="relative hidden sm:block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="text" placeholder={t('common.search')} value={photoSearch} onChange={(e) => setPhotoSearch(e.target.value)} className="pl-10 pr-4 py-2 bg-muted border-none text-xs font-mono focus:ring-1 focus:ring-primary w-64 transition-all placeholder:text-muted-foreground/50" /></div>}
            <button onClick={() => router.push('/gallery')} className="flex items-center gap-2 px-3 py-1.5 border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all text-xs font-bold uppercase tracking-widest"><span>{t('admin.view_site')}</span><ExternalLink className="w-3 h-3" /></button>
          </div>
        </header>

        <div className="p-8 flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === 'photos' && (
            <div className="space-y-8">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center space-x-6">
                  <div className="flex items-center gap-2"><input type="checkbox" checked={filteredPhotos.length > 0 && selectedPhotoIds.size === filteredPhotos.length} onChange={handleSelectAllPhotos} className="w-4 h-4 accent-primary cursor-pointer" /><span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{selectedPhotoIds.size > 0 ? `${selectedPhotoIds.size} Selected` : `${filteredPhotos.length} Items`}</span></div>
                  {selectedPhotoIds.size > 0 && (<div className="flex items-center gap-4"><div className="h-4 w-[1px] bg-border"></div><button onClick={handleBulkDeletePhotos} className="text-destructive hover:opacity-80 transition-opacity flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest"><Trash2 className="w-3.5 h-3.5" /> Delete</button></div>)}
                  <div className="h-4 w-[1px] bg-border mx-2"></div><button className="hover:text-primary transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground" onClick={refreshPhotos}><Globe className="w-3 h-3" /> {t('common.refresh')}</button>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex bg-muted p-1 border border-border"><button onClick={() => setPhotosViewMode('grid')} className={`p-1.5 transition-all ${photosViewMode === 'grid' ? 'bg-background text-primary' : 'text-muted-foreground hover:text-foreground'}`}><LayoutGrid className="w-3.5 h-3.5" /></button><button onClick={() => setPhotosViewMode('list')} className={`p-1.5 transition-all ${photosViewMode === 'list' ? 'bg-background text-primary' : 'text-muted-foreground hover:text-foreground'}`}><ListIcon className="w-3.5 h-3.5" /></button></div>
                  <button onClick={() => setActiveTab('upload')} className="flex items-center px-4 py-2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all"><Plus className="w-4 h-4 mr-2" />{t('admin.add_new')}</button>
                </div>
              </div>
              {photosError && <div className="p-4 border border-destructive text-destructive text-xs tracking-widest uppercase flex items-center space-x-2"><X className="w-4 h-4" /><span>{photosError}</span></div>}
              {photosLoading ? <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4">{[...Array(12)].map((_, i) => <div key={i} className="aspect-[4/5] bg-muted animate-pulse" />)}</div> : (
                <div className={photosViewMode === 'grid' ? "grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4" : "flex flex-col border border-border"}>
                  {filteredPhotos.map((photo) => (
                    photosViewMode === 'grid' ? (
                      <div key={photo.id} className={`group relative cursor-pointer bg-muted border ${selectedPhotoIds.has(photo.id) ? 'border-primary ring-1 ring-primary' : 'border-transparent'}`} onClick={() => setSelectedPhoto(photo)}>
                        <div className="aspect-[4/5] overflow-hidden"><img src={resolveAssetUrl(photo.thumbnailUrl || photo.url, resolvedCdnDomain)} alt={photo.title} className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 grayscale group-hover:grayscale-0" loading="lazy" /></div>
                        <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        <div className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedPhotoIds.has(photo.id)} onChange={() => handleSelectPhotoToggle(photo.id)} className="w-4 h-4 accent-primary cursor-pointer border-white" /></div>
                        <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"><button onClick={(e) => { e.stopPropagation(); handleToggleFeatured(photo); }} className={`p-2 bg-background/90 backdrop-blur-sm text-foreground hover:text-amber-500 transition-colors ${photo.isFeatured ? 'text-amber-500' : ''}`}><Star className={`w-4 h-4 ${photo.isFeatured ? 'fill-current' : ''}`} /></button><button onClick={(e) => { e.stopPropagation(); handleDelete(photo.id); }} className="p-2 bg-background/90 backdrop-blur-sm text-foreground hover:text-destructive transition-colors"><Trash2 className="w-4 h-4" /></button></div>
                        <div className="absolute bottom-0 left-0 w-full p-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 pointer-events-none"><div className="bg-background/90 p-2 backdrop-blur-sm"><h3 className="text-[10px] font-bold uppercase tracking-widest truncate text-foreground">{photo.title}</h3><div className="flex gap-1 mt-1">{photo.category.split(',').slice(0, 1).map(cat => <span key={cat} className="text-[8px] font-mono text-muted-foreground uppercase">{cat}</span>)}</div></div></div>
                        {photo.isFeatured && <div className="absolute top-2 left-8 px-1.5 py-0.5 bg-amber-500 text-white text-[8px] font-black uppercase tracking-widest z-10">{t('admin.feat')}</div>}
                      </div>
                    ) : (
                      <div key={photo.id} className={`flex items-center gap-4 p-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer ${selectedPhotoIds.has(photo.id) ? 'bg-primary/5' : ''}`} onClick={() => setSelectedPhoto(photo)}><div className="flex items-center" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedPhotoIds.has(photo.id)} onChange={() => handleSelectPhotoToggle(photo.id)} className="w-4 h-4 accent-primary cursor-pointer" /></div><div className="w-12 h-12 flex-shrink-0 bg-muted border border-border overflow-hidden"><img src={resolveAssetUrl(photo.thumbnailUrl || photo.url, resolvedCdnDomain)} alt="" className="w-full h-full object-cover grayscale" /></div><div className="flex-1 min-w-0"><p className="text-xs font-bold uppercase tracking-widest truncate text-foreground">{photo.title}</p><p className="text-[10px] font-mono text-muted-foreground uppercase">{photo.category}</p></div><div className="hidden md:block text-[10px] font-mono text-muted-foreground w-32">{photo.width} × {photo.height}</div><div className="flex items-center gap-2"><button onClick={(e) => { e.stopPropagation(); handleToggleFeatured(photo); }} className={`p-2 hover:bg-muted transition-colors ${photo.isFeatured ? 'text-amber-500' : 'text-muted-foreground'}`}><Star className={`w-4 h-4 ${photo.isFeatured ? 'fill-current' : ''}`} /></button><button onClick={(e) => { e.stopPropagation(); handleDelete(photo.id); }} className="p-2 text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"><Trash2 className="w-4 h-4" /></button></div></div>
                    )
                  ))}
                  {filteredPhotos.length === 0 && <div className="col-span-full py-24 flex flex-col items-center justify-center text-muted-foreground"><ImageIcon className="w-12 h-12 mb-4 opacity-10" /><p className="text-xs font-bold uppercase tracking-widest">{t('admin.no_photos')}</p></div>}
                </div>
              )}
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-4 space-y-8">
                <div className="border border-border p-8 space-y-8 bg-card/50">
                  <h3 className="font-serif text-xl font-light uppercase tracking-tight flex items-center gap-2"><Upload className="w-5 h-5 text-primary" />{t('admin.upload_params')}</h3>
                  <div className="space-y-6">
                    <div><label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">{t('admin.photo_title')}</label><input type="text" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} disabled={uploadFiles.length > 1} className="w-full p-3 bg-background border-b border-border focus:border-primary outline-none text-sm transition-colors rounded-none placeholder:text-muted-foreground/30" placeholder={uploadFiles.length > 1 ? t('admin.title_hint_multi') : t('admin.title_hint_single')} /></div>
                    <div ref={categoryContainerRef} className="relative"><label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">{t('admin.categories')}</label><div className="min-h-12 p-2 bg-background border-b border-border flex flex-wrap gap-2 cursor-text items-center transition-colors focus-within:border-primary" onClick={() => { setIsCategoryDropdownOpen(true); categoryContainerRef.current?.querySelector('input')?.focus() }}>{uploadCategories.map(cat => (<span key={cat} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider">{cat}<button onClick={(e) => { e.stopPropagation(); removeCategory(cat); }} className="hover:text-primary/70"><X className="w-3 h-3" /></button></span>))}<input type="text" value={categoryInput} onChange={(e) => { setCategoryInput(e.target.value); setIsCategoryDropdownOpen(true); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (categoryInput.trim()) addCategory(categoryInput); } else if (e.key === 'Backspace' && !categoryInput && uploadCategories.length > 0) removeCategory(uploadCategories[uploadCategories.length - 1]); }} className="flex-1 min-w-[80px] outline-none bg-transparent text-sm font-mono" placeholder={uploadCategories.length === 0 ? t('admin.search_create') : ""} /></div>{isCategoryDropdownOpen && (<div className="absolute z-10 w-full mt-1 bg-background border border-border shadow-2xl max-h-48 overflow-y-auto">{filteredCategories.length > 0 ? (filteredCategories.map(cat => (<button key={cat} onClick={(e) => { e.stopPropagation(); addCategory(cat); }} className="w-full text-left px-4 py-3 text-xs font-bold uppercase tracking-wider hover:bg-primary hover:text-primary-foreground flex items-center justify-between group transition-colors"><span>{cat}</span><Check className="w-3 h-3 opacity-0 group-hover:opacity-100" /></button>))) : categoryInput.trim() ? (<button onClick={(e) => { e.stopPropagation(); addCategory(categoryInput); }} className="w-full text-left px-4 py-3 text-xs hover:bg-muted">Create <span className="font-bold text-primary">&quot;{categoryInput}&quot;</span></button>) : (<div className="px-4 py-3 text-center text-[10px] uppercase text-muted-foreground">No matches</div>)}</div>)}</div>
                    <div className="space-y-6"><div><label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">{t('admin.storage_provider')}</label><select value={uploadSource} onChange={(e) => setUploadSource(e.target.value)} className="w-full p-3 bg-background border-b border-border focus:border-primary outline-none text-xs font-bold uppercase tracking-wider"><option value="local">Local Storage</option><option value="r2">Cloudflare R2</option><option value="github">GitHub</option></select></div><div><label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">{t('admin.path_prefix')}</label><input type="text" value={uploadPath} onChange={(e) => setUploadPath(e.target.value)} className="w-full p-3 bg-background border-b border-border focus:border-primary outline-none text-sm font-mono transition-colors rounded-none placeholder:text-muted-foreground/30" placeholder="e.g., 2025/vacation" /></div></div>
                  </div>
                  <div className="pt-4"><button onClick={handleUpload} disabled={uploading || uploadFiles.length === 0} className="w-full py-4 bg-foreground text-background text-xs font-bold uppercase tracking-[0.2em] hover:bg-primary hover:text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2">{uploading ? <><Loader2 className="w-4 h-4 animate-spin" /><span>{t('admin.uploading')} ({uploadProgress.current}/{uploadProgress.total})</span></> : <><Save className="w-4 h-4" /><span>{t('admin.start_upload')}</span></>}</button>{uploadError && <p className="mt-4 text-[10px] text-destructive text-center font-bold uppercase tracking-widest">{uploadError}</p>}</div>
                </div>
              </div>
              <div className="lg:col-span-8 flex flex-col"><div onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} className={`h-[600px] border border-dashed transition-all flex flex-col relative ${isDragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'}`}>{uploadFiles.length > 0 ? (<div className="flex-1 flex flex-col p-6 overflow-hidden"><div className="flex items-center justify-between mb-4 px-2"><div className="flex items-center gap-4"><div className="flex items-center gap-2 mr-2"><input type="checkbox" checked={uploadFiles.length > 0 && selectedUploadIds.size === uploadFiles.length} onChange={handleSelectAllUploads} disabled={uploading || uploadFiles.length === 0} className="w-4 h-4 accent-primary cursor-pointer" /><span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{selectedUploadIds.size > 0 ? `${selectedUploadIds.size} Selected` : `${uploadFiles.length} ${t('admin.items')}`}</span></div>{selectedUploadIds.size > 0 && !uploading && (<button onClick={handleBulkRemoveUploads} className="p-1.5 text-destructive hover:bg-destructive/10 transition-colors rounded" title="Delete Selected"><Trash2 className="w-4 h-4" /></button>)}</div><div className="flex items-center gap-4"><div className="flex bg-muted p-1 border border-border"><button onClick={() => setUploadViewMode('list')} className={`p-1.5 transition-all ${uploadViewMode === 'list' ? 'bg-background text-primary' : 'text-muted-foreground hover:text-foreground'}`}><ListIcon className="w-3.5 h-3.5" /></button><button onClick={() => setUploadViewMode('grid')} className={`p-1.5 transition-all ${uploadViewMode === 'grid' ? 'bg-background text-primary' : 'text-muted-foreground hover:text-foreground'}`}><LayoutGrid className="w-3.5 h-3.5" /></button></div>{!uploading && (<><button onClick={() => setUploadFiles([])} className="flex items-center gap-2 text-destructive hover:opacity-80 transition-opacity"><Trash2 className="w-3.5 h-3.5" /><span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">Clear</span></button><button onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.onchange = (e) => { const files = Array.from((e.target as HTMLInputElement).files ?? []); const newFiles = files.map(f => ({ id: crypto.randomUUID(), file: f })); setUploadFiles(prev => [...prev, ...newFiles]) }; input.click(); }} className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity"><Plus className="w-4 h-4" /><span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">{t('admin.add_more')}</span></button></>)}</div></div><div className="flex-1 overflow-y-auto pr-2 custom-scrollbar"><div className={uploadViewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3" : "flex flex-col"}>{uploadFiles.map((item, idx) => (<UploadFileItem key={item.id} file={item.file} id={item.id} t={t} uploading={uploading} isCurrent={uploading && uploadProgress.current === idx + 1} isUploaded={uploading && uploadProgress.current > idx + 1} viewMode={uploadViewMode} selected={selectedUploadIds.has(item.id)} onSelect={handleSelectUploadToggle} onRemove={handleRemoveUpload} onPreview={handlePreviewUpload} />))}</div></div></div>) : (<div className="flex-1 flex flex-col items-center justify-center p-12 text-center"><div className={`p-8 mb-6 transition-transform duration-500 ${isDragging ? 'scale-110' : ''}`}><Upload className={`w-12 h-12 stroke-1 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} /></div><h4 className="font-serif text-2xl mb-2">{t('admin.drop_here')}</h4><p className="text-xs text-muted-foreground uppercase tracking-widest mb-8">{t('admin.support_types')}</p><button onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.onchange = (e) => { const files = Array.from((e.target as HTMLInputElement).files ?? []); const newFiles = files.map(f => ({ id: crypto.randomUUID(), file: f })); setUploadFiles(prev => [...prev, ...newFiles]) }; input.click(); }} className="px-8 py-3 bg-background border border-foreground text-foreground text-xs font-bold uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors">{t('admin.select_files')}</button></div>)}{uploading && (<div className="p-6 bg-background border-t border-border"><div className="flex justify-between text-[10px] font-bold uppercase tracking-widest mb-3"><span className="flex items-center space-x-2"><Loader2 className="w-3 h-3 animate-spin text-primary" /><span>{t('admin.processing')}</span></span><span className="font-mono">{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span></div><div className="w-full h-1 bg-muted overflow-hidden"><motion.div className="h-full bg-primary" initial={{ width: 0 }} animate={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }} /></div><div className="mt-2 text-right"><span className="text-[9px] font-bold text-muted-foreground tracking-tighter">{uploadProgress.current} / {uploadProgress.total}</span></div></div>)}</div></div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="h-full flex flex-col gap-6 overflow-hidden">
              {logEditMode === 'list' ? (
                <div className="space-y-8 flex-1 flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border pb-4 flex-shrink-0">
                    <div className="flex items-center gap-4"><BookText className="w-6 h-6 text-primary" /><h3 className="font-serif text-2xl uppercase tracking-tight">{t('admin.logs')}</h3></div>
                    <button onClick={handleCreateLog} className="flex items-center px-6 py-2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all"><Plus className="w-4 h-4 mr-2" />{t('admin.new_log')}</button>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 gap-4">
                      {photoLogs.map(log => (
                        <div key={log.id} className="flex items-center justify-between p-6 border border-border hover:border-primary transition-all group">
                          <div className="flex-1 min-w-0" onClick={() => handleEditLog(log)} style={{ cursor: 'pointer' }}>
                            <div className="flex items-center gap-3 mb-1">
                              <h4 className="font-serif text-xl group-hover:text-primary transition-colors">{log.title || t('admin.untitled')}</h4>
                              <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 border ${log.status === 'published' ? 'border-primary text-primary' : 'border-muted-foreground text-muted-foreground'}`}>{log.status}</span>
                            </div>
                            <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono uppercase">
                              <span className="flex items-center gap-1"><History className="w-3 h-3" /> {new Date(log.updatedAt).toLocaleDateString()}</span>
                              <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {log.content.length} {t('admin.characters')}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleEditLog(log)} className="p-2 text-muted-foreground hover:text-primary transition-colors"><Edit3 className="w-4 h-4" /></button>
                            <button onClick={() => handleDeleteLog(log.id)} className="p-2 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                      ))}
                      {photoLogs.length === 0 && <div className="py-24 text-center border border-dashed border-border"><BookText className="w-12 h-12 mx-auto mb-4 opacity-10" /><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{t('admin.no_logs')}</p></div>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border pb-4 flex-shrink-0">
                    <button onClick={() => setLogEditMode('list')} className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest hover:text-primary transition-colors"><ChevronLeft className="w-4 h-4" /> {t('admin.back_list')}</button>
                    <div className="flex items-center gap-4">
                      <div className="flex bg-muted p-1 border border-border">
                        <button onClick={() => setLogPreviewActive(false)} className={`p-1.5 transition-all text-[10px] font-black uppercase px-3 ${!logPreviewActive ? 'bg-background text-primary' : 'text-muted-foreground'}`}>{t('admin.edit_log')}</button>
                        <button onClick={() => setLogPreviewActive(true)} className={`p-1.5 transition-all text-[10px] font-black uppercase px-3 ${logPreviewActive ? 'bg-background text-primary' : 'text-muted-foreground'}`}>{t('admin.preview')}</button>
                      </div>
                      <button onClick={handleSaveLog} className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all"><Save className="w-4 h-4" /><span>{t('admin.save')}</span></button>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col gap-4 overflow-hidden relative">
                    {logPreviewActive ? (
                      <div className="flex-1 overflow-y-auto custom-scrollbar border border-border bg-background p-12 prose prose-invert max-w-none prose-gold prose-serif">
                        <h1 className="font-serif text-5xl mb-12 border-b border-border pb-6">{currentLog?.title || t('admin.untitled')}</h1>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentLog?.content || ""}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                        <input type="text" value={currentLog?.title || ''} onChange={(e) => setCurrentLog(prev => ({ ...prev!, title: e.target.value }))} placeholder={t('admin.log_title')} className="w-full p-6 bg-transparent border border-border focus:border-primary outline-none text-2xl font-serif rounded-none" />
                        <div className="flex-1 relative border border-border bg-card/30">
                          <textarea value={currentLog?.content || ''} onChange={(e) => setCurrentLog(prev => ({ ...prev!, content: e.target.value }))} placeholder={t('admin.log_content')} className="w-full h-full p-8 bg-transparent outline-none resize-none font-mono text-sm leading-relaxed custom-scrollbar" />
                          <button onClick={() => setIsLogInsertingPhoto(true)} className="absolute bottom-6 right-6 p-4 bg-background border border-border hover:border-primary text-primary transition-all shadow-2xl z-10" title={t('admin.associate_photos')}><ImageIcon className="w-6 h-6" /></button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-[1920px]">
              <div className="flex flex-col md:flex-row gap-12">
                <aside className="w-full md:w-48 space-y-1"><div className="mb-6 pb-2 border-b border-border"><h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">{t('admin.config')}</h4></div>{[{ id: 'site', label: t('admin.general') }, { id: 'categories', label: t('admin.taxonomy') }, { id: 'storage', label: t('admin.engine') }, { id: 'comments', label: t('admin.comments') }].map(tab => (<button key={tab.id} onClick={() => setSettingsTab(tab.id)} className={`w-full flex items-center justify-between px-2 py-3 text-xs font-bold uppercase tracking-widest transition-all border-l-2 ${settingsTab === tab.id ? 'border-primary text-primary pl-4' : 'border-transparent text-muted-foreground hover:text-foreground pl-2'}`}><span>{tab.label}</span></button>))}</aside>
                <div className="flex-1 min-h-[500px] flex flex-col">{settingsError && <div className="mb-8 p-4 border border-destructive text-destructive text-xs tracking-widest uppercase flex items-center space-x-2"><X className="w-4 h-4" /><span>{settingsError}</span></div>}{settingsLoading || !settings ? <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs font-mono uppercase">{t('common.loading')}</div> : (<div className="flex-1 space-y-12">{settingsTab === 'site' && (<div className="max-w-2xl space-y-8"><div className="pb-4 border-b border-border"><h3 className="font-serif text-2xl">{t('admin.general')}</h3></div><div className="space-y-6"><div className="space-y-2"><label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t('admin.site_title')}</label><input type="text" value={settings.site_title} onChange={(e) => setSettings({ ...settings, site_title: e.target.value })} className="w-full p-4 bg-transparent border border-border focus:border-primary outline-none text-sm transition-colors rounded-none" /></div><div className="space-y-2"><label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t('admin.cdn_host')}</label><input type="text" value={settings.cdn_domain} onChange={(e) => setSettings({ ...settings, cdn_domain: e.target.value })} placeholder="https://cdn.example.com" className="w-full p-4 bg-transparent border border-border focus:border-primary outline-none text-sm transition-colors rounded-none" /><p className="text-[10px] text-muted-foreground font-mono">Leave empty to use API host.</p></div></div></div>)}{settingsTab === 'categories' && (<div className="space-y-8"><div className="pb-4 border-b border-border"><h3 className="font-serif text-2xl">{t('admin.taxonomy')}</h3></div><div className="flex flex-wrap gap-3">{categories.map(cat => (<div key={cat} className="flex items-center space-x-2 px-4 py-2 bg-muted border border-border text-xs font-bold uppercase tracking-wider group"><span>{cat}</span>{cat !== '全部' && <button className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"><X className="w-3.5 h-3.5" /></button>}</div>))}<button className="flex items-center space-x-2 px-4 py-2 border border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary transition-all text-xs font-bold uppercase tracking-wider"><Plus className="w-3 h-3" /><span>{t('admin.add_new')}</span></button></div></div>)}{settingsTab === 'storage' && (<div className="max-w-3xl space-y-8"><div className="pb-4 border-b border-border"><h3 className="font-serif text-2xl">{t('admin.engine')}</h3></div><div className="space-y-8"><div className="space-y-2"><label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t('admin.active_provider')}</label><div className="flex gap-4">{['local', 'r2', 'github'].map(p => (<button key={p} onClick={() => setSettings({ ...settings, storage_provider: p })} className={`px-6 py-3 text-xs font-bold uppercase tracking-widest border transition-all ${settings.storage_provider === p ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'}`}>{p}</button>))}</div></div>{settings.storage_provider === 'r2' && (<div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 border border-border bg-muted/20"><div className="md:col-span-2 space-y-2"><label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Endpoint</label><input type="text" value={settings.r2_endpoint ?? ''} onChange={(e) => setSettings({ ...settings, r2_endpoint: e.target.value })} className="w-full p-3 bg-background border border-border focus:border-primary outline-none text-xs font-mono" /></div><div className="space-y-2"><label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Access Key ID</label><input type="text" value={settings.r2_access_key_id ?? ''} onChange={(e) => setSettings({ ...settings, r2_access_key_id: e.target.value })} className="w-full p-3 bg-background border border-border focus:border-primary outline-none text-xs font-mono" /></div><div className="space-y-2"><label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Secret Access Key</label><input type="password" value={settings.r2_secret_access_key ?? ''} onChange={(e) => setSettings({ ...settings, r2_secret_access_key: e.target.value })} className="w-full p-3 bg-background border border-border focus:border-primary outline-none text-xs font-mono" /></div><div className="md:col-span-2 space-y-2"><label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Bucket</label><input type="text" value={settings.r2_bucket ?? ''} onChange={(e) => setSettings({ ...settings, r2_bucket: e.target.value })} className="w-full p-3 bg-background border border-border focus:border-primary outline-none text-xs font-mono" /></div></div>)}{settings.storage_provider === 'github' && (<div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 border border-border bg-muted/20"><div className="md:col-span-2 space-y-2"><label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Personal Access Token</label><input type="password" value={settings.github_token ?? ''} onChange={(e) => setSettings({ ...settings, github_token: e.target.value })} className="w-full p-3 bg-background border border-border focus:border-primary outline-none text-xs font-mono" placeholder={t('admin.gh_placeholder_token')} /></div><div className="space-y-2"><div className="flex justify-between items-center"><label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Repo (owner/repo)</label></div><input type="text" value={settings.github_repo ?? ''} onChange={(e) => setSettings({ ...settings, github_repo: e.target.value })} className="w-full p-3 bg-background border border-border focus:border-primary outline-none text-xs font-mono" placeholder={t('admin.gh_placeholder_repo')} /></div><div className="space-y-2"><div className="flex justify-between items-center"><label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">{t('admin.gh_branch')}</label><button onClick={async () => { if (!settings.github_token || !settings.github_repo) { notify("Token and Repo required", "info"); return; } try { const res = await fetch(`https://api.github.com/repos/${settings.github_repo}/branches`, { headers: { 'Authorization': `token ${settings.github_token}` } }); if (!res.ok) throw new Error("Failed to fetch branches"); const data = await res.json(); const branchNames = data.map((b: any) => b.name); notify(`${t('admin.notify_gh_branches')}: ${branchNames.join(', ')}`, 'info'); } catch (e) { notify("Error fetching branches", 'error'); } }} className="text-[8px] font-bold text-primary uppercase hover:underline">{t('admin.gh_test')}</button></div><input type="text" value={settings.github_branch ?? ''} onChange={(e) => setSettings({ ...settings, github_branch: e.target.value })} className="w-full p-3 bg-background border border-border focus:border-primary outline-none text-xs font-mono" placeholder="main" /></div><div className="md:col-span-2 space-y-2"><label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">{t('admin.path_prefix')}</label><input type="text" value={settings.github_path ?? ''} onChange={(e) => setSettings({ ...settings, github_path: e.target.value })} className="w-full p-3 bg-background border border-border focus:border-primary outline-none text-xs font-mono" placeholder={t('admin.gh_placeholder_path')} /></div><div className="md:col-span-2 space-y-2"><label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Access Method (访问方式)</label><select value={settings.github_access_method ?? 'jsdelivr'} onChange={(e) => setSettings({ ...settings, github_access_method: e.target.value })} className="w-full p-3 bg-background border border-border focus:border-primary outline-none text-xs font-bold uppercase tracking-wider"><option value="raw">raw.githubusercontent.com</option><option value="jsdelivr">jsDelivr CDN (推荐)</option><option value="pages">GitHub Pages</option></select></div>{settings.github_access_method === 'pages' && (<div className="md:col-span-2 space-y-2"><label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">GitHub Pages URL</label><input type="text" value={settings.github_pages_url ?? ''} onChange={(e) => setSettings({ ...settings, github_pages_url: e.target.value })} placeholder="https://username.github.io/repo" className="w-full p-3 bg-background border border-border focus:border-primary outline-none text-xs font-mono" /></div>)}</div>)}</div></div>)}{settingsTab === 'comments' && (
                    <div className="space-y-8">
                       <div className="flex space-x-1 border-b border-border">
                          {['manage', 'config'].map((tab) => (
                            <button
                              key={tab}
                              onClick={() => setCommentTab(tab as any)}
                              className={`px-6 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
                                commentTab === tab 
                                  ? 'border-primary text-primary' 
                                  : 'border-transparent text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {t(`admin.comments_tabs_${tab}`)}
                            </button>
                          ))}
                       </div>

                       {commentTab === 'config' && (
                         <div className="max-w-2xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                           <div className="pb-4 border-b border-border">
                             <h3 className="font-serif text-2xl">{t('admin.comments_config')}</h3>
                           </div>
                           <div className="space-y-6">
                             <div className="flex items-center justify-between p-4 border border-border bg-muted/10">
                               <div>
                                 <label className="text-[10px] font-bold text-foreground uppercase tracking-widest">{t('admin.comment_moderation')}</label>
                                 <p className="text-[10px] text-muted-foreground mt-1">Require approval for new comments</p>
                               </div>
                               <input 
                                 type="checkbox" 
                                 checked={settings.comment_moderation || false} 
                                 onChange={(e) => setSettings({ ...settings, comment_moderation: e.target.checked })}
                                 className="w-5 h-5 accent-primary cursor-pointer" 
                               />
                             </div>

                             <div className="space-y-2">
                               <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t('admin.comment_provider')}</label>
                               <select 
                                 value={settings.comment_provider || 'local'} 
                                 onChange={(e) => setSettings({ ...settings, comment_provider: e.target.value })}
                                 className="w-full p-4 bg-transparent border border-border focus:border-primary outline-none text-xs font-bold uppercase tracking-wider"
                               >
                                 <option value="local">Local (Basic)</option>
                                 <option value="openai">OpenAI</option>
                                 <option value="gemini">Google Gemini</option>
                                 <option value="anthropic">Anthropic Claude</option>
                               </select>
                             </div>

                             {settings.comment_provider && settings.comment_provider !== 'local' && (
                               <div className="space-y-6 p-6 border border-border bg-muted/20">
                                 <div className="space-y-2">
                                   <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t('admin.comment_api_key')}</label>
                                   <input 
                                     type="password" 
                                     value={settings.comment_api_key || ''} 
                                     onChange={(e) => setSettings({ ...settings, comment_api_key: e.target.value })}
                                     className="w-full p-3 bg-background border border-border focus:border-primary outline-none text-sm font-mono"
                                     placeholder="sk-..." 
                                   />
                                 </div>
                                 <div className="space-y-2">
                                   <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t('admin.comment_endpoint')}</label>
                                   <input 
                                     type="text" 
                                     value={settings.comment_api_endpoint || ''} 
                                     onChange={(e) => setSettings({ ...settings, comment_api_endpoint: e.target.value })}
                                     className="w-full p-3 bg-background border border-border focus:border-primary outline-none text-sm font-mono"
                                     placeholder="https://api.openai.com/v1" 
                                   />
                                 </div>
                                 <div className="space-y-2">
                                   <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t('admin.comment_model')}</label>
                                   <input 
                                     type="text" 
                                     value={settings.comment_model || ''} 
                                     onChange={(e) => setSettings({ ...settings, comment_model: e.target.value })}
                                     className="w-full p-3 bg-background border border-border focus:border-primary outline-none text-sm font-mono"
                                     placeholder="gpt-4o, gemini-pro..." 
                                   />
                                 </div>
                               </div>
                             )}
                             
                             <div className="space-y-2">
                               <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t('admin.blocked_keywords')}</label>
                               <textarea 
                                 value={settings.blocked_keywords || ''} 
                                 onChange={(e) => setSettings({ ...settings, blocked_keywords: e.target.value })}
                                 placeholder="comma, separated, keywords"
                                 className="w-full p-4 h-32 bg-transparent border border-border focus:border-primary outline-none text-sm transition-colors rounded-none resize-none font-mono" 
                               />
                               <p className="text-[10px] text-muted-foreground font-mono">Comments containing these keywords will be automatically rejected.</p>
                             </div>
                           </div>
                         </div>
                       )}

                       {commentTab === 'manage' && (
                         <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                           <div className="pb-4 border-b border-border flex items-center justify-between">
                             <h3 className="font-serif text-2xl">{t('admin.comments_manage')}</h3>
                             <button onClick={refreshComments} className="p-2 hover:bg-muted"><Globe className="w-4 h-4" /></button>
                           </div>
                           
                           {commentsLoading ? (
                              <div className="space-y-4">
                                {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse" />)}
                              </div>
                           ) : comments.length === 0 ? (
                             <div className="py-12 text-center border border-dashed border-border">
                               <MessageSquare className="w-8 h-8 mx-auto mb-4 opacity-20" />
                               <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">No comments found</p>
                             </div>
                           ) : (
                             <div className="grid gap-4">
                               {comments.map(comment => (
                                 <div key={comment.id} className="p-6 border border-border hover:border-primary transition-all bg-card/30">
                                   <div className="flex items-start justify-between gap-4">
                                     <div className="space-y-2 flex-1">
                                       <div className="flex items-center gap-3">
                                         <span className="text-xs font-bold uppercase tracking-wider">{comment.author}</span>
                                         <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 border ${
                                           comment.status === 'approved' ? 'border-primary text-primary' : 
                                           comment.status === 'rejected' ? 'border-destructive text-destructive' : 
                                           'border-amber-500 text-amber-500'
                                         }`}>
                                           {comment.status}
                                         </span>
                                         <span className="text-[10px] text-muted-foreground font-mono">{new Date(comment.createdAt).toLocaleDateString()}</span>
                                       </div>
                                       <p className="text-sm text-foreground/80 leading-relaxed">{comment.content}</p>
                                     </div>
                                     
                                     <div className="flex items-center gap-2">
                                       {comment.status !== 'approved' && (
                                         <button 
                                           onClick={() => handleUpdateCommentStatus(comment.id, 'approved')}
                                           className="p-2 text-muted-foreground hover:text-primary transition-colors"
                                           title="Approve"
                                         >
                                           <Check className="w-4 h-4" />
                                         </button>
                                       )}
                                       {comment.status !== 'rejected' && (
                                         <button 
                                           onClick={() => handleUpdateCommentStatus(comment.id, 'rejected')}
                                           className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                                           title="Reject"
                                         >
                                           <X className="w-4 h-4" />
                                         </button>
                                       )}
                                       <button 
                                         onClick={() => handleDeleteComment(comment.id)}
                                         className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                                         title="Delete"
                                       >
                                         <Trash2 className="w-4 h-4" />
                                       </button>
                                     </div>
                                   </div>
                                 </div>
                               ))}
                             </div>
                           )}
                         </div>
                       )}
                    </div>
                  )}<div className="pt-8 border-t border-border flex justify-end"><button onClick={handleSaveSettings} disabled={settingsSaving} className="px-8 py-4 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all flex items-center space-x-2">{settingsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}<span>{t('admin.save')}</span></button></div></div>)}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* --- Modals --- */}

      {/* Upload Preview Modal */}
      <AnimatePresence>
        {previewUploadItem && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-0 md:p-8 bg-background/95 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="relative w-full h-full max-w-[1800px] bg-background border border-border flex flex-col lg:flex-row overflow-hidden shadow-2xl">
              <button onClick={() => setPreviewUploadItem(null)} className="absolute top-0 right-0 z-50 p-6 text-foreground hover:text-primary transition-colors bg-background/50 backdrop-blur-md border-b border-l border-border"><X className="w-6 h-6" /></button>
              <button onClick={(e) => { e.stopPropagation(); navigatePreviewUpload('prev'); }} className="absolute left-4 top-1/2 -translate-y-1/2 z-50 p-4 bg-background/20 hover:bg-background/50 backdrop-blur-md text-foreground transition-all"><ChevronLeft className="w-8 h-8" /></button>
              <button onClick={(e) => { e.stopPropagation(); navigatePreviewUpload('next'); }} className="absolute right-4 top-1/2 -translate-y-1/2 z-50 p-4 bg-background/20 hover:bg-background/50 backdrop-blur-md text-foreground transition-all"><ChevronRight className="w-8 h-8" /></button>
              <div className="w-full lg:w-[75%] h-full flex items-center justify-center bg-black/5 relative overflow-hidden"><div className="w-full h-full p-4 md:p-12 flex items-center justify-center">{previewUploadUrl && <img src={previewUploadUrl} alt="" className="max-w-full max-h-full object-contain shadow-2xl" />}</div></div>
              <div className="w-full lg:w-[25%] h-full flex flex-col border-l border-border bg-background overflow-y-auto">
                <div className="p-8 md:p-12 space-y-12 flex-1"><div className="space-y-4"><span className="text-[10px] font-bold tracking-[0.2em] uppercase text-primary border border-primary px-2 py-1">{t('admin.upload')}</span><h2 className="font-serif text-4xl leading-[0.9] text-foreground break-all">{previewUploadItem.file.name}</h2></div><div className="space-y-8"><div className="space-y-1"><p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">{t('gallery.size')}</p><p className="font-mono text-sm">{formatFileSize(previewUploadItem.file.size)}</p></div><div className="space-y-1"><p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">MIME TYPE</p><p className="font-mono text-sm">{previewUploadItem.file.type}</p></div></div></div>
                <div className="p-6 border-t border-border bg-muted/10"><p className="text-[10px] text-center text-muted-foreground font-mono uppercase italic">Press arrows to navigate</p></div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Archive Selection Modal for Logs */}
      <AnimatePresence>
        {isLogInsertingPhoto && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-12 bg-background/95 backdrop-blur-sm">
            <div className="w-full h-full max-w-6xl bg-background border border-border flex flex-col overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-border flex items-center justify-between"><h3 className="font-serif text-2xl uppercase tracking-tight">{t('admin.insert_photo')}</h3><button onClick={() => setIsLogInsertingPhoto(false)} className="p-2 hover:bg-muted"><X className="w-6 h-6" /></button></div>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar"><div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">{photos.map(photo => (<div key={photo.id} onClick={() => insertPhotoIntoLog(photo)} className="group relative aspect-square bg-muted cursor-pointer overflow-hidden border border-transparent hover:border-primary transition-all"><img src={resolveAssetUrl(photo.thumbnailUrl || photo.url, resolvedCdnDomain)} alt="" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" /><div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><Plus className="w-8 h-8 text-white" /></div></div>))}</div></div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Preview Modal (Archive) */}
      <AnimatePresence>
        {selectedPhoto && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-8 bg-background/95 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="relative w-full h-full max-w-[1800px] bg-background border border-border flex flex-col lg:flex-row overflow-hidden shadow-2xl">
              <button onClick={() => setSelectedPhoto(null)} className="absolute top-0 right-0 z-50 p-6 text-foreground hover:text-primary transition-colors bg-background/50 backdrop-blur-md border-b border-l border-border"><X className="w-6 h-6" /></button>
              <div className="w-full lg:w-[70%] h-full flex items-center justify-center bg-black/5 relative overflow-hidden"><div className="w-full h-full p-4 md:p-12 flex items-center justify-center"><img src={resolveAssetUrl(selectedPhoto.url, resolvedCdnDomain)} alt={selectedPhoto.title} className="max-w-full max-h-full object-contain shadow-2xl" /></div></div>
              <div className="w-full lg:w-[30%] h-full flex flex-col border-l border-border bg-background overflow-y-auto">
                <div className="p-8 md:p-12 space-y-12 flex-1">
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">{selectedPhoto.category.split(',').map(cat => (<span key={cat} className="text-[10px] font-bold tracking-[0.2em] uppercase text-primary border border-primary px-2 py-1">{cat}</span>))}{selectedPhoto.isFeatured && <span className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[10px] font-bold uppercase tracking-wider"><Star className="w-3 h-3 fill-current" /> {t('admin.feat')}</span>}</div>
                    <h2 className="font-serif text-5xl leading-[0.9] text-foreground">{selectedPhoto.title}</h2>
                  </div>
                  <div className="space-y-3"><h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{t('gallery.palette')}</h3><div className="flex gap-2">{dominantColors.length > 0 ? dominantColors.map((color, i) => (<div key={i} className="w-8 h-8 border border-border transition-all hover:scale-110" style={{ backgroundColor: color }} title={color} />)) : [...Array(5)].map((_, i) => <div key={i} className="w-8 h-8 bg-muted animate-pulse" />)}</div></div>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-8"><div className="space-y-1"><p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">{t('gallery.resolution')}</p><p className="font-mono text-sm">{selectedPhoto.width} × {selectedPhoto.height}</p></div><div className="space-y-1"><p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">{t('gallery.size')}</p><p className="font-mono text-sm">{formatFileSize(selectedPhoto.size)}</p></div><div className="space-y-1"><p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">{t('gallery.date')}</p><p className="font-mono text-sm">{new Date(selectedPhoto.createdAt).toLocaleDateString()}</p></div></div>
                  {(selectedPhoto.cameraModel || selectedPhoto.aperture || selectedPhoto.iso) ? (
                    <div className="space-y-8 pt-8 border-t border-border">
                      <div className="space-y-2"><p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase flex items-center gap-2"><Camera className="w-3 h-3" /> {t('gallery.equipment')}</p><p className="font-serif text-xl">{selectedPhoto.cameraMake} {selectedPhoto.cameraModel}</p></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 border border-border"><p className="text-[9px] font-bold tracking-[0.2em] text-muted-foreground uppercase mb-1">{t('gallery.aperture')}</p><p className="font-mono text-lg">{selectedPhoto.aperture}</p></div>
                        <div className="p-4 border border-border"><p className="text-[9px] font-bold tracking-[0.2em] text-muted-foreground uppercase mb-1">{t('gallery.shutter')}</p><p className="font-mono text-lg">{selectedPhoto.shutterSpeed}</p></div>
                        <div className="p-4 border border-border"><p className="text-[9px] font-bold tracking-[0.2em] text-muted-foreground uppercase mb-1">{t('gallery.iso')}</p><p className="font-mono text-lg">{selectedPhoto.iso}</p></div>
                        <div className="p-4 border border-border"><p className="text-[9px] font-bold tracking-[0.2em] text-muted-foreground uppercase mb-1">{t('gallery.focal')}</p><p className="font-mono text-lg">{selectedPhoto.focalLength}</p></div>
                      </div>
                      {selectedPhoto.latitude && selectedPhoto.longitude && (<button onClick={() => window.open(`https://www.google.com/maps?q=${selectedPhoto.latitude},${selectedPhoto.longitude}`, '_blank')} className="mt-4 w-full py-3 bg-muted hover:bg-muted/80 text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2"><MapPin className="w-3 h-3" /> View on Map</button>)}
                    </div>
                  ) : (<div className="pt-8 border-t border-border opacity-50"><p className="text-[10px] tracking-[0.2em] uppercase">{t('gallery.no_exif')}</p></div>)}
                </div>
                <div className="p-6 border-t border-border bg-muted/10"><button onClick={() => window.open(resolveAssetUrl(selectedPhoto.url, resolvedCdnDomain), '_blank')} className="w-full py-4 bg-foreground text-background text-xs font-bold uppercase tracking-[0.2em] hover:bg-primary hover:text-primary-foreground transition-all flex items-center justify-center gap-2"><Maximize2 className="w-4 h-4" />{t('gallery.download')}</button></div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <AnimatePresence>
        {deleteConfirmDialog && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-background/95 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-background border-2 border-border p-8 max-w-md w-full shadow-2xl">
              <h3 className="font-serif text-2xl font-light uppercase tracking-tight mb-6">
                {t('common.confirm')}
              </h3>

              <div className="mb-8 space-y-4">
                <p className="text-sm text-foreground">
                  {deleteConfirmDialog.isBulk
                    ? `${t('admin.confirm_delete_multiple')} ${deleteConfirmDialog.photoIds.length} ${t('admin.photos')}?`
                    : `${t('admin.confirm_delete_single')}?`
                  }
                </p>

                <div className="p-4 bg-muted/30 border border-border">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={deleteFromStorage}
                      onChange={(e) => setDeleteFromStorage(e.target.checked)}
                      className="w-5 h-5 mt-0.5 accent-primary cursor-pointer"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-bold uppercase tracking-wider text-foreground group-hover:text-primary transition-colors">
                        {t('admin.delete_from_storage')}
                      </span>
                      <p className="text-[10px] text-muted-foreground mt-1 font-mono leading-relaxed">
                        {t('admin.delete_from_storage_hint')}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => { setDeleteConfirmDialog(null); setDeleteFromStorage(true); }}
                  className="flex-1 px-6 py-3 border border-border text-foreground text-xs font-bold uppercase tracking-widest hover:bg-muted transition-all"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-6 py-3 bg-destructive text-destructive-foreground text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all"
                >
                  {t('common.delete')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function AdminPage() { return (<ProtectedRoute><AdminDashboard /></ProtectedRoute>) }
