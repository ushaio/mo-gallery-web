import { Document, Image as PdfImage, Page, pdf, Text, View } from '@react-pdf/renderer'

import { getSpreadSize } from '@/lib/zine/page-sizes'
import { prepareZinePdfFonts } from '@/lib/zine/pdf-fonts'
import { prepareZinePdfImages } from '@/lib/zine/pdf-images'
import { finalizeZinePdf } from '@/lib/zine/pdf-output'
import {
  buildPrintPageSequence, CROP_MARK_AREA_MM, getPageNumberAlign, getProjectBleedMm,
  getSpreadPageNumbers, PAGE_NUMBER_BOTTOM_MM, PAGE_NUMBER_FONT_PT, SAFE_MARGIN_MM,
} from '@/lib/zine/print'
import { collectPdfTextIssues, collectZinePrintIssues, pdfTextNodeId } from '@/lib/zine/print-preflight'
import { calculateImagePlacement, renderSlot } from '@/lib/zine/slot-render'
import type { ZinePdfFonts } from '@/lib/zine/pdf-fonts'
import type { PrintPageRef } from '@/lib/zine/print'
import type { ZinePrintIssue } from '@/lib/zine/print-preflight'
import type { Slot, ZineAsset, ZineImageTransform, ZinePageNumberSettings, ZineProject } from '@/lib/zine/types'

const POINTS_PER_MM = 72 / 25.4
export type ZinePdfVariant = 'spread' | 'print'
type PdfMeasuredStyle = Record<string, string | number> & { left: number; top: number; width: number; height: number }

