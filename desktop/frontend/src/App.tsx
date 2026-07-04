import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { SettingsProvider } from '@/contexts/SettingsContext'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { UploadQueueProvider } from '@/contexts/UploadQueueContext'
import { UploadProgressPopup } from '@/components/admin/UploadProgressPopup'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { LoginPage } from '@/pages/LoginPage'
import { PhotosPage } from '@/pages/PhotosPage'
import { AlbumsPage } from '@/pages/AlbumsPage'
import { FilmRollsPage } from '@/pages/FilmRollsPage'
import { UploadPage } from '@/pages/UploadPage'
import { PhotoJournalPage } from '@/pages/PhotoJournalPage'
import { ZinePage } from '@/pages/ZinePage'
import { ZineEditorPage } from '@/pages/zine/ZineEditorPage'
import { AiAssistantPage } from '@/pages/AiAssistantPage'
import { StoragePage } from '@/pages/StoragePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { FriendsPage } from '@/pages/FriendsPage'
import { OverviewPage } from '@/pages/OverviewPage'
import type { ReactNode } from 'react'

const SERVER_KEY = 'mo-gallery-server'
const TOKEN_KEY = 'mo-gallery-token'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isReady } = useAuth()

  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-screen w-screen"
        style={{ backgroundColor: 'var(--background)', color: 'var(--muted-foreground)' }}>
        <span className="text-sm">Loading...</span>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  const { isAuthenticated, isReady } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={
        isReady && isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
      } />
      <Route path="/" element={
        <ProtectedRoute>
          <AdminLayout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="photos" element={<PhotosPage />} />
        <Route path="albums" element={<AlbumsPage />} />
        <Route path="film-rolls" element={<FilmRollsPage />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="photo-journal" element={<PhotoJournalPage />} />
        <Route path="zine" element={<ZinePage />} />
        <Route path="zine/editor/:projectId" element={<ZineEditorPage />} />
        <Route path="ai-assistant" element={<AiAssistantPage />} />
        <Route path="storage" element={<StoragePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="friends" element={<FriendsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function AuthSync() {
  const { isAuthenticated, token } = useAuth()

  useEffect(() => {
    if (isAuthenticated && token) {
      const server = localStorage.getItem(SERVER_KEY)
      if (server) {
        // 恢复登录状态时，配置 Go 后端的代理客户端
        ;(window as any).go.main.App.SetAuth(server, token).catch(() => {})
      }
    }
  }, [isAuthenticated, token])

  return null
}

export default function App() {
  return (
    <LanguageProvider>
      <SettingsProvider>
        <AuthProvider>
          <UploadQueueProvider>
            <AuthSync />
            <Toaster position="top-right" richColors closeButton />
            <AppRoutes />
            <UploadProgressPopup />
          </UploadQueueProvider>
        </AuthProvider>
      </SettingsProvider>
    </LanguageProvider>
  )
}
