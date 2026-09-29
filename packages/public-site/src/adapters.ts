import type {
  Paged,
  PhotoSiteMetadata,
  PhotoSiteQuery,
  SiteAlbum,
  SiteArticle,
  SiteArticleKind,
  SiteCameraAggregate,
  SiteComment,
  SiteFilmRoll,
  SiteFriendLink,
  SiteLensAggregate,
  SiteSettings,
} from '@mo-gallery/content-core'

/**
 * 访客站点宿主适配器。
 *
 * 设计原则：访客渲染不内嵌任何宿主的数据获取/路由/媒体 URL 逻辑。
 * Web（单租户全局 scope）与 Official（username → User.id 的按用户 scope）
 * 各自实现这些接口注入给共享组件；路由字符串（/gallery、/blog 等）
 * 由 LinkAdapter 统一处理，组件内部不出现宿主路径字面量。
 *
 * 冻结契约说明：`VisitorContentProvider` / `MediaUrlResolver` / `LinkAdapter`
 * 三个接口的既有成员（原 adapters.ts:22-48）保持不变；S1 为胶卷/评论/友链/
 * 器材等新增能力一律以**可选成员**追加（宿主按能力实现，组件对缺席能力降级
 * ——例如无 submitComment 时评论区只读、无对应 LinkAdapter 路由时导航项隐藏）。
 */

/** 访客视角的站点数据读取通道。只暴露已发布内容，不区分宿主的存储实现。 */
export interface VisitorContentProvider {
  getSiteSettings(username: string): Promise<SiteSettings | null>
  /** 相册列表（仅访客可见的发布相册）。 */
  listAlbums(username: string): Promise<SiteAlbum[]>
  listPhotos(username: string, query?: Omit<PhotoSiteQuery, 'ownerId' | 'publication'>): Promise<PhotoSiteMetadata[]>
  /** 文章列表/详情；idOrSlug 由宿主决定语义。 */
  listArticles(username: string, page?: number, pageSize?: number): Promise<SiteArticle[]>
  getArticle(username: string, idOrSlug: string): Promise<SiteArticle | null>

  /* ---- S1 追加的可选能力（缺席时对应组件降级或隐藏） ---- */

  /** 胶卷列表/详情（FilmRollView 数据源；成员照片仍经 listPhotos 取发布集合）。 */
  listFilmRolls?(username: string): Promise<SiteFilmRoll[]>
  getFilmRoll?(username: string, id: string): Promise<SiteFilmRoll | null>

  /** 友情链接（仅 isActive；SiteFooter / they 页数据源）。 */
  listFriendLinks?(username: string): Promise<SiteFriendLink[]>

  /** 器材聚合（§3.1 …/cameras、…/lenses）。 */
  listCameras?(username: string): Promise<SiteCameraAggregate[]>
  listLenses?(username: string): Promise<SiteLensAggregate[]>

  /**
   * 访客评论（决策 D2：MO 云模式仅官网注册用户可发，匿名只读；
   * 鉴权由宿主实现内部处理——submitComment 在未登录时抛错即可）。
   * listComments 只返回 approved。
   */
  listComments?(username: string, photoId: string, page?: number, pageSize?: number): Promise<Paged<SiteComment>>
  submitComment?(username: string, photoId: string, input: VisitorCommentInput): Promise<SiteComment>
}

/** 访客提交评论的输入；作者身份由宿主从登录态解析，不由组件伪造。 */
export interface VisitorCommentInput {
  content: string
}

/** 富文本/媒体引用 → 访客可访问 URL。宿主负责私有与公开地址的区分。 */
export interface MediaUrlResolver {
  photoDisplay(metadata: PhotoSiteMetadata): string
  photoThumbnail(metadata: PhotoSiteMetadata): string
  articleAsset(articleId: string, assetRef: string): string
}

/**
 * 站内导航适配器。宿主把抽象路径（如 `home`/`gallery`/`article/:id`）
 * 翻译为自己的 URL（Web 根路径、Official 的 /user/{username} 前缀）。
 * 冻结成员之外的可选路由缺席时，组件隐藏对应导航项。
 */
export interface LinkAdapter {
  home(username: string): string
  gallery(username: string): string
  album(username: string, albumId: string): string
  article(username: string, idOrSlug: string): string

  /* ---- S1 追加的可选路由 ---- */

  /** 相册列表页（AlbumView 列表态）。 */
  albumIndex?(username: string): string
  /** 博客/故事列表页（区分 kind 的宿主路由，如 Web 的 /blog、/story）。 */
  articleIndex?(username: string, kind: SiteArticleKind): string
  /** 区分 kind 的文章详情路由；缺席时回落到 article()。 */
  articleByKind?(username: string, kind: SiteArticleKind, idOrSlug: string): string
  /** 胶卷列表页与单卷页。 */
  filmIndex?(username: string): string
  filmRoll?(username: string, rollId: string): string
  /** 友情链接页（they）。 */
  friends?(username: string): string
  /** 关于页（web /about 对位）。 */
  about?(username: string): string
  /** 器材页（cameras/lenses 聚合展示）。 */
  gear?(username: string): string
}
