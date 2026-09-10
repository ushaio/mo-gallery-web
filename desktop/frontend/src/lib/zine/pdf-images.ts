import { resolveAssetUrl } from '@/lib/api/core'

import { getZineAssetBlob } from './project'
import type { ZineAsset, ZineProject } from './types'

export interface PrepareZinePdfImagesOptions {
  onAssetProgress?: (done: number, total: number) => void
}

interface JpegInfo {
  width: number
  height: number
  components: number
  bits: number
  orientation: number
  colorSpace?: number
  hasIcc: boolean
  hasOtherMetadata: boolean
}

interface ZineImageBridge {
  GetZineImageDataURL?: (source: string) => Promise<string>
}

interface IsoBox {
  type: string
  data: number
  end: number
}

function matchesAscii(bytes: Uint8Array, offset: number, value: string): boolean {
  return offset + value.length <= bytes.length
    && [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0))
}

/** Inspect bytes, since library responses and stored BLOBs can have a generic MIME type. */
export function sniffZinePdfImageMimeType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && matchesAscii(bytes, 1, 'PNG\r\n\x1a\n')) return 'image/png'
  if (matchesAscii(bytes, 0, 'RIFF') && matchesAscii(bytes, 8, 'WEBP')) return 'image/webp'
  if (matchesAscii(bytes, 0, 'GIF87a') || matchesAscii(bytes, 0, 'GIF89a')) return 'image/gif'
  if (matchesAscii(bytes, 0, 'BM')) return 'image/bmp'
  if (matchesAscii(bytes, 0, 'II\x2a\0') || matchesAscii(bytes, 0, 'MM\0\x2a')) return 'image/tiff'

  if (matchesAscii(bytes, 4, 'ftyp') && bytes.length >= 16) {
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
    const end = Math.min(size, bytes.length)
    const brands: string[] = []
    for (let offset = 8; offset + 4 <= end; offset += 4) {
      if (offset !== 12) brands.push(String.fromCharCode(...bytes.subarray(offset, offset + 4)))
    }
    if (brands.some((brand) => brand === 'avif' || brand === 'avis')) return 'image/avif'
    if (brands.some((brand) => ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand))) return 'image/heic'
  }

  const textHeader = new TextDecoder().decode(bytes.subarray(0, 4096)).replace(/^\uFEFF/, '')
  if (/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[^]*?-->\s*)*<svg(?:\s|>)/i.test(textHeader)) return 'image/svg+xml'
  return null
}

function readIsoBoxes(bytes: Uint8Array, start: number, end: number): IsoBox[] {
  const boxes: IsoBox[] = []
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = start
  while (offset < end) {
    if (offset + 8 > end) throw new Error('AVIF box is incomplete')
    let size = view.getUint32(offset)
    let headerSize = 8
    if (size === 1) {
      if (offset + 16 > end) throw new Error('AVIF extended box is incomplete')
      size = Number(view.getBigUint64(offset + 8))
      headerSize = 16
    } else if (size === 0) {
      size = end - offset
    }
    if (!Number.isSafeInteger(size) || size < headerSize || offset + size > end) throw new Error('Invalid AVIF box size')
    boxes.push({ type: String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)), data: offset + headerSize, end: offset + size })
    offset += size
  }
  return boxes
}

/**
 * WASM decoding does not apply ICC profiles or color-transfer conversions.
 * Inspect the PRIMARY item's real property associations, not a thumbnail's
 * profile or an arbitrary "sRGB" description. Legacy 8-bit untagged files use
 * the same explicit assume-sRGB policy as untagged JPEG/PNG originals.
 */
