export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ')
}

export function formatRelativeTimeLabel(
  timestamp: number,
  t: (key: string) => string,
  fallback: 'date' | 'datetime' = 'date'
): string {
  const diff = Date.now() - timestamp

  if (diff < 60000) return t('story.draft_just_now')
  if (diff < 3600000) return `${Math.floor(diff / 60000)} ${t('story.draft_minutes_ago')}`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} ${t('story.draft_hours_ago')}`

  return fallback === 'datetime'
    ? new Date(timestamp).toLocaleString()
    : new Date(timestamp).toLocaleDateString()
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return 'Unknown'
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
