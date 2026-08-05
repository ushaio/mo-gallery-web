const CACHE_PREFIX = 'mo-gallery:desktop-cache'
const CACHE_SCHEMA_VERSION = 2

export type PersistentCacheResource =
  | 'overview'
  | 'equipment-camera'
  | 'equipment-lens'
  | 'albums'
  | 'categories'
  | 'film-rolls'
  | 'stories'
  | 'friends'

interface PersistentCacheRecord<T> {
  schemaVersion: number
  savedAt: number
  data: T
}

export const PERSISTENT_CACHE_TTL_MS: Record<PersistentCacheResource, number> = {
  overview: 2 * 60 * 1000,
  'equipment-camera': 30 * 60 * 1000,
  'equipment-lens': 30 * 60 * 1000,
  albums: 10 * 60 * 1000,
  categories: 24 * 60 * 60 * 1000,
  'film-rolls': 10 * 60 * 1000,
  stories: 10 * 60 * 1000,
  friends: 10 * 60 * 1000,
}

export interface PersistentCacheEntry<T> {
  data: T
  savedAt: number
  fresh: boolean
}

interface InFlightLoad<T = unknown> {
  generation: number
  globalGeneration: number
  promise: Promise<T>
}

const inFlightLoads = new Map<string, InFlightLoad>()
const resourceGenerations = new Map<string, number>()
let globalGeneration = 0
let legacyCleanupAttempted = false

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    const storage = window.localStorage
    if (!legacyCleanupAttempted) {
      legacyCleanupAttempted = true
      const currentPrefix = `${CACHE_PREFIX}:v${CACHE_SCHEMA_VERSION}:`
      const legacyKeys: string[] = []
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (key?.startsWith(`${CACHE_PREFIX}:`) && !key.startsWith(currentPrefix)) legacyKeys.push(key)
      }
      for (const key of legacyKeys) storage.removeItem(key)
    }
    return storage
  } catch {
    return null
  }
}

function normalizeScopePart(value: string) {
  return encodeURIComponent(value.trim().toLowerCase())
}

function currentScope(storage = getStorage()) {
  if (!storage) return null

  try {
    const server = storage.getItem('mo-gallery-server')?.replace(/\/+$/, '')
    const rawUser = storage.getItem('mo-gallery-user')
    if (!server || !rawUser) return null

    const user = JSON.parse(rawUser) as { id?: string; username?: string }
    const identity = user.id || user.username
    if (!identity) return null
    return `${normalizeScopePart(server)}:${normalizeScopePart(identity)}`
  } catch {
    return null
  }
}

export function getCurrentPersistentCacheScope() {
  return currentScope()
}

function resourceKey(resource: PersistentCacheResource) {
  const scope = currentScope()
  return scope ? `${CACHE_PREFIX}:v${CACHE_SCHEMA_VERSION}:${scope}:${resource}` : null
}

function generationKey(resource: PersistentCacheResource, key: string | null) {
  return key ?? `volatile:${resource}`
}

function getGeneration(key: string) {
  return resourceGenerations.get(key) ?? 0
}

function invalidateGeneration(key: string) {
  resourceGenerations.set(key, getGeneration(key) + 1)
  inFlightLoads.delete(key)
}

function safelyRemove(storage: Storage, key: string) {
  try {
    storage.removeItem(key)
  } catch {
    // Cache cleanup is best effort when storage access is restricted.
  }
}

export function getPersistentCache<T>(resource: PersistentCacheResource): PersistentCacheEntry<T> | null {
  const storage = getStorage()
  const key = resourceKey(resource)
  if (!storage || !key) return null

  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const record = JSON.parse(raw) as PersistentCacheRecord<T>
    if (record.schemaVersion !== CACHE_SCHEMA_VERSION || typeof record.savedAt !== 'number') {
      safelyRemove(storage, key)
      return null
    }
    return {
      data: record.data,
      savedAt: record.savedAt,
      fresh: Date.now() - record.savedAt <= PERSISTENT_CACHE_TTL_MS[resource],
    }
  } catch {
    safelyRemove(storage, key)
    return null
  }
}