export function canDecodeZinePdfAvifAsSrgb(bytes: Uint8Array): boolean {
  if (sniffZinePdfImageMimeType(bytes) !== 'image/avif') return false
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const topLevel = readIsoBoxes(bytes, 0, bytes.length)
    if (topLevel.some((box) => box.type === 'moov')) return false
    const meta = topLevel.find((box) => box.type === 'meta')
    if (!meta || meta.data + 4 > meta.end || bytes[meta.data] !== 0) return false
    const children = readIsoBoxes(bytes, meta.data + 4, meta.end)
    const pitm = children.find((box) => box.type === 'pitm')
    const iprp = children.find((box) => box.type === 'iprp')
    const iinf = children.find((box) => box.type === 'iinf')
    if (!pitm || !iprp || !iinf) return false
    const pitmVersion = bytes[pitm.data]
    if (pitmVersion > 1 || pitm.data + (pitmVersion === 0 ? 6 : 8) > pitm.end) return false
    const primaryId = pitmVersion === 0 ? view.getUint16(pitm.data + 4) : view.getUint32(pitm.data + 4)

    // EXIF/XMP orientation cannot be applied by the raw decoder. Native browser
    // decoding still supports these files; the restricted fallback excludes them.
    const iinfVersion = bytes[iinf.data]
    if (iinfVersion > 1) return false
    const itemStart = iinf.data + (iinfVersion === 0 ? 6 : 8)
    if (itemStart > iinf.end) return false
    let primaryImageFound = false
    for (const item of readIsoBoxes(bytes, itemStart, iinf.end)) {
      const version = bytes[item.data]
      const typeOffset = item.data + (version === 2 ? 8 : 10)
      if (item.type !== 'infe' || ![2, 3].includes(version) || typeOffset + 4 > item.end) return false
      const itemType = String.fromCharCode(...bytes.subarray(typeOffset, typeOffset + 4))
      if (!['av01', 'grid'].includes(itemType)) return false
      const itemId = version === 2 ? view.getUint16(item.data + 4) : view.getUint32(item.data + 4)
      if (itemId === primaryId) primaryImageFound = true
    }
    if (!primaryImageFound) return false

    const propertyBoxes = readIsoBoxes(bytes, iprp.data, iprp.end)
    const ipco = propertyBoxes.find((box) => box.type === 'ipco')
    if (!ipco) return false
    const properties = readIsoBoxes(bytes, ipco.data, ipco.end)
    for (const property of properties) {
      if (['clli', 'mdcv', 'amve'].includes(property.type)) return false
      if (property.type === 'colr' && !matchesAscii(bytes, property.data, 'nclx')) return false
      if (property.type === 'auxC') {
        const auxiliaryType = new TextDecoder().decode(bytes.subarray(property.data + 4, property.end)).split('\0')[0]
        if (auxiliaryType !== 'urn:mpeg:mpegB:cicp:systems:auxiliary:alpha') return false
      }
    }
    const primaryProperties: IsoBox[] = []
    for (const ipma of propertyBoxes.filter((box) => box.type === 'ipma')) {
      if (ipma.data + 8 > ipma.end || bytes[ipma.data] > 1) return false
      const largeIds = bytes[ipma.data] === 1
      const largeIndexes = (view.getUint32(ipma.data) & 1) !== 0
      const entryCount = view.getUint32(ipma.data + 4)
      let offset = ipma.data + 8
      for (let entry = 0; entry < entryCount; entry += 1) {
        const idSize = largeIds ? 4 : 2
        if (offset + idSize + 1 > ipma.end) return false
        const itemId = largeIds ? view.getUint32(offset) : view.getUint16(offset)
        offset += idSize
        const count = bytes[offset++]
        for (let index = 0; index < count; index += 1) {
          if (offset + (largeIndexes ? 2 : 1) > ipma.end) return false
          const propertyIndex = largeIndexes ? view.getUint16(offset) & 0x7fff : bytes[offset] & 0x7f
          offset += largeIndexes ? 2 : 1
          if (propertyIndex > properties.length) return false
          if (itemId === primaryId && propertyIndex > 0) primaryProperties.push(properties[propertyIndex - 1])
        }
      }
    }

    let colorSpace: 'srgb' | 'untagged' | undefined
    let has8BitPixelInfo = false
    let has8BitCodecInfo = false
    for (const property of primaryProperties) {
      if (['clap', 'irot', 'imir'].includes(property.type)) return false
      if (property.type === 'pasp' && (property.data + 8 > property.end || view.getUint32(property.data) !== view.getUint32(property.data + 4))) return false
      if (property.type === 'pixi' && property.data + 5 <= property.end) {
        const channels = bytes[property.data + 4]
        has8BitPixelInfo = channels > 0 && channels <= 4 && property.data + 5 + channels <= property.end
          && bytes.subarray(property.data + 5, property.data + 5 + channels).every((bits) => bits === 8)
      }
      if (property.type === 'av1C') {
        has8BitCodecInfo = property.data + 4 <= property.end && bytes[property.data] === 0x81 && (bytes[property.data + 2] & 0x60) === 0
      }
      if (property.type !== 'colr') continue
      if (property.data + 11 > property.end || !matchesAscii(bytes, property.data, 'nclx')) return false
      const primaries = view.getUint16(property.data + 4)
      const transfer = view.getUint16(property.data + 6)
      const matrix = view.getUint16(property.data + 8)
      // The decoder handles YUV matrix/range conversion, not BT.2020/PQ/HLG.
      // CICP 2/2 is unspecified (our legacy encoder), not a wide-gamut profile.
      const currentColorSpace = primaries === 1 && transfer === 13 ? 'srgb' : primaries === 2 && transfer === 2 ? 'untagged' : null
      if (!currentColorSpace || ![0, 1, 5, 6].includes(matrix) || (bytes[property.data + 10] & 0x7f) !== 0) return false
      if (colorSpace && colorSpace !== currentColorSpace) return false
      colorSpace = currentColorSpace
    }
    return colorSpace === 'srgb' || (colorSpace === 'untagged' && has8BitPixelInfo && has8BitCodecInfo)
  } catch {
    return false
  }
}

