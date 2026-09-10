import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { GetOfficialAuthState, OfficialLogout } from '../../wailsjs/go/main/App'

export interface OfficialUser {
  id: string
  username: string
  role: string
}

export interface OfficialAuthStateInfo {
  logged_in: boolean
  base_url: string
  username: string
  remember_login: boolean
}

interface OfficialAuthContextType {
  user: OfficialUser | null
  baseUrl: string
  isAuthenticated: boolean
  /** 官方会话恢复流程是否完成（决定启动门禁是否放行） */
  isReady: boolean
  login: (user: OfficialUser) => void
  logout: () => Promise<void>
}

const OfficialAuthContext = createContext<OfficialAuthContextType | null>(null)

// Go/Wails 桥接启动耗时不确定，与 AuthContext 相同的退避重试节奏。
const RESTORE_RETRY_DELAYS_MS = [300, 900, 1800, 3000]

export function OfficialAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<OfficialUser | null>(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const scheduleRetry = (attempt: number) => {
      const delay = RESTORE_RETRY_DELAYS_MS[Math.min(attempt, RESTORE_RETRY_DELAYS_MS.length - 1)]
      retryTimer = setTimeout(() => {
        void tryRestore(attempt + 1)
      }, delay)
    }

    const tryRestore = async (attempt: number) => {
      try {
        const state = (await GetOfficialAuthState()) as unknown as OfficialAuthStateInfo
        if (cancelled) return
        setBaseUrl(state.base_url || '')
        if (state.logged_in && state.username) {
          setUser({
            // 断网宽限场景 Go 只能回传缓存用户名，id/role 允许为空。
            id: '',
            username: state.username,
            role: '',
          })
        } else {
          setUser(null)
        }
        setIsReady(true)
      } catch {
        // 桥接尚未就绪时退避重试；重试耗尽后放行登录门禁，
        // 避免开发模式（无 Wails 环境）被永久卡在 Loading。
        if (cancelled) return
        if (attempt >= RESTORE_RETRY_DELAYS_MS.length - 1) {
          setIsReady(true)
          return
        }
        scheduleRetry(attempt)
      }
    }

    void tryRestore(0)

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [])

  const login = useCallback((nextUser: OfficialUser) => {
    setUser(nextUser)
  }, [])

  const logout = useCallback(async () => {
    await OfficialLogout().catch(() => undefined)
    setUser(null)
  }, [])

  return (
    <OfficialAuthContext.Provider value={{
      user,
      baseUrl,
      isAuthenticated: !!user,
      isReady,
      login,
      logout,
    }}>
      {children}
    </OfficialAuthContext.Provider>
  )
}

export function useOfficialAuth() {
  const ctx = useContext(OfficialAuthContext)
  if (!ctx) throw new Error('useOfficialAuth must be used within OfficialAuthProvider')
  return ctx
}
