import { unified } from 'unified'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'
import { legacyHtmlDocument } from './legacy-html'
import { legacyCss, legacyRecord, legacyString, legacyTextStyle } from './legacy-style'
import { mediaToAttributes, normalizeMedia, safeMediaUrl } from './media'
import { normalizeMediaEmbed, parseMediaEmbed } from './media-embed'
import { textStyleToAttributes } from './text-style'
import type { AlignType, BlockContent, Paragraph, PhrasingContent, RootContent, Text } from 'mdast'
import type { MediaCardData } from './media'
import type { TextStyleAttributes } from './text-style'

export interface LegacyMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface LegacyNode {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: LegacyMark[]
  content?: LegacyNode[]
}

export interface LegacyContentSource {
  editorType?: 'tiptap' | 'milkdown'
  milkContent?: string | null
  tiptapContentJson?: unknown
  tiptapContent?: string | null
}

const writer = unified().use(remarkStringify, { bullet: '-', fences: true, listItemIndent: 'one' }).use(remarkGfm).use(remarkDirective)
const textNode = (value: string): Text => ({ type: 'text', value })
const paragraph = (children: PhrasingContent[]): Paragraph => ({ type: 'paragraph', children })
const childrenOf = (node: LegacyNode): LegacyNode[] => Array.isArray(node.content) ? node.content.filter((child) => child && typeof child.type === 'string') : []
const rawText = (node: LegacyNode): string => node.type === 'hardBreak' ? '\n' : legacyString(node.text) + childrenOf(node).map(rawText).join('')
const markdownText = (node: RootContent): string => 'value' in node ? node.value : 'children' in node ? node.children.map(markdownText).join('') : ''

function documentValue(value: unknown): LegacyNode | null {
  let parsed = value
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { return null }
  }
  const node = legacyRecord(parsed)
  return node.type === 'doc' && (node.content === undefined || Array.isArray(node.content)) ? node as unknown as LegacyNode : null
}