function readExifInfo(bytes: Uint8Array): { orientation?: number; colorSpace?: number } {
  if (bytes.length < 8) throw new Error('EXIF 数据不完整，请重新保存原图')
  const littleEndian = matchesAscii(bytes, 0, 'II')
  if (!littleEndian && !matchesAscii(bytes, 0, 'MM')) throw new Error('EXIF 字节序无效，请重新保存原图')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint16(2, littleEndian) !== 42) throw new Error('EXIF 数据无效，请重新保存原图')
  const info: { orientation?: number; colorSpace?: number } = {}
  const seen = new Set<number>()

  function readDirectory(offset: number, isExif: boolean) {
    if (seen.has(offset) || offset < 8 || offset + 2 > bytes.length) throw new Error('EXIF 目录无效，请重新保存原图')
    seen.add(offset)
    const count = view.getUint16(offset, littleEndian)
    if (offset + 2 + count * 12 + 4 > bytes.length) throw new Error('EXIF 目录不完整，请重新保存原图')
    let exifOffset: number | undefined

    for (let index = 0; index < count; index += 1) {
      const entry = offset + 2 + index * 12
      const tag = view.getUint16(entry, littleEndian)
      const type = view.getUint16(entry + 2, littleEndian)
      const length = view.getUint32(entry + 4, littleEndian)
      if (length !== 1) continue
      if (!isExif && tag === 0x0112 && type === 3) info.orientation = view.getUint16(entry + 8, littleEndian)
      if (isExif && tag === 0xa001 && type === 3) info.colorSpace = view.getUint16(entry + 8, littleEndian)
      if (!isExif && tag === 0x8769 && type === 4) exifOffset = view.getUint32(entry + 8, littleEndian)
    }
    if (exifOffset !== undefined) readDirectory(exifOffset, true)
  }

  readDirectory(view.getUint32(4, littleEndian), false)
  return info
}

function inspectJpeg(bytes: Uint8Array): JpegInfo {
  const info: JpegInfo = { width: 0, height: 0, components: 0, bits: 0, orientation: 1, hasIcc: false, hasOtherMetadata: false }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 2

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error('JPEG 数据无效，请重新保存原图')
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset++]
    if (marker === 0xda || marker === 0xd9) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > bytes.length) throw new Error('JPEG 数据不完整，请重新保存原图')
    const length = view.getUint16(offset)
    if (length < 2 || offset + length > bytes.length) throw new Error('JPEG 数据不完整，请重新保存原图')
    const start = offset + 2

    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (length < 8) throw new Error('JPEG 尺寸数据无效')
      info.bits = bytes[start]
      info.height = view.getUint16(start + 1)
      info.width = view.getUint16(start + 3)
      info.components = bytes[start + 5]
    } else if (marker === 0xe1 && matchesAscii(bytes, start, 'Exif\0\0')) {
      const exif = readExifInfo(bytes.subarray(start + 6, offset + length))
      info.orientation = exif.orientation ?? info.orientation
      info.colorSpace = exif.colorSpace ?? info.colorSpace
    } else if (marker === 0xe2 && matchesAscii(bytes, start, 'ICC_PROFILE\0')) {
      info.hasIcc = true
    } else if ((marker >= 0xe1 && marker <= 0xed) || marker === 0xef) {
      // XMP/Photoshop/MPF can describe a color space, orientation or HDR gain map.
      // Let the color-managed decoder interpret those rather than copying them.
      info.hasOtherMetadata = true
    }
    offset += length
  }

  if (!info.width || !info.height || !info.components) throw new Error('JPEG 缺少有效图像数据')
  if (info.orientation < 1 || info.orientation > 8) throw new Error('JPEG 方向标记无效，请重新保存原图')
  if (!info.hasIcc && (info.components === 4 || (info.colorSpace !== undefined && info.colorSpace !== 1))) {
    throw new Error('原图声明了非 sRGB 或未校准的颜色，但缺少 ICC 配置；请在照片软件中转换为 sRGB 后重新导入')
  }
  return info
}

