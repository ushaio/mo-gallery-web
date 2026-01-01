'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { loginWithLinuxDo, bindLinuxDoAccount } from '@/lib/api'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'

function OAuthCallbackContent() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [isBindFlow, setIsBindFlow] = useState(false)
  const [redirectUrl, setRedirectUrl] = useState('/')
  const hasProcessed = useRef(false)
  const { login, token, isReady } = useAuth()
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Wait for auth context to be ready before processing
    if (!isReady) return

    // Prevent duplicate processing
    if (hasProcessed.current) return
    hasProcessed.current = true

    const handleCallback = async () => {
      const code = searchParams.get('code')
      const state = searchParams.get('state')
      const errorParam = searchParams.get('error')

      if (errorParam) {
        setStatus('error')
        setError(searchParams.get('error_description') || errorParam)
        return
      }

      if (!code) {
        setStatus('error')
        setError(t('login.oauth_no_code'))
        return
      }

      // Verify state for CSRF protection (optional but recommended)
      const savedState = sessionStorage.getItem('linuxdo_oauth_state')
      if (savedState && state !== savedState) {
        setStatus('error')
        setError(t('login.oauth_state_mismatch'))
        return
      }
      sessionStorage.removeItem('linuxdo_oauth_state')

      // Check if this is an admin bind flow
      const adminBindFlow = sessionStorage.getItem('linuxdo_admin_bind') === 'true'
      const bindReturnUrl = sessionStorage.getItem('linuxdo_bind_return_url')
      sessionStorage.removeItem('linuxdo_admin_bind')
      sessionStorage.removeItem('linuxdo_bind_return_url')

      if (adminBindFlow) {
        // Admin binding flow - need existing token from localStorage (more reliable)
        setIsBindFlow(true)
        const storedToken = token || localStorage.getItem('token')
        if (!storedToken) {
          setStatus('error')
          setError('Authentication required for binding')
          return
        }

        try {
          await bindLinuxDoAccount(storedToken, code)
          setStatus('success')
          setRedirectUrl(bindReturnUrl || '/admin/settings')

          // Return to admin settings page
          setTimeout(() => {
            router.push(bindReturnUrl || '/admin/settings')
          }, 1500)
        } catch (err) {
          setStatus('error')
          setError(err instanceof Error ? err.message : t('login.oauth_failed'))
        }
        return
      }

      // Normal login flow
      // Get the return URL (where user came from before login)
      const returnUrl = sessionStorage.getItem('login_return_url') || '/'
      sessionStorage.removeItem('login_return_url')

      try {
        const { token: newToken, user } = await loginWithLinuxDo(code)
        login(newToken, user)
        setStatus('success')
        setIsAdmin(user.isAdmin || false)

        // Determine redirect URL
        // If there's a specific return URL (not just '/'), use it for all users
        // Otherwise, admin users go to admin panel, regular users go to home
        let finalRedirectUrl = '/'
        if (returnUrl && returnUrl !== '/') {
          // User came from a specific page, return them there
          finalRedirectUrl = returnUrl
        } else if (user.isAdmin) {
          // Admin users with no specific return URL go to admin panel
          finalRedirectUrl = '/admin'
        }
        
        setRedirectUrl(finalRedirectUrl)

        // Redirect
        setTimeout(() => {
          router.push(finalRedirectUrl)
        }, 1500)
      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : t('login.oauth_failed'))
      }
    }

    handleCallback()
  }, [searchParams, login, router, t, token, isReady])

  const getRedirectMessage = () => {
    if (isBindFlow) {
      return t('login.oauth_redirect_home')
    }
    if (redirectUrl === '/admin') {
      return t('login.oauth_redirect')
    }
    return t('login.oauth_redirect_home')
  }

  return (
    <div className="w-full max-w-sm text-center">
      {status === 'loading' && (
        <>
          <Loader2 className="w-12 h-12 mx-auto mb-6 animate-spin text-primary" />
          <h1 className="font-serif text-2xl font-light tracking-tighter text-foreground mb-2">
            {t('login.oauth_processing')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('login.oauth_wait')}
          </p>
        </>
      )}

      {status === 'success' && (
        <>
          <CheckCircle className="w-12 h-12 mx-auto mb-6 text-green-500" />
          <h1 className="font-serif text-2xl font-light tracking-tighter text-foreground mb-2">
            {isBindFlow ? t('admin.linuxdo_bound') : t('login.oauth_success')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {getRedirectMessage()}
          </p>
        </>
      )}

      {status === 'error' && (
        <>
          <XCircle className="w-12 h-12 mx-auto mb-6 text-destructive" />
          <h1 className="font-serif text-2xl font-light tracking-tighter text-foreground mb-2">
            {t('login.oauth_error')}
          </h1>
          <p className="text-sm text-destructive mb-6">
            {error}
          </p>
          <button
            onClick={() => router.push('/login')}
            className="px-6 py-3 bg-foreground text-background font-bold tracking-[0.15em] text-xs uppercase hover:bg-primary hover:text-primary-foreground transition-all duration-300"
          >
            {t('login.back_to_login')}
          </button>
        </>
      )}
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="w-full max-w-sm text-center">
      <Loader2 className="w-12 h-12 mx-auto mb-6 animate-spin text-primary" />
      <h1 className="font-serif text-2xl font-light tracking-tighter text-foreground mb-2">
        Loading...
      </h1>
    </div>
  )
}

export default function OAuthCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <Suspense fallback={<LoadingFallback />}>
        <OAuthCallbackContent />
      </Suspense>
    </div>
  )
}
