'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveAssetUrl } from '@/lib/api/core'
import type { PhotoDto } from '@/lib/api/types'
import { useLanguage } from '@/contexts/LanguageContext'
import { clusterMarkers, type ClusterPoint } from '@/lib/map-clustering'
import type { PhotoCoordinates } from '@/lib/photo-location'

type GeotaggedPhoto = PhotoDto & { coordinates: PhotoCoordinates }

// AMap uses GCJ-02 for mainland China. Keep overseas WGS84 coordinates unchanged.
function toAmapCoordinates({ lng, lat }: PhotoCoordinates): PhotoCoordinates {
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) return { lng, lat }
  const pi = Math.PI
  const transformLat = (x: number, y: number) => {
    let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
    ret += (20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2 / 3
    ret += (20 * Math.sin(y * pi) + 40 * Math.sin(y / 3 * pi)) * 2 / 3
    ret += (160 * Math.sin(y / 12 * pi) + 320 * Math.sin(y * pi / 30)) * 2 / 3
    return ret
  }
  const transformLng = (x: number, y: number) => {
    let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
    ret += (20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2 / 3
    ret += (20 * Math.sin(x * pi) + 40 * Math.sin(x / 3 * pi)) * 2 / 3
    ret += (150 * Math.sin(x / 12 * pi) + 300 * Math.sin(x / 30 * pi)) * 2 / 3
    return ret
  }
  const dLat = transformLat(lng - 105, lat - 35)
  const dLng = transformLng(lng - 105, lat - 35)
  const radLat = lat / 180 * Math.PI
  const magic = 1 - 0.00669342162296594323 * Math.sin(radLat) ** 2
  const sqrtMagic = Math.sqrt(magic)
  return {
    lat: lat + (dLat * 180) / ((6378245 * (1 - 0.00669342162296594323)) / (magic * sqrtMagic) * Math.PI),
    lng: lng + (dLng * 180) / (6378245 / sqrtMagic * Math.cos(radLat) * Math.PI),
  }
}

interface AMapLike {
  Map: new (container: HTMLDivElement, options: Record<string, unknown>) => AMapMapLike
  Marker: new (options: Record<string, unknown>) => AMapMarkerLike
  InfoWindow: new (options: Record<string, unknown>) => AMapInfoWindowLike
  Pixel: new (x: number, y: number) => unknown
}

interface AMapMapLike {
  add: (items: AMapMarkerLike[]) => void
  remove: (items: AMapMarkerLike[]) => void
  destroy: () => void
  setFitView: (items?: AMapMarkerLike[], immediately?: boolean, padding?: number[]) => void
  setZoomAndCenter: (zoom: number, center: [number, number]) => void
  getZoom: () => number
  resize: () => void
  on: (event: string, handler: () => void) => void
}

interface AMapMarkerLike {
  setMap: (map: AMapMapLike | null) => void
  on: (event: string, handler: () => void) => void
  getPosition: () => { lng: number; lat: number }
}

interface AMapInfoWindowLike {
  open: (map: AMapMapLike, position: [number, number]) => void
  close: () => void
}

declare global {
  interface Window { AMap?: AMapLike; _AMapSecurityConfig?: { securityJsCode?: string } }
}

let amapLoader: Promise<AMapLike> | null = null

function loadAmap(key: string, securityJsCode: string): Promise<AMapLike> {
  if (typeof window === 'undefined') return Promise.reject(new Error('AMap requires a browser'))
  if (window.AMap) return Promise.resolve(window.AMap)
  if (amapLoader) return amapLoader

  amapLoader = new Promise((resolve, reject) => {
    if (securityJsCode) window._AMapSecurityConfig = { securityJsCode }
    const script = document.createElement('script')
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`
    script.async = true
    script.onload = () => window.AMap ? resolve(window.AMap) : reject(new Error('AMap failed to initialize'))
    script.onerror = () => reject(new Error('Failed to load AMap'))
    document.head.appendChild(script)
  })
  return amapLoader
}

interface Props {
  photos: GeotaggedPhoto[]
  cdnDomain?: string
  expanded: boolean
  isDark: boolean
  amapKey?: string
  amapSecurityJsCode?: string
}

export function AmapStoryMap({ photos, cdnDomain, expanded, isDark, amapKey = '', amapSecurityJsCode = '' }: Props) {
  const { t } = useLanguage()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<AMapMapLike | null>(null)
  const markersRef = useRef<AMapMarkerLike[]>([])
  const infoWindowRef = useRef<AMapInfoWindowLike | null>(null)
  const hasFittedRef = useRef(false)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [zoom, setZoom] = useState(expanded ? 14.5 : 13.5)
  const [mapReady, setMapReady] = useState(false)
  const [error, setError] = useState(() => !amapKey.trim())
  const clusters = useMemo(() => clusterMarkers(photos, zoom), [photos, zoom])
  const amapPhotos = useMemo(
    () => photos.map((photo) => ({ ...photo, coordinates: toAmapCoordinates(photo.coordinates) })),
    [photos],
  )

  useEffect(() => {
    const key = amapKey.trim()
    if (!key) return
    if (!containerRef.current) return
    let disposed = false
    void loadAmap(key, amapSecurityJsCode.trim())
      .then((AMap) => {
        if (disposed || !containerRef.current) return
        const map = new AMap.Map(containerRef.current, {
          zoom: photos.length === 1 ? 13.5 : 2.5,
          center: [amapPhotos[0].coordinates.lng, amapPhotos[0].coordinates.lat],
          mapStyle: isDark ? 'amap://styles/dark' : 'amap://styles/normal',
          viewMode: '2D',
          zooms: [2, 20],
        })
        mapRef.current = map
        setMapReady(true)
        map.on('zoomend', () => setZoom(map.getZoom()))
        let frame: number | null = null
        resizeObserverRef.current = new ResizeObserver(() => {
          if (frame !== null) cancelAnimationFrame(frame)
          frame = requestAnimationFrame(() => {
            frame = null
            map.resize()
          })
        })
        resizeObserverRef.current.observe(containerRef.current)
      })
      .catch(() => setError(true))
    return () => {
      disposed = true
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      infoWindowRef.current?.close()
      mapRef.current?.destroy()
      mapRef.current = null
      hasFittedRef.current = false
      setMapReady(false)
    }
  }, [amapKey, amapPhotos, amapSecurityJsCode, isDark, photos.length])

  useEffect(() => {
    const map = mapRef.current
    const AMap = window.AMap
    if (!mapReady || !map || !AMap || photos.length === 0) return
    markersRef.current.forEach((marker) => marker.setMap(null))
    markersRef.current = []
    infoWindowRef.current?.close()

    const markers = clusters.map((point: ClusterPoint) => {
      const sourcePhoto = point.properties.marker
      const mappedPosition = toAmapCoordinates({ lng: point.geometry.coordinates[0], lat: point.geometry.coordinates[1] })
      const [lng, lat] = [mappedPosition.lng, mappedPosition.lat]
      const isCluster = Boolean(point.properties.cluster)
      const count = point.properties.point_count ?? 0
      const photo = sourcePhoto
      const content = document.createElement('button')
      content.type = 'button'
      content.title = isCluster ? `${count} ${t('story.map_cluster_aria_suffix')}` : photo?.title ?? ''
      content.className = 'flex size-8 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-white/95 text-black shadow-lg transition-transform hover:scale-110 dark:border-black dark:bg-black/90 dark:text-white'
      content.innerHTML = isCluster ? `<span class="text-[10px] font-bold">${count > 99 ? '99+' : count}</span>` : '<span aria-hidden="true">●</span>'
      const marker = new AMap.Marker({ position: [lng, lat], content, offset: new AMap.Pixel(-16, -16), anchor: 'center' })
      marker.on('click', () => {
        if (isCluster) {
          map.setZoomAndCenter(Math.min(18, map.getZoom() + 2), [lng, lat])
          return
        }
        if (!photo) return
        const info = document.createElement('div')
        info.className = 'w-44 overflow-hidden rounded-xl bg-white text-black shadow-xl dark:bg-zinc-900 dark:text-white'
        const image = document.createElement('img')
        image.src = resolveAssetUrl(photo.thumbnailUrl || photo.url, cdnDomain)
        image.alt = ''
        image.className = 'block h-28 w-full object-cover'
        const details = document.createElement('div')
        details.className = 'px-3 py-2'
        const title = document.createElement('div')
        title.className = 'truncate text-xs font-medium'
        title.textContent = photo.title
        details.append(title)
        info.append(image, details)
        const infoWindow = new AMap.InfoWindow({ content: info, offset: new AMap.Pixel(0, -20), isCustom: true })
        infoWindowRef.current?.close()
        infoWindowRef.current = infoWindow
        infoWindow.open(map, [lng, lat])
      })
      return marker
    })
    markersRef.current = markers
    map.add(markers)
    if (!hasFittedRef.current) {
      map.setFitView(markers, false, [40, 40, 40, 40])
      hasFittedRef.current = true
    }
  }, [cdnDomain, clusters, mapReady, photos.length, t])

  if (error) {
    return <div ref={containerRef} className="flex h-full items-center justify-center bg-muted px-4 text-center text-xs text-muted-foreground">AMap 地图不可用，请配置 NEXT_AMAP_KEY</div>
  }
  return <div ref={containerRef} className={`h-full w-full ${isDark ? 'dark' : ''}`} aria-label={t('story.map_locations')} />
}
