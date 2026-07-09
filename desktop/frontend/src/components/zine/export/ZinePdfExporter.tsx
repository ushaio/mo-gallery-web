import { Document, Font, Image as PdfImage, Page, pdf, Text, View } from '@react-pdf/renderer'

import { resolveAssetUrl } from '@/lib/api/core'
import { getSpreadSize } from '@/lib/zine/page-sizes'
import {
  buildPrintPageSequence,
  CROP_MARK_AREA_MM,
  getPageNumberAlign,
  getProjectBleedMm,
  getSpreadPageNumbers,
  PAGE_NUMBER_BOTTOM_MM,
  PAGE_NUMBER_FONT_PT,
  SAFE_MARGIN_MM,
} from '@/lib/zine/print'
import { getZineAssetBlob } from '@/lib/zine/project'
import { renderSlot } from '@/lib/zine/slot-render'
import type { PrintPageRef } from '@/lib/zine/print'
import type { RenderedSlot, Slot, ZineAsset, ZinePageNumberSettings, ZineProject } from '@/lib/zine/types'

const POINTS_PER_MM = 72 / 25.4

export type ZinePdfVariant = 'spread' | 'print'

interface ZinePdfDocumentProps {
  project: ZineProject
  cjkFontFamily?: string | null
  variant?: ZinePdfVariant
}

type PdfMeasuredStyle = Record<string, string | number> & { left: number; top: number; width: number; height: number }
type PdfImageSource = string | Blob

interface ZineDesktopBridge {
  GetZineCJKFontInfo?: () => Promise<{ found: boolean; postscriptName: string }>
}

interface CreateZinePdfProjectOptions {
  loadAssetBlob?: (id: string) => Promise<Blob | null>
  convertImageSource?: (source: PdfImageSource) => Promise<string>
  convertAvifImageSource?: (source: PdfImageSource) => Promise<string>
  loadRemoteImageSource?: (url: string) => Promise<PdfImageSource>
  onAssetProgress?: (done: number, total: number) => void
}

