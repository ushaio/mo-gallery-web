import {
  BatchUpdateLocalAssetOrganization,
  BatchUpdateLocalAssetOrganizationByQuery,
  CancelLocalLibraryScan,
  CloseLocalLibrary,
  CreateLocalLibraryBackup,
  CreateLocalLibraryCollection,
  CreateLocalLibraryTag,
  CopyLocalAssetsToClipboard,
  CreateLocalLibrary,
  CreateLocalLibraryFolder,
  DeleteLocalLibraryFolder,
  DeleteLocalLibraryCollection,
  DeleteLocalLibraryCollectionGroup,
  DeleteLocalLibraryTag,
  GetAlbums,
  GetLocalAssetOriginalPaths,
  GetLocalLibraryEntryState,
  GetLocalLibraryBackups,
  GetLocalLibraryFolderProperties,
  GetLocalLibraryPreferences,
  GetLocalLibrarySnapshot,
  ImportLocalLibraryFiles,
  InitializeLocalLibrary,
  ListLocalAssets,
  CreateLocalAssetQueryToken,
  ListLocalFolders,
  ListLocalLibraryCollectionGroups,
  ListLocalLibraryCollections,
  ListLocalLibraryTags,
  ListLocalLibraryTrashedFolders,
  MoveLocalLibraryFolder,
  PlanLocalLibraryFolderMove,
  ExecuteLocalLibraryFolderMovePlan,
  MoveLocalAssets,
  PlanLocalAssetMove,
  ExecuteLocalAssetMovePlan,
  OpenLocalAssetInDefaultApp,
  OpenLocalAssetInFileManager,
  OpenLocalLibraryFolderInFileManager,
  OpenLocalLibrary,
  PauseLocalLibraryScan,
  PermanentDeleteLocalAssets,
  PermanentDeleteActiveLocalLibraryFolder,
  PermanentDeleteLocalLibraryFolder,
  PreviewLocalLibraryFolderDeletion,
  RecheckMissingLocalAssets,
  RemoveMissingLocalAssets,
  RetryLocalAssetPreviews,
  RemoveRecentLocalLibrary,
  RenameLocalAsset,
  RestoreLocalAsset,
  RestoreLocalLibraryBackup,
  RestoreLocalLibraryFolder,
  ResumeLocalLibraryScan,
  SelectLocalLibraryFolder,
  SelectLocalLibraryImportFiles,
  SetLocalLibraryImportMode,
  SetLocalAssetCollections,
  SetLocalAssetTags,
  StartLocalLibraryScan,
  TrashLocalAssets,
  UpdateLocalAsset,
  UpdateLocalLibraryCollection,
  UpdateLocalLibraryCollectionGroup,
  UpdateLocalLibraryTag,
} from '../../../wailsjs/go/main/App'
import type {
  AssetMaintenanceResult,
  AssetMoveResult,
  AssetFileOperationPlan,
  FolderFileOperationPlan,
  AssetFileOperationExecution,
  AssetOperationResult,
  AssetPage,
  AssetQuery,
  AssetQueryToken,
  BatchAssetOrganizationUpdate,
  BackupInfo,
  BackupOverview,
  EntryState,
  FolderDeletionPreview,
  FolderItem,
  FolderProperties,
  FolderTrashEntry,
  ImportResult,
  LibrarySnapshot,
  LocalLibraryError,
  LocalLibraryImportMode,
  LocalLibraryPreferences,
  LocalTag,
  LocalCollection,
  CollectionGroup,
  UploadAlbum,
} from './types'

function asIsoTime(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  return undefined
}

function normalizeSnapshot(source: any): LibrarySnapshot {
  return {
    sessionId: String(source?.sessionId ?? ''),
    libraryId: String(source?.libraryId ?? ''),
    name: String(source?.name ?? ''),
    rootPath: String(source?.rootPath ?? ''),
    state: String(source?.state ?? 'open'),
    assetCount: Number(source?.assetCount ?? 0),
    missingCount: Number(source?.missingCount ?? 0),
    trashCount: Number(source?.trashCount ?? 0),
    scan: {
      state: String(source?.scan?.state ?? 'idle'),
      current: Number(source?.scan?.current ?? 0),
      total: source?.scan?.total == null ? undefined : Number(source.scan.total),
      lastPath: source?.scan?.lastPath || undefined,
      error: source?.scan?.error || undefined,
      startedAt: asIsoTime(source?.scan?.startedAt),
      finishedAt: asIsoTime(source?.scan?.finishedAt),
    },
  }
}

