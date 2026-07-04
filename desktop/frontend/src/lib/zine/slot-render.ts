import type { CSSProperties } from 'react'
import type { RenderedSlot, Slot, ZineAsset } from './types'

export function renderSlot(slot: Slot, pageWmm: number, assets: ZineAsset[] = []): RenderedSlot {
  const left = slot.page === 'right' ? pageWmm + slot.x : slot.x
  const base = { position: 'absolute', left, top: slot.y, width: slot.w, height: slot.h, zIndex: slot.zIndex, overflow: 'hidden' } as const
  const transform = `rotate(${slot.rotation}deg)`
  const htmlStyle = { ...base, transform } as CSSProperties
  const pdfStyle = { ...base, transform }
  if (slot.kind === 'image') {
    const asset = assets.find((item) => item.id === slot.assetId)
    const innerTransform = `scale(${slot.imageTransform.scale}) translate(${slot.imageTransform.offsetX}%, ${slot.imageTransform.offsetY}%) rotate(${slot.imageTransform.rotation}deg)`
    return { htmlStyle, pdfStyle, imageInner: { src: asset?.fullUrl ?? '', htmlStyle: { width: '100%', height: '100%', objectFit: 'cover', transform: innerTransform }, pdfStyle: { width: '100%', height: '100%', objectFit: 'cover' } } }
  }
  return { htmlStyle, pdfStyle, text: { content: slot.content, htmlStyle: { fontSize: slot.fontSize, lineHeight: slot.lineHeight, color: slot.color, fontFamily: slot.fontFamily, textAlign: slot.align, whiteSpace: 'pre-wrap' }, pdfStyle: { fontSize: slot.fontSize, lineHeight: slot.lineHeight, color: slot.color, fontFamily: slot.fontFamily, textAlign: slot.align } } }
}
