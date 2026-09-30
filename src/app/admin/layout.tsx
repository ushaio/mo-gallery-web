'use client'

import React, { useEffect, useState, createContext, useContext, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, LogOut, Monitor, Moon, Sun } from 'lucide-react'
import {
  ConsoleRuntimeProvider,
  ConsoleShell,
  type ConsoleHostAdapter,
  type ConsoleLinkRenderer,
  type ConsoleNavItem,
} from '@mo-gallery/admin-console'

import '@mo-gallery/admin-console/theme.css'
import './admin-shell-host.css'

import ProtectedRoute from '@/components/ProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'
import { useSettings } from '@/contexts/SettingsContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { useTheme } from '@/contexts/ThemeContext'
import { usePathname } from 'next/navigation'
import {
  ApiUnauthorizedError,
  addPhotosToStory,
  batchUpdatePhotoUrls,
  getAdminSettings,
  getTags,
  getPhotos,
  updateAdminSettings,
  type AdminSettingsDto,
  type PhotoDto,
} from '@/lib/api'
import { Toast, type Notification } from '@/components/Toast'
import { UrlUpdateConfirmDialog } from '@/components/admin/UrlUpdateConfirmDialog'
import { UploadQueueProvider, useUploadQueue } from '@/contexts/UploadQueueContext'
import { UploadProgressPopup } from '@/components/admin/UploadProgressPopup'
import { AdminButton } from '@/components/admin/AdminButton'
import { getActiveAdminSidebarItem, getAdminSidebarItems } from '@/components/admin/admin-sidebar-config'
import { isAuthFailurePending, reportAuthFailure } from '@/lib/auth-failure'
import { cn } from '@/lib/utils'

