'use client'

import React, { useEffect, useState, createContext, useContext, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload as UploadIcon,
  Image as ImageIcon,
  Settings,
  BookText,
  Menu,
  ExternalLink,
  LogOut,
  LucideIcon,
  Moon,
  Sun,
  Monitor,
  FolderOpen,
  Users,
} from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'
import { useSettings } from '@/contexts/SettingsContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  ApiUnauthorizedError,
  addPhotosToStory,
  batchUpdatePhotoUrls,
  checkPhotosStories,
  deletePhoto,
  getAdminSettings,
  getCategories,
  getPhotos,
  updateAdminSettings,
  updatePhoto,
  type AdminSettingsDto,
  type PhotoDto,
  type PhotoWithStories,
} from '@/lib/api'
import { Toast, type Notification } from '@/components/Toast'
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog'
import { UrlUpdateConfirmDialog } from '@/components/admin/UrlUpdateConfirmDialog'
import { PhotoDetailPanel } from '@/components/admin/PhotoDetailPanel'
import { UploadQueueProvider, useUploadQueue } from '@/contexts/UploadQueueContext'
import { UploadProgressPopup } from '@/components/admin/UploadProgressPopup'

// Admin Context for shared state
interface AdminContextType {
  token: string | null
  photos: PhotoDto[]
  categories: string[]
  settings: AdminSettingsDto | null
  setSettings: (settings: AdminSettingsDto) => void
  photosLoading: boolean
  settingsLoading: boolean
  settingsSaving: boolean
  refreshPhotos: () => Promise<void>
  refreshSettings: () => Promise<void>
  refreshCategories: () => Promise<void>
  handleSaveSettings: () => Promise<void>
  handleDelete: (photoId?: string) => void
  handleToggleFeatured: (photo: PhotoDto) => Promise<void>
  selectedPhotoIds: Set<string>
  setSelectedPhotoIds: React.Dispatch<React.SetStateAction<Set<string>>>
  handleSelectPhotoToggle: (id: string) => void
  handleSelectAllPhotos: () => void
  photosViewMode: 'grid' | 'list'
  setPhotosViewMode: (mode: 'grid' | 'list') => void
  photosError: string
  settingsError: string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  t: (key: string) => string
  selectedPhoto: PhotoDto | null
  setSelectedPhoto: (photo: PhotoDto | null) => void
  handleUnauthorized: () => void
}

const AdminContext = createContext<AdminContextType | null>(null)

export function useAdmin() {
  const context = useContext(AdminContext)
  if (!context) {
    throw new Error('useAdmin must be used within AdminLayout')
  }
  return context
}

