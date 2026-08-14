import {
  DEFAULT_LOCAL_LIBRARY_UPLOAD_SETTINGS,
  LOCAL_LIBRARY_UPLOAD_SETTINGS_KEY,
  loadLocalLibraryUploadSettings,
  normalizeLocalLibraryUploadSettings,
  saveLocalLibraryUploadSettings,
} from './upload-settings-persistence'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function createMemoryStorage(initialValue?: string) {
  const values = new Map<string, string>()
  if (initialValue !== undefined) values.set(LOCAL_LIBRARY_UPLOAD_SETTINGS_KEY, initialValue)
  return {
    getItem(key: string) {
      return values.get(key) ?? null
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
  }
}

const settings = {
  title: '保留标题',
  storyId: 'story-1',
  storageSourceId: 'storage-1',
  storagePath: 'photos/2026',
  storagePathFull: true,
  compressionMode: 'none' as const,
  compressionFormat: 'webp' as const,
  maxSizeMB: 8,
  showFlag: false,
  stripGps: true,
  categories: ['旅行', '夜景'],
  albumIds: ['album-1'],
}

const storage = createMemoryStorage()
assert(saveLocalLibraryUploadSettings(storage, settings), 'expected upload settings to be saved')
const restored = loadLocalLibraryUploadSettings(storage)
assert(restored.title === settings.title, 'expected title to survive restoration')
assert(restored.storyId === settings.storyId, 'expected story selection to survive restoration')
assert(restored.storageSourceId === settings.storageSourceId, 'expected storage source to survive restoration')
assert(restored.storagePath === settings.storagePath, 'expected storage path to survive restoration')
assert(restored.storagePathFull === settings.storagePathFull, 'expected storage path mode to survive restoration')
assert(restored.compressionMode === settings.compressionMode, 'expected compression mode to survive restoration')
assert(restored.compressionFormat === settings.compressionFormat, 'expected compression format to survive restoration')
assert(restored.maxSizeMB === settings.maxSizeMB, 'expected maximum size to survive restoration')
assert(restored.showFlag === settings.showFlag, 'expected visibility to survive restoration')
assert(restored.stripGps === settings.stripGps, 'expected privacy settings to survive restoration')
assert(JSON.stringify(restored.categories) === JSON.stringify(settings.categories), 'expected categories to survive restoration')
assert(JSON.stringify(restored.albumIds) === JSON.stringify(settings.albumIds), 'expected albums to survive restoration')

const malformed = loadLocalLibraryUploadSettings(createMemoryStorage('{invalid json'))
assert(
  JSON.stringify(malformed) === JSON.stringify(DEFAULT_LOCAL_LIBRARY_UPLOAD_SETTINGS),
  'expected malformed persisted data to fall back to defaults',
)

const normalized = normalizeLocalLibraryUploadSettings({
  compressionMode: 'quality',
  compressionFormat: 'jpeg',
  showFlag: 'false',
  stripGps: true,
  maxSizeMB: -1,
  categories: ['有效', 1, null],
  albumIds: 'album-1',
})
assert(normalized.compressionMode === 'compress', 'expected legacy compression modes to normalize')
assert(normalized.compressionFormat === 'avif', 'expected invalid compression formats to fall back to AVIF')
assert(normalized.showFlag === true, 'expected invalid booleans to fall back to defaults')
assert(normalized.stripGps === true, 'expected valid booleans to be preserved')
assert(normalized.maxSizeMB === undefined, 'expected invalid maximum size to be discarded')
assert(JSON.stringify(normalized.categories) === JSON.stringify(['有效']), 'expected invalid category entries to be discarded')
assert(JSON.stringify(normalized.albumIds) === JSON.stringify([]), 'expected invalid album lists to fall back to defaults')
