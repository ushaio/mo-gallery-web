import 'server-only'
import ExifReader from 'exifreader'

export interface ExifData {
  cameraMake?: string
  cameraModel?: string
  lens?: string
  focalLength?: string
  aperture?: string
  shutterSpeed?: string
  iso?: number
  takenAt?: Date
  orientation?: number
  software?: string
  exifRaw?: string
  gps?: string
}

function isValidDate(value: Date | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime())
}

function parseExifDate(dateStr: string): Date | undefined {
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

function getGpsDateStampDescription(tags: unknown): string | undefined {
  if (!tags || typeof tags !== 'object') {
    return undefined
  }

  const maybeDateStamp = (tags as Record<string, unknown>).GPSDateStamp
  if (!maybeDateStamp || typeof maybeDateStamp !== 'object') {
    return undefined
  }

  const description = (maybeDateStamp as Record<string, unknown>).description
  return typeof description === 'string' ? description : undefined
}

/**
 * Extract EXIF data from image buffer
 */
export async function extractExifData(buffer: Buffer): Promise<ExifData> {
  try {
    const tags = ExifReader.load(buffer, { expanded: true })

    const exifData: ExifData = {}

    // Camera information
    if (tags.exif?.Make?.description) {
      exifData.cameraMake = tags.exif.Make.description
    }
    if (tags.exif?.Model?.description) {
      exifData.cameraModel = tags.exif.Model.description
    }
    if (tags.exif?.LensModel?.description) {
      exifData.lens = tags.exif.LensModel.description
    }

    // Shooting parameters
    if (tags.exif?.FocalLength?.description) {
      exifData.focalLength = tags.exif.FocalLength.description
    }
    if (tags.exif?.FNumber?.description) {
      exifData.aperture = `f/${tags.exif.FNumber.description}`
    }
    if (tags.exif?.ExposureTime?.description) {
      exifData.shutterSpeed = tags.exif.ExposureTime.description
    }
    if (tags.exif?.ISOSpeedRatings?.description) {
      const iso = parseInt(tags.exif.ISOSpeedRatings.description)
      if (!isNaN(iso)) {
        exifData.iso = iso
      }
    }

    // Date taken
    if (tags.exif?.DateTimeOriginal?.description) {
      try {
        const dateStr = tags.exif.DateTimeOriginal.description
        const parsedDate = parseExifDate(dateStr)
        if (parsedDate) {
          exifData.takenAt = parsedDate
        } else {
          console.warn('Ignoring invalid EXIF date:', dateStr)
        }
      } catch (e) {
        console.warn('Failed to parse EXIF date:', e)
      }
    }

    // GPS location
    if (tags.gps) {
      const gps: Record<string, unknown> = {}
      const gpsDateStamp = getGpsDateStampDescription(tags.gps)

      if (tags.gps.Latitude !== undefined) gps.latitude = tags.gps.Latitude
      if (tags.gps.Longitude !== undefined) gps.longitude = tags.gps.Longitude
      if (tags.gps.Altitude !== undefined) gps.altitude = tags.gps.Altitude
      if (gpsDateStamp) gps.dateStamp = gpsDateStamp

      if (Object.keys(gps).length > 0) {
        exifData.gps = JSON.stringify(gps)
      }
    }

    // Orientation
    if (tags.exif?.Orientation?.value) {
      exifData.orientation = tags.exif.Orientation.value
    }

    // Software
    if (tags.exif?.Software?.description) {
      exifData.software = tags.exif.Software.description
    }

    // Store complete EXIF data as JSON (for advanced features)
    // Only include essential fields to reduce storage
    const rawExif = {
      camera: {
        make: tags.exif?.Make?.description,
        model: tags.exif?.Model?.description,
        lens: tags.exif?.LensModel?.description,
      },
      settings: {
        focalLength: tags.exif?.FocalLength?.description,
        aperture: tags.exif?.FNumber?.description,
        shutterSpeed: tags.exif?.ExposureTime?.description,
        iso: tags.exif?.ISOSpeedRatings?.description,
        exposureMode: tags.exif?.ExposureMode?.description,
        exposureProgram: tags.exif?.ExposureProgram?.description,
        meteringMode: tags.exif?.MeteringMode?.description,
        flash: tags.exif?.Flash?.description,
        whiteBalance: tags.exif?.WhiteBalance?.description,
      },
      image: {
        width: tags.file?.['Image Width']?.value,
        height: tags.file?.['Image Height']?.value,
        orientation: tags.exif?.Orientation?.description,
        colorSpace: tags.exif?.ColorSpace?.description,
        compression: tags.exif?.Compression?.description,
      },
      other: {
        software: tags.exif?.Software?.description,
        copyright: tags.exif?.Copyright?.description,
        artist: tags.exif?.Artist?.description,
      },
    }

    exifData.exifRaw = JSON.stringify(rawExif)

    return exifData
  } catch (error) {
    console.warn('Failed to extract EXIF data:', error)
    return {}
  }
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
