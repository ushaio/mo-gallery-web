export type ScanState = 'idle' | 'running' | 'paused' | 'cancelled' | 'completed' | 'failed' | 'suspended'
export type AssetAvailability = 'active' | 'missing' | 'trashed'
export type AssetUploadStatus = 'not-uploaded' | 'uploaded' | 'pending-registration' | 'failed'
export type AssetSort = 'captured' | 'discovered' | 'name' | 'modified' | 'size' | 'rating'
export type AssetSortDirection = 'asc' | 'desc'

export type LocalLibraryImportMode = 'copy' | 'move'

export interface LocalLibraryPreferences {
  importMode?: LocalLibraryImportMode
}

export interface LocalLibraryError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface RecentLibrary {
  libraryId: string
  name: string
  path: string
  lastOpenedAt?: string
  available: boolean
  reason?: string
}

export interface ScanStatus {
  state: ScanState | string
  current: number
  total?: number
  lastPath?: string
  error?: string
  startedAt?: string
  finishedAt?: string
}

export interface LibrarySnapshot {
  sessionId: string
  libraryId: string
  name: string
  rootPath: string
  state: string
  assetCount: number
  missingCount: number
  trashCount: number
  scan: ScanStatus
}

export type BackupKind = 'daily' | 'upgrade' | 'manual' | 'pre-restore'

export interface BackupInfo {
  id: string
  kind: BackupKind | string
  createdAt: string
  sizeBytes: number
}

export interface BackupOverview {
  libraryName: string
  libraryRoot: string
  backups: BackupInfo[]
}

export interface EntryState {
  active: boolean
  recent: RecentLibrary[]
  snapshot?: LibrarySnapshot
}

export interface LibraryUpgradeInfo {
  rootPath: string
  currentVersion: number
  targetVersion: number
  required: boolean
}

export interface FolderItem {
  id: string
  parentId?: string
  relativePath: string
  name: string
  assetCount: number
}

export interface FolderProperties {
  relativePath: string
  name: string
  photoCount: number
  childCount: number
  byteSize: number
  modifiedAt: string
  isRoot: boolean
}

export interface FolderDeletionPreview {
  relativePath: string
  name: string
  managedAssetCount: number
  otherFileCount: number
  directoryCount: number
  totalBytes: number
}

export interface FolderTrashEntry {
  id: string
  originalPath: string
  name: string
  managedAssetCount: number
  otherFileCount: number
  directoryCount: number
  totalBytes: number
  trashedAt: string
}

export interface LocalTag {
  id: string
  name: string
  color?: string
  assetCount: number
}

export interface CollectionGroup {
  id: string
  parentId?: string
  name: string
  position: number
}

export interface LocalCollection {
  id: string
  groupId?: string
  name: string
  notes?: string
  position: number
  assetCount: number
}

export interface AssetCollection {
  id: string
  name: string
}

export interface LocalAssetExif {
  cameraMake?: string
  cameraModel?: string
  lensModel?: string
  iso?: number
  aperture?: number
  shutterSeconds?: number
  focalLengthMm?: number
  latitude?: number
  longitude?: number
}

export interface LocalAsset {
  id: string
  relativePath: string
  fileName: string
  extension: string
  format: string
  mimeType: string
  mediaKind: string
  byteSize: number
  modifiedAtNs: number
  width: number
  height: number
  orientation: number
  isAnimated: boolean
  frameCount: number
  availability: AssetAvailability | string
  trashEntryId?: string
  trashEntryKind?: 'asset' | 'folder' | string
  previewStatus: string
  previewError?: string
  metadataStatus: string
  dominantColors?: string[]
  displayTitle?: string
  notes?: string
  rating: number
  colorLabel?: string
  isFavorite: boolean
  capturedAt?: string
  exif?: LocalAssetExif
  discoveredAt?: string
  thumbnailUrl: string
  previewUrl: string
  originalUrl: string
  cloudPhotoId?: string
  cloudPath?: string
  cloudThumbPath?: string
  cloudStorageSourceId?: string
  cloudStoragePluginId?: string
  cloudUrlType?: string
  cloudRemoteUpdatedAt?: string
  cloudSyncState?: 'synced' | 'pending' | 'conflict' | 'deleted_remote' | 'error' | string
  cloudSyncError?: string
  uploadStatus: AssetUploadStatus
  isUploaded: boolean
  tags: LocalTag[]
  collections: AssetCollection[]
}

