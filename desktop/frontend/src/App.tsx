import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { SettingsProvider } from '@/contexts/SettingsContext'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { UploadQueueProvider } from '@/contexts/UploadQueueContext'
import { UploadProgressPopup } from '@/components/admin/UploadProgressPopup'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { LoginPage } from '@/pages/LoginPage'
import { ResourceLibraryPage } from '@/pages/ResourceLibraryPage'
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
        <Route path="library" element={<ResourceLibraryPage />} />
        <Route path="photos" element={<Navigate to="/library?source=cloud" replace />} />
        <Route path="local-library" element={<Navigate to="/library?source=local" replace />} />
        <Route path="albums" element={<Navigate to="/library?source=cloud&view=albums" replace />} />
        <Route path="film-rolls" element={<Navigate to="/library?source=cloud&view=film-rolls" replace />} />
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

export default function App() {
  return (
    <LanguageProvider>
      <SettingsProvider>
        <AuthProvider>
          <UploadQueueProvider>
            <Toaster position="top-right" richColors closeButton />
            <AppRoutes />
            <UploadProgressPopup />
          </UploadQueueProvider>
        </AuthProvider>
      </SettingsProvider>
    </LanguageProvider>
  )
}
