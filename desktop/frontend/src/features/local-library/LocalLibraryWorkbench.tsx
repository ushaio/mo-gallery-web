import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CSSProperties } from 'react'
import {
  ArchiveRestore, ArrowDown, ArrowUp, ChevronDown, DatabaseBackup, FileQuestion, Folder, FolderInput, FolderOpen, FolderPen, FolderPlus, Heart, Images, Info, Loader2,
  Pause, Play, RefreshCw, Search, Square, Trash2, Upload, X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/ContextMenu'
import { useUploadIntentStore } from '@/store/upload-intent'
import { EventsOn, OnFileDrop, OnFileDropOff } from '../../../wailsjs/runtime/runtime'
import { localLibraryApi, parseLocalLibraryError } from './api'
import { CreateFolderDialog } from './CreateFolderDialog'
import { DeleteAssetDialog } from './DeleteAssetDialog'
import { DeleteFolderDialog } from './DeleteFolderDialog'
import { FolderPropertiesDialog } from './FolderPropertiesDialog'
import { FolderTrashSection } from './FolderTrashSection'
import { ImportModeDialog } from './ImportModeDialog'
import { LocalAssetBatchDetails } from './LocalAssetBatchDetails'
import { LocalAssetDetails } from './LocalAssetDetails'
import { LocalAssetFilters } from './LocalAssetFilters'
import { LocalAssetGrid } from './LocalAssetGrid'
import { LocalLibraryPreview } from './LocalLibraryPreview'
import { LocalLibraryBackupDialog } from './LocalLibraryBackupDialog'
import { MoveFolderDialog } from './MoveFolderDialog'
import { AssetFileOperationDialog } from './AssetFileOperationDialog'
import { OrganizationEditorDialog } from './OrganizationEditorDialog'
import type { OrganizationEditorTarget } from './OrganizationEditorDialog'
import { OrganizationNavigation } from './OrganizationNavigation'
import type { OrganizationDeleteTarget } from './OrganizationNavigation'
import { DeleteOrganizationDialog } from './DeleteOrganizationDialog'
import { PermanentDeleteFolderDialog } from './PermanentDeleteFolderDialog'
import { RemoveMissingAssetDialog } from './RemoveMissingAssetDialog'
import { RestoreFolderDialog } from './RestoreFolderDialog'
import { useLocalLibraryStore } from './store'
import type { AssetPage, BackupOverview, BatchAssetOrganizationUpdate, FolderDeletionPreview, FolderItem, FolderProperties, FolderTrashEntry, LibrarySnapshot, LocalAsset, LocalLibraryEvent, LocalLibraryImportMode, UploadAlbum, LocalTag, LocalCollection, CollectionGroup } from './types'
import type { LocalLibraryCopy } from './copy'

interface Props {
  copy: LocalLibraryCopy
  snapshot: LibrarySnapshot
  onSnapshot: (snapshot: LibrarySnapshot) => void
  onClose: () => void
}

const EMPTY_PAGE: AssetPage = {
  items: [], nextCursor: undefined, total: 0, isComplete: false,
  scan: { state: 'idle', current: 0 },
}

function scanLabel(snapshot: LibrarySnapshot, copy: LocalLibraryCopy) {
  if (snapshot.state === 'suspended' || snapshot.scan.state === 'suspended') return copy.librarySuspended
  if (snapshot.state === 'repair_required') return copy.libraryIdentityMismatch
  switch (snapshot.scan.state) {
    case 'running': return copy.scanning
    case 'paused': return copy.scanPaused
    case 'failed': return copy.scanFailed
    default: return copy.scanDone
  }
}

function runResultsMessage<T extends { status: string; error?: string }>(results: T[], success: string, partial: string) {
  const failed = results.filter((item) => item.status === 'failed')
  if (failed.length === 0) toast.success(success)
  else toast.error(`${partial} (${failed.length}/${results.length})`, { description: failed[0]?.error })
}

interface FolderTarget {
  relativePath: string
  name: string
  isRoot: boolean
}

export function LocalLibraryWorkbench({ copy, snapshot, onSnapshot, onClose }: Props) {
  const navigate = useNavigate()
  const {
    folder, search, sort, sortDirection, availability, favoritesOnly, tagIds, collectionIds, filters, selectedAsset, previewAsset,
    setFolder, setSearch, setSort, setSortDirection, setAvailability, setFavoritesOnly, setTagIds, setCollectionIds, setFilters, clearFilters, selectAsset, setPreviewAsset,
  } = useLocalLibraryStore()
  const deferredSearch = useDeferredValue(search.trim())
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [page, setPage] = useState<AssetPage>(EMPTY_PAGE)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingSaveCountRef = useRef(0)
  const [deleteAsset, setDeleteAsset] = useState<LocalAsset | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [missingMaintenanceBusy, setMissingMaintenanceBusy] = useState(false)
  const [previewMaintenanceBusy, setPreviewMaintenanceBusy] = useState(false)
  const [removeMissingAsset, setRemoveMissingAsset] = useState<LocalAsset | null>(null)
  const [dropTargetFolder, setDropTargetFolder] = useState<string | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const importBusyRef = useRef(false)
  const [pendingImportPaths, setPendingImportPaths] = useState<string[] | null>(null)
  const [pendingImportDestination, setPendingImportDestination] = useState<string | null>(null)
  const activeAssetRequestsRef = useRef(0)
  const previewStatusOverridesRef = useRef(new Map<string, string>())
  const [scanBusy, setScanBusy] = useState(false)
  const [backupDialogOpen, setBackupDialogOpen] = useState(false)
  const [backupOverview, setBackupOverview] = useState<BackupOverview>()
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupOperation, setBackupOperation] = useState<'create' | 'restore' | null>(null)
  const [createFolderParent, setCreateFolderParent] = useState<FolderTarget | null>(null)
  const [organizeFolderTarget, setOrganizeFolderTarget] = useState<{ target: FolderTarget, mode: 'rename' | 'move' } | null>(null)
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderTarget | null>(null)
  const [propertiesFolder, setPropertiesFolder] = useState<FolderTarget | null>(null)
  const [folderProperties, setFolderProperties] = useState<FolderProperties | undefined>()
  const [folderDeletionPreview, setFolderDeletionPreview] = useState<FolderDeletionPreview | undefined>()
  const [folderDeletionPreviewLoading, setFolderDeletionPreviewLoading] = useState(false)
  const [folderDeletionPreviewError, setFolderDeletionPreviewError] = useState<string>()
  const [trashedFolders, setTrashedFolders] = useState<FolderTrashEntry[]>([])
  const [trashedFoldersLoading, setTrashedFoldersLoading] = useState(false)
  const [restoreFolderTarget, setRestoreFolderTarget] = useState<FolderTrashEntry | null>(null)
  const [permanentFolderTarget, setPermanentFolderTarget] = useState<FolderTrashEntry | null>(null)
  const [trashFolderBusyId, setTrashFolderBusyId] = useState<string>()
  const [folderOperationBusy, setFolderOperationBusy] = useState(false)
  const [folderPropertiesLoading, setFolderPropertiesLoading] = useState(false)
  const [assetFileOperation, setAssetFileOperation] = useState<{ mode: 'rename', asset: LocalAsset } | { mode: 'move', assetIds: string[] } | null>(null)
  const [assetFileOperationBusy, setAssetFileOperationBusy] = useState(false)
  const [uploadAlbums, setUploadAlbums] = useState<UploadAlbum[]>([])
  const [uploadAlbumsLoading, setUploadAlbumsLoading] = useState(true)
  const [tags, setTags] = useState<LocalTag[]>([])
  const [collections, setCollections] = useState<LocalCollection[]>([])
  const [collectionGroups, setCollectionGroups] = useState<CollectionGroup[]>([])
  const [organizationEditor, setOrganizationEditor] = useState<OrganizationEditorTarget | null>(null)
  const [organizationDelete, setOrganizationDelete] = useState<OrganizationDeleteTarget | null>(null)
  const [organizationBusy, setOrganizationBusy] = useState(false)
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([])
  const selectionAnchorRef = useRef<string | null>(null)

  const query = useMemo(() => ({
    folder, search: deferredSearch, sort, sortDirection, availability, favoritesOnly, tagIds, collectionIds, ...filters, limit: 100,
  }), [availability, collectionIds, deferredSearch, favoritesOnly, filters, folder, sort, sortDirection, tagIds])

  const refreshSnapshot = useCallback(async () => {
    try { onSnapshot(await localLibraryApi.snapshot()) } catch { /* session may be closing */ }
  }, [onSnapshot])

  const reloadFolders = useCallback(async () => {
    try { setFolders(await localLibraryApi.listFolders()) }
    catch (error) { toast.error(parseLocalLibraryError(error).message) }
  }, [])

  const reloadOrganization = useCallback(async () => {
    try {
      const [nextTags, nextGroups, nextCollections] = await Promise.all([localLibraryApi.listTags(), localLibraryApi.listCollectionGroups(), localLibraryApi.listCollections()])
      setTags(nextTags)
      setCollectionGroups(nextGroups)
      setCollections(nextCollections)
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
    }
  }, [])

  const refreshAssets = useCallback(() => setRefreshKey((value) => value + 1), [])

  const clearAssetSelection = useCallback(() => {
    setSelectedAssetIds([])
    selectionAnchorRef.current = null
    selectAsset(null)
  }, [selectAsset])

  const selectGridAsset = useCallback((asset: LocalAsset, intent?: { toggle?: boolean, range?: boolean }) => {
    const ids = page.items.map((item) => item.id)
    if (intent?.range && selectionAnchorRef.current) {
      const anchorIndex = ids.indexOf(selectionAnchorRef.current)
      const nextIndex = ids.indexOf(asset.id)
      if (anchorIndex >= 0 && nextIndex >= 0) {
        const start = Math.min(anchorIndex, nextIndex)
        const end = Math.max(anchorIndex, nextIndex)
        setSelectedAssetIds(ids.slice(start, end + 1))
        selectAsset(asset)
        return
      }
    }
    if (intent?.toggle) {
      setSelectedAssetIds((current) => {
        const removing = current.includes(asset.id)
        const next = removing ? current.filter((id) => id !== asset.id) : [...current, asset.id]
        const nextSelectedId = removing ? next.at(-1) : asset.id
        selectAsset(page.items.find((item) => item.id === nextSelectedId) ?? null)
        return next
      })
      selectionAnchorRef.current = asset.id
      return
    }
    setSelectedAssetIds([asset.id])
    selectionAnchorRef.current = asset.id
    selectAsset(asset)
  }, [page.items, selectAsset])

  const reloadTrashedFolders = useCallback(async () => {
    setTrashedFoldersLoading(true)
    try { setTrashedFolders(await localLibraryApi.listTrashedFolders()) }
    catch (error) { toast.error(parseLocalLibraryError(error).message) }
    finally { setTrashedFoldersLoading(false) }
  }, [])

  useEffect(() => {
    let disposed = false
    setLoading(true)
    activeAssetRequestsRef.current += 1
    localLibraryApi.listAssets(query).then((result) => {
      if (disposed) return
      const overrides = previewStatusOverridesRef.current
      const items = overrides.size === 0 ? result.items : result.items.map((asset) => {
        const previewStatus = overrides.get(asset.id)
        return previewStatus ? { ...asset, previewStatus } : asset
      })
      setPage({ ...result, items })
      const currentStore = useLocalLibraryStore.getState()
      const currentSelection = currentStore.selectedAsset
      if (currentSelection) {
        currentStore.selectAsset(items.find((item) => item.id === currentSelection.id) ?? null)
      }
    }).catch((error) => {
      if (!disposed) toast.error(parseLocalLibraryError(error).message)
    }).finally(() => {
      activeAssetRequestsRef.current = Math.max(0, activeAssetRequestsRef.current - 1)
      if (activeAssetRequestsRef.current === 0) previewStatusOverridesRef.current.clear()
      if (!disposed) setLoading(false)
    })
    return () => { disposed = true }
  }, [query, refreshKey]) // selection is intentionally reconciled against each fresh page

  useEffect(() => {
    setSelectedAssetIds([])
    selectionAnchorRef.current = null
  }, [availability, collectionIds, deferredSearch, favoritesOnly, filters, folder, sort, sortDirection, tagIds])

  useEffect(() => { reloadFolders() }, [reloadFolders, refreshKey])
  useEffect(() => { void reloadOrganization() }, [reloadOrganization])

  useEffect(() => {
    if (availability === 'trashed') void reloadTrashedFolders()
  }, [availability, refreshKey, reloadTrashedFolders])

  useEffect(() => {
    let disposed = false
    localLibraryApi.listUploadAlbums()
      .then((items) => { if (!disposed) setUploadAlbums(items) })
      .catch(() => { if (!disposed) setUploadAlbums([]) })
      .finally(() => { if (!disposed) setUploadAlbumsLoading(false) })
    return () => { disposed = true }
  }, [])

  useEffect(() => {
    if (!propertiesFolder) {
      setFolderProperties(undefined)
      return
    }
    let disposed = false
    setFolderProperties(undefined)
    setFolderPropertiesLoading(true)
    localLibraryApi.folderProperties(propertiesFolder.relativePath)
      .then((properties) => { if (!disposed) setFolderProperties(properties) })
      .catch((error) => {
        if (!disposed) {
          toast.error(parseLocalLibraryError(error).message)
          setPropertiesFolder(null)
        }
      })
      .finally(() => { if (!disposed) setFolderPropertiesLoading(false) })
    return () => { disposed = true }
  }, [propertiesFolder])

  useEffect(() => {
    if (!deleteFolderTarget || deleteFolderTarget.isRoot) {
      setFolderDeletionPreview(undefined)
      setFolderDeletionPreviewError(undefined)
      return
    }
    let disposed = false
    setFolderDeletionPreview(undefined)
    setFolderDeletionPreviewError(undefined)
    setFolderDeletionPreviewLoading(true)
    localLibraryApi.previewFolderDeletion(deleteFolderTarget.relativePath)
      .then((preview) => { if (!disposed) setFolderDeletionPreview(preview) })
      .catch((error) => { if (!disposed) setFolderDeletionPreviewError(parseLocalLibraryError(error).message) })
      .finally(() => { if (!disposed) setFolderDeletionPreviewLoading(false) })
    return () => { disposed = true }
  }, [deleteFolderTarget])

  useEffect(() => {
    const unsubscribe = EventsOn('local-library:event', (rawEvent: unknown) => {
      const event = rawEvent as LocalLibraryEvent
      if (!event || event.sessionId !== snapshot.sessionId) return
      if (event.state) {
        onSnapshot({
          ...snapshot,
          state: event.state.state,
          assetCount: event.state.assetCount,
          missingCount: event.state.missingCount,
          trashCount: event.state.trashCount,
          scan: event.state.scan,
        })
      }
      if (event.kind === 'asset_preview_updated' && event.assetId && event.previewStatus) {
        const assetId = event.assetId
        const previewStatus = event.previewStatus
        if (activeAssetRequestsRef.current > 0) {
          previewStatusOverridesRef.current.set(assetId, previewStatus)
        }
        const patchPreviewStatus = (asset: LocalAsset) => asset.id === assetId
          ? { ...asset, previewStatus }
          : asset
        setPage((current) => ({ ...current, items: current.items.map(patchPreviewStatus) }))

        const current = useLocalLibraryStore.getState()
        if (current.selectedAsset?.id === assetId) {
          current.selectAsset(patchPreviewStatus(current.selectedAsset))
        }
        if (current.previewAsset?.id === assetId) {
          current.setPreviewAsset(patchPreviewStatus(current.previewAsset))
        }
        return
      }
      if (event.kind === 'scan_progress') return
      if (event.kind === 'assets_imported' && importBusyRef.current) return
      refreshAssets()
    })
    return unsubscribe
  }, [onSnapshot, refreshAssets, snapshot.sessionId])

  const runImport = useCallback(async (paths: string[], destinationFolder: string) => {
    const results = await localLibraryApi.importFiles(paths, destinationFolder)
    runResultsMessage(results, copy.imported, copy.importPartial)
    refreshAssets()
    await refreshSnapshot()
  }, [copy.importPartial, copy.imported, refreshAssets, refreshSnapshot])

  const importPaths = useCallback(async (paths: string[], destinationFolder = folder) => {
    if (!paths.length || importBusyRef.current) return
    importBusyRef.current = true
    setImportBusy(true)
    try {
      const preferences = await localLibraryApi.preferences()
      if (!preferences.importMode) {
        setPendingImportPaths(paths)
        setPendingImportDestination(destinationFolder)
        return
      }
      await runImport(paths, destinationFolder)
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
    } finally {
      importBusyRef.current = false
      setImportBusy(false)
    }
  }, [folder, runImport])

  const chooseImportMode = useCallback(async (mode: LocalLibraryImportMode) => {
    if (!pendingImportPaths?.length || importBusyRef.current) return
    const paths = pendingImportPaths
    const destinationFolder = pendingImportDestination ?? folder
    importBusyRef.current = true
    setImportBusy(true)
    try {
      await localLibraryApi.setImportMode(mode)
      await runImport(paths, destinationFolder)
      setPendingImportPaths(null)
      setPendingImportDestination(null)
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
    } finally {
      importBusyRef.current = false
      setImportBusy(false)
    }
  }, [folder, pendingImportDestination, pendingImportPaths, runImport])

  const importPathsRef = useRef(importPaths)
  useEffect(() => {
    importPathsRef.current = importPaths
  }, [importPaths])

  useEffect(() => {
    OnFileDrop((x, y, paths) => {
      setDropTargetFolder(null)
      const element = document.elementFromPoint(x, y)
      const target = element?.closest<HTMLElement>('[data-local-library-import-folder]')
      if (!target) {
        toast.error(element?.closest('[data-local-library-logical-target]') ? copy.externalDropLogicalRejected : copy.externalDropUnavailable)
        return
      }
      void importPathsRef.current(paths || [], target.dataset.localLibraryImportFolder || '')
    }, true)
    const hasFiles = (event: globalThis.DragEvent) => Array.from(event.dataTransfer?.types || []).includes('Files')
    const updateDropTarget = (event: globalThis.DragEvent) => {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-local-library-import-folder]')
      event.dataTransfer!.dropEffect = target ? 'copy' : 'none'
      setDropTargetFolder(target ? target.dataset.localLibraryImportFolder || '' : null)
    }
    const enter = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      event.stopPropagation()
      updateDropTarget(event)
    }
    const over = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      event.stopPropagation()
      updateDropTarget(event)
    }
    const leave = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      event.stopPropagation()
      if (event.relatedTarget === null) setDropTargetFolder(null)
    }
    const drop = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      event.stopPropagation()
      setDropTargetFolder(null)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      OnFileDropOff()
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [copy.externalDropLogicalRejected, copy.externalDropUnavailable])

  const loadMore = useCallback(async () => {
    if (!page.nextCursor || loadingMore) return
    setLoadingMore(true)
    activeAssetRequestsRef.current += 1
    try {
      const next = await localLibraryApi.listAssets({ ...query, cursor: page.nextCursor })
      const overrides = previewStatusOverridesRef.current
      const nextItems = overrides.size === 0 ? next.items : next.items.map((asset) => {
        const previewStatus = overrides.get(asset.id)
        return previewStatus ? { ...asset, previewStatus } : asset
      })
      setPage((current) => ({ ...next, items: [...current.items, ...nextItems] }))
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
    } finally {
      activeAssetRequestsRef.current = Math.max(0, activeAssetRequestsRef.current - 1)
      if (activeAssetRequestsRef.current === 0) previewStatusOverridesRef.current.clear()
      setLoadingMore(false)
    }
  }, [loadingMore, page.nextCursor, query])

  const chooseFiles = async () => {
    try { await importPaths(await localLibraryApi.selectImportFiles()) }
    catch (error) { toast.error(parseLocalLibraryError(error).message) }
  }

  const runScanAction = async (action: 'pause' | 'resume' | 'cancel' | 'start') => {
    setScanBusy(true)
    try {
      if (action === 'pause') await localLibraryApi.pauseScan()
      else if (action === 'resume') await localLibraryApi.resumeScan()
      else if (action === 'cancel') await localLibraryApi.cancelScan()
      else await localLibraryApi.startScan()
      await refreshSnapshot()
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
    } finally { setScanBusy(false) }
  }

  const loadBackups = useCallback(async () => {
    setBackupLoading(true)
    try { setBackupOverview(await localLibraryApi.backups()) }
    catch (error) { toast.error(parseLocalLibraryError(error).message) }
    finally { setBackupLoading(false) }
  }, [])

  const openBackups = () => {
    setBackupDialogOpen(true)
    void loadBackups()
  }

  const createBackup = async () => {
    setBackupOperation('create')
    try {
      await localLibraryApi.createBackup()
      toast.success(copy.backupCreated)
      await loadBackups()
    } catch (error) { toast.error(parseLocalLibraryError(error).message) }
    finally { setBackupOperation(null) }
  }

  const restoreBackup = async (id: string) => {
    setBackupOperation('restore')
    try {
      const restored = await localLibraryApi.restoreBackup(id)
      clearAssetSelection()
      onSnapshot(restored)
      await Promise.all([reloadFolders(), reloadOrganization(), loadBackups()])
      refreshAssets()
      toast.success(copy.backupRestored)
      return true
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
      return false
    } finally { setBackupOperation(null) }
  }

  const saveAsset = useCallback((assetId: string, patch: Pick<LocalAsset, 'displayTitle' | 'notes' | 'rating' | 'colorLabel' | 'isFavorite'>) => {
    pendingSaveCountRef.current += 1
    setSaving(true)

    const operation = saveQueueRef.current.then(async () => {
      await localLibraryApi.updateAsset(assetId, patch.displayTitle || '', patch.notes || '', patch.rating, patch.colorLabel || '', patch.isFavorite)
      setPage((current) => ({
        ...current,
        items: current.items.map((item) => item.id === assetId ? { ...item, ...patch } : item),
      }))
      const currentSelection = useLocalLibraryStore.getState().selectedAsset
      if (currentSelection?.id === assetId) {
        selectAsset({ ...currentSelection, ...patch })
      }
    })

    saveQueueRef.current = operation.catch(() => undefined)
    return operation.catch((error) => {
      toast.error(parseLocalLibraryError(error).message)
    }).finally(() => {
      pendingSaveCountRef.current -= 1
      if (pendingSaveCountRef.current === 0) setSaving(false)
    })
  }, [selectAsset])

  const createFolder = async (name: string) => {
    if (!createFolderParent) return
    setFolderOperationBusy(true)
    try {
      await localLibraryApi.createFolder(createFolderParent.relativePath, name)
      toast.success(copy.folderCreated)
      setCreateFolderParent(null)
      await reloadFolders()
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
    } finally {
      setFolderOperationBusy(false)
    }
  }

  const organizeFolder = async (destinationParent: string, topLevelName: string) => {
    if (!organizeFolderTarget) return
    const { target, mode } = organizeFolderTarget
    const currentParent = target.relativePath.includes('/') ? target.relativePath.slice(0, target.relativePath.lastIndexOf('/')) : ''
    setFolderOperationBusy(true)
    try {
      const moved = await localLibraryApi.moveFolder(target.relativePath, mode === 'rename' ? currentParent : destinationParent, topLevelName)
      if (folder === target.relativePath || folder.startsWith(`${target.relativePath}/`)) {
        const suffix = folder.slice(target.relativePath.length)
        setFolder(`${moved.relativePath}${suffix}`)
      }
      toast.success(mode === 'rename' ? copy.folderRenamed : copy.folderMoved)
      setOrganizeFolderTarget(null)
      await Promise.all([reloadFolders(), refreshSnapshot()])
      refreshAssets()
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
      await Promise.all([reloadFolders(), refreshSnapshot()])
      refreshAssets()
    } finally {
      setFolderOperationBusy(false)
    }
  }

  const finishActiveFolderRemoval = async (permanent: boolean) => {
    if (!deleteFolderTarget || deleteFolderTarget.isRoot || !folderDeletionPreview) return
    setFolderOperationBusy(true)
    try {
      if (permanent) await localLibraryApi.permanentlyDeleteActiveFolder(deleteFolderTarget.relativePath)
      else await localLibraryApi.deleteFolder(deleteFolderTarget.relativePath)
      if (folder === deleteFolderTarget.relativePath || folder.startsWith(`${deleteFolderTarget.relativePath}/`)) {
        setFolder('')
      }
      toast.success(permanent ? copy.permanentlyDeletedFolder : copy.folderDeleted)
      setDeleteFolderTarget(null)
      await Promise.all([reloadFolders(), refreshSnapshot()])
      refreshAssets()
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
      // Direct permanent deletion first moves the directory into library trash.
      // If the second step fails, refresh all views so the UI reflects that recoverable state.
      await Promise.all([reloadFolders(), reloadTrashedFolders(), refreshSnapshot()])
      refreshAssets()
    } finally {
      setFolderOperationBusy(false)
    }
  }

  const restoreFolderBatch = async (destinationParent: string, topLevelName: string) => {
    if (!restoreFolderTarget) return
    setTrashFolderBusyId(restoreFolderTarget.id)
    try {
      await localLibraryApi.restoreFolder(restoreFolderTarget.id, destinationParent, topLevelName)
      toast.success(copy.restoredFolder)
      setRestoreFolderTarget(null)
      selectAsset(null)
      await Promise.all([reloadTrashedFolders(), reloadFolders(), refreshSnapshot()])
      refreshAssets()
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
    } finally {
      setTrashFolderBusyId(undefined)
    }
  }

  const permanentlyDeleteFolderBatch = async () => {
    if (!permanentFolderTarget) return
    setTrashFolderBusyId(permanentFolderTarget.id)
    try {
      await localLibraryApi.permanentlyDeleteFolder(permanentFolderTarget.id)
      toast.success(copy.permanentlyDeletedFolder)
      setPermanentFolderTarget(null)
      selectAsset(null)
      await Promise.all([reloadTrashedFolders(), refreshSnapshot()])
      refreshAssets()
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
    } finally {
      setTrashFolderBusyId(undefined)
    }
  }

  const copyAssetToClipboard = useCallback(async (asset: LocalAsset, cut: boolean) => {
    try {
      await localLibraryApi.copyAssetsToClipboard([asset.id], cut)
      toast.success(cut ? copy.cutToClipboard : copy.copiedToClipboard)
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
    }
  }, [copy.copiedToClipboard, copy.cutToClipboard])

  const uploadAsset = useCallback((asset: LocalAsset, albumId?: string) => {
    if (asset.availability !== 'active') return
    useUploadIntentStore.getState().enqueue({ source: 'local-assets', assetIds: [asset.id], albumId })
    toast.success(copy.uploadPrepared)
    navigate('/upload')
  }, [copy.uploadPrepared, navigate])

  const openSystem = async (asset: LocalAsset) => {
    try { await localLibraryApi.openInDefaultApp(asset.id) }
    catch (error) { toast.error(parseLocalLibraryError(error).message) }
  }

  const openRenameAsset = useCallback((asset: LocalAsset) => {
    if (asset.availability === 'active') setAssetFileOperation({ mode: 'rename', asset })
  }, [])

  const openMoveAsset = useCallback((asset: LocalAsset) => {
    if (asset.availability === 'active') setAssetFileOperation({ mode: 'move', assetIds: [asset.id] })
  }, [])

  const openMoveSelectedAssets = useCallback(() => {
    const activeIds = selectedAssetIds.filter((id) => page.items.find((item) => item.id === id)?.availability === 'active')
    if (activeIds.length > 0) setAssetFileOperation({ mode: 'move', assetIds: activeIds })
  }, [page.items, selectedAssetIds])

  const renameAsset = async (fileName: string) => {
    if (!assetFileOperation || assetFileOperation.mode !== 'rename') return
    setAssetFileOperationBusy(true)
    try {
      await localLibraryApi.renameAsset(assetFileOperation.asset.id, fileName)
      toast.success(copy.assetRenamed)
      setAssetFileOperation(null)
      await Promise.all([reloadFolders(), refreshSnapshot()])
      refreshAssets()
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
    } finally {
      setAssetFileOperationBusy(false)
    }
  }

  const performAssetMove = async (assetIds: string[], destinationFolder: string, closeDialog: boolean) => {
    if (assetIds.length === 0) return
    setAssetFileOperationBusy(true)
    try {
      const results = await localLibraryApi.moveAssets(assetIds, destinationFolder)
      runResultsMessage(results, copy.assetsMoved, copy.assetsMovePartial)
      const failedIds = results.filter((result) => result.status === 'failed').map((result) => result.assetId)
      if (closeDialog) setAssetFileOperation(null)
      if (failedIds.length === 0) clearAssetSelection()
      else {
        setSelectedAssetIds(failedIds)
        selectAsset(page.items.find((item) => item.id === failedIds[0]) ?? null)
      }
      await Promise.all([reloadFolders(), refreshSnapshot()])
      refreshAssets()
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
    } finally {
      setAssetFileOperationBusy(false)
    }
  }

  const moveAssets = async (destinationFolder: string) => {
    if (!assetFileOperation || assetFileOperation.mode !== 'move') return
    await performAssetMove(assetFileOperation.assetIds, destinationFolder, true)
  }

  const applyOrganizationDrop = async (assetIds: string[], target: { kind: 'tag' | 'collection' | 'favorite'; id?: string }) => {
    const activeIds = assetIds.filter((id) => page.items.find((item) => item.id === id)?.availability === 'active')
    if (activeIds.length === 0) return
    setOrganizationBusy(true)
    try {
      if (target.kind === 'tag' && target.id) {
        await localLibraryApi.batchUpdateAssetOrganization({ assetIds: activeIds, addTagIds: [target.id] })
      } else if (target.kind === 'collection' && target.id) {
        await localLibraryApi.batchUpdateAssetOrganization({ assetIds: activeIds, addCollectionIds: [target.id] })
      } else if (target.kind === 'favorite') {
        await localLibraryApi.batchUpdateAssetOrganization({ assetIds: activeIds, isFavorite: true })
      }
      toast.success(copy.organizationUpdated)
      refreshAssets()
      await reloadOrganization()
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
    } finally {
      setOrganizationBusy(false)
    }
  }

  const assetDropHandlers = (onDrop: (assetIds: string[]) => void, dropEffect: 'move' | 'link' = 'move') => ({
    onDragOver: (event: ReactDragEvent) => {
      if (!event.dataTransfer.types.includes('application/x-mo-gallery-asset-ids')) return
      event.preventDefault()
      event.dataTransfer.dropEffect = dropEffect
    },
    onDrop: (event: ReactDragEvent) => {
      const raw = event.dataTransfer.getData('application/x-mo-gallery-asset-ids')
      if (!raw) return
      event.preventDefault()
      event.stopPropagation()
      try {
        const ids = JSON.parse(raw) as unknown
        if (Array.isArray(ids) && ids.every((id): id is string => typeof id === 'string')) onDrop(ids)
      } catch { /* ignore malformed drag payload */ }
    },
  })

  const trashSelected = async () => {
    if (!deleteAsset) return
    setDeleteBusy(true)
    try {
      const results = await localLibraryApi.trashAssets([deleteAsset.id])
      runResultsMessage(results, copy.trashOption, copy.importPartial)
      setDeleteAsset(null); selectAsset(null); refreshAssets(); refreshSnapshot()
    } catch (error) { toast.error(parseLocalLibraryError(error).message) }
    finally { setDeleteBusy(false) }
  }

  const permanentlyDelete = async () => {
    if (!deleteAsset) return
    setDeleteBusy(true)
    try {
      const results = await localLibraryApi.permanentlyDeleteAssets([deleteAsset.id])
      runResultsMessage(results, copy.confirmPermanent, copy.importPartial)
      setDeleteAsset(null); selectAsset(null); refreshAssets(); refreshSnapshot()
    } catch (error) { toast.error(parseLocalLibraryError(error).message) }
    finally { setDeleteBusy(false) }
  }

  const restoreAsset = async (asset: LocalAsset) => {
    try {
      await localLibraryApi.restoreAsset(asset.id)
      toast.success(asset.trashEntryKind === 'folder' ? copy.restoredFolder : copy.restore)
      setDeleteAsset((current) => current?.id === asset.id ? null : current)
      selectAsset(null)
      refreshAssets()
      void refreshSnapshot()
    } catch (error) { toast.error(parseLocalLibraryError(error).message) }
  }


  const recheckMissing = useCallback(async (asset: LocalAsset) => {
    if (asset.availability !== 'missing') return
    setMissingMaintenanceBusy(true)
    try {
      const [result] = await localLibraryApi.recheckMissingAssets([asset.id])
      if (!result || result.status === 'failed') {
        toast.error(result?.error || copy.stillMissing)
        return
      }
      if (result.status === 'still_missing') {
        toast.info(copy.stillMissing)
      } else if (result.status === 'restored') {
        toast.success(copy.missingRestored)
        selectAsset(null)
      } else {
        toast.error(result.error || copy.stillMissing)
      }
      refreshAssets()
      void refreshSnapshot()
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
    } finally {
      setMissingMaintenanceBusy(false)
    }
  }, [copy.missingRestored, copy.stillMissing, refreshAssets, refreshSnapshot, selectAsset])

  const retryPreview = useCallback(async (asset: LocalAsset) => {
    if (asset.availability !== 'active') return
    setPreviewMaintenanceBusy(true)
    try {
      const [result] = await localLibraryApi.retryAssetPreviews([asset.id])
      if (result?.status === 'ready') {
        toast.success(copy.previewRetrySucceeded)
      } else {
        toast.error(result?.error || copy.previewRetryFailed)
      }
      refreshAssets()
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
    } finally {
      setPreviewMaintenanceBusy(false)
    }
  }, [copy.previewRetryFailed, copy.previewRetrySucceeded, refreshAssets])

  const removeMissingRecord = async () => {
    if (!removeMissingAsset) return
    setMissingMaintenanceBusy(true)
    try {
      const [result] = await localLibraryApi.removeMissingAssets([removeMissingAsset.id])
      if (!result || result.status !== 'removed') {
        toast.error(result?.error || copy.removeMissingRecord)
        return
      }
      toast.success(copy.missingRecordRemoved)
      setRemoveMissingAsset(null)
      selectAsset(null)
      refreshAssets()
      void refreshSnapshot()
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
    } finally {
      setMissingMaintenanceBusy(false)
    }
  }

  const saveOrganization = async (value: { name: string, notes: string, parentId?: string, color: string }) => {
    if (!organizationEditor) return
    setOrganizationBusy(true)
    try {
      if (organizationEditor.kind === 'tag') {
        if (organizationEditor.item) await localLibraryApi.updateTag(organizationEditor.item.id, value.name, value.color)
        else await localLibraryApi.createTag(value.name, value.color)
      } else if (organizationEditor.kind === 'collection') {
        if (organizationEditor.item) await localLibraryApi.updateCollection(organizationEditor.item.id, value.parentId, value.name, value.notes, organizationEditor.item.position)
        else await localLibraryApi.createCollection(value.parentId, value.name, value.notes)
      } else if (organizationEditor.item) {
        await localLibraryApi.updateCollectionGroup(organizationEditor.item.id, value.parentId, value.name, organizationEditor.item.position)
      } else {
        await localLibraryApi.createCollectionGroup(value.parentId, value.name)
      }
      toast.success(copy.organizationSaved)
      setOrganizationEditor(null)
      await reloadOrganization()
      refreshAssets()
    } catch (error) { toast.error(parseLocalLibraryError(error).message) }
    finally { setOrganizationBusy(false) }
  }

  const deleteOrganization = async (deleteContents: boolean) => {
    if (!organizationDelete) return
    setOrganizationBusy(true)
    try {
      if (organizationDelete.kind === 'tag') await localLibraryApi.deleteTag(organizationDelete.id)
      else if (organizationDelete.kind === 'collection') await localLibraryApi.deleteCollection(organizationDelete.id)
      else await localLibraryApi.deleteCollectionGroup(organizationDelete.id, deleteContents)
      toast.success(copy.organizationDeleted)
      setOrganizationDelete(null)
      if (organizationDelete.kind === 'tag') setTagIds(tagIds.filter((id) => id !== organizationDelete.id))
      if (organizationDelete.kind === 'collection') setCollectionIds(collectionIds.filter((id) => id !== organizationDelete.id))
      await reloadOrganization()
      refreshAssets()
    } catch (error) { toast.error(parseLocalLibraryError(error).message) }
    finally { setOrganizationBusy(false) }
  }

  const batchUpdateOrganization = async (update: Omit<BatchAssetOrganizationUpdate, 'assetIds'>) => {
    if (selectedAssetIds.length < 2) return
    setOrganizationBusy(true)
    try {
      await localLibraryApi.batchUpdateAssetOrganization({ assetIds: selectedAssetIds, ...update })
      toast.success(copy.batchUpdated)
      clearAssetSelection()
      refreshAssets()
      await reloadOrganization()
    } catch (error) { toast.error(parseLocalLibraryError(error).message) }
    finally { setOrganizationBusy(false) }
  }

  const setAssetTags = async (assetId: string, ids: string[]) => {
    setOrganizationBusy(true)
    try { await localLibraryApi.setAssetTags(assetId, ids); toast.success(copy.organizationUpdated); refreshAssets(); await reloadOrganization() }
    catch (error) { toast.error(parseLocalLibraryError(error).message) }
    finally { setOrganizationBusy(false) }
  }

  const setAssetCollections = async (assetId: string, ids: string[]) => {
    setOrganizationBusy(true)
    try { await localLibraryApi.setAssetCollections(assetId, ids); toast.success(copy.organizationUpdated); refreshAssets(); await reloadOrganization() }
    catch (error) { toast.error(parseLocalLibraryError(error).message) }
    finally { setOrganizationBusy(false) }
  }

  const closeLibrary = async () => {
    try { await localLibraryApi.close(); onClose() }
    catch (error) { toast.error(parseLocalLibraryError(error).message) }
  }

  const currentLocation = folder || copy.root
  const isSuspended = snapshot.state === 'suspended'
  const isRepairRequired = snapshot.state === 'repair_required'
  const isScanning = snapshot.scan.state === 'running'
  const hasStructuredFilters = Object.values(filters).some((value) => Array.isArray(value) ? value.length > 0 : value !== undefined && value !== '')
  const canImportIntoCurrentView = availability === 'active' && !favoritesOnly && tagIds.length === 0 && collectionIds.length === 0 && !deferredSearch && !hasStructuredFilters

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex h-14 items-center gap-4 px-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><h1 className="truncate font-sans text-sm font-semibold">{snapshot.name}</h1><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: isSuspended || isRepairRequired ? '#d97706' : isScanning ? 'var(--primary)' : '#4f9d69' }} /></div>
            <p className="truncate text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{snapshot.rootPath}</p>
          </div>
          <button type="button" disabled={importBusy || isSuspended || isRepairRequired} onClick={chooseFiles} className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium disabled:cursor-wait disabled:opacity-70" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>{importBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}{importBusy ? copy.importing : copy.import}</button>
          <button type="button" disabled={isSuspended || isRepairRequired} onClick={openBackups} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50"><DatabaseBackup size={13} />{copy.databaseBackups}</button>
          <button type="button" onClick={closeLibrary} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary">{copy.close}</button>
        </div>
        <div className="flex min-h-10 items-center gap-3 border-t px-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
          <div className="flex min-w-0 flex-1 items-center gap-2 text-[11px]"><span className={isScanning ? 'animate-pulse' : ''} style={{ color: isScanning ? 'var(--primary)' : 'var(--muted-foreground)' }}>{scanLabel(snapshot, copy)}</span><span className="truncate" style={{ color: 'var(--muted-foreground)' }}>{snapshot.scan.lastPath || currentLocation}</span></div>
          {snapshot.scan.state === 'running' && <><button disabled={scanBusy} onClick={() => runScanAction('pause')} className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] hover:bg-secondary"><Pause size={11} />{copy.pause}</button><button disabled={scanBusy} onClick={() => runScanAction('cancel')} className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] hover:bg-secondary"><Square size={10} />{copy.cancel}</button></>}
          {snapshot.scan.state === 'paused' && !isSuspended && !isRepairRequired && <button disabled={scanBusy} onClick={() => runScanAction('resume')} className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] hover:bg-secondary"><Play size={11} />{copy.resume}</button>}
          {!isSuspended && !isRepairRequired && !['running','paused'].includes(snapshot.scan.state) && <button disabled={scanBusy} onClick={() => runScanAction('start')} className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] hover:bg-secondary"><RefreshCw size={11} />{copy.rescan}</button>}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="custom-scrollbar w-[218px] shrink-0 overflow-y-auto border-r bg-card p-3" style={{ borderColor: 'var(--border)' }}>
          <NavButton active={availability === 'active' && !favoritesOnly && !folder && tagIds.length === 0 && collectionIds.length === 0} icon={Images} label={copy.allPhotos} count={snapshot.assetCount} onClick={() => { setAvailability('active'); setFavoritesOnly(false); setFolder('') }} />
          <div data-local-library-logical-target {...assetDropHandlers((ids) => void applyOrganizationDrop(ids, { kind: 'favorite' }), 'link')}><NavButton active={availability === 'active' && favoritesOnly} icon={Heart} label={copy.favorites} onClick={() => { setAvailability('active'); setFavoritesOnly(true); setFolder('') }} /></div>
          <NavButton active={availability === 'missing'} icon={FileQuestion} label={copy.missingPhotos} count={snapshot.missingCount} onClick={() => { setAvailability('missing'); setFavoritesOnly(false); setFolder('') }} />
          <NavButton active={availability === 'trashed'} icon={ArchiveRestore} label={copy.trash} count={snapshot.trashCount} onClick={() => { setAvailability('trashed'); setFavoritesOnly(false); setFolder('') }} />
          <div className="mb-2 mt-5 px-2 text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>{copy.folders}</div>
          <div data-local-library-import-folder="" style={{ '--wails-drop-target': 'drop' } as CSSProperties} {...assetDropHandlers((ids) => void performAssetMove(ids, '', false))}>
            <FolderContextTarget
              target={{ relativePath: '', name: copy.root, isRoot: true }} copy={copy}
              onCreate={setCreateFolderParent} onRename={() => undefined} onMove={() => undefined} onProperties={setPropertiesFolder} onDelete={setDeleteFolderTarget}
            >
              <button type="button" onClick={() => { setAvailability('active'); setFavoritesOnly(false); setFolder('') }}
                className="mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition hover:bg-secondary"
                style={{ backgroundColor: availability === 'active' && !favoritesOnly && !folder && tagIds.length === 0 && collectionIds.length === 0 ? 'var(--accent)' : undefined }}>
                <FolderOpen size={15} /><span className="min-w-0 flex-1 truncate">{copy.root}</span>
              </button>
            </FolderContextTarget>
          </div>
          {folders.map((item) => {
            const target = { relativePath: item.relativePath, name: item.name, isRoot: false }
            return (
              <div key={item.id} data-local-library-import-folder={item.relativePath} style={{ '--wails-drop-target': 'drop' } as CSSProperties} {...assetDropHandlers((ids) => void performAssetMove(ids, item.relativePath, false))}>
                <FolderContextTarget target={target} copy={copy}
                  onCreate={setCreateFolderParent} onRename={(next) => setOrganizeFolderTarget({ target: next, mode: 'rename' })} onMove={(next) => setOrganizeFolderTarget({ target: next, mode: 'move' })} onProperties={setPropertiesFolder} onDelete={setDeleteFolderTarget}>
                  <button type="button" onClick={() => { setAvailability('active'); setFavoritesOnly(false); setFolder(item.relativePath) }}
                    className="mb-0.5 flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-xs hover:bg-secondary"
                    style={{ paddingLeft: `${10 + Math.min(5, item.relativePath.split('/').length - 1) * 12}px`, backgroundColor: folder === item.relativePath && availability === 'active' && tagIds.length === 0 && collectionIds.length === 0 ? 'var(--accent)' : undefined }}>
                    <Folder size={14} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{item.name}</span><span className="text-[9px]" style={{ color: 'var(--muted-foreground)' }}>{item.assetCount}</span>
                  </button>
                </FolderContextTarget>
              </div>
            )
          })}
          <OrganizationNavigation copy={copy} tags={tags} groups={collectionGroups} collections={collections} selectedTagIds={tagIds} selectedCollectionIds={collectionIds}
            onSelectTags={(ids) => { setAvailability('active'); setFavoritesOnly(false); setTagIds(ids) }} onSelectCollections={(ids) => { setAvailability('active'); setFavoritesOnly(false); setCollectionIds(ids) }}
            onEdit={setOrganizationEditor} onDelete={setOrganizationDelete} onDropAssets={(ids, target) => void applyOrganizationDrop(ids, target)} />
          <div className="mt-5 rounded-lg border p-3 text-[10px] leading-4" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
            <div className="mb-2 font-medium" style={{ color: 'var(--foreground)' }}>{copy.libraryLocation}</div>
            <div className="break-all">{snapshot.rootPath}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center"><Stat value={snapshot.assetCount} label={copy.assets} /><Stat value={snapshot.missingCount} label={copy.missing} /><Stat value={snapshot.trashCount} label={copy.inTrash} /></div>
          </div>
        </aside>

        <main data-local-library-import-folder={canImportIntoCurrentView ? folder : undefined} style={canImportIntoCurrentView ? { '--wails-drop-target': 'drop' } as CSSProperties : undefined} className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-13 shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: 'var(--border)' }}>
            <div className="relative min-w-0 flex-1"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} className="h-8 w-full rounded-md border bg-input pl-8 pr-8 text-xs outline-none focus:ring-1" />{search && <button type="button" onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1"><X size={13} /></button>}</div>
            <LocalAssetFilters copy={copy} filters={filters} onChange={setFilters} onClear={clearFilters} />
            <div className="relative"><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="h-8 appearance-none rounded-md border bg-input pl-3 pr-8 text-xs outline-none"><option value="captured">{copy.captured}</option><option value="discovered">{copy.discovered}</option><option value="name">{copy.name}</option><option value="modified">{copy.modified}</option><option value="size">{copy.size}</option><option value="rating">{copy.rating}</option></select><ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" /></div>
            <button type="button" onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')} title={sortDirection === 'asc' ? copy.ascending : copy.descending} aria-label={sortDirection === 'asc' ? copy.ascending : copy.descending} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-input hover:bg-secondary">{sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}</button>
          </div>
          {(isSuspended || isRepairRequired) && <div className="border-b px-4 py-2 text-[11px]" style={{ borderColor: 'var(--border)', color: '#b45309', backgroundColor: 'color-mix(in srgb, #f59e0b 10%, var(--card))' }}>{scanLabel(snapshot, copy)}</div>}
          {!page.isComplete && !isSuspended && !isRepairRequired && <div className="border-b px-4 py-1.5 text-[10px]" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)', backgroundColor: 'var(--card)' }}>{copy.incomplete}</div>}
          {availability === 'trashed' && <FolderTrashSection entries={trashedFolders} copy={copy} loading={trashedFoldersLoading} busyId={trashFolderBusyId} onRestore={setRestoreFolderTarget} onPermanentDelete={setPermanentFolderTarget} />}
          <LocalAssetGrid assets={page.items} loading={loading || loadingMore} hasMore={Boolean(page.nextCursor)} total={page.total} copy={copy}
            emptyTitle={availability === 'missing' ? copy.missingEmpty : undefined} emptyHint={availability === 'missing' ? copy.missingEmptyHint : undefined}
            uploadAlbums={uploadAlbums} uploadAlbumsLoading={uploadAlbumsLoading}
            selectedIds={selectedAssetIds} onSelect={selectGridAsset} onOpen={(asset) => { if (asset.availability === 'active') setPreviewAsset(asset) }} onLoadMore={loadMore}
            onClipboard={copyAssetToClipboard} onUpload={uploadAsset} onDelete={(asset) => { selectAsset(asset); setDeleteAsset(asset) }} onRename={openRenameAsset} onMove={openMoveAsset} onRestore={restoreAsset}
            onRetryPreview={retryPreview} onRecheckMissing={recheckMissing} onRemoveMissing={(asset) => { selectAsset(asset); setRemoveMissingAsset(asset) }} />
        </main>

        {selectedAssetIds.length > 1 ? <LocalAssetBatchDetails selectedCount={selectedAssetIds.length} tags={tags} collections={collections} copy={copy} busy={organizationBusy || assetFileOperationBusy} canMove={selectedAssetIds.every((id) => page.items.find((item) => item.id === id)?.availability === 'active')} onClear={clearAssetSelection} onMove={openMoveSelectedAssets} onUpdate={(update) => void batchUpdateOrganization(update)} /> : <LocalAssetDetails asset={selectedAsset} copy={copy} saving={saving} maintenanceBusy={missingMaintenanceBusy || previewMaintenanceBusy} tags={tags} collections={collections} organizationBusy={organizationBusy} onSave={saveAsset}
          onPreview={(asset) => { if (asset.availability !== 'missing') setPreviewAsset(asset) }} onOpenSystem={openSystem} onRename={openRenameAsset} onMove={openMoveAsset} onDelete={setDeleteAsset} onRestore={restoreAsset}
          onRetryPreview={retryPreview} onRecheckMissing={recheckMissing} onRemoveMissing={(asset) => setRemoveMissingAsset(asset)} onSetTags={setAssetTags} onSetCollections={setAssetCollections} />}
      </div>

      {dropTargetFolder !== null && <div className="pointer-events-none absolute inset-3 z-50 flex items-center justify-center rounded-xl border-2 border-dashed bg-background/90 backdrop-blur" style={{ borderColor: 'var(--primary)' }}><div className="text-center"><Upload size={30} className="mx-auto mb-3" style={{ color: 'var(--primary)' }} /><p className="text-sm font-medium">{copy.drop}</p><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>{dropTargetFolder || copy.root}</p></div></div>}
      {previewAsset && <LocalLibraryPreview asset={previewAsset} copy={copy} onClose={() => setPreviewAsset(null)} onOpenSystem={openSystem} />}
      {backupDialogOpen && <LocalLibraryBackupDialog copy={copy} overview={backupOverview} loading={backupLoading} operation={backupOperation} onClose={() => setBackupDialogOpen(false)} onCreate={createBackup} onRestore={restoreBackup} />}
      {organizationEditor && <OrganizationEditorDialog target={organizationEditor} groups={collectionGroups} copy={copy} busy={organizationBusy} onClose={() => setOrganizationEditor(null)} onSubmit={(value) => void saveOrganization(value)} />}
      {organizationDelete && <DeleteOrganizationDialog copy={copy} busy={organizationBusy} title={organizationDelete.kind === 'tag' ? copy.deleteTagTitle : organizationDelete.kind === 'collection' ? copy.deleteCollectionTitle : copy.deleteCollectionGroupTitle} body={organizationDelete.kind === 'tag' ? copy.deleteTagBody : organizationDelete.kind === 'collection' ? copy.deleteCollectionBody : organizationDelete.nonEmpty ? copy.deleteCollectionGroupBody : copy.deleteEmptyCollectionGroupBody} dangerousLabel={organizationDelete.kind === 'group' && organizationDelete.nonEmpty ? copy.deleteGroupContents : copy.confirmPermanent} onClose={() => setOrganizationDelete(null)} onConfirm={() => void deleteOrganization(Boolean(organizationDelete.nonEmpty))} />}
      {pendingImportPaths && <ImportModeDialog copy={copy} busy={importBusy} onClose={() => { setPendingImportPaths(null); setPendingImportDestination(null) }} onChoose={chooseImportMode} />}
      {removeMissingAsset && <RemoveMissingAssetDialog asset={removeMissingAsset} copy={copy} busy={missingMaintenanceBusy} onClose={() => setRemoveMissingAsset(null)} onConfirm={removeMissingRecord} />}
      {deleteAsset && <DeleteAssetDialog asset={deleteAsset} copy={copy} busy={deleteBusy} onClose={() => setDeleteAsset(null)} onTrash={trashSelected} onRestore={() => void restoreAsset(deleteAsset)} onPermanent={permanentlyDelete} />}
      {createFolderParent && <CreateFolderDialog parentName={createFolderParent.name} copy={copy} busy={folderOperationBusy} onClose={() => setCreateFolderParent(null)} onCreate={createFolder} />}
      {organizeFolderTarget && <MoveFolderDialog mode={organizeFolderTarget.mode} relativePath={organizeFolderTarget.target.relativePath} currentName={organizeFolderTarget.target.name} folders={folders} copy={copy} busy={folderOperationBusy} onClose={() => setOrganizeFolderTarget(null)} onConfirm={organizeFolder} />}
      {assetFileOperation && <AssetFileOperationDialog mode={assetFileOperation.mode} asset={assetFileOperation.mode === 'rename' ? assetFileOperation.asset : undefined} selectedCount={assetFileOperation.mode === 'move' ? assetFileOperation.assetIds.length : 1} folders={folders} copy={copy} busy={assetFileOperationBusy} onClose={() => setAssetFileOperation(null)} onRename={renameAsset} onMove={moveAssets} />}
      {propertiesFolder && <FolderPropertiesDialog copy={copy} properties={folderProperties} loading={folderPropertiesLoading} onClose={() => setPropertiesFolder(null)} />}
      {deleteFolderTarget && <DeleteFolderDialog name={deleteFolderTarget.name} copy={copy} preview={folderDeletionPreview} loading={folderDeletionPreviewLoading} error={folderDeletionPreviewError} busy={folderOperationBusy} onClose={() => setDeleteFolderTarget(null)} onTrash={() => void finishActiveFolderRemoval(false)} onPermanent={() => void finishActiveFolderRemoval(true)} />}
      {restoreFolderTarget && <RestoreFolderDialog entry={restoreFolderTarget} folders={folders} copy={copy} busy={trashFolderBusyId === restoreFolderTarget.id} onClose={() => setRestoreFolderTarget(null)} onConfirm={restoreFolderBatch} />}
      {permanentFolderTarget && <PermanentDeleteFolderDialog entry={permanentFolderTarget} copy={copy} busy={trashFolderBusyId === permanentFolderTarget.id} onClose={() => setPermanentFolderTarget(null)} onConfirm={permanentlyDeleteFolderBatch} />}
    </div>
  )
}

