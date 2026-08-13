import type { CSSProperties } from 'react'

import { resolveAssetUrl } from '@/lib/api/core'

import type { RenderedSlot, Slot, ZineAsset, ZineImageTransform } from './types'

export interface ImagePlacement {
  left: number
  top: number
  width: number
  height: number
  rotation: number
}

export function getZineAssetImageSource(asset?: ZineAsset, preferred: 'full' | 'preview' = 'full') {
  const source = preferred === 'preview' ? asset?.previewUrl || asset?.fullUrl : asset?.fullUrl || asset?.previewUrl
  return source ? resolveAssetUrl(source) : ''
}

export function calculateImagePlacement(
  frameWidth: number,
  frameHeight: number,
  imageWidth: number,
  imageHeight: number,
  transform: ZineImageTransform,
): ImagePlacement {
  const safeImageWidth = imageWidth > 0 ? imageWidth : frameWidth
  const safeImageHeight = imageHeight > 0 ? imageHeight : frameHeight
  const coverScale = Math.max(frameWidth / safeImageWidth, frameHeight / safeImageHeight)
  const userScale = Math.max(0.01, transform.scale)
  const width = safeImageWidth * coverScale * userScale
  const height = safeImageHeight * coverScale * userScale

  return {
    left: (frameWidth - width) / 2 + transform.offsetX / 100 * frameWidth,
    top: (frameHeight - height) / 2 + transform.offsetY / 100 * frameHeight,
    width,
    height,
    rotation: transform.rotation,
  }
}

function createCoverImageStyle(frameWidth: number, frameHeight: number, asset?: ZineAsset): CSSProperties {
  const base: CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    maxWidth: 'none',
    maxHeight: 'none',
    transform: 'translate(-50%, -50%)',
  }

  if (!asset || asset.width <= 0 || asset.height <= 0) {
    return { ...base, width: '100%', height: '100%', objectFit: 'cover' }
  }

  const imageIsWider = asset.width / asset.height >= frameWidth / frameHeight
  return imageIsWider
    ? { ...base, width: 'auto', height: '100%', aspectRatio: `${asset.width} / ${asset.height}` }
    : { ...base, width: '100%', height: 'auto', aspectRatio: `${asset.width} / ${asset.height}` }
}

export function renderSlot(slot: Slot, _pageWmm: number, assets: ZineAsset[] = []): RenderedSlot {
  const base = { position: 'absolute', left: slot.x, top: slot.y, width: slot.w, height: slot.h, overflow: 'hidden' } as const
  const transform = `rotate(${slot.rotation}deg)`
  const htmlStyle = { ...base, zIndex: slot.zIndex, transform } as CSSProperties
  // pdfStyle 不能带 zIndex：react-pdf 会按 zIndex 重排绘制顺序，且把无 zIndex 的
  // 节点（如整页白色背景）排到最后绘制，导致背景盖住所有槽位。PDF 的层叠由
  // ZinePdfDocument 按 zIndex 升序排列槽位（即绘制顺序）来保证。
  const pdfStyle = { ...base, transform }
  if (slot.kind === 'image') {
    const asset = assets.find((item) => item.id === slot.assetId)
    const innerTransform = `translate(${slot.imageTransform.offsetX}%, ${slot.imageTransform.offsetY}%) rotate(${slot.imageTransform.rotation}deg) scale(${slot.imageTransform.scale})`
    return {
      htmlStyle,
      pdfStyle,
      imageInner: {
        src: getZineAssetImageSource(asset),
        htmlStyle: {
          position: 'absolute',
          inset: 0,
          transform: innerTransform,
          transformOrigin: 'center',
        },
        imageStyle: createCoverImageStyle(slot.w, slot.h, asset),
        pdfStyle: { width: '100%', height: '100%', objectFit: 'cover' },
      },
    }
  }
  const verticalAlign = slot.verticalAlign ?? 'top'
  const justifyContent = verticalAlign === 'center' ? 'center' : verticalAlign === 'bottom' ? 'flex-end' : 'flex-start'
  return {
    htmlStyle,
    pdfStyle,
    text: {
      content: slot.content,
      htmlStyle: { display: 'flex', flexDirection: 'column', justifyContent, fontSize: slot.fontSize, lineHeight: slot.lineHeight, color: slot.color, fontFamily: slot.fontFamily, textAlign: slot.align, whiteSpace: 'pre-wrap' },
      pdfStyle: { fontSize: slot.fontSize, lineHeight: slot.lineHeight, color: slot.color, fontFamily: slot.fontFamily, textAlign: slot.align },
    },
  }
}
