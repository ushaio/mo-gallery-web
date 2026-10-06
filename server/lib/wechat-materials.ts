import 'server-only'
import { db } from '~/server/lib/db'
import {
  WECHAT_API_BASE,
  WeChatBindingError,
  getWeChatAccessToken,
  getWeChatEgressIp,
  requestWeChatApi,
  weChatErrorFromCode,
} from '~/server/lib/wechat'

/**
 * 微信公众号素材管理（站点级）。
 *
 * 素材接口同样要求调用方出口 IP 在白名单内，AppSecret 也只由服务端持有，
 * 所以一律由服务端代理：桌面端只拿到素材元数据与内容字节。
 *
 * 两个微信侧硬限制决定了这里的形状：
 * 1. **没有临时素材列表接口** —— 官方文档在「获取永久素材列表」里明确写了
 *    「临时素材无法通过本接口获取」，且临时素材只有 3 天寿命。因此「临时素材」的
 *    列表只能由我们自己记录本服务端上传过的 media_id（见 WECHAT_TEMPORARY_MATERIALS_SETTING_KEY）。
 * 2. 永久图片素材的回包里虽然有 `url`，但官方说明「腾讯系域名外使用，图片将被屏蔽」，
 *    所以预览一律走服务端取字节，绝不把这个 url 交给前端直连。
 */

/** 临时素材索引（本服务端上传过的临时素材）的落库键。 */
export const WECHAT_TEMPORARY_MATERIALS_SETTING_KEY = 'wechat_temporary_materials'

/** 微信临时素材寿命：3 天。 */
const TEMPORARY_MATERIAL_TTL_MS = 3 * 24 * 60 * 60 * 1000
/** 索引保留上限：过期后再留 7 天，避免无限增长（过期条目仍会展示为「已过期」）。 */
const TEMPORARY_MATERIAL_KEEP_AFTER_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000
/** 内容下载超时：字节流比 JSON 慢得多。 */
const WECHAT_CONTENT_TIMEOUT_MS = 30_000
/** 素材列表分页上限：微信 `batchget_material` 的 count 最大是 20。 */
const MATERIAL_PAGE_MAX = 20
const DEFAULT_PAGE_SIZE = 20

export type WeChatMaterialKind = 'permanent' | 'temporary'
export type WeChatMaterialType = 'image' | 'voice' | 'video' | 'news'

const MATERIAL_TYPES = new Set<WeChatMaterialType>(['image', 'voice', 'video', 'news'])

/** 微信对素材体积的硬限制（字节）；news 不走文件上传，故为 0。 */
const MATERIAL_MAX_BYTES: Record<WeChatMaterialType, number> = {
  image: 10 * 1024 * 1024,
  voice: 2 * 1024 * 1024,
  video: 10 * 1024 * 1024,
  news: 0,
}

/** 上传允许的扩展名（与公众平台官网一致）。 */
const MATERIAL_EXTENSIONS: Record<WeChatMaterialType, string[]> = {
  image: ['bmp', 'png', 'jpeg', 'jpg', 'gif'],
  voice: ['amr', 'mp3'],
  video: ['mp4'],
  news: [],
}

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  amr: 'audio/amr',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
}

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/webp': 'webp',
  'audio/amr': 'amr',
  'audio/mpeg': 'mp3',
  'video/mp4': 'mp4',
}

/**
 * 素材类型对应的兜底 MIME。
 *
 * 微信下载素材时**可能完全不返回 `Content-Type`**（实测 2026-10-04：永久图片
 * `material/get_material` 只回 `Content-Disposition` 与 `Content-Length`），所以响应头
 * 不能当作唯一依据，必要时按字节魔数或素材类型自行判定。
 */
const DEFAULT_CONTENT_TYPE_BY_TYPE: Record<WeChatMaterialType, string> = {
  image: 'image/jpeg',
  voice: 'audio/mpeg',
  video: 'video/mp4',
  news: 'application/json',
}

function sniffImageContentType(body: ArrayBuffer): string | undefined {
  const bytes = new Uint8Array(body.slice(0, 12))
  const startsWith = (signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte)

  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return 'image/gif'
  if (startsWith([0x42, 0x4d])) return 'image/bmp'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp'
  return undefined
}