function linkUrl(value: unknown): string {
  const url = legacyString(value).trim()
  if (/^(?:#|mailto:|tel:)/i.test(url) && !/[\u0000-\u001f\u007f<>\\]/.test(url)) return url
  return safeMediaUrl(url)
}

function inline(node: LegacyNode, inherited: TextStyleAttributes): PhrasingContent[] {
  if (node.type === 'hardBreak') return [{ type: 'break' }]
  const value = legacyString(node.text)
  if (!value) return []
  const marks = Array.isArray(node.marks) ? node.marks.filter((mark) => mark && typeof mark.type === 'string') : []
  let style = inherited
  for (const mark of marks) {
    if (mark.type === 'pastedStyle' || mark.type === 'textStyle') style = legacyTextStyle(mark.attrs, style)
    if (mark.type === 'underline') style = { ...style, underline: 'true' }
    if (mark.type === 'highlight') style = legacyTextStyle({ backgroundColor: mark.attrs?.color || '#fff3a3' }, style)
  }
  const code = marks.some((mark) => mark.type === 'code')
  const [, leading = '', middle = '', trailing = ''] = value.match(/^(\s*)([\s\S]*?)(\s*)$/) ?? []
  let nodes: PhrasingContent[] = code ? [{ type: 'inlineCode', value }] : middle ? [textNode(middle)] : []
  for (const mark of marks) {
    const type = mark.type === 'bold' ? 'strong' : mark.type === 'italic' ? 'emphasis' : mark.type === 'strike' ? 'delete' : null
    if (type && !code && nodes.length) nodes = [{ type, children: nodes }]
    if (mark.type === 'link') {
      const url = linkUrl(mark.attrs?.href)
      if (url && nodes.length) nodes = [{ type: 'link', url, children: nodes }]
    }
  }
  const attributes = textStyleToAttributes(style)
  if (Object.keys(attributes).length && nodes.length) nodes = [{ type: 'textDirective', name: 'text-style', attributes, children: nodes }]
  // Markdown keeps boundary whitespace outside formatting marks.
  return code ? nodes : [...(leading ? [textNode(leading)] : []), ...nodes, ...(trailing ? [textNode(trailing)] : [])]
}

function mediaNode(media: MediaCardData): Extract<BlockContent, { type: 'leafDirective' }> {
  return { type: 'leafDirective', name: 'media', attributes: mediaToAttributes(media), children: [] }
}

function mediaBlock(node: LegacyNode): BlockContent | null {
  const attrs = legacyRecord(node.attrs)
  if (node.type === 'image') {
    const src = legacyString(attrs.src)
    if (/^(?:uploading|blob):/i.test(src)) return mediaNode({ kind: 'upload', title: legacyString(attrs.alt), uploadId: src, status: 'failed' })
    return mediaNode({ kind: 'image', src, photoId: legacyString(attrs.photoId), title: legacyString(attrs.alt) || legacyString(attrs.title), caption: legacyString(attrs.caption), width: Number.parseFloat(String(attrs.width ?? '')) })
  }
  if (node.type === 'imageUploadPlaceholder') return mediaNode({ kind: 'upload', uploadId: legacyString(attrs.uploadId), title: legacyString(attrs.fileName), status: 'failed' })
  if (['mediaEmbed', 'musicEmbed', 'spotifyEmbed', 'iframe'].includes(node.type)) {
    const parsed = parseMediaEmbed(legacyString(attrs.url)) || parseMediaEmbed(legacyString(attrs.src))
    return mediaNode({
      kind: parsed?.kind ?? 'video',
      src: parsed?.src ?? (legacyString(attrs.url) || legacyString(attrs.src)),
      title: legacyString(attrs.title),
      embed: parsed?.embed ?? normalizeMediaEmbed({ src: attrs.src, height: attrs.height }),
    })
  }
  if (node.type === 'storyLinkCard') return mediaNode({ kind: 'link', src: legacyString(attrs.url) || `/story/${encodeURIComponent(legacyString(attrs.storyId))}`, title: legacyString(attrs.title), caption: [legacyString(attrs.summary), legacyString(attrs.date)].filter(Boolean).join('\n'), thumbnail: legacyString(attrs.coverUrl) })
  if (node.type === 'audio' || node.type === 'video') return mediaNode({ kind: node.type, src: legacyString(attrs.src), title: legacyString(attrs.title), thumbnail: legacyString(attrs.poster) })
  if (node.type === 'media_card') return mediaNode(normalizeMedia(attrs.media))
  return null
}

function aligned(nodes: BlockContent[], attrs: Record<string, unknown>): BlockContent[] {
  const align = attrs.textAlign ?? legacyCss(attrs.pastedStyle ?? attrs.style)['text-align']
  return nodes.length && ['left', 'center', 'right', 'justify'].includes(String(align))
    ? [{ type: 'containerDirective', name: 'block-style', attributes: { align: String(align) }, children: nodes }]
    : nodes
}

function textBlocks(node: LegacyNode, style: TextStyleAttributes): BlockContent[] {
  const result: BlockContent[] = []
  let pending: PhrasingContent[] = []
  const flush = () => {
    const level = Number(node.attrs?.level)
    const depth = level === 2 || level === 3 || level === 4 || level === 5 || level === 6 ? level : 1
    if (pending.length) result.push(node.type === 'heading' ? { type: 'heading', depth, children: pending } : paragraph(pending))
    pending = []
  }
  for (const child of childrenOf(node)) {
    if (child.type === 'text' || child.type === 'hardBreak') pending.push(...inline(child, style))
    else { flush(); result.push(...blocks([child], style)) }
  }
  flush()
  return result
}

function isPhrasing(node: RootContent): node is PhrasingContent {
  return ['text', 'strong', 'emphasis', 'delete', 'link', 'linkReference', 'image', 'imageReference', 'inlineCode', 'textDirective', 'break', 'html', 'footnoteReference'].includes(node.type)
}

function table(node: LegacyNode, style: TextStyleAttributes): BlockContent[] {
  const rows = childrenOf(node).filter((row) => row.type === 'tableRow')
  if (!rows.length) return []
  const grid: PhrasingContent[][][] = []
  const align: AlignType[] = []
  const media: BlockContent[] = []
  const cellInline = (nodes: RootContent[]): PhrasingContent[] => nodes.flatMap((entry): PhrasingContent[] => {
    if (entry.type === 'leafDirective') { media.push(entry); return [textNode(entry.attributes?.title || entry.attributes?.kind || '')] }
    if (entry.type === 'paragraph' || entry.type === 'heading' || entry.type === 'containerDirective' || entry.type === 'blockquote') return [...cellInline(entry.children ?? []), textNode(' ')]
    if (entry.type === 'break') return [textNode(' ')]
    if (entry.type === 'code') return [{ type: 'inlineCode', value: (entry.value ?? '').replace(/\n/g, ' ') }]
    if (isPhrasing(entry)) return [entry]
    return 'children' in entry ? cellInline(entry.children) : []
  })
  rows.forEach((row, rowIndex) => {
    grid[rowIndex] ??= []
    let column = 0
    for (const cell of childrenOf(row)) {
      while (grid[rowIndex][column]) column += 1
      const attrs = legacyRecord(cell.attrs)
      const colspan = Math.max(1, Math.min(100, Math.trunc(Number(attrs.colspan)) || 1))
      const rowspan = Math.max(1, Math.min(rows.length - rowIndex, Math.trunc(Number(attrs.rowspan)) || 1))
      grid[rowIndex][column] = cellInline(blocks(childrenOf(cell), legacyTextStyle(attrs, style)))
      const cellAlign = attrs.textAlign ?? legacyCss(attrs.style)['text-align']
      align[column] ??= cellAlign === 'center' || cellAlign === 'right' || cellAlign === 'left' ? cellAlign : null
      for (let down = 0; down < rowspan; down++) for (let across = 0; across < colspan; across++) {
        grid[rowIndex + down] ??= []
        if (down || across) grid[rowIndex + down][column + across] = []
      }
      column += colspan
    }
  })
  const width = Math.max(...grid.map((row) => row.length))
  if (!width) return []
  if (!childrenOf(rows[0]).some((cell) => cell.type === 'tableHeader')) grid.unshift([])
  return [{ type: 'table', align: Array.from({ length: width }, (_, index) => align[index] ?? null), children: grid.map((row) => ({ type: 'tableRow', children: Array.from({ length: width }, (_, index) => ({ type: 'tableCell', children: row[index] ?? [] })) })) }, ...media]
}

function blocks(nodes: LegacyNode[], inherited: TextStyleAttributes = { font: null, size: null }): BlockContent[] {
  const result: BlockContent[] = []
  let pending: PhrasingContent[] = []
  const flush = () => {
    if (pending.some((node) => markdownText(node).trim())) result.push(paragraph(pending))
    pending = []
  }
  for (const node of nodes) {
    if (node.type === 'text' || node.type === 'hardBreak') { pending.push(...inline(node, inherited)); continue }
    flush()
    const attrs = legacyRecord(node.attrs)
    const style = legacyTextStyle(attrs, inherited)
    const media = mediaBlock(node)
    let converted: BlockContent[]
    if (media) converted = [media]
    else if (node.type === 'paragraph' || node.type === 'heading') converted = textBlocks(node, style)
    else if (node.type === 'codeBlock') converted = [{ type: 'code', lang: legacyString(attrs.language).replace(/[^\w#+.-]/g, ''), value: rawText(node) }]
    else if (node.type === 'horizontalRule') converted = [{ type: 'thematicBreak' }]
    else if (node.type === 'blockquote') converted = [{ type: 'blockquote', children: blocks(childrenOf(node), style) }]
    else if (node.type === 'table') converted = table(node, style)
    else if (['bulletList', 'orderedList', 'taskList'].includes(node.type)) converted = [{
      type: 'list', ordered: node.type === 'orderedList', start: Math.max(1, Number(attrs.start) || 1), spread: false,
      children: childrenOf(node).map((item) => ({ type: 'listItem', spread: false, ...(node.type === 'taskList' || item.type === 'taskItem' ? { checked: item.attrs?.checked === true } : {}), children: blocks(childrenOf(item), legacyTextStyle(item.attrs, style)) })),
    }]
    else if (childrenOf(node).length) converted = blocks(childrenOf(node), style)
    else if (node.type === 'doc' || node.type === 'div') converted = []
    else converted = [{ type: 'code', lang: 'json', value: JSON.stringify(node, null, 2) }]
    result.push(...aligned(converted, attrs))
  }
  flush()
  return result
}

export function convertTipTapToMarkdown(value: unknown): string {
  const document = documentValue(value)
  return document ? writer.stringify({ type: 'root', children: blocks(childrenOf(document)) }) : ''
}

/** Reading Milkdown never converts another editor's body, including an empty saved body. */
export function getMilkdownContent(source: LegacyContentSource): string {
  return source.editorType === 'milkdown' ? source.milkContent ?? '' : ''
}

/** Called only after the author explicitly chooses to convert the TipTap source. */
export function convertToMilkdown(source: Pick<LegacyContentSource, 'tiptapContent' | 'tiptapContentJson'>): string {
  const document = documentValue(source.tiptapContentJson) ?? documentValue(source.tiptapContent)
  if (document) return convertTipTapToMarkdown(document)
  const content = source.tiptapContent ?? ''
  if (/^\s*<(?:!doctype|html|body|p|h[1-6]|div|section|article|blockquote|ul|ol|table|figure|img|iframe|audio|video|span|strong|em|b|i|u|a|pre|hr)\b/i.test(content)) {
    return convertTipTapToMarkdown(legacyHtmlDocument(content))
  }
  return content
}
