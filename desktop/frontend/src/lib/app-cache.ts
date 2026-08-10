import { bumpDataRevision, type DataRevisionKey } from '@/lib/data-revision'
import {
  clearPersistentCache,
  getPersistentCache,
  getPersistentCacheSnapshot,
  PERSISTENT_CACHE_TTL_MS,
  setPersistentCache,
  type PersistentCacheResource,
} from '@/lib/persistent-cache'
import type { Photo } from '@/types'
import type { services } from '../../wailsjs/go/models'

type OverviewDTO = services.OverviewDTO
export type EquipmentKind = 'camera' | 'lens'
export type EquipmentItem = services.CameraDTO | services.LensDTO
export interface PhotosPageCache {
  filterKey: string
  photos: Photo[]
  total: number
  hasMore: boolean
  page: number
  scrollTop: number
  loaded: boolean
}

export type DesktopCacheDomain =
  | 'overview'
  | 'equipment'
  | 'photos'
  | 'albums'
  | 'categories'
  | 'film-rolls'
  | 'stories'
  | 'friends'
  | 'storage-sources'
  | 'settings'

let overviewCache: OverviewDTO | null = null
let overviewCachedAt = 0
let photosPageCache: PhotosPageCache | null = null
let photosPageCacheGeneration = 0
const equipmentItemsCache: Record<EquipmentKind, EquipmentItem[]> = { camera: [], lens: [] }
const equipmentLoadedCache: Record<EquipmentKind, boolean> = { camera: false, lens: false }
const equipmentCachedAt: Record<EquipmentKind, number> = { camera: 0, lens: 0 }

function equipmentResource(kind: EquipmentKind): PersistentCacheResource {
  return kind === 'camera' ? 'equipment-camera' : 'equipment-lens'
}

function hydrateOverviewCache() {
  if (overviewCache) return
  const cached = getPersistentCache<OverviewDTO>('overview')
  if (!cached) return
  overviewCache = cached.data
  overviewCachedAt = cached.savedAt
}

function hydrateEquipmentCache(kind: EquipmentKind) {
  if (equipmentLoadedCache[kind]) return
  const cached = getPersistentCache<EquipmentItem[]>(equipmentResource(kind))
  if (!cached) return
  equipmentItemsCache[kind] = cached.data
  equipmentLoadedCache[kind] = true
  equipmentCachedAt[kind] = cached.savedAt
}

export function getOverviewCache() {
  hydrateOverviewCache()
  return overviewCache
}

export function isOverviewCacheFresh() {
  hydrateOverviewCache()
  return overviewCache !== null && Date.now() - overviewCachedAt <= PERSISTENT_CACHE_TTL_MS.overview
}

export function setOverviewCache(data: OverviewDTO | null) {
  overviewCache = data
  overviewCachedAt = data === null ? 0 : Date.now()
  if (data === null) clearPersistentCache(['overview'])
  else setPersistentCache('overview', data)
}

export function getEquipmentItemsCache(kind: EquipmentKind) {
  hydrateEquipmentCache(kind)
  return equipmentItemsCache[kind]
}

export function setEquipmentItemsCache(kind: EquipmentKind, items: EquipmentItem[]) {
  equipmentItemsCache[kind] = items
  equipmentLoadedCache[kind] = true
  equipmentCachedAt[kind] = Date.now()
  setPersistentCache(equipmentResource(kind), items)
}

export function isEquipmentCacheLoaded(kind: EquipmentKind) {
  hydrateEquipmentCache(kind)
  return equipmentLoadedCache[kind]
}

export function isEquipmentCacheFresh(kind: EquipmentKind) {
  hydrateEquipmentCache(kind)
  return equipmentLoadedCache[kind]
    && Date.now() - equipmentCachedAt[kind] <= PERSISTENT_CACHE_TTL_MS[equipmentResource(kind)]
}

export function getPhotosPageCache() {
  return photosPageCache
}

export function getPhotosPageCacheGeneration() {
  return photosPageCacheGeneration
}

export function setPhotosPageCache(cache: PhotosPageCache | null, generation = photosPageCacheGeneration) {
  if (generation !== photosPageCacheGeneration) return
  photosPageCache = cache
}

export function clearOverviewPageCache() {
  overviewCache = null
  overviewCachedAt = 0
  clearPersistentCache(['overview'])
  bumpDataRevision('overview')
}

export function clearEquipmentCache() {
  equipmentItemsCache.camera = []
  equipmentItemsCache.lens = []
  equipmentLoadedCache.camera = false
  equipmentLoadedCache.lens = false
  equipmentCachedAt.camera = 0
  equipmentCachedAt.lens = 0
  clearPersistentCache(['equipment-camera', 'equipment-lens'])
  bumpDataRevision('equipment')
}

export function clearCloudLibraryPageCache() {
  photosPageCacheGeneration += 1
  photosPageCache = null
  bumpDataRevision('photos')
}