interface ZinePdfDocumentProps {
  project: ZineProject
  fonts: ZinePdfFonts
  variant?: ZinePdfVariant
  onRender?: (result: unknown) => void
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

export function createPdfImageStyle(slotStyle: PdfMeasuredStyle, asset?: ZineAsset, transform?: ZineImageTransform) {
  if (!asset || !transform) {
    return { width: mmToPt(slotStyle.width), height: mmToPt(slotStyle.height), objectFit: 'cover' as const }
  }

  const placement = calculateImagePlacement(slotStyle.width, slotStyle.height, asset.width, asset.height, transform)
  return {
    position: 'absolute' as const,
    left: mmToPt(placement.left),
    top: mmToPt(placement.top),
    width: mmToPt(placement.width),
    height: mmToPt(placement.height),
    transform: `rotate(${placement.rotation}deg)`,
  }
}

function renderPdfSlot(slot: Slot, pageW: number, assets: ZineAsset[], fonts: ZinePdfFonts) {
  const rendered = renderSlot(slot, pageW, assets)

  if (slot.kind === 'image') {
    const src = rendered.imageInner?.src
    const slotStyle = rendered.pdfStyle as PdfMeasuredStyle
    const asset = assets.find((item) => item.id === slot.assetId)
    return (
      <View key={slot.id} style={createPdfSlotStyle(slotStyle)}>
        {src ? (
          <PdfImage src={src} style={createPdfImageStyle(slotStyle, asset, slot.imageTransform)} />
        ) : (
          null
        )}
      </View>
    )
  }

  const verticalAlign = slot.verticalAlign ?? 'top'
  const justifyContent = verticalAlign === 'center' ? 'center' : verticalAlign === 'bottom' ? 'flex-end' : 'flex-start'
  return (
    <View key={slot.id} style={{ ...createPdfSlotStyle(rendered.pdfStyle as PdfMeasuredStyle), justifyContent }}>
      <Text id={pdfTextNodeId(slot)} style={{ ...rendered.text?.pdfStyle, fontFamily: fonts.defaultFontFamily, flexShrink: 0 }}>
        {fonts.getTextRuns(slot.fontFamily, slot.content).map((run, index) => (
          <Text key={index} style={{ fontFamily: run.fontFamily }}>{run.content}</Text>
        ))}
      </Text>
    </View>
  )
}

function sortSlotsByZIndex(slots: Slot[]) {
  return [...slots].sort((a, b) => a.zIndex - b.zIndex)
}

function PdfPageNumberText({ value, align, leftMm, topMm, widthMm, fontFamily }: { value: number; align: 'left' | 'center' | 'right'; leftMm: number; topMm: number; widthMm: number; fontFamily: string }) {
  return (
    <Text
      style={{
        position: 'absolute',
        left: mmToPt(leftMm),
        top: mmToPt(topMm),
        width: mmToPt(widthMm),
        fontSize: PAGE_NUMBER_FONT_PT,
        fontFamily,
        lineHeight: 1,
        color: '#525252',
        textAlign: align,
      }}
    >
      {String(value)}
    </Text>
  )
}

function renderSpreadPdfPageNumbers(project: ZineProject, spreadIndex: number, settings: ZinePageNumberSettings, pageWmm: number, pageHmm: number, fontFamily: string) {
  const pages = getSpreadPageNumbers(project, spreadIndex)
  if (pages === 'cover') return null

  return (['left', 'right'] as const).map((side) => (
    <PdfPageNumberText
      key={`folio-${side}`}
      fontFamily={fontFamily}
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

const CROP_MARK_THICKNESS_MM = 0.25 / POINTS_PER_MM
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
function ZinePrintPage({ project, page, fonts }: { project: ZineProject; page: PrintPageRef; fonts: ZinePdfFonts }) {
  const { pageW, pageH, spreadW, spreadH } = getSpreadSize(project.pageSize, project.pageOrientation, project.customSizeMm)
  const bleed = getProjectBleedMm(project)
  const media = createPrintPageMediaSizeMm(pageW, pageH, bleed)
  const spread = project.spreads[page.spreadIndex]
  const offsetX = page.side === 'right' ? pageW : 0
  const pageNumberSettings = project.pageNumbers

  return (
    <Page size={createPdfPageSize(media.width, media.height)}>
      <View
        wrap={false}
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
          {sortSlotsByZIndex(spread?.slots ?? []).map((slot) => renderPdfSlot(slot, pageW, project.assets, fonts))}
        </View>
      </View>
      {pageNumberSettings?.enabled && page.role === 'content' && (
        <PdfPageNumberText
          value={page.pageNumber}
          fontFamily={fonts.defaultFontFamily}
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

export function ZinePdfDocument({ project, fonts, variant = 'print', onRender }: ZinePdfDocumentProps) {
  const { pageW, spreadW, spreadH } = getSpreadSize(project.pageSize, project.pageOrientation, project.customSizeMm)

  if (variant === 'print') {
    return (
      <Document title={project.title || 'zine'} pdfVersion="1.7" onRender={onRender}>
        {buildPrintPageSequence(project).map((page) => (
          <ZinePrintPage key={`${page.spreadIndex}-${page.side}`} project={project} page={page} fonts={fonts} />
        ))}
      </Document>
    )
  }

  return (
    <Document title={project.title || 'zine'} pdfVersion="1.7" onRender={onRender}>
      {project.spreads.map((spread, spreadIndex) => (
        <Page key={spread.id} size={createPdfPageSize(spreadW, spreadH)}>
          <View wrap={false} style={createPdfSlotStyle({ position: 'absolute' as const, left: 0, top: 0, width: spreadW, height: spreadH, backgroundColor: '#ffffff', overflow: 'hidden' as const })}>
            {sortSlotsByZIndex(spread.slots).map((slot) => renderPdfSlot(slot, pageW, project.assets, fonts))}
            {project.pageNumbers?.enabled && renderSpreadPdfPageNumbers(project, spreadIndex, project.pageNumbers, pageW, spreadH, fonts.defaultFontFamily)}
          </View>
        </Page>
      ))}
    </Document>
  )
}

export interface ExportZinePdfOptions {
  variant?: ZinePdfVariant
  onAssetProgress?: (done: number, total: number) => void
}

export interface PreparedZinePdf {
  blob: Blob | null
  fileName: string
  issues: ZinePrintIssue[]
}

/** Prepare once; the dialog reviews the measured result before downloading it. */
export async function prepareZinePdf(project: ZineProject, options: ExportZinePdfOptions = {}): Promise<PreparedZinePdf> {
  if (!project.spreads.length) throw new Error('没有可导出的页面 / No pages to export')
  const variant = options.variant ?? 'print'
  const fileName = createZinePdfFileName(project, variant)
  const initialIssues = collectZinePrintIssues(project, variant)
  if (initialIssues.some((issue) => issue.severity === 'error')) return { blob: null, fileName, issues: initialIssues }

  const fonts = await prepareZinePdfFonts(project)
  const pdfProject = await prepareZinePdfImages(project, { onAssetProgress: options.onAssetProgress })
  const issues = collectZinePrintIssues(pdfProject, variant)
  if (issues.some((issue) => issue.severity === 'error')) return { blob: null, fileName, issues }

  let layout: unknown
  const raw = await pdf(<ZinePdfDocument project={pdfProject} fonts={fonts} variant={variant} onRender={(result) => { layout = result }} />).toBlob()
  issues.push(...collectPdfTextIssues(pdfProject, layout))
  if (issues.some((issue) => issue.severity === 'error')) return { blob: null, fileName, issues }
  const blob = await finalizeZinePdf(raw, pdfProject, variant)
  return { blob, fileName, issues }
}

export function downloadZinePdf(prepared: PreparedZinePdf) {
  if (!prepared.blob || prepared.issues.some((issue) => issue.severity === 'error')) throw new Error('PDF 未通过导出检查 / PDF preflight failed')
  const objectUrl = URL.createObjectURL(prepared.blob)
  const link = document.createElement('a')

  link.href = objectUrl
  link.download = prepared.fileName
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
