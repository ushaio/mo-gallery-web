/**
 * Markdown ↔ HTML conversion utilities for TipTap editor
 */

import type { Editor } from '@tiptap/core'

export function escapeHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function convertPlainTextToEditorHtml(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return ''

  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export function normalizeInlineStyleValue(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, ' ') || ''
}

export function resolveActiveInlineStyleValue(
  currentEditor: Editor,
  attribute: 'fontSize' | 'fontFamily' | 'backgroundColor' | 'color',
  supportedValues: readonly string[],
  preserveRawValue = false
) {
  const activeValue = supportedValues.find((value) =>
    currentEditor.isActive('pastedStyle', { [attribute]: value })
  )
  if (activeValue) {
    return activeValue
  }

  const rawValue = (currentEditor.getAttributes('pastedStyle') as {
    fontSize?: string
    fontFamily?: string
    backgroundColor?: string
    color?: string
  })[attribute]
  const normalizedValue = normalizeInlineStyleValue(rawValue)

  return supportedValues.find((value) => normalizeInlineStyleValue(value) === normalizedValue)
    ?? (preserveRawValue ? normalizedValue : '')
}

export function normalizeHexColor(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null

  const withHash = normalized.startsWith('#') ? normalized : `#${normalized}`
  if (/^#[0-9a-f]{3}$/i.test(withHash)) {
    return `#${withHash[1]}${withHash[1]}${withHash[2]}${withHash[2]}${withHash[3]}${withHash[3]}`
  }

  if (/^#[0-9a-f]{6}$/i.test(withHash)) {
    return withHash
  }

  return null
}

export function ensureFirstParagraphHasDropCap(currentEditor: Editor) {
  let offset = 0

  for (let index = 0; index < currentEditor.state.doc.childCount; index += 1) {
    const child = currentEditor.state.doc.child(index)

    if (child.type.name === 'paragraph') {
      if (typeof child.attrs.dropCap === 'boolean') {
        return
      }

      const nextAttrs = {
        ...child.attrs,
        dropCap: true,
      }

      const transaction = currentEditor.state.tr.setNodeMarkup(offset, undefined, nextAttrs)
      currentEditor.view.dispatch(transaction)
      return
    }

    offset += child.nodeSize
  }
}

export function convertMarkdownToHtml(input: string): string {
  if (!input) return ''

  let result = input.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+=(\d+)x(\d+))?\)/g,
    (_match, alt, url, width) => {
      let widthAttr = ''
      if (width) {
        widthAttr = ` width="${width}"`
      }
      return `<img src="${url}" alt="${alt}"${widthAttr} />`
    }
  )

  result = result.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    '<a href="$2">$1</a>'
  )

  result = result.replace(
    /^(?:>\s?.+(?:\r?\n>\s?.+)*)/gm,
    (match) => {
      const quoteContent = match
        .split(/\r?\n/)
        .map((line) => line.replace(/^>\s?/, '').trim())
        .join('<br>')

      return `<blockquote><p>${quoteContent}</p></blockquote>`
    }
  )

  // Convert headers
  result = result
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // Convert inline formatting
  result = result
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`(.+?)`/g, '<code>$1</code>')

  // Convert unordered lists (consecutive lines starting with - or *)
  result = result.replace(
    /^([ \t]*[-*][ \t]+.+\n?)+/gm,
    (match) => {
      const items = match
        .trim()
        .split(/\n/)
        .map((line) => line.replace(/^[ \t]*[-*][ \t]+/, ''))
        .filter(Boolean)
        .map((item) => `<li>${item}</li>`)
        .join('')
      return `<ul>${items}</ul>`
    }
  )

  // Convert ordered lists (consecutive lines starting with number.)
  result = result.replace(
    /^([ \t]*\d+\.[ \t]+.+\n?)+/gm,
    (match) => {
      const items = match
        .trim()
        .split(/\n/)
        .map((line) => line.replace(/^[ \t]*\d+\.[ \t]+/, ''))
        .filter(Boolean)
        .map((item) => `<li>${item}</li>`)
        .join('')
      return `<ol>${items}</ol>`
    }
  )

  // Convert remaining newlines to <br>
  result = result.replace(/\n/g, '<br>')

  // Wrap plain text in paragraphs if no block elements exist
  if (!/<[a-z][\s\S]*>/i.test(result)) {
    result = result.split('<br>').map(p => `<p>${p}</p>`).join('')
  }

  return result
}

export function convertMarkdownImageToHtmlAttrs(markdown: string): { src: string; alt?: string; width?: number } | null {
  const trimmed = markdown.trim()
  const match = trimmed.match(/!\[([^\]]*)\]\(([^)]+)\)/)
  if (!match) return null

  const alt = match[1] || ''
  const urlPart = match[2]

  // Extract URL and optional width: "url =480x" or just "url"
  const widthMatch = urlPart.match(/\s*=\s*(\d+)x\s*$/)
  const src = widthMatch ? urlPart.replace(/\s*=\s*\d+x\s*$/, '').trim() : urlPart.trim()
  const width = widthMatch ? parseInt(widthMatch[1], 10) : undefined

  return { src, alt, width }
}

export function convertHtmlImageToAttrs(content: string): { src: string; alt?: string; width?: number } | null {
  const trimmed = content.trim()
  const match = trimmed.match(/^<img\s+([^>]*?)\/?>$/i)
  if (!match) return null

  const attrs = match[1]
  const src = attrs.match(/\bsrc=(['"])(.*?)\1/i)?.[2]?.trim()
  if (!src) return null

  const alt = attrs.match(/\balt=(['"])(.*?)\1/i)?.[2] || ''
  const widthValue = attrs.match(/\bwidth=(['"])?(\d+)\1?/i)?.[2]
  const width = widthValue ? Number.parseInt(widthValue, 10) : undefined

  return { src, alt, width }
}

export function isMarkdownImageSyntax(content: string): boolean {
  const trimmed = content.trim()
  return /!\[([^\]]*)\]\([^)]+\)/.test(trimmed)
}

export function isMarkdownContent(content: string): boolean {
  if (!content) return false
  const markdownPatterns = [
    /^#{1,6}\s+/m,
    /!\[.*\]\(.*\)/,
    /\[.*\]\(.*\)/,
    /\*\*[^*]+\*\*/,
    /\*[^*]+\*/,
    /~~.+~~/,
    /`[^`]+`/,
    /^\s*[-*+]\s+/m,
    /^\s*\d+\.\s+/m,
    /^>\s+/m,
    /^```[\s\S]*?```/m,
  ]
  return markdownPatterns.some(pattern => pattern.test(content))
}