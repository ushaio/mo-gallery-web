import {
  buildPrintPageSequence,
  calculateEffectiveDpi,
  collectLowResSlots,
  getPageNumberAlign,
  getProjectBleedMm,
  getSpreadPageNumbers,
  getTotalPageCount,
  isSaddleStitchReady,
} from './print'
import type { ImageSlot, Spread, ZineAsset, ZineProject } from './types'

function createImageSlot(id: string, assetId: string | null, w: number, h: number, scale = 1): ImageSlot {
  return { id, kind: 'image', page: 'left', x: 0, y: 0, w, h, rotation: 0, zIndex: 1, assetId, imageTransform: { scale, offsetX: 0, offsetY: 0, rotation: 0 } }
}

function createSpread(id: string, role?: 'cover', slots: ImageSlot[] = []): Spread {
  return { id, templateId: 'test', ...(role ? { role } : {}), slots }
}

function createAsset(id: string, fileName: string, width: number, height: number): ZineAsset {
  return { id, source: 'library', fileName, width, height, previewUrl: '', fullUrl: '', createdAt: 0 }
}

function createProject(spreads: Spread[], assets: ZineAsset[] = []): Pick<ZineProject, 'spreads' | 'assets'> {
  return { spreads, assets }
}

// —— 页数统计与骑马钉校验 ——

const coveredProject = createProject([createSpread('cover', 'cover'), createSpread('s1'), createSpread('s2'), createSpread('s3')])
if (getTotalPageCount(coveredProject) !== 8) {
  throw new Error(`Expected cover + 3 content spreads to make 8 pages, got ${getTotalPageCount(coveredProject)}`)
}
if (!isSaddleStitchReady(coveredProject)) {
  throw new Error('Expected 8 pages to satisfy saddle stitch (multiple of 4)')
}

const oddProject = createProject([createSpread('cover', 'cover'), createSpread('s1'), createSpread('s2')])
if (getTotalPageCount(oddProject) !== 6 || isSaddleStitchReady(oddProject)) {
  throw new Error('Expected 6 pages to fail the saddle stitch check')
}

// —— 印刷单页阅读顺序：封面 → 内页 → 封底 ——

const sequence = buildPrintPageSequence(createProject([createSpread('cover', 'cover'), createSpread('s1'), createSpread('s2')]))
const sequenceShape = sequence.map((page) => `${page.pageNumber}:${page.spreadIndex}:${page.side}:${page.role}`).join(' ')
if (
  sequenceShape !==
  '1:0:right:cover-front 2:1:left:content 3:1:right:content 4:2:left:content 5:2:right:content 6:0:left:cover-back'
) {
  throw new Error(`Unexpected print page sequence with cover: ${sequenceShape}`)
}

const plainSequence = buildPrintPageSequence(createProject([createSpread('s1'), createSpread('s2')]))
const plainShape = plainSequence.map((page) => `${page.pageNumber}:${page.spreadIndex}:${page.side}:${page.role}`).join(' ')
if (plainShape !== '1:0:left:content 2:0:right:content 3:1:left:content 4:1:right:content') {
  throw new Error(`Unexpected print page sequence without cover: ${plainShape}`)
}

// —— 跨页页码标注 ——

if (getSpreadPageNumbers(coveredProject, 0) !== 'cover') {
  throw new Error('Expected the cover spread to be labelled as cover')
}
const firstContentPages = getSpreadPageNumbers(coveredProject, 1)
if (firstContentPages === 'cover' || firstContentPages.left !== 2 || firstContentPages.right !== 3) {
  throw new Error(`Expected first content spread after cover to be P2-P3, got ${JSON.stringify(firstContentPages)}`)
}
const noCoverPages = getSpreadPageNumbers(createProject([createSpread('s1'), createSpread('s2')]), 0)
if (noCoverPages === 'cover' || noCoverPages.left !== 1 || noCoverPages.right !== 2) {
  throw new Error(`Expected first spread without cover to be P1-P2, got ${JSON.stringify(noCoverPages)}`)
}

// —— 有效 DPI：object-fit cover 铺满 + 用户缩放 ——

if (Math.round(calculateEffectiveDpi(3000, 2000, 100, 100)) !== 508) {
  throw new Error(`Expected 3000×2000px in a 100×100mm slot to be ~508 DPI, got ${calculateEffectiveDpi(3000, 2000, 100, 100)}`)
}
if (Math.round(calculateEffectiveDpi(3000, 2000, 100, 100, 2)) !== 254) {
  throw new Error('Expected 2x zoom to halve the effective DPI')
}
if (calculateEffectiveDpi(0, 2000, 100, 100) !== 0) {
  throw new Error('Expected missing pixel data to yield 0 DPI (unknown)')
}

// —— 低分辨率槽位汇总 ——

const dpiProject = createProject(
  [
    createSpread('cover', 'cover'),
    createSpread('s1', undefined, [
      createImageSlot('slot-good', 'asset-good', 100, 100),
      createImageSlot('slot-bad', 'asset-bad', 200, 150),
      createImageSlot('slot-empty', null, 100, 100),
      createImageSlot('slot-unknown', 'asset-unknown', 100, 100),
    ]),
  ],
  [createAsset('asset-good', 'good.jpg', 3000, 2000), createAsset('asset-bad', 'bad.jpg', 800, 600), createAsset('asset-unknown', 'unknown.jpg', 0, 0)],
)
const warnings = collectLowResSlots(dpiProject)
if (warnings.length !== 1 || warnings[0].slotId !== 'slot-bad' || warnings[0].assetFileName !== 'bad.jpg' || warnings[0].effectiveDpi !== 102 || warnings[0].spreadIndex !== 1) {
  throw new Error(`Expected exactly the 800×600px image in a 200×150mm slot to be flagged, got ${JSON.stringify(warnings)}`)
}

// —— 出血默认值 ——

if (getProjectBleedMm({}) !== 3 || getProjectBleedMm({ bleedMm: 5 }) !== 5 || getProjectBleedMm({ bleedMm: 0 }) !== 0 || getProjectBleedMm({ bleedMm: -1 }) !== 3) {
  throw new Error('Expected bleed to default to 3mm and reject negative values')
}

// —— 页码对齐：居中恒居中，外侧为左页靠左、右页靠右 ——

if (getPageNumberAlign('left', 'bottom-center') !== 'center' || getPageNumberAlign('right', 'bottom-center') !== 'center') {
  throw new Error('Expected bottom-center page numbers to align center on both pages')
}
if (getPageNumberAlign('left', 'bottom-outer') !== 'left' || getPageNumberAlign('right', 'bottom-outer') !== 'right') {
  throw new Error('Expected bottom-outer page numbers to hug the outer edge')
}
