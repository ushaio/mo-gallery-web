import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const adminUsername = process.env.ADMIN_USERNAME?.trim() || 'admin'
  const adminPlainPassword = process.env.ADMIN_PASSWORD?.trim() || 'admin123'
  const adminPassword = await bcrypt.hash(adminPlainPassword, 10)
  const shouldUpdatePassword = Boolean(process.env.ADMIN_PASSWORD?.trim())

  const admin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: shouldUpdatePassword ? { password: adminPassword } : {},
    create: {
      username: adminUsername,
      password: adminPassword,
    },
  })

  // Default settings - modify these to change storage provider
  const settings = [
    { key: 'site_title', value: process.env.SITE_TITLE || 'MO GALLERY' },
    { key: 'storage_provider', value: process.env.STORAGE_PROVIDER || 'local' },
    { key: 'cdn_domain', value: process.env.CDN_DOMAIN || '' },
    // GitHub Storage Settings
    { key: 'github_token', value: process.env.GITHUB_TOKEN || '' },
    { key: 'github_repo', value: process.env.GITHUB_REPO || '' },
    { key: 'github_path', value: process.env.GITHUB_PATH || 'uploads' },
    { key: 'github_branch', value: process.env.GITHUB_BRANCH || 'main' },
    { key: 'github_access_method', value: process.env.GITHUB_ACCESS_METHOD || 'jsdelivr' },
    { key: 'github_pages_url', value: process.env.GITHUB_PAGES_URL || '' },
    // R2/S3 Storage Settings
    { key: 's3_access_key_id', value: process.env.R2_ACCESS_KEY_ID || '' },
    { key: 's3_secret_access_key', value: process.env.R2_SECRET_ACCESS_KEY || '' },
    { key: 's3_bucket', value: process.env.R2_BUCKET || '' },
    { key: 's3_endpoint', value: process.env.R2_ENDPOINT || '' },
  ]

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    })
  }

  console.log(
    `Seed data created successfully (admin: ${admin.username}${
      shouldUpdatePassword ? ', password updated' : ''
    })`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
