import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
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
import { useEffect, useState, type ReactNode } from 'react'
import { GetSetupState } from '../wailsjs/go/main/App'
import { SetupPage, type SetupState } from '@/pages/SetupPage'

function AuthenticatedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/library?source=local" replace />
  }

  return <>{children}</>
}

function hasLoginConfiguration(setupState: SetupState) {
  const serverUrl = setupState.api.login_url?.trim() || setupState.api.base_url?.trim()
  return Boolean(serverUrl)
}

function AppRoutes() {
  const { isAuthenticated, isReady } = useAuth()
  const location = useLocation()
  const [setupState, setSetupState] = useState<SetupState | null>(null)
  const [setupStateAvailable, setSetupStateAvailable] = useState(true)

  useEffect(() => {
    let active = true
    void GetSetupState()
      .then((state) => {
        if (active) {
          setSetupState(state as unknown as SetupState)
          setSetupStateAvailable(true)
        }
      })
      .catch(() => {
        // Browser development mode has no Wails bridge; keep the normal app usable.
        if (active) {
          setSetupState({ completed: true, api: {} as SetupState['api'] })
          setSetupStateAvailable(false)
        }
      })
    return () => { active = false }
  }, [location.pathname])

  if (!isReady || !setupState) {
    return (
      <div className="flex h-full w-full items-center justify-center"
        style={{ backgroundColor: 'var(--background)', color: 'var(--muted-foreground)' }}>
        <span className="text-sm">Loading...</span>
      </div>
    )
  }

  if (!setupState.completed && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />
  }

  if (setupStateAvailable && !isAuthenticated && location.pathname === '/login' && !hasLoginConfiguration(setupState)) {
    return <Navigate to="/setup" replace />
  }

  return (
    <Routes>
      <Route path="/setup" element={
        <SetupPage
          initialState={setupState}
          onComplete={(state) => {
            setSetupState(state)
            setSetupStateAvailable(true)
          }}
        />
      } />
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
