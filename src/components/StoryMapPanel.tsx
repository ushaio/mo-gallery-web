'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapPinned } from 'lucide-react'
import Map, { Marker, NavigationControl, Popup, type MapRef } from 'react-map-gl/maplibre'
import { resolveAssetUrl, type PhotoDto } from '@/lib/api'

const MAP_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: 'OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
    },
  ],
} as const

type GeotaggedPhoto = PhotoDto & {
  latitude: number
  longitude: number
}

interface StoryMapPanelProps {
  photos: PhotoDto[]
  cdnDomain?: string
}

function isFiniteCoordinate(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function hasCoordinates(photo: PhotoDto): photo is GeotaggedPhoto {
  return isFiniteCoordinate(photo.latitude) && isFiniteCoordinate(photo.longitude)
}

function formatCoordinate(value: number, positive: string, negative: string) {
  const direction = value >= 0 ? positive : negative
  return `${Math.abs(value).toFixed(6)} deg ${direction}`
}

export function StoryMapPanel({ photos, cdnDomain }: StoryMapPanelProps) {
  const mapRef = useRef<MapRef | null>(null)
  const geotaggedPhotos = useMemo(() => photos.filter(hasCoordinates), [photos])
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(geotaggedPhotos[0]?.id ?? null)

  const selectedPhoto = useMemo(
    () => geotaggedPhotos.find((photo) => photo.id === selectedPhotoId) ?? geotaggedPhotos[0] ?? null,
    [geotaggedPhotos, selectedPhotoId]
  )

  useEffect(() => {
    setSelectedPhotoId((current) => {
      if (!current) return geotaggedPhotos[0]?.id ?? null
      return geotaggedPhotos.some((photo) => photo.id === current) ? current : geotaggedPhotos[0]?.id ?? null
    })
  }, [geotaggedPhotos])

  const fitMapToPhotos = useCallback(() => {
    const map = mapRef.current

    if (!map || geotaggedPhotos.length === 0) {
      return
    }

    if (geotaggedPhotos.length === 1) {
      const photo = geotaggedPhotos[0]
      map.flyTo({
        center: [photo.longitude, photo.latitude],
        zoom: 13.5,
        duration: 0,
      })
      return
    }

    let minLng = geotaggedPhotos[0].longitude
    let maxLng = geotaggedPhotos[0].longitude
    let minLat = geotaggedPhotos[0].latitude
    let maxLat = geotaggedPhotos[0].latitude

    for (const photo of geotaggedPhotos) {
      minLng = Math.min(minLng, photo.longitude)
      maxLng = Math.max(maxLng, photo.longitude)
      minLat = Math.min(minLat, photo.latitude)
      maxLat = Math.max(maxLat, photo.latitude)
    }

    const lngSpan = maxLng - minLng
    const latSpan = maxLat - minLat
    const lngPadding = Math.max(lngSpan * 0.18, 0.01)
    const latPadding = Math.max(latSpan * 0.18, 0.01)
    const container = map.getContainer()
    const width = container.clientWidth || 320
    const height = container.clientHeight || 320
    const horizontalPadding = Math.max(32, Math.min(72, Math.round(width * 0.1)))
    const verticalPadding = Math.max(28, Math.min(64, Math.round(height * 0.1)))

    map.fitBounds(
      [
        [minLng - lngPadding, minLat - latPadding],
        [maxLng + lngPadding, maxLat + latPadding],
      ],
      {
        padding: {
          top: verticalPadding,
          right: horizontalPadding,
          bottom: verticalPadding,
          left: horizontalPadding,
        },
        duration: 0,
        maxZoom: 14,
      }
    )
  }, [geotaggedPhotos])

  useEffect(() => {
    fitMapToPhotos()

    const handleResize = () => {
      const map = mapRef.current
      if (!map) return
      map.resize()
      fitMapToPhotos()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [fitMapToPhotos])

  return (
    <section className="overflow-hidden rounded-[28px] border border-border/60 bg-card/80 shadow-[0_24px_60px_-48px_rgba(0,0,0,0.4)]">
      <div className="border-b border-border/60 px-6 pb-5 pt-6">
        <div className="mb-3 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.3em] text-primary/75">
          <div className="h-px w-6 bg-primary/45" />
          <span>Map</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-serif font-light tracking-tight text-foreground">Photo Locations</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {geotaggedPhotos.length > 0
                ? `${geotaggedPhotos.length} frame${geotaggedPhotos.length > 1 ? 's' : ''} with GPS coordinates in this narrative.`
                : 'This narrative does not include published GPS coordinates yet.'}
            </p>
          </div>
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/80 text-primary">
            <MapPinned className="size-4" />
          </div>
        </div>
      </div>

      {geotaggedPhotos.length === 0 ? (
        <div className="px-6 py-10">
          <div className="rounded-[24px] border border-dashed border-border/70 bg-background/65 px-5 py-8 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground/65">No GPS Data</p>
            <p className="mt-3 font-serif italic leading-7 text-muted-foreground">
              Upload photos with location metadata if you want the narrative route to appear here.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="relative h-[320px] overflow-hidden border-b border-border/60 bg-muted/20">
            <Map
              ref={mapRef}
              initialViewState={{
                longitude: selectedPhoto?.longitude ?? geotaggedPhotos[0].longitude,
                latitude: selectedPhoto?.latitude ?? geotaggedPhotos[0].latitude,
                zoom: geotaggedPhotos.length === 1 ? 11 : 2.5,
              }}
              mapStyle={MAP_STYLE}
              attributionControl={false}
              reuseMaps
              scrollZoom={false}
              onLoad={fitMapToPhotos}
            >
              <NavigationControl position="top-right" showCompass={false} />

              {geotaggedPhotos.map((photo) => {
                const isSelected = photo.id === selectedPhoto?.id

                return (
                  <Marker
                    key={photo.id}
                    longitude={photo.longitude}
                    latitude={photo.latitude}
                    anchor="bottom"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedPhotoId(photo.id)}
                      className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border-2 transition-all ${
                        isSelected
                          ? 'border-primary bg-primary shadow-[0_0_0_6px_rgba(212,175,55,0.18)]'
                          : 'border-white bg-black/80 shadow-[0_8px_20px_rgba(0,0,0,0.28)]'
                      }`}
                      aria-label={`View map point for ${photo.title}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-primary-foreground' : 'bg-white'}`} />
                    </button>
                  </Marker>
                )
              })}

              {selectedPhoto ? (
                <Popup
                  longitude={selectedPhoto.longitude}
                  latitude={selectedPhoto.latitude}
                  anchor="top"
                  offset={20}
                  closeButton={false}
                  onClose={() => setSelectedPhotoId(null)}
                  className="[&_.maplibregl-popup-content]:rounded-[18px] [&_.maplibregl-popup-content]:border [&_.maplibregl-popup-content]:border-border/70 [&_.maplibregl-popup-content]:bg-card/95 [&_.maplibregl-popup-content]:p-0 [&_.maplibregl-popup-content]:shadow-xl [&_.maplibregl-popup-tip]:border-t-card/95 [&_.maplibregl-popup-tip]:border-r-card/95"
                >
                  <div className="w-[220px] overflow-hidden rounded-[18px]">
                    <div className="aspect-[4/3] bg-muted/30">
                      <img
                        src={resolveAssetUrl(selectedPhoto.thumbnailUrl || selectedPhoto.url, cdnDomain)}
                        alt={selectedPhoto.title}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="space-y-2 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-primary/70">Selected Frame</p>
                      <h3 className="text-sm font-medium text-foreground">{selectedPhoto.title}</h3>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {selectedPhoto.latitude.toFixed(6)}, {selectedPhoto.longitude.toFixed(6)}
                      </p>
                    </div>
                  </div>
                </Popup>
              ) : null}
            </Map>
          </div>

          {selectedPhoto ? (
            <div className="space-y-4 px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary/70">Selected Coordinate</p>
                  <h3 className="mt-2 text-lg font-medium text-foreground">{selectedPhoto.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {formatCoordinate(selectedPhoto.latitude, 'N', 'S')}
                    {' / '}
                    {formatCoordinate(selectedPhoto.longitude, 'E', 'W')}
                  </p>
                </div>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${selectedPhoto.latitude}&mlon=${selectedPhoto.longitude}#map=13/${selectedPhoto.latitude}/${selectedPhoto.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center rounded-full border border-border/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-foreground/75 transition-colors hover:border-primary/40 hover:text-primary"
                >
                  Open
                </a>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Tap markers on the map to switch between photo coordinates.
              </p>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
