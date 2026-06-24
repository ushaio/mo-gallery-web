'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ArrowUp } from 'lucide-react'
import { motion, MotionConfig } from 'framer-motion'
import { resolveAssetUrl } from '@/lib/api/core'
import type { PhotoDto } from '@/lib/api/types'
import { useSettings } from '@/contexts/SettingsContext'
import { useLanguage } from '@/contexts/LanguageContext'

interface CuratedContentProps {
  photos: PhotoDto[]
}

// Masonry 三列错落的高度比例，循环使用以制造参差感
const MASONRY_ASPECTS = [
  'aspect-[4/5]', // 高
  'aspect-[3/2]', // 横
  'aspect-[1/1]', // 方
  'aspect-[4/5]',
  'aspect-[3/2]',
  'aspect-[5/7]',
  'aspect-[1/1]',
  'aspect-[4/5]',
  'aspect-[3/2]',
]

export function CuratedContent({ photos }: CuratedContentProps) {
  const { settings } = useSettings()
  const { t } = useLanguage()
  const cdn = settings?.cdn_domain

  const isEmpty = photos.length === 0
  const heroPhoto = photos[0] ?? null
  const featurePhoto = photos[1] ?? null
  const masonryPhotos = photos.slice(2)

  // 编号格式化：№ 01 / № 02 … 与 photos 数组顺序一致，稳定可读
  const num = (i: number) => `№ ${String(i).padStart(2, '0')}`

  // 取照片年份（优先拍摄时间，回退创建时间）
  const photoYear = (p: PhotoDto) => {
    const dateStr = p.takenAt || p.createdAt
    const year = dateStr ? new Date(dateStr).getFullYear() : null
    return year ? String(year) : '—'
  }

  // 单张照片的策展署名行：题材 · 画幅 · 年份
  const photoByline = (p: PhotoDto) => {
    const subject = p.category?.split(',')[0]?.trim() || t('curated.subject_photo')
    const format = p.photoType === 'film' ? t('curated.format_film') : t('curated.format_digital')
    return `${subject}  ·  ${format}  ·  ${photoYear(p)}`
  }

  // 整辑的年份跨度
  const yearRange = (() => {
    const years = photos
      .map((p) => {
        const dateStr = p.takenAt || p.createdAt
        return dateStr ? new Date(dateStr).getFullYear() : null
      })
      .filter((y): y is number => y !== null)
      .sort((a, b) => a - b)
    if (years.length === 0) return ''
    const min = years[0]
    const max = years[years.length - 1]
    return min === max ? String(min) : `${min}—${max}`
  })()

  // 整辑涉及的画幅类型
  const formatsPresent = (() => {
    const set = new Set(photos.map((p) => p.photoType))
    const parts: string[] = []
    if (set.has('film')) parts.push(t('curated.format_film'))
    if (set.has('digital')) parts.push(t('curated.format_digital'))
    return parts.length ? parts.join('  ·  ') : '—'
  })()

  // Hero 下的统计行：12 帧 · 2024—2026
  const heroMeta = `${photos.length} ${t('curated.frames_unit')}  ·  ${yearRange || '—'}`

  const scrollToTop = () => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' })
  }

  const colophonMeta = [
    { label: t('curated.meta_curator'), value: t('curated.meta_curator_value') },
    { label: t('curated.meta_years'), value: yearRange || '—' },
    { label: t('curated.meta_format'), value: formatsPresent },
    { label: t('curated.meta_print'), value: t('curated.meta_print_value') },
  ]

  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-background text-foreground">
        {isEmpty ? (
          /* ============ 空状态：顶部即给出说明，不再渲染空白大图与章节 ============ */
          <section className="min-h-[70vh] flex items-center justify-center px-6 py-32 text-center">
            <div className="flex flex-col gap-5 max-w-md">
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {t('curated.edition_label')}
              </span>
              <h1 className="font-serif text-5xl md:text-7xl font-bold leading-[0.95] tracking-tight">
                {t('curated.hero_title')}
              </h1>
              <p className="font-serif text-base md:text-lg leading-relaxed text-muted-foreground">
                {t('curated.empty_desc')}
              </p>
              <Link
                href="/gallery"
                className="mt-4 inline-flex items-center justify-center gap-2 px-6 py-3 border border-border rounded-full hover:border-primary hover:bg-primary/5 transition-all duration-200 cursor-pointer"
              >
                <span className="font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {t('curated.view_all')}
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </Link>
            </div>
          </section>
        ) : (
          <>
            {/* ============ Hero: 5/7 不对称编辑式标题区 ============ */}
            <section className="relative w-full">
              <div className="grid grid-cols-1 md:grid-cols-12">
                {/* 左侧文字栏 - 占 5 列 */}
                <div className="md:col-span-5 flex flex-col justify-center px-6 py-24 md:px-16 md:py-32 lg:px-24 lg:py-40 gap-8">
                  <motion.span
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground"
                  >
                    {t('curated.edition_label')}
                  </motion.span>

                  <motion.h1
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.05 }}
                    className="font-serif text-[18vw] md:text-[8vw] lg:text-[7vw] font-bold leading-[0.9] tracking-tighter"
                  >
                    {t('curated.hero_title')}
                  </motion.h1>

                  <motion.p
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.15 }}
                    className="font-serif text-base md:text-lg leading-relaxed text-muted-foreground max-w-md"
                  >
                    {t('curated.hero_desc')}
                  </motion.p>

                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.7, delay: 0.3 }}
                    className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
                  >
                    {heroMeta}
                  </motion.span>
                </div>

                {/* 右侧 signature 大图 - 占 7 列，可点击查看 */}
                <div className="md:col-span-7 relative min-h-[60vh] md:min-h-dvh bg-secondary overflow-hidden">
                  {heroPhoto && (
                    <Link
                      href={`/gallery?photoId=${heroPhoto.id}`}
                      className="group absolute inset-0 block cursor-pointer"
                      aria-label={heroPhoto.title}
                    >
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1.2, ease: 'easeOut' }}
                        className="absolute inset-0"
                      >
                        <Image
                          src={resolveAssetUrl(heroPhoto.url, cdn)}
                          alt={heroPhoto.title}
                          fill
                          sizes="(max-width: 768px) 100vw, 60vw"
                          className="object-cover transition-transform duration-[1.4s] ease-out group-hover:scale-[1.04]"
                          priority
                        />
                      </motion.div>
                      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 p-6 md:p-10 gap-2">
                        <span className="font-serif text-lg md:text-2xl text-white leading-tight line-clamp-2">
                          {heroPhoto.title}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/70 flex items-center gap-2">
                          {t('curated.view_photo')}
                          <ArrowRight className="size-3.5" />
                        </span>
                      </div>
                    </Link>
                  )}
                </div>
              </div>
            </section>

            {/* ============ Chapter One: Feature 主打大片 ============ */}
            {featurePhoto && (
              <section className="border-t border-border">
                <div className="px-6 md:px-16 lg:px-24 py-12 md:py-16 flex items-baseline justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    {t('curated.chapter_one')}
                  </span>
                  <span className="font-serif text-base md:text-xl italic text-foreground">
                    {t('curated.chapter_one_title')}
                  </span>
                </div>

                <Link
                  href={`/gallery?photoId=${featurePhoto.id}`}
                  className="group relative block w-full aspect-[16/9] md:aspect-[21/9] bg-secondary overflow-hidden cursor-pointer"
                  aria-label={featurePhoto.title}
                >
                  <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true, margin: '-100px' }}
                    transition={{ duration: 0.8 }}
                    className="absolute inset-0"
                  >
                    <Image
                      src={resolveAssetUrl(featurePhoto.url, cdn)}
                      alt={featurePhoto.title}
                      fill
                      sizes="100vw"
                      className="object-cover transition-transform duration-[1.4s] ease-out group-hover:scale-[1.04]"
                    />
                  </motion.div>
                  <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 p-6 md:p-10 gap-2">
                    <span className="font-serif text-lg md:text-2xl text-white leading-tight line-clamp-2">
                      {featurePhoto.title}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/70 flex items-center gap-2">
                      {t('curated.view_photo')}
                      <ArrowRight className="size-3.5" />
                    </span>
                  </div>
                </Link>

                <div className="px-6 md:px-16 lg:px-24 pt-10 md:pt-12 pb-20 md:pb-28 grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-16">
                  <div className="md:col-span-4 flex flex-col gap-4">
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {num(2)}
                    </span>
                    <h2 className="font-serif text-3xl md:text-4xl leading-[1.05] tracking-tight">
                      {featurePhoto.title}
                    </h2>
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {photoByline(featurePhoto)}
                    </span>
                  </div>
                  <div className="md:col-span-7 md:col-start-6 flex flex-col gap-6">
                    <p className="font-serif text-base md:text-lg leading-[1.75] text-muted-foreground">
                      {t('curated.feature_note')}
                    </p>
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {t('curated.edition_label')}
                    </span>
                  </div>
                </div>
              </section>
            )}

            {/* ============ Chapter Two: Masonry 错落精选网格 ============ */}
            {masonryPhotos.length > 0 && (
              <section className="border-t border-border">
                <div className="px-6 md:px-16 lg:px-24 py-12 md:py-16 flex items-baseline justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    {t('curated.chapter_two')}
                  </span>
                  <span className="font-serif text-base md:text-xl italic text-foreground">
                    {t('curated.chapter_two_title')}
                  </span>
                </div>

                <div className="px-6 md:px-16 lg:px-24 pb-20 md:pb-28">
                  <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 md:gap-8 [column-fill:_balance]">
                    {masonryPhotos.map((photo, index) => {
                      const aspectClass = MASONRY_ASPECTS[index % MASONRY_ASPECTS.length]
                      const category = photo.category?.split(',')[0]?.trim() || t('curated.subject_photo')
                      const format =
                        photo.photoType === 'film' ? t('curated.format_film') : t('curated.format_digital')
                      return (
                        <motion.div
                          key={photo.id}
                          initial={{ opacity: 0, y: 30 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true, margin: '-50px' }}
                          transition={{
                            duration: 0.7,
                            delay: (index % 3) * 0.08,
                            ease: [0.25, 0.46, 0.45, 0.94],
                          }}
                          className="break-inside-avoid mb-6 md:mb-8 group"
                        >
                          <Link href={`/gallery?photoId=${photo.id}`} className="block cursor-pointer">
                            <div className={`relative w-full ${aspectClass} bg-secondary overflow-hidden`}>
                              <Image
                                src={resolveAssetUrl(photo.thumbnailUrl || photo.url, cdn)}
                                alt={photo.title}
                                fill
                                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                                className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
                              />
                              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 p-4 gap-1.5">
                                <span className="font-serif text-base md:text-lg text-white leading-tight line-clamp-2">
                                  {photo.title}
                                </span>
                                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/70 flex items-center gap-1.5">
                                  {t('curated.view_photo')}
                                  <ArrowRight className="size-3" />
                                </span>
                              </div>
                            </div>
                            <div className="mt-3 flex items-baseline justify-between gap-2">
                              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate">
                                {num(index + 3)}  —  {category}
                              </span>
                              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 shrink-0">
                                {format}  ·  {photoYear(photo)}
                              </span>
                            </div>
                          </Link>
                        </motion.div>
                      )
                    })}
                  </div>

                  <div className="mt-16 md:mt-24 flex justify-center">
                    <Link
                      href="/gallery"
                      className="group inline-flex items-center gap-3 px-8 py-4 border border-border rounded-full hover:border-primary hover:bg-primary/5 transition-all duration-200 cursor-pointer"
                    >
                      <span className="font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground group-hover:text-primary transition-colors">
                        {t('curated.view_all')}
                      </span>
                      <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary transition-all group-hover:translate-x-1" />
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {/* ============ Quote Section ============ */}
            <section className="border-y border-border py-32 md:py-40 px-6">
              <div className="max-w-4xl mx-auto text-center">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, margin: '-100px' }}
                  transition={{ duration: 1 }}
                >
                  <span className="block text-7xl md:text-8xl font-serif text-primary/20 leading-none mb-4">
                    &ldquo;
                  </span>
                  <p className="font-serif text-2xl md:text-4xl font-light leading-relaxed text-foreground/90">
                    {t('curated.quote')}
                  </p>
                  <span className="block text-7xl md:text-8xl font-serif text-primary/20 leading-none mt-4 rotate-180">
                    &ldquo;
                  </span>
                </motion.div>

                <motion.div
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.2, delay: 0.3 }}
                  className="mt-8 w-48 h-[2px] bg-primary/40 mx-auto"
                />

                <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  {t('curated.quote_attribution')}
                </p>
              </div>
            </section>

            {/* ============ Chapter Three: Colophon 策展说明 ============ */}
            <section className="border-b border-border">
              <div className="px-6 md:px-16 lg:px-24 py-12 md:py-16 flex items-baseline justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  {t('curated.chapter_three')}
                </span>
                <span className="font-serif text-base md:text-xl italic text-foreground">
                  {t('curated.chapter_three_title')}
                </span>
              </div>

              <div className="px-6 md:px-16 lg:px-24 pb-20 md:pb-28 grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-16">
                <div className="md:col-span-6 flex flex-col gap-7">
                  <h2 className="font-serif text-4xl md:text-5xl leading-[1.05] tracking-tight">
                    {t('curated.colophon_title')}
                  </h2>
                  <p className="font-serif text-base md:text-lg leading-[1.75] text-muted-foreground">
                    {t('curated.colophon_p1')}
                  </p>
                  <p className="font-serif text-base md:text-lg leading-[1.75] text-muted-foreground">
                    {t('curated.colophon_p2')}
                  </p>
                </div>

                <div className="md:col-span-5 md:col-start-8 grid grid-cols-2 gap-x-6 gap-y-8 self-start">
                  {colophonMeta.map((item) => (
                    <div key={item.label} className="flex flex-col gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        {item.label}
                      </span>
                      <span className="font-serif text-lg text-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 返回顶部 — 像翻回到杂志封面 */}
              <div className="px-6 md:px-16 lg:px-24 pb-16 md:pb-20 flex justify-center">
                <button
                  onClick={scrollToTop}
                  className="group inline-flex items-center gap-3 cursor-pointer"
                  aria-label={t('curated.back_to_top')}
                >
                  <ArrowUp className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground group-hover:text-primary transition-colors">
                    {t('curated.back_to_top')}
                  </span>
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </MotionConfig>
  )
}
