'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapPinned, Maximize2, Minimize2 } from 'lucide-react'
import Map, { Marker, NavigationControl, Popup, type MapRef } from 'react-map-gl/maplibre'
import type { StyleSpecification } from 'maplibre-gl'
import { resolveAssetUrl, type PhotoDto } from '@/lib/api'

const MAP_STYLE: StyleSpecification = {
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
}

type GeotaggedPhoto = PhotoDto & {
  latitude: number
  longitude: number
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

function isFiniteCoordinate(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function hasCoordinates(photo: PhotoDto): photo is GeotaggedPhoto {
  return isFiniteCoordinate(photo.latitude) && isFiniteCoordinate(photo.longitude)
}

export function StoryMapPanel({ photos, cdnDomain, expanded = false, onToggleExpanded }: StoryMapPanelProps) {
  const mapRef = useRef<MapRef | null>(null)
  const geotaggedPhotos = useMemo(() => photos.filter(hasCoordinates), [photos])
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  const [popupPhotoId, setPopupPhotoId] = useState<string | null>(null)
  const [popupAnchor, setPopupAnchor] = useState<PopupAnchor>('top')
  const [popupLayout, setPopupLayout] = useState<PopupLayout>({
    width: 176,
    imageHeight: 112,
    edgePadding: 96,
  })

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

    const point = map.project([photo.longitude, photo.latitude])
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
      center: [photo.longitude, photo.latitude],
      zoom: Math.max(map.getZoom(), expanded ? 14.5 : 13.5),
      offset: [placement.offsetX, placement.offsetY],
      duration: 450,
      essential: true,
    })
  }, [expanded, getPopupPlacement, updatePopupLayout])

  return (
    <section
      className={`overflow-hidden border border-border/60 bg-card/80 shadow-[0_24px_60px_-48px_rgba(0,0,0,0.4)] ${
        expanded
          ? 'rounded-[32px] bg-card/95'
          : 'rounded-[28px]'
      }`}
    >
      <div className="relative border-b border-border/60 px-6 pb-5 pt-6">
        <div className="mb-3 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.3em] text-primary/75">
          <div className="h-px w-6 bg-primary/45" />
          <span>Map</span>
        </div>
        <div className="absolute right-6 top-4">
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
          <div className={`relative overflow-hidden border-b border-border/60 bg-muted/20 ${expanded ? 'h-[min(72vh,720px)] min-h-[420px]' : 'h-[320px]'}`}>
            <div className="pointer-events-none absolute right-3 top-[84px] z-10">
              <div className="pointer-events-auto flex overflow-hidden rounded-md border border-black/15 bg-white shadow-sm dark:border-white/10 dark:bg-[#0f0f0f]">
                <button
                  type="button"
                  onClick={onToggleExpanded}
                  className="flex h-[29px] w-[29px] cursor-pointer items-center justify-center text-[#1f1f1f] transition-colors hover:bg-black/5 dark:text-[#d4af37] dark:hover:bg-white/8"
                  aria-label={expanded ? 'Collapse map panel' : 'Expand map panel'}
                  title={expanded ? 'Collapse map panel' : 'Expand map panel'}
                >
                  {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                </button>
              </div>
            </div>
            <Map
              ref={mapRef}
              initialViewState={{
                longitude: selectedPhoto?.longitude ?? geotaggedPhotos[0].longitude,
                latitude: selectedPhoto?.latitude ?? geotaggedPhotos[0].latitude,
                zoom: geotaggedPhotos.length === 1 ? 13.5 : 2.5,
              }}
              mapStyle={MAP_STYLE}
              attributionControl={false}
              reuseMaps
              scrollZoom={expanded}
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
                      onClick={() => focusPhotoOnMap(photo)}
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

              {popupPhoto ? (
                <Popup
                  key={popupPhoto.id}
                  longitude={popupPhoto.longitude}
                  latitude={popupPhoto.latitude}
                  anchor={popupAnchor}
                  offset={12}
                  closeButton={false}
                  onClose={() => setPopupPhotoId(null)}
                  maxWidth={`${popupLayout.width}px`}
                  style={{ ['--story-popup-width' as string]: `${popupLayout.width}px` }}
                  className="[&_.maplibregl-popup-content]:w-[var(--story-popup-width)] [&_.maplibregl-popup-content]:max-w-[var(--story-popup-width)] [&_.maplibregl-popup-content]:min-w-[var(--story-popup-width)] [&_.maplibregl-popup-content]:box-border [&_.maplibregl-popup-content]:overflow-hidden [&_.maplibregl-popup-content]:rounded-[18px] [&_.maplibregl-popup-content]:border [&_.maplibregl-popup-content]:border-border/70 [&_.maplibregl-popup-content]:bg-card/95 [&_.maplibregl-popup-content]:p-0 [&_.maplibregl-popup-content]:shadow-xl"
                >
                  <div className="w-full overflow-hidden rounded-[18px]">
                    <div
                      className="flex items-center justify-center bg-muted/30"
                      style={{ height: popupLayout.imageHeight }}
                    >
                      <img
                        src={resolveAssetUrl(popupPhoto.thumbnailUrl || popupPhoto.url, cdnDomain)}
                        alt={popupPhoto.title}
                        className="block h-full w-full object-contain"
                      />
                    </div>
                    <div className="space-y-1 px-2.5 py-2">
                      <h3 className="text-xs font-medium text-foreground">{popupPhoto.title}</h3>
                    </div>
                  </div>
                </Popup>
              ) : null}
            </Map>
          </div>

        </>
      )}
    </section>
  )
}
