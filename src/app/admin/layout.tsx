'use client'

import React, { useEffect, useState, createContext, useContext, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Menu,
  ExternalLink,
  LogOut,
} from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'
import { useSettings } from '@/contexts/SettingsContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useRouter, usePathname } from 'next/navigation'
import {
  ApiUnauthorizedError,
  addPhotosToStory,
  batchDeletePhotos,
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
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { getActiveAdminSidebarItem, getAdminSidebarItems } from '@/components/admin/admin-sidebar-config'

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
  isImmersiveMode: boolean
  setIsImmersiveMode: React.Dispatch<React.SetStateAction<boolean>>
}

const AdminContext = createContext<AdminContextType | null>(null)

export function useAdmin() {
  const context = useContext(AdminContext)
  if (!context) {
    throw new Error('useAdmin must be used within AdminLayout')
  }
  return context
}

const ADMIN_SIDEBAR_COLLAPSED_KEY = 'admin-sidebar-collapsed'

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const { logout, token, user } = useAuth()
  const { settings: globalSettings, isLoading: globalSettingsLoading, refresh: refreshGlobalSettings } = useSettings()
  const { t, locale, setLocale } = useLanguage()
  const { theme, setTheme, mounted } = useTheme()
  const router = useRouter()
  const pathname = usePathname()

  // Mobile menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isImmersiveMode, setIsImmersiveMode] = useState(false)

  useEffect(() => {
    const savedValue = window.localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_KEY)
    setIsSidebarCollapsed(savedValue === 'true')
  }, [])

  useEffect(() => {
    if (!pathname.startsWith('/admin/logs')) {
      setIsImmersiveMode(false)
    }
  }, [pathname])

  const toggleSidebarCollapse = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(ADMIN_SIDEBAR_COLLAPSED_KEY, String(next))
      return next
    })
  }, [])

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
  const [deleteOriginal, setDeleteOriginal] = useState(true)
  const [deleteThumbnail, setDeleteThumbnail] = useState(true)
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
        const force = photosWithStories.length > 0
        const result = await batchDeletePhotos({
          token,
          photoIds: deleteConfirmDialog.photoIds,
          deleteOriginal,
          deleteThumbnail,
          force,
        })
        setSelectedPhotoIds(new Set())
        await refreshPhotos()
        notify(`${result.deleted} ${t('admin.notify_photo_deleted')}`)
        if (result.failed > 0) {
          notify(`${result.failed} failed: ${result.errors.join(', ')}`, 'error')
        }
      } else {
        const force = photosWithStories.length > 0
        await deletePhoto({
          token,
          id: deleteConfirmDialog.photoIds[0],
          deleteOriginal,
          deleteThumbnail,
          force,
        })
        await refreshPhotos()
        notify(t('admin.notify_photo_deleted'))
      }
      setDeleteConfirmDialog(null)
      setDeleteOriginal(true)
      setDeleteThumbnail(true)
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
      notify(t('admin.settings_save_failed'), 'error')
    } finally {
      setSettingsSaving(false)
    }
  }, [token, settings, refreshGlobalSettings, notify, t, handleUnauthorized])

  const handleSaveSettings = useCallback(async () => {
    if (!token || !settings || !originalSettings) return

    // Check if R2 Public URL has changed
    const r2UrlChanged =
      settings.storage_provider === 'r2' &&
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
  }, [token, settings, originalSettings, saveSettingsWithoutUrlUpdate])

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
      notify(t('admin.settings_save_failed'), 'error')
    } finally {
      setSettingsSaving(false)
      setUrlUpdateParams(null)
    }
  }, [token, settings, urlUpdateParams, refreshGlobalSettings, refreshPhotos, notify, t, handleUnauthorized])

  const sidebarItems = getAdminSidebarItems(t)
  const activeSidebarItem = getActiveAdminSidebarItem(pathname)
  const pageTitle = t(activeSidebarItem.labelKey)

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
    isImmersiveMode,
    setIsImmersiveMode,
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

          {!isImmersiveMode ? (
            <AdminSidebar
              siteTitle={siteTitle}
              isSiteTitleLoading={globalSettingsLoading}
              isMobileMenuOpen={isMobileMenuOpen}
              isCollapsed={isSidebarCollapsed}
              activeItemId={activeSidebarItem.id}
              user={user}
              locale={locale}
              mounted={mounted}
              theme={theme}
              onCloseMobileMenu={() => setIsMobileMenuOpen(false)}
              onToggleTheme={toggleTheme}
              onToggleLanguage={toggleLanguage}
              onLogout={() => setShowLogoutConfirm(true)}
              t={t}
              items={sidebarItems}
            />
          ) : null}

          {!isImmersiveMode ? (
          <button
            type="button"
            onClick={toggleSidebarCollapse}
            className={`fixed top-1/2 z-50 hidden h-14 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/95 text-muted-foreground shadow-[0_12px_32px_rgba(15,23,42,0.12)] backdrop-blur transition-all duration-300 ease-out hover:h-16 hover:w-8 hover:border-primary/40 hover:text-foreground hover:shadow-[0_16px_40px_rgba(15,23,42,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none md:flex ${
              isSidebarCollapsed ? 'left-20' : 'left-64'
            }`}
            aria-label={isSidebarCollapsed ? t('admin.sidebar_expand') : t('admin.sidebar_collapse')}
            aria-pressed={isSidebarCollapsed}
          >
            <div className="flex h-9 w-4 items-center justify-center rounded-full border border-border/70 bg-muted/50">
              {isSidebarCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )}
            </div>
          </button>
          ) : null}

          {/* Main Content */}
          <main className={`flex-1 flex flex-col h-screen overflow-hidden transition-[margin] duration-300 ${
            isImmersiveMode ? 'md:ml-0' : isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'
          }`}>
            {!isImmersiveMode ? (
            <header className="flex-shrink-0 flex items-center justify-between px-8 py-4 bg-background/95 backdrop-blur-xl border-b border-border">
            <div className="flex items-center">
              <AdminButton
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                adminVariant="icon"
                size="sm"
                className="p-2 mr-4 md:hidden hover:bg-muted"
              >
                <Menu className="w-5 h-5" />
              </AdminButton>
              <h1 className="font-serif text-2xl font-light tracking-tight uppercase">
                {pageTitle}
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
            ) : null}

           <div className={isImmersiveMode ? 'flex-1 overflow-hidden' : 'p-8 flex-1 overflow-y-auto'}>
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
          deleteOriginal={deleteOriginal}
          setDeleteOriginal={setDeleteOriginal}
          deleteThumbnail={deleteThumbnail}
          setDeleteThumbnail={setDeleteThumbnail}
          onConfirm={confirmDelete}
          onCancel={() => {
            setDeleteConfirmDialog(null)
            setDeleteOriginal(true)
            setDeleteThumbnail(true)
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
                      {t('admin.logout_confirm')}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <AdminButton
                      onClick={() => setShowLogoutConfirm(false)}
                      adminVariant="outline"
                      size="xl"
                      className="flex-1 px-6 py-3 text-xs font-bold uppercase tracking-widest"
                    >
                      {t('common.cancel')}
                    </AdminButton>
                    <AdminButton
                      onClick={() => {
                        setShowLogoutConfirm(false)
                        logout()
                      }}
                      adminVariant="destructive"
                      size="xl"
                      className="flex-1 px-6 py-3 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>{t('nav.logout')}</span>
                    </AdminButton>
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

