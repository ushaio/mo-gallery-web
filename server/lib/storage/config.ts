import 'server-only'
import { db } from '~/server/lib/db'
import { StorageConfig } from './types'
import path from 'path'

const CACHE_TTL_MS = 60_000

let cachedSettings: Record<string, string> | null = null
let cacheExpiresAt = 0
let inflightRequest: Promise<Record<string, string>> | null = null
let cacheVersion = 0

async function getSettings(): Promise<Record<string, string>> {
  const now = Date.now()
  if (cachedSettings && now < cacheExpiresAt) return cachedSettings
  if (inflightRequest) return inflightRequest
  const version = ++cacheVersion
  inflightRequest = db.setting.findMany().then((settings) => {
    if (version === cacheVersion) {
      cachedSettings = Object.fromEntries(settings.map((s) => [s.key, s.value]))
      cacheExpiresAt = Date.now() + CACHE_TTL_MS
      inflightRequest = null
    }
    return cachedSettings ?? Object.fromEntries(settings.map((s) => [s.key, s.value]))
  })
  return inflightRequest
}

export function invalidateSettingsCache() {
  cachedSettings = null
  cacheVersion++
  inflightRequest = null
}

export async function getStorageConfig(providerOverride?: string): Promise<StorageConfig> {
  const settingsMap = await getSettings()

  const provider = (
    providerOverride || settingsMap.storage_provider || 'local'
  ) as 'local' | 'github' | 'r2'

  const config: StorageConfig = { provider }

  switch (provider) {
    case 'local':
      config.localBasePath = path.join(process.cwd(), 'public', 'uploads')
      config.localBaseUrl = '/uploads'
      break
    case 'github':
      config.githubToken = settingsMap.github_token
      config.githubRepo = settingsMap.github_repo
      config.githubPath = settingsMap.github_path || 'uploads'
      config.githubBranch = settingsMap.github_branch || 'main'
      config.githubAccessMethod = (settingsMap.github_access_method || 'jsdelivr') as 'raw' | 'jsdelivr' | 'pages'
      config.githubPagesUrl = settingsMap.github_pages_url
      break
    case 'r2':
      config.r2AccessKeyId = settingsMap.r2_access_key_id
      config.r2SecretAccessKey = settingsMap.r2_secret_access_key
      config.r2Bucket = settingsMap.r2_bucket
      config.r2Endpoint = settingsMap.r2_endpoint
      config.r2PublicUrl = settingsMap.r2_public_url
      config.r2Path = settingsMap.r2_path
      break
  }

  return config
}
