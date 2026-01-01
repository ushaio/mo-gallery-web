'use client'

import Link from 'next/link'
import { ArrowRight, ArrowDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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

  useEffect(() => {
    const run = async () => {
      try {
        const data = await getFeaturedPhotos()
        if (data && data.length > 0) {
          setFeaturedImages(data)
          // Pick a random image for the hero background
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

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Hero Section */}
      <section className="relative w-full h-screen flex flex-col justify-center items-center overflow-hidden">
        {/* Background Image */}
        <AnimatePresence>
          {heroImage ? (
            <motion.div
              key={heroImage.id}
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              className="absolute inset-0 z-0"
            >
              <img
                src={resolveAssetUrl(heroImage.url)}
                alt="Hero Background"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
            </motion.div>
          ) : (
             <div className="absolute inset-0 bg-neutral-900 z-0" />
          )}
        </AnimatePresence>

        {/* Hero Content */}
        <div className="z-10 relative px-6 text-center text-white">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex flex-col items-center gap-4"
          >
            <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl tracking-tight leading-tight opacity-90">
              {t('home.hero_vis') || 'YOUR MOMENTS'}
            </h1>
            <p className="font-serif text-3xl md:text-5xl lg:text-6xl tracking-tight leading-tight opacity-80">
              {t('home.hero_real') || 'YOUR STORIES'}
            </p>
            <div className="h-[1px] w-24 bg-white/60 my-4" />
            <p className="font-sans text-sm md:text-base max-w-md text-white/70">
              {(t('home.hero_desc') || '').replace('{siteTitle}', siteTitle)}
            </p>
          </motion.div>
        </div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
          className="absolute bottom-12 z-10 text-white/50"
        >
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] tracking-[0.2em] uppercase">{t('home.enter') || 'START EXPLORING'}</span>
            <ArrowDown className="w-4 h-4 animate-bounce" />
          </div>
        </motion.div>
      </section>

      {/* Intro / Statement */}
      <section className="py-24 md:py-32 px-6 bg-background">
        <div className="max-w-4xl mx-auto text-center">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="font-serif text-xl md:text-3xl font-light leading-relaxed text-foreground/90"
          >
            {t('home.quote') || '"An ordinary photo becomes extraordinary because of your story."'}
          </motion.p>
          <motion.div
             initial={{ scaleX: 0 }}
             whileInView={{ scaleX: 1 }}
             viewport={{ once: true }}
             transition={{ duration: 1, delay: 0.4 }}
             className="mt-12 w-32 h-[1px] bg-primary/20 mx-auto"
          />
        </div>
      </section>

      {/* Featured Works - Grid Layout */}
      <section className="px-6 md:px-12 lg:px-24 pb-32">
        <div className="flex flex-col md:flex-row justify-between items-baseline mb-16 gap-4">
          <h2 className="font-serif text-3xl md:text-4xl text-foreground">
            {t('home.curated') || 'Selected'} {t('home.works') || 'Works'}
          </h2>
          <Link 
            href="/gallery" 
            className="group flex items-center gap-2 font-sans text-xs tracking-[0.2em] text-muted-foreground hover:text-primary transition-colors duration-300"
          >
            VIEW ALL
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12">
          {isLoading ? (
            // Skeletons
            [...Array(3)].map((_, i) => (
              <div key={i} className="space-y-4">
                <div className="aspect-[4/5] bg-secondary/50 animate-pulse rounded-sm" />
                <div className="space-y-2">
                   <div className="h-4 w-2/3 bg-secondary/50 rounded animate-pulse" />
                   <div className="h-3 w-1/3 bg-secondary/50 rounded animate-pulse" />
                </div>
              </div>
            ))
          ) : (
            featuredImages.slice(0, 6).map((image, index) => (
              <motion.div
                key={image.id}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10%" }}
                transition={{ duration: 0.8, delay: index * 0.1 }}
                className="group cursor-pointer"
              >
                <div className="relative overflow-hidden aspect-[4/5] bg-secondary rounded-sm mb-6">
                   <Link href={`/gallery?photoId=${image.id}`}>
                      <img
                        src={resolveAssetUrl(image.thumbnailUrl || image.url)}
                        alt={image.title}
                        className="w-full h-full object-cover grayscale transition-all duration-700 ease-out group-hover:grayscale-0 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-500" />
                   </Link>
                </div>
                
                <div className="flex flex-col items-center text-center">
                  <h3 className="font-serif text-xl text-foreground group-hover:text-primary transition-colors duration-300">
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

      {/* About Section - Simplified & Integrated */}
      <section className="w-full py-24 bg-secondary/30 border-t border-border/50">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <span className="block font-sans text-xs tracking-[0.2em] text-primary mb-6 uppercase">
            {t('home.artist') || 'ABOUT US'}
          </span>
          <div className="prose prose-lg prose-neutral dark:prose-invert mx-auto mb-12">
            <p className="font-serif text-lg md:text-xl text-muted-foreground leading-relaxed">
              {(t('home.about_text') || '').replace('{siteTitle}', siteTitle)}
            </p>
          </div>
          <Link
            href="/about"
            className="inline-flex items-center gap-3 border-b border-primary/30 pb-1 font-sans text-xs tracking-[0.2em] hover:text-primary hover:border-primary transition-all duration-300"
          >
            {t('home.read_bio') || 'LEARN MORE'}
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </section>
    </div>
  )
}
