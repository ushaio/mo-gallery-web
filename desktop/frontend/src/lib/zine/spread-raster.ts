import type { EditorAiImageInput } from '@mo-gallery/ai-agent'

import { GetZineImageDataURL } from '../../../wailsjs/go/main/App'

import { getProjectSpreadSize } from './page-sizes'
import {
  getPageNumberAlign,
  getSpreadPageNumbers,
  PAGE_NUMBER_BOTTOM_MM,
  PAGE_NUMBER_FONT_PT,
  SAFE_MARGIN_MM,
} from './print'
import { getZineAssetBlob } from './project'
import { getZineAssetImageSource } from './slot-render'
import type { ImageSlot, Spread, TextSlot, ZineAsset, ZineProject } from './types'

export type ZineRasterFormat = 'jpeg' | 'png'

interface LoadedZineAsset {
  asset: ZineAsset
  blob: Blob
}

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  close: () => void
}

interface RenderZineSpreadOptions {
  format?: ZineRasterFormat
  dpi?: number
  maxEdge?: number
  quality?: number
  signal?: AbortSignal
  loadedAssets?: ReadonlyMap<string, LoadedZineAsset>
}

export interface ZineSpreadVisualContext {
  preview?: EditorAiImageInput
  thumbnails: Map<string, EditorAiImageInput>
}

const AI_IMAGE_MAX_EDGE = 768
const AI_IMAGE_QUALITY = 0.76
const EXPORT_DPI = 300
const EXPORT_MAX_EDGE = 8192
const EXPORT_JPEG_QUALITY = 0.92
const POINTS_TO_MM = 25.4 / 72

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Zine rendering was aborted', 'AbortError')
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function toZineImageProxyUrl(source: string): string {
  return /^https?:\/\//i.test(source)
    ? `/__zine/image?src=${encodeURIComponent(source)}`
    : source
}

async function fetchImageBlob(source: string, signal?: AbortSignal): Promise<Blob | null> {
  const response = await fetch(toZineImageProxyUrl(source), { signal })
  if (!response.ok) return null

  const contentType = (response.headers.get('Content-Type') ?? '').toLowerCase()
  if (contentType.includes('text/html')) return null

  const blob = await response.blob()
  const resolvedType = (blob.type || contentType).toLowerCase()
  return resolvedType.startsWith('image/') || resolvedType === 'application/octet-stream'
    ? blob
    : null
}

export async function loadZineRasterAsset(
  asset: ZineAsset,
  signal?: AbortSignal,
): Promise<Blob | null> {
  throwIfAborted(signal)

  if (asset.source === 'local' && asset.blobId) {
    const localBlob = await getZineAssetBlob(asset.blobId)
    throwIfAborted(signal)
    if (localBlob) return localBlob
  }

  const source = getZineAssetImageSource(asset, 'preview')
  if (!source) return null

  try {
    const proxied = await fetchImageBlob(source, signal)
    if (proxied) return proxied
  } catch (error) {
    if (isAbortError(error)) throw error
  }

  if (/^https?:\/\//i.test(source)) {
    try {
      const dataUrl = await GetZineImageDataURL(source)
      throwIfAborted(signal)
      if (dataUrl.startsWith('data:image/')) {
        return await fetchImageBlob(dataUrl, signal)
      }
    } catch (error) {
      if (isAbortError(error)) throw error
    }
  }

  return null
}

async function loadSpreadAssets(
  project: ZineProject,
  spread: Spread,
  signal?: AbortSignal,
): Promise<Map<string, LoadedZineAsset>> {
  const assetIds = new Set(spread.slots.flatMap((slot) => (
    slot.kind === 'image' && slot.assetId ? [slot.assetId] : []
  )))
  const assets = project.assets.filter((asset) => assetIds.has(asset.id))
  const loaded = await Promise.all(assets.map(async (asset) => {
    try {
      const blob = await loadZineRasterAsset(asset, signal)
      return blob ? { asset, blob } : null
    } catch (error) {
      if (isAbortError(error)) throw error
      console.warn(`[zine] Failed to load visual asset ${asset.id}`, error)
      return null
    }
  }))

  return new Map(loaded.flatMap((entry) => (
    entry ? [[entry.asset.id, entry] as const] : []
  )))
}