interface SidebarItem {
  id: string
  href: string
  label: string
  icon: LucideIcon
}

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const { logout, token, user } = useAuth()
  const { settings: globalSettings, isLoading: globalSettingsLoading, refresh: refreshGlobalSettings } = useSettings()
  const { t, locale, setLocale } = useLanguage()
  const { theme, setTheme, mounted } = useTheme()
  const router = useRouter()
  const pathname = usePathname()

  // Mobile menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const toggleTheme = () => {
    if (theme === 'system') setTheme('light')
    else if (theme === 'light') setTheme('dark')
    else setTheme('system')
  }

  const toggleLanguage = () => {
    setLocale(locale === 'zh' ? 'en' : 'zh')
  }

  // Notification State
  const [notifications, setNotifications] = useState<Notification[]>([])
  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9)
    setNotifications((prev) => [...prev, { id, message, type }])
    setTimeout(() => setNotifications((prev) => prev.filter((n) => n.id !== id)), 4000)
  }, [])

  // Photos State
  const [categories, setCategories] = useState<string[]>([])
  const [photos, setPhotos] = useState<PhotoDto[]>([])
  const [photosLoading, setPhotosLoading] = useState(false)
  const [photosError, setPhotosError] = useState('')
  const [photosViewMode, setPhotosViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set())
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoDto | null>(null)

  // Delete Dialog State
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{
    photoIds: string[]
    isBulk: boolean
  } | null>(null)
  const [deleteFromStorage, setDeleteFromStorage] = useState(true)
  const [deleteDialogLoading, setDeleteDialogLoading] = useState(false)
  const [photosWithStories, setPhotosWithStories] = useState<PhotoWithStories[]>([])

  // Logout Confirmation State
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  // Settings State
  const [settings, setSettings] = useState<AdminSettingsDto | null>(null)
  const [originalSettings, setOriginalSettings] = useState<AdminSettingsDto | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [showUrlUpdateDialog, setShowUrlUpdateDialog] = useState(false)
  const [urlUpdateParams, setUrlUpdateParams] = useState<{
    storageProvider?: string
    oldPublicUrl?: string
    newPublicUrl?: string
  } | null>(null)

  // Only show title after settings are loaded to prevent flash
  const siteTitle = globalSettings?.site_title || ''

  const handleUnauthorized = useCallback(() => {
    logout()
    router.push('/login')
  }, [logout, router])

  // --- Data Fetching ---
  const refreshCategories = useCallback(async () => {
    try {
      const data = await getCategories()
      setCategories(data)
    } catch { }
  }, [])

  const refreshPhotos = useCallback(async () => {
    setPhotosError('')
    setPhotosLoading(true)
    try {
      // Use all: true to get all photos for admin management
      const data = await getPhotos({ all: true })
      setPhotos(data)
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        handleUnauthorized()
        return
      }
      setPhotosError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setPhotosLoading(false)
    }
  }, [handleUnauthorized, t])

  const refreshSettings = useCallback(async () => {
    if (!token) return
    setSettingsError('')
    setSettingsLoading(true)
    try {
      const data = await getAdminSettings(token)
      setSettings(data)
      setOriginalSettings(data) // Save original settings for comparison
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        handleUnauthorized()
        return
      }
      setSettingsError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSettingsLoading(false)
    }
  }, [token, handleUnauthorized, t])

  useEffect(() => {
    refreshCategories()
    refreshPhotos()
    refreshSettings()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Photos Handlers ---
  const handleDelete = useCallback(async (photoId?: string) => {
    if (!token) return
    
    const photoIds = photoId ? [photoId] : Array.from(selectedPhotoIds)
    if (photoIds.length === 0) return
    
    // Show dialog immediately with loading state
    setDeleteConfirmDialog({
      photoIds,
      isBulk: photoIds.length > 1,
    })
    setDeleteDialogLoading(true)
    setPhotosWithStories([])
    
    try {
      // Check if any photos have associated stories
      const result = await checkPhotosStories(token, photoIds)
      setPhotosWithStories(result.photosWithStories)
    } catch (err) {
      console.error('Failed to check photo stories:', err)
      // If check fails, allow deletion to proceed
      setPhotosWithStories([])
    } finally {
      setDeleteDialogLoading(false)
    }
  }, [token, selectedPhotoIds])

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
        await deletePhoto({
          token,
          id: deleteConfirmDialog.photoIds[0],
          deleteFromStorage,
        })
      }
      await refreshPhotos()
      notify(t('admin.notify_photo_deleted'))
      setDeleteConfirmDialog(null)
      setDeleteFromStorage(true)
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        handleUnauthorized()
        return
      }
      notify(err instanceof Error ? err.message : t('common.error'), 'error')
    } finally {
      setPhotosLoading(false)
    }
  }

  const handleToggleFeatured = useCallback(async (photo: PhotoDto) => {
    if (!token) return
    try {
      await updatePhoto({
        token,
        id: photo.id,
        patch: { isFeatured: !photo.isFeatured },
      })
      // Update local state instead of refreshing all photos
      setPhotos((prevPhotos) =>
        prevPhotos.map((p) =>
          p.id === photo.id ? { ...p, isFeatured: !p.isFeatured } : p
        )
      )
      notify(
        photo.isFeatured
          ? t('admin.notify_featured_removed')
          : t('admin.notify_featured_added')
      )
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        handleUnauthorized()
        return
      }
      notify(err instanceof Error ? err.message : t('common.error'), 'error')
    }
  }, [token, notify, t, handleUnauthorized])

  const handleSelectPhotoToggle = useCallback((id: string) => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSelectAllPhotos = useCallback(() => {
    if (selectedPhotoIds.size === photos.length) {
      setSelectedPhotoIds(new Set())
    } else {
      setSelectedPhotoIds(new Set(photos.map((p) => p.id)))
    }
  }, [selectedPhotoIds.size, photos])

  // Handler for saving photo updates from PhotoDetailPanel
  const handlePhotoSave = useCallback((updatedPhoto: PhotoDto) => {
    // Update local photos state
    setPhotos((prevPhotos) =>
      prevPhotos.map((p) =>
        p.id === updatedPhoto.id ? updatedPhoto : p
      )
    )
  }, [])

  // --- Settings Handlers ---
  const handleSaveSettings = useCallback(async () => {
    if (!token || !settings || !originalSettings) return

    // Check if R2 Public URL has changed
    const r2UrlChanged = settings.storage_provider === 'r2' &&
      settings.r2_public_url !== originalSettings.r2_public_url &&
      originalSettings.r2_public_url?.trim()

    // If URL changed, show confirmation dialog
    if (r2UrlChanged) {
      setUrlUpdateParams({
        storageProvider: 'r2',
        oldPublicUrl: originalSettings.r2_public_url,
        newPublicUrl: settings.r2_public_url,
      })
      setShowUrlUpdateDialog(true)
      return
    }

    // Save settings normally
    await saveSettingsWithoutUrlUpdate()
  }, [token, settings, originalSettings])

  const saveSettingsWithoutUrlUpdate = useCallback(async () => {
    if (!token || !settings) return
    setSettingsError('')
    setSettingsSaving(true)
    try {
      const updated = await updateAdminSettings(token, settings)
      setSettings(updated)
      setOriginalSettings(updated)
      await refreshGlobalSettings()
      notify(t('admin.notify_config_saved'))
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        handleUnauthorized()
        return
      }
      setSettingsError(err instanceof Error ? err.message : t('common.error'))
      notify('Failed to save settings', 'error')
    } finally {
      setSettingsSaving(false)
    }
  }, [token, settings, refreshGlobalSettings, notify, t, handleUnauthorized])

  const handleConfirmUrlUpdate = useCallback(async (updateUrls: boolean) => {
    if (!token || !settings) return
    setShowUrlUpdateDialog(false)
    setSettingsError('')
    setSettingsSaving(true)

    try {
      // Save settings first
      const updated = await updateAdminSettings(token, settings)
      setSettings(updated)
      setOriginalSettings(updated)
      await refreshGlobalSettings()

      // If user confirmed, update photo URLs
      if (updateUrls && urlUpdateParams) {
        notify(t('admin.updating_photo_urls'), 'info')
        const result = await batchUpdatePhotoUrls(token, urlUpdateParams)
        notify(
          `${t('admin.url_update_complete')}: ${result.updated} ${t('admin.updated')}, ${result.failed} ${t('admin.failed')}`,
          result.failed > 0 ? 'info' : 'success'
        )
        // Refresh photos to show updated URLs
        await refreshPhotos()
      } else {
        notify(t('admin.notify_config_saved'))
      }
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        handleUnauthorized()
        return
      }
      setSettingsError(err instanceof Error ? err.message : t('common.error'))
      notify('Failed to save settings', 'error')
    } finally {
      setSettingsSaving(false)
      setUrlUpdateParams(null)
    }
  }, [token, settings, urlUpdateParams, refreshGlobalSettings, refreshPhotos, notify, t, handleUnauthorized])

  // --- Sidebar Items ---
  const sidebarItems: SidebarItem[] = [
    { id: 'photos', href: '/admin/photos', label: t('admin.library'), icon: ImageIcon },
    { id: 'albums', href: '/admin/albums', label: t('admin.albums'), icon: FolderOpen },
    { id: 'upload', href: '/admin/upload', label: t('admin.upload'), icon: UploadIcon },
    { id: 'logs', href: '/admin/logs', label: t('admin.logs'), icon: BookText },
    { id: 'settings', href: '/admin/settings', label: t('admin.config'), icon: Settings },
    { id: 'friends', href: '/admin/friends', label: t('admin.friends'), icon: Users },
  ]

  // Get current active tab from pathname
  const getActiveTab = () => {
    if (pathname.startsWith('/admin/photos')) return 'photos'
    if (pathname.startsWith('/admin/albums')) return 'albums'
    if (pathname.startsWith('/admin/upload')) return 'upload'
    if (pathname.startsWith('/admin/friends')) return 'friends'
    if (pathname.startsWith('/admin/logs')) return 'logs'
    if (pathname.startsWith('/admin/settings')) return 'settings'
    return 'photos'
  }

  const activeTab = getActiveTab()

  // Get page title
  const getPageTitle = () => {
    switch (activeTab) {
      case 'photos': return t('admin.library')
      case 'albums': return t('admin.albums')
      case 'upload': return t('admin.upload')
      case 'friends': return t('admin.friends')
      case 'logs': return t('admin.logs')
      case 'settings': return t('admin.config')
      default: return t('admin.library')
    }
  }

  const contextValue: AdminContextType = {
    token,
    photos,
    categories,
    settings,
    setSettings,
    photosLoading,
    settingsLoading,
    settingsSaving,
    refreshPhotos,
    refreshSettings,
    refreshCategories,
    handleSaveSettings,
    handleDelete,
    handleToggleFeatured,
    selectedPhotoIds,
    setSelectedPhotoIds,
    handleSelectPhotoToggle,
    handleSelectAllPhotos,
    photosViewMode,
    setPhotosViewMode,
    photosError,
    settingsError,
    notify,
    t,
    selectedPhoto,
    setSelectedPhoto,
    handleUnauthorized,
  }

  const handleUploadComplete = useCallback(async (photoIds: string[], storyId?: string) => {
    if (storyId && token && photoIds.length > 0) {
      try {
        await addPhotosToStory(token, storyId, photoIds)
      } catch (err) {
        console.error('Failed to associate photos with story:', err)
      }
    }
    await refreshPhotos()
    notify(`${photoIds.length} ${t('admin.notify_upload_success')}`)
  }, [token, refreshPhotos, notify, t])

  return (
    <UploadQueueProvider onUploadComplete={handleUploadComplete}>
      <AdminContext.Provider value={contextValue}>
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
          <Toast
            notifications={notifications}
            remove={(id) =>
              setNotifications((prev) => prev.filter((n) => n.id !== id))
            }
          />

        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 bg-background border-r border-border transform transition-transform duration-300 md:translate-x-0 ${
            isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-6 border-b border-border">
              <h2 className={`font-serif text-2xl font-bold tracking-tight transition-opacity duration-300 ${globalSettingsLoading ? 'opacity-0' : 'opacity-100'}`}>
                {siteTitle || '\u00A0'}
              </h2>
              <p className="font-sans text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                {t('admin.console')}
              </p>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {sidebarItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 text-xs font-bold tracking-widest uppercase transition-all rounded-sm ${
                    activeTab === item.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-border space-y-3">
              {/* Settings Row */}
              <div className="flex items-center gap-2">
                {/* Theme Toggle */}
                <button
                  onClick={toggleTheme}
                  className="flex-1 flex items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors rounded-sm border border-border"
                  title={t('nav.toggle_theme')}
                >
                  {!mounted ? (
                    <Monitor className="w-4 h-4" />
                  ) : theme === 'system' ? (
                    <Monitor className="w-4 h-4" />
                  ) : theme === 'light' ? (
                    <Sun className="w-4 h-4" />
                  ) : (
                    <Moon className="w-4 h-4" />
                  )}
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                    {theme === 'system' ? t('nav.system') : theme === 'light' ? t('nav.light') : t('nav.dark')}
                  </span>
                </button>

                {/* Language Toggle */}
                <button
                  onClick={toggleLanguage}
                  className="flex-1 flex items-center justify-center px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors rounded-sm border border-border"
                >
                  {locale === 'zh' ? 'EN' : '中'}
                </button>
              </div>

              {/* Divider */}
              <div className="-mx-4 border-t border-border" />

              {/* User Info */}
              <div className="flex items-center space-x-3 px-2">
                <div className="w-8 h-8 bg-primary rounded-sm flex items-center justify-center text-xs text-primary-foreground font-bold">
                  {user?.username?.substring(0, 1).toUpperCase() || 'A'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate uppercase tracking-wider">
                    {user?.username || 'ADMIN'}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate uppercase tracking-widest">
                    {t('admin.super_user')}
                  </p>
                </div>
              </div>

              {/* Logout Button */}
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-destructive hover:bg-destructive/10 transition-colors rounded-sm border border-destructive/20"
              >
                <LogOut className="w-4 h-4" />
                <span>{t('nav.logout')}</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 md:ml-64 flex flex-col h-screen overflow-hidden">
          <header className="flex-shrink-0 flex items-center justify-between px-8 py-4 bg-background/95 backdrop-blur-xl border-b border-border">
            <div className="flex items-center">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 mr-4 md:hidden hover:bg-muted"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="font-serif text-2xl font-light tracking-tight uppercase">
                {getPageTitle()}
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <a
                href="/gallery"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all text-xs font-bold uppercase tracking-widest"
              >
                <span>{t('admin.view_site')}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </header>

          <div className="p-8 flex-1 overflow-y-auto">
            {children}
          </div>
        </main>

        <PhotoDetailPanel
          photo={selectedPhoto}
          isOpen={!!selectedPhoto}
          categories={categories}
          allPhotos={photos}
          cdnDomain={globalSettings?.cdn_domain}
          token={token}
          onClose={() => setSelectedPhoto(null)}
          onSave={handlePhotoSave}
          onUnauthorized={handleUnauthorized}
          t={t}
          notify={notify}
        />

        <DeleteConfirmDialog
          isOpen={!!deleteConfirmDialog}
          isBulk={deleteConfirmDialog?.isBulk ?? false}
          count={deleteConfirmDialog?.photoIds.length ?? 0}
          deleteFromStorage={deleteFromStorage}
          setDeleteFromStorage={setDeleteFromStorage}
          onConfirm={confirmDelete}
          onCancel={() => {
            setDeleteConfirmDialog(null)
            setDeleteFromStorage(true)
            setPhotosWithStories([])
          }}
          t={t}
          isLoading={deleteDialogLoading}
          photosWithStories={photosWithStories}
        />

        <UrlUpdateConfirmDialog
          isOpen={showUrlUpdateDialog}
          oldUrl={urlUpdateParams?.oldPublicUrl || ''}
          newUrl={urlUpdateParams?.newPublicUrl || ''}
          onConfirm={handleConfirmUrlUpdate}
          onCancel={() => {
            setShowUrlUpdateDialog(false)
            setUrlUpdateParams(null)
          }}
          t={t}
        />

        {/* Logout Confirmation Dialog */}
        <AnimatePresence>
          {showLogoutConfirm && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm"
                onClick={() => setShowLogoutConfirm(false)}
              />

              {/* Dialog */}
              <div className="fixed inset-0 z-[121] flex items-center justify-center p-4 pointer-events-none">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="bg-background border border-border p-8 max-w-md w-full shadow-2xl pointer-events-auto"
                >
                  {/* Header with Icon */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-destructive/10 flex items-center justify-center">
                      <LogOut className="w-6 h-6 text-destructive" />
                    </div>
                    <div>
                      <h3 className="font-serif text-xl font-light uppercase tracking-tight">
                        {t('nav.logout')}
                      </h3>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                        {t('common.confirm')}
                      </p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <p className="text-sm text-foreground leading-relaxed">
                      {locale === 'zh' ? '确定要退出登录吗？' : 'Are you sure you want to logout?'}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowLogoutConfirm(false)}
                      className="flex-1 px-6 py-3 border border-border text-foreground text-xs font-bold uppercase tracking-widest hover:bg-muted active:bg-muted/70 transition-all"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={() => {
                        setShowLogoutConfirm(false)
                        logout()
                      }}
                      className="flex-1 px-6 py-3 bg-destructive text-destructive-foreground text-xs font-bold uppercase tracking-widest hover:bg-destructive/90 active:bg-destructive/80 transition-all flex items-center justify-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>{t('nav.logout')}</span>
                    </button>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>

        <UploadProgressPopupWrapper t={t} token={token} />
        </div>
      </AdminContext.Provider>
    </UploadQueueProvider>
  )
}

function UploadProgressPopupWrapper({ t, token }: { t: (key: string) => string; token: string | null }) {
  const { tasks, isMinimized, setIsMinimized, retryTask, removeTask, clearAll } = useUploadQueue()

  return (
    <UploadProgressPopup
      tasks={tasks}
      isMinimized={isMinimized}
      onToggleMinimize={() => setIsMinimized(!isMinimized)}
      onClose={clearAll}
      onRetry={(taskId) => token && retryTask(taskId, token)}
      onRemoveTask={removeTask}
      t={t}
    />
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requireAdmin>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </ProtectedRoute>
  )
}
