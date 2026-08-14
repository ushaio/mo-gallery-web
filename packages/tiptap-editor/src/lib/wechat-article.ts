export interface WechatArticleSource {
  title: string
  content: string
}

export interface WechatArticleFormatOptions {
  resolveImageUrl?: (rawUrl: string, photoId?: string | null) => string
}

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
  hr: 'border:none;border-top:1px solid #333;margin:20px 0',
  a: 'color:#576b95;text-decoration:none',
  pre: 'background:#f5f5f5;padding:12px 16px;margin:16px 0;overflow-x:auto;font-size:14px;font-family:Menlo,Consolas,monospace',
  code: 'background:#f5f5f5;padding:2px 6px;font-size:14px;font-family:Menlo,Consolas,monospace',
  img: 'display:block;max-width:100%;height:auto;margin:12px auto',
}

const CODE_INSIDE_PRE_STYLE = 'background:none;padding:0;font-size:inherit;font-family:inherit'
const BLANK_LINE_PLACEHOLDER = '<span style="color:transparent;font-size:1px;line-height:1px">.</span>'
const HTML_BREAK_PATTERN = /<br\s*\/?>/gi
const HTML_TAG_STRIP_PATTERN = /<[^>]+>/g

function mergeStyle(existing: string, extra: string) {
  const base = existing.trim().replace(/;?$/, '')
  return base ? `${base};${extra}` : extra
}

function isBlankLineElement(element: HTMLElement) {
  if (element.tagName.toLowerCase() !== 'p') return false
  if (element.querySelector('img,video,audio,iframe,table,hr')) return false
  return !element.textContent?.replace(/\u00a0/g, '').trim()
}

function walkNode(node: Node, options: WechatArticleFormatOptions, insidePre: boolean) {
  if (node.nodeType !== 1) return

  const element = node as HTMLElement
  const tag = element.tagName.toLowerCase()
  element.removeAttribute('class')

  const baseStyle = WECHAT_STYLES[tag]
  if (baseStyle) {
    const style = tag === 'code' && insidePre ? CODE_INSIDE_PRE_STYLE : baseStyle
    element.setAttribute('style', mergeStyle(element.getAttribute('style') || '', style))
  }

  if (tag === 'img') {
    const rawSrc = (element.getAttribute('src') || '').replace(/\s*=\s*\d+x\s*$/, '').trim()
    const resolvedSrc = options.resolveImageUrl?.(rawSrc, element.getAttribute('data-photo-id')) || rawSrc
    if (resolvedSrc) element.setAttribute('src', resolvedSrc)

    const widthAttr = element.getAttribute('width')
    if (widthAttr) {
      const width = Number.parseInt(widthAttr, 10)
      if (Number.isFinite(width) && width > 0) {
        element.setAttribute('style', mergeStyle(element.getAttribute('style') || '', `width:${width}px`))
      }
      element.removeAttribute('width')
    }

    const align = element.getAttribute('data-align')
    if (align === 'center') {
      element.setAttribute('style', mergeStyle(element.getAttribute('style') || '', 'margin-left:auto;margin-right:auto'))
    } else if (align === 'right') {
      element.setAttribute('style', mergeStyle(element.getAttribute('style') || '', 'margin-left:auto;margin-right:0'))
    }
    element.removeAttribute('data-align')
    element.removeAttribute('data-type')
  }

  const inlineFontSize = element.style.fontSize?.trim()
  if (inlineFontSize) {
    element.setAttribute('style', mergeStyle(element.getAttribute('style') || '', `font-size:${inlineFontSize}`))
  }

  const inlineFontFamily = element.style.fontFamily?.trim()
  if (inlineFontFamily) {
    element.setAttribute('style', mergeStyle(element.getAttribute('style') || '', `font-family:${inlineFontFamily}`))
  }

  if (isBlankLineElement(element)) {
    element.innerHTML = BLANK_LINE_PLACEHOLDER
    element.setAttribute('style', mergeStyle(element.getAttribute('style') || '', 'height:1.6em;line-height:1.6em'))
    return
  }

  const childInsidePre = insidePre || tag === 'pre'
  for (let index = 0; index < element.childNodes.length; index += 1) {
    walkNode(element.childNodes[index], options, childInsidePre)
  }
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function formatWechatArticleHtml(source: WechatArticleSource, options: WechatArticleFormatOptions = {}) {
  if (!source.content.trim()) return ''

  const documentNode = new DOMParser().parseFromString(source.content, 'text/html')
  for (let index = 0; index < documentNode.body.childNodes.length; index += 1) {
    walkNode(documentNode.body.childNodes[index], options, false)
  }

  const titleHtml = source.title.trim()
    ? `<h1 style="${WECHAT_STYLES.h1};text-align:center">${escapeHtml(source.title.trim())}</h1>`
    : ''

  return `<div style="max-width:677px;margin:0 auto;padding:16px 12px;color:#333;font-size:16px;line-height:2">${titleHtml}${documentNode.body.innerHTML}</div>`
}

export function formatWechatArticlePlainText(source: WechatArticleSource) {
  const body = source.content
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

  return [source.title.trim(), body].filter(Boolean).join('\n\n')
}

export async function copyHtmlToClipboard(html: string, plainText: string) {
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      }),
    ])
    return
  }

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
    if (!document.execCommand('copy')) throw new Error('execCommand copy failed')
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
    if (!document.execCommand('copy')) throw new Error('execCommand copy failed')
  } finally {
    document.body.removeChild(textarea)
  }
}

export async function copyWechatArticleToClipboard(
  source: WechatArticleSource,
  options: WechatArticleFormatOptions = {},
) {
  const html = formatWechatArticleHtml(source, options)
  const plainText = formatWechatArticlePlainText(source)
  await copyHtmlToClipboard(html || plainText, plainText)
  return html || plainText
}
