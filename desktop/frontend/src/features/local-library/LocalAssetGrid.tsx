import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Check, ChevronRight, CircleAlert, Cloud, CloudOff, Copy, File, FileImage, FilePenLine, Folder, FolderInput, FolderOpen, FolderSearch2, Heart, Loader2, Play, RefreshCw, RotateCcw, Scissors, Settings2, Trash2, Upload } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/ContextMenu'
import { isPhotoAsset } from './types'
import type { FolderItem, LocalAsset } from './types'
import type { types as wailsTypes } from '../../../wailsjs/go/models'
import { LibraryCountBar, LibraryEmptyState } from '@/components/ui/library'
import type { LocalLibraryCopy } from './copy'

const MASONRY_COLUMN_GAP = 6
const MASONRY_CARD_CAPTION_HEIGHT = 0
const MASONRY_CARD_MARGIN = 6

interface Props {
  assets: LocalAsset[]
  folders: FolderItem[]
  selectedIds: string[]
  focusedId?: string
  loading: boolean
  hasMore: boolean
  total: number
  copy: LocalLibraryCopy
  emptyTitle?: string
  emptyHint?: string
  canUpload: boolean
  storageSources: wailsTypes.StorageSourceDTO[]
  storageSourcesLoading: boolean
  viewMode: 'crop' | 'fit' | 'masonry'
  gridSize: number
  pathSegments: string[]
  resetKey: string
  onSelect: (asset: LocalAsset, intent?: { toggle?: boolean, range?: boolean }) => void
  onOpen: (asset: LocalAsset) => void
  onOpenFolder: (folder: FolderItem) => void
  onOpenInFileManager: (asset: LocalAsset) => void
  onLoadMore: () => void
  onClipboard: (asset: LocalAsset, cut: boolean) => void
  onUpload: (asset: LocalAsset) => void
  onUploadSettings: (asset: LocalAsset) => void
  onUploadToStorage: (asset: LocalAsset, storageSourceId: string) => void
  onRefreshStorageSources: () => void
  onDelete: (asset: LocalAsset) => void
  onRename: (asset: LocalAsset) => void
  onMove: (asset: LocalAsset) => void
  onRestore: (asset: LocalAsset) => void
  onRetryPreview: (asset: LocalAsset) => void
  onRecheckMissing: (asset: LocalAsset) => void
  onRemoveMissing: (asset: LocalAsset) => void
}

export interface AssetCardProps {
  asset: LocalAsset
  dragIds: string[]
  selected: boolean
  focused: boolean
  copy: LocalLibraryCopy
  canUpload: boolean
  storageSources: wailsTypes.StorageSourceDTO[]
  storageSourcesLoading: boolean
  viewMode: 'crop' | 'fit' | 'masonry'
  onSelect: (asset: LocalAsset, intent?: { toggle?: boolean, range?: boolean }) => void
  onOpen: (asset: LocalAsset) => void
  onOpenInFileManager: (asset: LocalAsset) => void
  onClipboard: (asset: LocalAsset, cut: boolean) => void
  onUpload: (asset: LocalAsset) => void
  onUploadSettings: (asset: LocalAsset) => void
  onUploadToStorage: (asset: LocalAsset, storageSourceId: string) => void
  onRefreshStorageSources: () => void
  onDelete: (asset: LocalAsset) => void
  onRename: (asset: LocalAsset) => void
  onMove: (asset: LocalAsset) => void
  onRestore: (asset: LocalAsset) => void
  onRetryPreview: (asset: LocalAsset) => void
  onRecheckMissing: (asset: LocalAsset) => void
  onRemoveMissing: (asset: LocalAsset) => void
}

