/**
 * MO 云 per-instance 客户端（mo-cloud-parity-plan S3/M5）。
 *
 * 与 core.ts:7-38 的全局单例（configureApiRuntime + localStorage 发现）不同：
 * MO 云的 baseUrl、Bearer token 与 cloud_scope 全部由调用方以 getter 注入，
 * 每次请求时解析——Desktop v3 用官方会话（official-session）构造实例，
 * Flutter/浏览器等宿主各自持有自己的实例，互不共享可变全局状态。
 *
 * scope 语义（沿用 emulsion-desktop-v3 frontend/src/lib/official-cloud.ts:120-165
 * 的 request<T>() 模式）：cloud_scope 仅用于调用方校验「会话是否已被切换」，
 * 绝不作为凭证发送到服务端。
 */

import { buildQuery } from '../core'
import type {
  MoAiImageGenerationInput,
  MoAiImageGenerationResult,
  MoCloudHashPrecheckResult,
  MoCloudImageItem,
  MoCloudImagePage,
  MoCloudQuotaSummary,
  MoCloudUploadResult,
  MoCloudUsage,
  MoPublicAlbum,
  MoPublicAlbumDetail,
  MoPublicArticle,
  MoPublicArticlePage,
  MoPublicComment,
  MoPublicCommentPage,
  MoPublicFilmRoll,
  MoPublicFilmRollDetail,
  MoPublicGearAggregate,
  MoPublicPhotoDetail,
  MoPublicPhotoPage,
  MoPublicSite,
  MoSiteComment,
  MoSiteCommentPage,
  MoSiteCommentStatus,
  MoSiteFriendLink,
  MoSiteOverview,
  MoSiteSettings,
} from './types'

/** MO 云请求错误：保留服务端 code，UI 据此区分配额、体积、登录失效等。 */
export class MoCloudError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'MoCloudError'
    this.code = code
    this.status = status
  }
}

/** 未登录官方账号（或会话已失效）时统一用这个 code。 */
export const MO_CLOUD_LOGIN_REQUIRED = 'LOGIN_REQUIRED'

export function isMoCloudLoginRequired(error: unknown): boolean {
  return error instanceof MoCloudError
    ? error.code === MO_CLOUD_LOGIN_REQUIRED || error.status === 401
    : false
}

export interface MoCloudClientOptions {
  /** 官网地址（不带尾斜杠也可以，内部归一化），如 https://mo.example.com。 */
  baseUrl: string
  /**
   * Bearer token 供给器（每次请求时调用；返回 null 视为未登录）。
   * 用 getter 而不是静态值，便于宿主在会话刷新后继续复用同一实例。
   */
  getToken: () => string | null | Promise<string | null>
  /**
   * cloud_scope 供给器（Desktop 专有语义；Web/其他宿主可不传）。
   * 仅用于 expectedScope 会话一致性校验，不作为凭证发送。
   */
  getScope?: () => string | null | Promise<string | null>
  /** 可注入的 fetch 实现（测试/特殊运行时用）；缺省用全局 fetch。 */
  fetchImpl?: typeof fetch
  /** 收到 401 时的回调（宿主可借此触发重新登录流程）。 */
  onUnauthorized?: () => void
}

interface MoCloudEnvelope<T> {
  success?: boolean
  data?: T
  code?: string
  error?: string
  message?: string
}

interface RequestOptions {
  /** 是否携带 Bearer（默认 true；访客只读端点传 false 时也允许携带——有登录态就带上）。 */
  anonymous?: boolean
  /** 会话一致性校验：调用时注入已知 scope，实例当前 scope 与之不符则抛 SESSION_CHANGED。 */
  expectedScope?: string
}

interface ResolvedSession {
  base: string
  token: string | null
  scope: string | null
}

export interface MoCloudClient {
  /** 直接发 MO 云请求（宿主需要调用尚未下沉契约的新端点时的逃生门）。 */
  request<T>(path: string, init?: RequestInit, options?: RequestOptions): Promise<T>
  cloud: MoCloudNamespace
  site: MoSiteNamespace
  publicSites: MoPublicNamespace
  ai: MoAiNamespace
}

