import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkDirective from 'remark-directive'
import { normalizeMediaEmbed, parseMediaEmbed } from './media-embed'
import { safeMediaUrl } from './media-url'
import type { MediaEmbedData } from './media-embed'

export { safeMediaUrl } from './media-url'

export const MEDIA_KINDS = ['image', 'gallery', 'video', 'audio', 'link', 'file'] as const
export type MediaKind = typeof MEDIA_KINDS[number]

export interface MediaImage {
  src: string
  alt?: string | null
  photoId?: string
  /**
   * 拼图（画廊）里的待上传项：并进拼图时保留 uploadId / status，
   * 渲染时按 uploadId 现取本地预览图，上传完成后由编辑器原地换成正式图片。
   * 没有 src 而带 uploadId 即「这一格还没上传」。
   */
  uploadId?: string
  status?: MediaCardData['status']
}

export interface MediaCardData {
  kind: MediaKind | 'upload'
  src?: string
  title?: string
  caption?: string
  photoId?: string
  images?: MediaImage[]
  embed?: MediaEmbedData
  width?: number
  thumbnail?: string
  uploadId?: string
  /**
   * 占位卡状态（仅 kind='upload' 有意义）：
   * - `pending`  素材库里选好但还没开始上传（编辑器素材库的待传项插入的占位）
   * - `uploading` 上传进行中
   * - `failed`   上传失败，需移除卡片重来
   */
  status?: 'pending' | 'uploading' | 'failed'
}

export type MediaUrlResolver = (src: string, photoId?: string) => string

export interface MarkdownTree {
  type: string
  // mdast/mdx 的 JSX 节点 name 为 string | null，这里必须放宽才能整体结构兼容
  name?: string | null
  value?: string
  alt?: string | null
  attributes?: Record<string, string | null | undefined> | null
  children?: MarkdownTree[]
  data?: object
}

const parser = unified().use(remarkParse).use(remarkDirective)