/** Only ordinary, unprofiled RGB/YCbCr JPEGs can bypass color/orientation conversion. */
export function canPreserveZinePdfJpeg(bytes: Uint8Array): boolean {
  if (sniffZinePdfImageMimeType(bytes) !== 'image/jpeg') return false
  const info = inspectJpeg(bytes)
  return info.bits === 8 && info.components === 3 && info.orientation === 1 && !info.hasIcc && !info.hasOtherMetadata
}

function getImageBridge(): ZineImageBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { go?: { main?: { App?: ZineImageBridge } } }).go?.main?.App
}

async function fetchImageBlob(source: string): Promise<Blob> {
  const response = await fetch(source)
  if (!response.ok) throw new Error(`读取原图失败（HTTP ${response.status}）`)
  if ((response.headers.get('Content-Type') ?? '').toLowerCase().includes('text/html')) {
    throw new Error('原图地址返回了网页，请检查图库连接或重新导入原图')
  }
  const blob = await response.blob()
  if (!blob.size) throw new Error('原图文件为空')
  return blob
}

async function loadOriginalBlob(asset: ZineAsset): Promise<Blob> {
  if (asset.source === 'local') {
    if (!asset.blobId) throw new Error('缺少本地原图记录，请重新导入原图')
    const blob = await getZineAssetBlob(asset.blobId)
    if (!blob?.size) throw new Error('保存的本地原图已丢失，请重新导入原图')
    return blob
  }

  const original = asset.fullUrl?.trim()
  if (!original) throw new Error('缺少原图地址，请恢复图库原图或重新导入')
  const pageUrl = typeof window === 'undefined' ? 'http://localhost/' : window.location.href
  const originalUrl = new URL(original, pageUrl)
  const isLocalLibrary = originalUrl.pathname.startsWith('/__local-library/')
  if (isLocalLibrary) {
    if (!originalUrl.pathname.startsWith('/__local-library/original/')) {
      throw new Error('当前保存的是本地图库预览地址，请重新从图库导入原图')
    }
    // These routes belong to the desktop AssetServer, never to the cloud API base.
    return fetchImageBlob(`${originalUrl.pathname}${originalUrl.search}`)
  }

  const source = resolveAssetUrl(original)
  const url = new URL(source, pageUrl)
  if (!['http:', 'https:', 'data:', 'blob:'].includes(url.protocol)) throw new Error('不支持此原图地址，请重新导入原图')
  const bridge = getImageBridge()
  const isRemote = /^https?:$/.test(url.protocol) && url.origin !== new URL(pageUrl).origin
  if (!isRemote || !bridge) return fetchImageBlob(source)

  try {
    return await fetchImageBlob(`/__zine/image?src=${encodeURIComponent(url.href)}`)
  } catch (error) {
    // Wails development routing can omit the HTTP handler; the bridge fetches
    // the same original with authentication and is never a thumbnail fallback.
    if (!bridge.GetZineImageDataURL) throw error
    const dataUrl = await bridge.GetZineImageDataURL(url.href)
    if (!dataUrl.startsWith('data:')) throw new Error('原图代理未返回图像数据')
    return fetchImageBlob(dataUrl)
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('无法读取图像数据'))
    reader.onerror = () => reject(reader.error ?? new Error('无法读取图像数据'))
    reader.readAsDataURL(blob)
  })
}

function loadBrowserImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      image.onload = null
      image.onerror = null
      if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve(image)
      else reject(new Error('原图没有有效像素尺寸'))
    }
    image.onerror = () => {
      image.onload = null
      image.onerror = null
      reject(new Error('当前系统无法正确解码原图；请用照片软件将其转换为包含 sRGB 配置的 PNG 或 JPEG 后重新导入'))
    }
    image.src = source
  })
}

