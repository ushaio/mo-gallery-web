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

/**
 * Build a StorageConfig from a StorageSource record (new multi-instance path).
 */
export function storageConfigFromSource(source: {
  type: string
  accessKey?: string | null
  secretKey?: string | null
  bucket?: string | null
  region?: string | null
  endpoint?: string | null
  publicUrl?: string | null
  basePath?: string | null
  branch?: string | null
  accessMethod?: string | null
}): StorageConfig {
  const type = source.type as 'local' | 'github' | 's3'

  switch (type) {
    case 'local':
      return {
        provider: 'local',
        localBasePath: source.basePath
          ? path.join(process.cwd(), 'public', 'uploads', source.basePath)
          : path.join(process.cwd(), 'public', 'uploads'),
        localBaseUrl: source.basePath ? `/uploads/${source.basePath}` : '/uploads',
      }

    case 'github':
      return {
        provider: 'github',
        githubToken: source.accessKey ?? undefined,
        githubRepo: source.bucket ?? undefined,
        githubPath: source.basePath ?? undefined,
        githubBranch: source.branch ?? 'main',
        githubAccessMethod: (source.accessMethod as 'raw' | 'jsdelivr' | 'pages') ?? 'jsdelivr',
        githubPagesUrl: source.publicUrl ?? undefined,
      }

    case 's3':
      return {
        provider: 's3',
        s3AccessKeyId: source.accessKey ?? undefined,
        s3SecretAccessKey: source.secretKey ?? undefined,
        s3Bucket: source.bucket ?? undefined,
        s3Region: source.region ?? undefined,
        s3Endpoint: source.endpoint ?? undefined,
        s3PublicUrl: source.publicUrl ?? undefined,
        s3Path: source.basePath ?? undefined,
      }

    default:
      throw new Error(`Unknown storage source type: ${type}`)
  }
}

/**
 * Load StorageConfig by StorageSource ID (new path).
 * Falls back to legacy settings-based loading when sourceId is absent.
 */
export async function getStorageConfigBySourceId(sourceId: string): Promise<StorageConfig> {
  const source = await db.storageSource.findUnique({ where: { id: sourceId } })
  if (!source) throw new Error(`StorageSource not found: ${sourceId}`)
  return storageConfigFromSource(source)
}

/**
 * Legacy: load StorageConfig from flat Setting table by provider type string.
 * Used for old photos that have no storageSourceId, and for the storage scan UI.
 */
export async function getStorageConfig(providerOverride?: string): Promise<StorageConfig> {
  const settingsMap = await getSettings()

  const provider = (
    providerOverride || settingsMap.storage_provider || 'local'
  ) as 'local' | 'github' | 's3'

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
    case 's3':
      config.s3AccessKeyId = settingsMap.s3_access_key_id
      config.s3SecretAccessKey = settingsMap.s3_secret_access_key
      config.s3Bucket = settingsMap.s3_bucket
      config.s3Endpoint = settingsMap.s3_endpoint
      config.s3PublicUrl = settingsMap.s3_public_url
      config.s3Path = settingsMap.s3_path
      break
  }

  return config
}