function projectPersistentData<T>(resource: PersistentCacheResource, data: T): T {
  if (!Array.isArray(data)) return data

  if (resource === 'albums') {
    return data.map((value) => {
      const album = value as Record<string, unknown>
      return {
        id: album.id,
        name: album.name,
        description: album.description,
        coverUrl: album.coverUrl,
        location: album.location,
        isPublished: album.isPublished,
        sortOrder: album.sortOrder,
        photoCount: album.photoCount,
        createdAt: album.createdAt,
        updatedAt: album.updatedAt,
      }
    }) as T
  }

  if (resource === 'stories') {
    return data.map((value) => {
      const story = value as Record<string, unknown>
      const photos = Array.isArray(story.photos) ? story.photos : []
      return {
        id: story.id,
        title: story.title,
        coverPhotoId: story.coverPhotoId,
        coverCrop: story.coverCrop,
        isPublished: story.isPublished,
        storyDate: story.storyDate,
        createdAt: story.createdAt,
        updatedAt: story.updatedAt,
        photoCount: story.photoCount ?? photos.length,
      }
    }) as T
  }

  if (resource === 'film-rolls') {
    return data.map((value) => {
      const {
        photos: _photos,
        filmPhotos: _filmPhotos,
        ...filmRoll
      } = value as Record<string, unknown>
      return filmRoll
    }) as T
  }

  return data
}

function setPersistentCacheByKey<T>(resource: PersistentCacheResource, key: string | null, data: T) {
  const storage = getStorage()
  if (!storage || !key) return

  try {
    const record: PersistentCacheRecord<T> = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      savedAt: Date.now(),
      data: projectPersistentData(resource, data),
    }
    storage.setItem(key, JSON.stringify(record))
  } catch {
    // Cache writes are best effort. Quota/privacy errors must not break the page.
  }
}

export function setPersistentCache<T>(resource: PersistentCacheResource, data: T) {
  setPersistentCacheByKey(resource, resourceKey(resource), data)
}

export function clearCurrentPersistentCache(resources?: PersistentCacheResource[]) {
  const storage = getStorage()
  const scope = currentScope(storage)
  if (!storage || !scope) return

  const targets = resources ?? (Object.keys(PERSISTENT_CACHE_TTL_MS) as PersistentCacheResource[])
  for (const resource of targets) {
    const key = `${CACHE_PREFIX}:v${CACHE_SCHEMA_VERSION}:${scope}:${resource}`
    invalidateGeneration(key)
    safelyRemove(storage, key)
  }
}

export function clearPersistentCache(resources?: PersistentCacheResource[]) {
  if (resources) {
    clearCurrentPersistentCache(resources)
    return
  }

  globalGeneration += 1
  inFlightLoads.clear()

  const storage = getStorage()
  if (!storage) return

  try {
    const prefix = `${CACHE_PREFIX}:`
    const keys: string[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(prefix)) keys.push(key)
    }
    for (const key of keys) safelyRemove(storage, key)
  } catch {
    // Cache cleanup is best effort when storage enumeration is restricted.
  }
}

export function getPersistentCacheSnapshot() {
  const storage = getStorage()
  if (!storage) return { resourceCount: 0, bytes: 0 }

  const resources = Object.keys(PERSISTENT_CACHE_TTL_MS) as PersistentCacheResource[]
  let resourceCount = 0
  let bytes = 0

  try {
    for (const resource of resources) {
      const key = resourceKey(resource)
      if (!key) continue
      const value = storage.getItem(key)
      if (!value) continue
      resourceCount += 1
      bytes += new Blob([value]).size
    }
  } catch {
    return { resourceCount: 0, bytes: 0 }
  }

  return { resourceCount, bytes }
}

export async function loadPersistentResource<T>(
  resource: PersistentCacheResource,
  loader: () => Promise<T>,
  options: { force?: boolean; allowStaleOnError?: boolean } = {},
): Promise<T> {
  const key = resourceKey(resource)
  const cached = getPersistentCache<T>(resource)
  if (!options.force && cached?.fresh) return cached.data

  const inFlightKey = generationKey(resource, key)
  if (options.force) invalidateGeneration(inFlightKey)

  const generation = getGeneration(inFlightKey)
  const capturedGlobalGeneration = globalGeneration
  const existing = inFlightLoads.get(inFlightKey) as InFlightLoad<T> | undefined
  if (
    existing
    && existing.generation === generation
    && existing.globalGeneration === capturedGlobalGeneration
  ) return existing.promise

  const request = loader()
    .then((data) => {
      if (
        getGeneration(inFlightKey) === generation
        && globalGeneration === capturedGlobalGeneration
      ) setPersistentCacheByKey(resource, key, data)
      return data
    })
    .catch((error) => {
      if (
        options.allowStaleOnError !== false
        && cached
        && getGeneration(inFlightKey) === generation
        && globalGeneration === capturedGlobalGeneration
      ) return cached.data
      throw error
    })
    .finally(() => {
      const active = inFlightLoads.get(inFlightKey)
      if (active?.promise === request) inFlightLoads.delete(inFlightKey)
    })

  inFlightLoads.set(inFlightKey, {
    generation,
    globalGeneration: capturedGlobalGeneration,
    promise: request,
  })
  return request
}