async function createSrgbPng(width: number, height: number, paint: (context: CanvasRenderingContext2D) => void): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  try {
    const context = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb' })
    if (!context) throw new Error('无法创建原始尺寸的 sRGB 画布，请检查可用内存')
    if (context.getContextAttributes?.().colorSpace !== 'srgb') {
      throw new Error('当前系统不支持明确的 sRGB 画布，请更新桌面 WebView 后重试')
    }
    paint(context)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob?.size ? resolve(blob) : reject(new Error('无法在原始尺寸下生成 PNG，请检查可用内存')), 'image/png')
    })
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

async function decodeSrgbAvif(blob: Blob, bytes: Uint8Array): Promise<{ blob: Blob; width: number; height: number }> {
  if (!canDecodeZinePdfAvifAsSrgb(bytes)) {
    throw new Error('当前系统无法正确转换此 AVIF 的颜色或方向；请用照片软件转换为 sRGB PNG/JPEG 后重新导入，或更新支持 AVIF 的 WebView')
  }
  const { decode } = await import('@jsquash/avif')
  const image = await decode(await blob.arrayBuffer(), { bitDepth: 8 })
  if (!image || image.width <= 0 || image.height <= 0 || image.data.length !== image.width * image.height * 4) {
    throw new Error('无法解码 AVIF 原图，请重新保存原图')
  }
  // Only this verified sRGB/untagged-SDR path may use raw RGBA without conversion.
  const png = await createSrgbPng(image.width, image.height, (context) => context.putImageData(image, 0, 0))
  return { blob: png, width: image.width, height: image.height }
}

async function prepareImage(asset: ZineAsset): Promise<ZineAsset> {
  const original = await loadOriginalBlob(asset)
  const bytes = new Uint8Array(await original.arrayBuffer())
  const mimeType = sniffZinePdfImageMimeType(bytes)
  if (!mimeType) throw new Error('无法识别原图格式，请将原图保存为包含 sRGB 配置的 PNG 或 JPEG 后重新导入')
  const preserveJpeg = mimeType === 'image/jpeg' && canPreserveZinePdfJpeg(bytes)
  const blob = original.slice(0, original.size, mimeType)
  const objectUrl = URL.createObjectURL(blob)
  let image: HTMLImageElement | undefined

  try {
    try {
      image = await loadBrowserImage(objectUrl)
    } catch (error) {
      if (mimeType !== 'image/avif') throw error
      const decoded = await decodeSrgbAvif(blob, bytes)
      const dataUrl = await blobToDataUrl(decoded.blob)
      return { ...asset, width: decoded.width, height: decoded.height, fullUrl: dataUrl, previewUrl: dataUrl }
    }
    const width = image.naturalWidth
    const height = image.naturalHeight
    // Browser decoding honors ICC/EXIF; drawing converts into the sRGB canvas.
    const output = preserveJpeg ? blob : await createSrgbPng(width, height, (context) => context.drawImage(image!, 0, 0))
    const dataUrl = await blobToDataUrl(output)
    return { ...asset, width, height, fullUrl: dataUrl, previewUrl: dataUrl }
  } finally {
    if (image) image.src = ''
    URL.revokeObjectURL(objectUrl)
  }
}

/** Prepare an ephemeral, self-contained project without changing saved assets. */
export async function prepareZinePdfImages(project: ZineProject, options: PrepareZinePdfImagesOptions = {}): Promise<ZineProject> {
  const referenced = new Set<string>()
  for (const spread of project.spreads) {
    for (const slot of spread.slots) {
      if (slot.kind === 'image' && slot.assetId) referenced.add(slot.assetId)
    }
  }

  const byId = new Map(project.assets.map((asset) => [asset.id, asset]))
  const assets: ZineAsset[] = []
  const failures: string[] = []
  let done = 0
  options.onAssetProgress?.(done, referenced.size)

  // A full-resolution canvas can consume hundreds of MB. Release each decoded
  // image before starting the next, while reporting all missing/broken originals.
  for (const id of referenced) {
    const asset = byId.get(id)
    try {
      if (!asset) throw new Error('图片资源记录已丢失，请重新导入并放入页面')
      assets.push(await prepareImage(asset))
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      failures.push(`“${asset?.fileName || id}”：${detail}`)
    } finally {
      done += 1
      options.onAssetProgress?.(done, referenced.size)
    }
  }

  if (failures.length) throw new Error(`原图处理失败（${failures.length} 张）：${failures.join('；')}`)
  return { ...project, assets }
}
