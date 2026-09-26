import type { PhotoSiteMetadata } from '@mo-gallery/content-core'
import type { LinkAdapter, MediaUrlResolver } from '@mo-gallery/public-site'

import { resolveAssetUrl } from '@/lib/api/core'
import type { PhotoDto, PublicSettingsDto } from '@/lib/api/types'

/**
 * Web → @mo-gallery/public-site 宿主适配器（mo-cloud-parity-plan W1）。
 *
 * web 保持自部署单租户形态：领域模型里的 ownerId 在这里恒为 'self'，
 * 内容一律视为已发布；存储地址/CDN 域名解析仍走 web 自己的
 * resolveAssetUrl（storage provider 语义不进入共享组件）。
 */

/**
 * PhotoDto 的 url/thumbnailUrl 等存储字段不属于 content-core 领域模型，
 * 用 WeakMap 挂在映射结果旁，由 MediaUrlResolver 取回。映射结果与 DTO
 * 一一对应、同生命周期，WeakMap 即可，无泄漏风险。
 */
const photoDtoRegistry = new WeakMap<PhotoSiteMetadata, PhotoDto>()

/** PhotoDto → 访客领域模型（共享组件渲染入参）。 */
export function toSitePhoto(photo: PhotoDto): PhotoSiteMetadata {
  const createdAt = new Date(photo.createdAt)
  const metadata: PhotoSiteMetadata = {
    id: photo.id,
    ownerId: 'self',
    cloudImageId: photo.id,
    title: photo.title,
    tags: photo.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    featured: photo.isFeatured,
    publication: 'published',
    width: photo.width > 0 ? photo.width : undefined,
    height: photo.height > 0 ? photo.height : undefined,
    takenAt: photo.takenAt ? new Date(photo.takenAt) : undefined,
    dominantColors: photo.dominantColors,
    cameraMake: photo.cameraMake,
    cameraModel: photo.cameraModel,
    lensModel: photo.lensModel,
    iso: photo.iso,
    createdAt,
    updatedAt: photo.updatedAt ? new Date(photo.updatedAt) : createdAt,
  }
  photoDtoRegistry.set(metadata, photo)
  return metadata
}

/** 取回站点照片对应的原始 DTO（映射结果与 DTO 一一对应，见 toSitePhoto）。 */
export function photoDtoFromSite(sitePhoto: PhotoSiteMetadata): PhotoDto | null {
  return photoDtoRegistry.get(sitePhoto) ?? null
}

/** 媒体 URL 解析：缩略图优先，缺失回落展示图；CDN 域名来自公共设置。 */
export function createWebMediaUrlResolver(settings: Pick<PublicSettingsDto, 'cdn_domain'> | null): MediaUrlResolver {
  const cdnDomain = settings?.cdn_domain
  return {
    photoDisplay: (photo) => {
      const dto = photoDtoRegistry.get(photo)
      return resolveAssetUrl(dto?.url ?? '', cdnDomain)
    },
    photoThumbnail: (photo) => {
      const dto = photoDtoRegistry.get(photo)
      return resolveAssetUrl(dto?.thumbnailUrl || dto?.url || '', cdnDomain)
    },
    articleAsset: (_articleId, assetRef) => resolveAssetUrl(assetRef, cdnDomain),
  }
}

/** 站内路由（web 根路径，无 username 前缀）。 */
export function createWebLinkAdapter(): LinkAdapter {
  return {
    home: () => '/',
    gallery: () => '/gallery',
    album: (_username, albumId) => `/gallery/albums/${albumId}`,
    // 冻结成员 article()：web 无 kind 中立的文章路由，回落到博客详情；
    // kind 敏感的路由一律走 articleIndex/articleByKind。
    article: (_username, idOrSlug) => `/blog/${idOrSlug}`,
    articleIndex: (_username, kind) => (kind === 'story' ? '/story' : '/blog'),
    articleByKind: (_username, kind, idOrSlug) => (kind === 'story' ? `/story/${idOrSlug}` : `/blog/${idOrSlug}`),
  }
}
