import type { PhotoDto } from '@/lib/api/types'
import type { PhotoCoordinates } from '@/lib/photo-location'

type GeotaggedPhoto = PhotoDto & {
  coordinates: PhotoCoordinates
}

export interface ClusterPoint {
  type: 'Feature'
  properties: {
    cluster?: boolean
    point_count?: number
    point_count_abbreviated?: string
    marker?: GeotaggedPhoto
    clusteredPhotos?: GeotaggedPhoto[]
  }
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
}

/**
 * Simple clustering algorithm for small datasets
 * @param markers Array of photo markers to cluster
 * @param zoom Current zoom level
 * @returns Array of cluster points
 */
export function clusterMarkers(markers: GeotaggedPhoto[], zoom: number): ClusterPoint[] {
  if (markers.length === 0) return []

  // At high zoom levels, don't cluster
  if (zoom >= 15) {
    return markers.map((marker) => ({
      type: 'Feature' as const,
      properties: { marker },
      geometry: {
        type: 'Point' as const,
        coordinates: [marker.coordinates.lng, marker.coordinates.lat],
      },
    }))
  }

  const clusters: ClusterPoint[] = []
  const processed = new Set<string>()

  // Simple distance-based clustering
  const threshold = Math.max(0.001, 0.01 / Math.pow(2, zoom - 10)) // Adjust threshold based on zoom

  for (const marker of markers) {
    if (processed.has(marker.id)) continue

    const nearby = [marker]
    processed.add(marker.id)

    // Find nearby markers
    for (const other of markers) {
      if (processed.has(other.id)) continue

      const distance = Math.sqrt(
        Math.pow(marker.coordinates.lng - other.coordinates.lng, 2) +
          Math.pow(marker.coordinates.lat - other.coordinates.lat, 2),
      )

      if (distance < threshold) {
        nearby.push(other)
        processed.add(other.id)
      }
    }

    if (nearby.length === 1) {
      // Single marker
      clusters.push({
        type: 'Feature',
        properties: { marker },
        geometry: {
          type: 'Point',
          coordinates: [marker.coordinates.lng, marker.coordinates.lat],
        },
      })
    } else {
      // Cluster
      const centerLng = nearby.reduce((sum, m) => sum + m.coordinates.lng, 0) / nearby.length
      const centerLat = nearby.reduce((sum, m) => sum + m.coordinates.lat, 0) / nearby.length

      clusters.push({
        type: 'Feature',
        properties: {
          cluster: true,
          point_count: nearby.length,
          point_count_abbreviated: nearby.length.toString(),
          marker: nearby[0], // Representative marker for the cluster
          clusteredPhotos: nearby, // All photos in the cluster
        },
        geometry: {
          type: 'Point',
          coordinates: [centerLng, centerLat],
        },
      })
    }
  }

  return clusters
}
