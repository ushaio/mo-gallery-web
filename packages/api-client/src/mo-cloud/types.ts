/**
 * MO 云契约类型（mo-cloud-parity-plan S3/M5；§3.1–§3.4）。
 *
 * 硬约束（§3.4 受保护的既有包络）：`/api/cloud/images` 系列的字段名与包络
 * （list `{items,total,page,pageSize,usage}`、upload `{image,usage}`、
 * delete `{usage}`、PATCH access、配额）三组消费方共用——
 * ① 桌面 v3 `official-cloud.ts`；② Flutter `CloudApi`
 * （`emulsion-app/lib/features/cloud/cloud_api.dart:72-145`）；
 * ③ 官网 admin 云面板。本文件的 Cloud* 类型是这三组包络的投影，禁止改名。
 */

/** 云图条目：官网 `serializeCloudImage`（src/server/cloud-image.ts）的输出形状。 */
export interface MoCloudImageItem {
  id: string
  fileName: string
  contentType: string
  size: number
  createdAt: string
  externalAccess: boolean
  requiresAuth: true
  /** 站点元数据（CloudPhotoSite）；旧版官网无该字段时为 null。 */
  site: MoCloudSiteMeta | null
  /** 官网自身的内容地址（需 Bearer 会话读取，非存储直链）。 */
  url: string
  /** externalAccess=true 时的公开地址；否则为 null。 */
  publicUrl: string | null
}

/** 照片站点元数据（CloudPhotoSite）；published 与 externalAccess 正交。 */
export interface MoCloudSiteMeta {
  title: string | null
  tags: string[]
  featured: boolean
  published: boolean
  width: number | null
  height: number | null
  takenAt: string | null
  cameraMake: string | null
  cameraModel: string | null
  dominantColors: string[]
}

export interface MoCloudUsage {
  usedBytes: number
  quotaBytes: number
  /** 专属配额的截止日期（YYYY-MM-DD）；旧版本官网不含该字段。 */
  quotaExpiresAt?: string | null
  /** 云上传是否已被管理员冻结；旧版本官网不含该字段。 */
  frozen?: boolean
}

export interface MoCloudImagePage {
  items: MoCloudImageItem[]
  total: number
  page: number
  pageSize: number
  usage: MoCloudUsage
}

export interface MoCloudUploadResult {
  image: MoCloudImageItem
  usage: MoCloudUsage
}

/** §3.3 秒传：同用户同 sha256 时 dedup=true 且返回既有 CloudImage（R2 对象复用）。 */
export type MoCloudHashPrecheckResult =
  | { dedup: true; image: MoCloudImageItem }
  | { dedup: false }

/** 配额摘要（/api/cloud/quota 与 /quota/claim 同构；含手动领取信息）。 */
export interface MoCloudQuotaSummary {
  usedBytes: number
  quotaBytes: number
  quotaExpiresAt: string | null
  frozen: boolean
  quotaUnclaimed: boolean
  claimable: boolean
  claimQuotaBytes: number | null
  claimExpiresAt: string | null
}

/* ---------------------------------------------------------------------------
 * Owner 侧：/api/site/*（§3.2，Bearer）
 * ------------------------------------------------------------------------- */

/**
 * 站点设置。`published/siteTitle` 为当前官网已上线的字段；
 * socialLinks/footerText/commentsEnabled/commentsModeration 为迁移①（M1）与
 * §3.2 的向后兼容扩展——旧版官网响应不含它们（可选）。
 */
export interface MoSiteSettings {
  published: boolean
  siteTitle: string | null
  socialLinks?: Array<{ title: string; url: string; icon?: string }>
  footerText?: string | null
  commentsEnabled?: boolean
  commentsModeration?: boolean
}

export type MoSiteCommentStatus = 'pending' | 'approved' | 'rejected'

/** 官网评论（对齐计划迁移② CloudComment 与 web CommentDto 的审核语义）。 */
export interface MoSiteComment {
  id: string
  photoId: string
  authorName: string
  content: string
  status: MoSiteCommentStatus
  createdAt: string
  /** 仅 owner 侧审核可见；访客接口不得输出。 */
  ip?: string
}

export interface MoSiteCommentPage {
  items: MoSiteComment[]
  total: number
  page: number
  pageSize: number
}

