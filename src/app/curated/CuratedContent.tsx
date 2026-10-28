'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { MotionConfig } from 'framer-motion'
import { ArrowLeft, ArrowRight, ArrowUp, MapPin, Layers, Sparkles, Calendar, Camera } from 'lucide-react'
import { resolveAssetUrl } from '@/lib/api/core'
import type { PhotoDto } from '@/lib/api/types'
import type { AlbumWithKind } from '@/lib/album-kind'
import { useSettings } from '@/contexts/SettingsContext'
import { useLanguage } from '@/contexts/LanguageContext'

const PhotoDetailModal = dynamic(
  () => import('@/components/PhotoDetailModal').then((m) => m.PhotoDetailModal),
  { ssr: false }
)

interface CuratedContentProps {
  albums: AlbumWithKind[]
  photos: PhotoDto[]
}

type CuratedTab = 'all' | 'series' | 'featured'

export function CuratedContent({ albums, photos }: CuratedContentProps) {
  const { settings } = useSettings()
  const { t } = useLanguage()
  const cdn = settings?.cdn_domain

  const [activeTab, setActiveTab] = useState<CuratedTab>('all')
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoDto | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // 监听浏览器 URL 中 ?portfolio=xxx，支持直接分享或浏览器前进/后退
  // 监听浏览器 URL 中 ?portfolio=xxx，支持直接分享或浏览器前进/后退
  useEffect(() => {
    if (typeof window === 'undefined') return
    const syncFromUrl = () => {
      setSelectedAlbumId(new URLSearchParams(window.location.search).get('portfolio'))
    }
    // 首帧由服务端渲染成总览，挂载后再读取地址栏，避免水合不一致；
    // 用 queueMicrotask 与 Navbar 同款写法避开 effect 内同步 setState。
    queueMicrotask(syncFromUrl)

    window.addEventListener('popstate', syncFromUrl)
    return () => window.removeEventListener('popstate', syncFromUrl)
  }, [])

  // 当前选中的作品集
  const currentAlbum = useMemo(() => {
    if (!selectedAlbumId) return null
    return albums.find((a) => a.id === selectedAlbumId) ?? null
  }, [albums, selectedAlbumId])

  // 当前作品集的相邻下一个作品集（便于连贯浏览）
  const nextAlbum = useMemo(() => {
    if (!currentAlbum || albums.length <= 1) return null
    const currentIndex = albums.findIndex((a) => a.id === currentAlbum.id)
    if (currentIndex === -1) return null
    return albums[(currentIndex + 1) % albums.length]
  }, [albums, currentAlbum])

  // 策展代表作结构划分：
  // 1. 首张为主展位焦点大图 (Lead Work)
  // 2. 接下来的两张构成双联画对照 (Diptych Pair)
  // 3. 其余作为流动展廊 (Gallery Flow)
  const leadPhoto = photos[0] ?? null
  const diptychPhotos = photos.slice(1, 3)
  const remainingPhotos = photos.slice(3)

  const hasAlbums = albums.length > 0
  const hasPhotos = photos.length > 0
  const isEmpty = !hasAlbums && !hasPhotos

  // 打开作品集展室（留在策展页面内，不跳转外部画廊）
  const handleSelectAlbum = (albumId: string) => {
    setSelectedAlbumId(albumId)
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', `?portfolio=${albumId}`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // 返回策展总览
  const handleBackToOverview = () => {
    setSelectedAlbumId(null)
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', window.location.pathname)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // 打开单张大图交互弹窗
  const handleOpenPhoto = (photo: PhotoDto) => {
    setSelectedPhoto(photo)
    setIsModalOpen(true)
  }

  // 格式化拍摄年份
  const getPhotoYear = (p: PhotoDto) => {
    const dateStr = p.takenAt || p.createdAt
    if (!dateStr) return '—'
    const date = new Date(dateStr)
    return isNaN(date.getFullYear()) ? '—' : String(date.getFullYear())
  }

  // 格式化相机与镜头规格行
  const getCameraLine = (p: PhotoDto) => {
    const parts: string[] = []
    const cameraName = p.camera?.displayName || p.camera?.name || p.cameraModel || p.cameraMake
    if (cameraName) parts.push(cameraName)
    const lensName = p.lens?.displayName || p.lens?.name || p.lensModel
    if (lensName) parts.push(lensName)
    return parts.length > 0 ? parts.join('  ·  ') : null
  }

  // 格式化曝光参数行
  const getExposureLine = (p: PhotoDto) => {
    const parts: string[] = []
    if (p.focalLength) parts.push(p.focalLength.includes('mm') ? p.focalLength : `${p.focalLength}mm`)
    if (p.aperture) parts.push(p.aperture.startsWith('f/') ? p.aperture : `f/${p.aperture}`)
    if (p.shutterSpeed) parts.push(`${p.shutterSpeed}s`)
    if (p.iso) parts.push(`ISO ${p.iso}`)
    return parts.length > 0 ? parts.join(' · ') : null
  }

  // 获取作品集涉及的年份跨度
  const getAlbumYearSpan = (album: AlbumWithKind) => {
    const years = album.photos
      .map((p) => {
        const dateStr = p.takenAt || p.createdAt
        return dateStr ? new Date(dateStr).getFullYear() : null
      })
      .filter((y): y is number => y !== null && !isNaN(y))
      .sort((a, b) => a - b)
    if (years.length === 0) return null
    const min = years[0]
    const max = years[years.length - 1]
    return min === max ? String(min) : `${min}—${max}`
  }

  // 获取作品集内使用到的相机/器材概况
  const getAlbumEquipmentSummary = (album: AlbumWithKind) => {
    const equipmentSet = new Set<string>()
    for (const p of album.photos) {
      const name = p.camera?.displayName || p.camera?.name || p.cameraModel || p.cameraMake
      if (name) equipmentSet.add(name)
    }
    return Array.from(equipmentSet).slice(0, 3).join('  ·  ')
  }

  const scrollToTop = () => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' })
  }

  // 决定当前全屏详情弹窗的照片全集上下文
  const modalPhotosContext = currentAlbum ? currentAlbum.photos : photos

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
        {isEmpty ? (
          /* ======================== 空状态展示 ======================== */
          <section className="min-h-[75vh] flex items-center justify-center px-6 py-32 text-center">
            <div className="flex flex-col items-center gap-6 max-w-lg mx-auto">
              <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.25em] text-primary">
                {t('curated.edition_label')}
              </span>
              <h1 className="font-serif text-4xl md:text-6xl font-light tracking-tight text-foreground">
                {t('curated.empty_title')}
              </h1>
              <p className="font-serif text-base md:text-lg leading-relaxed text-muted-foreground">
                {t('curated.empty_desc')}
              </p>
              <Link
                href="/gallery"
                className="mt-4 inline-flex items-center gap-2.5 px-6 py-3 rounded-full border border-border/80 hover:border-primary text-xs font-sans uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-all duration-300"
              >
                <span>{t('curated.view_all')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </section>
        ) : currentAlbum ? (
          /* ========================================================================= */
          /* ==================== 专题作品集深度展室 (Curated Portfolio View) ======== */
          /* ==================== 留在「策展」内部展示，绝不跳转画廊 ================== */
          /* ========================================================================= */
          <div className="flex flex-col">
            {/* 展室顶部导航导览 */}
            <nav className="sticky top-0 z-30 bg-background/85 backdrop-blur-md border-b border-border/40 px-6 md:px-12 lg:px-20 py-4">
              <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
                <button
                  onClick={handleBackToOverview}
                  className="inline-flex items-center gap-2 text-xs font-sans uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors cursor-pointer group"
                >
                  <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-1" />
                  <span>{t('curated.back_to_series')}</span>
                </button>

                <div className="flex items-center gap-4 text-xs font-sans tracking-wider text-muted-foreground">
                  <span className="hidden sm:inline font-serif italic text-foreground/80 truncate max-w-xs">
                    {currentAlbum.name}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[11px] font-medium">
                    {currentAlbum.photoCount} {t('curated.series_frames_suffix')}
                  </span>
                </div>
              </div>
            </nav>

            {/* 作品集策展前言与标题区 */}
            <header className="pt-16 pb-16 md:pt-24 md:pb-24 px-6 md:px-12 lg:px-20 border-b border-border/40">
              <div className="max-w-7xl mx-auto flex flex-col gap-8">
                <div className="flex items-center gap-3">
                  <span className="inline-block w-2 h-2 rounded-full bg-primary" />
                  <span className="font-sans text-xs font-semibold tracking-[0.25em] uppercase text-primary">
                    {t('curated.curated_portfolio_prefix')}
                  </span>
                </div>

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                  <div className="flex flex-col gap-4 max-w-3xl">
                    <h1 className="font-serif text-4xl md:text-6xl lg:text-7xl font-light tracking-tight leading-[1.05] text-foreground">
                      {currentAlbum.name}
                    </h1>

                    {currentAlbum.description && (
                      <p className="font-serif text-base md:text-xl text-muted-foreground leading-relaxed pt-2">
                        {currentAlbum.description}
                      </p>
                    )}
                  </div>

                  {/* 作品集元信息铭牌 */}
                  <div className="flex flex-col gap-3 p-5 rounded-lg bg-card/40 border border-border/50 self-start md:self-end min-w-[240px]">
                    {currentAlbum.location && (
                      <div className="flex items-center gap-2 text-xs font-sans text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="text-foreground">{currentAlbum.location}</span>
                      </div>
                    )}
                    {getAlbumYearSpan(currentAlbum) && (
                      <div className="flex items-center gap-2 text-xs font-sans text-muted-foreground">
                        <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span>{t('curated.album_period_label')}: <strong className="text-foreground font-normal">{getAlbumYearSpan(currentAlbum)}</strong></span>
                      </div>
                    )}
                    {getAlbumEquipmentSummary(currentAlbum) && (
                      <div className="flex items-center gap-2 text-xs font-sans text-muted-foreground">
                        <Camera className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="truncate">{getAlbumEquipmentSummary(currentAlbum)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </header>

            {/* 作品集内容展示 */}
            {currentAlbum.photos.length === 0 ? (
              <div className="py-32 text-center text-muted-foreground font-serif">
                {t('curated.series_empty_hint')}
              </div>
            ) : (
              <main className="py-20 md:py-28 px-6 md:px-12 lg:px-20 border-b border-border/40">
                <div className="max-w-7xl mx-auto flex flex-col gap-16 md:gap-24">
                  {/* 1. 作品集开篇代表作 (Opening Frame) */}
                  {currentAlbum.photos[0] && (
                    <article className="flex flex-col gap-6">
                      <div
                        onClick={() => handleOpenPhoto(currentAlbum.photos[0])}
                        className="group relative w-full aspect-[16/10] md:aspect-[21/10] bg-secondary rounded-lg overflow-hidden cursor-pointer shadow-lg hover:shadow-2xl transition-all duration-700"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleOpenPhoto(currentAlbum.photos[0])
                          }
                        }}
                        aria-label={currentAlbum.photos[0].title}
                      >
                        <Image
                          src={resolveAssetUrl(currentAlbum.photos[0].url, cdn)}
                          alt={currentAlbum.photos[0].title}
                          fill
                          sizes="100vw"
                          priority
                          className="object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-[1.02]"
                        />

                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-8 md:p-12 text-white">
                          <div className="flex items-center gap-2 text-xs font-sans tracking-widest uppercase text-primary mb-2">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>{t('curated.album_lead_label')}</span>
                          </div>
                          <h2 className="font-serif text-2xl md:text-4xl font-light">{currentAlbum.photos[0].title}</h2>
                          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-sans tracking-wider text-white/80">
                            {getCameraLine(currentAlbum.photos[0]) && <span>{getCameraLine(currentAlbum.photos[0])}</span>}
                            {getExposureLine(currentAlbum.photos[0]) && <span>{getExposureLine(currentAlbum.photos[0])}</span>}
                            <span>{getPhotoYear(currentAlbum.photos[0])}</span>
                          </div>
                        </div>
                      </div>

                      {/* 焦点铭牌 */}
                      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 px-2">
                        <div className="flex flex-col gap-1">
                          <span className="font-serif text-xl md:text-2xl text-foreground font-medium">
                            {currentAlbum.photos[0].title}
                          </span>
                          <span className="font-sans text-xs tracking-wider text-muted-foreground">
                            {getCameraLine(currentAlbum.photos[0]) || currentAlbum.photos[0].tags || t('curated.subject_photo')}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          {getExposureLine(currentAlbum.photos[0]) && (
                            <span className="font-sans text-xs tracking-wider text-muted-foreground/80">
                              {getExposureLine(currentAlbum.photos[0])}
                            </span>
                          )}
                          <button
                            onClick={() => handleOpenPhoto(currentAlbum.photos[0])}
                            className="text-xs font-sans tracking-widest uppercase text-primary hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <span>{t('curated.view_in_detail')}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </article>
                  )}

                  {/* 2. 作品集其余篇章：错落艺术展廊 (Curated Album Gallery) */}
                  {currentAlbum.photos.length > 1 && (
                    <div className="flex flex-col gap-8 pt-8">
                      <div className="flex items-center justify-between border-b border-border/40 pb-4">
                        <h2 className="font-serif text-xl md:text-2xl text-foreground font-light">
                          {t('curated.album_gallery_title')}
                        </h2>
                        <span className="font-sans text-xs tracking-widest uppercase text-muted-foreground">
                          {currentAlbum.photos.length - 1} {t('curated.frames_unit')}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
                        {currentAlbum.photos.slice(1).map((photo, idx) => {
                          const aspectClass = idx % 3 === 1 ? 'aspect-[3/4]' : idx % 3 === 2 ? 'aspect-[1/1]' : 'aspect-[4/5]'

                          return (
                            <article key={photo.id} className="flex flex-col gap-2.5 group">
                              <div
                                onClick={() => handleOpenPhoto(photo)}
                                className={`relative w-full ${aspectClass} bg-secondary rounded-sm overflow-hidden cursor-pointer`}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    handleOpenPhoto(photo)
                                  }
                                }}
                                aria-label={photo.title}
                              >
                                <Image
                                  src={resolveAssetUrl(photo.thumbnailUrl || photo.url, cdn)}
                                  alt={photo.title}
                                  fill
                                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                                  className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-5 text-white">
                                  <span className="font-serif text-base font-medium line-clamp-1">{photo.title}</span>
                                  <span className="font-sans text-[11px] tracking-wider text-primary mt-1 flex items-center gap-1">
                                    {t('curated.view_photo')}
                                    <ArrowRight className="w-3 h-3" />
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-baseline justify-between gap-2 pt-1">
                                <span className="font-serif text-base text-foreground group-hover:text-primary transition-colors truncate">
                                  {photo.title}
                                </span>
                                <span className="font-sans text-xs tracking-wider text-muted-foreground shrink-0">
                                  {getPhotoYear(photo)}
                                </span>
                              </div>
                              {getCameraLine(photo) && (
                                <span className="font-sans text-[11px] tracking-wider text-muted-foreground/70 truncate -mt-1.5">
                                  {getCameraLine(photo)}
                                </span>
                              )}
                            </article>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* 作品集展室尾部：连贯切换或返回总览 */}
                  <div className="pt-12 flex flex-col sm:flex-row items-center justify-between gap-6 border-t border-border/40">
                    <button
                      onClick={handleBackToOverview}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-border hover:border-primary text-xs font-sans uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>{t('curated.back_to_series')}</span>
                    </button>

                    {nextAlbum && nextAlbum.id !== currentAlbum.id && (
                      <button
                        onClick={() => handleSelectAlbum(nextAlbum.id)}
                        className="inline-flex items-center gap-3 text-xs font-sans uppercase tracking-[0.2em] text-primary hover:underline cursor-pointer group"
                      >
                        <span>{t('curated.explore_next_series')}: <strong className="font-serif text-foreground font-medium lowercase text-sm">{nextAlbum.name}</strong></span>
                        <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                      </button>
                    )}
                  </div>
                </div>
              </main>
            )}
          </div>
        ) : (
          /* ========================================================================= */
          /* ==================== 策展总览展厅 (Curated Overview View) ================ */
          /* ========================================================================= */
          <>
            {/* 策展前言与大标题 */}
            <header className="relative pt-28 pb-16 md:pt-36 md:pb-24 px-6 md:px-12 lg:px-20 border-b border-border/40">
              <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-10">
                <div className="flex flex-col gap-5 max-w-2xl">
                  <div className="flex items-center gap-3">
                    <span className="inline-block w-2 h-2 rounded-full bg-primary" />
                    <span className="font-sans text-xs font-semibold tracking-[0.25em] uppercase text-primary">
                      {t('curated.edition_label')}
                    </span>
                  </div>

                  <h1 className="font-serif text-4xl md:text-6xl lg:text-7xl font-light tracking-tight leading-[1.05] text-foreground">
                    {t('curated.hero_title')}
                  </h1>

                  <p className="font-serif text-base md:text-lg text-muted-foreground leading-relaxed">
                    {t('curated.hero_desc')}
                  </p>

                  <div className="flex flex-wrap items-center gap-6 pt-2 font-sans text-xs tracking-wider text-muted-foreground/80">
                    {hasAlbums && (
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-primary" />
                        <strong className="font-medium text-foreground">{albums.length}</strong> {t('curated.series_count')}
                      </span>
                    )}
                    {hasPhotos && (
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        <strong className="font-medium text-foreground">{photos.length}</strong> {t('curated.featured_count')}
                      </span>
                    )}
                  </div>
                </div>

                {/* 展区视角切换器 */}
                <div className="flex items-center gap-1 p-1 bg-muted/50 backdrop-blur rounded-full border border-border/60 self-start md:self-end">
                  <button
                    onClick={() => setActiveTab('all')}
                    className={`px-4 py-2 rounded-full text-xs font-sans tracking-wider transition-all duration-300 ${
                      activeTab === 'all'
                        ? 'bg-background text-foreground shadow-sm font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('curated.tab_all')}
                  </button>
                  {hasAlbums && (
                    <button
                      onClick={() => setActiveTab('series')}
                      className={`px-4 py-2 rounded-full text-xs font-sans tracking-wider transition-all duration-300 ${
                        activeTab === 'series'
                          ? 'bg-background text-foreground shadow-sm font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('curated.tab_series')}
                    </button>
                  )}
                  {hasPhotos && (
                    <button
                      onClick={() => setActiveTab('featured')}
                      className={`px-4 py-2 rounded-full text-xs font-sans tracking-wider transition-all duration-300 ${
                        activeTab === 'featured'
                          ? 'bg-background text-foreground shadow-sm font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('curated.tab_featured')}
                    </button>
                  )}
                </div>
              </div>
            </header>

            {/* ======================== 区域一：专题作品集系列 (Curated Series & Portfolios) ======================== */}
            {(activeTab === 'all' || activeTab === 'series') && hasAlbums && (
              <section className="py-20 md:py-28 px-6 md:px-12 lg:px-20 border-b border-border/40">
                <div className="max-w-7xl mx-auto flex flex-col gap-12">
                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div className="flex flex-col gap-2">
                      <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                        PORTFOLIO SERIES
                      </span>
                      <h2 className="font-serif text-3xl md:text-4xl text-foreground font-light">
                        {t('curated.series_section_title')}
                      </h2>
                    </div>
                    <p className="font-serif text-sm md:text-base text-muted-foreground max-w-md">
                      {t('curated.series_section_desc')}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14">
                    {albums.map((album) => {
                      const albumCover = album.coverUrl
                        ? resolveAssetUrl(album.coverUrl, cdn)
                        : album.photos[0]
                        ? resolveAssetUrl(album.photos[0].thumbnailUrl || album.photos[0].url, cdn)
                        : null

                      const previewPhotos = album.photos.slice(0, 4)

                      return (
                        <article
                          key={album.id}
                          className="group flex flex-col bg-card/40 rounded-lg border border-border/50 overflow-hidden hover:border-primary/50 transition-all duration-500 hover:shadow-lg"
                        >
                          {/* 点击直接在策展页内进入该作品集，不跳外部画廊 */}
                          <div
                            onClick={() => handleSelectAlbum(album.id)}
                            className="block relative aspect-[16/10] overflow-hidden bg-secondary cursor-pointer"
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                handleSelectAlbum(album.id)
                              }
                            }}
                            aria-label={album.name}
                          >
                            {albumCover ? (
                              <Image
                                src={albumCover}
                                alt={album.name}
                                fill
                                sizes="(max-width: 768px) 100vw, 50vw"
                                className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center font-serif text-5xl text-muted-foreground/20">
                                {album.name.charAt(0)}
                              </div>
                            )}

                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-85 transition-opacity duration-500" />

                            {/* 浮层标签与进入作品集操作 */}
                            <div className="absolute inset-0 p-6 md:p-8 flex flex-col justify-between text-white">
                              <div className="flex items-center justify-between">
                                <span className="px-3 py-1 rounded-full bg-black/40 backdrop-blur-md text-[11px] font-sans tracking-widest uppercase border border-white/20">
                                  {album.photoCount} {t('curated.series_frames_suffix')}
                                </span>
                                {album.location && (
                                  <span className="flex items-center gap-1.5 text-xs text-white/90 drop-shadow">
                                    <MapPin className="w-3.5 h-3.5 text-primary" />
                                    {album.location}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-end justify-between">
                                <div className="flex flex-col gap-1">
                                  <span className="font-serif text-2xl md:text-3xl font-medium tracking-tight line-clamp-1 drop-shadow-md">
                                    {album.name}
                                  </span>
                                  {album.description && (
                                    <p className="font-serif text-sm text-white/80 line-clamp-2 max-w-md drop-shadow">
                                      {album.description}
                                    </p>
                                  )}
                                </div>
                                <div className="size-10 rounded-full bg-white text-black flex items-center justify-center shrink-0 translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300">
                                  <ArrowRight className="w-4 h-4" />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 系列微型预览条 */}
                          {previewPhotos.length > 1 && (
                            <div className="p-4 bg-muted/20 border-t border-border/40 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 overflow-hidden">
                                {previewPhotos.map((photo, pIdx) => {
                                  const thumbUrl = resolveAssetUrl(photo.thumbnailUrl || photo.url, cdn)
                                  if (!thumbUrl) return null
                                  return (
                                    <div
                                      key={photo.id || pIdx}
                                      className="relative size-12 rounded-sm overflow-hidden bg-secondary shrink-0 border border-border/60 hover:opacity-80 transition-opacity cursor-pointer"
                                      onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        handleOpenPhoto(photo)
                                      }}
                                      title={photo.title}
                                    >
                                      <Image
                                        src={thumbUrl}
                                        alt={photo.title}
                                        fill
                                        sizes="48px"
                                        className="object-cover"
                                      />
                                    </div>
                                  )
                                })}
                              </div>

                              <button
                                onClick={() => handleSelectAlbum(album.id)}
                                className="text-xs font-sans tracking-wider uppercase text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                              >
                                <span>{t('curated.series_view_album')}</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </article>
                      )
                    })}
                  </div>
                </div>
              </section>
            )}

            {/* ======================== 区域二：策展代表作单幅展位 (Selected Signature Works) ======================== */}
            {(activeTab === 'all' || activeTab === 'featured') && hasPhotos && (
              <section className="py-20 md:py-32 px-6 md:px-12 lg:px-20 border-b border-border/40">
                <div className="max-w-7xl mx-auto flex flex-col gap-16 md:gap-24">
                  {/* 标题 */}
                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div className="flex flex-col gap-2">
                      <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                        MASTERPIECES
                      </span>
                      <h2 className="font-serif text-3xl md:text-4xl text-foreground font-light">
                        {t('curated.featured_section_title')}
                      </h2>
                    </div>
                    <p className="font-serif text-sm md:text-base text-muted-foreground max-w-md">
                      {t('curated.featured_section_desc')}
                    </p>
                  </div>

                  {/* 1. 展位焦点：全景 Lead Work */}
                  {leadPhoto && (
                    <article className="flex flex-col gap-6">
                      <div
                        onClick={() => handleOpenPhoto(leadPhoto)}
                        className="group relative w-full aspect-[16/10] md:aspect-[21/10] bg-secondary rounded-lg overflow-hidden cursor-pointer shadow-lg hover:shadow-2xl transition-all duration-700"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleOpenPhoto(leadPhoto)
                          }
                        }}
                        aria-label={leadPhoto.title}
                      >
                        <Image
                          src={resolveAssetUrl(leadPhoto.url, cdn)}
                          alt={leadPhoto.title}
                          fill
                          sizes="100vw"
                          priority
                          className="object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-[1.02]"
                        />

                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-8 md:p-12 text-white">
                          <div className="flex items-center gap-2 text-xs font-sans tracking-widest uppercase text-primary mb-2">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>{t('curated.lead_work_label')}</span>
                          </div>
                          <h3 className="font-serif text-2xl md:text-4xl font-light">{leadPhoto.title}</h3>
                          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-sans tracking-wider text-white/80">
                            {getCameraLine(leadPhoto) && <span>{getCameraLine(leadPhoto)}</span>}
                            {getExposureLine(leadPhoto) && <span>{getExposureLine(leadPhoto)}</span>}
                            <span>{getPhotoYear(leadPhoto)}</span>
                          </div>
                        </div>
                      </div>

                      {/* 焦点铭牌 */}
                      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 px-2">
                        <div className="flex flex-col gap-1">
                          <span className="font-serif text-xl md:text-2xl text-foreground font-medium">
                            {leadPhoto.title}
                          </span>
                          <span className="font-sans text-xs tracking-wider text-muted-foreground">
                            {getCameraLine(leadPhoto) || leadPhoto.tags || t('curated.subject_photo')}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          {getExposureLine(leadPhoto) && (
                            <span className="font-sans text-xs tracking-wider text-muted-foreground/80">
                              {getExposureLine(leadPhoto)}
                            </span>
                          )}
                          <button
                            onClick={() => handleOpenPhoto(leadPhoto)}
                            className="text-xs font-sans tracking-widest uppercase text-primary hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <span>{t('curated.view_in_detail')}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </article>
                  )}

                  {/* 2. 双联对照展位 (Diptych Pair) */}
                  {diptychPhotos.length >= 2 && (
                    <div className="flex flex-col gap-8 pt-8">
                      <div className="flex flex-col gap-1 border-l-2 border-primary pl-4">
                        <h3 className="font-serif text-xl md:text-2xl text-foreground font-light">
                          {t('curated.diptych_title')}
                        </h3>
                        <p className="font-serif text-sm text-muted-foreground">
                          {t('curated.diptych_desc')}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                        {diptychPhotos.map((photo) => (
                          <article key={photo.id} className="flex flex-col gap-3 group">
                            <div
                              onClick={() => handleOpenPhoto(photo)}
                              className="relative w-full aspect-[4/5] bg-secondary rounded-md overflow-hidden cursor-pointer"
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  handleOpenPhoto(photo)
                                }
                              }}
                              aria-label={photo.title}
                            >
                              <Image
                                src={resolveAssetUrl(photo.url, cdn)}
                                alt={photo.title}
                                fill
                                sizes="(max-width: 768px) 100vw, 50vw"
                                className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6 text-white">
                                <span className="font-sans text-xs tracking-widest uppercase text-primary flex items-center gap-1">
                                  {t('curated.view_in_detail')}
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </span>
                              </div>
                            </div>
                            <div className="flex items-baseline justify-between gap-2 pt-1">
                              <span className="font-serif text-lg text-foreground font-medium group-hover:text-primary transition-colors">
                                {photo.title}
                              </span>
                              <span className="font-sans text-xs tracking-wider text-muted-foreground">
                                {getPhotoYear(photo)}
                              </span>
                            </div>
                            {getCameraLine(photo) && (
                              <span className="font-sans text-xs tracking-wider text-muted-foreground/70 -mt-2">
                                {getCameraLine(photo)}
                              </span>
                            )}
                          </article>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3. 辑选展廊 (Gallery Flow) */}
                  {remainingPhotos.length > 0 && (
                    <div className="flex flex-col gap-8 pt-10">
                      <div className="flex items-center justify-between border-b border-border/40 pb-4">
                        <h3 className="font-serif text-xl md:text-2xl text-foreground font-light">
                          {t('curated.gallery_flow_title')}
                        </h3>
                        <span className="font-sans text-xs tracking-widest uppercase text-muted-foreground">
                          {remainingPhotos.length} {t('curated.frames_unit')}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
                        {remainingPhotos.map((photo, idx) => {
                          const aspectClass = idx % 3 === 1 ? 'aspect-[3/4]' : idx % 3 === 2 ? 'aspect-[1/1]' : 'aspect-[4/5]'

                          return (
                            <article key={photo.id} className="flex flex-col gap-2.5 group">
                              <div
                                onClick={() => handleOpenPhoto(photo)}
                                className={`relative w-full ${aspectClass} bg-secondary rounded-sm overflow-hidden cursor-pointer`}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    handleOpenPhoto(photo)
                                  }
                                }}
                                aria-label={photo.title}
                              >
                                <Image
                                  src={resolveAssetUrl(photo.thumbnailUrl || photo.url, cdn)}
                                  alt={photo.title}
                                  fill
                                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                                  className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-5 text-white">
                                  <span className="font-serif text-base font-medium line-clamp-1">{photo.title}</span>
                                  <span className="font-sans text-[11px] tracking-wider text-primary mt-1 flex items-center gap-1">
                                    {t('curated.view_photo')}
                                    <ArrowRight className="w-3 h-3" />
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-baseline justify-between gap-2 pt-1">
                                <span className="font-serif text-base text-foreground group-hover:text-primary transition-colors truncate">
                                  {photo.title}
                                </span>
                                <span className="font-sans text-xs tracking-wider text-muted-foreground shrink-0">
                                  {getPhotoYear(photo)}
                                </span>
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* 探索完整图库入口 */}
                  <div className="pt-10 flex justify-center">
                    <Link
                      href="/gallery"
                      className="group inline-flex items-center gap-3 px-8 py-4 rounded-full border border-border/80 hover:border-primary text-xs font-sans uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground hover:bg-primary/5 transition-all duration-300"
                    >
                      <span>{t('curated.view_all')}</span>
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {/* ======================== 区域三：策展手记 (Curatorial Statement) ======================== */}
            <section className="py-24 md:py-36 px-6 md:px-12 lg:px-20 bg-muted/20 border-b border-border/40">
              <div className="max-w-4xl mx-auto flex flex-col items-center text-center gap-10">
                <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.25em] text-primary">
                  STATEMENT
                </span>

                <h2 className="font-serif text-3xl md:text-5xl font-light text-foreground">
                  {t('curated.statement_title')}
                </h2>

                <div className="flex flex-col gap-6 text-muted-foreground font-serif text-base md:text-lg leading-relaxed max-w-2xl">
                  <p>{t('curated.statement_p1')}</p>
                  <p>{t('curated.statement_p2')}</p>
                </div>

                <div className="w-16 h-[1px] bg-border my-2" />

                <div className="flex flex-col items-center gap-1">
                  <span className="font-serif italic text-lg text-foreground">
                    {settings?.site_title || 'MO Gallery'}
                  </span>
                  <span className="font-sans text-xs uppercase tracking-widest text-muted-foreground">
                    {t('curated.statement_curator')}
                  </span>
                </div>

                <button
                  onClick={scrollToTop}
                  className="mt-8 inline-flex items-center gap-2 text-xs font-sans tracking-[0.2em] uppercase text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                  aria-label={t('curated.back_to_top')}
                >
                  <ArrowUp className="w-4 h-4" />
                  <span>{t('curated.back_to_top')}</span>
                </button>
              </div>
            </section>
          </>
        )}

        {/* 交互照片大图模态框 (包含 EXIF、故事链接、评论等) */}
        {selectedPhoto && (
          <PhotoDetailModal
            photo={selectedPhoto}
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false)
              setSelectedPhoto(null)
            }}
            onPhotoChange={(newPhoto) => setSelectedPhoto(newPhoto)}
            allPhotos={modalPhotosContext}
            totalPhotos={modalPhotosContext.length}
          />
        )}
      </div>
    </MotionConfig>
  )
}
