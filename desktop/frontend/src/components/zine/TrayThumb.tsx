import type { ZineAsset } from '@/lib/zine/types'

interface TrayThumbProps {
  asset: ZineAsset
  onPick: () => void
  onDragAsset: () => void
}

export function TrayThumb({ asset, onPick, onDragAsset }: TrayThumbProps) {
  return (
    <button
      type="button"
      className="group relative aspect-square h-full shrink-0 cursor-grab overflow-hidden rounded-md border bg-muted text-left transition hover:ring-2 hover:ring-primary active:cursor-grabbing"
      style={{ borderColor: 'var(--border)' }}
      draggable
      onClick={onPick}
      onDragStart={(event) => {
        onDragAsset()
        event.dataTransfer.setData('application/x-zine-asset-id', asset.id)
        event.dataTransfer.setData('application/json', JSON.stringify(asset))
        event.dataTransfer.effectAllowed = 'copy'
      }}
      title={asset.fileName}
    >
      <img
        src={asset.previewUrl || asset.fullUrl}
        alt={asset.fileName}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        draggable={false}
        loading="lazy"
      />
      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
        {asset.fileName}
      </span>
    </button>
  )
}
