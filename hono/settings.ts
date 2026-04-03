import 'server-only'
import { Hono } from 'hono'
import { db } from '~/server/lib/db'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { invalidateSettingsCache } from '~/server/lib/storage'

const settings = new Hono<{ Variables: AuthVariables }>()

settings.get('/', authMiddleware, async (c) => {
  try {
    const settingsList = await db.setting.findMany()

    const config: Record<string, string> = {
      site_title: process.env.SITE_TITLE || 'MO GALLERY',
      cdn_domain: process.env.CDN_DOMAIN || '',
      storage_provider: 'local',
      s3_access_key_id: '',
      s3_secret_access_key: '',
      s3_bucket: '',
      s3_endpoint: '',
      s3_public_url: '',
      s3_path: '',
      github_token: '',
      github_repo: '',
      github_path: '',
      github_branch: '',
      github_access_method: '',
      github_pages_url: '',
    }

    const envSettings = ['site_title', 'cdn_domain']
    settingsList.forEach((s) => {
      if (!envSettings.includes(s.key)) {
        config[s.key] = s.value
      }
    })

    return c.json({ success: true, data: config })
  } catch (error) {
    console.error('Get settings error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

settings.patch('/', authMiddleware, async (c) => {
  try {
    const data = await c.req.json()

    const envSettings = ['site_title', 'cdn_domain']
    const filteredData = Object.fromEntries(
      Object.entries(data).filter(([key]) => !envSettings.includes(key))
    )

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
      invalidateSettingsCache()
    }

    const settingsList = await db.setting.findMany()
    const config: Record<string, string> = {
      site_title: process.env.SITE_TITLE || 'MO GALLERY',
      cdn_domain: process.env.CDN_DOMAIN || '',
    }
    settingsList.forEach((s) => {
      if (!envSettings.includes(s.key)) {
        config[s.key] = s.value
      }
    })

    return c.json({ success: true, data: config })
  } catch (error) {
    console.error('Update settings error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default settings
