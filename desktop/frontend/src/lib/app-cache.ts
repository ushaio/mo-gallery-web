import type { services } from '../../wailsjs/go/models'

type OverviewDTO = services.OverviewDTO
export type EquipmentKind = 'camera' | 'lens'
export type EquipmentItem = services.CameraDTO | services.LensDTO

let overviewCache: OverviewDTO | null = null
const equipmentItemsCache: Record<EquipmentKind, EquipmentItem[]> = { camera: [], lens: [] }
const equipmentLoadedCache: Record<EquipmentKind, boolean> = { camera: false, lens: false }

export function getOverviewCache() {
  return overviewCache
}

export function setOverviewCache(data: OverviewDTO | null) {
  overviewCache = data
}

export function getEquipmentItemsCache(kind: EquipmentKind) {
  return equipmentItemsCache[kind]
}

export function setEquipmentItemsCache(kind: EquipmentKind, items: EquipmentItem[]) {
  equipmentItemsCache[kind] = items
  equipmentLoadedCache[kind] = true
}

export function isEquipmentCacheLoaded(kind: EquipmentKind) {
  return equipmentLoadedCache[kind]
}

export function getDesktopCacheSnapshot() {
  const overviewBytes = estimateBytes(overviewCache)
  const cameraBytes = estimateBytes(equipmentItemsCache.camera)
  const lensBytes = estimateBytes(equipmentItemsCache.lens)

  return {
    overviewLoaded: overviewCache !== null,
    overviewBytes,
    cameraLoaded: equipmentLoadedCache.camera,
    cameraCount: equipmentItemsCache.camera.length,
    cameraBytes,
    lensLoaded: equipmentLoadedCache.lens,
    lensCount: equipmentItemsCache.lens.length,
    lensBytes,
    totalBytes: overviewBytes + cameraBytes + lensBytes,
  }
}

export function clearDesktopRuntimeCache() {
  overviewCache = null
  equipmentItemsCache.camera = []
  equipmentItemsCache.lens = []
  equipmentLoadedCache.camera = false
  equipmentLoadedCache.lens = false
}

function estimateBytes(value: unknown) {
  if (value === null || value === undefined) return 0
  try {
    return new Blob([JSON.stringify(value)]).size
  } catch {
    return 0
  }
}