export function walkMarkdown(node: MarkdownTree, visit: (node: MarkdownTree) => void) {
  visit(node)
  node.children?.forEach((child) => walkMarkdown(child, visit))
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function normalizeMedia(value: unknown): MediaCardData {
  const input = record(value)
  const kind = input.kind === 'upload' || MEDIA_KINDS.includes(input.kind as MediaKind)
    ? input.kind as MediaCardData['kind']
    : 'link'
  const supportsEmbed = kind === 'audio' || kind === 'video' || kind === 'link'
  const parsed = supportsEmbed ? parseMediaEmbed(text(input.src)) : null
  const embed = supportsEmbed ? parsed?.embed ?? normalizeMediaEmbed(input.embed) : undefined
  const width = typeof input.width === 'number' || typeof input.width === 'string' ? Number(input.width) : 0
  return {
    kind: parsed?.kind ?? kind,
    src: parsed?.src ?? safeMediaUrl(text(input.src)),
    title: text(input.title) || parsed?.title || '',
    caption: text(input.caption),
    photoId: text(input.photoId),
    ...(embed ? { embed } : {}),
    ...(kind === 'image' && Number.isFinite(width) && width > 0 && width <= 4096 ? { width: Math.round(width) } : {}),
    ...(safeMediaUrl(text(input.thumbnail)) ? { thumbnail: safeMediaUrl(text(input.thumbnail)) } : {}),
    ...(Array.isArray(input.images) ? {
      images: input.images.map((entry): MediaImage => {
        const image = record(entry)
        const uploadId = text(image.uploadId)
        return {
          src: safeMediaUrl(text(image.src)),
          alt: text(image.alt),
          photoId: text(image.photoId),
          // 拼图里的待上传项没有 src，靠 uploadId 现取预览图；三态与占位卡同口径
          ...(uploadId ? {
            uploadId,
            status: image.status === 'failed' ? 'failed' : image.status === 'pending' ? 'pending' : 'uploading',
          } : {}),
        }
      }).filter((image) => image.src || image.photoId || image.uploadId),
    } : {}),
    ...(kind === 'upload' ? {
      uploadId: text(input.uploadId),
      // 三态都要保留：历史上只区分 failed / 其余（当作 uploading），
      // 把 pending 也归成 uploading 会让「还没开始上传」显示成「正在上传」。
      status: input.status === 'failed' ? 'failed' : input.status === 'pending' ? 'pending' : 'uploading',
    } : {}),
  }
}

export function mediaToAttributes(value: MediaCardData): Record<string, string> {
  const media = normalizeMedia(value)
  const attrs: Record<string, string> = { kind: media.kind }
  for (const key of ['src', 'title', 'caption', 'photoId', 'uploadId', 'status', 'thumbnail'] as const) {
    if (media[key]) attrs[key] = media[key]
  }
  if (media.kind === 'gallery') attrs.images = JSON.stringify(media.images ?? [])
  if (media.embed) attrs.embed = JSON.stringify(media.embed)
  if (media.width) attrs.width = String(media.width)
  return attrs
}

export function mediaFromAttributes(value: unknown): MediaCardData {
  const attrs = record(value)
  let images: unknown = []
  let embed: unknown
  if (typeof attrs.images === 'string') {
    try { images = JSON.parse(attrs.images) } catch { /* Invalid galleries render an empty card. */ }
  }
  if (typeof attrs.embed === 'string') {
    try { embed = JSON.parse(attrs.embed) } catch { /* Invalid embeds fall back to the source link. */ }
  }
  return normalizeMedia({ ...attrs, images, embed })
}

/** 能并进拼图（画廊卡）的媒体类型：只有图片族（图片卡 / 画廊卡 / 待上传占位卡）。 */
export function isGalleryMedia(kind: MediaCardData['kind']): boolean {
  return kind === 'image' || kind === 'gallery' || kind === 'upload'
}

/** 把一张单图媒体转成拼图里的一格（待上传占位卡保留 uploadId / status）。 */
export function mediaGalleryEntry(media: MediaCardData): MediaImage {
  return {
    src: media.src ?? '',
    alt: media.title || undefined,
    photoId: media.photoId || undefined,
    ...(media.kind === 'upload' && media.uploadId ? { uploadId: media.uploadId, status: media.status ?? 'pending' } : {}),
  }
}

/**
 * 拖拽拼图：把 `dragged` 并进 `target`，返回合并后的画廊卡（不能合并时返回 null）。
 *
 * `insertAt` 是拖放点在目标里的落位（第几格之前），缺省追加到末尾。
 * 标题 / 说明沿用落点那一张卡：拖动只改排版，不该顺手改掉这段内容的文案。
 * 待上传占位卡也能并进来（拼图里的待传格），上传完成后由编辑器原地换成正式图片。
 */
export function mergeMediaCards(target: MediaCardData, dragged: MediaCardData, insertAt?: number): MediaCardData | null {
  if (!isGalleryMedia(target.kind) || !isGalleryMedia(dragged.kind)) return null
  const current = target.kind === 'gallery' ? target.images ?? [] : [mediaGalleryEntry(target)]
  const incoming = dragged.kind === 'gallery' ? dragged.images ?? [] : [mediaGalleryEntry(dragged)]
  if (!current.length || !incoming.length) return null
  const index = Math.max(0, Math.min(insertAt ?? current.length, current.length))
  const images = [...current.slice(0, index), ...incoming, ...current.slice(index)]
  if (images.length < 2) return null
  return { kind: 'gallery', title: target.title, caption: target.caption, images }
}

/**
 * 拼图列数：按张数给一个「看起来像拼图」的默认排布，由图片数量决定，不额外存属性。
 * 2 张双列、3 张三列、4 张 2×2、5-6 张 3 列、更多 4 列。
 */
export function galleryColumns(count: number): number {
  if (count <= 1) return 1
  if (count === 2) return 2
  if (count === 3) return 3
  if (count === 4) return 2
  if (count <= 6) return 3
  return 4
}

/**
 * 拼图在公众号里的排布。**用表格，不用 grid/flex**。
 *
 * 依据是实测：公众号编辑器会吞掉外层 div 上的 `display:grid`（拼图粘过去几格各自成行、还因为被抹平了
 * 图片外边距而没有间隙）。表格是唯一同时扛得住这两种改写的形式 —— 编辑器无论「按白名单过滤 CSS 属性值」
 * 还是「拆掉/规整 div」，都不会拆表格，`td` 的百分比宽度与 `padding` 也一律保留。
 * 列数沿用 `galleryColumns`（与页面渲染同一来源）；间隙由 `td` 的 `padding` 给（不依赖 `gap` / `border-spacing`）。
 * 代价：公众号里拿不到 4:3 铺满裁切（那要靠 `aspect-ratio`/`object-fit`），所以这里只统一宽度、
 * 高度按原图比例 —— 同一行的图片因此可能不等高（顶端对齐）。
 */
const WECHAT_GALLERY_TABLE_STYLE = 'width:100%;table-layout:fixed;border-collapse:collapse;margin:0'
const WECHAT_GALLERY_CELL_PADDING = '2px'
const WECHAT_GALLERY_TILE_IMAGE_STYLE = 'display:block;width:100%;height:auto;margin:0'
const WECHAT_MEDIA_CAPTION_STYLE = 'margin:0;padding:10px 16px;border-top:1px solid #ddd;font-size:13px;line-height:1.6;color:#777'
const WECHAT_MEDIA_FIGURE_STYLE = 'margin:20px 0'

/** 追加式合并 style：写在后面的同名声明胜出（公众号里没有选择器可以提权，只能靠顺序）。 */
function appendInlineStyle(element: HTMLElement, css: string) {
  const current = (element.getAttribute('style') ?? '').trim().replace(/;+$/, '')
  element.setAttribute('style', current ? `${current};${css}` : css)
}

/**
 * 把媒体卡的排版折算成内联样式（供公众号复制用）。
 *
 * 调用时机是 `formatWechatArticleHtml` 的 `decorate` 钩子 —— 那时按标签的规则已经注入完、
 * class 也已经摘掉，能依赖的只剩保留下来的 `data-media-kind` 与标签结构；追加在最后也正好
 * 压过按标签给的默认值（表格相关的 `td` 默认带边框与 8px 内边距，网格图片要覆盖 `img` 默认的
 * `height:auto;margin:12px auto`）。
 *
 * 只管「类名驱动」的那部分排版：单图卡本身就是一个 `<img>`（已有按标签注入的样式），
 * 播放器 / 链接 / 文件卡是独立区块、不参与并排，都不在这里处理。
 */
export function decorateMilkdownMediaForWechat(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('figure[data-media-kind]').forEach((figure) => {
    appendInlineStyle(figure, WECHAT_MEDIA_FIGURE_STYLE)
    figure.querySelectorAll<HTMLElement>('figcaption').forEach((caption) => appendInlineStyle(caption, WECHAT_MEDIA_CAPTION_STYLE))
    if (figure.getAttribute('data-media-kind') !== 'gallery') return
    // 拼图：figure 的直接子 div 是网格容器（覆盖操作层只在编辑器里渲染，复制侧没有）
    const grid = figure.querySelector<HTMLElement>(':scope > div')
    if (!grid) return
    const tiles = Array.from(grid.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
    if (!tiles.length) return
    grid.replaceWith(buildWechatGalleryTable(grid.ownerDocument, tiles))
  })
}

/** 把拼图各格摆进一张表格：列数按张数（与页面同一个 `galleryColumns`），多出来的另起一行。 */
function buildWechatGalleryTable(document: Document, tiles: HTMLElement[]): HTMLElement {
  const columns = galleryColumns(tiles.length)
  const table = document.createElement('table')
  appendInlineStyle(table, WECHAT_GALLERY_TABLE_STYLE)
  const body = document.createElement('tbody')
  table.appendChild(body)
  for (let start = 0; start < tiles.length; start += columns) {
    const row = document.createElement('tr')
    body.appendChild(row)
    tiles.slice(start, start + columns).forEach((tile) => {
      const cell = document.createElement('td')
      // 百分比宽度兼作固定表格布局的列权重；padding 就是格与格之间的间隙
      appendInlineStyle(cell, `width:${(100 / columns).toFixed(4)}%;padding:${WECHAT_GALLERY_CELL_PADDING};border:0;vertical-align:top`)
      const image = tile.querySelector<HTMLElement>('img')
      if (image) {
        appendInlineStyle(image, WECHAT_GALLERY_TILE_IMAGE_STYLE)
        cell.appendChild(image)
      } else {
        // 取不到图的那一格（中性缺图位）整格搬过来，别把内容丢掉
        cell.appendChild(tile)
      }
      row.appendChild(cell)
    })
  }
  return table
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;')
}

/** A remark directive, parsed and serialized by Milkdown's Markdown pipeline. */
export function buildMediaMarkdown(media: MediaCardData): string {
  const attrs = Object.entries(mediaToAttributes(media)).map(([key, value]) => `${key}="${escapeAttribute(value)}"`).join(' ')
  return `\n\n::media{${attrs}}\n\n`
}

export function getMilkdownMedia(markdown: string): MediaCardData[] {
  const media: MediaCardData[] = []
  walkMarkdown(parser.parse(markdown) as unknown as MarkdownTree, (node) => {
    if (node.type === 'leafDirective' && node.name === 'media') media.push(mediaFromAttributes(node.attributes))
  })
  return media
}

export function getMilkdownPhotoIds(markdown: string): Set<string> {
  const ids = new Set<string>()
  for (const media of getMilkdownMedia(markdown)) {
    if (media.photoId) ids.add(media.photoId)
    media.images?.forEach((image) => { if (image.photoId) ids.add(image.photoId) })
  }
  return ids
}

export function hasPendingMilkdownUploads(markdown: string): boolean {
  return getMilkdownMedia(markdown).some((media) => media.kind === 'upload'
    || Boolean(media.images?.some((image) => !image.src && image.uploadId)))
}

/**
 * 正文里所有占位卡的 uploadId（**含已失败/上传中的**）。
 *
 * 编辑器素材库用它把「已排进正文」的待传项标成已使用：待传项的 id 就是插卡时的 uploadId，
 * 所以 `ids.has(pending.id)` 即「这张待传图已在正文里占位」。
 *
 * 不能改用 getMilkdownPhotoIds：占位卡没有 photoId（上传成功后才写进去），
 * 靠它判断会在上传完成前后给出相反结论。
 */
export function getMilkdownUploadIds(markdown: string): Set<string> {
  const ids = new Set<string>()
  for (const media of getMilkdownMedia(markdown)) {
    if (media.kind === 'upload' && media.uploadId) ids.add(media.uploadId)
    // 并进拼图的待传项同样是「已排进正文」，素材库面板要一起标成已使用
    media.images?.forEach((image) => { if (image.uploadId) ids.add(image.uploadId) })
  }
  return ids
}

export function getMilkdownText(markdown: string): string {
  const parts: string[] = []
  walkMarkdown(parser.parse(markdown) as unknown as MarkdownTree, (node) => {
    if (node.type === 'text' || node.type === 'code' || node.type === 'inlineCode') parts.push(node.value ?? '')
    if (node.type === 'image') parts.push(node.alt ?? '')
    if (node.type === 'leafDirective' && node.name === 'media') {
      const media = mediaFromAttributes(node.attributes)
      parts.push(media.title ?? '', media.caption ?? '')
    }
  })
  return parts.filter(Boolean).join(' ').trim()
}

export function mediaEmbedUrl(src: string): string | null {
  return parseMediaEmbed(src)?.embed.src ?? null
}