const PDF_SAFE_DATA_IMAGE_PATTERN = /^data:image\/(?:png|jpe?g|svg\+xml);base64,/i
const PDF_SAFE_IMAGE_URL_PATTERN = /\.(?:png|jpe?g)(?:[?#].*)?$/i
const PDF_AVIF_DATA_IMAGE_PATTERN = /^data:image\/avif;base64,/i
const PDF_AVIF_IMAGE_URL_PATTERN = /\.avif(?:[?#].*)?$/i

// react-pdf 内置的标准字体族，可直接使用；其余字体族必须先 Font.register，
// 否则布局阶段直接抛 "Font family not registered"
const PDF_STANDARD_FONT_FAMILIES = new Set([
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
  'Courier',
  'Courier-Bold',
  'Courier-Oblique',
  'Courier-BoldOblique',
  'Times-Roman',
  'Times-Bold',
  'Times-Italic',
  'Times-BoldItalic',
])

// 标准字体只能编码 WinAnsi（cp1252）字符：Latin-1 加上少量排版符号。
// 命中此模式的文本（中文等）必须走注册的 CJK 字体
const NON_WIN_ANSI_PATTERN = new RegExp(
  '[^\\u0000-\\u00FF\\u0152\\u0153\\u0160\\u0161\\u0178\\u017D\\u017E\\u0192\\u02C6\\u02DC' +
    '\\u2013\\u2014\\u2018-\\u201A\\u201C-\\u201E\\u2020-\\u2022\\u2026\\u2030\\u2039\\u203A\\u20AC\\u2122]',
)

export const ZINE_PDF_CJK_FONT_FAMILY = 'ZineCJK'

const ZINE_CJK_FONT_URL = '/__zine/cjk-font'

// 常见字体容器的头部魔数（TrueType / OTTO / TTC / WOFF）。用于预检
// /__zine/cjk-font 的返回内容——若路由被前端兜底页等拦截，fontkit 只会抛出
// 晦涩的 "Unknown font format"，提前识别可以留下可诊断的日志
export function isLikelyFontData(bytes: Uint8Array) {
  if (bytes.length < 4) return false
  if (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return true
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  return magic === 'ttcf' || magic === 'OTTO' || magic === 'true' || magic === 'typ1' || magic === 'wOFF' || magic === 'wOF2'
}

async function fetchZineCjkFontHeader(): Promise<Uint8Array | null> {
  try {
    const response = await fetch(ZINE_CJK_FONT_URL, { headers: { Range: 'bytes=0-3' } })
    if (!response.ok) return null
    if ((response.headers.get('Content-Type') ?? '').includes('text/html')) return null
    return new Uint8Array(await response.arrayBuffer())
  } catch {
    return null
  }
}

function createSafeFileName(title: string) {
  const fileName = title.trim().replace(new RegExp('[<>:"/\\\\|?*\\u0000-\\u001f]', 'g'), '').trim()
  return fileName || 'zine'
}

function mmToPt(value: number) {
  return value * POINTS_PER_MM
}

export function createPdfPageSize(widthMm: number, heightMm: number) {
  return [mmToPt(widthMm), mmToPt(heightMm)] as [number, number]
}

export function createPdfSlotStyle<T extends PdfMeasuredStyle>(style: T) {
  return {
    ...style,
    left: mmToPt(style.left),
    top: mmToPt(style.top),
    width: mmToPt(style.width),
    height: mmToPt(style.height),
  }
}

export function createZinePdfFileName(project: ZineProject, variant: ZinePdfVariant = 'spread') {
  const base = createSafeFileName(project.title)
  return variant === 'print' ? `${base}-print.pdf` : `${base}.pdf`
}

function getDesktopBridge(): ZineDesktopBridge | null {
  const bridge = (globalThis as { go?: { main?: { App?: ZineDesktopBridge } } }).go?.main?.App
  return bridge ?? null
}

let cjkFontFamilyPromise: Promise<string | null> | null = null

async function registerZineCjkPdfFont(): Promise<string | null> {
  const bridge = getDesktopBridge()
  if (!bridge?.GetZineCJKFontInfo) return null

  const info = await bridge.GetZineCJKFontInfo()
  if (!info?.found) return null

  const header = await fetchZineCjkFontHeader()
  if (!header || !isLikelyFontData(header)) {
    console.warn('[zine] /__zine/cjk-font 未返回字体数据，跳过中文字体注册；响应头 4 字节：', header ? Array.from(header.slice(0, 4)) : header)
    return null
  }

  // 必须用绝对 URL 注册：react-pdf 内部用 is-url 判断 src，相对路径会被当成
  // Node 文件路径走 fontkit.open（浏览器构建里没有该导出），导出必然失败
  Font.register({
    family: ZINE_PDF_CJK_FONT_FAMILY,
    fonts: [
      {
        src: new URL(ZINE_CJK_FONT_URL, globalThis.location.href).href,
        postscriptName: info.postscriptName || undefined,
      },
    ],
  })
  return ZINE_PDF_CJK_FONT_FAMILY
}

export function ensureZineCjkPdfFont(): Promise<string | null> {
  if (!cjkFontFamilyPromise) {
    cjkFontFamilyPromise = registerZineCjkPdfFont()
      .then((family) => {
        // 注册成功才长期缓存；失败（字体缺失/端点异常）下次导出时重试
        if (!family) cjkFontFamilyPromise = null
        return family
      })
      .catch(() => {
        cjkFontFamilyPromise = null
        return null
      })
  }
  return cjkFontFamilyPromise
}

export function resolveZinePdfFontFamily(fontFamily: string | undefined, content: string, cjkFontFamily: string | null): string {
  if (NON_WIN_ANSI_PATTERN.test(content)) {
    if (cjkFontFamily) return cjkFontFamily
    throw new Error('系统中未找到可用的中文字体，无法导出包含中文等非拉丁字符的文本')
  }

  const requested = (fontFamily ?? '').trim()
  if (PDF_STANDARD_FONT_FAMILIES.has(requested)) return requested

  const lower = requested.toLowerCase()
  if (/mono|courier/.test(lower)) return 'Courier'
  if (/sans|arial|helvetica/.test(lower)) return 'Helvetica'
  if (/serif|times|georgia|garamond|song|ming/.test(lower)) return 'Times-Roman'
  return 'Helvetica'
}

function createPdfTextStyle(text: RenderedSlot['text'], cjkFontFamily: string | null) {
  const style = text?.pdfStyle ?? {}
  const requested = typeof style.fontFamily === 'string' ? style.fontFamily : undefined
  return { ...style, fontFamily: resolveZinePdfFontFamily(requested, text?.content ?? '', cjkFontFamily) }
}

function validateZinePdfTextFonts(project: ZineProject, cjkFontFamily: string | null) {
  for (const spread of project.spreads) {
    for (const slot of spread.slots) {
      if (slot.kind === 'text') {
        resolveZinePdfFontFamily(slot.fontFamily, slot.content, cjkFontFamily)
      }
    }
  }
}

export function createPdfImageStyle(slotStyle: PdfMeasuredStyle) {
  return { width: mmToPt(slotStyle.width), height: mmToPt(slotStyle.height), objectFit: 'cover' as const }
}

async function blobToDataUrl(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }

  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`
}

function isPdfSafeImageBlob(blob: Blob) {
  return blob.type === 'image/png' || blob.type === 'image/jpeg' || blob.type === 'image/jpg'
}

function isGenericImageBlob(blob: Blob) {
  return !blob.type || blob.type === 'application/octet-stream'
}

function isPdfSafeImageString(source: string) {
  return PDF_SAFE_DATA_IMAGE_PATTERN.test(source) || PDF_SAFE_IMAGE_URL_PATTERN.test(source)
}

function isPdfAvifImageSource(source: PdfImageSource, sourceUrl = '') {
  if (source instanceof Blob) return source.type === 'image/avif' || (isGenericImageBlob(source) && PDF_AVIF_IMAGE_URL_PATTERN.test(sourceUrl))
  return PDF_AVIF_DATA_IMAGE_PATTERN.test(source) || PDF_AVIF_IMAGE_URL_PATTERN.test(source)
}

function normalizePdfAvifImageSource(source: PdfImageSource, sourceUrl = '') {
  if (source instanceof Blob && isGenericImageBlob(source) && PDF_AVIF_IMAGE_URL_PATTERN.test(sourceUrl)) {
    return source.slice(0, source.size, 'image/avif')
  }
  return source
}

function loadBrowserImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load image for PDF export'))
    if (!source.startsWith('data:') && !source.startsWith('blob:')) {
      image.crossOrigin = 'anonymous'
    }
    image.src = source
  })
}

async function convertImageSourceToJpegDataUrl(source: PdfImageSource) {
  let objectUrl: string | null = null
  let imageSource = typeof source === 'string' ? source : ''

  if (source instanceof Blob) {
    objectUrl = URL.createObjectURL(source)
    imageSource = objectUrl
  }

  try {
    const image = await loadBrowserImage(imageSource)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, image.naturalWidth || image.width)
    canvas.height = Math.max(1, image.naturalHeight || image.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Failed to create PDF image canvas context')

    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const jpegBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Failed to convert PDF image to JPEG'))), 'image/jpeg', 0.92)
    })

    return blobToDataUrl(jpegBlob)
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

async function convertAvifImageSourceToJpegDataUrl(source: PdfImageSource) {
  const blob = source instanceof Blob ? source : await fetch(source).then((response) => {
    if (!response.ok) throw new Error(`Failed to load AVIF image for PDF export (${response.status})`)
    return response.blob()
  })
  const { decode } = await import('@jsquash/avif')
  const imageData = await decode(await blob.arrayBuffer(), { bitDepth: 8 })
  if (!imageData) throw new Error('Failed to decode AVIF image for PDF export')

  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Failed to create PDF image canvas context')

  context.putImageData(imageData, 0, 0)
  const jpegBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Failed to convert PDF AVIF image to JPEG'))), 'image/jpeg', 0.92)
  })

  return blobToDataUrl(jpegBlob)
}

async function preparePdfImageSource(
  source: PdfImageSource,
  convertImageSource: (source: PdfImageSource) => Promise<string>,
  convertAvifImageSource: (source: PdfImageSource) => Promise<string>,
  sourceUrl = '',
) {
  if (source instanceof Blob) {
    if (isPdfAvifImageSource(source, sourceUrl)) return convertAvifImageSource(normalizePdfAvifImageSource(source, sourceUrl))
    return isPdfSafeImageBlob(source) ? blobToDataUrl(source) : convertImageSource(source)
  }

  if (isPdfAvifImageSource(source)) return convertAvifImageSource(source)
  return isPdfSafeImageString(source) ? source : convertImageSource(source)
}

function toZineImageProxyUrl(url: string) {
  return `/__zine/image?src=${encodeURIComponent(url)}`
}

// 桌面端经 Go 侧同源代理取图：webview 直接 fetch 图库/CDN 图片会被 CORS 拦截
// （画布 <img> 显示不受限，但导出要读取像素），代理还会自动附带登录 token
async function loadRemoteImageSourceViaProxy(url: string): Promise<PdfImageSource> {
  if (!getDesktopBridge()) return url

  try {
    const response = await fetch(toZineImageProxyUrl(url))
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    // SPA 兜底页对未命中路由回 200 + text/html，误当图片解码只会报出
    // 误导性的加载失败；显式识别并降级为直连 URL
    if ((response.headers.get('Content-Type') ?? '').includes('text/html')) throw new Error('proxy route intercepted')
    return await response.blob()
  } catch {
    return url
  }
}

export async function createZinePdfProject(project: ZineProject, options: CreateZinePdfProjectOptions = {}): Promise<ZineProject> {
  const loadAssetBlob = options.loadAssetBlob ?? getZineAssetBlob
  const convertImageSource = options.convertImageSource ?? convertImageSourceToJpegDataUrl
  const convertAvifImageSource = options.convertAvifImageSource ?? (options.convertImageSource ? convertImageSource : convertAvifImageSourceToJpegDataUrl)
  const loadRemoteImageSource = options.loadRemoteImageSource ?? loadRemoteImageSourceViaProxy
  const referencedAssetIds = new Set<string>()

  for (const spread of project.spreads) {
    for (const slot of spread.slots) {
      if (slot.kind === 'image' && slot.assetId) referencedAssetIds.add(slot.assetId)
    }
  }

  const targets = project.assets.filter((asset) => referencedAssetIds.has(asset.id))
  const total = targets.length
  let done = 0

  type AssetResult = { ok: true; asset: ZineAsset } | { ok: false; fileName: string; detail: string }

  // 逐张转换但不因单张失败中止：聚合所有失败项一次性报告，
  // 避免用户修一张、再导出、再发现下一张的循环
  const results = await Promise.all(
    targets.map(async (asset): Promise<AssetResult> => {
      try {
        if (asset.source !== 'local' || !asset.blobId) {
          const previewUrl = asset.previewUrl ? resolveAssetUrl(asset.previewUrl) : ''
          const fullUrl = asset.fullUrl ? resolveAssetUrl(asset.fullUrl) : ''
          const source = fullUrl || previewUrl
          const pdfUrl = source ? await preparePdfImageSource(await loadRemoteImageSource(source), convertImageSource, convertAvifImageSource, source) : ''

          return {
            ok: true,
            asset: {
              ...asset,
              previewUrl: pdfUrl || previewUrl,
              fullUrl: pdfUrl || fullUrl,
            },
          }
        }

        const blob = await loadAssetBlob(asset.blobId)
        if (!blob) return { ok: true, asset }

        const dataUrl = await preparePdfImageSource(blob, convertImageSource, convertAvifImageSource)
        return { ok: true, asset: { ...asset, previewUrl: dataUrl, fullUrl: dataUrl } }
      } catch (error) {
        const detail = error instanceof Error && error.message ? error.message : String(error)
        return { ok: false, fileName: asset.fileName, detail }
      } finally {
        done += 1
        options.onAssetProgress?.(done, total)
      }
    }),
  )

  const failures = results.filter((result): result is Extract<AssetResult, { ok: false }> => !result.ok)
  if (failures.length === 1) {
    throw new Error(`图片 ${failures[0].fileName} 处理失败（${failures[0].detail}）`)
  }
  if (failures.length > 1) {
    throw new Error(`共 ${failures.length} 张图片处理失败：${failures.map((failure) => `${failure.fileName}（${failure.detail}）`).join('；')}`)
  }

  const assets = results.map((result) => (result.ok ? result.asset : null)).filter((asset): asset is ZineAsset => asset !== null)
  return { ...project, assets }
}

function renderPdfSlot(slot: Slot, pageW: number, assets: ZineAsset[], cjkFontFamily: string | null) {
  const rendered = renderSlot(slot, pageW, assets)

  if (slot.kind === 'image') {
    const src = rendered.imageInner?.src
    const slotStyle = rendered.pdfStyle as PdfMeasuredStyle
    return (
      <View key={slot.id} style={createPdfSlotStyle(slotStyle)}>
        {src ? (
          <PdfImage src={src} style={createPdfImageStyle(slotStyle)} />
        ) : (
          <View style={{ width: '100%', height: '100%', backgroundColor: '#e5e7eb' }} />
        )}
      </View>
    )
  }

  return (
    <View key={slot.id} style={createPdfSlotStyle(rendered.pdfStyle as PdfMeasuredStyle)}>
      <Text style={createPdfTextStyle(rendered.text, cjkFontFamily)}>{rendered.text?.content ?? ''}</Text>
    </View>
  )
}

function sortSlotsByZIndex(slots: Slot[]) {
  return [...slots].sort((a, b) => a.zIndex - b.zIndex)
}

// 页码用 Helvetica 直接排（阿拉伯数字必属 WinAnsi），无需 CJK 字体
function PdfPageNumberText({ value, align, leftMm, topMm, widthMm }: { value: number; align: 'left' | 'center' | 'right'; leftMm: number; topMm: number; widthMm: number }) {
  return (
    <Text
      style={{
        position: 'absolute',
        left: mmToPt(leftMm),
        top: mmToPt(topMm),
        width: mmToPt(widthMm),
        fontSize: PAGE_NUMBER_FONT_PT,
        fontFamily: 'Helvetica',
        color: '#525252',
        textAlign: align,
      }}
    >
      {String(value)}
    </Text>
  )
}

function renderSpreadPdfPageNumbers(project: ZineProject, spreadIndex: number, settings: ZinePageNumberSettings, pageWmm: number, pageHmm: number) {
  const pages = getSpreadPageNumbers(project, spreadIndex)
  if (pages === 'cover') return null

  return (['left', 'right'] as const).map((side) => (
    <PdfPageNumberText
      key={`folio-${side}`}
      value={side === 'left' ? pages.left : pages.right}
      align={getPageNumberAlign(side, settings.position)}
      leftMm={(side === 'right' ? pageWmm : 0) + SAFE_MARGIN_MM}
      topMm={pageHmm - PAGE_NUMBER_BOTTOM_MM}
      widthMm={pageWmm - SAFE_MARGIN_MM * 2}
    />
  ))
}

/** 印刷单页的成纸尺寸：成品 + 出血 + 角线区（单位 mm） */
export function createPrintPageMediaSizeMm(pageWmm: number, pageHmm: number, bleedMm: number) {
  const extra = (bleedMm + CROP_MARK_AREA_MM) * 2
  return { width: pageWmm + extra, height: pageHmm + extra }
}

const CROP_MARK_THICKNESS_MM = 0.25
const CROP_MARK_LENGTH_MM = CROP_MARK_AREA_MM - 1

/** 裁切角线：位于出血区之外的角线区内，对齐成品边缘 */
function PrintCropMarks({ pageWmm, pageHmm, bleedMm }: { pageWmm: number; pageHmm: number; bleedMm: number }) {
  const media = createPrintPageMediaSizeMm(pageWmm, pageHmm, bleedMm)
  const trimX = CROP_MARK_AREA_MM + bleedMm
  const trimY = CROP_MARK_AREA_MM + bleedMm
  const half = CROP_MARK_THICKNESS_MM / 2
  const len = CROP_MARK_LENGTH_MM

  const horizontal = [
    { left: 0, top: trimY - half },
    { left: media.width - len, top: trimY - half },
    { left: 0, top: trimY + pageHmm - half },
    { left: media.width - len, top: trimY + pageHmm - half },
  ]
  const vertical = [
    { left: trimX - half, top: 0 },
    { left: trimX + pageWmm - half, top: 0 },
    { left: trimX - half, top: media.height - len },
    { left: trimX + pageWmm - half, top: media.height - len },
  ]

  return (
    <>
      {horizontal.map((mark, index) => (
        <View
          key={`h-${index}`}
          style={{ position: 'absolute', left: mmToPt(mark.left), top: mmToPt(mark.top), width: mmToPt(len), height: mmToPt(CROP_MARK_THICKNESS_MM), backgroundColor: '#000000' }}
        />
      ))}
      {vertical.map((mark, index) => (
        <View
          key={`v-${index}`}
          style={{ position: 'absolute', left: mmToPt(mark.left), top: mmToPt(mark.top), width: mmToPt(CROP_MARK_THICKNESS_MM), height: mmToPt(len), backgroundColor: '#000000' }}
        />
      ))}
    </>
  )
}

/**
 * 印刷单页：一页 PDF = 成品 + 出血 + 角线。跨页内容以裁切窗口取景，
 * 书脊一侧的出血由相邻页面的内容自然延续填充
 */
function ZinePrintPage({ project, page, cjkFontFamily }: { project: ZineProject; page: PrintPageRef; cjkFontFamily: string | null }) {
  const { pageW, pageH, spreadW, spreadH } = getSpreadSize(project.pageSize, project.pageOrientation, project.customSizeMm)
  const bleed = getProjectBleedMm(project)
  const media = createPrintPageMediaSizeMm(pageW, pageH, bleed)
  const spread = project.spreads[page.spreadIndex]
  const offsetX = page.side === 'right' ? pageW : 0
  const pageNumberSettings = project.pageNumbers

  return (
    <Page size={createPdfPageSize(media.width, media.height)}>
      <View
        style={{
          position: 'absolute',
          left: mmToPt(CROP_MARK_AREA_MM),
          top: mmToPt(CROP_MARK_AREA_MM),
          width: mmToPt(pageW + bleed * 2),
          height: mmToPt(pageH + bleed * 2),
          overflow: 'hidden',
          backgroundColor: '#ffffff',
        }}
      >
        <View style={{ position: 'absolute', left: mmToPt(bleed - offsetX), top: mmToPt(bleed), width: mmToPt(spreadW), height: mmToPt(spreadH) }}>
          {sortSlotsByZIndex(spread?.slots ?? []).map((slot) => renderPdfSlot(slot, pageW, project.assets, cjkFontFamily))}
        </View>
      </View>
      {pageNumberSettings?.enabled && page.role === 'content' && (
        <PdfPageNumberText
          value={page.pageNumber}
          align={getPageNumberAlign(page.side, pageNumberSettings.position)}
          leftMm={CROP_MARK_AREA_MM + bleed + SAFE_MARGIN_MM}
          topMm={CROP_MARK_AREA_MM + bleed + pageH - PAGE_NUMBER_BOTTOM_MM}
          widthMm={pageW - SAFE_MARGIN_MM * 2}
        />
      )}
      <PrintCropMarks pageWmm={pageW} pageHmm={pageH} bleedMm={bleed} />
    </Page>
  )
}

export function ZinePdfDocument({ project, cjkFontFamily = null, variant = 'spread' }: ZinePdfDocumentProps) {
  const { pageW, spreadW, spreadH } = getSpreadSize(project.pageSize, project.pageOrientation, project.customSizeMm)

  if (variant === 'print') {
    return (
      <Document title={project.title || 'zine'}>
        {buildPrintPageSequence(project).map((page) => (
          <ZinePrintPage key={`${page.spreadIndex}-${page.side}`} project={project} page={page} cjkFontFamily={cjkFontFamily} />
        ))}
      </Document>
    )
  }

  return (
    <Document title={project.title || 'zine'}>
      {project.spreads.map((spread, spreadIndex) => (
        <Page key={spread.id} size={createPdfPageSize(spreadW, spreadH)}>
          <View style={createPdfSlotStyle({ position: 'absolute' as const, left: 0, top: 0, width: pageW, height: spreadH, backgroundColor: '#ffffff' })} />
          <View style={createPdfSlotStyle({ position: 'absolute' as const, left: pageW, top: 0, width: pageW, height: spreadH, backgroundColor: '#ffffff' })} />
          {sortSlotsByZIndex(spread.slots).map((slot) => renderPdfSlot(slot, pageW, project.assets, cjkFontFamily))}
          {project.pageNumbers?.enabled && renderSpreadPdfPageNumbers(project, spreadIndex, project.pageNumbers, pageW, spreadH)}
        </Page>
      ))}
    </Document>
  )
}

export interface ExportZinePdfOptions {
  variant?: ZinePdfVariant
  onAssetProgress?: (done: number, total: number) => void
}

export async function exportZinePdf(project: ZineProject, options: ExportZinePdfOptions = {}) {
  const variant = options.variant ?? 'spread'
  const cjkFontFamily = await ensureZineCjkPdfFont()
  validateZinePdfTextFonts(project, cjkFontFamily)
  const pdfProject = await createZinePdfProject(project, { onAssetProgress: options.onAssetProgress })
  const blob = await pdf(<ZinePdfDocument project={pdfProject} cjkFontFamily={cjkFontFamily} variant={variant} />).toBlob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = objectUrl
  link.download = createZinePdfFileName(project, variant)
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
