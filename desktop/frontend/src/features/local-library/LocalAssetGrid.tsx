import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronRight, Copy, File, FileImage, FilePenLine, Folder, FolderInput, FolderOpen, FolderSearch2, Heart, Loader2, Play, RefreshCw, RotateCcw, Scissors, Trash2, Upload } from 'lucide-react'
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
import type { FolderItem, LocalAsset, UploadAlbum } from './types'
import type { LocalLibraryCopy } from './copy'

const MASONRY_COLUMN_GAP = 6
const MASONRY_CARD_CAPTION_HEIGHT = 0
const MASONRY_CARD_MARGIN = 6

interface Props {
  assets: LocalAsset[]
  folders: FolderItem[]
  selectedIds: string[]
  loading: boolean
  hasMore: boolean
  total: number
  copy: LocalLibraryCopy
  emptyTitle?: string
  emptyHint?: string
  canUpload: boolean
  uploadAlbums: UploadAlbum[]
  uploadAlbumsLoading: boolean
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
  onUpload: (asset: LocalAsset, albumId?: string) => void
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
  copy: LocalLibraryCopy
  canUpload: boolean
  uploadAlbums: UploadAlbum[]
  uploadAlbumsLoading: boolean
  viewMode: 'crop' | 'fit' | 'masonry'
  onSelect: (asset: LocalAsset, intent?: { toggle?: boolean, range?: boolean }) => void
  onOpen: (asset: LocalAsset) => void
  onOpenInFileManager: (asset: LocalAsset) => void
  onClipboard: (asset: LocalAsset, cut: boolean) => void
  onUpload: (asset: LocalAsset, albumId?: string) => void
  onDelete: (asset: LocalAsset) => void
  onRename: (asset: LocalAsset) => void
  onMove: (asset: LocalAsset) => void
  onRestore: (asset: LocalAsset) => void
  onRetryPreview: (asset: LocalAsset) => void
  onRecheckMissing: (asset: LocalAsset) => void
  onRemoveMissing: (asset: LocalAsset) => void
}