function FolderContextTarget({ target, copy, children, onCreate, onRename, onMove, onProperties, onDelete }: {
  target: FolderTarget
  copy: LocalLibraryCopy
  children: ReactElement
  onCreate: (target: FolderTarget) => void
  onRename: (target: FolderTarget) => void
  onMove: (target: FolderTarget) => void
  onProperties: (target: FolderTarget) => void
  onDelete: (target: FolderTarget) => void
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel className="max-w-56 truncate">{target.name}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onCreate(target)}><FolderPlus size={14} />{copy.newFolder}</ContextMenuItem>
        {!target.isRoot ? <>
          <ContextMenuItem onSelect={() => onRename(target)}><FolderPen size={14} />{copy.renameFolder}</ContextMenuItem>
          <ContextMenuItem onSelect={() => onMove(target)}><FolderInput size={14} />{copy.moveFolder}</ContextMenuItem>
        </> : null}
        <ContextMenuItem onSelect={() => onProperties(target)}><Info size={14} />{copy.folderProperties}</ContextMenuItem>
        {!target.isRoot ? (
          <><ContextMenuSeparator /><ContextMenuItem variant="destructive" onSelect={() => onDelete(target)}><Trash2 size={14} />{copy.deleteFolder}</ContextMenuItem></>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function NavButton({ active, icon: Icon, label, count, onClick }: { active: boolean; icon: typeof Images; label: string; count?: number; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition hover:bg-secondary" style={{ backgroundColor: active ? 'var(--accent)' : undefined, color: active ? 'var(--accent-foreground)' : undefined }}><Icon size={15} /><span className="min-w-0 flex-1 truncate">{label}</span>{count != null && <span className="text-[9px]" style={{ color: 'var(--muted-foreground)' }}>{count}</span>}</button>
}

function Stat({ value, label }: { value: number; label: string }) {
  return <div><div className="font-medium" style={{ color: 'var(--foreground)' }}>{value.toLocaleString()}</div><div className="truncate">{label}</div></div>
}
