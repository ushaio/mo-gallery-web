import { renderSlot } from './slot-render'
import type { ImageSlot, ZineAsset } from './types'

const slot: ImageSlot = {
  id: 'image-1',
  kind: 'image',
  page: 'left',
  x: 0,
  y: 0,
  w: 40,
  h: 30,
  rotation: 0,
  zIndex: 1,
  assetId: 'asset-1',
  imageTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 },
}

const asset: ZineAsset = {
  id: 'asset-1',
  source: 'library',
  fileName: 'preview-only.jpg',
  width: 800,
  height: 600,
  previewUrl: 'https://example.com/preview.jpg',
  fullUrl: '',
  createdAt: 0,
}

const rendered = renderSlot(slot, 148, [asset])

if (rendered.imageInner?.src !== asset.previewUrl) {
  throw new Error(`Expected image slot to fall back to previewUrl, got ${rendered.imageInner?.src}`)
}

if ('zIndex' in rendered.pdfStyle) {
  throw new Error('Expected pdfStyle to omit zIndex: react-pdf paints zIndex-less nodes (page backgrounds) last, covering slots')
}

if (rendered.htmlStyle.zIndex !== slot.zIndex) {
  throw new Error(`Expected htmlStyle to keep zIndex for canvas stacking, got ${rendered.htmlStyle.zIndex}`)
}

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => (key === 'mo-gallery-server' ? 'https://gallery.example.com' : null),
  },
  configurable: true,
})

const relativeAsset: ZineAsset = {
  ...asset,
  previewUrl: '/uploads/preview.jpg',
  fullUrl: '/uploads/full.jpg',
}

const renderedRelative = renderSlot(slot, 148, [relativeAsset])

if (renderedRelative.imageInner?.src !== 'https://gallery.example.com/uploads/full.jpg') {
  throw new Error(`Expected image slot to resolve relative asset URL, got ${renderedRelative.imageInner?.src}`)
}