const AssetCard = memo(function AssetCard({
  asset, dragIds, selected, copy, canUpload, uploadAlbums, uploadAlbumsLoading, viewMode,
  onSelect, onOpen, onOpenInFileManager, onClipboard, onUpload, onDelete, onRename, onMove, onRestore, onRetryPreview, onRecheckMissing, onRemoveMissing,
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
    <ContextMenu onOpenChange={(open) => { if (open) onSelect(asset) }}>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          draggable={asset.availability === 'active'}
          onDragStart={(event) => {
            if (asset.availability !== 'active') return
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('application/x-mo-gallery-asset-ids', JSON.stringify(dragIds))
          }}
          onClick={(event) => onSelect(asset, { toggle: event.ctrlKey || event.metaKey, range: event.shiftKey })}
          onDoubleClick={() => { if (!missing && !trashed) onOpen(asset) }}
          className={`group min-w-0 overflow-hidden rounded-lg border text-left transition focus:outline-none focus:ring-2 ${masonry ? 'mb-1.5 inline-block w-full break-inside-avoid align-top' : 'flex h-full flex-col'}`}
          style={{
            borderColor: selected ? 'var(--primary)' : 'var(--border)',
            backgroundColor: selected ? 'var(--accent)' : 'var(--card)',
            boxShadow: selected ? '0 0 0 1px var(--primary)' : undefined,
          }}
        >
          <span className={`relative overflow-hidden bg-secondary ${masonry ? 'w-full' : 'min-h-0 flex-1'}`} style={aspectRatio ? { aspectRatio } : undefined}>
            {isPhoto && !imageFailed && asset.previewStatus === 'ready' ? (
              <img src={asset.thumbnailUrl} alt="" loading="lazy" draggable={false} onError={() => setFailedThumbnailUrl(asset.thumbnailUrl)} className={`w-full transition duration-300 ${viewMode === 'fit' ? 'object-contain p-1' : 'object-cover group-hover:scale-[1.025]'} ${masonry ? 'block' : 'h-full'}`} />
            ) : (
              <span className={`flex w-full flex-col items-center justify-center gap-2 ${masonry ? 'aspect-[4/3]' : 'h-full'}`} style={{ color: 'var(--muted-foreground)' }}>
                {isPhoto ? <FileImage size={25} strokeWidth={1.4} /> : <File size={25} strokeWidth={1.4} />}
                <span className="max-w-[85%] truncate text-[10px] uppercase tracking-wider">{asset.format}</span>
              </span>
            )}
            <span className="absolute left-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white">{asset.extension.replace('.', '')}</span>
            {asset.isAnimated && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white"><Play size={11} fill="currentColor" /></span>}
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
              <ContextMenuSubTrigger><Upload size={14} />{copy.uploadTo}</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem onSelect={() => onUpload(asset)}><Upload size={14} />{copy.uploadPage}</ContextMenuItem>
                <ContextMenuSeparator />
                {uploadAlbumsLoading ? (
                  <ContextMenuItem disabled><Loader2 size={14} className="animate-spin" />{copy.loadingDestinations}</ContextMenuItem>
                ) : uploadAlbums.length > 0 ? uploadAlbums.map((album) => (
                  <ContextMenuItem key={album.id} onSelect={() => onUpload(asset, album.id)}>{album.name}</ContextMenuItem>
                )) : (
                  <ContextMenuItem disabled>{copy.noAlbums}</ContextMenuItem>
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

const FolderCard = memo(function FolderCard({ folder, copy, onOpen, masonry = false }: {
  folder: FolderItem
  copy: LocalLibraryCopy
  onOpen: (folder: FolderItem) => void
  masonry?: boolean
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
      className={`group min-w-0 overflow-hidden rounded-lg border bg-card text-left transition hover:bg-secondary/60 focus:outline-none focus:ring-2 ${masonry ? 'mb-1.5 inline-block w-full break-inside-avoid align-top' : 'flex h-full flex-col'}`}
      style={{ borderColor: 'var(--border)', '--wails-drop-target': 'drop' } as CSSProperties}
    >
      <span className={`flex items-center justify-center bg-secondary/60 ${masonry ? 'aspect-[4/3] w-full' : 'min-h-0 flex-1'}`}>
        <Folder size={54} strokeWidth={1.25} className="transition-transform duration-200 group-hover:scale-105" style={{ color: 'var(--primary)' }} />
      </span>
      {!masonry && (
        <span className="block w-full px-2.5 py-2">
          <span className="block truncate text-xs font-medium">{folder.name}</span>
          <span className="mt-0.5 block truncate text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{folder.assetCount.toLocaleString()} {copy.assets}</span>
        </span>
      )}
    </button>
  )
})

type GridEntry = { kind: 'folder', folder: FolderItem } | { kind: 'asset', asset: LocalAsset }

function estimateMasonryEntryHeight(entry: GridEntry, columnWidth: number) {
  const aspectRatio = entry.kind === 'asset' && isPhotoAsset(entry.asset) && entry.asset.width > 0 && entry.asset.height > 0
    ? entry.asset.width / entry.asset.height
    : 4 / 3

  return Math.round(columnWidth / aspectRatio) + MASONRY_CARD_CAPTION_HEIGHT + MASONRY_CARD_MARGIN
}

function distributeMasonryEntries(entries: GridEntry[], columnCount: number, columnWidth: number) {
  const columns = Array.from({ length: columnCount }, () => [] as GridEntry[])
  const heights = Array.from({ length: columnCount }, () => 0)

  for (const entry of entries) {
    let targetColumn = 0
    for (let index = 1; index < heights.length; index += 1) {
      if (heights[index] < heights[targetColumn]) targetColumn = index
    }

    columns[targetColumn].push(entry)
    heights[targetColumn] += estimateMasonryEntryHeight(entry, columnWidth)
  }

  return columns
}

export function LocalAssetGrid({
  assets, folders, selectedIds, loading, hasMore, total, copy, emptyTitle, emptyHint, canUpload, uploadAlbums, uploadAlbumsLoading, viewMode, gridSize, pathSegments, resetKey,
  onSelect, onOpen, onOpenFolder, onLoadMore, onOpenInFileManager, onClipboard, onUpload, onDelete, onRename, onMove, onRestore, onRetryPreview, onRecheckMissing, onRemoveMissing,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const entries = useMemo<GridEntry[]>(() => [
    ...folders.map((folder) => ({ kind: 'folder' as const, folder })),
    ...assets.map((asset) => ({ kind: 'asset' as const, asset })),
  ], [assets, folders])
  const columns = Math.max(1, Math.floor((width - 24) / gridSize))
  const columnWidth = Math.max(1, (width - 24 - Math.max(0, columns - 1) * 10) / columns)
  const rowHeight = Math.round(columnWidth * 0.82) + 54
  const rowCount = Math.ceil(entries.length / columns)
  const isMasonry = viewMode === 'masonry'
  const masonryColumns = useMemo(
    () => distributeMasonryEntries(entries, columns, columnWidth),
    [columnWidth, columns, entries],
  )
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
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
    }, { root: scrollRef.current, rootMargin: '400px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, isMasonry, loading, onLoadMore])

  useEffect(() => {
    virtualizer.measure()
  }, [rowHeight, virtualizer])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    virtualizer.scrollToOffset(0)
  }, [resetKey, virtualizer])

  const gridStyle = useMemo(() => ({ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }), [columns])
  const locationHeader = (
    <div className="sticky top-0 z-10 flex h-8 items-center justify-between gap-3 bg-background/90 text-[10px] backdrop-blur" style={{ color: 'var(--muted-foreground)' }}>
      <div className="flex min-w-0 items-center gap-1" title={pathSegments.join(' > ')}>
        <span className="mr-1 flex size-5 shrink-0 items-center justify-center rounded bg-secondary" style={{ color: 'var(--foreground)' }}><FolderOpen size={11} /></span>
        {pathSegments.map((segment, index) => <span key={`${segment}-${index}`} className="contents">
          {index > 0 && <ChevronRight size={10} className="shrink-0 opacity-45" />}
          <span className={`min-w-0 truncate ${index === pathSegments.length - 1 ? 'font-medium' : ''}`} style={{ color: index === pathSegments.length - 1 ? 'var(--foreground)' : undefined }}>{segment}</span>
        </span>)}
      </div>
      <span className="shrink-0 rounded bg-secondary px-2 py-0.5 tabular-nums">
        {folders.length > 0 && <>{folders.length.toLocaleString()} {copy.folders} · </>}{total.toLocaleString()} {copy.count}
      </span>
    </div>
  )

  if (!loading && entries.length === 0) {
    return (
      <div ref={scrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-auto px-3" data-local-library-guide="grid">
        {locationHeader}
        <div className="flex min-h-[calc(100%-2rem)] items-center justify-center p-8">
          <div className="max-w-md text-center">
            <FileImage size={34} strokeWidth={1.25} className="mx-auto mb-4" style={{ color: 'var(--muted-foreground)' }} />
            <h3 className="font-sans text-sm font-medium">{emptyTitle || copy.empty}</h3>
            <p className="mt-2 text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>{emptyHint || copy.emptyHint}</p>
          </div>
        </div>
      </div>
    )
  }

  const masonry = viewMode === 'masonry'
  const assetCard = (entry: GridEntry) => entry.kind === 'folder' ? (
    <FolderCard key={`folder-${entry.folder.id}`} folder={entry.folder} copy={copy} onOpen={onOpenFolder} masonry={masonry} />
  ) : (
    <AssetCard key={entry.asset.id} asset={entry.asset} dragIds={selectedIds.includes(entry.asset.id) ? selectedIds.filter((id) => assets.find((item) => item.id === id)?.availability === 'active') : [entry.asset.id]} selected={selectedIds.includes(entry.asset.id)} copy={copy} canUpload={canUpload} viewMode={viewMode}
      uploadAlbums={uploadAlbums} uploadAlbumsLoading={uploadAlbumsLoading}
      onSelect={onSelect} onOpen={onOpen} onOpenInFileManager={onOpenInFileManager} onClipboard={onClipboard} onUpload={onUpload} onDelete={onDelete} onRename={onRename} onMove={onMove} onRestore={onRestore}
      onRetryPreview={onRetryPreview} onRecheckMissing={onRecheckMissing} onRemoveMissing={onRemoveMissing} />
  )

  return (
    <div ref={scrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-auto px-3 pb-4" data-local-library-guide="grid">
      {locationHeader}
      {masonry ? (
        <>
          <div className="flex items-start" style={{ gap: MASONRY_COLUMN_GAP }}>
            {masonryColumns.map((columnEntries, columnIndex) => (
              <div key={columnIndex} className="min-w-0 flex-1">
                {columnEntries.map((entry) => assetCard(entry))}
              </div>
            ))}
          </div>
          {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
        </>
      ) : (
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {rows.map((row) => {
          const start = row.index * columns
          const rowEntries = entries.slice(start, start + columns)
          return (
            <div key={row.key} ref={virtualizer.measureElement} data-index={row.index} className="absolute left-0 top-0 grid w-full gap-2.5 pb-2.5"
              style={{ ...gridStyle, height: rowHeight, transform: `translateY(${row.start}px)` }}>
              {rowEntries.map((entry) => assetCard(entry))}
            </div>
          )
        })}
      </div>
      )}
      {loading && <div className="flex items-center justify-center gap-2 py-5 text-xs" style={{ color: 'var(--muted-foreground)' }}><Loader2 size={14} className="animate-spin" />{copy.loading}</div>}
      {!masonry && !loading && hasMore && <button type="button" onClick={onLoadMore} className="mx-auto my-3 block rounded-md border px-4 py-2 text-xs hover:bg-secondary">{copy.loadMore}</button>}
    </div>
  )
}
