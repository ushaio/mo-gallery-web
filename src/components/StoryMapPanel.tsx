'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapPin, Maximize2, Minimize2, Camera, Images } from 'lucide-react'
import Map, { Marker, NavigationControl, Popup, type MapRef } from 'react-map-gl/maplibre'
import type { StyleSpecification } from 'maplibre-gl'
import { resolveAssetUrl, type PhotoDto } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'
import { clusterMarkers, type ClusterPoint } from '@/lib/map-clustering'
import { getPhotoCoordinates, type PhotoCoordinates } from '@/lib/photo-location'

// High-contrast dark map style
const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors, © CARTO',
    },
  },
  layers: [
    {
      id: 'carto',
      type: 'raster',
      source: 'carto',
    },
  ],
}

type GeotaggedPhoto = PhotoDto & {
  coordinates: PhotoCoordinates
}

type PopupAnchor = 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

interface StoryMapPanelProps {
  photos: PhotoDto[]
  cdnDomain?: string
  expanded?: boolean
  onToggleExpanded?: () => void
}

interface PopupLayout {
  width: number
  imageHeight: number
  edgePadding: number
}

interface PopupPlacement {
  anchor: PopupAnchor
  offsetX: number
  offsetY: number
}

const POPUP_GAP = 14
const POPUP_MARGIN = 12
const POPUP_TEXT_HEIGHT = 42

function getPopupRect(
  anchor: PopupAnchor,
  pointX: number,
  pointY: number,
  popupWidth: number,
  popupHeight: number
) {
  switch (anchor) {
    case 'top':
      return { left: pointX - popupWidth / 2, right: pointX + popupWidth / 2, top: pointY + POPUP_GAP, bottom: pointY + POPUP_GAP + popupHeight }
    case 'bottom':
      return { left: pointX - popupWidth / 2, right: pointX + popupWidth / 2, top: pointY - POPUP_GAP - popupHeight, bottom: pointY - POPUP_GAP }
    case 'left':
      return { left: pointX + POPUP_GAP, right: pointX + POPUP_GAP + popupWidth, top: pointY - popupHeight / 2, bottom: pointY + popupHeight / 2 }
    case 'right':
      return { left: pointX - POPUP_GAP - popupWidth, right: pointX - POPUP_GAP, top: pointY - popupHeight / 2, bottom: pointY + popupHeight / 2 }
    case 'top-left':
      return { left: pointX, right: pointX + popupWidth, top: pointY + POPUP_GAP, bottom: pointY + POPUP_GAP + popupHeight }
    case 'top-right':
      return { left: pointX - popupWidth, right: pointX, top: pointY + POPUP_GAP, bottom: pointY + POPUP_GAP + popupHeight }
    case 'bottom-left':
      return { left: pointX, right: pointX + popupWidth, top: pointY - POPUP_GAP - popupHeight, bottom: pointY - POPUP_GAP }
    case 'bottom-right':
      return { left: pointX - popupWidth, right: pointX, top: pointY - POPUP_GAP - popupHeight, bottom: pointY - POPUP_GAP }
  }
}

function getOverflowScore(
  rect: { left: number; right: number; top: number; bottom: number },
  containerWidth: number,
  containerHeight: number
) {
  const overflowLeft = Math.max(0, POPUP_MARGIN - rect.left)
  const overflowRight = Math.max(0, rect.right - (containerWidth - POPUP_MARGIN))
  const overflowTop = Math.max(0, POPUP_MARGIN - rect.top)
  const overflowBottom = Math.max(0, rect.bottom - (containerHeight - POPUP_MARGIN))

  return {
    total: overflowLeft + overflowRight + overflowTop + overflowBottom,
    dx:
      overflowLeft > 0
        ? overflowLeft
        : overflowRight > 0
          ? -overflowRight
          : 0,
    dy:
      overflowTop > 0
        ? overflowTop
        : overflowBottom > 0
          ? -overflowBottom
          : 0,
  }
}

function toGeotaggedPhoto(photo: PhotoDto): GeotaggedPhoto | null {
  const coordinates = getPhotoCoordinates(photo)
  if (!coordinates) {
    return null
  }

  return {
    ...photo,
    coordinates,
  }
}

// Cluster marker component
interface ClusterMarkerProps {
  point: ClusterPoint
  onFocusPhoto: (photo: GeotaggedPhoto) => void
}