async function decodeImage(loaded: LoadedZineAsset): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(loaded.blob)
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    }
  } catch (bitmapError) {
    const isAvif = loaded.blob.type === 'image/avif' || loaded.asset.fileName.toLowerCase().endsWith('.avif')
    if (!isAvif) throw bitmapError

    const { decode } = await import('@jsquash/avif')
    const imageData = await decode(await loaded.blob.arrayBuffer(), { bitDepth: 8 })
    if (!imageData) throw bitmapError

    const canvas = document.createElement('canvas')
    canvas.width = imageData.width
    canvas.height = imageData.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Failed to create AVIF decode canvas')
    context.putImageData(imageData, 0, 0)
    return {
      source: canvas,
      width: canvas.width,
      height: canvas.height,
      close: () => {},
    }
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: ZineRasterFormat,
  quality: number,
): Promise<Blob> {
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Failed to encode Zine spread image')),
      mimeType,
      format === 'jpeg' ? quality : undefined,
    )
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Failed to encode Zine image data'))
    reader.readAsDataURL(blob)
  })
}

function drawImageSlot(
  context: CanvasRenderingContext2D,
  slot: ImageSlot,
  pageWidthPx: number,
  pixelsPerMm: number,
  image: DecodedImage | undefined,
): void {
  const left = (slot.page === 'right' ? pageWidthPx : 0) + slot.x * pixelsPerMm
  const top = slot.y * pixelsPerMm
  const width = slot.w * pixelsPerMm
  const height = slot.h * pixelsPerMm

  context.save()
  context.translate(left + width / 2, top + height / 2)
  context.rotate(slot.rotation * Math.PI / 180)
  context.beginPath()
  context.rect(-width / 2, -height / 2, width, height)
  context.clip()

  if (!image) {
    context.fillStyle = '#e5e7eb'
    context.fillRect(-width / 2, -height / 2, width, height)
    context.restore()
    return
  }

  const coverScale = Math.max(width / image.width, height / image.height)
  const userScale = Math.max(0.01, slot.imageTransform.scale)
  const drawWidth = image.width * coverScale * userScale
  const drawHeight = image.height * coverScale * userScale
  const offsetX = slot.imageTransform.offsetX / 100 * width
  const offsetY = slot.imageTransform.offsetY / 100 * height

  context.translate(offsetX, offsetY)
  context.rotate(slot.imageTransform.rotation * Math.PI / 180)
  context.drawImage(image.source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
  context.restore()
}

function splitTextLine(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (!text) return ['']

  const words = text.split(/(\s+)/).filter(Boolean)
  const lines: string[] = []
  let current = ''

  const pushLongToken = (token: string) => {
    let fragment = ''
    for (const character of Array.from(token)) {
      const next = fragment + character
      if (fragment && context.measureText(next).width > maxWidth) {
        lines.push(fragment)
        fragment = character
      } else {
        fragment = next
      }
    }
    current = fragment
  }

  for (const word of words) {
    const next = current + word
    if (!current || context.measureText(next).width <= maxWidth) {
      current = next
      continue
    }
    lines.push(current.trimEnd())
    if (context.measureText(word).width > maxWidth) pushLongToken(word)
    else current = word.trimStart()
  }

  lines.push(current.trimEnd())
  return lines
}

function drawTextSlot(
  context: CanvasRenderingContext2D,
  slot: TextSlot,
  pageWidthPx: number,
  pixelsPerMm: number,
): void {
  const left = (slot.page === 'right' ? pageWidthPx : 0) + slot.x * pixelsPerMm
  const top = slot.y * pixelsPerMm
  const width = slot.w * pixelsPerMm
  const height = slot.h * pixelsPerMm
  const fontSize = slot.fontSize * POINTS_TO_MM * pixelsPerMm
  const lineHeight = fontSize * slot.lineHeight

  context.save()
  context.translate(left + width / 2, top + height / 2)
  context.rotate(slot.rotation * Math.PI / 180)
  context.beginPath()
  context.rect(-width / 2, -height / 2, width, height)
  context.clip()
  context.fillStyle = slot.color
  context.font = `${fontSize}px ${slot.fontFamily || 'sans-serif'}`
  context.textBaseline = 'top'
  context.textAlign = slot.align

  const textX = slot.align === 'left' ? -width / 2 : slot.align === 'right' ? width / 2 : 0
  const lines = slot.content.split('\n').flatMap((paragraph) => splitTextLine(context, paragraph, width))
  let y = -height / 2
  for (const line of lines) {
    if (y + lineHeight > height / 2 + lineHeight) break
    context.fillText(line, textX, y, width)
    y += lineHeight
  }
  context.restore()
}

function drawPageNumbers(
  context: CanvasRenderingContext2D,
  project: ZineProject,
  spreadIndex: number,
  pageWidthPx: number,
  spreadHeightPx: number,
  pixelsPerMm: number,
): void {
  const settings = project.pageNumbers
  if (!settings?.enabled) return
  const pages = getSpreadPageNumbers(project, spreadIndex)
  if (pages === 'cover') return

  const inset = SAFE_MARGIN_MM * pixelsPerMm
  const width = pageWidthPx - inset * 2
  const y = spreadHeightPx - PAGE_NUMBER_BOTTOM_MM * pixelsPerMm
  context.save()
  context.fillStyle = '#525252'
  context.font = `${PAGE_NUMBER_FONT_PT * POINTS_TO_MM * pixelsPerMm}px sans-serif`
  context.textBaseline = 'top'

  for (const side of ['left', 'right'] as const) {
    const align = getPageNumberAlign(side, settings.position)
    context.textAlign = align
    const pageLeft = side === 'right' ? pageWidthPx : 0
    const x = align === 'left'
      ? pageLeft + inset
      : align === 'right'
        ? pageLeft + inset + width
        : pageLeft + inset + width / 2
    context.fillText(String(side === 'left' ? pages.left : pages.right), x, y, width)
  }
  context.restore()
}

export function calculateZineRasterSize(
  project: Pick<ZineProject, 'pageSize' | 'pageOrientation' | 'customSizeMm'>,
  options: Pick<RenderZineSpreadOptions, 'dpi' | 'maxEdge'> = {},
) {
  const { pageW, spreadW, spreadH } = getProjectSpreadSize(project)
  const requestedScale = (options.dpi ?? EXPORT_DPI) / 25.4
  const edgeScale = (options.maxEdge ?? EXPORT_MAX_EDGE) / Math.max(spreadW, spreadH)
  const pixelsPerMm = Math.min(requestedScale, edgeScale)
  return {
    width: Math.max(1, Math.round(spreadW * pixelsPerMm)),
    height: Math.max(1, Math.round(spreadH * pixelsPerMm)),
    pageWidth: pageW * pixelsPerMm,
    pixelsPerMm,
  }
}

export async function renderZineSpreadToBlob(
  project: ZineProject,
  spreadId: string,
  options: RenderZineSpreadOptions = {},
): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error('Zine spread rendering requires a browser environment')
  throwIfAborted(options.signal)

  const spreadIndex = project.spreads.findIndex((spread) => spread.id === spreadId)
  if (spreadIndex < 0) throw new Error(`Zine spread ${spreadId} is unavailable`)
  const spread = project.spreads[spreadIndex]
  const loadedAssets = options.loadedAssets ?? await loadSpreadAssets(project, spread, options.signal)
  const size = calculateZineRasterSize(project, options)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Failed to create Zine spread canvas')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)

  const decoded = new Map<string, DecodedImage>()
  try {
    await Promise.all([...loadedAssets.entries()].map(async ([assetId, loaded]) => {
      try {
        decoded.set(assetId, await decodeImage(loaded))
      } catch (error) {
        console.warn(`[zine] Failed to decode visual asset ${assetId}`, error)
      }
    }))
    throwIfAborted(options.signal)

    const slots = spread.slots
      .map((slot, sourceIndex) => ({ slot, sourceIndex }))
      .sort((left, right) => left.slot.zIndex - right.slot.zIndex || left.sourceIndex - right.sourceIndex)
    for (const { slot } of slots) {
      throwIfAborted(options.signal)
      if (slot.kind === 'image') {
        drawImageSlot(
          context,
          slot,
          size.pageWidth,
          size.pixelsPerMm,
          slot.assetId ? decoded.get(slot.assetId) : undefined,
        )
      } else {
        drawTextSlot(context, slot, size.pageWidth, size.pixelsPerMm)
      }
    }
    drawPageNumbers(context, project, spreadIndex, size.pageWidth, size.height, size.pixelsPerMm)
    throwIfAborted(options.signal)

    return await canvasToBlob(
      canvas,
      options.format ?? 'jpeg',
      options.quality ?? EXPORT_JPEG_QUALITY,
    )
  } finally {
    for (const image of decoded.values()) image.close()
  }
}

