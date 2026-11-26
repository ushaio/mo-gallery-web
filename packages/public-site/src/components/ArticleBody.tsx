'use client'

import { useMemo, type ReactNode } from 'react'

import type { PhotoSiteMetadata, SiteArticle } from '@mo-gallery/content-core'
import { MilkdownContent } from '@mo-gallery/milkdown/content'
import type { MediaLinkPreviewResolver } from '@mo-gallery/milkdown/media'
import type { MediaUrlResolver } from '../adapters'
import { TiptapJsonView } from './TiptapJsonView'

/**
 * 访客文章正文渲染（按编辑器格式分派的安全只读管线）：
 * - milkdown：@mo-gallery/milkdown 的只读 Markdown 渲染器（ReactMarkdown
 *   管线，不渲染裸 HTML）；
 * - tiptap + `tiptapContentJson`：TiptapJsonView 结构化 JSON 渲染（不消费
 *   HTML 字符串）；
 * - tiptap 仅有 HTML 存量（无 JSON）：交给宿主的 `renderTiptapHtmlFallback`
 *   兜底（如 Web 的既有富文本管线）；宿主未提供兜底时不渲染正文。
 *
 * W1（mo-cloud-parity-plan）：从 ArticleView 的正文分支抽出，供宿主
 * （Web /story、/blog 详情页）只复用正文渲染、保留各自的页面框架。
 */
export interface ArticleBodyProps {
  articleId: string
  /** 已选定编辑器格式（SiteArticle['contentRef']['editorType']）。 */
  editorType: string
  tiptapContent?: string
  tiptapContentJson?: SiteArticle['tiptapContentJson']
  milkContent?: SiteArticle['milkContent']
  resolver: MediaUrlResolver
  /** 正文内联照片（milkdown 媒体卡回显 / tiptap photoId 解析用）。 */
  photos?: PhotoSiteMetadata[]
  resolvePhotoUrl?: (photoId: string, rawUrl: string) => string
  className?: string
  strict?: boolean
  /** 正文内联照片点击回调（可选，如打开灯箱）。 */
  onOpenPhoto?: (photo: PhotoSiteMetadata) => void
  /** 站内引用（storyLinkCard 的 data-url 等）→ 宿主路由地址。 */
  resolveInternalHref?: (rawHref: string) => string
  /** tiptap 无 JSON 存量时的宿主兜底渲染；不传则该类正文不渲染。 */
  renderTiptapHtmlFallback?: (content: string) => ReactNode
  /**
   * 链接卡元信息补抓（可选）。访客侧不传 —— 读者打开文章不该触发第三方站点请求；
   * 已登录的站内预览可以传入，让老文档里的链接卡也显示出站点名 / 摘要 / 封面。
   */
  resolveLinkPreview?: MediaLinkPreviewResolver
}

export const ArticleBody = function ArticleBody({
  articleId,
  editorType,
  tiptapContent,
  tiptapContentJson,
  milkContent,
  resolver,
  photos,
  resolvePhotoUrl,
  className,
  strict,
  onOpenPhoto,
  resolveInternalHref,
  renderTiptapHtmlFallback,
  resolveLinkPreview,
}: ArticleBodyProps) {
  const photoById = useMemo(() => {
    const map = new Map<string, PhotoSiteMetadata>()
    for (const photo of photos ?? []) map.set(photo.id, photo)
    return map
  }, [photos])

  if (strict && editorType !== 'milkdown' && editorType !== 'tiptap') {
    throw new Error(`暂不支持这篇叙事的正文格式（${editorType}）。`)
  }

  if (editorType === 'milkdown') {
    return (
      <MilkdownContent
        content={milkContent ?? ''}
        className={className}
        resolveMediaUrl={(src, photoId) => {
          const matched = photoId ? photoById.get(photoId) : undefined
          try {
            if (photoId && resolvePhotoUrl) return resolvePhotoUrl(photoId, src)
            return matched ? resolver.photoDisplay(matched) : resolver.articleAsset(articleId, src)
          } catch (error) {
            if (strict) throw error
            return src
          }
        }}
        onPhotoClick={onOpenPhoto
          ? (photoId) => {
              const matched = photoById.get(photoId)
              if (matched) onOpenPhoto(matched)
            }
          : undefined}
        resolveLinkPreview={resolveLinkPreview}
      />
    )
  }

  if (tiptapContentJson) {
    return (
      <TiptapJsonView
        doc={tiptapContentJson}
        strict={strict}
        resolveAssetUrl={(rawUrl) => {
          try {
            return resolver.articleAsset(articleId, rawUrl)
          } catch (error) {
            if (strict) throw error
            return rawUrl
          }
        }}
        resolvePhotoUrl={(photoId, rawUrl) => {
          const matched = photoById.get(photoId)
          try {
            if (resolvePhotoUrl) return resolvePhotoUrl(photoId, rawUrl)
            return matched ? resolver.photoDisplay(matched) : resolver.articleAsset(articleId, rawUrl)
          } catch (error) {
            if (strict) throw error
            return rawUrl
          }
        }}
        onPhotoClick={onOpenPhoto
          ? (photoId) => {
              const matched = photoById.get(photoId)
              if (matched) onOpenPhoto(matched)
            }
          : undefined}
        resolveInternalHref={resolveInternalHref}
        className={className}
      />
    )
  }

  if (editorType === 'tiptap' && tiptapContent) {
    if (strict) throw new Error('这篇叙事缺少结构化正文，暂时无法阅读。')
    return <>{renderTiptapHtmlFallback?.(tiptapContent) ?? null}</>
  }

  return null
}