/** 具体类型（`image/*`、`audio/*`）照信；空值或通用 `application/octet-stream` 时自己判定。 */
function resolveContentType(content: WeChatMaterialContent, type: WeChatMaterialType): string {
  const current = content.contentType.trim().toLowerCase()
  if (current && current !== 'application/octet-stream') return content.contentType
  if (type === 'image') return sniffImageContentType(content.body) ?? DEFAULT_CONTENT_TYPE_BY_TYPE.image
  return DEFAULT_CONTENT_TYPE_BY_TYPE[type]
}

export interface WeChatMaterialItem {
  mediaId: string
  kind: WeChatMaterialKind
  type: WeChatMaterialType
  name: string
  title?: string
  description?: string
  updateTime: string | null
  /** 临时素材：上传时间（ISO8601）。 */
  uploadedAt?: string
  /** 临时素材：失效时间（ISO8601，上传后 3 天）。 */
  expiresAt?: string
  /** 临时素材：是否已过期（过期后微信侧取不到内容）。 */
  expired?: boolean
  /** 临时素材：上传时的字节数。 */
  size?: number
  /** 能否通过内容接口取字节（news 与已过期的临时素材为 false）。 */
  hasContent: boolean
}

export interface WeChatMaterialPage {
  kind: WeChatMaterialKind
  /** 临时素材不按类型过滤时为 'all'；永久素材恒为具体类型。 */
  type: WeChatMaterialType | 'all'
  offset: number
  count: number
  total: number
  hasMore: boolean
  items: WeChatMaterialItem[]
}

export interface WeChatMaterialCapability {
  ok: boolean
  errcode: number
  errmsg: string
  counts: Partial<Record<WeChatMaterialType, number>>
  checkedAt: string
}

export interface WeChatMaterialContent {
  body: ArrayBuffer
  contentType: string
  fileName: string
}

interface TemporaryMaterialRecord {
  mediaId: string
  type: WeChatMaterialType
  name: string
  size: number
  contentType: string
  uploadedAt: string
  expiresAt: string
}

interface TemporaryMaterialStore {
  items: TemporaryMaterialRecord[]
}

interface WeChatBatchGetMaterialResponse {
  total_count?: number
  item_count?: number
  item?: Array<Record<string, unknown>>
  errcode?: number
  errmsg?: string
}

interface WeChatMediaUploadResponse {
  media_id?: string
  url?: string
  type?: string
  created_at?: number
  errcode?: number
  errmsg?: string
}

interface WeChatMaterialCountResponse {
  image_count?: number
  voice_count?: number
  video_count?: number
  news_count?: number
  errcode?: number
  errmsg?: string
}

function normalizeKind(raw: string | undefined): WeChatMaterialKind {
  const value = raw?.trim().toLowerCase()
  if (!value) return 'permanent'
  if (value !== 'permanent' && value !== 'temporary') {
    throw new WeChatBindingError(
      'WECHAT_MATERIAL_KIND_INVALID',
      '素材种类不支持（可选 permanent / temporary）',
      400,
    )
  }
  return value
}

function normalizeMaterialType(
  raw: string | undefined,
  fallback: WeChatMaterialType | null,
): WeChatMaterialType | null {
  const value = raw?.trim().toLowerCase()
  if (!value) return fallback
  if (!MATERIAL_TYPES.has(value as WeChatMaterialType)) {
    throw new WeChatBindingError(
      'WECHAT_MATERIAL_TYPE_INVALID',
      '素材类型不支持（可选 image / voice / video）',
      400,
    )
  }
  return value as WeChatMaterialType
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.trunc(value), min), max)
}

function toIsoFromSeconds(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return new Date(value * 1000).toISOString()
}

function pickString(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  return typeof value === 'string' ? value.trim() : ''
}

function extensionOf(fileName: string): string {
  const matched = /\.([a-zA-Z0-9]+)$/.exec(fileName.trim())
  return matched ? matched[1].toLowerCase() : ''
}

