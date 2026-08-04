import { useEffect, useReducer } from 'react'
import type { CSSProperties } from 'react'
import { ImageOff, ImagePlus, RefreshCw, Replace } from 'lucide-react'

import { getZineAssetImageSource } from '@/lib/zine/slot-render'
import type { ZineAsset } from '@/lib/zine/types'

import { imageLoadReducer, initialImageLoadState } from './image-load-state'

interface SlotImageContentProps {
  asset?: ZineAsset
  innerStyle?: CSSProperties
  compact?: boolean
  hintText?: string
  failedText?: string
  retryText?: string
  replaceText?: string
  onReplace?: () => void
}

export function SlotImageContent({
  asset,
  innerStyle,
  compact,
  hintText,
  failedText,
  retryText,
  replaceText,
  onReplace,
}: SlotImageContentProps) {
  const src = getZineAssetImageSource(asset, 'preview')
  const [loadState, dispatchLoad] = useReducer(imageLoadReducer, initialImageLoadState)

  useEffect(() => {
    dispatchLoad({ type: 'source-changed' })
  }, [asset?.id, src])

  if (!src) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-zinc-100 text-zinc-400">
        <ImagePlus size={compact ? 14 : 20} strokeWidth={1.5} />
        {!compact && hintText && <span className="text-[10px] font-medium">{hintText}</span>}
      </div>
    )
  }

  if (loadState.status === 'failed') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-zinc-100 px-2 text-center text-zinc-500">
        <ImageOff size={compact ? 14 : 20} strokeWidth={1.5} />
        {!compact && (
          <>
            <span className="max-w-full truncate text-[10px] font-medium" title={asset?.fileName}>{asset?.fileName || failedText}</span>
            {failedText && <span className="text-[9px] text-zinc-400">{failedText}</span>}
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="flex h-6 items-center gap-1 rounded bg-white px-2 text-[10px] font-medium text-zinc-700 shadow-sm ring-1 ring-black/10 hover:bg-zinc-50"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  dispatchLoad({ type: 'retry' })
                }}
              >
                <RefreshCw size={10} />
                {retryText}
              </button>
              {onReplace && (
                <button
                  type="button"
                  className="flex h-6 items-center gap-1 rounded bg-white px-2 text-[10px] font-medium text-zinc-700 shadow-sm ring-1 ring-black/10 hover:bg-zinc-50"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    onReplace()
                  }}
                >
                  <Replace size={10} />
                  {replaceText}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <img
      key={loadState.retryKey}
      src={src}
      alt={asset?.fileName ?? ''}
      className="h-full w-full"
      style={innerStyle}
      draggable={false}
      onError={() => dispatchLoad({ type: 'failed' })}
    />
  )
}
