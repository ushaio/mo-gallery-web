import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { OfficialAuthProvider, useOfficialAuth } from '@/contexts/OfficialAuthContext'
import { SettingsProvider } from '@/contexts/SettingsContext'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { UploadQueueProvider } from '@/contexts/UploadQueueContext'
import { DownloadQueueProvider } from '@/contexts/DownloadQueueContext'
import { UploadProgressPopup } from '@/components/admin/UploadProgressPopup'
import { DownloadProgressPopup } from '@/components/admin/DownloadProgressPopup'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { DesktopWindowFrame } from '@/components/layout/DesktopWindowFrame'
import { LoginPage } from '@/pages/LoginPage'
import { ConnectPage } from '@/pages/ConnectPage'
import { ResourceLibrary } from '@/features/library/ResourceLibrary'
import { UploadPage } from '@/pages/UploadPage'
import { PhotoJournalPage } from '@/pages/PhotoJournalPage'
import { DesignStudioPage } from '@/pages/DesignStudioPage'
import { CanvasEditorPage } from '@/pages/design-canvas/CanvasEditorPage'
import { ZineEditorPage } from '@/pages/zine/ZineEditorPage'
import { AiAssistantPage } from '@/pages/AiAssistantPage'
import { AiImagePage } from '@/pages/AiImagePage'
import { InspirationPage } from '@/pages/InspirationPage'
import { StoragePage } from '@/pages/StoragePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { FriendsPage } from '@/pages/FriendsPage'
import { HomePage } from '@/pages/HomePage'
import { useEffect, useState, type ReactNode } from 'react'
import { GetSetupState } from '../wailsjs/go/main/App'
import { SetupPage, type SetupState } from '@/pages/SetupPage'
import { initializeEditorAutomation, registerAutomationLocation, registerAutomationNavigator } from '@/lib/editor-automation'

function AuthenticatedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/connect" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  const { isAuthenticated, isReady } = useAuth()
  const { isAuthenticated: isOfficialAuthed, isReady: isOfficialReady } = useOfficialAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [setupState, setSetupState] = useState<SetupState | null>(null)

  useEffect(() => registerAutomationNavigator((path) => navigate(path)), [navigate])
  useEffect(() => registerAutomationLocation(() => ({
    path: `${location.pathname}${location.search}`,
    menu: location.pathname.replace(/^\//, '') || 'home',
    search: location.search,
  })), [location.pathname, location.search])

  useEffect(() => {
    let active = true
    void GetSetupState()
      .then((state) => {
        if (active) {
          setSetupState(state as unknown as SetupState)
        }
      })
      .catch(() => {
        // Browser development mode has no Wails bridge; keep the normal app usable.
        if (active) {
          setSetupState({ completed: true, api: {} as SetupState['api'] })
        }
      })
    return () => { active = false }
  }, [location.pathname])

  if (!isOfficialReady || !isReady || !setupState) {
    return (
      <div className="flex h-full w-full items-center justify-center"
        style={{ backgroundColor: 'var(--background)', color: 'var(--muted-foreground)' }}>
        <span className="text-sm">Loading...</span>
      </div>
    )
  }

  // 第一道门禁：必须登录官方账号才能使用桌面客户端
  if (!isOfficialAuthed) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  // 第二道门禁：首次启动向导（官方登录后进入；第二步连接站点可跳过）
  if (!setupState.completed && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />
  }

  return (
    <Routes>
      <Route path="/setup" element={
        <SetupPage
          initialState={setupState}
          onComplete={(state) => {
            setSetupState(state)
          }}
        />
      } />
      <Route path="/login" element={
        <Navigate to="/home" replace />
      } />
      <Route path="/connect" element={<ConnectPage />} />
      <Route path="/" element={<AdminLayout />}>
        <Route index element={<Navigate to={isAuthenticated ? '/home' : '/library?source=local'} replace />} />
        <Route path="home" element={<AuthenticatedRoute><HomePage /></AuthenticatedRoute>} />
        <Route path="overview" element={<Navigate to="/home" replace />} />
        <Route path="library" element={<ResourceLibrary />} />
        <Route path="photos" element={<AuthenticatedRoute><Navigate to="/library?source=cloud" replace /></AuthenticatedRoute>} />
        <Route path="local-library" element={<Navigate to="/library?source=local" replace />} />
        <Route path="albums" element={<AuthenticatedRoute><Navigate to="/library?source=cloud&view=albums" replace /></AuthenticatedRoute>} />
        <Route path="film-rolls" element={<AuthenticatedRoute><Navigate to="/library?source=cloud&view=film-rolls" replace /></AuthenticatedRoute>} />
        <Route path="upload" element={<AuthenticatedRoute><UploadPage /></AuthenticatedRoute>} />
        <Route path="photo-journal" element={<AuthenticatedRoute><PhotoJournalPage /></AuthenticatedRoute>} />
        <Route path="design" element={<DesignStudioPage />} />
        <Route path="design/new" element={<Navigate to="/design" replace />} />
        <Route path="design/canvas/editor/:projectId" element={<CanvasEditorPage />} />
        <Route path="design/canvas" element={<Navigate to="/design" replace />} />
        <Route path="design/zine" element={<Navigate to="/design" replace />} />
        <Route path="design/zine/editor/:projectId" element={<ZineEditorPage />} />
        <Route path="zine" element={<Navigate to="/design" replace />} />
        <Route path="zine/editor/:projectId" element={<ZineEditorPage />} />
        {/* The desktop AI assistant is backed by local Wails services and its
            editor-ai.db store, so it remains available without a connected site. */}
        <Route path="ai-assistant" element={<AiAssistantPage />} />
        <Route path="design/ai-image" element={<AuthenticatedRoute><AiImagePage /></AuthenticatedRoute>} />
        <Route path="inspiration" element={<InspirationPage />} />
        <Route path="storage" element={<AuthenticatedRoute><StoragePage /></AuthenticatedRoute>} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="friends" element={<AuthenticatedRoute><FriendsPage /></AuthenticatedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to={isAuthenticated ? '/home' : '/library?source=local'} replace />} />
    </Routes>
  )
}

export default function App() {
  useEffect(() => initializeEditorAutomation(), [])

  return (
    <LanguageProvider>
      <SettingsProvider>
        {/* 认证 Provider 包住 DesktopWindowFrame，标题栏 logo 需要读取站点连接状态 */}
        <OfficialAuthProvider>
          <AuthProvider>
            <DesktopWindowFrame>
              <UploadQueueProvider>
                <DownloadQueueProvider>
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
                  <DownloadProgressPopup />
                </DownloadQueueProvider>
              </UploadQueueProvider>
            </DesktopWindowFrame>
          </AuthProvider>
        </OfficialAuthProvider>
      </SettingsProvider>
    </LanguageProvider>
  )
}