export interface AssetPage {
  items: LocalAsset[]
  nextCursor?: string
  total: number
  isComplete: boolean
  scan: ScanStatus
}

export interface AssetStructuredFilters {
  uploadStatus?: 'all' | 'uploaded' | 'not-uploaded'
  photosOnly?: boolean
  ratingMin?: number
  ratingMax?: number
  colorLabels?: string[]
  formats?: string[]
  previewStatuses?: string[]
  capturedFromMs?: number
  capturedToMs?: number
  discoveredFromMs?: number
  discoveredToMs?: number
  cameraMakes?: string[]
  cameraModels?: string[]
  lensModels?: string[]
  isoMin?: number
  isoMax?: number
  apertureMin?: number
  apertureMax?: number
  focalLengthMin?: number
  focalLengthMax?: number
  orientation?: 'landscape' | 'portrait' | 'square'
  widthMin?: number
  widthMax?: number
  heightMin?: number
  heightMax?: number
}

export interface AssetQuery extends AssetStructuredFilters {
  cursor?: string
  limit?: number
  folder?: string
  directFolderOnly?: boolean
  search?: string
  availability?: AssetAvailability
  uploadStatus?: 'all' | 'uploaded' | 'not-uploaded'
  favoritesOnly?: boolean
  photosOnly?: boolean
  tagIds?: string[]
  collectionIds?: string[]
  sort?: AssetSort
  sortDirection?: AssetSortDirection
}

const PHOTO_FORMATS = new Set(['jpeg', 'png', 'gif', 'webp', 'tiff', 'heif', 'avif', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'rw2'])

/** True when the asset is a photo that supports an image preview (vs. a generic file). */
export function isPhotoAsset(asset: Pick<LocalAsset, 'mediaKind' | 'format'>): boolean {
  if (asset.mediaKind === 'file') return false
  if (asset.mediaKind === 'image') return true
  // Fallback for assets reported by an older backend that does not emit mediaKind.
  return PHOTO_FORMATS.has(asset.format.toLowerCase())
}

export interface BatchAssetOrganizationUpdate {
  assetIds: string[]
  rating?: number
  colorLabel?: string
  isFavorite?: boolean
  addTagIds?: string[]
  removeTagIds?: string[]
  addCollectionIds?: string[]
  removeCollectionIds?: string[]
}

export interface ImportResult {
  source: string
  destination?: string
  assetId?: string
  status: string
  error?: string
}

export interface AssetOperationResult {
  assetId: string
  status: string
  error?: string
}

export interface AssetMoveResult {
  assetId: string
  source?: string
  destination?: string
  status: 'moved' | 'unchanged' | 'failed' | string
  error?: string
}

export interface AssetQueryToken {
  token: string
  total: number
  expiresAt: string
}

export interface AssetFileOperationItem {
  assetId: string
  source: string
  destination: string
  conflict: boolean
  warning?: string
}

export interface AssetFileOperationPlan {
  id: string
  version: number
  kind: string
  destinationFolder: string
  conflictPolicy: 'skip' | 'rename'
  items: AssetFileOperationItem[]
  conflictCount: number
  totalBytes: number
  createdAt: string
}

export interface AssetFileOperationExecution {
  planId: string
  status: 'completed' | 'partial' | string
  results: AssetMoveResult[]
}

export interface FolderFileOperationExecution {
  planId: string
  status: string
  folder: FolderItem
}

export interface FolderFileOperationPlan {
  id: string
  version: number
  kind: string
  source: string
  destination: string
  conflictPolicy: 'skip' | 'rename'
  items: Array<{ source: string, destination: string, kind: string, conflict: boolean }>
  managedAssetCount: number
  otherFileCount: number
  directoryCount: number
  totalBytes: number
  conflictCount: number
  createdAt: string
}

export interface AssetMaintenanceResult {
  assetId: string
  status: 'restored' | 'still_missing' | 'removed' | 'failed' | string
  error?: string
}

export interface LocalLibraryEventState {
  state: LibrarySnapshot['state']
  assetCount: number
  missingCount: number
  trashCount: number
  scan: ScanStatus
}

export interface LocalLibraryEvent {
  sessionId: string
  kind: string
  state?: LocalLibraryEventState
  assetId?: string
  previewStatus?: string
}
