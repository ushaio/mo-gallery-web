/** Only durable HTTP(S) and site-relative URLs belong in a saved document. */
export function safeMediaUrl(value?: string | null): string {
  const url = value?.trim() ?? ''
  if (!url || /[\u0000-\u001f\u007f\\]/.test(url)) return ''
  if (/^\/(?!\/)/.test(url) || /^\.{1,2}\//.test(url)) return url
  try {
    const parsed = new URL(url)
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? url : ''
  } catch {
    return ''
  }
}
