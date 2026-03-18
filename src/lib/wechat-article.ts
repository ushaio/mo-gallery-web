import { resolveAssetUrl, type PhotoDto, type StoryDto } from '@/lib/api'

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g
const HTML_IMAGE_TAG_PATTERN = /<img\b[^>]*src=(['"])(.*?)\1[^>]*>/gi
const HTML_ANCHOR_PATTERN = /<a\b[^>]*href=(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi
const HTML_BREAK_PATTERN = /<br\s*\/?>/gi
const HTML_BLOCK_CLOSE_PATTERN = /<\/(p|div|section|article|blockquote|h[1-6]|ul|ol)>/gi
const HTML_LIST_ITEM_PATTERN = /<li\b[^>]*>/gi
const HTML_TAG_PATTERN = /<[^>]+>/g
const MARKDOWN_HEADING_PATTERN = /^\s{0,3}#{1,6}\s+/gm
const MARKDOWN_QUOTE_PATTERN = /^\s{0,3}>\s?/gm
const MARKDOWN_LIST_PATTERN = /^\s*[-*+]\s+/gm
const MARKDOWN_ORDERED_LIST_PATTERN = /^\s*\d+\.\s+/gm
const MULTI_BLANK_LINES_PATTERN = /\n{3,}/g
const WHITESPACE_BEFORE_NEWLINE_PATTERN = /[ \t]+\n/g
const TRAILING_SPACE_PATTERN = /[ \t]{2,}/g

function resolveStoryCopyAssetUrl(rawUrl: string, photos: PhotoDto[], cdnDomain?: string) {
  const trimmed = rawUrl.trim()
  if (!trimmed) return ''

  const normalizedUrl = trimmed.replace(/\s*=\s*\d+x\s*$/, '').trim()
  const matchedPhoto = photos.find((photo) => photo.url === normalizedUrl || photo.thumbnailUrl === normalizedUrl)

  if (matchedPhoto) return resolveAssetUrl(matchedPhoto.url, cdnDomain)
  if (/^(https?:\/\/|data:|blob:|uploading:\/\/)/i.test(normalizedUrl)) return normalizedUrl
  return resolveAssetUrl(normalizedUrl, cdnDomain)
}

function stripHtmlText(value: string) {
  return value
    .replace(HTML_BREAK_PATTERN, '\n')
    .replace(HTML_TAG_PATTERN, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim()
}

export function formatStoryAsWechatArticle(story: StoryDto, cdnDomain?: string) {
  const photos = story.photos || []
  let articleBody = story.content || ''

  articleBody = articleBody.replace(MARKDOWN_IMAGE_PATTERN, (_match, alt: string, rawSrc: string) => {
    const imageUrl = resolveStoryCopyAssetUrl(rawSrc, photos, cdnDomain)
    const label = alt.trim() || 'Image'
    return imageUrl ? `\n\n[Image] ${label}\n${imageUrl}\n\n` : `\n\n[Image] ${label}\n\n`
  })

  articleBody = articleBody.replace(HTML_IMAGE_TAG_PATTERN, (match, _quote: string, rawSrc: string) => {
    const imageUrl = resolveStoryCopyAssetUrl(rawSrc, photos, cdnDomain)
    const altMatch = match.match(/\balt=(['"])(.*?)\1/i)
    const label = altMatch?.[2]?.trim() || 'Image'
    return imageUrl ? `\n\n[Image] ${label}\n${imageUrl}\n\n` : `\n\n[Image] ${label}\n\n`
  })

  articleBody = articleBody.replace(HTML_ANCHOR_PATTERN, (_match, _quote: string, href: string, innerText: string) => {
    const text = stripHtmlText(innerText)
    return text ? `${text} (${href})` : href
  })

  articleBody = articleBody
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 ($2)')
    .replace(HTML_BREAK_PATTERN, '\n')
    .replace(HTML_BLOCK_CLOSE_PATTERN, '\n\n')
    .replace(HTML_LIST_ITEM_PATTERN, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(MARKDOWN_HEADING_PATTERN, '')
    .replace(MARKDOWN_QUOTE_PATTERN, '')
    .replace(MARKDOWN_LIST_PATTERN, '- ')
    .replace(MARKDOWN_ORDERED_LIST_PATTERN, '1. ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/[*_~`]/g, '')
    .replace(HTML_TAG_PATTERN, '')
    .replace(/\r\n/g, '\n')
    .replace(WHITESPACE_BEFORE_NEWLINE_PATTERN, '\n')
    .replace(TRAILING_SPACE_PATTERN, ' ')
    .replace(MULTI_BLANK_LINES_PATTERN, '\n\n')
    .trim()

  return [story.title.trim(), articleBody].filter(Boolean).join('\n\n')
}

export async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    const copied = document.execCommand('copy')
    if (!copied) {
      throw new Error('execCommand copy failed')
    }
  } finally {
    document.body.removeChild(textarea)
  }
}

export async function copyStoryAsWechatArticle(story: StoryDto, cdnDomain?: string) {
  const text = formatStoryAsWechatArticle(story, cdnDomain)
  await copyTextToClipboard(text)
  return text
}