function ClusterMarker({ point, onFocusPhoto }: ClusterMarkerProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const photos = point.properties.clusteredPhotos ?? []
  const count = point.properties.point_count ?? 0

  const handleClick = () => {
    setIsExpanded(!isExpanded)
  }

  return (
    <Marker
      longitude={point.geometry.coordinates[0]}
      latitude={point.geometry.coordinates[1]}
      anchor="center"
    >
      <div className="relative">
        {/* Expanded cluster grid */}
        {isExpanded && photos.length > 0 && (
          <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 overflow-hidden rounded-xl border border-white/20 bg-zinc-900/95 p-2 shadow-2xl backdrop-blur-md">
            <div className="grid grid-cols-3 gap-1.5">
              {photos.slice(0, 9).map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsExpanded(false)
                    onFocusPhoto(photo)
                  }}
                  className="size-10 overflow-hidden rounded-lg transition-transform hover:scale-110"
                >
                  <img
                    src={resolveAssetUrl(photo.thumbnailUrl || photo.url)}
                    alt={photo.title}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
            {count > 9 && (
              <p className="mt-1.5 text-center text-[9px] text-zinc-400">
                +{count - 9} more
              </p>
            )}
          </div>
        )}

        {/* Cluster pin */}
        <button
          type="button"
          onClick={handleClick}
          className="group relative cursor-pointer transition-all hover:scale-110"
          aria-label={`${count} photos at this location`}
        >
          {/* Background preview */}
          {photos[0] && (
            <div className="absolute inset-0 overflow-hidden rounded-full">
              <img
                src={resolveAssetUrl(photos[0].thumbnailUrl || photos[0].url)}
                alt=""
                className="h-full w-full object-cover opacity-40"
              />
              <div className="absolute inset-0 bg-zinc-900/60" />
            </div>
          )}

          {/* Cluster count */}
          <div className="relative flex size-9 items-center justify-center rounded-full border-2 border-white/80 bg-zinc-800/95 shadow-lg">
            <Images className="mr-0.5 size-3.5 text-zinc-300" />
            <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-zinc-100 text-[9px] font-bold text-zinc-900 shadow-md">
              {count > 99 ? '99+' : count}
            </span>
          </div>

          {/* Pin tail */}
          <div className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-zinc-800/95" />
        </button>
      </div>
    </Marker>
  )
}

