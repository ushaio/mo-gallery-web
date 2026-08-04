import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, ReactElement, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CSSProperties } from 'react'
import {
  ArchiveRestore, ArrowDown, ArrowUp, ChevronDown, ChevronRight, CircleHelp, Columns3, DatabaseBackup, FileQuestion, Folder, FolderInput, FolderOpen, FolderPen, FolderPlus, FolderSearch2, Heart, Images, Info, LayoutGrid, Loader2,
  Maximize2, Minus, Pause, Play, Plus, RefreshCw, Search, Square, Trash2, Upload, X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/ContextMenu'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import { useLibrarySections } from '@/store/preferences'
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
import { LocalLibraryGuide, LOCAL_LIBRARY_GUIDE_SEEN_KEY } from './LocalLibraryGuide'
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
import { isPhotoAsset } from './types'
import type { AssetFileOperationPlan, AssetPage, BackupOverview, BatchAssetOrganizationUpdate, FolderDeletionPreview, FolderFileOperationPlan, FolderItem, FolderProperties, FolderTrashEntry, LibrarySnapshot, LocalAsset, LocalLibraryEvent, LocalLibraryImportMode, UploadAlbum, LocalTag, LocalCollection, CollectionGroup } from './types'
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

const FOLDER_DRAG_TYPE = 'application/x-mo-gallery-folder-path'

function scanLabel(snapshot: LibrarySnapshot, copy: LocalLibraryCopy) {
  if (snapshot.state === 'suspended' || snapshot.scan.state === 'suspended') return copy.librarySuspended
  if (snapshot.state === 'repair_required') return copy.libraryIdentityMismatch
  switch (snapshot.scan.state) {
    case 'running': return copy.scanning
    case 'paused': return copy.scanPaused
    case 'failed':
      return snapshot.scan.error ? `${copy.scanFailed}: ${snapshot.rootPath} - ${snapshot.scan.error}` : `${copy.scanFailed}: ${snapshot.rootPath}`
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
  const foldersOpen = useLibrarySections((state) => state.sections.localFolders)
  const toggleSection = useLibrarySections((state) => state.toggleSection)
  const {
    folder, folders, search, sort, sortDirection, availability, favoritesOnly, tagIds, collectionIds, filters, selectedAsset, previewAsset, expandedFolderPaths,
    setFolder, setFolders, setSearch, setSort, setSortDirection, setAvailability, setFavoritesOnly, setTagIds, setCollectionIds, setFilters, clearFilters, selectAsset, setPreviewAsset, toggleFolderExpanded,
  } = useLocalLibraryStore()
  const deferredSearch = useDeferredValue(search.trim())
  const [page, setPage] = useState<AssetPage>(EMPTY_PAGE)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [favoriteCount, setFavoriteCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingSaveCountRef = useRef(0)
  const [deleteAsset, setDeleteAsset] = useState<LocalAsset | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [missingMaintenanceBusy, setMissingMaintenanceBusy] = useState(false)
  const [previewMaintenanceBusy, setPreviewMaintenanceBusy] = useState(false)
  const [removeMissingAsset, setRemoveMissingAsset] = useState<LocalAsset | null>(null)
  const [dropTargetFolder, setDropTargetFolder] = useState<string | null>(null)
  const [assetDropTargetFolder, setAssetDropTargetFolder] = useState<string | null>(null)
  const [draggedFolderPath, setDraggedFolderPath] = useState<string | null>(null)
  const [folderDropTarget, setFolderDropTarget] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'crop' | 'fit' | 'masonry'>('fit')
  const [gridSize, setGridSize] = useState(176)
  const [directFolderOnly, setDirectFolderOnly] = useState(false)
  const photosOnly = filters.photosOnly !== false
  const [importBusy, setImportBusy] = useState(false)
  const importBusyRef = useRef(false)
  const [pendingImportPaths, setPendingImportPaths] = useState<string[] | null>(null)
  const [pendingImportDestination, setPendingImportDestination] = useState<string | null>(null)
  const activeAssetRequestsRef = useRef(0)
  const paginationRequestIdRef = useRef(0)
  const previewStatusOverridesRef = useRef(new Map<string, string>())
  const [scanBusy, setScanBusy] = useState(false)
  const [backupDialogOpen, setBackupDialogOpen] = useState(false)
  const [backupOverview, setBackupOverview] = useState<BackupOverview>()
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupOperation, setBackupOperation] = useState<'create' | 'restore' | null>(null)
  const [createFolderParent, setCreateFolderParent] = useState<FolderTarget | null>(null)
  const [organizeFolderTarget, setOrganizeFolderTarget] = useState<{ target: FolderTarget, mode: 'rename' | 'move' } | null>(null)
  const [folderMovePlan, setFolderMovePlan] = useState<FolderFileOperationPlan>()
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
  const [assetMovePlan, setAssetMovePlan] = useState<AssetFileOperationPlan>()
  const [assetFileOperationBusy, setAssetFileOperationBusy] = useState(false)
  const [uploadAlbums, setUploadAlbums] = useState<UploadAlbum[]>([])
  const [uploadAlbumsLoading, setUploadAlbumsLoading] = useState(true)
  const [tags, setTags] = useState<LocalTag[]>([])
  const [collections, setCollections] = useState<LocalCollection[]>([])
  const [collectionGroups, setCollectionGroups] = useState<CollectionGroup[]>([])
  const [organizationEditor, setOrganizationEditor] = useState<OrganizationEditorTarget | null>(null)
  const [organizationDelete, setOrganizationDelete] = useState<OrganizationDeleteTarget | null>(null)
  const [organizationBusy, setOrganizationBusy] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([])
  const [selectedQueryToken, setSelectedQueryToken] = useState<string | null>(null)
  const [selectedQueryTotal, setSelectedQueryTotal] = useState(0)
  const selectionAnchorRef = useRef<string | null>(null)

  const toggleFolderCollapsed = toggleFolderExpanded

  const query = useMemo(() => ({
    folder, directFolderOnly, search: deferredSearch, sort, sortDirection, availability, favoritesOnly, tagIds, collectionIds, ...filters, photosOnly, limit: 100,
  }), [availability, collectionIds, deferredSearch, directFolderOnly, favoritesOnly, filters, folder, sort, sortDirection, tagIds])
  const queryKey = useMemo(() => JSON.stringify(query), [query])
  const activeQueryKeyRef = useRef(queryKey)
  const requestedQueryKeyRef = useRef(queryKey)
  activeQueryKeyRef.current = queryKey

  const foldersByParentId = useMemo(() => {
    const map = new Map<string, FolderItem[]>()
    for (const item of folders) {
      const key = item.parentId || ''
      map.set(key, [...(map.get(key) || []), item])
    }
    return map
  }, [folders])

  const folderTreeAssetCounts = useMemo(() => {
    const byId = new Map(folders.map((item) => [item.id, item.assetCount]))
    const deepestFirst = folders.toSorted((left, right) => (
      right.relativePath.split('/').length - left.relativePath.split('/').length
    ))
    for (const item of deepestFirst) {
      const count = byId.get(item.id) || 0
      if (item.parentId) byId.set(item.parentId, (byId.get(item.parentId) || 0) + count)
    }
    return byId
  }, [folders])

  const refreshSnapshot = useCallback(async () => {
    try { onSnapshot(await localLibraryApi.snapshot()) } catch { /* session may be closing */ }
  }, [onSnapshot])

  const reloadFolders = useCallback(async () => {
    try { setFolders(await localLibraryApi.listFolders()) }
    catch (error) { toast.error(parseLocalLibraryError(error).message) }
  }, [])

  const reloadFavoriteCount = useCallback(async () => {
    try {
      const result = await localLibraryApi.listAssets({ availability: 'active', favoritesOnly: true, limit: 1 })
      setFavoriteCount(result.total)
    } catch { /* the active asset request reports session errors */ }
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
    setSelectedQueryToken(null)
    setSelectedQueryTotal(0)
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
    const queryChanged = requestedQueryKeyRef.current !== queryKey
    requestedQueryKeyRef.current = queryKey
    paginationRequestIdRef.current += 1
    setLoadingMore(false)
    if (queryChanged) setPage(EMPTY_PAGE)
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
    setSelectedQueryToken(null)
    setSelectedQueryTotal(0)
    selectionAnchorRef.current = null
  }, [availability, collectionIds, deferredSearch, directFolderOnly, favoritesOnly, filters, folder, sort, sortDirection, tagIds])

  const selectAllQueryResults = useCallback(async () => {
    try {
      const token = await localLibraryApi.createAssetQueryToken(query)
      setSelectedQueryToken(token.token)
      setSelectedQueryTotal(token.total)
      setSelectedAssetIds(page.items.map((item) => item.id))
      toast.success(`已选择当前查询的 ${token.total.toLocaleString()} 项结果`)
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
    }
  }, [page.items, query])

  useEffect(() => { reloadFolders() }, [reloadFolders, refreshKey])
  useEffect(() => { void reloadFavoriteCount() }, [reloadFavoriteCount, refreshKey])
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

  const closeGuide = useCallback(() => {
    localStorage.setItem(LOCAL_LIBRARY_GUIDE_SEEN_KEY, '1')
    setGuideOpen(false)
  }, [])

  useEffect(() => {
    if (localStorage.getItem(LOCAL_LIBRARY_GUIDE_SEEN_KEY)) return
    // Let the workbench settle and fetch initial data before spotlighting elements.
    const timer = window.setTimeout(() => setGuideOpen(true), 400)
    return () => window.clearTimeout(timer)
  }, [])

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
    const requestId = paginationRequestIdRef.current + 1
    const requestQueryKey = queryKey
    paginationRequestIdRef.current = requestId
    setLoadingMore(true)
    activeAssetRequestsRef.current += 1
    try {
      const next = await localLibraryApi.listAssets({ ...query, cursor: page.nextCursor })
      if (paginationRequestIdRef.current !== requestId || activeQueryKeyRef.current !== requestQueryKey) return
      const overrides = previewStatusOverridesRef.current
      const nextItems = overrides.size === 0 ? next.items : next.items.map((asset) => {
        const previewStatus = overrides.get(asset.id)
        return previewStatus ? { ...asset, previewStatus } : asset
      })
      setPage((current) => ({ ...next, items: [...current.items, ...nextItems] }))
    } catch (error) {
      if (paginationRequestIdRef.current === requestId && activeQueryKeyRef.current === requestQueryKey) toast.error(parseLocalLibraryError(error).message)
    } finally {
      activeAssetRequestsRef.current = Math.max(0, activeAssetRequestsRef.current - 1)
      if (activeAssetRequestsRef.current === 0) previewStatusOverridesRef.current.clear()
      if (paginationRequestIdRef.current === requestId && activeQueryKeyRef.current === requestQueryKey) setLoadingMore(false)
    }
  }, [loadingMore, page.nextCursor, query, queryKey])

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
      const currentSelection = useLocalLibraryStore.getState().selectedAsset
      if (currentSelection?.id === assetId && currentSelection.isFavorite !== patch.isFavorite) {
        setFavoriteCount((count) => Math.max(0, count + (patch.isFavorite ? 1 : -1)))
      }
      setPage((current) => ({
        ...current,
        items: current.items.map((item) => item.id === assetId ? { ...item, ...patch } : item),
      }))
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

  const performFolderMove = async (target: FolderTarget, destinationParent: string, topLevelName: string) => {
    setFolderOperationBusy(true)
    try {
      setFolderMovePlan(await localLibraryApi.planFolderMove(target.relativePath, destinationParent, topLevelName, 'skip'))
      return true
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
      await Promise.all([reloadFolders(), refreshSnapshot()])
      refreshAssets()
      return false
    } finally {
      setFolderOperationBusy(false)
    }
  }

  const executeFolderMovePlan = async () => {
    if (!organizeFolderTarget || !folderMovePlan) return
    setFolderOperationBusy(true)
    try {
      const result = await localLibraryApi.executeFolderMovePlan(folderMovePlan.id)
      if (result.status !== 'completed') {
        toast.error(copy.folderMoveConflict)
        return
      }
      const target = organizeFolderTarget.target
      if (folder === target.relativePath || folder.startsWith(`${target.relativePath}/`)) {
        const suffix = folder.slice(target.relativePath.length)
        setFolder(`${result.folder.relativePath}${suffix}`)
      }
      toast.success(organizeFolderTarget.mode === 'rename' ? copy.folderRenamed : copy.folderMoved)
      setFolderMovePlan(undefined)
      setOrganizeFolderTarget(null)
      await Promise.all([reloadFolders(), refreshSnapshot()])
      refreshAssets()
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
    const moved = await performFolderMove(
      target,
      mode === 'rename' ? currentParent : destinationParent,
      topLevelName,
    )
    if (!moved) setFolderMovePlan(undefined)
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
    if (asset.availability !== 'active' || !isPhotoAsset(asset)) return
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
    if (asset.availability === 'active') {
      setAssetMovePlan(undefined)
      setAssetFileOperation({ mode: 'move', assetIds: [asset.id] })
    }
  }, [])

  const openMoveSelectedAssets = useCallback(() => {
    const activeIds = selectedAssetIds.filter((id) => page.items.find((item) => item.id === id)?.availability === 'active')
    if (activeIds.length > 0) {
      setAssetMovePlan(undefined)
      setAssetFileOperation({ mode: 'move', assetIds: activeIds })
    }
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

  const performAssetMove = async (assetIds: string[], destinationFolder: string, conflictPolicy: 'skip' | 'rename', closeDialog: boolean) => {
    if (assetIds.length === 0) return
    setAssetFileOperationBusy(true)
    try {
      const plan = await localLibraryApi.planAssetMove(assetIds, destinationFolder, conflictPolicy)
      setAssetMovePlan(plan)
      if (!closeDialog) return
      const results = await localLibraryApi.executeAssetMovePlan(plan.id)
      runResultsMessage(results.results, copy.assetsMoved, copy.assetsMovePartial)
      setAssetMovePlan(undefined)
      const failedIds = results.results.filter((result) => result.status === 'failed').map((result) => result.assetId)
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

  const executeAssetMovePlan = async () => {
    if (!assetMovePlan) return
    setAssetFileOperationBusy(true)
    try {
      const execution = await localLibraryApi.executeAssetMovePlan(assetMovePlan.id)
      runResultsMessage(execution.results, copy.assetsMoved, copy.assetsMovePartial)
      setAssetMovePlan(undefined)
      setAssetFileOperation(null)
      clearAssetSelection()
    } catch (error) { toast.error(parseLocalLibraryError(error).message) }
    finally { setAssetFileOperationBusy(false) }
  }

  const moveAssets = async (destinationFolder: string, conflictPolicy: 'skip' | 'rename') => {
    if (!assetFileOperation || assetFileOperation.mode !== 'move') return
    await performAssetMove(assetFileOperation.assetIds, destinationFolder, conflictPolicy, false)
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

  const assetDropHandlers = (onDrop: (assetIds: string[]) => void, dropEffect: 'move' | 'link' = 'move', targetFolder?: string) => ({
    onDragEnter: (event: ReactDragEvent) => {
      if (!event.dataTransfer.types.includes('application/x-mo-gallery-asset-ids')) return
      if (targetFolder !== undefined) setAssetDropTargetFolder(targetFolder)
    },
    onDragOver: (event: ReactDragEvent) => {
      if (!event.dataTransfer.types.includes('application/x-mo-gallery-asset-ids')) return
      event.preventDefault()
      event.dataTransfer.dropEffect = dropEffect
    },
    onDragLeave: (event: ReactDragEvent) => {
      if (targetFolder === undefined || event.currentTarget.contains(event.relatedTarget as Node | null)) return
      setAssetDropTargetFolder((current) => current === targetFolder ? null : current)
    },
    onDrop: (event: ReactDragEvent) => {
      const raw = event.dataTransfer.getData('application/x-mo-gallery-asset-ids')
      if (!raw) return
      event.preventDefault()
      event.stopPropagation()
      setAssetDropTargetFolder(null)
      try {
        const ids = JSON.parse(raw) as unknown
        if (Array.isArray(ids) && ids.every((id): id is string => typeof id === 'string')) onDrop(ids)
      } catch { /* ignore malformed drag payload */ }
    },
  })

  const canMoveFolderTo = (source: string, destinationParent: string) => {
    const currentParent = source.includes('/') ? source.slice(0, source.lastIndexOf('/')) : ''
    return destinationParent !== source
      && !destinationParent.startsWith(`${source}/`)
      && destinationParent !== currentParent
  }

  const folderDropHandlers = (destinationParent: string) => ({
    onDragEnter: (event: ReactDragEvent) => {
      if (event.dataTransfer.types.includes('application/x-mo-gallery-asset-ids')) {
        setAssetDropTargetFolder(destinationParent)
        return
      }
      if (!event.dataTransfer.types.includes(FOLDER_DRAG_TYPE)) return
      event.stopPropagation()
      if (draggedFolderPath && canMoveFolderTo(draggedFolderPath, destinationParent)) setFolderDropTarget(destinationParent)
    },
    onDragOver: (event: ReactDragEvent) => {
      if (event.dataTransfer.types.includes('application/x-mo-gallery-asset-ids')) {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        return
      }
      if (!event.dataTransfer.types.includes(FOLDER_DRAG_TYPE)) return
      event.preventDefault()
      event.stopPropagation()
      const allowed = Boolean(draggedFolderPath && canMoveFolderTo(draggedFolderPath, destinationParent))
      event.dataTransfer.dropEffect = allowed ? 'move' : 'none'
      setFolderDropTarget(allowed ? destinationParent : null)
    },
    onDragLeave: (event: ReactDragEvent) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
      if (event.dataTransfer.types.includes('application/x-mo-gallery-asset-ids')) {
        setAssetDropTargetFolder((current) => current === destinationParent ? null : current)
        return
      }
      if (!event.dataTransfer.types.includes(FOLDER_DRAG_TYPE)) return
      setFolderDropTarget((current) => current === destinationParent ? null : current)
    },
    onDrop: (event: ReactDragEvent) => {
      const assetPayload = event.dataTransfer.getData('application/x-mo-gallery-asset-ids')
      if (assetPayload) {
        event.preventDefault()
        event.stopPropagation()
        setAssetDropTargetFolder(null)
        try {
          const ids = JSON.parse(assetPayload) as unknown
          if (Array.isArray(ids) && ids.every((id): id is string => typeof id === 'string')) void performAssetMove(ids, destinationParent, 'skip', true)
        } catch { /* ignore malformed drag payload */ }
        return
      }
      if (!event.dataTransfer.types.includes(FOLDER_DRAG_TYPE)) return
      event.preventDefault()
      event.stopPropagation()
      const source = event.dataTransfer.getData(FOLDER_DRAG_TYPE) || draggedFolderPath
      setDraggedFolderPath(null)
      setFolderDropTarget(null)
      if (!source || !canMoveFolderTo(source, destinationParent)) return
      const sourceFolder = folders.find((item) => item.relativePath === source)
      if (!sourceFolder) return
      void performFolderMove(
        { relativePath: sourceFolder.relativePath, name: sourceFolder.name, isRoot: false },
        destinationParent,
        sourceFolder.name,
      )
    },
  })

  const renderFolderTree = (parentId = '', depth = 0): ReactNode => (
    foldersByParentId.get(parentId)?.map((item) => {
      const target = { relativePath: item.relativePath, name: item.name, isRoot: false }
      const children = foldersByParentId.get(item.id) || []
      const collapsed = !expandedFolderPaths.has(item.relativePath)
      const highlighted = assetDropTargetFolder === item.relativePath || folderDropTarget === item.relativePath
      const selected = folder === item.relativePath && availability === 'active' && tagIds.length === 0 && collectionIds.length === 0
      return (
        <div key={item.id}>
          <div
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(FOLDER_DRAG_TYPE, item.relativePath)
              event.dataTransfer.effectAllowed = 'move'
              setDraggedFolderPath(item.relativePath)
            }}
            onDragEnd={() => { setDraggedFolderPath(null); setFolderDropTarget(null) }}
            data-local-library-import-folder={item.relativePath}
            style={{ '--wails-drop-target': 'drop' } as CSSProperties}
            {...folderDropHandlers(item.relativePath)}
          >
            <FolderContextTarget target={target} copy={copy}
              onCreate={setCreateFolderParent} onOpenInFileManager={(next) => void openFolderInFileManager(next)} onRename={(next) => setOrganizeFolderTarget({ target: next, mode: 'rename' })} onMove={(next) => setOrganizeFolderTarget({ target: next, mode: 'move' })} onProperties={setPropertiesFolder} onDelete={setDeleteFolderTarget}>
              <div
                className="mb-0.5 flex w-full items-center rounded-md py-1.5 pr-2 text-xs hover:bg-secondary"
                style={{
                  paddingLeft: `${7 + Math.min(5, depth) * 12}px`,
                  backgroundColor: highlighted ? 'var(--primary)' : selected ? 'var(--accent)' : undefined,
                  color: highlighted ? 'var(--primary-foreground)' : undefined,
                  boxShadow: highlighted ? '0 0 0 2px color-mix(in srgb, var(--primary) 30%, transparent)' : undefined,
                }}
              >
                {children.length > 0 ? (
                  <button
                    type="button"
                    aria-label={collapsed ? copy.expand : copy.collapse}
                    title={collapsed ? copy.expand : copy.collapse}
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleFolderCollapsed(item.relativePath)
                    }}
                    className="mr-0.5 flex size-4 shrink-0 items-center justify-center rounded hover:bg-black/10"
                  >
                    {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  </button>
                ) : <span className="mr-0.5 size-4 shrink-0" />}
                <button
                  type="button"
                  onClick={() => { setAvailability('active'); setFavoritesOnly(false); setFolder(item.relativePath) }}
                  onDoubleClick={() => { if (children.length > 0) toggleFolderCollapsed(item.relativePath) }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <Folder size={14} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="text-[9px] opacity-65">{folderTreeAssetCounts.get(item.id) || 0}</span>
                </button>
              </div>
            </FolderContextTarget>
          </div>
          {!collapsed ? renderFolderTree(item.id, depth + 1) : null}
        </div>
      )
    }) || null
  )

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
      } else {
        await localLibraryApi.updateCollectionGroup(organizationEditor.item.id, value.parentId, value.name, organizationEditor.item.position)
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
    if (selectedAssetIds.length < 2 && !selectedQueryToken) return
    setOrganizationBusy(true)
    try {
      if (selectedQueryToken) await localLibraryApi.batchUpdateAssetOrganizationByQuery(selectedQueryToken, update)
      else await localLibraryApi.batchUpdateAssetOrganization({ assetIds: selectedAssetIds, ...update })
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

  const openAssetInFileManager = async (asset: LocalAsset) => {
    try { await localLibraryApi.openAssetInFileManager(asset.id) }
    catch (error) { toast.error(parseLocalLibraryError(error).message) }
  }

  const openFolderInFileManager = async (target: FolderTarget) => {
    try { await localLibraryApi.openFolderInFileManager(target.relativePath) }
    catch (error) { toast.error(parseLocalLibraryError(error).message) }
  }

  const createTagFromDetails = async (name: string) => {
    const existing = tags.find((tag) => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase())
    if (existing) return existing
    setOrganizationBusy(true)
    try {
      const created = await localLibraryApi.createTag(name)
      setTags((current) => [...current, created])
      return created
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message)
      return undefined
    } finally {
      setOrganizationBusy(false)
    }
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
  const previewIndex = previewAsset ? page.items.findIndex((item) => item.id === previewAsset.id) : -1
  const previewNeighbors = useMemo(() => {
    if (previewIndex < 0) return { previous: undefined, next: undefined }
    const previous = page.items.slice(0, previewIndex).reverse().find((item) => item.availability === 'active')
    const next = page.items.slice(previewIndex + 1).find((item) => item.availability === 'active')
    return { previous, next }
  }, [page.items, previewIndex])
  const previewNext = useCallback(async () => {
    if (previewNeighbors.next) {
      setPreviewAsset(previewNeighbors.next)
      return
    }
    if (!page.nextCursor || loadingMore) return
    const requestId = paginationRequestIdRef.current + 1
    const requestQueryKey = queryKey
    paginationRequestIdRef.current = requestId
    setLoadingMore(true)
    activeAssetRequestsRef.current += 1
    try {
      const next = await localLibraryApi.listAssets({ ...query, cursor: page.nextCursor })
      if (paginationRequestIdRef.current !== requestId || activeQueryKeyRef.current !== requestQueryKey) return
      const overrides = previewStatusOverridesRef.current
      const nextItems = overrides.size === 0 ? next.items : next.items.map((asset) => {
        const previewStatus = overrides.get(asset.id)
        return previewStatus ? { ...asset, previewStatus } : asset
      })
      const nextActive = nextItems.find((item) => item.availability === 'active')
      setPage((current) => ({ ...next, items: [...current.items, ...nextItems] }))
      if (nextActive) setPreviewAsset(nextActive)
    } catch (error) {
      if (paginationRequestIdRef.current === requestId && activeQueryKeyRef.current === requestQueryKey) toast.error(parseLocalLibraryError(error).message)
    } finally {
      activeAssetRequestsRef.current = Math.max(0, activeAssetRequestsRef.current - 1)
      if (activeAssetRequestsRef.current === 0) previewStatusOverridesRef.current.clear()
      if (paginationRequestIdRef.current === requestId && activeQueryKeyRef.current === requestQueryKey) setLoadingMore(false)
    }
  }, [loadingMore, page.nextCursor, previewNeighbors.next, query, queryKey, setPreviewAsset])
  const currentPathSegments = useMemo(() => {
    const rootSegments = snapshot.rootPath.split(/[\\/]+/).filter(Boolean).map((segment, index) => index === 0 ? segment.replace(/:$/, '') : segment)
    return [...rootSegments, ...folder.split('/').filter(Boolean)]
  }, [folder, snapshot.rootPath])
  const isSuspended = snapshot.state === 'suspended'
  const isRepairRequired = snapshot.state === 'repair_required'
  const isScanning = snapshot.scan.state === 'running'
  const hasStructuredFilters = Object.values(filters).some((value) => Array.isArray(value) ? value.length > 0 : value !== undefined && value !== '')
  const canBrowsePhysicalFolders = availability === 'active' && !favoritesOnly && tagIds.length === 0 && collectionIds.length === 0 && !deferredSearch && !hasStructuredFilters
  const currentChildFolders = useMemo(() => {
    if (!canBrowsePhysicalFolders) return []
    const parentId = folder ? folders.find((item) => item.relativePath === folder)?.id : ''
    if (folder && !parentId) return []
    return foldersByParentId.get(parentId || '') || []
  }, [canBrowsePhysicalFolders, folder, folders, foldersByParentId])
  const canImportIntoCurrentView = canBrowsePhysicalFolders

  return (
    <div className="relative grid h-full min-h-0 grid-cols-[218px_minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)] bg-background" onDragEnd={() => { setAssetDropTargetFolder(null); setDraggedFolderPath(null); setFolderDropTarget(null) }}>
      <header className="col-span-2 col-start-2 row-start-1 shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex h-16 items-center gap-4 px-4">
          <div className="min-w-0 flex-1" data-local-library-guide="library">
            <div className="flex items-center gap-2"><h1 className="truncate text-lg font-semibold">{snapshot.name}</h1><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: isSuspended || isRepairRequired ? '#d97706' : isScanning ? 'var(--primary)' : '#4f9d69' }} /></div>
            <p style={{ color: 'var(--muted-foreground)' }}>{snapshot.rootPath}</p>
          </div>
          <button type="button" data-local-library-guide="import" disabled={importBusy || isSuspended || isRepairRequired} onClick={chooseFiles} className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium disabled:cursor-wait disabled:opacity-70" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>{importBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}{importBusy ? copy.importing : copy.import}</button>
          <button type="button" disabled={isSuspended || isRepairRequired} onClick={openBackups} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50"><DatabaseBackup size={13} />{copy.databaseBackups}</button>
          <button type="button" data-local-library-guide="guide" onClick={() => setGuideOpen(true)} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-secondary"><CircleHelp size={13} />{copy.guide.label}</button>
          <button type="button" onClick={closeLibrary} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary">{copy.close}</button>
        </div>
      </header>

      <div className="contents">
        <aside className="col-start-1 row-span-2 row-start-1 flex w-[218px] min-h-0 shrink-0 flex-col overflow-hidden border-r bg-card p-3" style={{ borderColor: 'var(--border)' }}>
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
            <div data-local-library-guide="nav">
              <NavButton active={availability === 'active' && !favoritesOnly && !folder && tagIds.length === 0 && collectionIds.length === 0} icon={Images} label={copy.allPhotos} count={snapshot.assetCount} onClick={() => { setAvailability('active'); setFavoritesOnly(false); setFolder('') }} />
              <div data-local-library-logical-target {...assetDropHandlers((ids) => void applyOrganizationDrop(ids, { kind: 'favorite' }), 'link')}><NavButton active={availability === 'active' && favoritesOnly} icon={Heart} label={copy.favorites} count={favoriteCount} onClick={() => { setAvailability('active'); setFavoritesOnly(true); setFolder('') }} /></div>
            </div>
            <div data-local-library-guide="folders">
              <button
                type="button"
                onClick={() => toggleSection('localFolders')}
                aria-expanded={foldersOpen}
                className="mb-2 mt-5 flex w-full items-center gap-1 rounded px-2 py-1 text-left text-[10px] font-medium uppercase tracking-[0.16em] transition hover:bg-secondary"
                style={{ color: 'var(--muted-foreground)' }}
              >
                {foldersOpen ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />}
                <span className="truncate">{copy.folders}</span>
              </button>
              {foldersOpen && (<>
              <div data-local-library-import-folder="" style={{ '--wails-drop-target': 'drop' } as CSSProperties} {...folderDropHandlers('')}>
                <FolderContextTarget
                  target={{ relativePath: '', name: copy.root, isRoot: true }} copy={copy}
                  onCreate={setCreateFolderParent} onOpenInFileManager={(target) => void openFolderInFileManager(target)} onRename={() => undefined} onMove={() => undefined} onProperties={setPropertiesFolder} onDelete={setDeleteFolderTarget}
                >
                  <button type="button" onClick={() => { setAvailability('active'); setFavoritesOnly(false); setFolder('') }}
                    className="mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition hover:bg-secondary"
                    style={{ backgroundColor: assetDropTargetFolder === '' || folderDropTarget === '' ? 'var(--primary)' : availability === 'active' && !favoritesOnly && !folder && tagIds.length === 0 && collectionIds.length === 0 ? 'var(--accent)' : undefined, color: assetDropTargetFolder === '' || folderDropTarget === '' ? 'var(--primary-foreground)' : undefined, boxShadow: assetDropTargetFolder === '' || folderDropTarget === '' ? '0 0 0 2px color-mix(in srgb, var(--primary) 30%, transparent)' : undefined }}>
                    <FolderOpen size={15} /><span className="min-w-0 flex-1 truncate">{copy.root}</span><span className="shrink-0 truncate text-[9px]" style={{ color: 'var(--muted-foreground)' }} title={snapshot.rootPath}>{snapshot.rootPath}</span>
                  </button>
                </FolderContextTarget>
              </div>
              {renderFolderTree()}
              </>)}
            </div>
            <OrganizationNavigation copy={copy} tags={tags} groups={collectionGroups} collections={collections} selectedTagIds={tagIds} selectedCollectionIds={collectionIds}
              onSelectTags={(ids) => { setAvailability('active'); setFavoritesOnly(false); setTagIds(ids) }} onSelectCollections={(ids) => { setAvailability('active'); setFavoritesOnly(false); setCollectionIds(ids) }}
              onEdit={setOrganizationEditor} onDelete={setOrganizationDelete} onDropAssets={(ids, target) => void applyOrganizationDrop(ids, target)} />
          </div>
          <div className="mt-3 shrink-0 rounded-lg border p-3 text-[10px] leading-4" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
            <div className="grid grid-cols-3 gap-1 text-center">
              <StatButton active={availability === 'active' && !favoritesOnly && !folder && tagIds.length === 0 && collectionIds.length === 0} value={snapshot.assetCount} label={copy.allPhotos} onClick={() => { setAvailability('active'); setFavoritesOnly(false); setFolder('') }} />
              <StatButton active={availability === 'missing'} value={snapshot.missingCount} label={copy.missing} onClick={() => { setAvailability('missing'); setFavoritesOnly(false); setFolder('') }} />
              <StatButton active={availability === 'trashed'} value={snapshot.trashCount} label={copy.inTrash} onClick={() => { setAvailability('trashed'); setFavoritesOnly(false); setFolder('') }} />
            </div>
          </div>
        </aside>

        <main data-local-library-import-folder={canImportIntoCurrentView ? folder : undefined} style={canImportIntoCurrentView ? { '--wails-drop-target': 'drop' } as CSSProperties : undefined} className="col-start-2 row-start-2 flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="flex min-h-13 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--border)' }} data-local-library-guide="toolbar">
            <div className="relative min-w-0 flex-1"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} className="h-8 w-full rounded-md border bg-input pl-8 pr-8 text-xs outline-none focus:ring-1" />{search && <button type="button" onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1"><X size={13} /></button>}</div>
            <LocalAssetFilters copy={copy} filters={filters} onChange={setFilters} onClear={clearFilters} />
            {page.total > page.items.length && <button type="button" onClick={() => void selectAllQueryResults()} className="h-8 shrink-0 rounded-md border px-2.5 text-[10px] hover:bg-secondary">{copy.selectAllResults} {page.total.toLocaleString()}</button>}
            <label className="flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md border bg-input px-2.5 text-[10px]">
              <input type="checkbox" checked={directFolderOnly} onChange={(event) => setDirectFolderOnly(event.target.checked)} />
              {copy.hideSubfolderPhotos}
            </label>
            <div className="flex h-8 shrink-0 items-center rounded-md border bg-input p-0.5">
              <button type="button" title={copy.croppedView} aria-label={copy.croppedView} onClick={() => setViewMode('crop')} className="flex size-7 items-center justify-center rounded" style={{ backgroundColor: viewMode === 'crop' ? 'var(--secondary)' : undefined }}><LayoutGrid size={13} /></button>
              <button type="button" title={copy.fittedView} aria-label={copy.fittedView} onClick={() => setViewMode('fit')} className="flex size-7 items-center justify-center rounded" style={{ backgroundColor: viewMode === 'fit' ? 'var(--secondary)' : undefined }}><Maximize2 size={13} /></button>
              <button type="button" title={copy.masonryView} aria-label={copy.masonryView} onClick={() => setViewMode('masonry')} className="flex size-7 items-center justify-center rounded" style={{ backgroundColor: viewMode === 'masonry' ? 'var(--secondary)' : undefined }}><Columns3 size={13} /></button>
            </div>
            <SelectDropdown
              value={sort}
              options={[
                { value: 'captured', label: copy.captured },
                { value: 'discovered', label: copy.discovered },
                { value: 'name', label: copy.name },
                { value: 'modified', label: copy.modified },
                { value: 'size', label: copy.size },
                { value: 'rating', label: copy.rating },
              ]}
              onChange={(value) => setSort(value as typeof sort)}
              className="w-28 shrink-0"
            />
            <button type="button" onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')} title={sortDirection === 'asc' ? copy.ascending : copy.descending} aria-label={sortDirection === 'asc' ? copy.ascending : copy.descending} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-input hover:bg-secondary">{sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}</button>
          </div>
          {(isSuspended || isRepairRequired) && <div className="border-b px-4 py-2 text-[11px]" style={{ borderColor: 'var(--border)', color: '#b45309', backgroundColor: 'color-mix(in srgb, #f59e0b 10%, var(--card))' }}>{scanLabel(snapshot, copy)}</div>}
          {availability === 'trashed' && <FolderTrashSection entries={trashedFolders} copy={copy} loading={trashedFoldersLoading} busyId={trashFolderBusyId} onRestore={setRestoreFolderTarget} onPermanentDelete={setPermanentFolderTarget} />}
          <LocalAssetGrid assets={page.items} folders={currentChildFolders} loading={loading || loadingMore} hasMore={Boolean(page.nextCursor)} total={page.total} copy={copy}
            emptyTitle={availability === 'missing' ? copy.missingEmpty : undefined} emptyHint={availability === 'missing' ? copy.missingEmptyHint : undefined}
            uploadAlbums={uploadAlbums} uploadAlbumsLoading={uploadAlbumsLoading} viewMode={viewMode} gridSize={gridSize} pathSegments={currentPathSegments} resetKey={queryKey}
            selectedIds={selectedAssetIds} onSelect={selectGridAsset} onOpen={(asset) => { if (asset.availability === 'active') setPreviewAsset(asset) }} onOpenFolder={(nextFolder) => { clearAssetSelection(); setFolder(nextFolder.relativePath) }} onLoadMore={loadMore}
            onOpenInFileManager={(asset) => void openAssetInFileManager(asset)}
            onClipboard={copyAssetToClipboard} onUpload={uploadAsset} onDelete={(asset) => { selectAsset(asset); setDeleteAsset(asset) }} onRename={openRenameAsset} onMove={openMoveAsset} onRestore={restoreAsset}
            onRetryPreview={retryPreview} onRecheckMissing={recheckMissing} onRemoveMissing={(asset) => { selectAsset(asset); setRemoveMissingAsset(asset) }} />
          <div className="flex min-h-10 shrink-0 items-center gap-3 border-t px-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }} data-local-library-guide="statusbar">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap text-[11px]"><span className={`shrink-0 ${isScanning ? 'animate-pulse' : ''}`} style={{ color: isScanning ? 'var(--primary)' : 'var(--muted-foreground)' }}>{scanLabel(snapshot, copy)}</span><span className="min-w-0 flex-1 truncate" style={{ color: 'var(--muted-foreground)' }}>{snapshot.scan.lastPath || currentLocation}</span></div>
            {snapshot.scan.state === 'running' && <><button disabled={scanBusy} onClick={() => runScanAction('pause')} className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] hover:bg-secondary"><Pause size={11} />{copy.pause}</button><button disabled={scanBusy} onClick={() => runScanAction('cancel')} className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] hover:bg-secondary"><Square size={10} />{copy.cancel}</button></>}
            {snapshot.scan.state === 'paused' && !isSuspended && !isRepairRequired && <button disabled={scanBusy} onClick={() => runScanAction('resume')} className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] hover:bg-secondary"><Play size={11} />{copy.resume}</button>}
            {!isSuspended && !isRepairRequired && !['running','paused'].includes(snapshot.scan.state) && <button disabled={scanBusy} onClick={() => runScanAction('start')} className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] hover:bg-secondary"><RefreshCw size={11} />{copy.rescan}</button>}
            <div className="ml-1 flex shrink-0 items-center gap-2 border-l pl-3" style={{ borderColor: 'var(--border)' }}>
              <Minus size={11} style={{ color: 'var(--muted-foreground)' }} />
              <input type="range" min={120} max={280} step={8} value={gridSize} onChange={(event) => setGridSize(Number(event.target.value))} aria-label={copy.gridZoom} title={copy.gridZoom} className="h-1 w-28 cursor-pointer accent-current" />
              <Plus size={11} style={{ color: 'var(--muted-foreground)' }} />
              <span className="w-8 text-right text-[9px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>{Math.round(gridSize / 176 * 100)}%</span>
            </div>
          </div>
        </main>

        <div className="col-start-3 row-start-2 min-h-0 overflow-hidden">
          {(selectedAssetIds.length > 1 || selectedQueryToken) ? <LocalAssetBatchDetails selectedCount={selectedQueryToken ? selectedQueryTotal : selectedAssetIds.length} tags={tags} collections={collections} copy={copy} busy={organizationBusy || assetFileOperationBusy} canMove={!selectedQueryToken && selectedAssetIds.every((id) => page.items.find((item) => item.id === id)?.availability === 'active')} onClear={clearAssetSelection} onMove={openMoveSelectedAssets} onUpdate={(update) => void batchUpdateOrganization(update)} /> : <LocalAssetDetails asset={selectedAsset} copy={copy} saving={saving} maintenanceBusy={missingMaintenanceBusy || previewMaintenanceBusy} tags={tags} collections={collections} organizationBusy={organizationBusy} onSave={saveAsset}
            onPreview={(asset) => { if (asset.availability !== 'missing') setPreviewAsset(asset) }} onOpenSystem={openSystem} onMove={openMoveAsset} onDelete={setDeleteAsset} onRestore={restoreAsset}
            onRetryPreview={retryPreview} onRecheckMissing={recheckMissing} onRemoveMissing={(asset) => setRemoveMissingAsset(asset)} onSetTags={setAssetTags} onCreateTag={createTagFromDetails} onSetCollections={setAssetCollections} />}
        </div>
      </div>

      {dropTargetFolder !== null && <div className="pointer-events-none absolute inset-3 z-50 flex items-center justify-center rounded-xl border-2 border-dashed bg-background/90 backdrop-blur" style={{ borderColor: 'var(--primary)' }}><div className="text-center"><Upload size={30} className="mx-auto mb-3" style={{ color: 'var(--primary)' }} /><p className="text-sm font-medium">{copy.drop}</p><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>{dropTargetFolder || copy.root}</p></div></div>}
      {previewAsset && <LocalLibraryPreview asset={previewAsset} copy={copy} onClose={() => setPreviewAsset(null)} onOpenSystem={openSystem}
        hasPrevious={Boolean(previewNeighbors.previous)} hasNext={Boolean(previewNeighbors.next) || Boolean(page.nextCursor)}
        onPrevious={() => previewNeighbors.previous && setPreviewAsset(previewNeighbors.previous)} onNext={() => void previewNext()} />}
      {backupDialogOpen && <LocalLibraryBackupDialog copy={copy} overview={backupOverview} loading={backupLoading} operation={backupOperation} onClose={() => setBackupDialogOpen(false)} onCreate={createBackup} onRestore={restoreBackup} />}
      {organizationEditor && <OrganizationEditorDialog target={organizationEditor} groups={collectionGroups} copy={copy} busy={organizationBusy} onClose={() => setOrganizationEditor(null)} onSubmit={(value) => void saveOrganization(value)} />}
      {organizationDelete && <DeleteOrganizationDialog copy={copy} busy={organizationBusy} title={organizationDelete.kind === 'tag' ? copy.deleteTagTitle : organizationDelete.kind === 'collection' ? copy.deleteCollectionTitle : copy.deleteCollectionGroupTitle} body={organizationDelete.kind === 'tag' ? copy.deleteTagBody : organizationDelete.kind === 'collection' ? copy.deleteCollectionBody : organizationDelete.nonEmpty ? copy.deleteCollectionGroupBody : copy.deleteEmptyCollectionGroupBody} dangerousLabel={organizationDelete.kind === 'group' && organizationDelete.nonEmpty ? copy.deleteGroupContents : copy.confirmPermanent} onClose={() => setOrganizationDelete(null)} onConfirm={() => void deleteOrganization(Boolean(organizationDelete.nonEmpty))} />}
      {pendingImportPaths && <ImportModeDialog copy={copy} busy={importBusy} onClose={() => { setPendingImportPaths(null); setPendingImportDestination(null) }} onChoose={chooseImportMode} />}
      {removeMissingAsset && <RemoveMissingAssetDialog asset={removeMissingAsset} copy={copy} busy={missingMaintenanceBusy} onClose={() => setRemoveMissingAsset(null)} onConfirm={removeMissingRecord} />}
      {deleteAsset && <DeleteAssetDialog asset={deleteAsset} copy={copy} busy={deleteBusy} onClose={() => setDeleteAsset(null)} onTrash={trashSelected} onRestore={() => void restoreAsset(deleteAsset)} onPermanent={permanentlyDelete} />}
      {createFolderParent && <CreateFolderDialog parentName={createFolderParent.name} copy={copy} busy={folderOperationBusy} onClose={() => setCreateFolderParent(null)} onCreate={createFolder} />}
      {organizeFolderTarget && <MoveFolderDialog mode={organizeFolderTarget.mode} relativePath={organizeFolderTarget.target.relativePath} currentName={organizeFolderTarget.target.name} folders={folders} copy={copy} busy={folderOperationBusy} plan={folderMovePlan} onClose={() => { setFolderMovePlan(undefined); setOrganizeFolderTarget(null) }} onConfirm={organizeFolder} onExecute={() => void executeFolderMovePlan()} />}
      {assetFileOperation && <AssetFileOperationDialog mode={assetFileOperation.mode} asset={assetFileOperation.mode === 'rename' ? assetFileOperation.asset : undefined} selectedCount={assetFileOperation.mode === 'move' ? assetFileOperation.assetIds.length : 1} folders={folders} copy={copy} busy={assetFileOperationBusy} plan={assetMovePlan} onClose={() => { setAssetMovePlan(undefined); setAssetFileOperation(null) }} onRename={renameAsset} onMove={moveAssets} onConfirmPlan={() => void executeAssetMovePlan()} />}
      {propertiesFolder && <FolderPropertiesDialog copy={copy} properties={folderProperties} loading={folderPropertiesLoading} onClose={() => setPropertiesFolder(null)} />}
      {deleteFolderTarget && <DeleteFolderDialog name={deleteFolderTarget.name} copy={copy} preview={folderDeletionPreview} loading={folderDeletionPreviewLoading} error={folderDeletionPreviewError} busy={folderOperationBusy} onClose={() => setDeleteFolderTarget(null)} onTrash={() => void finishActiveFolderRemoval(false)} onPermanent={() => void finishActiveFolderRemoval(true)} />}
      {restoreFolderTarget && <RestoreFolderDialog entry={restoreFolderTarget} folders={folders} copy={copy} busy={trashFolderBusyId === restoreFolderTarget.id} onClose={() => setRestoreFolderTarget(null)} onConfirm={restoreFolderBatch} />}
      {permanentFolderTarget && <PermanentDeleteFolderDialog entry={permanentFolderTarget} copy={copy} busy={trashFolderBusyId === permanentFolderTarget.id} onClose={() => setPermanentFolderTarget(null)} onConfirm={permanentlyDeleteFolderBatch} />}
      {guideOpen && <LocalLibraryGuide copy={copy} onClose={closeGuide} />}
    </div>
  )
}

function FolderContextTarget({ target, copy, children, onCreate, onOpenInFileManager, onRename, onMove, onProperties, onDelete }: {
  target: FolderTarget
  copy: LocalLibraryCopy
  children: ReactElement
  onCreate: (target: FolderTarget) => void
  onOpenInFileManager: (target: FolderTarget) => void
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
        <ContextMenuItem onSelect={() => onOpenInFileManager(target)}><FolderSearch2 size={14} />{copy.openInFileManager}</ContextMenuItem>
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

function StatButton({ active, value, label, onClick }: { active: boolean; value: number; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 transition hover:bg-secondary"
      style={{ color: 'var(--muted-foreground)' }}
    >
      <span className="font-medium" style={{ color: active ? 'var(--primary)' : 'var(--foreground)' }}>{value.toLocaleString()}</span>
      <span className="truncate max-w-full">{label}</span>
    </button>
  )
}
