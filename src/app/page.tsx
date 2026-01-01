'use client'

import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useEffect, useState, useRef, useMemo } from 'react'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import { getFeaturedPhotos, resolveAssetUrl, type PhotoDto } from '@/lib/api'
import { useSettings } from '@/contexts/SettingsContext'
import { useLanguage } from '@/contexts/LanguageContext'

export default function Home() {
  const { settings } = useSettings()
  const { t } = useLanguage()
  const siteTitle = settings?.site_title || 'MO GALLERY'

  const [featuredImages, setFeaturedImages] = useState<PhotoDto[]>([])
  const [heroImage, setHeroImage] = useState<PhotoDto | null>(null)
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
          setHeroImage(data[Math.floor(Math.random() * data.length)])
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

  useEffect(() => {
    if (featuredImages.length > 0) {
      setHeroImage(featuredImages[currentHeroIndex])
    }
  }, [currentHeroIndex, featuredImages])

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground selection:bg-primary/30 selection:text-primary">
      {/* Hero Section */}
      <section 
        ref={heroRef}
        className="relative w-full h-screen flex flex-col justify-center items-center overflow-hidden"
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
              <motion.img
                src={resolveAssetUrl(heroImage.url)}
                alt="Hero Background"
                className="w-full h-full object-cover"
                initial={{ scale: 1.2 }}
                animate={{ scale: 1 }}
                transition={{ duration: 20, ease: 'linear' }}
              />
              {/* Multi-layer gradient overlay for depth */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/60" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20" />
              {/* Subtle vignette effect */}
              <div className="absolute inset-0" style={{
                background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.3) 100%)'
              }} />
            </motion.div>
          ) : (
            <motion.div 
              className="absolute inset-0 z-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {/* Animated gradient background when no image */}
              <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900" />
              <div className="absolute inset-0 opacity-30">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(120,119,198,0.3),transparent_50%)]" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating particles effect - Only render on client */}
        {isMounted && (
          <div className="absolute inset-0 z-[1] overflow-hidden pointer-events-none">
            {particles.map((particle) => (
              <motion.div
                key={particle.id}
                className="absolute w-1 h-1 bg-white/20 rounded-full"
                initial={{
                  x: particle.x,
                  y: particle.y,
                  opacity: 0,
                }}
                animate={{
                  y: [particle.y, particle.y - 100],
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

        {/* Hero Content */}
        <motion.div 
          className="z-10 relative px-6 text-center text-white"
          style={{ opacity: heroOpacity }}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="flex flex-col items-center gap-6"
          >
            {/* Decorative element */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="mb-4"
            >
              <Sparkles className="w-8 h-8 text-white/60" />
            </motion.div>

            <motion.h1 
              className="font-serif text-5xl md:text-7xl lg:text-8xl tracking-tight leading-none"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
            >
              <span className="block bg-gradient-to-r from-white via-white/90 to-white/80 bg-clip-text text-transparent">
                {t('home.hero_vis') || 'YOUR MOMENTS'}
              </span>
            </motion.h1>
            
            <motion.p 
              className="font-serif text-3xl md:text-5xl lg:text-6xl tracking-tight leading-none text-white/70"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
            >
              {t('home.hero_real') || 'YOUR STORIES'}
            </motion.p>
            
            {/* Animated divider */}
            <motion.div 
              className="flex items-center gap-4 my-6"
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 1, delay: 0.8 }}
            >
              <div className="h-[1px] w-16 bg-gradient-to-r from-transparent to-white/60" />
              <div className="w-2 h-2 rounded-full bg-white/60" />
              <div className="h-[1px] w-16 bg-gradient-to-l from-transparent to-white/60" />
            </motion.div>
            
            <motion.p 
              className="font-sans text-sm md:text-base max-w-lg text-white/60 leading-relaxed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 1 }}
            >
              {(t('home.hero_desc') || '').replace('{siteTitle}', siteTitle)}
            </motion.p>

            {/* CTA Button - Optimized without backdrop-blur for better performance */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.2 }}
              className="mt-8"
            >
              <Link 
                href="/gallery"
                className="group relative inline-flex items-center gap-3 px-8 py-4 bg-white/15 border border-white/30 rounded-full text-white text-sm tracking-wider hover:bg-white/25 hover:border-white/50 transition-colors duration-300"
              >
                <span className="relative z-10">{t('home.explore') || 'EXPLORE GALLERY'}</span>
                <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
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
                className={`h-2 rounded-full transition-all duration-300 ${
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
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <span className="text-[10px] tracking-[0.3em] uppercase font-light">
              {t('home.enter') || 'SCROLL TO EXPLORE'}
            </span>
            <div className="w-[1px] h-8 bg-gradient-to-b from-white/60 to-transparent" />
          </motion.div>
        </motion.div>
      </section>

      {/* Intro / Statement */}
      <section className="relative py-32 md:py-40 px-6 bg-background overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        </div>
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1 }}
          >
            {/* Quote marks */}
            <span className="block text-6xl md:text-8xl font-serif text-primary/20 leading-none mb-4">&ldquo;</span>
            
            <p className="font-serif text-2xl md:text-4xl font-light leading-relaxed text-foreground/90 -mt-8">
              {t('home.quote') || 'An ordinary photo becomes extraordinary because of your story.'}
            </p>
            
            <span className="block text-6xl md:text-8xl font-serif text-primary/20 leading-none mt-4 rotate-180">&rdquo;</span>
          </motion.div>
          
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, delay: 0.3 }}
            className="mt-8 w-48 h-[2px] bg-gradient-to-r from-transparent via-primary/40 to-transparent mx-auto"
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
            <span className="block text-xs tracking-[0.3em] text-primary/60 uppercase mb-3">
              {t('home.curated') || 'CURATED COLLECTION'}
            </span>
            <h2 className="font-serif text-4xl md:text-5xl text-foreground">
              {t('home.works') || 'Featured Works'}
            </h2>
          </div>
          
          <Link 
            href="/gallery" 
            className="group flex items-center gap-3 px-6 py-3 border border-border rounded-full hover:border-primary hover:bg-primary/5 transition-all duration-300"
          >
            <span className="font-sans text-xs tracking-[0.2em] text-muted-foreground group-hover:text-primary transition-colors">
              VIEW ALL WORKS
            </span>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-all group-hover:translate-x-1" />
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
                <div className="aspect-[4/5] bg-gradient-to-br from-secondary/60 to-secondary/30 animate-pulse rounded-lg overflow-hidden">
                  <div className="w-full h-full bg-gradient-to-t from-black/20 to-transparent" />
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
                    {/* Image */}
                    <img
                      src={resolveAssetUrl(image.thumbnailUrl || image.url)}
                      alt={image.title}
                      className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.08]"
                    />
                    
                    {/* Overlay gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    {/* Hover content */}
                    <div className="absolute inset-0 flex flex-col justify-end p-6 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-4 group-hover:translate-y-0">
                      <span className="text-white/80 text-xs tracking-[0.2em] uppercase mb-2">
                        {image.category}
                      </span>
                      <h3 className="text-white font-serif text-xl">
                        {image.title}
                      </h3>
                    </div>
                    
                    {/* Corner accent */}
                    <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-white/0 group-hover:border-white/60 transition-all duration-500 rounded-tr-lg" />
                    <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-white/0 group-hover:border-white/60 transition-all duration-500 rounded-bl-lg" />
                  </div>
                </Link>
                
                {/* Card info - visible on mobile */}
                <div className="flex flex-col items-center text-center md:hidden">
                  <h3 className="font-serif text-xl text-foreground">
                    {image.title}
                  </h3>
                  <span className="mt-2 text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                    {image.category}
                  </span>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </section>

      {/* About Section - Enhanced Design */}
      <section className="relative w-full py-32 overflow-hidden">
        {/* Background with gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-secondary/20 via-secondary/40 to-secondary/20" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,rgba(0,0,0,0.1)_100%)]" />
        
        {/* Decorative lines */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-border to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-border to-transparent" />
        
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            {/* Icon */}
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-8">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            
            <span className="block font-sans text-xs tracking-[0.3em] text-primary mb-6 uppercase">
              {t('home.artist') || 'ABOUT THE GALLERY'}
            </span>
            
            <p className="font-serif text-xl md:text-2xl text-foreground/80 leading-relaxed mb-12 max-w-2xl mx-auto">
              {(t('home.about_text') || '').replace('{siteTitle}', siteTitle)}
            </p>
            
            <Link
              href="/about"
              className="group inline-flex items-center gap-4 px-8 py-4 bg-foreground text-background rounded-full hover:bg-primary transition-colors duration-300"
            >
              <span className="font-sans text-sm tracking-[0.15em]">
                {t('home.read_bio') || 'LEARN MORE'}
              </span>
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
