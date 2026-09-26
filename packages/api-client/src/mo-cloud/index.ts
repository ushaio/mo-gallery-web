/**
 * @mo-gallery/api-client mo-cloud 子模块 —— 官网「MO 云」契约与 per-instance
 * 客户端（mo-cloud-parity-plan S3/M5）。
 *
 * 入口：`createMoCloudClient({ baseUrl, getToken, getScope? })`，命名空间
 * `cloud`（/api/cloud/*）、`site`（/api/site/*）、`publicSites`
 * （/api/public/sites/*）、`ai`（/api/ai/*）。
 */
export {
  MO_CLOUD_LOGIN_REQUIRED,
  MoCloudError,
  createMoCloudClient,
  isMoCloudLoginRequired,
} from './client'
export type {
  MoAiNamespace,
  MoCloudClient,
  MoCloudClientOptions,
  MoCloudNamespace,
  MoPublicNamespace,
  MoSiteNamespace,
} from './client'
export type {
  MoAiImageGenerationInput,
  MoAiImageGenerationResult,
  MoCloudHashPrecheckResult,
  MoCloudImageItem,
  MoCloudImagePage,
  MoCloudQuotaSummary,
  MoCloudSiteMeta,
  MoCloudUploadResult,
  MoCloudUsage,
  MoPublicAlbum,
  MoPublicAlbumDetail,
  MoPublicArticle,
  MoPublicArticleListItem,
  MoPublicArticlePage,
  MoPublicComment,
  MoPublicCommentPage,
  MoPublicFilmRoll,
  MoPublicFilmRollDetail,
  MoPublicGearAggregate,
  MoPublicPhoto,
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
