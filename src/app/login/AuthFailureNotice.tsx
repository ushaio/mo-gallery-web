'use client'

import { ShieldAlert } from 'lucide-react'

import type { AuthFailure } from '@/lib/auth-failure'
import { useLanguage } from '@/contexts/LanguageContext'

interface AuthFailureNoticeProps {
  failure: AuthFailure
}

export default function AuthFailureNotice({ failure }: AuthFailureNoticeProps) {
  const { t } = useLanguage()
  const gateChanged = failure.code === 'ADMIN_LOGIN_GATE_CHANGED'

  return (
    <div
      role="alert"
      className="mb-8 border border-amber-500/40 bg-amber-500/10 p-4 text-left"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="text-sm font-semibold text-foreground">
            {t(gateChanged ? 'login.admin_gate_changed_title' : 'login.session_expired_title')}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t(gateChanged ? 'login.admin_gate_changed' : 'login.session_expired')}
          </p>
        </div>
      </div>
    </div>
  )
}
