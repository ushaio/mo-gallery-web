'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useEffect, useState, useRef, useMemo } from 'react'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import { getFeaturedPhotos, resolveAssetUrl, type PhotoDto } from '@/lib/api'
import { useSettings } from '@/contexts/SettingsContext'
import { useLanguage } from '@/contexts/LanguageContext'

export default function Home() {
  const { settings, envConfig } = useSettings()
  const { t } = useLanguage()
  const siteTitle = settings?.site_title || 'MO GALLERY'
  const siteAuthor = envConfig.siteAuthor

  const [featuredImages, setFeaturedImages] = useState<PhotoDto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0)
  const [isMounted, setIsMounted] = useState(false)

  const heroRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  })

  // 从滚动进度派生透明度、缩放与位移
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 1.1])
  const heroY = useTransform(scrollYProgress, [0, 0.5], [0, 100])

  // 仅在客户端生成粒子位置，避免水合不一致
  const particles = useMemo(() => {
    if (!isMounted) return []
    return [...Array(20)].map((_, i) => ({
      id: i,
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      duration: Math.random() * 10 + 10,
      delay: Math.random() * 5,
    }))
  }, [isMounted])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    const run = async () => {
      try {
        const data = await getFeaturedPhotos()
        if (data && data.length > 0) {
          setFeaturedImages(data)
        }
      } catch (err) {
        console.error('Failed to load featured images', err)
      } finally {
        setIsLoading(false)
      }
    }
    run()
  }, [])

  // 自动轮播首屏图片
  useEffect(() => {
    if (featuredImages.length <= 1) return
    const interval = setInterval(() => {
      setCurrentHeroIndex((prev) => (prev + 1) % featuredImages.length)
    }, 8000)
    return () => clearInterval(interval)
  }, [featuredImages.length])

  // 根据当前索引取首屏图片
  // 当前展示的首屏图片
  const heroImage = featuredImages.length > 0 ? featuredImages[currentHeroIndex] : null

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground selection:bg-primary/30 selection:text-primary">
      {/* 首屏区域 */}
      <section
        ref={heroRef}
        className="relative w-full h-dvh flex flex-col justify-center items-center overflow-hidden"
      >
        {/* 带视差的背景图动画 */}
        <AnimatePresence mode="wait">
          {heroImage ? (
            <motion.div
              key={heroImage.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: 'easeInOut' }}
              className="absolute inset-0 z-0"
              style={{ scale: heroScale, y: heroY }}
            >
              <motion.div
                className="relative w-full h-full"
              >
                <Image
                  src={resolveAssetUrl(heroImage.url)}
                  alt="Hero Background"
                  fill
                  sizes="100vw"
                  className="object-cover"
                  priority
                />
              </motion.div>
              {/* 叠加遮罩增强层次 */}
              <div className="absolute inset-0 bg-black/50" />
            </motion.div>
          ) : (
            <motion.div
              className="absolute inset-0 z-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {/* 无图片时的默认背景 */}
              <div className="absolute inset-0 bg-neutral-900" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 漂浮粒子效果，仅在客户端渲染 */}
        {isMounted && (
          <div className="absolute inset-0 z-[1] overflow-hidden pointer-events-none">
            {particles.map((particle) => (
              <motion.div
                key={particle.id}
                className="absolute size-1 bg-white/20 rounded-full"
                style={{
                  x: particle.x,
                  y: particle.y,
                }}
                animate={{
                  y: particle.y - 100,
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: particle.duration,
                  repeat: Infinity,
                  delay: particle.delay,
                }}
              />
            ))}
          </div>
        )}

        {/* 首屏内容 */}
        <motion.div
          className="z-10 relative px-6 text-center text-white"
          style={{ opacity: heroOpacity }}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.1, ease: "easeOut" }}
            className="flex flex-col items-center gap-6"
          >
            {/* 装饰元素 */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.2, delay: 0.1, ease: "easeOut" }}
              className="mb-4"
            >
              <Sparkles className="size-8 text-white/60" />
            </motion.div>

            <motion.h1
              className="font-serif text-5xl md:text-7xl lg:text-8xl leading-none text-balance"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.1, ease: "easeOut" }}
            >
              <span className="block text-white">
                {(t('home.hero_vis') || 'YOUR MOMENTS').replace('{SITE_AUTHOR}', siteAuthor)}
              </span>
            </motion.h1>

            <motion.p
              className="font-serif text-3xl md:text-5xl lg:text-6xl leading-none text-white/70 text-balance"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.15, ease: "easeOut" }}
            >
              {t('home.hero_real') || 'YOUR STORIES'}
            </motion.p>

            {/* 动画分隔线 */}
            <motion.div
              className="flex items-center gap-4 my-6"
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.2, delay: 0.2, ease: "easeOut" }}
            >
              <div className="h-[1px] w-16 bg-white/60" />
              <div className="size-2 rounded-full bg-white/60" />
              <div className="h-[1px] w-16 bg-white/60" />
            </motion.div>

            <motion.p
              className="font-sans text-sm md:text-base max-w-lg text-white/60 leading-relaxed text-pretty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: 0.2, ease: "easeOut" }}
            >
              {(t('home.hero_desc') || '').replace('{siteTitle}', siteTitle)}
            </motion.p>

            {/* CTA 按钮 - 去掉 backdrop-blur 以优化性能 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.2, ease: "easeOut" }}
              className="mt-8"
            >
              <Link
                href="/gallery"
                className="group relative inline-flex items-center gap-3 px-8 py-4 bg-white/15 border border-white/30 rounded-full text-white text-sm hover:bg-white/25 hover:border-white/50 transition-colors duration-200"
              >
                <span className="relative z-10">{t('home.explore') || 'EXPLORE GALLERY'}</span>
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* 首屏图片指示器 */}
        {featuredImages.length > 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2 }}
            className="absolute bottom-32 z-10 flex gap-2"
          >
            {featuredImages.slice(0, 5).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentHeroIndex(i)}
                aria-label={`View hero image ${i + 1}`}
                className={`h-2 rounded-full transition-all duration-200 ${i === currentHeroIndex
                  ? 'bg-white w-8'
                  : 'bg-white/40 hover:bg-white/60 w-2'
                  }`}
              />
            ))}
          </motion.div>
        )}

        {/* 滚动提示 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 1 }}
          className="absolute bottom-8 z-10 text-white/50"
        >
          <motion.div
            className="flex flex-col items-center gap-3"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          >
            <span className="text-[10px] uppercase font-light">
              {t('home.enter') || 'SCROLL TO EXPLORE'}
            </span>
            <div className="w-[1px] h-8 bg-white/60" />
          </motion.div>
        </motion.div>
      </section>

      {/* 引言 / 主题陈述 */}
      <section className="relative py-32 md:py-40 px-6 bg-background overflow-hidden">
        {/* 背景装饰 */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 size-96 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 size-96 bg-primary/5 rounded-full blur-3xl" />
        </div>

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1 }}
          >
            {/* 引号装饰 */}
            <span className="block text-6xl md:text-8xl font-serif text-primary/20 leading-none mb-4">&ldquo;</span>

            <p className="font-serif text-2xl md:text-4xl font-light leading-relaxed text-foreground/90 text-pretty">
              {t('home.quote') || 'An ordinary photo becomes extraordinary because of your story.'}
            </p>

            <span className="block text-6xl md:text-8xl font-serif text-primary/20 leading-none mt-4 rotate-180">&rdquo;</span>
          </motion.div>

          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, delay: 0.3 }}
            className="mt-8 w-48 h-[2px] bg-primary/40 mx-auto"
          />
        </div>
      </section>

      {/* 精选作品 - 强化网格布局 */}
      <section className="px-6 md:px-12 lg:px-24 pb-32 pt-16">
        <motion.div
          className="flex flex-col md:flex-row justify-between items-center mb-20 gap-6"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <div className="text-center md:text-left">
            <span className="block text-xs text-primary/60 uppercase mb-3">
              {t('home.curated') || 'CURATED COLLECTION'}
            </span>
            <h2 className="font-serif text-4xl md:text-5xl text-foreground text-balance">
              {t('home.works') || 'Featured Works'}
            </h2>
          </div>

          <Link
            href="/gallery"
            className="group flex items-center gap-3 px-6 py-3 border border-border rounded-full hover:border-primary hover:bg-primary/5 transition-all duration-200"
          >
            <span className="font-sans text-xs text-muted-foreground group-hover:text-primary transition-colors">
              VIEW ALL WORKS
            </span>
            <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary transition-all group-hover:translate-x-1" />
          </Link>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
          {isLoading ? (
            // 骨架屏占位
            [...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="space-y-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="aspect-[4/5] bg-secondary/60 animate-pulse rounded-lg overflow-hidden">
                  <div className="w-full h-full bg-secondary/30" />
                </div>
                <div className="space-y-3 px-2">
                  <div className="h-5 w-3/4 bg-secondary/50 rounded-full animate-pulse mx-auto" />
                  <div className="h-3 w-1/3 bg-secondary/30 rounded-full animate-pulse mx-auto" />
                </div>
              </motion.div>
            ))
          ) : (
            featuredImages.slice(0, 6).map((image, index) => (
              <motion.div
                key={image.id}
                initial={{ opacity: 0, y: 60 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{
                  duration: 0.8,
                  delay: index * 0.15,
                  ease: [0.25, 0.46, 0.45, 0.94]
                }}
                className="group"
              >
                <Link href={`/gallery?photoId=${image.id}`}>
                  <div className="relative overflow-hidden aspect-[4/5] bg-secondary rounded-lg mb-6 cursor-pointer">
                    {/* 图片 */}
                    <Image
                      src={resolveAssetUrl(image.thumbnailUrl || image.url)}
                      alt={image.title}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.08]"
                    />

                    {/* 悬停遮罩渐变 */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    {/* 悬停内容 - 仅在有分类时显示 */}
                    {image.category && (
                      <div className="absolute inset-0 flex flex-col justify-end p-6 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-4 group-hover:translate-y-0">
                        <span className="text-white/80 text-xs uppercase">
                          {image.category}
                        </span>
                      </div>
                    )}

                    {/* 角标装饰 */}
                    <div className="absolute top-4 right-4 size-8 border-t-2 border-r-2 border-white/0 group-hover:border-white/60 transition-all duration-500 rounded-tr-lg" />
                    <div className="absolute bottom-4 left-4 size-8 border-b-2 border-l-2 border-white/0 group-hover:border-white/60 transition-all duration-500 rounded-bl-lg" />
                  </div>
                </Link>

                {/* 卡片信息 - 移动端显示，仅展示分类 */}
                {image.category && (
                  <div className="flex flex-col items-center text-center md:hidden">
                    <span className="mt-2 text-[10px] text-muted-foreground uppercase">
                      {image.category}
                    </span>
                  </div>
                )}
              </motion.div>
            ))
          )}
        </div>
      </section>

      {/* 关于区域 - 强化设计 */}
      <section className="relative w-full py-32 overflow-hidden">
        {/* 背景 */}
        <div className="absolute inset-0 bg-secondary/30" />

        {/* 装饰线 */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-border" />
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-border" />

        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            {/* 图标 */}
            <div className="inline-flex items-center justify-center size-16 rounded-full bg-primary/10 mb-8">
              <Sparkles className="size-6 text-primary" />
            </div>

            <span className="block font-sans text-xs text-primary mb-6 uppercase">
              {t('home.artist') || 'ABOUT THE GALLERY'}
            </span>

            <p className="font-serif text-xl md:text-2xl text-foreground/80 leading-relaxed mb-12 max-w-2xl mx-auto text-pretty">
              {(t('home.about_text') || '').replace('{siteTitle}', siteTitle)}
            </p>

            <Link
              href="/about"
              className="group inline-flex items-center gap-4 px-8 py-4 bg-foreground text-background rounded-full hover:bg-primary transition-colors duration-200"
            >
              <span className="font-sans text-sm">
                {t('home.read_bio') || 'LEARN MORE'}
              </span>
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
