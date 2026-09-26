/**
 * 个人站内容领域类型（PRD 09-25-shared-public-site R10/R11）。
 *
 * 关键约束：
 * - 租户以稳定的 ownerId（Official User.id）标识，username 只在解析层出现，
 *   永不进入本包的类型与查询。
 * - 站点发布（publication）与文件外部访问（external access / 图床）是两个
 *   正交维度：发布状态的变化绝不隐式修改外部访问，反之亦然。
 */

import type { TiptapJsonNode } from './tiptap-json'
export type { TiptapJsonNode } from './tiptap-json'

/** 文章/故事的领域种类（对齐 Official CloudArticle.kind 与 Web 的 blog/story 路由）。 */
export type SiteArticleKind = 'blog' | 'story'

/**
 * 站点级社交链接（UserSiteSetting.socialLinks 的投影，
 * 命名对齐 Web `src/app/layout.tsx` 消费的 `{ title, url, icon? }` 形状）。
 */
export interface SiteSocialLink {
  title: string
  url: string
  icon?: string
}

/** 站内发布状态：draft = 仅作者可见，published = 出现在个人站。 */
export type SitePublicationState = 'draft' | 'published'

/**
 * 站点照片元数据层：建立在 MO Cloud 的 CloudImage（字节源）之上，
 * 补齐个人站展示所需的站点字段。字节可达性（外部访问）由
 * `09-25-mo-cloud-file-access` 的访问契约单独管理，不在本类型中。
 */
export interface PhotoSiteMetadata {
  id: string
  /** 稳定的所有者 ID（Official User.id），不是 username。 */
  ownerId: string
  /** 字节源引用（Official CloudImage.id）。一个 CloudImage 至多对应一条站点元数据。 */
  cloudImageId: string
  title?: string
  description?: string
  tags: string[]
  albumId?: string
  featured: boolean
  publication: SitePublicationState
  publishedAt?: Date
  /** 上传管线提取的展示数据（宽高/EXIF 摘要等）由宿主 schema 落库后在此投影。 */
  width?: number
  height?: number
  takenAt?: Date
  dominantColors?: string[]
  /**
   * 器材 EXIF 投影（§四 迁移② 为 CloudPhotoSite 扩列 lens/iso/focal；
   * cameraMake/cameraModel 已在官方库落列）。均为可选，宿主按能力回填。
   */
  cameraMake?: string
  cameraModel?: string
  lensMake?: string
  lensModel?: string
  iso?: number
  /** 焦距（mm）。 */
  focalLength?: number
  createdAt: Date
  updatedAt: Date
}

/** 个人站文章/故事。内容行的编辑器格式契约由 @mo-gallery/api-client 定义。 */
export interface SiteArticle {
  id: string
  ownerId: string
  slug: string
  title: string
  summary?: string
  /** 文章种类（blog=博客 / story=故事）；缺省时由宿主按自身路由语义决定。 */
  kind?: SiteArticleKind
  /** 已选定编辑器格式的内容引用（TipTap JSON / Milkdown HTML 等），由宿主存储。 */
  contentRef: {
    editorType: string
  }
  /**
   * 访客渲染所需的内容正文（按 contentRef.editorType 取对应字段；
   * 形状对齐 api-client `ArticleContentDto`，均为可选——列表页可省略）。
   */
  tiptapContent?: string
  tiptapContentJson?: TiptapJsonNode | null
  milkContent?: string | null
  category?: string
  tags?: string[]
  coverPhotoId?: string
  storyDate?: Date
  publication: SitePublicationState
  publishedAt?: Date
  createdAt: Date
  updatedAt: Date
}

/** 每用户站点设置（个人站标题、简介等）。 */
export interface SiteSettings {
  ownerId: string
  siteTitle?: string
  bio?: string
  /**
   * 站点级可见性：个人主页是否对外可见。默认 true（与 R1 一致），
   * 与单条内容的发布状态、文件外部访问均正交。Official 持久化在
   * UserSiteSetting 表，Desktop 系统设置的站点开关读写同一份。
   */
  published: boolean
  /** 页脚社交链接（§四 迁移① UserSiteSetting.socialLinks）。 */
  socialLinks?: SiteSocialLink[]
  /** 页脚文案（§四 迁移① UserSiteSetting.footerText）。 */
  footerText?: string
  /** 访客评论开关（§四 迁移① UserSiteSetting.commentsEnabled，默认 false）。 */
  commentsEnabled?: boolean
  /** 评论是否需要审核后才可见（§四 迁移① UserSiteSetting.commentsModeration，默认 true）。 */
  commentsModeration?: boolean
  updatedAt: Date
}

export interface SiteAlbum {
  id: string
  ownerId: string
  title: string
  description?: string
  /** 相册内照片排序（按站点元数据 id）。 */
  photoIds: string[]
  publication: SitePublicationState
  createdAt: Date
  updatedAt: Date
}

/**
 * 云端胶卷（对齐 Official CloudFilmRoll / Web FilmRollDto 的访客投影）。
 * 胶卷本身没有独立发布状态：访客可见性 = 站点已发布 + 成员照片 published，
 * 由宿主的访客读取通道在查询层落实。
 */
export interface SiteFilmRoll {
  id: string
  ownerId: string
  name: string
  /** 胶卷品牌（如 Kodak Portra 400 的 Kodak），空串表示未填。 */
  brand?: string
  /** 胶卷规格（'135' | '120' 或宿主自定义字符串）。 */
  format?: string
  iso?: number
  notes?: string
  shootDate?: Date
  /** 成帧顺序的照片 id 集合（按站点元数据 id）。 */
  photoIds: string[]
  createdAt: Date
  updatedAt: Date
}

/** 访客评论状态（对齐 Web CommentDto 的 pending/approved/rejected 命名）。 */
export type SiteCommentStatus = 'pending' | 'approved' | 'rejected'

/**
 * 站点照片评论。决策 D2（MO 云）：访客评论仅限官网注册用户，
 * `authorUserId` 即官网账号 id；Web 自部署匿名评论时可为空，退化为
 * `authorName` 展示。`ip` 仅为 owner 侧审核用的可选快照，访客接口不得输出。
 */
export interface SiteComment {
  id: string
  ownerId: string
  /** 被评论的站点照片元数据 id（PhotoSiteMetadata.id）。 */
  photoId: string
  authorUserId?: string
  authorName: string
  content: string
  status: SiteCommentStatus
  ip?: string
  createdAt: Date
}

/**
 * 友情链接（显式沿用 Web `hono/friends.ts` 的 isActive/featured/sortOrder 命名，
 * 对齐 §四 迁移② CloudFriendLink；Web 的 FriendLinkDto 中 avatar 对应此处的 avatarUrl）。
 */
export interface SiteFriendLink {
  id: string
  ownerId: string
  name: string
  url: string
  avatarUrl?: string
  description?: string
  featured: boolean
  isActive: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

/** 器材聚合（§3.1 …/cameras、…/lenses）：访客照片按 EXIF 器材分组后的计数投影。 */
export interface SiteCameraAggregate {
  cameraMake?: string
  cameraModel?: string
  photoCount: number
}

export interface SiteLensAggregate {
  lensMake?: string
  lensModel?: string
  photoCount: number
}
