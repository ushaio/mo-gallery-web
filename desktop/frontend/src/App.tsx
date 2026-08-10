import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { SettingsProvider } from '@/contexts/SettingsContext'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { UploadQueueProvider } from '@/contexts/UploadQueueContext'
import { UploadProgressPopup } from '@/components/admin/UploadProgressPopup'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { DesktopWindowFrame } from '@/components/layout/DesktopWindowFrame'
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

function AuthenticatedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/library?source=local" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  const { isAuthenticated, isReady } = useAuth()

  if (!isReady) {
    return (
      <div className="flex h-full w-full items-center justify-center"
        style={{ backgroundColor: 'var(--background)', color: 'var(--muted-foreground)' }}>
        <span className="text-sm">Loading...</span>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={
        isAuthenticated ? <Navigate to="/overview" replace /> : <LoginPage />
      } />
      <Route path="/" element={<AdminLayout />}>
        <Route index element={<Navigate to={isAuthenticated ? '/overview' : '/library?source=local'} replace />} />
        <Route path="overview" element={<AuthenticatedRoute><OverviewPage /></AuthenticatedRoute>} />
        <Route path="library" element={<ResourceLibraryPage />} />
        <Route path="photos" element={<AuthenticatedRoute><Navigate to="/library?source=cloud" replace /></AuthenticatedRoute>} />
        <Route path="local-library" element={<Navigate to="/library?source=local" replace />} />
        <Route path="albums" element={<AuthenticatedRoute><Navigate to="/library?source=cloud&view=albums" replace /></AuthenticatedRoute>} />
        <Route path="film-rolls" element={<AuthenticatedRoute><Navigate to="/library?source=cloud&view=film-rolls" replace /></AuthenticatedRoute>} />
        <Route path="upload" element={<AuthenticatedRoute><UploadPage /></AuthenticatedRoute>} />
        <Route path="photo-journal" element={<AuthenticatedRoute><PhotoJournalPage /></AuthenticatedRoute>} />
        <Route path="zine" element={<ZinePage />} />
        <Route path="zine/editor/:projectId" element={<ZineEditorPage />} />
        <Route path="ai-assistant" element={<AuthenticatedRoute><AiAssistantPage /></AuthenticatedRoute>} />
        <Route path="storage" element={<AuthenticatedRoute><StoragePage /></AuthenticatedRoute>} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="friends" element={<AuthenticatedRoute><FriendsPage /></AuthenticatedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to={isAuthenticated ? '/overview' : '/library?source=local'} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <LanguageProvider>
      <SettingsProvider>
        <DesktopWindowFrame>
          <AuthProvider>
            <UploadQueueProvider>
              <Toaster
                position="top-right"
                className="desktop-toaster"
                closeButton
                duration={4000}
                gap={8}
                visibleToasts={3}
                expand={false}
                toastOptions={{ classNames: { toast: 'desktop-toast' } }}
              />
              <AppRoutes />
              <UploadProgressPopup />
            </UploadQueueProvider>
          </AuthProvider>
        </DesktopWindowFrame>
      </SettingsProvider>
    </LanguageProvider>
  )
}
