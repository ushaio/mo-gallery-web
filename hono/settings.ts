import 'server-only'
import { Hono } from 'hono'
import { db } from '~/server/lib/db'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { invalidateSettingsCache } from '~/server/lib/storage'
import {
  encryptStoredSecret,
  REDACTED_SECRET,
} from '~/server/lib/stored-secrets'

const settings = new Hono<{ Variables: AuthVariables }>()

const ENV_SETTINGS = new Set(['site_title', 'cdn_domain'])
const SENSITIVE_SETTINGS = new Set([
  'github_token',
  's3_access_key_id',
  's3_secret_access_key',
  'comment_api_key',
])
const WRITABLE_SETTINGS = new Set([
  'storage_provider',
  's3_access_key_id',
  's3_secret_access_key',
  's3_bucket',
  's3_endpoint',
  's3_public_url',
  's3_path',
  'github_token',
  'github_repo',
  'github_path',
  'github_branch',
  'github_access_method',
  'github_pages_url',
  'comment_moderation',
  'blocked_keywords',
  'comment_provider',
  'comment_api_key',
  'comment_api_endpoint',
  'comment_model',
])

function serializeSettings(settingsList: Array<{ key: string; value: string }>) {
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

  for (const setting of settingsList) {
    if (ENV_SETTINGS.has(setting.key)) continue
    config[setting.key] = SENSITIVE_SETTINGS.has(setting.key) && setting.value
      ? REDACTED_SECRET
      : setting.value
  }
  return config
}

settings.get('/', authMiddleware, async (c) => {
  try {
    const settingsList = await db.setting.findMany()

    return c.json({ success: true, data: serializeSettings(settingsList) })
  } catch (error) {
    console.error('Get settings error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

settings.patch('/', authMiddleware, async (c) => {
  try {
    const data = await c.req.json<Record<string, unknown>>()
    const filteredData = Object.fromEntries(Object.entries(data).filter(
      ([key, value]) => WRITABLE_SETTINGS.has(key)
        && !(SENSITIVE_SETTINGS.has(key) && value === REDACTED_SECRET),
    ))

    if (Object.keys(filteredData).length > 0) {
      await db.$transaction(
        Object.keys(filteredData).map((key) =>
          db.setting.upsert({
            where: { key },
            update: {
              value: SENSITIVE_SETTINGS.has(key)
                ? encryptStoredSecret(String(filteredData[key])) || ''
                : String(filteredData[key]),
            },
            create: {
              key,
              value: SENSITIVE_SETTINGS.has(key)
                ? encryptStoredSecret(String(filteredData[key])) || ''
                : String(filteredData[key]),
            },
          }),
        ),
      )
      invalidateSettingsCache()
    }

    const settingsList = await db.setting.findMany()
    return c.json({ success: true, data: serializeSettings(settingsList) })
  } catch (error) {
    console.error('Update settings error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default settings
