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

  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 1.1])
  const heroY = useTransform(scrollYProgress, [0, 0.5], [0, 100])

  // Generate particle positions only on client side to avoid hydration mismatch
  const particles = useMemo(() => {
    if (!isMounted) return []
    // Use a fixed seed-like approach based on window size to make it consistent during re-renders if window doesn't change
    return [...Array(15)].map((_, i) => ({
      id: i,
      x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1000),
      y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 1000),
      duration: Math.random() * 15 + 15, // Slower, more elegant movement
      delay: Math.random() * 5,
      size: Math.random() * 2 + 1, // Varied sizes
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

  // Auto-rotate hero images
  useEffect(() => {
    if (featuredImages.length <= 1) return
    const interval = setInterval(() => {
      setCurrentHeroIndex((prev) => (prev + 1) % featuredImages.length)
    }, 8000)
    return () => clearInterval(interval)
  }, [featuredImages.length])

  // Derive hero image from current index
  const heroImage = featuredImages.length > 0 ? featuredImages[currentHeroIndex] : null

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground selection:bg-primary/30 selection:text-primary">
      {/* Hero Section */}
      <section
        ref={heroRef}
        className="relative w-full h-dvh flex flex-col justify-center items-center overflow-hidden"
      >
        {/* Animated Background Image with Parallax */}
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
              {/* Overlay for depth */}
              <div className="absolute inset-0 bg-black/50" />
            </motion.div>
          ) : (
            <motion.div
              className="absolute inset-0 z-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {/* Background when no image */}
              <div className="absolute inset-0 bg-neutral-900" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating particles effect - Only render on client */}
        {isMounted && (
          <div className="absolute inset-0 z-[1] overflow-hidden pointer-events-none">
            {particles.map((particle) => (
              <motion.div
                key={particle.id}
                className="absolute bg-white/20 rounded-full"
                style={{
                  x: particle.x,
                  y: particle.y,
                  width: particle.size,
                  height: particle.size,
                }}
                animate={{
                  y: particle.y - 150,
                  opacity: [0, 0.5, 0],
                }}
                transition={{
                  duration: particle.duration,
                  repeat: Infinity,
                  delay: particle.delay,
                  ease: "linear",
                }}
              />
            ))}
          </div>
        )}

        {/* Hero Content */}
        <motion.div
          className="z-10 relative px-6 text-center text-white max-w-5xl mx-auto"
          style={{ opacity: heroOpacity }}
        >
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center gap-6"
          >
            {/* Decorative element */}
            <motion.div
              initial={{ scale: 0, rotate: -45, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="mb-6 p-3 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm"
            >
              <Sparkles className="size-6 text-white/80" />
            </motion.div>

            <div className="flex flex-col gap-2">
              <motion.h1
                className="font-serif text-6xl md:text-8xl lg:text-9xl leading-tight tracking-tight text-balance drop-shadow-lg"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="block text-white font-medium">
                  {(t('home.hero_vis') || 'YOUR MOMENTS').replace('{SITE_AUTHOR}', siteAuthor)}
                </span>
              </motion.h1>
              
              <motion.p
                className="font-serif text-3xl md:text-5xl lg:text-6xl leading-tight tracking-tight text-white/80 text-balance italic"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                {t('home.hero_real') || 'YOUR STORIES'}
              </motion.p>
            </div>
            
            {/* Animated divider */}
            <motion.div
              className="flex items-center gap-6 my-8"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
            >
              <div className="h-[1px] w-12 md:w-24 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
              <div className="size-1.5 rounded-full bg-white/60" />
              <div className="h-[1px] w-12 md:w-24 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            </motion.div>
            
            <motion.p
              className="font-sans text-sm md:text-lg max-w-xl text-white/70 leading-relaxed text-pretty font-light tracking-wide"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
            >
              {(t('home.hero_desc') || '').replace('{siteTitle}', siteTitle)}
            </motion.p>

            {/* CTA Button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="mt-10"
            >
              <Link
                href="/gallery"
                className="group relative inline-flex items-center gap-3 px-10 py-4 bg-white text-black rounded-full text-sm font-medium tracking-widest uppercase hover:bg-white/90 transition-all duration-300 hover:scale-105 hover:shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]"
              >
                <span className="relative z-10">{t('home.explore') || 'EXPLORE GALLERY'}</span>
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Hero image indicators */}
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
                className={`h-2 rounded-full transition-all duration-200 ${
                  i === currentHeroIndex
                    ? 'bg-white w-8'
                    : 'bg-white/40 hover:bg-white/60 w-2'
                }`}
              />
            ))}
          </motion.div>
        )}

        {/* Scroll Indicator */}
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

      {/* Intro / Statement */}
      <section className="relative py-40 md:py-52 px-6 bg-background overflow-hidden">
        {/* Subtle Background decoration */}
        <div className="absolute inset-0 pointer-events-none opacity-30">
           <div className="absolute top-0 right-0 w-full h-px bg-gradient-to-r from-transparent via-border to-transparent" />
           <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>
        
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Minimalist Quote */}
            <p className="font-serif text-3xl md:text-5xl lg:text-6xl font-light leading-snug text-foreground text-balance tracking-tight">
              &ldquo;{t('home.quote') || 'An ordinary photo becomes extraordinary because of your story.'}&rdquo;
            </p>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            whileInView={{ opacity: 1, width: "120px" }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
            className="mt-12 h-px bg-foreground/20 mx-auto"
          />
        </div>
      </section>

      {/* Featured Works - Enhanced Grid Layout */}
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
            // Enhanced Skeletons
            [...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="space-y-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="aspect-[4/5] bg-secondary/60 animate-pulse rounded-none overflow-hidden">
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
                className="group relative"
              >
                <Link href={`/gallery?photoId=${image.id}`}>
                  <div className="relative overflow-hidden aspect-[4/5] bg-secondary rounded-none mb-6 cursor-pointer shadow-sm transition-shadow duration-500 hover:shadow-xl">
                    {/* Image */}
                    <Image
                      src={resolveAssetUrl(image.thumbnailUrl || image.url)}
                      alt={image.title}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                    />

                    {/* Subtle Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    {/* Hover content */}
                    <div className="absolute inset-0 flex flex-col justify-end p-8 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-4 group-hover:translate-y-0">
                       <h3 className="text-white font-serif text-2xl font-light tracking-wide mb-2 transform transition-transform duration-500 delay-100">
                         {image.title}
                       </h3>
                       {image.category && (
                        <span className="inline-block text-white/70 text-xs tracking-[0.2em] uppercase transform transition-transform duration-500 delay-150">
                          {image.category}
                        </span>
                       )}
                    </div>
                  </div>
                </Link>
                
                {/* Mobile Info */}
                <div className="flex flex-col items-start md:hidden px-2">
                  <h3 className="text-lg font-serif text-foreground">{image.title}</h3>
                  {image.category && (
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
                      {image.category}
                    </span>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </section>

      {/* About Section - Modern Minimalist */}
      <section className="relative w-full py-32 md:py-40 overflow-hidden bg-secondary/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
           {/* Left Content */}
           <motion.div
             initial={{ opacity: 0, x: -30 }}
             whileInView={{ opacity: 1, x: 0 }}
             viewport={{ once: true }}
             transition={{ duration: 0.8, ease: "easeOut" }}
             className="relative z-10"
           >
              <span className="block font-sans text-xs font-bold tracking-[0.2em] text-muted-foreground mb-6 uppercase">
                {t('home.artist') || 'The Philosophy'}
              </span>
              
              <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl text-foreground mb-8 leading-tight">
                Reflecting Life <br/> <span className="text-muted-foreground italic">Through Lens</span>
              </h2>

              <p className="font-sans text-lg text-muted-foreground leading-relaxed mb-10 max-w-lg text-pretty">
                {(t('home.about_text') || '').replace('{siteTitle}', siteTitle)}
              </p>

              <Link
                href="/about"
                className="group inline-flex items-center gap-3 text-foreground font-medium border-b border-foreground/30 pb-1 hover:border-foreground transition-all duration-300"
              >
                <span className="font-sans text-sm tracking-widest uppercase">
                  {t('home.read_bio') || 'Read More'}
                </span>
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
           </motion.div>

           {/* Right Visual */}
           <motion.div
             className="relative aspect-[4/5] md:aspect-square bg-muted overflow-hidden"
             initial={{ opacity: 0, scale: 0.95 }}
             whileInView={{ opacity: 1, scale: 1 }}
             viewport={{ once: true }}
             transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
           >
             {/* Abstract shapes or featured image placeholder */}
             <div className="absolute inset-0 bg-gradient-to-br from-secondary to-background" />
             <div className="absolute inset-10 border border-foreground/5" />
             <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="size-24 text-foreground/5" />
             </div>
           </motion.div>
        </div>
      </section>
    </div>
  )
}
