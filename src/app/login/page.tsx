import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'

import { getAdminLoginSlug } from '~/server/lib/admin-login-gate'
import AdminLoginClient from './AdminLoginClient'
import PublicLoginClient from './PublicLoginClient'

function LoginLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  )
}

export default function LoginPage() {
  const adminLoginSlug = getAdminLoginSlug()

  if (!adminLoginSlug) {
    return <AdminLoginClient loginSlug="" />
  }

  return (
    <Suspense fallback={<LoginLoading />}>
      <PublicLoginClient />
    </Suspense>
  )
}
