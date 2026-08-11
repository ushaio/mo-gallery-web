import { useEffect, useReducer } from 'react'
import type { CSSProperties, Ref } from 'react'
import { ImageOff, ImagePlus, RefreshCw, Replace } from 'lucide-react'

import { getZineAssetImageSource } from '@/lib/zine/slot-render'
import { recordZineOperation } from '@/lib/zine/operation-log'
import type { ZineAsset } from '@/lib/zine/types'

import { getImageLoadInstanceKey, imageLoadReducer, initialImageLoadState } from './image-load-state'

interface SlotImageContentProps {
  asset?: ZineAsset
  imageRef?: Ref<HTMLImageElement>
  transformRef?: Ref<HTMLDivElement>
  innerStyle?: CSSProperties
  imageStyle?: CSSProperties
  compact?: boolean
  hintText?: string
  failedText?: string
  retryText?: string
  replaceText?: string
  onReplace?: () => void
}

interface LoadedSlotImageProps extends Omit<SlotImageContentProps, 'asset' | 'hintText'> {
  assetId: string
  src: string
  fileName: string
}

function LoadedSlotImage({
  assetId,
  src,
  fileName,
  imageRef,
  transformRef,
  innerStyle,
  imageStyle,
  compact,
  failedText,
  retryText,
  replaceText,
  onReplace,
}: LoadedSlotImageProps) {
  const [loadState, dispatchLoad] = useReducer(imageLoadReducer, initialImageLoadState)

  useEffect(() => {
    recordZineOperation('image_instance_mounted', { assetId }, { flush: true })
    return () => recordZineOperation('image_instance_unmounted', { assetId })
  }, [assetId])

  if (loadState.status === 'failed') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-zinc-100 px-2 text-center text-zinc-500">
        <ImageOff size={compact ? 14 : 20} strokeWidth={1.5} />
        {!compact && (
          <>
            <span className="max-w-full truncate text-[10px] font-medium" title={fileName}>{fileName || failedText}</span>
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
    <div ref={transformRef} style={innerStyle}>
      <img
        ref={imageRef}
        key={loadState.retryKey}
        src={src}
        alt={fileName}
        style={imageStyle}
        draggable={false}
        decoding="async"
        onLoad={(event) => {
          recordZineOperation('image_loaded', {
            assetId,
            naturalWidth: event.currentTarget.naturalWidth,
            naturalHeight: event.currentTarget.naturalHeight,
          }, { flush: true })
        }}
        onError={() => {
          recordZineOperation('image_load_failed', { assetId }, { flush: true })
          dispatchLoad({ type: 'failed' })
        }}
      />
    </div>
  )
}

export function SlotImageContent({
  asset,
  imageRef,
  transformRef,
  innerStyle,
  imageStyle,
  compact,
  hintText,
  failedText,
  retryText,
  replaceText,
  onReplace,
}: SlotImageContentProps) {
  const src = getZineAssetImageSource(asset, 'preview')

  if (!src) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-zinc-100 text-zinc-400">
        <ImagePlus size={compact ? 14 : 20} strokeWidth={1.5} />
        {!compact && hintText && <span className="text-[10px] font-medium">{hintText}</span>}
      </div>
    )
  }

  return (
    <LoadedSlotImage
      key={getImageLoadInstanceKey(asset?.id, src)}
      assetId={asset?.id ?? ''}
      src={src}
      fileName={asset?.fileName ?? ''}
      imageRef={imageRef}
      transformRef={transformRef}
      innerStyle={innerStyle}
      imageStyle={imageStyle}
      compact={compact}
      failedText={failedText}
      retryText={retryText}
      replaceText={replaceText}
      onReplace={onReplace}
    />
  )
}
