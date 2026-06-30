import { createContext, useContext, useState, useEffect, useCallback, useLayoutEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearDesktopRuntimeCache } from '@/lib/app-cache'
import { AUTH_ERROR_MESSAGE_KEY, getAuthErrorMessage, isAuthError } from '@/lib/auth-errors'
import type { UserInfo } from '@/types'

interface AuthContextType {
  token: string | null
  user: UserInfo | null
  isAuthenticated: boolean
  isReady: boolean
  login: (token: string, user: UserInfo) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const TOKEN_KEY = 'mo-gallery-token'
const USER_KEY = 'mo-gallery-user'
const SERVER_KEY = 'mo-gallery-server'

type WailsFunction = ((...args: unknown[]) => unknown) & {
  __authWrapped?: true
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<UserInfo | null>(null)
  const [isReady, setIsReady] = useState(false)

  const clearAuthState = useCallback(() => {
    setToken(null)
    setUser(null)
    clearDesktopRuntimeCache()
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }, [])

  const handleAuthFailure = useCallback((error?: unknown) => {
    clearAuthState()
    sessionStorage.setItem(AUTH_ERROR_MESSAGE_KEY, getAuthErrorMessage(error))
    navigate('/login', { replace: true })
  }, [clearAuthState, navigate])

  useLayoutEffect(() => {
    const app = (window as any).go?.main?.App
    if (!app) return

    for (const key of Object.keys(app)) {
      const original = app[key] as unknown
      if (typeof original !== 'function') continue
      const originalFn = original as WailsFunction
      if (originalFn.__authWrapped) continue

      const wrapped: WailsFunction = (...args: unknown[]) => {
        const result = originalFn.apply(app, args)
        if (!result || typeof (result as Promise<unknown>).catch !== 'function') return result
        return (result as Promise<unknown>).catch((error: unknown) => {
          if (isAuthError(error)) handleAuthFailure(error)
          throw error
        })
      }
      wrapped.__authWrapped = true
      app[key] = wrapped
    }
  }, [handleAuthFailure])

  // 从 localStorage 恢复，并让 Go 后端先校验 JWT 签名。
  useEffect(() => {
    let cancelled = false

    const restoreAuth = async () => {
      try {
        const savedToken = localStorage.getItem(TOKEN_KEY)
        const savedUser = localStorage.getItem(USER_KEY)
        const savedServer = localStorage.getItem(SERVER_KEY)

        if (savedToken && savedUser && savedServer) {
          await (window as any).go.main.App.SetAuth(savedServer, savedToken)
          if (!cancelled) {
            setToken(savedToken)
            setUser(JSON.parse(savedUser))
          }
        } else {
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(USER_KEY)
        }
      } catch (error) {
        handleAuthFailure(error)
      } finally {
        if (!cancelled) setIsReady(true)
      }
    }

    restoreAuth()

    return () => {
      cancelled = true
    }
  }, [handleAuthFailure])
  const login = useCallback((newToken: string, newUser: UserInfo) => {
    setToken(newToken)
    setUser(newUser)
    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(USER_KEY, JSON.stringify(newUser))
  }, [])

  const logout = useCallback(() => {
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
