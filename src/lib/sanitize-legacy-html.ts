'use client'

import DOMPurify from 'isomorphic-dompurify'

const ALLOWED_TAGS = [
  'a', 'blockquote', 'br', 'code', 'del', 'div', 'em', 'h1', 'h2', 'h3', 'h4',
  'hr', 'iframe', 'img', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'u', 'ul',
]

const ALLOWED_ATTR = [
  'alt', 'class', 'data-align', 'data-media-url', 'data-photo-id', 'data-provider',
  'data-type', 'height', 'href', 'loading', 'rel', 'src', 'target', 'title', 'width',
]

function safeUrl(value: string, allowRelative = true): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (allowRelative && trimmed.startsWith('/')) return true
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

/** Legacy HTML is sanitized after media/link normalization and before DOM injection. */
export function sanitizeLegacyHtml(html: string): string {
  if (typeof window === 'undefined') return ''

  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ['base', 'form', 'math', 'object', 'script', 'style', 'svg', 'template'],
    FORBID_ATTR: ['style'],
    ALLOW_DATA_ATTR: false,
    RETURN_TRUSTED_TYPE: false,
  })
  const container = document.createElement('div')
  container.innerHTML = clean

  for (const element of Array.from(container.querySelectorAll<HTMLElement>('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction') {
        element.removeAttribute(attribute.name)
      }
    }
    if (element.hasAttribute('href') && !safeUrl(element.getAttribute('href') ?? '')) element.removeAttribute('href')
    if (element.hasAttribute('src') && !safeUrl(element.getAttribute('src') ?? '')) element.removeAttribute('src')
    if (element.tagName === 'IFRAME' && !/^https:\/\//i.test(element.getAttribute('src') ?? '')) element.remove()
    if (element.tagName === 'A') {
      element.setAttribute('rel', 'noreferrer noopener')
      element.setAttribute('target', '_blank')
    }
  }
  return container.innerHTML
}
