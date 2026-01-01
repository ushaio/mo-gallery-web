'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { loginWithLinuxDo } from '@/lib/api'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'

function OAuthCallbackContent() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState('')
  const { login } = useAuth()
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
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

      try {
        const { token, user } = await loginWithLinuxDo(code)
        login(token, user)
        setStatus('success')

        // Redirect to admin after a short delay
        setTimeout(() => {
          router.push('/admin')
        }, 1500)
      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : t('login.oauth_failed'))
      }
    }

    handleCallback()
  }, [searchParams, login, router, t])

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
            {t('login.oauth_success')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('login.oauth_redirect')}
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