function fileNameFromDisposition(disposition: string): string {
  const matched = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition)
  if (!matched) return ''
  try {
    return decodeURIComponent(matched[1].trim().replace(/"$/, ''))
  } catch {
    return matched[1].trim().replace(/"$/, '')
  }
}

function isTemporaryMaterialRecord(value: unknown): value is TemporaryMaterialRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<TemporaryMaterialRecord>
  return (
    typeof record.mediaId === 'string' &&
    record.mediaId.length > 0 &&
    typeof record.type === 'string' &&
    MATERIAL_TYPES.has(record.type as WeChatMaterialType) &&
    typeof record.name === 'string' &&
    typeof record.size === 'number' &&
    typeof record.uploadedAt === 'string' &&
    typeof record.expiresAt === 'string'
  )
}

async function readTemporaryMaterials(): Promise<TemporaryMaterialStore> {
  try {
    const row = await db.setting.findUnique({ where: { key: WECHAT_TEMPORARY_MATERIALS_SETTING_KEY } })
    if (!row?.value) return { items: [] }

    const parsed = JSON.parse(row.value) as Partial<TemporaryMaterialStore>
    const raw = Array.isArray(parsed.items) ? parsed.items : []
    // 过期超过保留期的条目直接丢弃（读侧过滤，写侧顺手压实）。
    const cutoff = Date.now() - TEMPORARY_MATERIAL_KEEP_AFTER_EXPIRY_MS
    const items = raw.filter(isTemporaryMaterialRecord).filter((item) => {
      const expiresAt = Date.parse(item.expiresAt)
      return Number.isNaN(expiresAt) || expiresAt > cutoff
    })
    return { items }
  } catch (error) {
    console.warn('Stored WeChat temporary materials cannot be read:', error)
    return { items: [] }
  }
}

async function writeTemporaryMaterials(store: TemporaryMaterialStore): Promise<void> {
  const value = JSON.stringify(store)
  try {
    await db.setting.upsert({
      where: { key: WECHAT_TEMPORARY_MATERIALS_SETTING_KEY },
      update: { value },
      create: { key: WECHAT_TEMPORARY_MATERIALS_SETTING_KEY, value },
    })
  } catch (error) {
    console.error('Save WeChat temporary materials error:', error)
    throw new WeChatBindingError('WECHAT_STORE_FAILED', '临时素材记录保存失败，请重试', 500)
  }
}

function toPermanentItem(raw: Record<string, unknown>, type: WeChatMaterialType): WeChatMaterialItem {
  const name = pickString(raw, 'name')
  const title = pickString(raw, 'title')
  const description = pickString(raw, 'description') || pickString(raw, 'introduction')
  return {
    mediaId: pickString(raw, 'media_id'),
    kind: 'permanent',
    type,
    name: name || title,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    updateTime: toIsoFromSeconds(raw.update_time),
    hasContent: type !== 'news',
  }
}

function toTemporaryItem(record: TemporaryMaterialRecord): WeChatMaterialItem {
  const expiresAt = Date.parse(record.expiresAt)
  const expired = !Number.isNaN(expiresAt) && expiresAt <= Date.now()
  return {
    mediaId: record.mediaId,
    kind: 'temporary',
    type: record.type,
    name: record.name,
    updateTime: null,
    uploadedAt: record.uploadedAt,
    expiresAt: record.expiresAt,
    expired,
    size: record.size,
    hasContent: !expired,
  }
}

async function listPermanentMaterials(
  type: WeChatMaterialType,
  offset: number,
  count: number,
): Promise<WeChatMaterialPage> {
  const token = await getWeChatAccessToken()
  const body = await requestWeChatApi<WeChatBatchGetMaterialResponse>(
    `${WECHAT_API_BASE}/cgi-bin/material/batchget_material?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, offset, count }),
    },
  )

  if (typeof body.errcode === 'number' && body.errcode !== 0) {
    throw weChatErrorFromCode(body.errcode, body.errmsg ?? '', await getWeChatEgressIp())
  }

  const items = (body.item ?? []).map((raw) => toPermanentItem(raw, type))
  const total = typeof body.total_count === 'number' ? body.total_count : items.length
  return {
    kind: 'permanent',
    type,
    offset,
    count,
    total,
    hasMore: offset + items.length < total,
    items,
  }
}

async function listTemporaryMaterials(
  type: WeChatMaterialType | null,
  offset: number,
  count: number,
): Promise<WeChatMaterialPage> {
  const store = await readTemporaryMaterials()
  const filtered = store.items
    .filter((item) => !type || item.type === type)
    .sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt))

  const items = filtered.slice(offset, offset + count).map(toTemporaryItem)
  const total = filtered.length
  return {
    kind: 'temporary',
    type: type ?? 'all',
    offset,
    count,
    total,
    hasMore: offset + items.length < total,
    items,
  }
}

export interface WeChatMaterialListQuery {
  kind?: string
  type?: string
  offset?: number
  count?: number
}

export async function listWeChatMaterials(query: WeChatMaterialListQuery): Promise<WeChatMaterialPage> {
  const kind = normalizeKind(query.kind)
  const offset = clampInt(query.offset, 0, 0, 100_000)
  const count = clampInt(query.count, DEFAULT_PAGE_SIZE, 1, MATERIAL_PAGE_MAX)

  if (kind === 'temporary') {
    // 临时素材是本地索引，类型可选（不传 = 全部类型）。
    return listTemporaryMaterials(normalizeMaterialType(query.type, null), offset, count)
  }

  const type = normalizeMaterialType(query.type, 'image') ?? 'image'
  return listPermanentMaterials(type, offset, count)
}

/**
 * 永久素材「能力自检」。
 *
 * 未认证订阅号（如个人主体）对素材类接口可能整体没有权限（48001），
 * 这类「微信明确拒绝」不抛异常，而是把 errcode/errmsg 原样交给界面展示，
 * 让用户看到真实原因而不是含混的「加载失败」。网络层失败仍然抛出。
 */
export async function getWeChatMaterialCapability(): Promise<WeChatMaterialCapability> {
  const token = await getWeChatAccessToken()
  const checkedAt = new Date().toISOString()
  const body = await requestWeChatApi<WeChatMaterialCountResponse>(
    `${WECHAT_API_BASE}/cgi-bin/material/get_materialcount?access_token=${encodeURIComponent(token)}`,
  )

  if (typeof body.errcode === 'number' && body.errcode !== 0) {
    return { ok: false, errcode: body.errcode, errmsg: body.errmsg ?? '', counts: {}, checkedAt }
  }

  const counts: Partial<Record<WeChatMaterialType, number>> = {}
  if (typeof body.image_count === 'number') counts.image = body.image_count
  if (typeof body.voice_count === 'number') counts.voice = body.voice_count
  if (typeof body.video_count === 'number') counts.video = body.video_count
  if (typeof body.news_count === 'number') counts.news = body.news_count

  return { ok: true, errcode: 0, errmsg: '', counts, checkedAt }
}

export interface WeChatMaterialUploadInput {
  kind?: string
  type?: string
  file: Blob
  fileName: string
  title?: string
  introduction?: string
}

export async function uploadWeChatMaterial(input: WeChatMaterialUploadInput): Promise<WeChatMaterialItem> {
  const kind = normalizeKind(input.kind)
  const type = normalizeMaterialType(input.type, 'image') ?? 'image'
  if (type === 'news') {
    throw new WeChatBindingError('WECHAT_MATERIAL_TYPE_INVALID', '图文素材请到公众平台官网维护', 400)
  }

  const fileName = input.fileName.trim() || `wechat-material.${type}`
  const size = typeof input.file.size === 'number' ? input.file.size : 0
  if (size <= 0) {
    throw new WeChatBindingError('WECHAT_MATERIAL_FILE_REQUIRED', '请选择要上传的文件', 400)
  }

  const maxBytes = MATERIAL_MAX_BYTES[type]
  if (size > maxBytes) {
    throw new WeChatBindingError(
      'WECHAT_MATERIAL_TOO_LARGE',
      `${type === 'voice' ? '语音' : type === 'video' ? '视频' : '图片'}素材不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB`,
      400,
    )
  }

  const allowedExtensions = MATERIAL_EXTENSIONS[type]
  const extension = extensionOf(fileName)
  if (allowedExtensions.length > 0 && !allowedExtensions.includes(extension)) {
    throw new WeChatBindingError(
      'WECHAT_MATERIAL_FORMAT_INVALID',
      `该类型素材只支持 ${allowedExtensions.join(' / ')} 格式`,
      400,
    )
  }

  const token = await getWeChatAccessToken()
  const form = new FormData()
  form.append('media', input.file, fileName)
  if (kind === 'permanent' && type === 'video') {
    // 永久视频素材：微信要求额外带一个 description 文本部件（JSON 串）。
    form.append(
      'description',
      JSON.stringify({
        title: input.title?.trim() || fileName,
        introduction: input.introduction?.trim() ?? '',
      }),
    )
  }

  const url =
    kind === 'permanent'
      ? `${WECHAT_API_BASE}/cgi-bin/material/add_material?access_token=${encodeURIComponent(token)}&type=${type}`
      : `${WECHAT_API_BASE}/cgi-bin/media/upload?access_token=${encodeURIComponent(token)}&type=${type}`

  const body = await requestWeChatApi<WeChatMediaUploadResponse>(url, { method: 'POST', body: form })
  if (typeof body.errcode === 'number' && body.errcode !== 0) {
    throw weChatErrorFromCode(body.errcode, body.errmsg ?? '', await getWeChatEgressIp())
  }

  const mediaId = body.media_id?.trim()
  if (!mediaId) {
    throw new WeChatBindingError('WECHAT_API_ERROR', '微信接口未返回 media_id，请稍后重试', 502)
  }

  if (kind === 'permanent') {
    const title = input.title?.trim() || ''
    return {
      mediaId,
      kind,
      type,
      name: title || fileName,
      ...(title ? { title } : {}),
      updateTime: new Date().toISOString(),
      hasContent: true,
    }
  }

  const uploadedAt = new Date()
  const record: TemporaryMaterialRecord = {
    mediaId,
    type,
    name: fileName,
    size,
    contentType: input.file.type || CONTENT_TYPE_BY_EXTENSION[extension] || '',
    uploadedAt: uploadedAt.toISOString(),
    expiresAt: new Date(uploadedAt.getTime() + TEMPORARY_MATERIAL_TTL_MS).toISOString(),
  }

  const store = await readTemporaryMaterials()
  await writeTemporaryMaterials({
    items: [record, ...store.items.filter((item) => item.mediaId !== mediaId)],
  })

  return toTemporaryItem(record)
}

async function fetchRawMaterial(
  url: string,
  init?: RequestInit,
): Promise<WeChatMaterialContent> {
  let response: Response
  try {
    response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(WECHAT_CONTENT_TIMEOUT_MS),
      ...init,
    })
  } catch {
    throw new WeChatBindingError('WECHAT_UNREACHABLE', '无法连接微信服务器，请稍后重试', 502)
  }

  const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  const fileName = fileNameFromDisposition(response.headers.get('content-disposition') ?? '')

  // 微信的取素材接口「成功返回字节流、失败返回 JSON」，所以要按响应类型分流。
  if (contentType.includes('application/json') || contentType.includes('text/plain')) {
    const text = await response.text()
    let parsed: Record<string, unknown> | null = null
    try {
      parsed = JSON.parse(text) as Record<string, unknown>
    } catch {
      parsed = null
    }

    if (parsed) {
      const errcode = typeof parsed.errcode === 'number' ? parsed.errcode : 0
      if (errcode !== 0) {
        throw weChatErrorFromCode(
          errcode,
          typeof parsed.errmsg === 'string' ? parsed.errmsg : '',
          await getWeChatEgressIp(),
        )
      }
      // 永久视频素材：get_material 回的是 JSON，真正的字节在 down_url（微信要求走 http）。
      const downUrl = typeof parsed.down_url === 'string' ? parsed.down_url.trim() : ''
      if (downUrl) return fetchRawMaterial(downUrl)
    }

    throw new WeChatBindingError('WECHAT_API_ERROR', `微信素材内容返回异常（HTTP ${response.status}）`, 502)
  }

  if (!response.ok) {
    throw new WeChatBindingError('WECHAT_API_ERROR', `微信素材内容返回异常（HTTP ${response.status}）`, 502)
  }

  const body = await response.arrayBuffer()
  if (body.byteLength === 0) {
    throw new WeChatBindingError('WECHAT_API_ERROR', '微信返回了空的素材内容', 502)
  }

  return { body, contentType: contentType || 'application/octet-stream', fileName }
}

export interface WeChatMaterialContentQuery {
  mediaId: string
  kind?: string
  type?: string
}

export async function fetchWeChatMaterialContent(
  query: WeChatMaterialContentQuery,
): Promise<WeChatMaterialContent> {
  const mediaId = query.mediaId.trim()
  if (!mediaId) {
    throw new WeChatBindingError('WECHAT_MATERIAL_NOT_FOUND', '素材不存在或已失效', 404)
  }

  const kind = normalizeKind(query.kind)
  const token = await getWeChatAccessToken()

  if (kind === 'temporary') {
    const store = await readTemporaryMaterials()
    const record = store.items.find((item) => item.mediaId === mediaId)
    if (!record) {
      throw new WeChatBindingError(
        'WECHAT_MATERIAL_NOT_FOUND',
        '该临时素材不在服务端的上传记录里（可能已过期清理），请重新上传',
        404,
      )
    }
    // 视频取临时素材必须用 http，其他类型用 https（微信文档明确要求）。
    const base = record.type === 'video' ? WECHAT_API_BASE.replace('https://', 'http://') : WECHAT_API_BASE
    const content = await fetchRawMaterial(
      `${base}/cgi-bin/media/get?access_token=${encodeURIComponent(token)}&media_id=${encodeURIComponent(mediaId)}`,
    )
    return decorateContent(content, mediaId, record.type)
  }

  const declaredType = normalizeMaterialType(query.type, null)
  const url = `${WECHAT_API_BASE}/cgi-bin/material/get_material?access_token=${encodeURIComponent(token)}`
  const content = await fetchRawMaterial(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_id: mediaId }),
  })
  return decorateContent(content, mediaId, declaredType ?? 'image')
}

function decorateContent(
  content: WeChatMaterialContent,
  mediaId: string,
  type: WeChatMaterialType,
): WeChatMaterialContent {
  const contentType = resolveContentType(content, type)
  if (content.fileName && contentType === content.contentType) return content
  const extension = EXTENSION_BY_CONTENT_TYPE[contentType] ?? (type === 'image' ? 'jpg' : type)
  return { ...content, contentType, fileName: content.fileName || `${mediaId}.${extension}` }
}

export interface WeChatMaterialDeleteResult {
  mediaId: string
  kind: WeChatMaterialKind
}

export async function deleteWeChatMaterial(
  mediaIdRaw: string,
  kindRaw: string | undefined,
): Promise<WeChatMaterialDeleteResult> {
  const mediaId = mediaIdRaw.trim()
  if (!mediaId) {
    throw new WeChatBindingError('WECHAT_MATERIAL_NOT_FOUND', '素材不存在或已失效', 404)
  }

  const kind = normalizeKind(kindRaw)

  if (kind === 'temporary') {
    // 微信没有删除临时素材的接口，只能从我们自己的索引里移除。
    const store = await readTemporaryMaterials()
    if (!store.items.some((item) => item.mediaId === mediaId)) {
      throw new WeChatBindingError(
        'WECHAT_MATERIAL_NOT_FOUND',
        '该临时素材不在服务端的上传记录里（微信侧无法删除，只能移除记录）',
        404,
      )
    }
    await writeTemporaryMaterials({ items: store.items.filter((item) => item.mediaId !== mediaId) })
    return { mediaId, kind }
  }

  const token = await getWeChatAccessToken()
  const body = await requestWeChatApi<{ errcode?: number; errmsg?: string }>(
    `${WECHAT_API_BASE}/cgi-bin/material/del_material?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_id: mediaId }),
    },
  )
  if (typeof body.errcode === 'number' && body.errcode !== 0) {
    throw weChatErrorFromCode(body.errcode, body.errmsg ?? '', await getWeChatEgressIp())
  }

  return { mediaId, kind }
}