export function invalidateDesktopCache(domains: DesktopCacheDomain[]) {
  const persistentResources: PersistentCacheResource[] = []
  const revisionKeys: DataRevisionKey[] = []
  for (const domain of domains) {
    if (domain === 'overview') clearOverviewPageCache()
    else if (domain === 'equipment') clearEquipmentCache()
    else if (domain === 'photos') clearCloudLibraryPageCache()
    else if (domain === 'storage-sources' || domain === 'settings') {
      revisionKeys.push(domain)
    } else {
      persistentResources.push(domain)
      revisionKeys.push(domain)
    }
  }
  if (persistentResources.length > 0) {
    clearPersistentCache(persistentResources)
  }
  // 菜单页常驻缓存后不会因重新显示而重新加载，用失效计数通知它们下次显示时重新加载一次
  if (revisionKeys.length > 0) bumpDataRevision(...revisionKeys)
}

export function invalidateDesktopCacheForMutation(methodName: string) {
  if (!/^(Create|Update|Delete|Toggle|Batch|Add|Remove|Set|Reorder|Upload)/.test(methodName)) return

  if (/Photo|Upload/.test(methodName)) {
    invalidateDesktopCache(['overview', 'equipment', 'photos', 'albums', 'categories', 'film-rolls', 'stories'])
    return
  }
  if (/Album/.test(methodName)) {
    invalidateDesktopCache(['overview', 'photos', 'albums'])
    return
  }
  if (/FilmRoll/.test(methodName)) {
    invalidateDesktopCache(['overview', 'photos', 'film-rolls'])
    return
  }
  if (/Story/.test(methodName)) {
    invalidateDesktopCache(['overview', 'photos', 'stories'])
    return
  }
  if (/Friend/.test(methodName)) {
    invalidateDesktopCache(['overview', 'friends'])
    return
  }
  if (/StorageSource/.test(methodName)) {
    invalidateDesktopCache(['overview', 'storage-sources'])
    return
  }
  if (/Settings/.test(methodName)) {
    invalidateDesktopCache(['overview', 'settings'])
    return
  }
  if (/Blog|Comment/.test(methodName)) {
    invalidateDesktopCache(['overview'])
  }
}

export function invalidateDesktopCacheForApiRequest(path: string, method = 'GET') {
  const normalizedMethod = method.toUpperCase()
  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD' || normalizedMethod === 'OPTIONS') return

  if (/\/photos(?:\/|$)|\/upload(?:\/|$)/.test(path)) {
    invalidateDesktopCache(['overview', 'equipment', 'photos', 'albums', 'categories', 'film-rolls', 'stories'])
    return
  }
  if (/\/albums(?:\/|$)/.test(path)) {
    invalidateDesktopCache(['overview', 'photos', 'albums'])
    return
  }
  if (/\/film-rolls(?:\/|$)/.test(path)) {
    invalidateDesktopCache(['overview', 'photos', 'film-rolls'])
    return
  }
  if (/\/stories(?:\/|$)/.test(path)) {
    invalidateDesktopCache(['overview', 'photos', 'stories'])
    return
  }
  if (/\/friends(?:\/|$)/.test(path)) {
    invalidateDesktopCache(['overview', 'friends'])
    return
  }
  if (/\/storage-sources(?:\/|$)/.test(path)) {
    invalidateDesktopCache(['overview', 'storage-sources'])
    return
  }
  if (/\/settings(?:\/|$)/.test(path)) {
    invalidateDesktopCache(['overview', 'settings'])
    return
  }
  if (/\/blogs(?:\/|$)|\/comments(?:\/|$)/.test(path)) {
    invalidateDesktopCache(['overview'])
  }
}

export function getDesktopCacheSnapshot() {
  const overviewBytes = estimateBytes(getOverviewCache())
  const cameraItems = getEquipmentItemsCache('camera')
  const lensItems = getEquipmentItemsCache('lens')
  const cameraBytes = estimateBytes(cameraItems)
  const lensBytes = estimateBytes(lensItems)
  const photosBytes = estimateBytes(photosPageCache)
  const overviewPageBytes = overviewBytes + cameraBytes + lensBytes
  const persistent = getPersistentCacheSnapshot()

  return {
    overviewLoaded: overviewCache !== null,
    overviewBytes,
    cameraLoaded: equipmentLoadedCache.camera,
    cameraCount: cameraItems.length,
    cameraBytes,
    lensLoaded: equipmentLoadedCache.lens,
    lensCount: lensItems.length,
    lensBytes,
    overviewPageBytes,
    photosLoaded: photosPageCache?.loaded === true,
    photosCount: photosPageCache?.photos.length ?? 0,
    photosBytes,
    persistentResourceCount: persistent.resourceCount,
    persistentBytes: persistent.bytes,
    totalBytes: overviewPageBytes + photosBytes + persistent.bytes,
  }
}

export function clearDesktopRuntimeCache() {
  overviewCache = null
  overviewCachedAt = 0
  equipmentItemsCache.camera = []
  equipmentItemsCache.lens = []
  equipmentLoadedCache.camera = false
  equipmentLoadedCache.lens = false
  equipmentCachedAt.camera = 0
  equipmentCachedAt.lens = 0
  clearCloudLibraryPageCache()
  bumpDataRevision('overview', 'equipment', 'albums', 'categories', 'film-rolls', 'stories', 'friends', 'storage-sources', 'settings')
}

function estimateBytes(value: unknown) {
  if (value === null || value === undefined) return 0
  try {
    return new Blob([JSON.stringify(value)]).size
  } catch {
    return 0
  }
}