const AssetCard = memo(function AssetCard({
  asset, dragIds, selected, focused, copy, canUpload, storageSources, storageSourcesLoading, viewMode,
  onSelect, onOpen, onOpenInFileManager, onClipboard, onUpload, onUploadSettings, onUploadToStorage, onRefreshStorageSources, onDelete, onRename, onMove, onRestore, onRetryPreview, onRecheckMissing, onRemoveMissing,
}: AssetCardProps) {
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null)
  const imageFailed = failedThumbnailUrl === asset.thumbnailUrl

  const label = asset.displayTitle || asset.fileName
  const isPhoto = isPhotoAsset(asset)
  const masonry = viewMode === 'masonry'
  const unavailable = asset.availability !== 'active'
  const missing = asset.availability === 'missing'
  const trashed = asset.availability === 'trashed'
  const previewUnavailable = asset.availability === 'active' && asset.previewStatus === 'unavailable'

  const aspectRatio = isPhoto && asset.width > 0 && asset.height > 0 ? `${asset.width} / ${asset.height}` : undefined

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          draggable={asset.availability === 'active'}
          onDragStart={(event) => {
            if (asset.availability !== 'active') return
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('application/x-mo-gallery-asset-ids', JSON.stringify(dragIds))
          }}
          onClick={(event) => {
            onSelect(asset, { toggle: event.ctrlKey || event.metaKey, range: event.shiftKey })
          }}
          onKeyDown={(event) => {
            if (event.key !== ' ' || event.target !== event.currentTarget) return
            event.preventDefault()
            onSelect(asset, { toggle: true })
          }}
          onDoubleClick={() => { if (!missing && !trashed) onOpen(asset) }}
          className={`group min-w-0 overflow-hidden rounded-lg border text-left transition focus:outline-none ${masonry ? 'mb-1.5 inline-block w-full break-inside-avoid align-top' : 'flex h-full flex-col'}`}
          style={{
            borderColor: selected || focused ? 'var(--primary)' : 'var(--border)',
            backgroundColor: selected || focused ? 'var(--accent)' : 'transparent',
            boxShadow: selected || focused ? '0 0 0 1px var(--primary)' : undefined,
          }}
        >
          <span className={`relative overflow-hidden bg-background ${masonry ? 'w-full' : 'min-h-0 flex-1'}`} style={masonry && aspectRatio ? { aspectRatio } : undefined}>
            {isPhoto && !imageFailed && asset.previewStatus === 'ready' ? (
              <img src={asset.thumbnailUrl} alt={label} loading="lazy" draggable={false} onError={() => setFailedThumbnailUrl(asset.thumbnailUrl)} className={`w-full transition-[transform,opacity] duration-300 ${masonry ? 'block h-full object-cover group-hover:scale-[1.015]' : viewMode === 'fit' ? 'h-full object-contain p-1' : 'h-full object-cover group-hover:scale-[1.025]'}`} />
            ) : (
              <span className={`flex w-full flex-col items-center justify-center gap-2 ${masonry ? 'aspect-[4/3]' : 'h-full'}`} style={{ color: 'var(--muted-foreground)' }}>
                {isPhoto ? <FileImage size={25} strokeWidth={1.4} /> : <File size={25} strokeWidth={1.4} />}
                <span className="max-w-[85%] truncate text-[10px] uppercase tracking-wider">{asset.format}</span>
              </span>
            )}
            <span
              role="checkbox"
              aria-checked={selected}
              aria-label={selected ? copy.deselectLoaded : copy.selectLoaded}
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation()
                onSelect(asset, { toggle: true })
              }}
              onKeyDown={(event) => {
                if (event.key !== ' ' && event.key !== 'Enter') return
                event.preventDefault()
                event.stopPropagation()
                onSelect(asset, { toggle: true })
              }}
              className={`absolute left-2 top-2 z-20 flex h-5 w-5 cursor-pointer items-center justify-center rounded border transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              style={{
                backgroundColor: selected ? 'var(--primary)' : 'rgba(0,0,0,0.4)',
                borderColor: selected ? 'var(--primary)' : 'rgba(255,255,255,0.7)',
              }}
            >
              {selected && <Check size={12} className="text-white" />}
            </span>
            <span className="absolute right-2 top-2 z-20 flex items-center gap-1">
              <span className="rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white">{asset.extension.replace('.', '')}</span>
              {asset.isAnimated && <span className="flex h-5 w-5 items-center justify-center rounded bg-black/65 text-white"><Play size={11} fill="currentColor" /></span>}
            </span>
            {asset.cloudSyncState === 'deleted_remote'
              ? <span title={copy.cloudDeletedRemote} className="absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600/90 text-white shadow"><CloudOff size={12} /></span>
              : asset.cloudSyncState === 'conflict'
                ? <span title={copy.cloudSyncConflict} className="absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-600/90 text-white shadow"><CircleAlert size={12} /></span>
                : (asset.uploadStatus === 'uploaded' || asset.isUploaded) && <span title={copy.filterUploaded} className="absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-sky-600/90 text-white shadow"><Cloud size={12} /></span>}
            {asset.isFavorite && <Heart size={15} fill="currentColor" className="absolute bottom-2 right-2 text-white drop-shadow" />}
          </span>
          {!masonry && (
            <span className="block w-full px-2.5 py-2">
              <span className="block truncate text-xs font-medium">{label}</span>
            </span>
          )}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel className="max-w-64 truncate">{asset.fileName}</ContextMenuLabel>
        <ContextMenuSeparator />
        {missing ? (
          <>
            <ContextMenuItem onSelect={() => onRecheckMissing(asset)}><RefreshCw size={14} />{copy.recheckMissing}</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => onRemoveMissing(asset)}><Trash2 size={14} />{copy.removeMissingRecord}</ContextMenuItem>
          </>
        ) : trashed ? (
          <>
            {asset.trashEntryKind === 'folder' && <ContextMenuLabel className="max-w-64 whitespace-normal text-[10px] font-normal leading-4 text-muted-foreground">{copy.folderBatchHint}</ContextMenuLabel>}
            <ContextMenuItem onSelect={() => onRestore(asset)}><RotateCcw size={14} />{copy.restoreTrashedAsset}</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => onDelete(asset)}><Trash2 size={14} />{copy.permanentTrashedAsset}</ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuItem onSelect={() => onClipboard(asset, true)}><Scissors size={14} />{copy.cut}</ContextMenuItem>
            <ContextMenuItem onSelect={() => onClipboard(asset, false)}><Copy size={14} />{copy.copyAsset}</ContextMenuItem>
            <ContextMenuItem onSelect={() => onOpenInFileManager(asset)}><FolderSearch2 size={14} />{copy.openInFileManager}</ContextMenuItem>
            <ContextMenuItem onSelect={() => onRename(asset)}><FilePenLine size={14} />{copy.renameAsset}</ContextMenuItem>
            <ContextMenuItem onSelect={() => onMove(asset)}><FolderInput size={14} />{copy.moveAssetsToFolder}</ContextMenuItem>
            {canUpload && isPhoto && (
            <ContextMenuSub>
              <ContextMenuSubTrigger onPointerEnter={() => {
                if (!storageSourcesLoading && storageSources.length === 0) onRefreshStorageSources()
              }}><Upload size={14} />{copy.uploadTo}</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem onSelect={() => onUpload(asset)}><Upload size={14} />{copy.uploadPage}</ContextMenuItem>
                <ContextMenuItem onSelect={() => onUploadSettings(asset)}><Settings2 size={14} />{copy.uploadSettings}</ContextMenuItem>
                <ContextMenuSeparator />
                {storageSourcesLoading ? (
                  <ContextMenuItem disabled><Loader2 size={14} className="animate-spin" />{copy.loadingStorageSources}</ContextMenuItem>
                ) : storageSources.length > 0 ? storageSources.map((source) => (
                  <ContextMenuItem key={source.id} onSelect={() => onUploadToStorage(asset, source.id)}>{source.name} ({source.type})</ContextMenuItem>
                )) : (
                  <ContextMenuItem disabled>{copy.noStorageSources}</ContextMenuItem>
                )}
              </ContextMenuSubContent>
            </ContextMenuSub>
            )}
            {previewUnavailable && isPhoto && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => onRetryPreview(asset)}><RefreshCw size={14} />{copy.retryPreview}</ContextMenuItem>
              </>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => onDelete(asset)}><Trash2 size={14} />{copy.delete}</ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
})

const FolderStripCard = memo(function FolderStripCard({ folder, copy, onOpen, cardWidth }: {
  folder: FolderItem
  copy: LocalLibraryCopy
  onOpen: (folder: FolderItem) => void
  cardWidth: number
}) {
  return (
    <button
      type="button"
      aria-label={`${copy.openFolder}: ${folder.name}`}
      title={copy.doubleClickOpenFolder}
      data-local-library-import-folder={folder.relativePath}
      onDoubleClick={() => onOpen(folder)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          onOpen(folder)
        }
      }}
      className="group flex h-full shrink-0 flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
      style={{ width: cardWidth, borderColor: 'color-mix(in srgb, var(--border) 65%, transparent)', '--wails-drop-target': 'drop' } as CSSProperties}
    >
      <span className="flex min-h-0 flex-1 items-center justify-center bg-secondary/60">
        <Folder size={36} strokeWidth={1.25} style={{ color: 'var(--primary)' }} />
      </span>
      <span className="block w-full px-2.5 py-1.5">
        <span className="block truncate text-xs font-medium">{folder.name}</span>
        <span className="mt-0.5 block truncate text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{folder.assetCount.toLocaleString()} {copy.assets}</span>
      </span>
    </button>
  )
})

function estimateMasonryEntryHeight(asset: LocalAsset, columnWidth: number) {
  const aspectRatio = isPhotoAsset(asset) && asset.width > 0 && asset.height > 0
    ? asset.width / asset.height
    : 4 / 3

  return Math.round(columnWidth / aspectRatio) + MASONRY_CARD_CAPTION_HEIGHT + MASONRY_CARD_MARGIN
}

function distributeMasonryEntries(assets: LocalAsset[], columnCount: number, columnWidth: number) {
  const columns = Array.from({ length: columnCount }, () => [] as LocalAsset[])
  const heights = Array.from({ length: columnCount }, () => 0)

  for (const asset of assets) {
    let targetColumn = 0
    for (let index = 1; index < heights.length; index += 1) {
      if (heights[index] < heights[targetColumn]) targetColumn = index
    }

    columns[targetColumn].push(asset)
    heights[targetColumn] += estimateMasonryEntryHeight(asset, columnWidth)
  }

  return columns
}

export function LocalAssetGrid({
  assets, folders, selectedIds, focusedId, loading, hasMore, total, copy, emptyTitle, emptyHint, canUpload, storageSources, storageSourcesLoading, viewMode, gridSize, pathSegments, resetKey,
  onSelect, onOpen, onOpenFolder, onLoadMore, onOpenInFileManager, onClipboard, onUpload, onUploadSettings, onUploadToStorage, onRefreshStorageSources, onDelete, onRename, onMove, onRestore, onRetryPreview, onRecheckMissing, onRemoveMissing,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const assetScrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)
  const [height, setHeight] = useState(600)

  useEffect(() => {
    const element = rootRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
      setHeight(entry.contentRect.height)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const columns = Math.max(1, Math.floor((width - 24) / gridSize))
  const columnWidth = Math.max(1, (width - 24 - Math.max(0, columns - 1) * 10) / columns)
  // 与云端照片库保持一致：卡片图像区为 5:4（columnWidth * 4/5），
  // 加标题行(32px) + 卡片边框(2px)，再加行底 pb-2.5 行距(10px)，即 0.8w + 44。
  const rowHeight = Math.round(columnWidth * (4 / 5)) + 44
  const rowCount = Math.ceil(assets.length / columns)
  const isMasonry = viewMode === 'masonry'
  // 文件夹区固定占用内容区约 1/4 高度，横向滚动展示
  const folderStripHeight = folders.length > 0 ? Math.max(112, Math.min(192, Math.round(Math.max(0, height) / 4))) : 0
  const folderCardWidth = Math.max(84, Math.min(168, Math.round(folderStripHeight * 0.78)))
  const masonryColumns = useMemo(
    () => distributeMasonryEntries(assets, columns, columnWidth),
    [assets, columnWidth, columns],
  )
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => assetScrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
  })
  const rows = virtualizer.getVirtualItems()
  const lastRow = rows.at(-1)?.index ?? 0

  useEffect(() => {
    if (!isMasonry && hasMore && !loading && rowCount > 0 && lastRow >= rowCount - 2) onLoadMore()
  }, [hasMore, isMasonry, lastRow, loading, onLoadMore, rowCount])

  useEffect(() => {
    if (!isMasonry || !sentinelRef.current || !hasMore || loading) return
    const target = sentinelRef.current
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onLoadMore()
    }, { root: assetScrollRef.current, rootMargin: '400px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, isMasonry, loading, onLoadMore])

  useEffect(() => {
    virtualizer.measure()
  }, [rowHeight, virtualizer])

  useEffect(() => {
    assetScrollRef.current?.scrollTo({ top: 0 })
    virtualizer.scrollToOffset(0)
  }, [resetKey, virtualizer])

  const gridStyle = useMemo(() => ({ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }), [columns])
  const locationHeader = (
    <LibraryCountBar
      className="px-3"
      icon={FolderOpen}
      title={
        <span className="flex min-w-0 items-center overflow-hidden whitespace-nowrap" title={pathSegments.join(' > ')}>
          {pathSegments.map((segment, index) => (
            <span key={`${segment}-${index}`} className="contents">
              {index > 0 && <ChevronRight size={10} className="shrink-0 opacity-45" />}
              <span
                className={`min-w-0 truncate ${index === pathSegments.length - 1 ? 'font-medium' : ''}`}
                style={{ color: index === pathSegments.length - 1 ? 'var(--foreground)' : undefined }}
              >
                {segment}
              </span>
            </span>
          ))}
        </span>
      }
      count={
        <>
          {folders.length > 0 && (
            <>
              {folders.length.toLocaleString()} {copy.folders} ·{' '}
            </>
          )}
          {total.toLocaleString()} {copy.count}
        </>
      }
    />
  )

  const isEmpty = !loading && assets.length === 0
  const assetCard = (asset: LocalAsset) => (
    <AssetCard key={asset.id} asset={asset} dragIds={selectedIds.includes(asset.id) ? selectedIds.filter((id) => assets.find((item) => item.id === id)?.availability === 'active') : [asset.id]} selected={selectedIds.includes(asset.id)} focused={focusedId === asset.id} copy={copy} canUpload={canUpload} viewMode={viewMode}
      storageSources={storageSources} storageSourcesLoading={storageSourcesLoading}
      onSelect={onSelect} onOpen={onOpen} onOpenInFileManager={onOpenInFileManager} onClipboard={onClipboard} onUpload={onUpload} onUploadSettings={onUploadSettings} onUploadToStorage={onUploadToStorage} onRefreshStorageSources={onRefreshStorageSources} onDelete={onDelete} onRename={onRename} onMove={onMove} onRestore={onRestore}
      onRetryPreview={onRetryPreview} onRecheckMissing={onRecheckMissing} onRemoveMissing={onRemoveMissing} />
  )
  const folderStrip = folderStripHeight > 0 && (
    <div className="shrink-0 border-b" style={{ borderColor: 'var(--border)', height: folderStripHeight }}>
      <div className="custom-scrollbar h-full overflow-x-auto overflow-y-hidden px-3 pb-1.5 pt-1.5">
        <div className="flex h-full items-stretch gap-2.5">
          {folders.map((folder) => (
            <FolderStripCard key={folder.id} folder={folder} copy={copy} onOpen={onOpenFolder} cardWidth={folderCardWidth} />
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <div ref={rootRef} className="relative flex h-full min-h-0 flex-col overflow-hidden" data-local-library-guide="grid">
      <div ref={assetScrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        {locationHeader}
        {folderStrip}
        <div className="px-3 pb-4">
        {isEmpty ? (
          <div className="flex items-center justify-center px-8 py-16">
            <LibraryEmptyState
              icon={FileImage}
              title={emptyTitle || copy.empty}
              description={emptyHint || copy.emptyHint}
            />
          </div>
        ) : (
          <>
            {loading && assets.length === 0 ? (
              <div className="grid gap-2.5" style={gridStyle} aria-label={copy.loading}>
                {Array.from({ length: Math.min(12, Math.max(columns * 2, 6)) }, (_, index) => (
                  <div key={index} className="aspect-[5/4] animate-pulse overflow-hidden rounded-lg border bg-secondary/70" style={{ borderColor: 'var(--border)' }} />
                ))}
              </div>
            ) : isMasonry ? (
              <>
                <div className="flex items-start" style={{ gap: MASONRY_COLUMN_GAP }}>
                  {masonryColumns.map((columnAssets, columnIndex) => (
                    <div key={columnIndex} className="min-w-0 flex-1">
                      {columnAssets.map((asset) => assetCard(asset))}
                    </div>
                  ))}
                </div>
                {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
              </>
            ) : (
              <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
                {rows.map((row) => {
                  const start = row.index * columns
                  const rowAssets = assets.slice(start, start + columns)
                  return (
                    <div key={row.key} ref={virtualizer.measureElement} data-index={row.index} className="absolute left-0 top-0 grid w-full gap-2.5 pb-2.5"
                      style={{ ...gridStyle, height: rowHeight, transform: `translateY(${row.start}px)` }}>
                      {rowAssets.map((asset) => assetCard(asset))}
                    </div>
                  )
                })}
              </div>
            )}
            {loading && <div className="flex items-center justify-center gap-2 py-5 text-xs" style={{ color: 'var(--muted-foreground)' }}><Loader2 size={14} className="animate-spin" />{copy.loading}</div>}
            {!isMasonry && !loading && hasMore && <button type="button" onClick={onLoadMore} className="mx-auto my-3 block rounded-md border px-4 py-2 text-xs hover:bg-secondary">{copy.loadMore}</button>}
          </>
        )}
        </div>
      </div>
    </div>
  )
}
