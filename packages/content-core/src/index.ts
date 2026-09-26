/**
 * @mo-gallery/content-core — 个人站内容领域（纯 TS）。
 *
 * 只包含类型、发布状态机与 owner-scoped repository 接口；不依赖 Prisma /
 * Next / Wails / 密钥。数据访问由宿主实现 repository 接口（查询层强制
 * owner scope），访客渲染由 @mo-gallery/public-site 消费本包。
 */
export {
  isPublished,
  publish,
  unpublish,
  visibleToVisitors,
} from './publication'
export type {
  PhotoSiteMetadata,
  SiteAlbum,
  SiteArticle,
  SiteArticleKind,
  SiteCameraAggregate,
  SiteComment,
  SiteCommentStatus,
  SiteFilmRoll,
  SiteFriendLink,
  SiteLensAggregate,
  SitePublicationState,
  SiteSettings,
  SiteSocialLink,
  TiptapJsonNode,
} from './types'
export type {
  AlbumSiteRepository,
  ArticleSiteRepository,
  ArticleSiteQuery,
  PhotoSiteQuery,
  PhotoSiteRepository,
  Paged,
  SiteSettingsRepository,
  VisitorArticleQuery,
  VisitorPhotoQuery,
  VisitorSiteReader,
} from './repository'