export function StoryMapPanel({ photos, cdnDomain, expanded = false, onToggleExpanded }: StoryMapPanelProps) {
  const { locale } = useLanguage()
  const mapRef = useRef<MapRef | null>(null)
  const geotaggedPhotos = useMemo(
    () => photos.map(toGeotaggedPhoto).filter((photo): photo is GeotaggedPhoto => photo !== null),
    [photos]
  )
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  const [popupPhotoId, setPopupPhotoId] = useState<string | null>(null)
  const [popupAnchor, setPopupAnchor] = useState<PopupAnchor>('top')
  const [popupLayout, setPopupLayout] = useState<PopupLayout>({
    width: 176,
    imageHeight: 112,
    edgePadding: 96,
  })
  const [currentZoom, setCurrentZoom] = useState(expanded ? 14.5 : 13.5)

  // Clustered markers based on zoom level
  const clusteredMarkers = useMemo(
    () => clusterMarkers(geotaggedPhotos, currentZoom),
    [geotaggedPhotos, currentZoom]
  )

  const selectedPhoto = useMemo(
    () => geotaggedPhotos.find((photo) => photo.id === selectedPhotoId) ?? null,
    [geotaggedPhotos, selectedPhotoId]
  )

  const popupPhoto = useMemo(
    () => geotaggedPhotos.find((photo) => photo.id === popupPhotoId) ?? null,
    [geotaggedPhotos, popupPhotoId]
  )

  const fitMapToPhotos = useCallback(() => {
    const map = mapRef.current

    if (!map || geotaggedPhotos.length === 0) {
      return
    }

    if (geotaggedPhotos.length === 1) {
      const photo = geotaggedPhotos[0]
      map.flyTo({
        center: [photo.coordinates.lng, photo.coordinates.lat],
        zoom: 13.5,
        duration: 0,
      })
      return
    }

    let minLng = geotaggedPhotos[0].coordinates.lng
    let maxLng = geotaggedPhotos[0].coordinates.lng
    let minLat = geotaggedPhotos[0].coordinates.lat
    let maxLat = geotaggedPhotos[0].coordinates.lat

    for (const photo of geotaggedPhotos) {
      minLng = Math.min(minLng, photo.coordinates.lng)
      maxLng = Math.max(maxLng, photo.coordinates.lng)
      minLat = Math.min(minLat, photo.coordinates.lat)
      maxLat = Math.max(maxLat, photo.coordinates.lat)
    }

    const lngSpan = maxLng - minLng
    const latSpan = maxLat - minLat
    const isTightCluster = lngSpan < 0.01 && latSpan < 0.01
    const lngPadding = Math.max(lngSpan * 0.08, isTightCluster ? 0.0012 : 0.003)
    const latPadding = Math.max(latSpan * 0.08, isTightCluster ? 0.0012 : 0.003)
    const container = map.getContainer()
    const width = container.clientWidth || 320
    const height = container.clientHeight || 320
    const horizontalPadding = Math.max(18, Math.min(48, Math.round(width * 0.06)))
    const verticalPadding = Math.max(18, Math.min(40, Math.round(height * 0.06)))

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
        maxZoom: isTightCluster ? 16 : 15,
      }
    )
  }, [geotaggedPhotos])

  const updatePopupLayout = useCallback((photo?: GeotaggedPhoto | null) => {
    const map = mapRef.current
    if (!map) {
      return
    }

    const container = map.getContainer()
    const width = container.clientWidth || 320
    const height = container.clientHeight || 320
    const targetPhoto = photo ?? popupPhoto ?? selectedPhoto ?? geotaggedPhotos[0] ?? null
    const aspectRatio = targetPhoto && targetPhoto.width > 0 && targetPhoto.height > 0
      ? targetPhoto.width / targetPhoto.height
      : 4 / 3

    const minWidth = expanded ? 176 : 144
    const maxWidth = expanded
      ? Math.min(320, Math.round(width * 0.34))
      : Math.min(214, Math.round(width * 0.8))
    const minHeight = expanded ? 132 : 102
    const maxHeight = expanded
      ? Math.min(276, Math.round(height * 0.46))
      : Math.min(176, Math.round(height * 0.5))

    let imageWidth = maxWidth
    let imageHeight = imageWidth / aspectRatio

    if (imageHeight > maxHeight) {
      imageHeight = maxHeight
      imageWidth = imageHeight * aspectRatio
    }
    if (imageWidth < minWidth) {
      imageWidth = minWidth
      imageHeight = imageWidth / aspectRatio
    }
    if (imageHeight < minHeight) {
      imageHeight = minHeight
      imageWidth = imageHeight * aspectRatio
    }
    if (imageWidth > maxWidth) {
      imageWidth = maxWidth
    }
    if (imageHeight > maxHeight) {
      imageHeight = maxHeight
    }

    const popupWidth = Math.round(Math.max(minWidth, Math.min(maxWidth, imageWidth)))
    const finalImageHeight = Math.round(Math.max(minHeight, Math.min(maxHeight, imageHeight)))
    const edgePadding = Math.max(80, Math.min(132, Math.round(popupWidth * 0.58)))

    setPopupLayout((current) => {
      if (
        current.width === popupWidth &&
        current.imageHeight === finalImageHeight &&
        current.edgePadding === edgePadding
      ) {
        return current
      }

      return {
        width: popupWidth,
        imageHeight: finalImageHeight,
        edgePadding,
      }
    })
  }, [expanded, geotaggedPhotos, popupPhoto, selectedPhoto])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      fitMapToPhotos()
      updatePopupLayout()
    })

    const handleResize = () => {
      const map = mapRef.current
      if (!map) return
      map.resize()
      fitMapToPhotos()
      updatePopupLayout()
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleResize)
    }
  }, [fitMapToPhotos, updatePopupLayout])

  useEffect(() => {
    if (!geotaggedPhotos.length) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      const map = mapRef.current
      if (!map) return
      map.resize()
      fitMapToPhotos()
      updatePopupLayout()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [expanded, fitMapToPhotos, geotaggedPhotos.length, updatePopupLayout])

  const getPopupPlacement = useCallback((photo: GeotaggedPhoto): PopupPlacement => {
    const map = mapRef.current
    if (!map) {
      return { anchor: 'bottom', offsetX: 0, offsetY: 0 }
    }

    const point = map.project([photo.coordinates.lng, photo.coordinates.lat])
    const container = map.getContainer()
    const width = container.clientWidth || 320
    const height = container.clientHeight || 320
    const popupHeight = popupLayout.imageHeight + POPUP_TEXT_HEIGHT
    const anchors: PopupAnchor[] = ['bottom', 'top', 'left', 'right', 'bottom-left', 'bottom-right', 'top-left', 'top-right']

    let bestPlacement: PopupPlacement = { anchor: 'bottom', offsetX: 0, offsetY: 0 }
    let bestScore = Number.POSITIVE_INFINITY

    for (const anchor of anchors) {
      const rect = getPopupRect(anchor, point.x, point.y, popupLayout.width, popupHeight)
      const overflow = getOverflowScore(rect, width, height)

      if (overflow.total < bestScore) {
        bestScore = overflow.total
        bestPlacement = {
          anchor,
          offsetX: point.x + overflow.dx - width / 2,
          offsetY: point.y + overflow.dy - height / 2,
        }
      }
    }

    return bestPlacement
  }, [popupLayout.imageHeight, popupLayout.width])

  const focusPhotoOnMap = useCallback((photo: GeotaggedPhoto) => {
    setSelectedPhotoId(photo.id)
    setPopupPhotoId(null)

    const map = mapRef.current
    if (!map) {
      window.requestAnimationFrame(() => {
        setPopupAnchor('bottom')
        setPopupPhotoId(photo.id)
      })
      return
    }

    updatePopupLayout(photo)
    const placement = getPopupPlacement(photo)

    map.once('moveend', () => {
      updatePopupLayout(photo)
      setPopupAnchor(placement.anchor)
      setPopupPhotoId(photo.id)
    })

    map.flyTo({
      center: [photo.coordinates.lng, photo.coordinates.lat],
      zoom: Math.max(map.getZoom(), expanded ? 14.5 : 13.5),
      offset: [placement.offsetX, placement.offsetY],
      duration: 450,
      essential: true,
    })
  }, [expanded, getPopupPlacement, updatePopupLayout])

  return (
    <section
      className={`overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${
        expanded ? 'shadow-2xl' : 'shadow-lg'
      }`}
    >
      {/* Header */}
      <div className="relative border-b border-zinc-100 px-5 pb-4 pt-5 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-medium uppercase tracking-[0.3em] text-zinc-400 dark:text-zinc-500">
              {locale === 'zh' ? '位置' : 'Locations'}
            </span>
            <div className="mt-1 flex items-center gap-2">
              <MapPin className="size-3.5 text-zinc-400 dark:text-zinc-500" />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {geotaggedPhotos.length} {locale === 'zh' ? '张照片已标注' : `photo${geotaggedPhotos.length === 1 ? '' : 's'} mapped`}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleExpanded}
            className="flex size-9 items-center justify-center rounded-full border border-zinc-200 text-zinc-400 transition-all hover:border-zinc-300 hover:text-zinc-600 dark:border-zinc-700 dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:text-zinc-400 cursor-pointer"
            aria-label={expanded ? 'Collapse map' : 'Expand map'}
            title={expanded ? 'Collapse map' : 'Expand map'}
          >
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </div>

      {geotaggedPhotos.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center px-6 py-12">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
            <Camera className="size-5 text-zinc-400" />
          </div>
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            {locale === 'zh' ? '暂无位置数据' : 'No location data'}
          </p>
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            {locale === 'zh' ? '带有 GPS 信息的照片将显示在此处' : 'Photos with GPS metadata will appear here'}
          </p>
        </div>
      ) : (
        /* Map Container */
        <div
          className={`relative overflow-hidden ${
            expanded ? 'h-[min(72vh,720px)] min-h-[420px]' : 'h-[280px]'
          }`}
        >
          <Map
            ref={mapRef}
            initialViewState={{
              longitude: selectedPhoto?.coordinates.lng ?? geotaggedPhotos[0].coordinates.lng,
              latitude: selectedPhoto?.coordinates.lat ?? geotaggedPhotos[0].coordinates.lat,
              zoom: geotaggedPhotos.length === 1 ? 13.5 : 2.5,
            }}
            mapStyle={MAP_STYLE}
            attributionControl={false}
            reuseMaps
            scrollZoom={expanded}
            onLoad={fitMapToPhotos}
            onMove={(evt) => setCurrentZoom(evt.viewState.zoom)}
          >
            <NavigationControl position="top-right" showCompass={false} />

            {clusteredMarkers.map((clusterPoint) => {
              if (clusterPoint.properties.cluster) {
                // Render cluster marker
                return (
                  <ClusterMarker
                    key={`cluster-${clusterPoint.geometry.coordinates[0]}-${clusterPoint.geometry.coordinates[1]}`}
                    point={clusterPoint}
                    onFocusPhoto={focusPhotoOnMap}
                  />
                )
              } else {
                // Render individual marker
                const photo = clusterPoint.properties.marker!
                const isSelected = photo.id === selectedPhoto?.id

                return (
                  <Marker
                    key={photo.id}
                    longitude={photo.coordinates.lng}
                    latitude={photo.coordinates.lat}
                    anchor="bottom"
                  >
                    <button
                      type="button"
                      onClick={() => focusPhotoOnMap(photo)}
                      className={`group relative cursor-pointer transition-all ${
                        isSelected ? 'scale-110' : 'hover:scale-110'
                      }`}
                      aria-label={`View ${photo.title} on map`}
                    >
                      {/* Marker Pin */}
                      <div
                        className={`flex size-7 items-center justify-center rounded-full border-[2.5px] shadow-lg transition-all ${
                          isSelected
                            ? 'border-zinc-900 bg-white'
                            : 'border-white/80 bg-zinc-100/95'
                        }`}
                      >
                        <Camera
                          className={`size-3 ${
                            isSelected ? 'text-zinc-900' : 'text-zinc-500'
                          }`}
                        />
                      </div>
                      {/* Pin Tail */}
                      <div
                        className={`absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 ${
                          isSelected ? 'bg-white' : 'bg-zinc-100/95'
                        }`}
                      />
                      {/* Selection Ring */}
                      {isSelected && (
                        <div className="absolute -inset-2 rounded-full border-2 border-white/40" />
                      )}
                    </button>
                  </Marker>
                )
              }
            })}

            {popupPhoto ? (
              <Popup
                key={popupPhoto.id}
                longitude={popupPhoto.coordinates.lng}
                latitude={popupPhoto.coordinates.lat}
                anchor={popupAnchor}
                offset={16}
                closeButton={false}
                onClose={() => setPopupPhotoId(null)}
                maxWidth={`${popupLayout.width}px`}
                style={{ ['--story-popup-width' as string]: `${popupLayout.width}px` }}
                className="[&_.maplibregl-popup-content]:w-[var(--story-popup-width)] [&_.maplibregl-popup-content]:max-w-[var(--story-popup-width)] [&_.maplibregl-popup-content]:min-w-[var(--story-popup-width)] [&_.maplibregl-popup-content]:box-border [&_.maplibregl-popup-content]:overflow-hidden [&_.maplibregl-popup-content]:rounded-2xl [&_.maplibregl-popup-content]:bg-zinc-900 [&_.maplibregl-popup-content]:p-0 [&_.maplibregl-popup-content]:shadow-2xl [&_.maplibregl-popup-content]:ring-1 [&_.maplibregl-popup-content]:ring-white/10"
              >
                <div className="w-full overflow-hidden rounded-2xl">
                  {/* Photo */}
                  <div
                    className="relative flex items-center justify-center bg-zinc-800"
                    style={{ height: popupLayout.imageHeight }}
                  >
                    <img
                      src={resolveAssetUrl(popupPhoto.thumbnailUrl || popupPhoto.url, cdnDomain)}
                      alt={popupPhoto.title}
                      className="block h-full w-full object-cover"
                    />
                    {/* Photo Number Badge */}
                    <div className="absolute left-2 top-2">
                      <span className="rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
                        {geotaggedPhotos.findIndex((p) => p.id === popupPhoto.id) + 1}/{geotaggedPhotos.length}
                      </span>
                    </div>
                  </div>
                  {/* Info */}
                  <div className="px-3 py-2.5">
                    <h3 className="text-xs font-medium text-zinc-100 line-clamp-1">
                      {popupPhoto.title}
                    </h3>
                    {popupPhoto.takenAt && (
                      <p className="mt-0.5 text-[10px] text-zinc-400">
                        {new Date(popupPhoto.takenAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                </div>
              </Popup>
            ) : null}
          </Map>
        </div>
      )}
    </section>
  )
}
