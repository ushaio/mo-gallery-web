'use client'

import { useCallback, useMemo } from 'react'

import type { PhotoSiteMetadata } from '@mo-gallery/content-core'
import { ArticleBody } from '@mo-gallery/public-site'

import { StoryRichContent } from '@/components/StoryRichContent'
import type { EditorType, PhotoDto, TiptapJsonContent } from '@/lib/api/types'
import { createWebMediaUrlResolver, photoDtoFromSite, toSitePhoto } from '@/lib/public-site'

interface PublicArticleBodyProps {
  articleId: string
  editorType: EditorType
  tiptapContent: string
  tiptapContentJson?: TiptapJsonContent | null
  milkContent?: string | null
  photos: PhotoDto[]
  cdnDomain?: string
  className?: string
  onPhotoClick?: (photo: PhotoDto) => void
}

/**
 * 访客文章正文渲染的宿主封装（mo-cloud-parity-plan W1）：
 * 正文分派逻辑下沉在 @mo-gallery/public-site 的 ArticleBody（milkdown →
 * 共享只读渲染器；tiptap + tiptapContentJson → 共享 TiptapJsonView 结构化
 * 渲染，不注入 HTML），web 经本组件注入数据映射 / 媒体 URL / 站内路由适配器。
 * 仅有 HTML 存量（tiptapContentJson 缺失）的文章回落本地 StoryRichContent
 * 既有管线，行为不变。
 */
export function PublicArticleBody({
  articleId,
  editorType,
  tiptapContent,
  tiptapContentJson,
  milkContent,
  photos,
  cdnDomain,
  className,
  onPhotoClick,
}: PublicArticleBodyProps) {
  const sitePhotos = useMemo(() => photos.map(toSitePhoto), [photos])
  const resolver = useMemo(
    () => createWebMediaUrlResolver(cdnDomain == null ? null : { cdn_domain: cdnDomain }),
    [cdnDomain],
  )
  // 与 StoryRichContent 的根类名保持一致：正文排版样式由 story-rich-content.css
  // 提供，且对共享 TiptapJsonView 输出的结构同样生效。
  const bodyClassName = useMemo(
    () => ['story-rich-content', onPhotoClick ? 'story-rich-content--interactive' : '', className]
      .filter(Boolean).join(' '),
    [className, onPhotoClick],
  )

  const handleOpenPhoto = useCallback((sitePhoto: PhotoSiteMetadata) => {
    const photo = photoDtoFromSite(sitePhoto)
    if (photo) onPhotoClick?.(photo)
  }, [onPhotoClick])

  const renderTiptapHtmlFallback = useCallback((content: string) => (
    <StoryRichContent
      editorType="tiptap"
      content={content}
      milkContent={null}
      photos={photos}
      cdnDomain={cdnDomain}
      className={className}
      onPhotoClick={onPhotoClick}
    />
  ), [cdnDomain, className, onPhotoClick, photos])

  return (
    <ArticleBody
      articleId={articleId}
      editorType={editorType}
      tiptapContent={tiptapContent}
      tiptapContentJson={tiptapContentJson}
      milkContent={milkContent}
      resolver={resolver}
      photos={sitePhotos}
      className={bodyClassName}
      onOpenPhoto={onPhotoClick ? handleOpenPhoto : undefined}
      renderTiptapHtmlFallback={renderTiptapHtmlFallback}
    />
  )
}
