import type { UploadSettings } from '@/components/admin/ImageUploadSettingsModal'
import { normalizeCompressionMode, normalizeCompressionFormat } from '@/lib/image-compress'

export const LOCAL_LIBRARY_UPLOAD_SETTINGS_KEY = 'local_library_upload_settings'

export const DEFAULT_LOCAL_LIBRARY_UPLOAD_SETTINGS: UploadSettings = {
  compressionMode: 'compress',
  compressionFormat: 'avif',
  showFlag: true,
  stripGps: false,
  categories: [],
  albumIds: [],
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function optionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

function optionalPositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined
}

export function normalizeLocalLibraryUploadSettings(value: unknown): UploadSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_LOCAL_LIBRARY_UPLOAD_SETTINGS }
  }

  const stored = value as Record<string, unknown>
  const compressionMode = ['none', 'compress', 'quality', 'size'].includes(String(stored.compressionMode))
    ? normalizeCompressionMode(stored.compressionMode)
    : DEFAULT_LOCAL_LIBRARY_UPLOAD_SETTINGS.compressionMode

  return {
    ...DEFAULT_LOCAL_LIBRARY_UPLOAD_SETTINGS,
    title: optionalString(stored.title),
    storyId: optionalString(stored.storyId),
    storageProvider: optionalString(stored.storageProvider),
    storageSourceId: optionalString(stored.storageSourceId),
    storagePath: optionalString(stored.storagePath),
    storagePathFull: optionalBoolean(stored.storagePathFull),
    compressionMode,
    compressionFormat: normalizeCompressionFormat(stored.compressionFormat),
    maxSizeMB: optionalPositiveNumber(stored.maxSizeMB),
    showFlag: optionalBoolean(stored.showFlag) ?? DEFAULT_LOCAL_LIBRARY_UPLOAD_SETTINGS.showFlag,
    stripGps: optionalBoolean(stored.stripGps) ?? DEFAULT_LOCAL_LIBRARY_UPLOAD_SETTINGS.stripGps,
    categories: stringArray(stored.categories) ?? DEFAULT_LOCAL_LIBRARY_UPLOAD_SETTINGS.categories,
    albumIds: stringArray(stored.albumIds) ?? DEFAULT_LOCAL_LIBRARY_UPLOAD_SETTINGS.albumIds,
    category: optionalString(stored.category),
    albumId: optionalString(stored.albumId),
  }
}

export function loadLocalLibraryUploadSettings(storage: StorageLike | undefined): UploadSettings {
  if (!storage) return { ...DEFAULT_LOCAL_LIBRARY_UPLOAD_SETTINGS }

  try {
    const raw = storage.getItem(LOCAL_LIBRARY_UPLOAD_SETTINGS_KEY)
    return raw ? normalizeLocalLibraryUploadSettings(JSON.parse(raw)) : { ...DEFAULT_LOCAL_LIBRARY_UPLOAD_SETTINGS }
  } catch {
    return { ...DEFAULT_LOCAL_LIBRARY_UPLOAD_SETTINGS }
  }
}

export function saveLocalLibraryUploadSettings(storage: StorageLike | undefined, settings: UploadSettings) {
  if (!storage) return false

  try {
    storage.setItem(LOCAL_LIBRARY_UPLOAD_SETTINGS_KEY, JSON.stringify(normalizeLocalLibraryUploadSettings(settings)))
    return true
  } catch {
    return false
  }
}
