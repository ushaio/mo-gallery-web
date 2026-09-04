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

type MarkdownListType = 'ordered' | 'bullet'

interface MarkdownListItem {
  type: MarkdownListType
  text: string
  children: MarkdownListNode[]
}

interface MarkdownListNode {
  type: MarkdownListType
  items: MarkdownListItem[]
  /** Ordered-list start value from the first marker (Markdown allows 3. foo). */
  start?: number
}

interface MarkdownListLine {
  indent: number
  type: MarkdownListType
  text: string
}

const MARKDOWN_LIST_LINE = /^([ \t]*)(?:(\d+)[.)]|[-+*])(?:[ \t]+(.*?))?[ \t]*$/

function parseMarkdownListLine(line: string): MarkdownListLine | null {
  const match = line.match(MARKDOWN_LIST_LINE)
  if (!match) return null

  const marker = match[2]
  const indent = [...match[1]].reduce((total, character) => total + (character === '\t' ? 4 : 1), 0)
  return {
    indent,
    type: marker ? 'ordered' : 'bullet',
    text: match[3] || '',
  }
}

function renderMarkdownListNode(node: MarkdownListNode): string {
  const tag = node.type === 'ordered' ? 'ol' : 'ul'
  const start = node.type === 'ordered' && node.start && node.start !== 1
    ? ` start="${node.start}"`
    : ''
  return `<${tag}${start}>${node.items.map((item) => (
    `<li>${item.text}${item.children.map(renderMarkdownListNode).join('')}</li>`
  )).join('')}</${tag}>`
}

/**
 * Convert Markdown list runs without flattening their indentation. The old
 * regex-based conversion treated every marker as a sibling, which made a
 * nested bullet under an ordered item impossible to edit as a real list.
 */
function convertMarkdownLists(input: string): string {
  const lines = input.split(/\r?\n/)
  const output: string[] = []
  let index = 0
  let inCodeFence = false

  const parseList = (start: number, indent: number, type: MarkdownListType): [MarkdownListNode, number] => {
    const firstMarker = parseMarkdownListLine(lines[start])
    const node: MarkdownListNode = {
      type,
      items: [],
      start: type === 'ordered' && firstMarker
        ? Number.parseInt(lines[start].match(/^(?:[ \t]*)(\d+)[.)]/)?.[1] || '1', 10)
        : undefined,
    }
    let cursor = start

    while (cursor < lines.length) {
      const current = parseMarkdownListLine(lines[cursor])
      if (!current || current.indent !== indent || current.type !== type) break

      const item: MarkdownListItem = { type, text: current.text, children: [] }
      cursor += 1

      while (cursor < lines.length) {
        const child = parseMarkdownListLine(lines[cursor])
        if (!child || child.indent <= indent) break

        const [childNode, nextCursor] = parseList(cursor, child.indent, child.type)
        item.children.push(childNode)
        cursor = nextCursor
      }

      node.items.push(item)
    }

    return [node, cursor]
  }

  while (index < lines.length) {
    if (/^\s*```/.test(lines[index])) {
      inCodeFence = !inCodeFence
      output.push(lines[index])
      index += 1
      continue
    }

    if (inCodeFence) {
      output.push(lines[index])
      index += 1
      continue
    }

    const first = parseMarkdownListLine(lines[index])
    if (!first) {
      output.push(lines[index])
      index += 1
      continue
    }

    const [list, nextIndex] = parseList(index, first.indent, first.type)
    output.push(renderMarkdownListNode(list))
    index = nextIndex
  }

  return output.join('\n')
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

  // Convert ordered/unordered lists while preserving nesting and list type.
  result = convertMarkdownLists(result)

  // Convert remaining newlines to <br>
  result = result.replace(/\n/g, '<br>')

  // Wrap plain text in paragraphs if no block elements exist
  if (!/<[a-z][\s\S]*>/i.test(result)) {
    result = result.split('<br>').map(p => `<p>${p}</p>`).join('')
  }

  return result
}

export function convertMarkdownImageToHtmlAttrs(markdown: string): { src: string; alt?: string; width?: number; photoId?: string } | null {
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

export function convertHtmlImageToAttrs(content: string): { src: string; alt?: string; width?: number; photoId?: string } | null {
  const trimmed = content.trim()
  // Match bare <img> or <img> wrapped in other tags (e.g. <p><img ...></p>)
  const match = trimmed.match(/<img\s+([^>]*?)\/?\s*>/i)
  if (!match) return null

  const attrs = match[1]
  const src = attrs.match(/\bsrc=(['"])(.*?)\1/i)?.[2]?.trim()
  if (!src) return null

  const alt = attrs.match(/\balt=(['"])(.*?)\1/i)?.[2] || ''
  const widthValue = attrs.match(/\bwidth=(['"])?(\d+)\1?/i)?.[2]
  const photoId = attrs.match(/\bdata-photo-id=(['"])(.*?)\1/i)?.[2]?.trim()
  const width = widthValue ? Number.parseInt(widthValue, 10) : undefined

  return { src, alt, width, photoId }
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
    /^\s*[-*+](?:\s+|$)/m,
    /^\s*\d+[.)](?:\s+|$)/m,
    /^>\s+/m,
    /^```[\s\S]*?```/m,
  ]
  return markdownPatterns.some(pattern => pattern.test(content))
}
