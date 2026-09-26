import type { ExifData } from './types'

function isValidDate(value: Date | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime())
}

export function parseExifDate(dateStr: string): Date | undefined {
  const normalized = dateStr.replace(/\0/g, '').trim()
  const match = normalized.match(
    /^(\d{4}):(\d{2}):(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/
  )

  if (!match) return undefined

  const [, yearRaw, monthRaw, dayRaw, hourRaw = '00', minuteRaw = '00', secondRaw = '00'] = match
  const year = Number.parseInt(yearRaw, 10)
  const month = Number.parseInt(monthRaw, 10)
  const day = Number.parseInt(dayRaw, 10)
  const hour = Number.parseInt(hourRaw, 10)
  const minute = Number.parseInt(minuteRaw, 10)
  const second = Number.parseInt(secondRaw, 10)

  // Ignore EXIF sentinel dates like 0000:00:00 00:00:00
  if (
    year <= 0 ||
    month <= 0 ||
    day <= 0 ||
    month > 12 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return undefined
  }

  const parsed = new Date(year, month - 1, day, hour, minute, second)
  if (
    !isValidDate(parsed) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hour ||
    parsed.getMinutes() !== minute ||
    parsed.getSeconds() !== second
  ) {
    return undefined
  }

  return parsed
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Validate a client-supplied serialized-JSON string (exifRaw / gps).
 * Clients are supposed to send JSON.stringify output; anything that does not
 * parse is dropped so corrupted fragments never reach the database.
 */
export function sanitizeJsonString(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    JSON.parse(value)
    return value
  } catch {
    return undefined
  }
}

/**
 * Parse EXIF JSON string transmitted from the frontend into ExifData.
 *
 * The frontend reads EXIF before browser-side compression (Canvas/AVIF encoding
 * discards EXIF) and sends it via FormData `exif_json`. `takenAt` is parsed
 * with the same parseExifDate used for raw buffers, keeping date validation
 * consistent between client-JSON and server-buffer paths.
 */
export function parseExifJson(json: string): ExifData {
  const raw = JSON.parse(json) as {
    cameraMake?: string
    cameraModel?: string
    lens?: string
    focalLength?: string
    aperture?: string
    shutterSpeed?: string
    iso?: number
    takenAt?: string
    orientation?: number
    software?: string
    exifRaw?: string
    gps?: string
  }

  const data: ExifData = {}
  if (raw.cameraMake) data.cameraMake = raw.cameraMake
  if (raw.cameraModel) data.cameraModel = raw.cameraModel
  if (raw.lens) data.lens = raw.lens
  if (raw.focalLength) data.focalLength = raw.focalLength
  if (raw.aperture) data.aperture = raw.aperture
  if (raw.shutterSpeed) data.shutterSpeed = raw.shutterSpeed
  if (typeof raw.iso === 'number') data.iso = raw.iso
  if (raw.takenAt) {
    const parsed = parseExifDate(raw.takenAt)
    if (parsed) data.takenAt = parsed
  }
  if (typeof raw.orientation === 'number') data.orientation = raw.orientation
  if (raw.software) data.software = raw.software
  const exifRaw = sanitizeJsonString(raw.exifRaw)
  if (exifRaw) data.exifRaw = exifRaw
  const gps = sanitizeJsonString(raw.gps)
  if (gps) data.gps = gps
  return data
}

/**
 * Format EXIF data for display
 */
export function formatExifForDisplay(exif: ExifData): Record<string, string> {
  const formatted: Record<string, string> = {}

  if (exif.cameraMake || exif.cameraModel) {
    formatted['相机'] = [exif.cameraMake, exif.cameraModel]
      .filter(Boolean)
      .join(' ')
  }

  if (exif.lens) {
    formatted['镜头'] = exif.lens
  }

  if (exif.focalLength) {
    formatted['焦距'] = exif.focalLength
  }

  if (exif.aperture) {
    formatted['光圈'] = exif.aperture
  }

  if (exif.shutterSpeed) {
    formatted['快门'] = exif.shutterSpeed
  }

  if (exif.iso) {
    formatted['ISO'] = exif.iso.toString()
  }

  if (exif.takenAt) {
    formatted['拍摄时间'] = exif.takenAt.toLocaleString('zh-CN')
  }

  if (exif.gps) {
    try {
      const gps = JSON.parse(exif.gps) as { latitude?: unknown; longitude?: unknown }
      if (isFiniteCoordinate(gps.latitude) && isFiniteCoordinate(gps.longitude)) {
        formatted['位置'] = `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`
      }
    } catch {
      // Ignore malformed gps payloads in display formatting.
    }
  }

  if (exif.software) {
    formatted['软件'] = exif.software
  }

  return formatted
}
