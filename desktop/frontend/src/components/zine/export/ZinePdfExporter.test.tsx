import { pdf } from '@react-pdf/renderer'

import type { ZineAsset, ZineProject } from '@/lib/zine/types'

import {
  createPdfImageStyle,
  createPdfPageSize,
  createPdfSlotStyle,
  createPrintPageMediaSizeMm,
  createZinePdfFileName,
  createZinePdfProject,
  exportZinePdf,
  isLikelyFontData,
  resolveZinePdfFontFamily,
  ZINE_PDF_CJK_FONT_FAMILY,
  ZinePdfDocument,
} from './ZinePdfExporter'

const project = {
  id: 'zine-test',
  title: 'Test Zine',
  pageSize: 'a5',
  pageOrientation: 'portrait',
  createdBy: 'test',
  createdAt: 0,
  updatedAt: 0,
  spreads: [
    {
      id: 'spread-1',
      templateId: 'test-template',
      slots: [
        {
          id: 'text-1',
          kind: 'text',
          page: 'left',
          x: 12,
          y: 18,
          w: 60,
          h: 30,
          rotation: 0,
          zIndex: 1,
          content: 'Visible text',
          align: 'center',
          fontSize: 14,
          lineHeight: 1.3,
          color: '#111111',
          fontFamily: 'Helvetica',
        },
      ],
    },
  ],
  assets: [],
} satisfies ZineProject

function createProjectWithImageAsset(asset: ZineAsset): ZineProject {
  return {
    ...project,
    spreads: [
      {
        ...project.spreads[0],
        slots: [
          {
            id: 'image-1',
            kind: 'image',
            page: 'left',
            x: 12,
            y: 18,
            w: 60,
            h: 30,
            rotation: 0,
            zIndex: 1,
            assetId: asset.id,
            imageTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 },
          },
        ],
      },
    ],
    assets: [asset],
  }
}

const documentElement = <ZinePdfDocument project={project} />
const fileName = createZinePdfFileName(project)
const a5SpreadSize = createPdfPageSize(296, 210)
const textSlotStyle = createPdfSlotStyle({ position: 'absolute', left: 160, top: 18, width: 60, height: 30, zIndex: 1, overflow: 'hidden' })

if (documentElement.type !== ZinePdfDocument) {
  throw new Error('ZinePdfDocument should render as a React component')
}

const textSlotBlob = await pdf(<ZinePdfDocument project={project} />).toBlob()
if (!(textSlotBlob instanceof Blob) || textSlotBlob.size <= 0) {
  throw new Error('Expected a text slot zine to render to a non-empty PDF blob')
}

const cjkProject = {
  ...project,
  spreads: [
    {
      ...project.spreads[0],
      slots: project.spreads[0].slots.map((slot) => (slot.kind === 'text' ? { ...slot, content: '你好世界' } : slot)),
    },
  ],
} satisfies ZineProject

let missingCjkExportError = ''
try {
  await exportZinePdf(cjkProject)
} catch (error) {
  missingCjkExportError = error instanceof Error ? error.message : String(error)
}
if (!missingCjkExportError.includes('系统中未找到可用的中文字体')) {
  throw new Error(`Expected CJK text PDF export to keep the font error, got ${missingCjkExportError}`)
}

if (fileName !== 'Test Zine.pdf') {
  throw new Error(`Expected Test Zine.pdf, got ${fileName}`)
}

if (Math.round(a5SpreadSize[0]) !== 839 || Math.round(a5SpreadSize[1]) !== 595) {
  throw new Error(`Expected A5 spread PDF size to be 839pt x 595pt, got ${a5SpreadSize.join(' x ')}`)
}

if (Math.round(Number(textSlotStyle.left)) !== 454 || Math.round(Number(textSlotStyle.width)) !== 170) {
  throw new Error('Expected slot dimensions to be converted from millimeters to points')
}

if (resolveZinePdfFontFamily('serif', 'Latin only', null) !== 'Times-Roman') {
  throw new Error('Expected serif to map to the Times-Roman standard PDF font')
}

if (resolveZinePdfFontFamily('sans-serif', 'Latin only', null) !== 'Helvetica') {
  throw new Error('Expected sans-serif to map to the Helvetica standard PDF font')
}

if (resolveZinePdfFontFamily('monospace', 'Latin only', null) !== 'Courier') {
  throw new Error('Expected monospace to map to the Courier standard PDF font')
}

if (resolveZinePdfFontFamily('Helvetica', 'Latin only', null) !== 'Helvetica') {
  throw new Error('Expected registered standard font families to pass through unchanged')
}

