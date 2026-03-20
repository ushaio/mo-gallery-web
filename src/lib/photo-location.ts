import type { PhotoDto } from '@/lib/api/types'

export interface PhotoCoordinates {
  lat: number
  lng: number
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseGpsCoordinates(gps?: string): PhotoCoordinates | null {
  if (!gps) {
    return null
  }

  try {
    const parsed = JSON.parse(gps) as { latitude?: unknown; longitude?: unknown }
    if (isFiniteCoordinate(parsed.latitude) && isFiniteCoordinate(parsed.longitude)) {
      return { lat: parsed.latitude, lng: parsed.longitude }
    }
  } catch {
    return null
  }

  return null
}

export function getPhotoCoordinates(photo: Pick<PhotoDto, 'gps' | 'latitude' | 'longitude'>): PhotoCoordinates | null {
  const gpsCoordinates = parseGpsCoordinates(photo.gps)
  if (gpsCoordinates) {
    return gpsCoordinates
  }

  if (isFiniteCoordinate(photo.latitude) && isFiniteCoordinate(photo.longitude)) {
    return { lat: photo.latitude, lng: photo.longitude }
  }

  return null
}

export function formatPhotoCoordinates(photo: Pick<PhotoDto, 'gps' | 'latitude' | 'longitude'>, fractionDigits = 4): string | undefined {
  const coordinates = getPhotoCoordinates(photo)
  if (!coordinates) {
    return undefined
  }

  return `${coordinates.lat.toFixed(fractionDigits)}, ${coordinates.lng.toFixed(fractionDigits)}`
}
