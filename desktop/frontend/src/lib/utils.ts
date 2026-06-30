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

export function formatBytes(bytes: number, units = ['B', 'KB', 'MB', 'GB', 'TB']): string {
  if (!bytes) return '0 B'
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, unitIndex)).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}
