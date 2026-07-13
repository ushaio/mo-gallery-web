'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'

import { ApiRequestError, ApiUnauthorizedError } from '@/lib/api'
import { consumeAuthFailure, type AuthFailure } from '@/lib/auth-failure'
import { getLinuxDoAuthUrl, isLinuxDoEnabled, login as apiLogin } from '@/lib/api/auth'
import { setAdminLoginSlug, setLoginReturnUrl, setOAuthState } from '@/lib/auth-session'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import AuthFailureNotice from './AuthFailureNotice'

interface AdminLoginClientProps {
  loginSlug: string
}

export default function AdminLoginClient({ loginSlug }: AdminLoginClientProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [authFailure, setAuthFailure] = useState<AuthFailure | null>(null)
  const [loading, setLoading] = useState(false)
  const [linuxDoLoading, setLinuxDoLoading] = useState(false)
  const [linuxDoEnabled, setLinuxDoEnabled] = useState(false)
  const { login } = useAuth()
  const { t } = useLanguage()
  const router = useRouter()

  useEffect(() => {
    queueMicrotask(() => setAuthFailure(consumeAuthFailure()))
    isLinuxDoEnabled().then(setLinuxDoEnabled)
  }, [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { token, user } = await apiLogin({
        username,
        password,
        loginSlug: loginSlug || undefined,
      })
      login(token, user)
      router.push('/admin')
    } catch (err) {
      if (err instanceof ApiUnauthorizedError && err.code === 'INVALID_CREDENTIALS') {
        setError(t('login.invalid_credentials'))
      } else if (err instanceof ApiRequestError && err.code === 'ADMIN_LOGIN_PATH_INVALID') {
        setError(t('login.admin_login_url_invalid'))
      } else if (err instanceof ApiRequestError && err.code === 'LOGIN_FIELDS_REQUIRED') {
        setError(t('login.fields_required'))
      } else {
        setError(err instanceof Error ? err.message : t('login.failed'))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLinuxDoLogin = async () => {
    setError('')
    setLinuxDoLoading(true)

    try {
      const { url, state } = await getLinuxDoAuthUrl(loginSlug || undefined)
      setOAuthState(state)
      setAdminLoginSlug(loginSlug)
      setLoginReturnUrl('/admin')
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate OAuth')
      setLinuxDoLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background pt-24 md:pt-0">
      <div className="w-full max-w-sm">
        <div className="mb-12 text-center">
          <h1 className="font-serif text-5xl font-light tracking-tighter text-foreground mb-4">
            {t('login.title')}
          </h1>
          <p className="font-sans text-xs tracking-[0.2em] text-muted-foreground uppercase">
            {t('login.subtitle')}
          </p>
        </div>

        {authFailure ? <AuthFailureNotice failure={authFailure} /> : null}

        {error ? (
          <div role="alert" className="mb-8 border border-destructive/40 bg-destructive/5 p-4 text-center text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="group">
            <label htmlFor="username" className="block text-[10px] font-bold tracking-[0.2em] uppercase mb-2 text-muted-foreground group-focus-within:text-primary transition-colors">
              {t('login.identity')}
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              className="w-full px-4 py-3 bg-transparent border-b border-border focus:border-primary outline-none transition-colors text-foreground font-mono placeholder:text-muted-foreground/20"
              placeholder={t('login.placeholder_user')}
            />
          </div>

          <div className="group">
            <label htmlFor="password" className="block text-[10px] font-bold tracking-[0.2em] uppercase mb-2 text-muted-foreground group-focus-within:text-primary transition-colors">
              {t('login.passcode')}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full px-4 py-3 bg-transparent border-b border-border focus:border-primary outline-none transition-colors text-foreground font-mono placeholder:text-muted-foreground/20"
              placeholder={t('login.placeholder_pass')}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-foreground text-background font-bold tracking-[0.2em] text-xs uppercase hover:bg-primary hover:text-primary-foreground transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
          >
            {loading ? t('login.auth') : t('login.enter')}
            {loading ? null : <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>

        {linuxDoEnabled ? (
          <>
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-4 text-muted-foreground tracking-widest">
                  {t('login.or')}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLinuxDoLogin}
              disabled={linuxDoLoading}
              className="w-full py-4 bg-[#f8d568] text-[#1a1a1a] font-bold tracking-[0.15em] text-xs uppercase hover:bg-[#f5c842] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 group"
            >
              {linuxDoLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('login.auth')}
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                  </svg>
                  {t('login.linuxdo_login')}
                </>
              )}
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
