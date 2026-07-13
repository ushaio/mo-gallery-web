import { notFound } from 'next/navigation'

import { getAdminLoginSlug, verifyAdminLoginSlug } from '~/server/lib/admin-login-gate'
import AdminLoginClient from '../AdminLoginClient'

interface AdminLoginPageProps {
  params: Promise<{ slug: string }>
}

export default async function AdminLoginPage({ params }: AdminLoginPageProps) {
  const { slug } = await params
  const configuredSlug = getAdminLoginSlug()

  if (!configuredSlug || !verifyAdminLoginSlug(slug)) {
    notFound()
  }

  return <AdminLoginClient loginSlug={slug} />
}