/** 友链（isActive/featured/sortOrder 沿用 web hono/friends.ts 命名）。 */
export interface MoSiteFriendLink {
  id: string
  name: string
  url: string
  description?: string | null
  avatarUrl?: string | null
  featured: boolean
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** 概览计数（对齐 web hono/overview.ts 的 data 形状；官网 M3 实现时输出其子集）。 */
export interface MoSiteOverview {
  photoCount: number
  digitalCount: number
  filmCount: number
  albumCount: number
  storyCount: number
  blogCount: number
  filmRollCount: number
  friendCount: number
  commentCount: number
  cameraCount: number
  lensCount: number
  tagCount: number
  featuredCount: number
  hiddenCount: number
  pendingComments: number
  approvedComments: number
  rejectedComments: number
  totalSize: number
  publishedAlbums: number
  draftAlbums: number
  publishedStories: number
  draftStories: number
  publishedBlogs: number
  draftBlogs: number
  photosThisMonth: number
  /** 明细/时间线数组为官网 M3 实现的可选输出，消费方不得强依赖。 */
  recentPhotos?: Array<{ id: string; title: string | null; createdAt: string }>
  recentStories?: Array<{ id: string; title: string; createdAt: string; isPublished: boolean }>
  recentBlogs?: Array<{ id: string; title: string; createdAt: string; isPublished: boolean }>
  monthlyPhotos?: Array<{ date: string; count: number }>
  photoActivityYear?: number
  dailyPhotos?: Array<{ date: string; count: number }>
}

/* ---------------------------------------------------------------------------
 * 访客侧：/api/public/sites/:username/*（§3.1，免鉴权；published 过滤）
 * ------------------------------------------------------------------------- */

/** GET /api/public/sites/:username；未公开/封禁/注销时服务端 404。 */
export interface MoPublicSite {
  siteTitle: string
  socialLinks: Array<{ title: string; url: string; icon?: string }>
  footerText?: string
  stats: {
    photos: number
    albums: number
    articles: number
  }
}

export interface MoPublicPhoto {
  id: string
  title: string | null
  width: number | null
  height: number | null
  dominantColors: string[]
  takenAt: string | null
  cameraMake: string | null
  cameraModel: string | null
  /** HMAC 签名媒体地址（含 exp/sig），过期需重新拉列表/详情获取。 */
  mediaUrl: string
  thumbnailUrl: string | null
}

export interface MoPublicPhotoPage {
  items: MoPublicPhoto[]
  total: number
  page: number
  pageSize: number
}

/** 详情额外携带 EXIF（迁移② lens/iso/focal 扩列后的投影）。 */
export interface MoPublicPhotoDetail extends MoPublicPhoto {
  description?: string | null
  lensMake?: string | null
  lensModel?: string | null
  iso?: number | null
  focalLength?: number | null
}

export interface MoPublicAlbum {
  id: string
  title: string
  description?: string | null
  coverPhotoId?: string | null
  photoCount: number
  createdAt: string
}

export interface MoPublicAlbumDetail extends MoPublicAlbum {
  photos: MoPublicPhoto[]
}

export interface MoPublicFilmRoll {
  id: string
  name: string
  brand: string
  format: string
  iso: number
  notes?: string | null
  shootDate?: string | null
  photoCount: number
}

export interface MoPublicFilmRollDetail extends MoPublicFilmRoll {
  photos: MoPublicPhoto[]
}

export interface MoPublicArticleListItem {
  id: string
  kind: 'blog' | 'story'
  title: string
  summary?: string | null
  coverPhotoId?: string | null
  publishedAt?: string | null
  createdAt: string
}

export interface MoPublicArticlePage {
  items: MoPublicArticleListItem[]
  total: number
  page: number
  pageSize: number
}

export interface MoPublicArticle extends MoPublicArticleListItem {
  content: {
    editorType: 'tiptap' | 'milkdown' | string
    tiptapContent?: string
    tiptapContentJson?: unknown
    milkContent?: string | null
  }
}

export interface MoPublicGearAggregate {
  make?: string | null
  model?: string | null
  photoCount: number
}

/** 访客评论（匿名只读；仅 approved）。 */
export interface MoPublicComment {
  id: string
  authorName: string
  content: string
  createdAt: string
}

export interface MoPublicCommentPage {
  items: MoPublicComment[]
  total: number
  page: number
  pageSize: number
}

/* ---------------------------------------------------------------------------
 * AI 生图：/api/ai/image-generations（§3.3，决策 D7；M5）
 * ------------------------------------------------------------------------- */

/** 生图输入：prompt 必填；其余字段随官网 provider 配置演进透传。 */
export interface MoAiImageGenerationInput {
  prompt: string
  model?: string
  /** 图生图/参考图（官网 CloudImage id）。 */
  referenceImageIds?: string[]
  [key: string]: unknown
}

/** 产物直接落 R2 建 CloudImage（计配额），与上传端点同包络。 */
export interface MoAiImageGenerationResult {
  image: MoCloudImageItem
  usage: MoCloudUsage
}