if (resolveZinePdfFontFamily(undefined, 'Latin only', null) !== 'Helvetica') {
  throw new Error('Expected missing font family to fall back to Helvetica')
}

if (resolveZinePdfFontFamily('serif', 'line one\nline two\ttab', null) !== 'Times-Roman') {
  throw new Error('Expected multi-line Latin text to keep using standard PDF fonts')
}

if (resolveZinePdfFontFamily('serif', '你好世界', ZINE_PDF_CJK_FONT_FAMILY) !== ZINE_PDF_CJK_FONT_FAMILY) {
  throw new Error('Expected CJK text to use the registered CJK font family')
}

let missingCjkFontThrew = false
try {
  resolveZinePdfFontFamily('serif', '你好世界', null)
} catch {
  missingCjkFontThrew = true
}
if (!missingCjkFontThrew) {
  throw new Error('Expected CJK text without a registered CJK font to throw a descriptive error')
}

// 字体端点预检：TTC/TTF/OTF 魔数放行，HTML 兜底页与残缺数据拒绝
if (!isLikelyFontData(new Uint8Array([0x74, 0x74, 0x63, 0x66, 0x00, 0x02]))) {
  throw new Error('Expected TTC collections (Windows CJK system fonts) to be accepted')
}
if (!isLikelyFontData(new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x00]))) {
  throw new Error('Expected TrueType fonts to be accepted')
}
if (!isLikelyFontData(new TextEncoder().encode('OTTO....'))) {
  throw new Error('Expected OpenType/CFF fonts to be accepted')
}
if (isLikelyFontData(new TextEncoder().encode('<!DOCTYPE html><html>'))) {
  throw new Error('Expected an HTML fallback page to be rejected as font data')
}
if (isLikelyFontData(new Uint8Array([0x74, 0x74]))) {
  throw new Error('Expected truncated data to be rejected as font data')
}

const localAssetProject = {
  id: 'local-1',
  source: 'local',
  blobId: 'blob-1',
  fileName: 'local.jpg',
  width: 10,
  height: 10,
  previewUrl: 'blob:preview',
  fullUrl: 'blob:full',
  createdAt: 0,
} satisfies ZineAsset

const pdfProject = await createZinePdfProject(createProjectWithImageAsset(localAssetProject), { loadAssetBlob: async () => new Blob(['zine image'], { type: 'image/jpeg' }) })

if (!pdfProject.assets[0]?.fullUrl.startsWith('data:image/jpeg;base64,')) {
  throw new Error(`Expected local PDF asset to use a data URL, got ${pdfProject.assets[0]?.fullUrl}`)
}

const pdfImageStyle = createPdfImageStyle({ position: 'absolute', left: 12, top: 18, width: 60, height: 30, zIndex: 1, overflow: 'hidden' })

if (Math.round(Number(pdfImageStyle?.width)) !== 170 || Math.round(Number(pdfImageStyle?.height)) !== 85) {
  throw new Error(`Expected PDF image dimensions to be converted to points, got ${String(pdfImageStyle?.width)} x ${String(pdfImageStyle?.height)}`)
}

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => (key === 'mo-gallery-server' ? 'https://gallery.example.com' : null),
  },
  configurable: true,
})

const libraryAssetProject = {
  id: 'library-1',
  source: 'library',
  fileName: 'library.jpg',
  width: 10,
  height: 10,
  previewUrl: '/uploads/thumb.jpg',
  fullUrl: '/uploads/full.jpg',
  createdAt: 0,
} satisfies ZineAsset

const resolvedPdfProject = await createZinePdfProject(createProjectWithImageAsset(libraryAssetProject))

if (resolvedPdfProject.assets[0]?.fullUrl !== 'https://gallery.example.com/uploads/full.jpg') {
  throw new Error(`Expected resolved library PDF URL, got ${resolvedPdfProject.assets[0]?.fullUrl}`)
}

const avifLibraryAssetProject = {
  id: 'library-avif-1',
  source: 'library',
  fileName: 'library.avif',
  width: 10,
  height: 10,
  previewUrl: '/uploads/thumb.avif',
  fullUrl: '/uploads/full.avif',
  createdAt: 0,
} satisfies ZineAsset

const convertedPdfProject = await createZinePdfProject(createProjectWithImageAsset(avifLibraryAssetProject), {
  convertImageSource: async (source) => `data:image/jpeg;base64,converted:${source}`,
})

if (convertedPdfProject.assets[0]?.fullUrl !== 'data:image/jpeg;base64,converted:https://gallery.example.com/uploads/full.avif') {
  throw new Error(`Expected PDF export to convert library AVIF to JPEG data URL, got ${convertedPdfProject.assets[0]?.fullUrl}`)
}

