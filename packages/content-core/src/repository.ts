import type {
  PhotoSiteMetadata,
  SiteAlbum,
  SiteArticle,
  SiteArticleKind,
  SiteCameraAggregate,
  SiteComment,
  SiteFilmRoll,
  SiteFriendLink,
  SiteLensAggregate,
  SitePublicationState,
  SiteSettings,
} from './types'

/**
 * Owner-scoped repository 接口（R10）。
 *
 * 实现方的硬性要求：`ownerId` 是查询的一部分，必须在数据库查询层过滤
 * （如 Prisma 的 `where: { userId }`）；取出后再过滤不算实现。Web 宿主
 * 传固定全局 scope，Official 宿主传 username 解析出的 User.id。
 */

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface PhotoSiteQuery {
  ownerId: string
  publication?: SitePublicationState
  albumId?: string
  tags?: string[]
  featured?: boolean
  page?: number
  pageSize?: number
}

export interface ArticleSiteQuery {
  ownerId: string
  publication?: SitePublicationState
  page?: number
  pageSize?: number
}

export interface PhotoSiteRepository {
  list(query: PhotoSiteQuery): Promise<Paged<PhotoSiteMetadata>>
  /** 按 (ownerId, id) 取单条；跨租户的 id 一律视为不存在。 */
  get(ownerId: string, id: string): Promise<PhotoSiteMetadata | null>
  create(metadata: Omit<PhotoSiteMetadata, 'id' | 'createdAt' | 'updatedAt'>): Promise<PhotoSiteMetadata>
  update(
    ownerId: string,
    id: string,
    patch: Partial<Omit<PhotoSiteMetadata, 'id' | 'ownerId' | 'cloudImageId'>>,
  ): Promise<PhotoSiteMetadata>
  remove(ownerId: string, id: string): Promise<void>
}

export interface ArticleSiteRepository {
  list(query: ArticleSiteQuery): Promise<Paged<SiteArticle>>
  /** 按 (ownerId, slug 或 id) 取单条；跨租户一律视为不存在。 */
  get(ownerId: string, idOrSlug: string): Promise<SiteArticle | null>
  create(article: Omit<SiteArticle, 'id' | 'createdAt' | 'updatedAt'>): Promise<SiteArticle>
  update(
    ownerId: string,
    id: string,
    patch: Partial<Omit<SiteArticle, 'id' | 'ownerId'>>,
  ): Promise<SiteArticle>
  remove(ownerId: string, id: string): Promise<void>
}

export interface AlbumSiteRepository {
  list(ownerId: string, publication?: SitePublicationState): Promise<SiteAlbum[]>
  get(ownerId: string, id: string): Promise<SiteAlbum | null>
  create(album: Omit<SiteAlbum, 'id' | 'createdAt' | 'updatedAt'>): Promise<SiteAlbum>
  update(
    ownerId: string,
    id: string,
    patch: Partial<Omit<SiteAlbum, 'id' | 'ownerId'>>,
  ): Promise<SiteAlbum>
  remove(ownerId: string, id: string): Promise<void>
}

export interface SiteSettingsRepository {
  get(ownerId: string): Promise<SiteSettings | null>
  save(settings: SiteSettings): Promise<SiteSettings>
}

/**
 * 访客视角的照片/文章查询：不含 publication 维度——访客永远只看 published，
 * 由实现方在数据库查询层强制（对齐 §3.1 访客只读 API 的语义）。
 */
export interface VisitorPhotoQuery {
  albumId?: string
  tags?: string[]
  featured?: boolean
  page?: number
  pageSize?: number
}

export interface VisitorArticleQuery {
  kind?: SiteArticleKind
  page?: number
  pageSize?: number
}

/**
 * 访客只读 repository（S2，供 @mo-gallery/public-site 的宿主适配器实现落地的
 * 领域契约；Official 的 /api/public/sites/:username 与 Web 自部署公开端点各自实现）。
 *
 * 实现方的硬性要求（违反即越权）：
 * - 全部方法只读；ownerId 依旧必须下沉到数据库查询层过滤；
 * - 站点级 `SiteSettings.published === false` 时，宿主应在更外层直接 404；
 * - 照片/相册/文章/胶卷仅返回已发布内容；悬挂引用（已删照片的
 *   coverPhotoId/photoIds）容错跳过，不得抛错；
 * - 评论仅返回 approved（含站点 settings.commentsEnabled=false 时返回空）；
 * - 友链仅返回 isActive，按 featured desc + sortOrder asc 排序；
 * - `SiteComment.ip` 等仅 owner 可见字段不得出现在访客输出里。
 */
export interface VisitorSiteReader {
  getSettings(ownerId: string): Promise<SiteSettings | null>
  listPhotos(ownerId: string, query?: VisitorPhotoQuery): Promise<Paged<PhotoSiteMetadata>>
  getPhoto(ownerId: string, id: string): Promise<PhotoSiteMetadata | null>
  listAlbums(ownerId: string): Promise<SiteAlbum[]>
  getAlbum(ownerId: string, id: string): Promise<SiteAlbum | null>
  listArticles(ownerId: string, query?: VisitorArticleQuery): Promise<Paged<SiteArticle>>
  /** 按 (ownerId, id 或 slug) 取单篇已发布文章；跨租户/未发布一律视为不存在。 */
  getArticle(ownerId: string, idOrSlug: string): Promise<SiteArticle | null>
  listFilmRolls(ownerId: string): Promise<SiteFilmRoll[]>
  getFilmRoll(ownerId: string, id: string): Promise<SiteFilmRoll | null>
  listCameras(ownerId: string): Promise<SiteCameraAggregate[]>
  listLenses(ownerId: string): Promise<SiteLensAggregate[]>
  listFriendLinks(ownerId: string): Promise<SiteFriendLink[]>
  listComments(ownerId: string, photoId: string, page?: number, pageSize?: number): Promise<Paged<SiteComment>>
}
