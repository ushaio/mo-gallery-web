import { createContext, useContext, useState, useEffect, useCallback, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearDesktopRuntimeCache, invalidateDesktopCacheForMutation } from '@/lib/app-cache'
import { clearCurrentPersistentCache } from '@/lib/persistent-cache'
import {
  AUTH_ERROR_MESSAGE_KEY,
  AUTH_FAILURE_EVENT,
  getAuthErrorMessage,
  isAuthError,
} from '@/lib/auth-errors'
import type { UserInfo } from '@/types'
import { ClearAuth, SetAuth } from '../../wailsjs/go/main/App'

interface AuthContextType {
  token: string | null
  user: UserInfo | null
  isAuthenticated: boolean
  isReady: boolean
  login: (token: string, user: UserInfo, server?: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const TOKEN_KEY = 'mo-gallery-token'
const USER_KEY = 'mo-gallery-user'
const SERVER_KEY = 'mo-gallery-server'

// Go/Wails 重建耗时不固定。认证桥接暂时不可用时持续退避重试，
// 但保留 localStorage 中的已登录会话，避免开发模式被误跳转到登录页。
const RESTORE_RETRY_DELAYS_MS = [300, 900, 1800, 3000]

type WailsFunction = ((...args: unknown[]) => unknown) & {
  __authWrapped?: true
  __authOriginal?: WailsFunction
}

const AUTH_BOOTSTRAP_METHODS = new Set(['GetApiConfig', 'Login', 'SetAuth', 'ValidateToken'])

interface WailsRuntimeWindow {
  go?: {
    main?: {
      App?: Record<string, WailsFunction>
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<UserInfo | null>(null)
  const [isReady, setIsReady] = useState(false)
  const authSyncPendingRef = useRef(false)

  const clearAuthState = useCallback(() => {
    setToken(null)
    setUser(null)
    clearDesktopRuntimeCache()
    // Scope lookup depends on the stored user, so remove that user's cache first.
    clearCurrentPersistentCache()
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }, [])

  const handleAuthFailure = useCallback((error?: unknown) => {
    clearAuthState()
    sessionStorage.setItem(AUTH_ERROR_MESSAGE_KEY, getAuthErrorMessage(error))
    navigate('/login', { replace: true })
  }, [clearAuthState, navigate])

  useEffect(() => {
    const handleFailure = (event: Event) => {
      if (authSyncPendingRef.current) return
      handleAuthFailure((event as CustomEvent<unknown>).detail)
    }

    window.addEventListener(AUTH_FAILURE_EVENT, handleFailure)
    return () => window.removeEventListener(AUTH_FAILURE_EVENT, handleFailure)
  }, [handleAuthFailure])

  useLayoutEffect(() => {
    let active = true
    const wrappedMethods: Array<{
      app: Record<string, WailsFunction>
      key: string
      original: WailsFunction
      wrapped: WailsFunction
    }> = []

    const installWrappers = () => {
      const app = (window as unknown as WailsRuntimeWindow).go?.main?.App
      if (!app) return

      for (const key of Object.keys(app)) {
        if (AUTH_BOOTSTRAP_METHODS.has(key)) continue

        const current = app[key] as unknown
        if (typeof current !== 'function') continue
        const currentFn = current as WailsFunction
        if (currentFn.__authWrapped) continue

        const wrapped: WailsFunction = (...args: unknown[]) => {
          const suppressAuthFailure = authSyncPendingRef.current
          const result = currentFn.apply(app, args)
          if (!result || typeof (result as Promise<unknown>).catch !== 'function') return result
          return (result as Promise<unknown>)
            .then((value) => {
              if (active) invalidateDesktopCacheForMutation(key)
              return value
            })
            .catch((error: unknown) => {
              if (active && !suppressAuthFailure && isAuthError(error)) handleAuthFailure(error)
              throw error
            })
        }
        wrapped.__authWrapped = true
        wrapped.__authOriginal = currentFn
        app[key] = wrapped
        wrappedMethods.push({ app, key, original: currentFn, wrapped })
      }
    }

    installWrappers()
    const installTimer = window.setInterval(installWrappers, 500)

    // The bridge may be injected after React mounts. Polling is cheap and also covers
    // methods restored by Wails/HMR without leaving wrappers bound to an old Provider.
    return () => {
      active = false
      window.clearInterval(installTimer)
      for (const { app, key, original, wrapped } of wrappedMethods) {
        if (app[key] === wrapped) app[key] = original
      }
    }
  }, [handleAuthFailure])

  // 先从 localStorage 恢复界面会话，再把认证同步给 Go 后端。
  // IPC 瞬断只会触发后台重试；只有明确的认证错误才清理登录态。
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
      const savedToken = localStorage.getItem(TOKEN_KEY)
      const savedUser = localStorage.getItem(USER_KEY)
      const savedServer = localStorage.getItem(SERVER_KEY)

      if (!savedToken || !savedUser || !savedServer) {
        authSyncPendingRef.current = false
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        if (!cancelled) {
          setToken(null)
          setUser(null)
          setIsReady(true)
        }
        return
      }

      let parsedUser: UserInfo
      try {
        parsedUser = JSON.parse(savedUser)
      } catch {
        authSyncPendingRef.current = false
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        if (!cancelled) {
          setToken(null)
          setUser(null)
          setIsReady(true)
        }
        return
      }

      // HMR 重新挂载 Provider 时先保留已有会话，避免等待 bridge 恢复期间路由跳转。
      // 同步完成前发起的子页面请求即使返回 401，也不能抢先清理这份会话。
      authSyncPendingRef.current = true
      if (!cancelled) {
        setToken(savedToken)
        setUser(parsedUser)
        setIsReady(true)
      }

      try {
        await SetAuth(savedServer, savedToken)
        if (!cancelled) authSyncPendingRef.current = false
      } catch (error) {
        if (cancelled) return
        if (isAuthError(error)) {
          authSyncPendingRef.current = false
          handleAuthFailure(error)
          return
        }
        scheduleRetry(attempt)
      }
    }

    void tryRestore(0)

    return () => {
      cancelled = true
      authSyncPendingRef.current = false
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [handleAuthFailure])
  const login = useCallback((newToken: string, newUser: UserInfo, server?: string) => {
    authSyncPendingRef.current = false
    setToken(newToken)
    setUser(newUser)
    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(USER_KEY, JSON.stringify(newUser))
    const normalizedServer = server?.trim().replace(/\/+$/, '')
    if (normalizedServer) localStorage.setItem(SERVER_KEY, normalizedServer)
  }, [])

  const logout = useCallback(() => {
    authSyncPendingRef.current = false
    void ClearAuth().catch(() => undefined)
    clearAuthState()
  }, [clearAuthState])

  return (
    <AuthContext.Provider value={{
      token,
      user,
      isAuthenticated: !!token,
      isReady,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
