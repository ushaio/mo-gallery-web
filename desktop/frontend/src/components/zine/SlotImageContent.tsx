import type { CSSProperties } from 'react'

import type { ZineAsset } from '@/lib/zine/types'

interface SlotImageContentProps {
  asset?: ZineAsset
  innerStyle?: CSSProperties
}

export function SlotImageContent({ asset, innerStyle }: SlotImageContentProps) {
  const src = asset?.previewUrl || asset?.fullUrl

  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-200 text-[3mm] font-medium text-zinc-500">
        Image
      </div>
    )
  }

  return <img src={src} alt={asset.fileName} className="h-full w-full" style={innerStyle} draggable={false} />
}
