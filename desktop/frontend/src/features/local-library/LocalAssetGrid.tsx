import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Copy, FileImage, FilePenLine, FolderInput, Heart, Loader2, Play, RefreshCw, RotateCcw, Scissors, Trash2, Upload } from 'lucide-react'
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
import type { LocalAsset, UploadAlbum } from './types'
import type { LocalLibraryCopy } from './copy'

interface Props {
  assets: LocalAsset[]
  selectedIds: string[]
  loading: boolean
  hasMore: boolean
  total: number
  copy: LocalLibraryCopy
  emptyTitle?: string
  emptyHint?: string
  uploadAlbums: UploadAlbum[]
  uploadAlbumsLoading: boolean
  onSelect: (asset: LocalAsset, intent?: { toggle?: boolean, range?: boolean }) => void
  onOpen: (asset: LocalAsset) => void
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

interface AssetCardProps {
  asset: LocalAsset
  dragIds: string[]
  selected: boolean
  copy: LocalLibraryCopy
  uploadAlbums: UploadAlbum[]
  uploadAlbumsLoading: boolean
  onSelect: (asset: LocalAsset, intent?: { toggle?: boolean, range?: boolean }) => void
  onOpen: (asset: LocalAsset) => void
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
  asset, dragIds, selected, copy, uploadAlbums, uploadAlbumsLoading,
  onSelect, onOpen, onClipboard, onUpload, onDelete, onRename, onMove, onRestore, onRetryPreview, onRecheckMissing, onRemoveMissing,
}: AssetCardProps) {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [asset.previewStatus, asset.thumbnailUrl])

  const label = asset.displayTitle || asset.fileName
  const unavailable = asset.availability !== 'active'
  const missing = asset.availability === 'missing'
  const trashed = asset.availability === 'trashed'
  const previewUnavailable = asset.availability === 'active' && asset.previewStatus === 'unavailable'

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
          className="group flex h-full min-w-0 flex-col overflow-hidden rounded-lg border text-left transition focus:outline-none focus:ring-2"
          style={{
            borderColor: selected ? 'var(--primary)' : 'var(--border)',
            backgroundColor: selected ? 'var(--accent)' : 'var(--card)',
            boxShadow: selected ? '0 0 0 1px var(--primary)' : undefined,
          }}
        >
          <span className="relative min-h-0 flex-1 overflow-hidden bg-secondary">
            {!imageFailed && asset.previewStatus === 'ready' ? (
              <img src={asset.thumbnailUrl} alt="" loading="lazy" draggable={false} onError={() => setImageFailed(true)} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.025]" />
            ) : (
              <span className="flex h-full w-full flex-col items-center justify-center gap-2" style={{ color: 'var(--muted-foreground)' }}>
                <FileImage size={25} strokeWidth={1.4} />
                <span className="max-w-[85%] truncate text-[10px] uppercase tracking-wider">{asset.format}</span>
              </span>
            )}
            <span className="absolute left-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white">{asset.extension.replace('.', '')}</span>
            {asset.isAnimated && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white"><Play size={11} fill="currentColor" /></span>}
            {asset.isFavorite && <Heart size={15} fill="currentColor" className="absolute bottom-2 right-2 text-white drop-shadow" />}
          </span>
          <span className="block w-full px-2.5 py-2">
            <span className="block truncate text-xs font-medium">{label}</span>
            <span className="mt-0.5 block truncate text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : asset.relativePath}</span>
          </span>
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
            <ContextMenuItem onSelect={() => onRename(asset)}><FilePenLine size={14} />{copy.renameAsset}</ContextMenuItem>
            <ContextMenuItem onSelect={() => onMove(asset)}><FolderInput size={14} />{copy.moveAssetsToFolder}</ContextMenuItem>
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
            {previewUnavailable && (
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

export function LocalAssetGrid({
  assets, selectedIds, loading, hasMore, total, copy, emptyTitle, emptyHint, uploadAlbums, uploadAlbumsLoading,
  onSelect, onOpen, onLoadMore, onClipboard, onUpload, onDelete, onRename, onMove, onRestore, onRetryPreview, onRecheckMissing, onRemoveMissing,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const columns = Math.max(2, Math.floor((width - 28) / 176))
  const rowCount = Math.ceil(assets.length / columns)
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 198,
    overscan: 3,
  })
  const rows = virtualizer.getVirtualItems()
  const lastRow = rows.at(-1)?.index ?? 0

  useEffect(() => {
    if (hasMore && !loading && rowCount > 0 && lastRow >= rowCount - 2) onLoadMore()
  }, [hasMore, lastRow, loading, onLoadMore, rowCount])

  const gridStyle = useMemo(() => ({ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }), [columns])

  if (!loading && assets.length === 0) {
    return (
      <div ref={scrollRef} className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-8">
        <div className="max-w-md text-center">
          <FileImage size={34} strokeWidth={1.25} className="mx-auto mb-4" style={{ color: 'var(--muted-foreground)' }} />
          <h3 className="font-sans text-sm font-medium">{emptyTitle || copy.empty}</h3>
          <p className="mt-2 text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>{emptyHint || copy.emptyHint}</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-auto px-3 pb-4">
      <div className="sticky top-0 z-10 flex h-8 items-center justify-end bg-background/90 text-[10px] backdrop-blur" style={{ color: 'var(--muted-foreground)' }}>
        {total.toLocaleString()} {copy.count}
      </div>
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {rows.map((row) => {
          const start = row.index * columns
          const rowAssets = assets.slice(start, start + columns)
          return (
            <div key={row.key} ref={virtualizer.measureElement} data-index={row.index} className="absolute left-0 top-0 grid w-full gap-2.5 pb-2.5"
              style={{ ...gridStyle, height: 198, transform: `translateY(${row.start}px)` }}>
              {rowAssets.map((asset) => (
                <AssetCard key={asset.id} asset={asset} dragIds={selectedIds.includes(asset.id) ? selectedIds.filter((id) => assets.find((item) => item.id === id)?.availability === 'active') : [asset.id]} selected={selectedIds.includes(asset.id)} copy={copy}
                  uploadAlbums={uploadAlbums} uploadAlbumsLoading={uploadAlbumsLoading}
                  onSelect={onSelect} onOpen={onOpen} onClipboard={onClipboard} onUpload={onUpload} onDelete={onDelete} onRename={onRename} onMove={onMove} onRestore={onRestore}
                  onRetryPreview={onRetryPreview} onRecheckMissing={onRecheckMissing} onRemoveMissing={onRemoveMissing} />
              ))}
            </div>
          )
        })}
      </div>
      {loading && <div className="flex items-center justify-center gap-2 py-5 text-xs" style={{ color: 'var(--muted-foreground)' }}><Loader2 size={14} className="animate-spin" />{copy.loading}</div>}
      {!loading && hasMore && <button type="button" onClick={onLoadMore} className="mx-auto my-3 block rounded-md border px-4 py-2 text-xs hover:bg-secondary">{copy.loadMore}</button>}
    </div>
  )
}
