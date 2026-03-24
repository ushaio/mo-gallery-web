import { resolveAssetUrl, type PhotoDto, type StoryDto } from '@/lib/api'

/* ------------------------------------------------------------------ */
/*  WeChat-compatible inline style map                                 */
/* ------------------------------------------------------------------ */

const WECHAT_STYLES: Record<string, string> = {
  h1: 'font-size:28px;font-weight:700;line-height:1.4;margin:28px 0 14px;color:#333',
  h2: 'font-size:22px;font-weight:700;line-height:1.5;margin:24px 0 12px;color:#333',
  h3: 'font-size:18px;font-weight:700;line-height:1.5;margin:20px 0 10px;color:#333',
  h4: 'font-size:16px;font-weight:700;margin:16px 0 8px;color:#333',
  h5: 'font-size:16px;font-weight:700;margin:16px 0 8px;color:#333',
  h6: 'font-size:16px;font-weight:700;margin:16px 0 8px;color:#333',
  p: 'font-size:16px;line-height:2;margin:0 0 16px;color:#3f3f3f',
  strong: 'font-weight:700',
  b: 'font-weight:700',
  em: 'font-style:italic',
  i: 'font-style:italic',
  u: 'text-decoration:underline',
  s: 'text-decoration:line-through',
  blockquote: 'border-left:4px solid #ddd;padding:8px 16px;margin:16px 0;color:#666;font-style:italic',
  ul: 'list-style:disc;padding-left:22px;margin:12px 0',
  ol: 'list-style:decimal;padding-left:22px;margin:12px 0',
  li: 'font-size:16px;line-height:1.9;margin:0 0 6px',
  table: 'width:100%;border-collapse:collapse;margin:16px 0',
  th: 'border:1px solid #ddd;padding:8px;background:#f5f5f5;font-weight:700;text-align:left',
  td: 'border:1px solid #ddd;padding:8px;text-align:left',
  hr: 'border:none;border-top:1px solid #ddd;margin:20px 0',
  a: 'color:#576b95;text-decoration:none',
  pre: 'background:#f5f5f5;padding:12px 16px;margin:16px 0;overflow-x:auto;font-size:14px;font-family:Menlo,Consolas,monospace',
  code: 'background:#f5f5f5;padding:2px 6px;font-size:14px;font-family:Menlo,Consolas,monospace',
  img: 'display:block;max-width:100%;height:auto;margin:12px auto',
}

/** Style keys that should only apply when code is inline (not inside pre). */
const CODE_INSIDE_PRE_STYLE = 'background:none;padding:0;font-size:inherit;font-family:inherit'

/* ------------------------------------------------------------------ */
/*  Asset URL resolution (shared with plain-text formatter)            */
/* ------------------------------------------------------------------ */

function resolveStoryCopyAssetUrl(rawUrl: string, photos: PhotoDto[], cdnDomain?: string) {
  const trimmed = rawUrl.trim()
  if (!trimmed) return ''

  const normalizedUrl = trimmed.replace(/\s*=\s*\d+x\s*$/, '').trim()
  const matchedPhoto = photos.find((photo) => photo.url === normalizedUrl || photo.thumbnailUrl === normalizedUrl)

  if (matchedPhoto) return resolveAssetUrl(matchedPhoto.url, cdnDomain)
  if (/^(https?:\/\/|data:|blob:|uploading:\/\/)/i.test(normalizedUrl)) return normalizedUrl
  return resolveAssetUrl(normalizedUrl, cdnDomain)
}

/* ------------------------------------------------------------------ */
/*  DOM walker — apply inline styles recursively                       */
/* ------------------------------------------------------------------ */

function mergeStyle(existing: string, extra: string) {
  const base = existing.trim().replace(/;?$/, '')
  return base ? `${base};${extra}` : extra
}