// Admin Context for shared state
interface AdminContextType {
  token: string | null
  photos: PhotoDto[]
  tags: string[]
  settings: AdminSettingsDto | null
  setSettings: (settings: AdminSettingsDto) => void
  settingsLoading: boolean
  settingsSaving: boolean
  refreshPhotos: () => Promise<void>
  handleSaveSettings: () => Promise<void>
  settingsError: string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  t: (key: string) => string
  handleUnauthorized: (error?: unknown) => void
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
    if (type === 'error' && isAuthFailurePending()) return
    const id = Math.random().toString(36).substring(2, 9)
    setNotifications((prev) => [...prev, { id, message, type }])
    setTimeout(() => setNotifications((prev) => prev.filter((n) => n.id !== id)), 4000)
  }, [])

  // Photos State
  const [tags, setTags] = useState<string[]>([])
  const [photos, setPhotos] = useState<PhotoDto[]>([])

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

  const handleUnauthorized = useCallback((error?: unknown) => {
    if (error instanceof ApiUnauthorizedError) {
      reportAuthFailure({ code: error.code, message: error.message })
      return
    }

    reportAuthFailure({
      code: 'TOKEN_INVALID',
      message: 'Your session is invalid or has expired',
    })
  }, [])

  // --- Data Fetching ---
  const refreshTags = useCallback(async () => {
    try {
      const data = await getTags()
      setTags(data)
    } catch { }
  }, [])

  const refreshPhotos = useCallback(async () => {
    try {
      // Use all: true to get all photos for admin management
      const data = await getPhotos({ all: true })
      setPhotos(data)
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        handleUnauthorized(err)
        return
      }
      notify(err instanceof Error ? err.message : t('common.error'), 'error')
    }
  }, [handleUnauthorized, notify, t])

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
        handleUnauthorized(err)
        return
      }
      setSettingsError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSettingsLoading(false)
    }
  }, [token, handleUnauthorized, t])

  useEffect(() => {
    refreshTags()
    refreshPhotos()
    refreshSettings()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
        handleUnauthorized(err)
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

    // Check if S3 Public URL has changed
    const s3UrlChanged =
      settings.storage_provider === 's3' &&
      settings.s3_public_url !== originalSettings.s3_public_url &&
      originalSettings.s3_public_url?.trim()

    // If URL changed, show confirmation dialog
    if (s3UrlChanged) {
      setUrlUpdateParams({
        storageProvider: 's3',
        oldPublicUrl: originalSettings.s3_public_url,
        newPublicUrl: settings.s3_public_url,
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
        handleUnauthorized(err)
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
  const isLibraryWorkspace = pathname === '/admin/library' || pathname === '/admin/storage'
  const pageTitle = t(activeSidebarItem.labelKey)

  useEffect(() => {
    document.title = `${pageTitle} | ${siteTitle || 'MO GALLERY'}`
  }, [pageTitle, siteTitle])

  const contextValue: AdminContextType = {
    token,
    photos,
    tags,
    settings,
    setSettings,
    settingsLoading,
    settingsSaving,
    refreshPhotos,
    handleSaveSettings,
    settingsError,
    notify,
    t,
    handleUnauthorized,
    isImmersiveMode,
    setIsImmersiveMode,
  }

  const handleUploadComplete = useCallback(async (photoIds: string[], storyId?: string, _albumIds?: string[], failedCount?: number) => {
    if (storyId && token && photoIds.length > 0) {
      try {
        await addPhotosToStory(token, storyId, photoIds)
      } catch (err) {
        console.error('Failed to associate photos with story:', err)
      }
    }
    await refreshPhotos()
    if (photoIds.length > 0) {
      notify(`${photoIds.length} ${t('admin.notify_upload_success')}`, failedCount && failedCount > 0 ? 'info' : 'success')
    }
    if (failedCount && failedCount > 0) {
      notify(`${failedCount} ${t('admin.notify_upload_failed') || 'photo(s) failed to upload. You can retry them from the upload queue.'}`, 'error')
    }
  }, [token, refreshPhotos, notify, t])

  // --- 共享后台外壳接线（@mo-gallery/admin-console）---
  const languageToggleLabel = 'Toggle language'

  const adminNavItems: ConsoleNavItem[] = sidebarItems.map(({ id, href, label, icon: Icon }) => ({
    id,
    href,
    label,
    icon: <Icon className="h-4 w-4" />,
  }))

  const renderAdminLink = useCallback<ConsoleLinkRenderer>(
    ({ href, className, title, children, 'aria-current': ariaCurrent, onClick }) => (
      <Link
        href={href}
        className={className}
        title={title}
        aria-current={ariaCurrent}
        onClick={onClick}
      >
        {children}
      </Link>
    ),
    []
  )

  const adminAdapter = useMemo<ConsoleHostAdapter>(
    () => ({
      user: user ? { username: user.username, displayName: user.username } : null,
      renderLink: renderAdminLink,
      labels: {
        currentUser: t('admin.super_user'),
        toggleRail: isSidebarCollapsed ? t('admin.sidebar_expand') : t('admin.sidebar_collapse'),
        closeRail: t('admin.sidebar_collapse'),
      },
    }),
    [user, renderAdminLink, t, isSidebarCollapsed]
  )

  const railHeader = (
    <h2
      className={cn(
        'truncate whitespace-nowrap font-serif text-2xl font-bold tracking-tight transition-opacity duration-300 motion-reduce:transition-none',
        globalSettingsLoading ? 'opacity-0' : 'opacity-100'
      )}
    >
      {siteTitle || '\u00A0'}
    </h2>
  )

  const railFooter = (
    <div className={cn('w-full space-y-3', isSidebarCollapsed && 'space-y-2')}>
      <div className={cn('flex items-center gap-2', isSidebarCollapsed && 'flex-col')}>
        <AdminButton
          onClick={toggleTheme}
          adminVariant="outline"
          size="sm"
          className="flex flex-1 items-center gap-2 rounded-sm px-3 py-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          title={t('nav.toggle_theme')}
          aria-label={t('nav.toggle_theme')}
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
          <span className="truncate text-[10px] font-bold uppercase tracking-widest mgac-rail-foot-text">
            {theme === 'system' ? t('nav.system') : theme === 'light' ? t('nav.light') : t('nav.dark')}
          </span>
        </AdminButton>

        <AdminButton
          onClick={toggleLanguage}
          adminVariant="outline"
          size="sm"
          className="flex flex-1 items-center justify-center rounded-sm px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          title={languageToggleLabel}
          aria-label={languageToggleLabel}
        >
          <span className="mgac-rail-foot-text">{locale === 'zh' ? 'EN' : 'ZH'}</span>
        </AdminButton>
      </div>

      <div className="border-t border-border" />

      <div className={cn('flex items-center gap-3 px-2', isSidebarCollapsed && 'justify-center px-0')}>
        <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-xs font-bold text-primary-foreground">
          {user?.username?.substring(0, 1).toUpperCase() || 'A'}
        </div>
        <div className="min-w-0 flex-1 overflow-hidden mgac-rail-foot-text">
          <p className="truncate whitespace-nowrap text-xs font-bold uppercase tracking-wider">
            {user?.username || 'ADMIN'}
          </p>
          <p className="truncate whitespace-nowrap text-[10px] uppercase tracking-widest text-muted-foreground">
            {t('admin.super_user')}
          </p>
        </div>
      </div>

      <AdminButton
        onClick={() => setShowLogoutConfirm(true)}
        adminVariant="destructiveOutline"
        size="lg"
        className={cn(
          'flex w-full items-center justify-center space-x-2 rounded-sm px-4 py-2.5 text-xs font-bold uppercase tracking-widest',
          isSidebarCollapsed && 'px-1'
        )}
        aria-label={t('nav.logout')}
      >
        <LogOut className="w-4 h-4" />
        <span className="truncate mgac-rail-foot-text">{t('nav.logout')}</span>
      </AdminButton>
    </div>
  )

  const topbarActions = (
    <>
      <a
        href="/gallery"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-1.5 border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all text-xs font-bold uppercase tracking-widest"
      >
        <span>{t('admin.view_site')}</span>
        <ExternalLink className="w-3 h-3" />
      </a>
    </>
  )

  const adminOverlays = (
    <>
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
    </>
  )

  return (
    <UploadQueueProvider onUploadComplete={handleUploadComplete}>
      <AdminContext.Provider value={contextValue}>
        <Toast
          notifications={notifications}
          remove={(id) =>
            setNotifications((prev) => prev.filter((n) => n.id !== id))
          }
        />

        {isImmersiveMode ? (
          /* 日志沉浸模式：整个外壳让位给面板（与原行为一致） */
          <div className="flex h-screen overflow-hidden bg-background text-foreground">
            <div className="flex-1 overflow-hidden">{children}</div>
            {adminOverlays}
          </div>
        ) : (
          <ConsoleRuntimeProvider adapter={adminAdapter}>
            <ConsoleShell
              className="admin-shell-host"
              contentClassName={isLibraryWorkspace ? 'is-panel-flush' : undefined}
              nav={adminNavItems}
              activeId={activeSidebarItem.id}
              collapsed={isSidebarCollapsed}
              onToggleCollapse={toggleSidebarCollapse}
              mobileOpen={isMobileMenuOpen}
              onOpenMobile={() => setIsMobileMenuOpen(true)}
              onCloseMobile={() => setIsMobileMenuOpen(false)}
              railLabel={t('admin.console')}
              brand={
                <h1 className="font-serif text-2xl font-light tracking-tight uppercase">
                  {pageTitle}
                </h1>
              }
              brandHref={null}
              railHeader={railHeader}
              railFooter={railFooter}
              topbarActions={topbarActions}
              overlay={adminOverlays}
            >
              {children}
            </ConsoleShell>
          </ConsoleRuntimeProvider>
        )}
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
