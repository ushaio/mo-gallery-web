'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { getLinuxDoAuthUrl, isLinuxDoEnabled } from '@/lib/api'
import { Loader2 } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'

export default function LoginPage() {
  const [error, setError] = useState('')
  const [linuxDoLoading, setLinuxDoLoading] = useState(false)
  const [linuxDoEnabled, setLinuxDoEnabled] = useState<boolean | null>(null)
  const { t } = useLanguage()
  const searchParams = useSearchParams()

  useEffect(() => {
    isLinuxDoEnabled().then(setLinuxDoEnabled)
  }, [])

  const handleLinuxDoLogin = async () => {
    setError('')
    setLinuxDoLoading(true)

    try {
      const { url, state } = await getLinuxDoAuthUrl()
      // Store state for CSRF verification
      sessionStorage.setItem('linuxdo_oauth_state', state)
      
      // Get return URL from query parameter, or use referrer, or default to '/'
      const returnUrlParam = searchParams.get('returnUrl')
      let returnUrl = '/'
      
      if (returnUrlParam) {
        // Use the explicitly passed return URL
        returnUrl = returnUrlParam
      } else {
        // Fallback to referrer if available and not the login page
        const referrer = document.referrer
        if (referrer && !referrer.includes('/login')) {
          try {
            const referrerUrl = new URL(referrer)
            // Only use referrer if it's from the same origin
            if (referrerUrl.origin === window.location.origin) {
              returnUrl = referrerUrl.pathname + referrerUrl.search
            }
          } catch {
            // Invalid referrer URL, use default
          }
        }
      }
      
      sessionStorage.setItem('login_return_url', returnUrl)
      
      // Redirect to Linux DO authorization page
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate OAuth')
      setLinuxDoLoading(false)
    }
  }

  // Show loading while checking OAuth status
  if (linuxDoEnabled === null) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // If no OAuth providers are enabled, show a message
  if (!linuxDoEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-background pt-24 md:pt-0">
        <div className="w-full max-w-sm text-center">
          <h1 className="font-serif text-5xl font-light tracking-tighter text-foreground mb-4">
            {t('login.title')}
          </h1>
          <p className="font-sans text-xs tracking-[0.2em] text-muted-foreground uppercase mb-8">
            {t('login.subtitle')}
          </p>
          <div className="p-6 border border-dashed border-border">
            <p className="text-sm text-muted-foreground">
              {t('login.no_login_methods')}
            </p>
          </div>
        </div>
      </div>
    )
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

        {error && (
          <div className="mb-8 p-4 border border-destructive/50 text-destructive text-xs tracking-widest uppercase text-center">
            {t('common.error')}: {error}
          </div>
        )}

        {/* Linux DO OAuth Login */}
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
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
              </svg>
              {t('login.linuxdo_login')}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