function walkNode(node: Node, photos: PhotoDto[], cdnDomain: string | undefined, insidePre: boolean) {
  if (node.nodeType !== 1) return // only process Element nodes

  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()

  // Remove class — WeChat ignores it and it just bloats the output
  el.removeAttribute('class')

  // Apply base inline style from map
  const baseStyle = WECHAT_STYLES[tag]
  if (baseStyle) {
    // Special case: <code> inside <pre> should not get its own background
    const style = tag === 'code' && insidePre ? CODE_INSIDE_PRE_STYLE : baseStyle
    el.setAttribute('style', mergeStyle(el.getAttribute('style') || '', style))
  }

  // Resolve <img> src
  if (tag === 'img') {
    const rawSrc = el.getAttribute('src') || ''
    const resolved = resolveStoryCopyAssetUrl(rawSrc, photos, cdnDomain)
    if (resolved) el.setAttribute('src', resolved)

    // Preserve editor-set width as inline style
    const widthAttr = el.getAttribute('width')
    if (widthAttr) {
      const px = parseInt(widthAttr, 10)
      if (Number.isFinite(px) && px > 0) {
        el.setAttribute('style', mergeStyle(el.getAttribute('style') || '', `width:${px}px`))
      }
      el.removeAttribute('width')
    }

    // Preserve data-align from TipTap
    const align = el.getAttribute('data-align')
    if (align === 'center') {
      el.setAttribute('style', mergeStyle(el.getAttribute('style') || '', 'margin-left:auto;margin-right:auto'))
    } else if (align === 'right') {
      el.setAttribute('style', mergeStyle(el.getAttribute('style') || '', 'margin-left:auto;margin-right:0'))
    }
    el.removeAttribute('data-align')
    el.removeAttribute('data-type')
  }

  const inlineFontSize = el.style.fontSize?.trim()
  if (inlineFontSize) {
    el.setAttribute('style', mergeStyle(el.getAttribute('style') || '', `font-size:${inlineFontSize}`))
  }

  const inlineFontFamily = el.style.fontFamily?.trim()
  if (inlineFontFamily) {
    el.setAttribute('style', mergeStyle(el.getAttribute('style') || '', `font-family:${inlineFontFamily}`))
  }

  // Walk children
  const isPreContext = insidePre || tag === 'pre'
  for (let i = 0; i < el.childNodes.length; i++) {
    walkNode(el.childNodes[i], photos, cdnDomain, isPreContext)
  }
}

/* ------------------------------------------------------------------ */
/*  Public API — HTML formatter                                        */
/* ------------------------------------------------------------------ */

export function formatStoryAsWechatHtml(story: StoryDto, cdnDomain?: string) {
  const photos = story.photos || []
  const content = story.content || ''
  if (!content.trim()) return ''

  const parser = new DOMParser()
  const doc = parser.parseFromString(content, 'text/html')

  // Walk all top-level body children
  for (let i = 0; i < doc.body.childNodes.length; i++) {
    walkNode(doc.body.childNodes[i], photos, cdnDomain, false)
  }

  const bodyHtml = doc.body.innerHTML

  // Build title
  const titleHtml = story.title.trim()
    ? `<h1 style="${WECHAT_STYLES.h1};text-align:center">${escapeHtml(story.title.trim())}</h1>`
    : ''

  return `<div style="max-width:677px;margin:0 auto;padding:16px 12px;color:#333;font-size:16px;line-height:2">${titleHtml}${bodyHtml}</div>`
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* ------------------------------------------------------------------ */
/*  Public API — plain text formatter (kept for text/plain fallback)   */
/* ------------------------------------------------------------------ */

const HTML_BREAK_PATTERN = /<br\s*\/?>/gi
const HTML_TAG_STRIP_PATTERN = /<[^>]+>/g

function stripToPlainText(html: string) {
  return html
    .replace(HTML_BREAK_PATTERN, '\n')
    .replace(/<\/(p|div|section|article|blockquote|h[1-6]|ul|ol)>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(HTML_TAG_STRIP_PATTERN, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function formatStoryAsPlainText(story: StoryDto) {
  const body = stripToPlainText(story.content || '')
  return [story.title.trim(), body].filter(Boolean).join('\n\n')
}

/* ------------------------------------------------------------------ */
/*  Clipboard helpers                                                  */
/* ------------------------------------------------------------------ */

export async function copyHtmlToClipboard(html: string, plainText: string) {
  // Modern Clipboard API with HTML support
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      }),
    ])
    return
  }

  // Fallback: use a hidden contenteditable div + execCommand
  const container = document.createElement('div')
  container.setAttribute('contenteditable', 'true')
  container.innerHTML = html
  container.style.position = 'fixed'
  container.style.opacity = '0'
  container.style.pointerEvents = 'none'
  document.body.appendChild(container)

  const range = document.createRange()
  range.selectNodeContents(container)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)

  try {
    const copied = document.execCommand('copy')
    if (!copied) throw new Error('execCommand copy failed')
  } finally {
    selection?.removeAllRanges()
    document.body.removeChild(container)
  }
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
    if (!copied) throw new Error('execCommand copy failed')
  } finally {
    document.body.removeChild(textarea)
  }
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

export async function copyStoryAsWechatArticle(story: StoryDto, cdnDomain?: string) {
  const html = formatStoryAsWechatHtml(story, cdnDomain)
  const plainText = formatStoryAsPlainText(story)
  await copyHtmlToClipboard(html || plainText, plainText)
  return html || plainText
}

/** @deprecated Use formatStoryAsPlainText instead */
export { formatStoryAsPlainText as formatStoryAsWechatArticle }