function normalizeBase(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

export function createMoCloudClient(options: MoCloudClientOptions): MoCloudClient {
  const base = normalizeBase(options.baseUrl)
  if (!base || !/^https?:\/\//i.test(base)) {
    throw new Error(`createMoCloudClient: invalid baseUrl "${options.baseUrl}"`)
  }
  const doFetch = options.fetchImpl ?? fetch

  const resolveSession = async (): Promise<ResolvedSession> => {
    const [token, scope] = await Promise.all([
      options.getToken() ?? null,
      options.getScope?.() ?? null,
    ])
    return { base, token: token || null, scope: scope || null }
  }

  const request = async <T>(path: string, init: RequestInit = {}, reqOptions: RequestOptions = {}): Promise<T> => {
    const session = await resolveSession()
    if (reqOptions.expectedScope !== undefined && reqOptions.expectedScope !== session.scope) {
      throw new MoCloudError('SESSION_CHANGED', '官方账号已变更，请刷新后重试', 401)
    }

    const headers = new Headers(init.headers)
    if (!reqOptions.anonymous || session.token) {
      if (session.token) headers.set('Authorization', `Bearer ${session.token}`)
    }
    if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    let response: Response
    try {
      response = await doFetch(`${session.base}${path}`, {
        ...init,
        headers,
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
      })
    } catch {
      throw new MoCloudError('NETWORK_ERROR', '无法连接 MO云 服务器', 0)
    }

    const body = (await response.json().catch(() => ({}))) as MoCloudEnvelope<T>
    if (response.status === 401) {
      options.onUnauthorized?.()
      throw new MoCloudError(body.code ?? MO_CLOUD_LOGIN_REQUIRED, '官方登录已过期，请重新登录', 401)
    }
    if (!response.ok || body.success === false) {
      throw new MoCloudError(
        body.code ?? 'REQUEST_FAILED',
        body.error ?? body.message ?? `MO云 请求失败（${response.status}）`,
        response.status,
      )
    }
    return (body.data !== undefined ? body.data : (body as unknown)) as T
  }

  const json = (payload: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(payload) })

  /* ------------------------------------------------------------------ */
  // /api/cloud/*（owner，Bearer；§3.4 受保护包络）
  /* ------------------------------------------------------------------ */
  const cloud: MoCloudNamespace = {
    listImages(params: { page?: number; pageSize?: number } = {}) {
      const page = Math.max(1, Math.floor(params.page ?? 1))
      const pageSize = Math.min(50, Math.max(1, Math.floor(params.pageSize ?? 24)))
      return request<MoCloudImagePage>(`/api/cloud/images${buildQuery({ page, pageSize })}`, { method: 'GET' })
    },

    getImage(id: string) {
      return request<MoCloudImageItem>(`/api/cloud/images/${encodeURIComponent(id)}`, { method: 'GET' })
    },

    /** Flutter CloudApi.refreshUrl 消费的 /url 端点（桌面 v3 不消费）。 */
    async getImageUrl(id: string) {
      const data = await request<{ url?: string; expiresIn?: number }>(
        `/api/cloud/images/${encodeURIComponent(id)}/url`,
        { method: 'GET' },
      )
      return { url: data.url ?? '', expiresIn: data.expiresIn }
    },

    setAccess(id: string, externalAccess: boolean) {
      return request<MoCloudImageItem>(`/api/cloud/images/${encodeURIComponent(id)}/access`, {
        method: 'PATCH',
        body: JSON.stringify({ externalAccess }),
      })
    },

    async uploadImage(file: File, opts: { onProgress?: (ratio: number) => void } = {}) {
      const { onProgress } = opts
      if (onProgress && typeof XMLHttpRequest !== 'undefined') {
        const session = await resolveSession()
        if (!session.token) {
          throw new MoCloudError(MO_CLOUD_LOGIN_REQUIRED, 'MO云 需要先登录官方账号', 401)
        }
        const form = new FormData()
        form.append('file', file, file.name)
        const result = await new Promise<MoCloudUploadResult>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open('POST', `${session.base}/api/cloud/images`)
          xhr.setRequestHeader('Authorization', `Bearer ${session.token}`)
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) onProgress(event.loaded / event.total)
          }
          xhr.onerror = () => reject(new MoCloudError('NETWORK_ERROR', '无法连接 MO云 服务器', 0))
          xhr.onabort = () => reject(new MoCloudError('ABORTED', '上传已取消', 0))
          xhr.onload = () => {
            let body: MoCloudEnvelope<MoCloudUploadResult> = {}
            try {
              body = JSON.parse(xhr.responseText) as MoCloudEnvelope<MoCloudUploadResult>
            } catch {
              /* keep empty envelope */
            }
            if (xhr.status >= 200 && xhr.status < 300 && body.success !== false && body.data) {
              resolve(body.data)
              return
            }
            reject(new MoCloudError(body.code ?? 'UPLOAD_FAILED', body.error ?? `上传失败（${xhr.status}）`, xhr.status))
          }
          xhr.send(form)
        })
        return result
      }
      const form = new FormData()
      form.append('file', file, file.name)
      return request<MoCloudUploadResult>('/api/cloud/images', { method: 'POST', body: form })
    },

    async deleteImage(id: string): Promise<{ usage: MoCloudUsage }> {
      return request<{ usage: MoCloudUsage }>(`/api/cloud/images/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },

    async getQuota() {
      return request<MoCloudQuotaSummary>('/api/cloud/quota', { method: 'GET' })
    },

    claimQuota() {
      return request<MoCloudQuotaSummary>('/api/cloud/quota/claim', { method: 'POST' })
    },

    /** §3.3 秒传预检：旧服务端未部署时返回 404，调用方自行回落普通上传。 */
    hashPrecheck(input: { sha256: string; size: number }) {
      return request<MoCloudHashPrecheckResult>('/api/cloud/images/hash-precheck', json(input))
    },
  }

  /* ------------------------------------------------------------------ */
  // /api/site/*（owner，Bearer；§3.2）
  /* ------------------------------------------------------------------ */
  const site: MoSiteNamespace = {
    getSettings() {
      return request<MoSiteSettings>('/api/site/settings', { method: 'GET' })
    },

    updateSettings(patch: Partial<MoSiteSettings>) {
      return request<MoSiteSettings>('/api/site/settings', { method: 'PUT', body: JSON.stringify(patch) })
    },

    listComments(params: { status?: MoSiteCommentStatus; photoId?: string; page?: number; pageSize?: number } = {}) {
      return request<MoSiteCommentPage>(`/api/site/comments${buildQuery({ ...params })}`, { method: 'GET' })
    },

    createComment(input: { photoId: string; authorName: string; content: string; status?: MoSiteCommentStatus }) {
      return request<MoSiteComment>('/api/site/comments', json(input))
    },

    /** 审核：status 取 approved/rejected（与 web /admin/comments/:id/status 同语义）。 */
    updateComment(id: string, patch: { status?: MoSiteCommentStatus }) {
      return request<MoSiteComment>(`/api/site/comments/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })
    },

    deleteComment(id: string) {
      return request<void>(`/api/site/comments/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },

    listFriends() {
      return request<MoSiteFriendLink[]>('/api/site/friends', { method: 'GET' })
    },

    createFriend(input: Omit<MoSiteFriendLink, 'id' | 'createdAt' | 'updatedAt'>) {
      return request<MoSiteFriendLink>('/api/site/friends', json(input))
    },

    updateFriend(id: string, patch: Partial<Omit<MoSiteFriendLink, 'id' | 'createdAt' | 'updatedAt'>>) {
      return request<MoSiteFriendLink>(`/api/site/friends/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })
    },

    deleteFriend(id: string) {
      return request<void>(`/api/site/friends/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },

    getOverview() {
      return request<MoSiteOverview>('/api/site/overview', { method: 'GET' })
    },
  }

  /* ------------------------------------------------------------------ */
  // /api/public/sites/:username/*（访客只读，§3.1；匿名可用，登录态则随请求携带）
  /* ------------------------------------------------------------------ */
  const publicSites: MoPublicNamespace = {
    getSite(username: string) {
      return request<MoPublicSite>(`/api/public/sites/${encodeURIComponent(username)}`, { method: 'GET' }, { anonymous: true })
    },

    listPhotos(username: string, params: { page?: number; pageSize?: number; tag?: string; featured?: boolean } = {}) {
      const query = buildQuery({
        page: params.page,
        pageSize: params.pageSize,
        tag: params.tag,
        featured: params.featured === undefined ? undefined : params.featured ? 'true' : 'false',
      })
      return request<MoPublicPhotoPage>(`/api/public/sites/${encodeURIComponent(username)}/photos${query}`, { method: 'GET' }, { anonymous: true })
    },

    getPhoto(username: string, photoId: string) {
      return request<MoPublicPhotoDetail>(`/api/public/sites/${encodeURIComponent(username)}/photos/${encodeURIComponent(photoId)}`, { method: 'GET' }, { anonymous: true })
    },

    listAlbums(username: string) {
      return request<MoPublicAlbum[]>(`/api/public/sites/${encodeURIComponent(username)}/albums`, { method: 'GET' }, { anonymous: true })
    },

    getAlbum(username: string, albumId: string) {
      return request<MoPublicAlbumDetail>(`/api/public/sites/${encodeURIComponent(username)}/albums/${encodeURIComponent(albumId)}`, { method: 'GET' }, { anonymous: true })
    },

    listFilmRolls(username: string) {
      return request<MoPublicFilmRoll[]>(`/api/public/sites/${encodeURIComponent(username)}/film-rolls`, { method: 'GET' }, { anonymous: true })
    },

    getFilmRoll(username: string, rollId: string) {
      return request<MoPublicFilmRollDetail>(`/api/public/sites/${encodeURIComponent(username)}/film-rolls/${encodeURIComponent(rollId)}`, { method: 'GET' }, { anonymous: true })
    },

    listArticles(username: string, params: { kind?: 'blog' | 'story'; page?: number; pageSize?: number } = {}) {
      return request<MoPublicArticlePage>(`/api/public/sites/${encodeURIComponent(username)}/articles${buildQuery({ ...params })}`, { method: 'GET' }, { anonymous: true })
    },

    getArticle(username: string, articleId: string) {
      return request<MoPublicArticle>(`/api/public/sites/${encodeURIComponent(username)}/articles/${encodeURIComponent(articleId)}`, { method: 'GET' }, { anonymous: true })
    },

    listCameras(username: string) {
      return request<MoPublicGearAggregate[]>(`/api/public/sites/${encodeURIComponent(username)}/cameras`, { method: 'GET' }, { anonymous: true })
    },

    listLenses(username: string) {
      return request<MoPublicGearAggregate[]>(`/api/public/sites/${encodeURIComponent(username)}/lenses`, { method: 'GET' }, { anonymous: true })
    },

    listComments(username: string, photoId: string, params: { page?: number; pageSize?: number } = {}) {
      return request<MoPublicCommentPage>(
        `/api/public/sites/${encodeURIComponent(username)}/photos/${encodeURIComponent(photoId)}/comments${buildQuery({ ...params })}`,
        { method: 'GET' }, { anonymous: true },
      )
    },

    /** 决策 D2：访客评论仅限官网注册用户——未登录时服务端 401。 */
    postComment(username: string, photoId: string, input: { content: string }) {
      return request<MoPublicComment>(
        `/api/public/sites/${encodeURIComponent(username)}/photos/${encodeURIComponent(photoId)}/comments`,
        json(input),
      )
    },

    /** 由 mediaUrl 之外自行拼签名媒体地址时使用（一般直接用列表返回的 mediaUrl）。 */
    buildPhotoContentUrl(username: string, photoId: string, query: { exp?: number; sig?: string } = {}) {
      return `${base}/api/public/sites/${encodeURIComponent(username)}/photos/${encodeURIComponent(photoId)}/content${buildQuery({ ...query })}`
    },
  }

  /* ------------------------------------------------------------------ */
  // /api/ai/*（决策 D7；M5）
  /* ------------------------------------------------------------------ */
  const ai: MoAiNamespace = {
    generateImage(input: MoAiImageGenerationInput) {
      return request<MoAiImageGenerationResult>('/api/ai/image-generations', json(input))
    },
  }

  return { request, cloud, site, publicSites, ai }
}

export interface MoCloudNamespace {
  listImages(params?: { page?: number; pageSize?: number }): Promise<MoCloudImagePage>
  getImage(id: string): Promise<MoCloudImageItem>
  getImageUrl(id: string): Promise<{ url: string; expiresIn?: number }>
  setAccess(id: string, externalAccess: boolean): Promise<MoCloudImageItem>
  uploadImage(file: File, opts?: { onProgress?: (ratio: number) => void }): Promise<MoCloudUploadResult>
  deleteImage(id: string): Promise<{ usage: MoCloudUsage }>
  getQuota(): Promise<MoCloudQuotaSummary>
  claimQuota(): Promise<MoCloudQuotaSummary>
  hashPrecheck(input: { sha256: string; size: number }): Promise<MoCloudHashPrecheckResult>
}

export interface MoSiteNamespace {
  getSettings(): Promise<MoSiteSettings>
  updateSettings(patch: Partial<MoSiteSettings>): Promise<MoSiteSettings>
  listComments(params?: { status?: MoSiteCommentStatus; photoId?: string; page?: number; pageSize?: number }): Promise<MoSiteCommentPage>
  createComment(input: { photoId: string; authorName: string; content: string; status?: MoSiteCommentStatus }): Promise<MoSiteComment>
  updateComment(id: string, patch: { status?: MoSiteCommentStatus }): Promise<MoSiteComment>
  deleteComment(id: string): Promise<void>
  listFriends(): Promise<MoSiteFriendLink[]>
  createFriend(input: Omit<MoSiteFriendLink, 'id' | 'createdAt' | 'updatedAt'>): Promise<MoSiteFriendLink>
  updateFriend(id: string, patch: Partial<Omit<MoSiteFriendLink, 'id' | 'createdAt' | 'updatedAt'>>): Promise<MoSiteFriendLink>
  deleteFriend(id: string): Promise<void>
  getOverview(): Promise<MoSiteOverview>
}

export interface MoPublicNamespace {
  getSite(username: string): Promise<MoPublicSite>
  listPhotos(username: string, params?: { page?: number; pageSize?: number; tag?: string; featured?: boolean }): Promise<MoPublicPhotoPage>
  getPhoto(username: string, photoId: string): Promise<MoPublicPhotoDetail>
  listAlbums(username: string): Promise<MoPublicAlbum[]>
  getAlbum(username: string, albumId: string): Promise<MoPublicAlbumDetail>
  listFilmRolls(username: string): Promise<MoPublicFilmRoll[]>
  getFilmRoll(username: string, rollId: string): Promise<MoPublicFilmRollDetail>
  listArticles(username: string, params?: { kind?: 'blog' | 'story'; page?: number; pageSize?: number }): Promise<MoPublicArticlePage>
  getArticle(username: string, articleId: string): Promise<MoPublicArticle>
  listCameras(username: string): Promise<MoPublicGearAggregate[]>
  listLenses(username: string): Promise<MoPublicGearAggregate[]>
  listComments(username: string, photoId: string, params?: { page?: number; pageSize?: number }): Promise<MoPublicCommentPage>
  postComment(username: string, photoId: string, input: { content: string }): Promise<MoPublicComment>
  buildPhotoContentUrl(username: string, photoId: string, query?: { exp?: number; sig?: string }): string
}

export interface MoAiNamespace {
  generateImage(input: MoAiImageGenerationInput): Promise<MoAiImageGenerationResult>
}
