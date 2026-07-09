import type { CSSProperties } from 'react'
import { ImagePlus } from 'lucide-react'

import { getZineAssetImageSource } from '@/lib/zine/slot-render'
import type { ZineAsset } from '@/lib/zine/types'

interface SlotImageContentProps {
  asset?: ZineAsset
  innerStyle?: CSSProperties
  compact?: boolean
  hintText?: string
}

export function SlotImageContent({ asset, innerStyle, compact, hintText }: SlotImageContentProps) {
  const src = getZineAssetImageSource(asset, 'preview')

  if (!src) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-zinc-100 text-zinc-400">
        <ImagePlus size={compact ? 14 : 20} strokeWidth={1.5} />
        {!compact && hintText && <span className="text-[10px] font-medium">{hintText}</span>}
      </div>
    )
  }

  return <img src={src} alt={asset?.fileName ?? ''} className="h-full w-full" style={innerStyle} draggable={false} />
}
