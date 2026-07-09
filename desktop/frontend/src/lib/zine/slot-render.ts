import type { CSSProperties } from 'react'

import { resolveAssetUrl } from '@/lib/api/core'

import type { RenderedSlot, Slot, ZineAsset } from './types'

export function getZineAssetImageSource(asset?: ZineAsset, preferred: 'full' | 'preview' = 'full') {
  const source = preferred === 'preview' ? asset?.previewUrl || asset?.fullUrl : asset?.fullUrl || asset?.previewUrl
  return source ? resolveAssetUrl(source) : ''
}

export function renderSlot(slot: Slot, pageWmm: number, assets: ZineAsset[] = []): RenderedSlot {
  const left = slot.page === 'right' ? pageWmm + slot.x : slot.x
  const base = { position: 'absolute', left, top: slot.y, width: slot.w, height: slot.h, overflow: 'hidden' } as const
  const transform = `rotate(${slot.rotation}deg)`
  const htmlStyle = { ...base, zIndex: slot.zIndex, transform } as CSSProperties
  // pdfStyle 不能带 zIndex：react-pdf 会按 zIndex 重排绘制顺序，且把无 zIndex 的
  // 节点（如整页白色背景）排到最后绘制，导致背景盖住所有槽位。PDF 的层叠由
  // ZinePdfDocument 按 zIndex 升序排列槽位（即绘制顺序）来保证。
  const pdfStyle = { ...base, transform }
  if (slot.kind === 'image') {
    const asset = assets.find((item) => item.id === slot.assetId)
    const innerTransform = `scale(${slot.imageTransform.scale}) translate(${slot.imageTransform.offsetX}%, ${slot.imageTransform.offsetY}%) rotate(${slot.imageTransform.rotation}deg)`
    return { htmlStyle, pdfStyle, imageInner: { src: getZineAssetImageSource(asset), htmlStyle: { width: '100%', height: '100%', objectFit: 'cover', transform: innerTransform }, pdfStyle: { width: '100%', height: '100%', objectFit: 'cover' } } }
  }
  return { htmlStyle, pdfStyle, text: { content: slot.content, htmlStyle: { fontSize: slot.fontSize, lineHeight: slot.lineHeight, color: slot.color, fontFamily: slot.fontFamily, textAlign: slot.align, whiteSpace: 'pre-wrap' }, pdfStyle: { fontSize: slot.fontSize, lineHeight: slot.lineHeight, color: slot.color, fontFamily: slot.fontFamily, textAlign: slot.align } } }
}
