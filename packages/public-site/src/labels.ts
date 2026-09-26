/**
 * 访客组件的界面文案。组件不内嵌宿主 i18n 体系：宿主传入本类型的覆盖值，
 * 缺省回落到中文默认文案。键按「组件域.用途」平铺命名。
 */
export interface PublicSiteLabels {
  /** 导航 */
  navGallery: string
  navAlbums: string
  navBlog: string
  navStory: string
  navFilm: string
  navFriends: string
  navGear: string
  /** 空态 */
  emptyPhotos: string
  emptyAlbums: string
  emptyArticles: string
  emptyFilmRolls: string
  emptyComments: string
  /** 通用 */
  loading: string
  loadMore: string
  back: string
  /** 灯箱 */
  lightboxClose: string
  lightboxPrev: string
  lightboxNext: string
  /** 时间线 */
  timelineUploaded: string
  /** 相册 */
  albumPhotoCountSuffix: string
  /** 胶卷 */
  filmFrameCountSuffix: string
  filmIsoLabel: string
  /** 文章 */
  articleUncategorized: string
  /** 评论 */
  commentsTitle: string
  commentsDisabled: string
  commentPlaceholder: string
  commentSubmit: string
  commentSubmitting: string
  commentLoginRequired: string
  commentPostFailed: string
}

export const DEFAULT_PUBLIC_SITE_LABELS: PublicSiteLabels = {
  navGallery: '图库',
  navAlbums: '相册',
  navBlog: '博客',
  navStory: '故事',
  navFilm: '胶卷',
  navFriends: '友链',
  navGear: '器材',
  emptyPhotos: '还没有照片',
  emptyAlbums: '还没有相册',
  emptyArticles: '暂无内容',
  emptyFilmRolls: '还没有胶卷',
  emptyComments: '还没有评论',
  loading: '加载中…',
  loadMore: '加载更多',
  back: '返回',
  lightboxClose: '关闭',
  lightboxPrev: '上一张',
  lightboxNext: '下一张',
  timelineUploaded: '上传',
  albumPhotoCountSuffix: '张照片',
  filmFrameCountSuffix: '帧',
  filmIsoLabel: 'ISO',
  articleUncategorized: '未分类',
  commentsTitle: '评论',
  commentsDisabled: '评论已关闭',
  commentPlaceholder: '写下你的评论…',
  commentSubmit: '发表评论',
  commentSubmitting: '发布中…',
  commentLoginRequired: '登录后即可评论',
  commentPostFailed: '评论发布失败，请稍后再试',
}

/** 合并宿主覆盖（浅合并，键级生效）。 */
export function resolveLabels(overrides?: Partial<PublicSiteLabels>): PublicSiteLabels {
  return { ...DEFAULT_PUBLIC_SITE_LABELS, ...overrides }
}
