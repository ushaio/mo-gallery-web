const STORY_PASTE_UPLOAD_MARKER_PATTERN = /<!-- story-paste-upload:([a-f0-9-]+) -->/i

function escapeHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getStoryPasteUploadId(searchValue: string) {
  return searchValue.match(STORY_PASTE_UPLOAD_MARKER_PATTERN)?.[1] ?? null
}

export function isStoryPasteUploadPlaceholder(value: string) {
  return STORY_PASTE_UPLOAD_MARKER_PATTERN.test(value)
}

export function convertStoryPasteUploadPlaceholderToHtml(value: string) {
  const lines = value.trim().split(/\r?\n/)
  if (lines.length === 0) return ''

  return `<p>${lines.map(escapeHtml).join('<br>')}</p>`
}

export function replaceStoryPasteUploadPlaceholderHtml(
  currentHtml: string,
  searchValue: string,
  nextValue: string,
) {
  const uploadId = getStoryPasteUploadId(searchValue)
  if (!uploadId) return null

  const rawMarker = `<!-- story-paste-upload:${uploadId} -->`
  const escapedMarker = `&lt;!-- story-paste-upload:${uploadId} --&gt;`
  const markerPattern = `(?:${escapeRegExp(rawMarker)}|${escapeRegExp(escapedMarker)})`
  const spacerPattern = String.raw`(?:\s|&nbsp;|　|<br\s*/?>)*`
  const statusPattern = String.raw`(?:<a\b[^>]*>\s*)?\[正在(?:处理|上传)：[\s\S]*?…\](?:\(\))?(?:\s*</a>)?`

  const patterns = [
    new RegExp(String.raw`<p\b[^>]*>${spacerPattern}${markerPattern}${spacerPattern}${statusPattern}${spacerPattern}</p>`, 'i'),
    new RegExp(String.raw`${markerPattern}${spacerPattern}<p\b[^>]*>${spacerPattern}${statusPattern}${spacerPattern}</p>`, 'i'),
    new RegExp(String.raw`${markerPattern}${spacerPattern}${statusPattern}`, 'i'),
  ]

  for (const pattern of patterns) {
    if (pattern.test(currentHtml)) {
      return {
        replaced: true,
        html: currentHtml.replace(pattern, nextValue),
      }
    }
  }

  return null
}