async function createAssetThumbnail(
  loaded: LoadedZineAsset,
  signal?: AbortSignal,
): Promise<EditorAiImageInput | undefined> {
  let image: DecodedImage | undefined
  try {
    throwIfAborted(signal)
    image = await decodeImage(loaded)
    const scale = Math.min(1, AI_IMAGE_MAX_EDGE / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return undefined
    context.drawImage(image.source, 0, 0, width, height)
    const blob = await canvasToBlob(canvas, 'jpeg', AI_IMAGE_QUALITY)
    const dataUrl = await blobToDataUrl(blob)
    throwIfAborted(signal)
    return {
      id: `zine-asset:${loaded.asset.id}`,
      dataUrl,
      mediaType: blob.type || 'image/jpeg',
      width,
      height,
      byteLength: blob.size,
    }
  } catch (error) {
    if (isAbortError(error)) throw error
    console.warn(`[zine] Failed to create AI thumbnail for ${loaded.asset.id}`, error)
    return undefined
  } finally {
    image?.close()
  }
}

export async function captureZineSpreadVisualContext(
  project: ZineProject,
  spreadId: string,
  signal?: AbortSignal,
): Promise<ZineSpreadVisualContext> {
  if (typeof document === 'undefined') return { thumbnails: new Map() }
  const spread = project.spreads.find((candidate) => candidate.id === spreadId)
  if (!spread) return { thumbnails: new Map() }

  const loadedAssets = await loadSpreadAssets(project, spread, signal)
  const thumbnailEntries = await Promise.all([...loadedAssets.entries()].map(async ([assetId, loaded]) => ({
    assetId,
    thumbnail: await createAssetThumbnail(loaded, signal),
  })))
  const thumbnails = new Map(thumbnailEntries.flatMap(({ assetId, thumbnail }) => (
    thumbnail ? [[assetId, thumbnail] as const] : []
  )))

  try {
    const blob = await renderZineSpreadToBlob(project, spreadId, {
      format: 'jpeg',
      maxEdge: AI_IMAGE_MAX_EDGE,
      quality: AI_IMAGE_QUALITY,
      signal,
      loadedAssets,
    })
    const size = calculateZineRasterSize(project, { maxEdge: AI_IMAGE_MAX_EDGE })
    const dataUrl = await blobToDataUrl(blob)
    throwIfAborted(signal)
    return {
      thumbnails,
      preview: {
        id: `zine-spread:${project.id}:${spreadId}`,
        dataUrl,
        mediaType: blob.type || 'image/jpeg',
        width: size.width,
        height: size.height,
        byteLength: blob.size,
      },
    }
  } catch (error) {
    if (isAbortError(error)) throw error
    console.warn(`[zine] Failed to render AI spread preview ${spreadId}`, error)
    return { thumbnails }
  }
}

function safeFileName(title: string): string {
  return title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim() || 'zine'
}

export function createZineImageFileName(
  project: Pick<ZineProject, 'title' | 'spreads'>,
  spreadId: string,
  format: ZineRasterFormat,
): string {
  const spreadIndex = Math.max(0, project.spreads.findIndex((spread) => spread.id === spreadId))
  const extension = format === 'jpeg' ? 'jpg' : 'png'
  return `${safeFileName(project.title)}-spread-${String(spreadIndex + 1).padStart(2, '0')}.${extension}`
}

function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

export async function exportZineSpreadImage(
  project: ZineProject,
  spreadId: string,
  format: ZineRasterFormat,
): Promise<void> {
  const blob = await renderZineSpreadToBlob(project, spreadId, {
    format,
    dpi: EXPORT_DPI,
    maxEdge: EXPORT_MAX_EDGE,
    quality: EXPORT_JPEG_QUALITY,
  })
  downloadBlob(blob, createZineImageFileName(project, spreadId, format))
}
