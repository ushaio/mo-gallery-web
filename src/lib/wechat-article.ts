import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MilkdownContent } from '@mo-gallery/milkdown/content'
import {
  copyWechatArticleToClipboard,
  formatWechatArticleHtml,
  formatWechatArticlePlainText,
} from '@mo-gallery/tiptap-editor'
import { resolveAssetUrl } from '@/lib/api/core'
import type { PhotoDto, StoryDto } from '@/lib/api/types'
import { findStoryPhotoById } from '@/lib/story-rich-content'

type WechatArticleSource = Pick<StoryDto, 'title' | 'photos'> & (
  | Pick<StoryDto, 'editorType' | 'tiptapContent' | 'milkContent'>
  | { content: string }
)

function resolveStoryCopyAssetUrl(rawUrl: string, photos: PhotoDto[], cdnDomain?: string, photoId?: string | null) {
  const matchedById = findStoryPhotoById(photos, photoId || undefined)
  if (matchedById) return resolveAssetUrl(matchedById.url, cdnDomain)

  const trimmed = rawUrl.trim()
  if (!trimmed) return ''

  const normalizedUrl = trimmed.replace(/\s*=\s*\d+x\s*$/, '').trim()
  const matchedPhoto = photos.find((photo) => photo.url === normalizedUrl || photo.thumbnailUrl === normalizedUrl)

  if (matchedPhoto) return resolveAssetUrl(matchedPhoto.url, cdnDomain)
  if (/^(https?:\/\/|data:|blob:|uploading:\/\/)/i.test(normalizedUrl)) return normalizedUrl
  return resolveAssetUrl(normalizedUrl, cdnDomain)
}

function getFormatOptions(story: WechatArticleSource, cdnDomain?: string) {
  const photos = story.photos || []
  return {
    resolveImageUrl: (rawUrl: string, photoId?: string | null) => (
      resolveStoryCopyAssetUrl(rawUrl, photos, cdnDomain, photoId)
    ),
  }
}

function getWechatContent(story: WechatArticleSource, cdnDomain?: string) {
  if ('content' in story) return story
  const content = story.editorType === 'milkdown'
    ? renderToStaticMarkup(createElement(MilkdownContent, {
        content: story.milkContent ?? '',
        resolveMediaUrl: (url, photoId) => resolveStoryCopyAssetUrl(url, story.photos, cdnDomain, photoId),
      }))
    : story.tiptapContent
  return { title: story.title, content, photos: story.photos }
}

export function formatStoryAsWechatHtml(story: WechatArticleSource, cdnDomain?: string) {
  return formatWechatArticleHtml(getWechatContent(story, cdnDomain), getFormatOptions(story, cdnDomain))
}

export function formatStoryAsPlainText(story: WechatArticleSource) {
  return formatWechatArticlePlainText(getWechatContent(story))
}

export async function copyStoryAsWechatArticle(story: WechatArticleSource, cdnDomain?: string) {
  return await copyWechatArticleToClipboard(getWechatContent(story, cdnDomain), getFormatOptions(story, cdnDomain))
}

/** @deprecated Use formatStoryAsPlainText instead. */
export { formatStoryAsPlainText as formatStoryAsWechatArticle }
export { copyHtmlToClipboard, copyTextToClipboard } from '@mo-gallery/tiptap-editor'
