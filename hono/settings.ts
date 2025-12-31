import 'server-only'
import { Hono } from 'hono'
import { db } from '~/server/lib/db'
import { authMiddleware, AuthVariables } from './middleware/auth'

const settings = new Hono<{ Variables: AuthVariables }>()

// Public endpoint for getting public settings (no auth required)
// These settings are read from environment variables
settings.get('/public', async (c) => {
  const config = {
    site_title: process.env.SITE_TITLE || 'MO GALLERY',
    cdn_domain: process.env.CDN_DOMAIN || '',
  }

  return c.json({
    success: true,
    data: config,
  })
})

// Protected settings endpoints
settings.get('/', authMiddleware, async (c) => {
  try {
    const settingsList = await db.setting.findMany()

    const config: Record<string, string> = {
      // These are read from environment variables (read-only)
      site_title: process.env.SITE_TITLE || 'MO GALLERY',
      cdn_domain: process.env.CDN_DOMAIN || '',
      // These are stored in database
      storage_provider: 'local',
      r2_access_key_id: '',
      r2_secret_access_key: '',
      r2_bucket: '',
      r2_endpoint: '',
      r2_public_url: '',
      r2_path: '',
      github_token: '',
      github_repo: '',
      github_path: '',
      github_branch: '',
      github_access_method: '',
      github_pages_url: '',
    }

    // Only apply database values for non-env settings
    const envSettings = ['site_title', 'cdn_domain']
    settingsList.forEach((s) => {
      if (!envSettings.includes(s.key)) {
        config[s.key] = s.value
      }
    })

    return c.json({
      success: true,
      data: config,
    })
  } catch (error) {
    console.error('Get settings error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

settings.patch('/', authMiddleware, async (c) => {
  try {
    const data = await c.req.json()

    // Filter out environment-based settings (they cannot be changed via API)
    const envSettings = ['site_title', 'cdn_domain']
    const filteredData = Object.fromEntries(
      Object.entries(data).filter(([key]) => !envSettings.includes(key))
    )

    // Use transaction to avoid prepared statement conflicts with connection poolers
    if (Object.keys(filteredData).length > 0) {
      await db.$transaction(
        Object.keys(filteredData).map((key) =>
          db.setting.upsert({
            where: { key },
            update: { value: String(filteredData[key]) },
            create: { key, value: String(filteredData[key]) },
          }),
        ),
      )
    }

    // Return updated settings (including env-based ones)
    const settingsList = await db.setting.findMany()
    const config: Record<string, string> = {
      // These are read from environment variables (read-only)
      site_title: process.env.SITE_TITLE || 'MO GALLERY',
      cdn_domain: process.env.CDN_DOMAIN || '',
    }

    settingsList.forEach((s) => {
      if (!envSettings.includes(s.key)) {
        config[s.key] = s.value
      }
    })

    return c.json({
      success: true,
      data: config,
    })
  } catch (error) {
    console.error('Update settings error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default settings