const convertedProxiedAvifPdfProject = await createZinePdfProject(createProjectWithImageAsset(avifLibraryAssetProject), {
  loadRemoteImageSource: async () => new Blob(['proxied avif bytes'], { type: 'image/avif' }),
  convertImageSource: async () => {
    throw new Error('Expected proxied AVIF blobs to bypass the generic browser image converter')
  },
  convertAvifImageSource: async (source: string | Blob) => (source instanceof Blob ? `data:image/jpeg;base64,avif:${source.type}` : `unexpected:${source}`),
})

if (convertedProxiedAvifPdfProject.assets[0]?.fullUrl !== 'data:image/jpeg;base64,avif:image/avif') {
  throw new Error(`Expected proxied AVIF library image to use the AVIF converter, got ${convertedProxiedAvifPdfProject.assets[0]?.fullUrl}`)
}

const convertedGenericProxiedAvifPdfProject = await createZinePdfProject(createProjectWithImageAsset({
  ...avifLibraryAssetProject,
  fileName: 'P1120823',
  fullUrl: 'https://r2.mo-gallery.shaio.top/2026/c76fd749416271369e61d73fa1433a91.avif',
}), {
  loadRemoteImageSource: async () => new Blob(['proxied avif bytes'], { type: 'application/octet-stream' }),
  convertImageSource: async () => {
    throw new Error('Expected proxied AVIF URLs with generic blob types to bypass the browser image converter')
  },
  convertAvifImageSource: async (source: string | Blob) => (source instanceof Blob ? `data:image/jpeg;base64,avif:${source.type}` : `unexpected:${source}`),
})

if (convertedGenericProxiedAvifPdfProject.assets[0]?.fullUrl !== 'data:image/jpeg;base64,avif:image/avif') {
  throw new Error(`Expected generic proxied AVIF blobs to keep AVIF handling from the original URL, got ${convertedGenericProxiedAvifPdfProject.assets[0]?.fullUrl}`)
}

const staleLibraryAssetProject = createProjectWithImageAsset({
  ...avifLibraryAssetProject,
  id: 'library-current-1',
  fileName: 'P1120976',
  fullUrl: 'https://r2.mo-gallery.shaio.top/2026/ab74df7361088f110b25ce2b87cc46c886.avif',
})
staleLibraryAssetProject.assets.push({
  ...avifLibraryAssetProject,
  id: 'library-stale-1',
  fileName: 'P1120840',
  fullUrl: 'https://r2.mo-gallery.shaio.top/2026/stale.avif',
})

const skippedStalePdfProject = await createZinePdfProject(staleLibraryAssetProject, {
  loadRemoteImageSource: async (url) => {
    if (url.includes('stale.avif')) throw new Error('Expected unused assets to be skipped during PDF export preparation')
    return new Blob(['current image'], { type: 'image/jpeg' })
  },
})

if (skippedStalePdfProject.assets.length !== 1 || skippedStalePdfProject.assets[0]?.fileName !== 'P1120976') {
  throw new Error(`Expected PDF export preparation to keep only referenced assets, got ${skippedStalePdfProject.assets.map((asset) => asset.fileName).join(', ')}`)
}

const localAvifProject = {
  id: 'local-avif-1',
  source: 'local',
  blobId: 'local-avif-blob',
  fileName: 'local.avif',
  width: 10,
  height: 10,
  previewUrl: 'blob:local-avif',
  fullUrl: 'blob:local-avif',
  createdAt: 0,
} satisfies ZineAsset

const convertedLocalPdfProject = await createZinePdfProject(createProjectWithImageAsset(localAvifProject), {
  loadAssetBlob: async () => new Blob(['avif bytes'], { type: 'image/avif' }),
  convertImageSource: async (source) => (source instanceof Blob ? `data:image/jpeg;base64,converted:${source.type}` : `unexpected:${source}`),
})

if (convertedLocalPdfProject.assets[0]?.fullUrl !== 'data:image/jpeg;base64,converted:image/avif') {
  throw new Error(`Expected PDF export to convert local AVIF blob to JPEG data URL, got ${convertedLocalPdfProject.assets[0]?.fullUrl}`)
}

const proxiedLibraryPdfProject = await createZinePdfProject(createProjectWithImageAsset(libraryAssetProject), {
  loadRemoteImageSource: async () => new Blob(['proxied image'], { type: 'image/jpeg' }),
})

