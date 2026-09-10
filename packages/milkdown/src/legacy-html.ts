import { fromHtml } from 'hast-util-from-html'
import { legacyCss, legacyString } from './legacy-style'
import type { LegacyMark, LegacyNode } from './legacy-content'

type HtmlNode = ReturnType<typeof fromHtml>['children'][number]
const text = (node: HtmlNode): string => node.type === 'text' ? node.value : node.type === 'element' ? node.children.map(text).join('') : ''

function convert(node: HtmlNode, marks: LegacyMark[] = []): LegacyNode[] {
  if (node.type === 'text') return [{ type: 'text', text: node.value.replace(/[\t\r\n ]+/g, ' '), ...(marks.length ? { marks } : {}) }]
  if (node.type !== 'element') return []
  const tag = node.tagName
  if (['script', 'style', 'noscript', 'head', 'meta', 'link', 'input', 'button', 'svg'].includes(tag)) return []
  const props = node.properties
  const data = (name: string) => props[`data${name}`]
  const type = data('Type')
  const css = legacyCss(props.style)
  const attrs: Record<string, unknown> = { pastedStyle: props.style, color: props.color, fontFamily: props.face, backgroundColor: props.bgColor, textAlign: css['text-align'] || props.align }

  if (tag === 'iframe' || ['media-embed', 'music-embed', 'spotify-embed'].includes(String(type))) return [{
    type: 'mediaEmbed', attrs: { provider: data('Provider') || (type === 'spotify-embed' ? 'spotify' : undefined), url: data('Url'), src: props.src || data('Src'), title: props.title || data('Title'), height: props.height || data('Height') },
  }]
  if (type === 'story-link-card') return [{ type: 'storyLinkCard', attrs: { storyId: data('StoryId'), url: data('Url'), title: data('Title'), summary: data('Summary'), coverUrl: data('CoverUrl'), date: data('Date') } }]
  if (Object.hasOwn(props, 'dataImageUploadPlaceholder')) return [{ type: 'imageUploadPlaceholder', attrs: { uploadId: data('UploadId'), fileName: data('FileName') } }]
  if (tag === 'img') return [{ type: 'image', attrs: { ...attrs, src: props.src, alt: props.alt, title: props.title, photoId: data('PhotoId'), width: props.width || css.width } }]
  if (tag === 'audio' || tag === 'video') {
    const source = node.children.find((child) => child.type === 'element' && child.tagName === 'source')
    return [{ type: tag, attrs: { ...attrs, src: props.src || (source?.type === 'element' ? source.properties.src : undefined), title: props.title, poster: props.poster } }]
  }
  if (tag === 'br') return [{ type: 'hardBreak' }]
  if (tag === 'hr') return [{ type: 'horizontalRule' }]
  if (tag === 'pre') {
    const code = node.children.find((child) => child.type === 'element' && child.tagName === 'code')
    const language = code?.type === 'element' && Array.isArray(code.properties.className) ? code.properties.className.find((name) => String(name).startsWith('language-')) : ''
    return [{ type: 'codeBlock', attrs: { language: String(language || '').replace(/^language-/, '') }, content: [{ type: 'text', text: text(node) }] }]
  }

  const inherited = [...marks]
  const markTypes: Record<string, string | undefined> = { strong: 'bold', b: 'bold', em: 'italic', i: 'italic', s: 'strike', del: 'strike', strike: 'strike', u: 'underline', code: 'code' }
  const mark = markTypes[tag]
  if (mark) inherited.push({ type: mark })
  if (tag === 'a') inherited.push({ type: 'link', attrs: { href: props.href } })
  if (tag === 'mark') inherited.push({ type: 'highlight', attrs: { color: css['background-color'] } })
  const block = ['p', 'div', 'section', 'article', 'figure', 'figcaption', 'blockquote', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)
  if (!block && (props.style || props.color || props.face)) inherited.push({ type: 'pastedStyle', attrs: { style: props.style, color: props.color || css.color, fontFamily: props.face || css['font-family'] } })
  if (/^(?:bold|[6-9]00)$/.test(css['font-weight'] ?? '')) inherited.push({ type: 'bold' })
  if (/italic|oblique/.test(css['font-style'] ?? '')) inherited.push({ type: 'italic' })
  const content = node.children.flatMap((child) => convert(child, inherited))
  if (/^h[1-6]$/.test(tag)) return [{ type: 'heading', attrs: { ...attrs, level: Number(tag[1]) }, content }]
  if (tag === 'p' || tag === 'figcaption') return [{ type: 'paragraph', attrs, content }]
  if (tag === 'blockquote') return [{ type: 'blockquote', attrs, content }]
  if (tag === 'ul' || tag === 'ol') return [{ type: type === 'taskList' ? 'taskList' : tag === 'ol' ? 'orderedList' : 'bulletList', attrs: { ...attrs, start: props.start }, content }]
  if (tag === 'li') return [{ type: type === 'taskItem' ? 'taskItem' : 'listItem', attrs: { ...attrs, checked: data('Checked') === 'true' || data('Checked') === true }, content }]
  if (tag === 'table') return [{ type: 'table', attrs, content }]
  if (tag === 'tr') return [{ type: 'tableRow', content }]
  if (tag === 'td' || tag === 'th') return [{ type: tag === 'th' ? 'tableHeader' : 'tableCell', attrs: { ...attrs, colspan: props.colSpan, rowspan: props.rowSpan }, content }]
  if (['div', 'section', 'article', 'figure'].includes(tag)) return [{ type: 'div', attrs, content }]
  return content
}

/** Parse stored HTML as inert data; no DOM, scripts, browser connection or network requests. */
export function legacyHtmlDocument(html: string): LegacyNode {
  const source = legacyString(html)
  const fragment = !/^\s*(?:<!doctype|<html)(?:\s|>)/i.test(source)
  return { type: 'doc', content: fromHtml(source, { fragment }).children.flatMap((node) => convert(node)) }
}