function normalizeBackup(source: any): BackupInfo {
  return {
    id: String(source?.id ?? ''),
    kind: String(source?.kind ?? ''),
    createdAt: asIsoTime(source?.createdAt) || new Date(0).toISOString(),
    sizeBytes: Number(source?.sizeBytes ?? 0),
  }
}

export function parseLocalLibraryError(error: unknown): LocalLibraryError {
  const fallback = { code: 'UNKNOWN', message: '\u672c\u5730\u8d44\u6e90\u5e93\u64cd\u4f5c\u5931\u8d25' }
  const candidates: unknown[] = [error]
  if (error instanceof Error) candidates.unshift(error.message)
  if (typeof error === 'object' && error && 'message' in error) {
    candidates.unshift((error as { message?: unknown }).message)
  }
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    try {
      const parsed = JSON.parse(candidate) as Partial<LocalLibraryError>
      if (parsed && typeof parsed.message === 'string') {
        return { code: parsed.code || 'UNKNOWN', message: parsed.message, details: parsed.details }
      }
    } catch {
      if (candidate.trim()) return { code: 'UNKNOWN', message: candidate }
    }
  }
  return fallback
}

export const localLibraryApi = {
  async entryState(): Promise<EntryState> {
    const source = await GetLocalLibraryEntryState() as any
    return {
      active: Boolean(source?.active),
      snapshot: source?.snapshot ? normalizeSnapshot(source.snapshot) : undefined,
      recent: Array.isArray(source?.recent) ? source.recent.map((item: any) => ({
        libraryId: String(item?.libraryId ?? ''),
        name: String(item?.name ?? ''),
        path: String(item?.path ?? ''),
        lastOpenedAt: asIsoTime(item?.lastOpenedAt),
        available: Boolean(item?.available),
        reason: item?.reason || undefined,
      })) : [],
    }
  },
  async snapshot() { return normalizeSnapshot(await GetLocalLibrarySnapshot()) },
  async backups(): Promise<BackupOverview> {
    const source = await GetLocalLibraryBackups() as any
    return {
      libraryName: String(source?.libraryName ?? ''),
      libraryRoot: String(source?.libraryRoot ?? ''),
      backups: (source?.backups || []).map(normalizeBackup),
    }
  },
  createBackup: async () => normalizeBackup(await CreateLocalLibraryBackup()),
  restoreBackup: async (id: string) => normalizeSnapshot(await RestoreLocalLibraryBackup(id)),
  selectFolder: (title: string) => SelectLocalLibraryFolder(title),
  selectImportFiles: () => SelectLocalLibraryImportFiles(),
  async preferences(): Promise<LocalLibraryPreferences> {
    const source = await GetLocalLibraryPreferences() as any
    const importMode = source?.importMode
    return { importMode: importMode === 'copy' || importMode === 'move' ? importMode : undefined }
  },
  async setImportMode(importMode: LocalLibraryImportMode): Promise<LocalLibraryPreferences> {
    const source = await SetLocalLibraryImportMode(importMode) as any
    return { importMode: source?.importMode === 'copy' || source?.importMode === 'move' ? source.importMode : undefined }
  },
  async create(root: string, name: string) { return normalizeSnapshot(await CreateLocalLibrary(root, name)) },
  async initialize(root: string, name: string) { return normalizeSnapshot(await InitializeLocalLibrary(root, name)) },
  async open(root: string) { return normalizeSnapshot(await OpenLocalLibrary(root)) },
  close: () => CloseLocalLibrary(),
  removeRecent: (root: string) => RemoveRecentLocalLibrary(root),
  async listAssets(query: AssetQuery): Promise<AssetPage> {
    const source = await ListLocalAssets(query) as any
    return {
      items: Array.isArray(source?.items) ? source.items.map((item: any) => ({
        ...item,
        id: String(item.id),
        byteSize: Number(item.byteSize ?? 0),
        mediaKind: String(item.mediaKind ?? 'image'),
        modifiedAtNs: Number(item.modifiedAtNs ?? 0),
        width: Number(item.width ?? 0),
        height: Number(item.height ?? 0),
        orientation: Number(item.orientation ?? 1),
        trashEntryId: item.trashEntryId || undefined,
        trashEntryKind: item.trashEntryKind || undefined,
        previewError: item.previewError || undefined,
        exif: item.exif ? {
          cameraMake: item.exif.cameraMake || undefined,
          cameraModel: item.exif.cameraModel || undefined,
          lensModel: item.exif.lensModel || undefined,
          iso: item.exif.iso == null ? undefined : Number(item.exif.iso),
          aperture: item.exif.aperture == null ? undefined : Number(item.exif.aperture),
          shutterSeconds: item.exif.shutterSeconds == null ? undefined : Number(item.exif.shutterSeconds),
          focalLengthMm: item.exif.focalLengthMm == null ? undefined : Number(item.exif.focalLengthMm),
          latitude: item.exif.latitude == null ? undefined : Number(item.exif.latitude),
          longitude: item.exif.longitude == null ? undefined : Number(item.exif.longitude),
        } : undefined,
        tags: Array.isArray(item.tags) ? item.tags.map((tag: Record<string, unknown>) => ({
          id: String(tag.id ?? ''), name: String(tag.name ?? ''), color: tag.color ? String(tag.color) : undefined, assetCount: Number(tag.assetCount ?? 0),
        })) : [],
        collections: Array.isArray(item.collections) ? item.collections.map((collection: Record<string, unknown>) => ({
          id: String(collection.id ?? ''), name: String(collection.name ?? ''),
        })) : [],
        rating: Number(item.rating ?? 0),
        frameCount: Number(item.frameCount ?? 1),
        capturedAt: asIsoTime(item.capturedAt),
        discoveredAt: asIsoTime(item.discoveredAt),
      })) : [],
      nextCursor: source?.nextCursor || undefined,
      total: Number(source?.total ?? 0),
      isComplete: Boolean(source?.isComplete),
      scan: normalizeSnapshot({ scan: source?.scan }).scan,
    }
  },
  batchUpdateAssetOrganization: (update: BatchAssetOrganizationUpdate) => BatchUpdateLocalAssetOrganization(update),
  async createAssetQueryToken(query: AssetQuery): Promise<AssetQueryToken> {
    const source = await CreateLocalAssetQueryToken(query) as any
    return { token: String(source.token), total: Number(source.total ?? 0), expiresAt: asIsoTime(source.expiresAt) ?? '' }
  },
  batchUpdateAssetOrganizationByQuery: (token: string, update: Omit<BatchAssetOrganizationUpdate, 'assetIds'>) => BatchUpdateLocalAssetOrganizationByQuery(token, { assetIds: [], ...update }),
  async planAssetMove(assetIds: string[], destinationFolder: string, conflictPolicy: 'skip' | 'rename' = 'skip'): Promise<AssetFileOperationPlan> {
    const source = await PlanLocalAssetMove(assetIds, destinationFolder, conflictPolicy) as any
    return { ...source, conflictPolicy: source?.conflictPolicy === 'rename' ? 'rename' : 'skip', createdAt: asIsoTime(source?.createdAt) ?? '' }
  },
  executeAssetMovePlan: (planId: string): Promise<AssetFileOperationExecution> => ExecuteLocalAssetMovePlan(planId),
  async listTags(): Promise<LocalTag[]> {
    const source = await ListLocalLibraryTags()
    return (source || []).map((item) => ({ id: String(item.id), name: String(item.name), color: item.color || undefined, assetCount: Number(item.assetCount ?? 0) }))
  },
  async createTag(name: string, color = ''): Promise<LocalTag> {
    const item = await CreateLocalLibraryTag(name, color)
    return { id: String(item.id), name: String(item.name), color: item.color || undefined, assetCount: Number(item.assetCount ?? 0) }
  },
  async updateTag(id: string, name: string, color = ''): Promise<LocalTag> {
    const item = await UpdateLocalLibraryTag(id, name, color)
    return { id: String(item.id), name: String(item.name), color: item.color || undefined, assetCount: Number(item.assetCount ?? 0) }
  },
  deleteTag: (id: string) => DeleteLocalLibraryTag(id),
  setAssetTags: (id: string, tagIds: string[]) => SetLocalAssetTags(id, tagIds),
  async listCollectionGroups(): Promise<CollectionGroup[]> {
    const source = await ListLocalLibraryCollectionGroups()
    return (source || []).map((item) => ({ id: String(item.id), parentId: item.parentId || undefined, name: String(item.name), position: Number(item.position ?? 0) }))
  },
  async updateCollectionGroup(id: string, parentId: string | undefined, name: string, position: number): Promise<CollectionGroup> {
    const item = await UpdateLocalLibraryCollectionGroup(id, parentId || null, name, position)
    return { id: String(item.id), parentId: item.parentId || undefined, name: String(item.name), position: Number(item.position ?? 0) }
  },
  deleteCollectionGroup: (id: string, deleteContents: boolean) => DeleteLocalLibraryCollectionGroup(id, deleteContents),
  async listCollections(): Promise<LocalCollection[]> {
    const source = await ListLocalLibraryCollections()
    return (source || []).map((item) => ({ id: String(item.id), groupId: item.groupId || undefined, name: String(item.name), notes: item.notes || undefined, position: Number(item.position ?? 0), assetCount: Number(item.assetCount ?? 0) }))
  },
  async createCollection(groupId: string | undefined, name: string, notes = ''): Promise<LocalCollection> {
    const item = await CreateLocalLibraryCollection(groupId || null, name, notes)
    return { id: String(item.id), groupId: item.groupId || undefined, name: String(item.name), notes: item.notes || undefined, position: Number(item.position ?? 0), assetCount: Number(item.assetCount ?? 0) }
  },
  async updateCollection(id: string, groupId: string | undefined, name: string, notes: string, position: number): Promise<LocalCollection> {
    const item = await UpdateLocalLibraryCollection(id, groupId || null, name, notes, position)
    return { id: String(item.id), groupId: item.groupId || undefined, name: String(item.name), notes: item.notes || undefined, position: Number(item.position ?? 0), assetCount: Number(item.assetCount ?? 0) }
  },
  deleteCollection: (id: string) => DeleteLocalLibraryCollection(id),
  setAssetCollections: (id: string, collectionIds: string[]) => SetLocalAssetCollections(id, collectionIds),
  async listFolders(): Promise<FolderItem[]> {
    const source = await ListLocalFolders() as any[]
    return (source || []).map((item) => ({
      id: String(item.id),
      parentId: item.parentId || undefined,
      relativePath: String(item.relativePath ?? ''),
      name: String(item.name ?? ''),
      assetCount: Number(item.assetCount ?? 0),
    }))
  },
  async createFolder(parentRelative: string, name: string): Promise<FolderItem> {
    const item = await CreateLocalLibraryFolder(parentRelative, name) as any
    return {
      id: String(item.id),
      parentId: item.parentId || undefined,
      relativePath: String(item.relativePath ?? ''),
      name: String(item.name ?? ''),
      assetCount: Number(item.assetCount ?? 0),
    }
  },
  async moveFolder(relative: string, destinationParent: string, topLevelName: string): Promise<FolderItem> {
    const plan = await localLibraryApi.planFolderMove(relative, destinationParent, topLevelName, 'skip')
    const execution = await localLibraryApi.executeFolderMovePlan(plan.id) as any
    if (execution.status !== 'completed') throw new Error('目标位置存在同名文件夹，已跳过移动')
    const item = execution.folder
    return {
      id: String(item.id),
      parentId: item.parentId || undefined,
      relativePath: String(item.relativePath ?? ''),
      name: String(item.name ?? ''),
      assetCount: Number(item.assetCount ?? 0),
    }
  },
  async folderProperties(relative: string): Promise<FolderProperties> {
    const item = await GetLocalLibraryFolderProperties(relative) as any
    return {
      relativePath: String(item.relativePath ?? ''),
      name: String(item.name ?? ''),
      photoCount: Number(item.photoCount ?? 0),
      childCount: Number(item.childCount ?? 0),
      byteSize: Number(item.byteSize ?? 0),
      modifiedAt: asIsoTime(item.modifiedAt) || new Date(0).toISOString(),
      isRoot: Boolean(item.isRoot),
    }
  },
  async previewFolderDeletion(relative: string): Promise<FolderDeletionPreview> {
    const item = await PreviewLocalLibraryFolderDeletion(relative) as any
    return {
      relativePath: String(item.relativePath ?? ''),
      name: String(item.name ?? ''),
      managedAssetCount: Number(item.managedAssetCount ?? 0),
      otherFileCount: Number(item.otherFileCount ?? 0),
      directoryCount: Number(item.directoryCount ?? 0),
      totalBytes: Number(item.totalBytes ?? 0),
    }
  },
  deleteFolder: (relative: string) => DeleteLocalLibraryFolder(relative),
  permanentlyDeleteActiveFolder: (relative: string) => PermanentDeleteActiveLocalLibraryFolder(relative),
  async listTrashedFolders(): Promise<FolderTrashEntry[]> {
    const source = await ListLocalLibraryTrashedFolders() as any[]
    return (source || []).map((item) => ({
      id: String(item.id ?? ''),
      originalPath: String(item.originalPath ?? ''),
      name: String(item.name ?? ''),
      managedAssetCount: Number(item.managedAssetCount ?? 0),
      otherFileCount: Number(item.otherFileCount ?? 0),
      directoryCount: Number(item.directoryCount ?? 0),
      totalBytes: Number(item.totalBytes ?? 0),
      trashedAt: asIsoTime(item.trashedAt) || new Date(0).toISOString(),
    }))
  },
  restoreFolder: (trashId: string, destinationParent: string, topLevelName: string) =>
    RestoreLocalLibraryFolder(trashId, destinationParent, topLevelName),
  permanentlyDeleteFolder: (trashId: string) => PermanentDeleteLocalLibraryFolder(trashId),
  originalPaths: (ids: string[]) => GetLocalAssetOriginalPaths(ids) as Promise<string[]>,
  copyAssetsToClipboard: (ids: string[], cut: boolean) => CopyLocalAssetsToClipboard(ids, cut),
  async listUploadAlbums(): Promise<UploadAlbum[]> {
    const source = await GetAlbums() as any[]
    return (source || []).map((item) => ({ id: String(item.id), name: String(item.name ?? '') }))
  },
  startScan: () => StartLocalLibraryScan(),
  pauseScan: () => PauseLocalLibraryScan(),
  resumeScan: () => ResumeLocalLibraryScan(),
  cancelScan: () => CancelLocalLibraryScan(),
  importFiles: (paths: string[], destination: string) => ImportLocalLibraryFiles(paths, destination) as Promise<ImportResult[]>,
  updateAsset: (id: string, title: string, notes: string, rating: number, color: string, favorite: boolean) =>
    UpdateLocalAsset(id, title, notes, rating, color, favorite),
  renameAsset: (id: string, fileName: string) => RenameLocalAsset(id, fileName) as Promise<AssetMoveResult>,
  async moveAssets(ids: string[], destinationFolder: string): Promise<AssetMoveResult[]> {
    const plan = await PlanLocalAssetMove(ids, destinationFolder, 'skip')
    const execution = await ExecuteLocalAssetMovePlan(plan.id)
    return execution.results
  },
  async planFolderMove(relative: string, destinationParent: string, topLevelName: string, conflictPolicy: 'skip' | 'rename' = 'skip'): Promise<FolderFileOperationPlan> {
    const source = await PlanLocalLibraryFolderMove(relative, destinationParent, topLevelName, conflictPolicy) as any
    return { ...source, conflictPolicy: source?.conflictPolicy === 'rename' ? 'rename' : 'skip', createdAt: asIsoTime(source?.createdAt) ?? '' }
  },
  executeFolderMovePlan: (planId: string) => ExecuteLocalLibraryFolderMovePlan(planId),
  trashAssets: (ids: string[]) => TrashLocalAssets(ids) as Promise<AssetOperationResult[]>,
  permanentlyDeleteAssets: (ids: string[]) => PermanentDeleteLocalAssets(ids) as Promise<AssetOperationResult[]>,
  recheckMissingAssets: (ids: string[]) => RecheckMissingLocalAssets(ids) as Promise<AssetMaintenanceResult[]>,
  retryAssetPreviews: (ids: string[]) => RetryLocalAssetPreviews(ids) as Promise<AssetMaintenanceResult[]>,
  removeMissingAssets: (ids: string[]) => RemoveMissingLocalAssets(ids) as Promise<AssetMaintenanceResult[]>,
  restoreAsset: (id: string) => RestoreLocalAsset(id),
  openInDefaultApp: (id: string) => OpenLocalAssetInDefaultApp(id),
  openAssetInFileManager: (id: string) => OpenLocalAssetInFileManager(id),
  openFolderInFileManager: (relative: string) => OpenLocalLibraryFolderInFileManager(relative),
}

export { normalizeSnapshot }