if (!proxiedLibraryPdfProject.assets[0]?.fullUrl.startsWith('data:image/jpeg;base64,')) {
  throw new Error(`Expected proxied library image blob to become a data URL, got ${proxiedLibraryPdfProject.assets[0]?.fullUrl}`)
}

// —— 印刷单页版：成纸尺寸 = 成品 + 出血 + 角线区 ——

const printMedia = createPrintPageMediaSizeMm(148, 210, 3)
if (printMedia.width !== 164 || printMedia.height !== 226) {
  throw new Error(`Expected A5 print media to be 164×226mm (trim + 3mm bleed + 5mm marks), got ${printMedia.width}×${printMedia.height}`)
}

if (createZinePdfFileName(project, 'print') !== 'Test Zine-print.pdf') {
  throw new Error(`Expected the print variant file name to carry a -print suffix, got ${createZinePdfFileName(project, 'print')}`)
}

const coverPrintProject = {
  ...project,
  spreads: [{ id: 'cover-1', templateId: 'cover-title', role: 'cover' as const, slots: [] }, ...project.spreads],
} satisfies ZineProject

const printBlob = await pdf(<ZinePdfDocument project={coverPrintProject} variant="print" />).toBlob()
if (!(printBlob instanceof Blob) || printBlob.size <= 0) {
  throw new Error('Expected the print variant to render to a non-empty PDF blob')
}

// —— 页码：数字用 Helvetica 直排，两种变体都应能渲染 ——

const numberedProject = {
  ...coverPrintProject,
  pageNumbers: { enabled: true, position: 'bottom-outer' as const },
} satisfies ZineProject

const numberedSpreadBlob = await pdf(<ZinePdfDocument project={numberedProject} />).toBlob()
if (!(numberedSpreadBlob instanceof Blob) || numberedSpreadBlob.size <= 0) {
  throw new Error('Expected the spread variant with page numbers to render to a non-empty PDF blob')
}

const numberedPrintBlob = await pdf(<ZinePdfDocument project={numberedProject} variant="print" />).toBlob()
if (!(numberedPrintBlob instanceof Blob) || numberedPrintBlob.size <= 0) {
  throw new Error('Expected the print variant with page numbers to render to a non-empty PDF blob')
}

// —— 图片失败聚合与进度回调 ——

function createFailingAsset(id: string, fileName: string): ZineAsset {
  return { id, source: 'library', fileName, width: 10, height: 10, previewUrl: '', fullUrl: `/uploads/${fileName}`, createdAt: 0 }
}

const multiFailProject = {
  ...project,
  spreads: [
    {
      ...project.spreads[0],
      slots: (['fail-a', 'fail-b'] as const).map((assetId, index) => ({
        id: `img-${assetId}`,
        kind: 'image' as const,
        page: 'left' as const,
        x: 10,
        y: 10 + index * 40,
        w: 40,
        h: 30,
        rotation: 0,
        zIndex: index + 1,
        assetId,
        imageTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 },
      })),
    },
  ],
  assets: [createFailingAsset('fail-a', 'fail-a.jpg'), createFailingAsset('fail-b', 'fail-b.jpg')],
} satisfies ZineProject

const progressEvents: string[] = []
let aggregatedMessage = ''
try {
  await createZinePdfProject(multiFailProject, {
    loadRemoteImageSource: async () => {
      throw new Error('boom')
    },
    onAssetProgress: (done, total) => progressEvents.push(`${done}/${total}`),
  })
} catch (error) {
  aggregatedMessage = error instanceof Error ? error.message : String(error)
}
if (!aggregatedMessage.startsWith('共 2 张图片处理失败：') || !aggregatedMessage.includes('fail-a.jpg（boom）') || !aggregatedMessage.includes('fail-b.jpg（boom）')) {
  throw new Error(`Expected both failing images to be aggregated into one error, got ${aggregatedMessage}`)
}
if (progressEvents.length !== 2 || progressEvents[1] !== '2/2') {
  throw new Error(`Expected asset progress to fire per image even on failure, got ${progressEvents.join(', ')}`)
}

let singleFailureMessage = ''
try {
  await createZinePdfProject(createProjectWithImageAsset(createFailingAsset('fail-a', 'fail-a.jpg')), {
    loadRemoteImageSource: async () => {
      throw new Error('boom')
    },
  })
} catch (error) {
  singleFailureMessage = error instanceof Error ? error.message : String(error)
}
if (singleFailureMessage !== '图片 fail-a.jpg 处理失败（boom）') {
  throw new Error(`Expected the single-failure message format to stay stable, got ${singleFailureMessage}`)
}
