'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getFeaturedPhotos, resolveAssetUrl, type PhotoDto } from '@/lib/api'
import { useSettings } from '@/contexts/SettingsContext'
import { useLanguage } from '@/contexts/LanguageContext'

export default function Home() {
  const { settings } = useSettings()
  const { t } = useLanguage()
  const siteTitle = settings?.site_title || 'MO GALLERY'

  const [featuredImages, setFeaturedImages] = useState<
    Array<Pick<PhotoDto, 'id' | 'title' | 'category' | 'url' | 'thumbnailUrl'>>
  >([])
  const [isLoading, setIsLoading] = useState(true)

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

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Hero Section */}
      <section className="relative w-full h-screen flex flex-col justify-center items-center overflow-hidden px-6">
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="z-10 text-center mix-blend-difference"
        >
          <h1 className="flex flex-col items-center">
            <span className="text-6xl md:text-9xl font-serif font-light leading-none tracking-tighter text-foreground">
              {t('home.hero_vis')}
            </span>
            <span className="block font-sans font-bold text-sm md:text-xl tracking-[0.8em] mt-6 text-primary uppercase opacity-80">
              {t('home.hero_real')}
            </span>
          </h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 1 }}
          className="absolute bottom-12 left-6 md:left-12 max-w-xs md:max-w-md"
        >
          <p className="font-sans text-xs md:text-sm tracking-widest text-muted-foreground uppercase leading-relaxed">
            {t('home.hero_desc').replace('{siteTitle}', siteTitle)}
          </p>
        </motion.div>

        <motion.div 
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           transition={{ delay: 1, duration: 1 }}
           className="absolute bottom-12 right-6 md:right-12"
        >
          <Link 
            href="/gallery" 
            className="group flex items-center gap-4 font-sans text-sm tracking-[0.2em] hover:text-primary transition-colors duration-300"
          >
            {t('home.enter')}
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-2" />
          </Link>
        </motion.div>
      </section>

      {/* Featured Works - Horizontal Scroll */}
      <section className="w-full py-16 md:py-24 border-t border-border/50">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 md:mb-12 px-6 md:px-12">
          <h2 className="font-serif text-3xl md:text-5xl font-light text-foreground">
            {t('home.curated')} {t('home.works')}
          </h2>
          <div className="mt-4 md:mt-0 md:text-right">
             <span className="block font-sans text-xs tracking-[0.2em] text-primary mb-1">{t('home.latest')}</span>
             <p className="font-sans text-xs text-muted-foreground max-w-xs md:ml-auto">
               {t('home.latest_desc')}
             </p>
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex gap-4 md:gap-6 px-6 md:px-12 pb-4">
            {isLoading ? (
              // Skeleton placeholders
              <>
                {[...Array(5)].map((_, index) => (
                  <div
                    key={index}
                    className="flex-shrink-0 w-[200px] md:w-[240px] animate-pulse"
                  >
                    <div className="aspect-[4/5] bg-secondary rounded-sm" />
                    <div className="mt-3 space-y-2">
                      <div className="h-4 bg-secondary rounded w-3/4" />
                      <div className="h-3 bg-secondary rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </>
            ) : featuredImages.length > 0 ? (
              <>
                {featuredImages.map((image, index) => (
                  <motion.div
                    key={image.id}
                    initial={{ opacity: 0, x: 30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1, duration: 0.6 }}
                    className="group relative cursor-pointer flex-shrink-0 w-[200px] md:w-[240px]"
                  >
                    <div className="relative aspect-[4/5] overflow-hidden bg-secondary rounded-sm">
                       <div className="absolute top-2 left-2 z-10 font-sans text-[10px] font-bold text-white mix-blend-difference tracking-widest">
                          {(index + 1).toString().padStart(2, '0')}
                       </div>
                      <img
                        src={resolveAssetUrl(image.thumbnailUrl || image.url)}
                        alt={image.title}
                        className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 ease-out scale-100 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-500" />
                    </div>

                    <div className="mt-3 flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-serif text-sm md:text-base text-foreground group-hover:text-primary transition-colors duration-300 truncate">{image.title}</h3>
                        <p className="font-sans text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5 truncate">{image.category}</p>
                      </div>
                      <ArrowRight className="w-3 h-3 text-muted-foreground group-hover:text-primary -rotate-45 group-hover:rotate-0 transition-all duration-300 flex-shrink-0 ml-2" />
                    </div>
                  </motion.div>
                ))}

                {/* Go to Gallery Card */}
                <motion.div
                  initial={{ opacity: 0, x: 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: featuredImages.length * 0.1, duration: 0.6 }}
                  className="flex-shrink-0 w-[200px] md:w-[240px]"
                >
                  <Link
                    href="/gallery"
                    className="group flex flex-col items-center justify-center aspect-[4/5] bg-secondary/50 hover:bg-secondary border border-border/50 hover:border-primary/50 rounded-sm transition-all duration-500"
                  >
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-12 h-12 md:w-14 md:h-14 rounded-full border border-border group-hover:border-primary flex items-center justify-center transition-all duration-300">
                        <ArrowRight className="w-5 h-5 md:w-6 md:h-6 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
                      </div>
                      <div className="text-center">
                        <p className="font-sans text-xs tracking-[0.15em] text-muted-foreground group-hover:text-foreground transition-colors duration-300 uppercase">
                          {t('home.enter')}
                        </p>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              </>
            ) : (
              // Empty state - just show the gallery link
              <Link
                href="/gallery"
                className="group flex flex-col items-center justify-center flex-shrink-0 w-[200px] md:w-[240px] aspect-[4/5] bg-secondary/50 hover:bg-secondary border border-border/50 hover:border-primary/50 rounded-sm transition-all duration-500"
              >
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 md:w-14 md:h-14 rounded-full border border-border group-hover:border-primary flex items-center justify-center transition-all duration-300">
                    <ArrowRight className="w-5 h-5 md:w-6 md:h-6 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
                  </div>
                  <div className="text-center">
                    <p className="font-sans text-xs tracking-[0.15em] text-muted-foreground group-hover:text-foreground transition-colors duration-300 uppercase">
                      {t('home.enter')}
                    </p>
                  </div>
                </div>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* About Section - Text Heavy */}
      <section className="w-full py-32 bg-secondary text-secondary-foreground">
        <div className="max-w-[1920px] mx-auto px-6 md:px-12 flex flex-col md:flex-row gap-16 md:gap-32">
          <div className="w-full md:w-1/3">
             <h2 className="font-sans text-xs font-bold tracking-[0.2em] text-primary mb-8">{t('home.artist')}</h2>
             <div className="w-full h-[1px] bg-border mb-8"></div>
             <p className="font-serif text-3xl md:text-4xl leading-tight">
               {t('home.quote')}
             </p>
          </div>
          <div className="w-full md:w-2/3 flex flex-col justify-between">
             <div className="prose prose-invert max-w-none">
                <p className="font-sans text-lg md:text-xl text-muted-foreground leading-relaxed">
                  {t('home.about_text').replace('{siteTitle}', siteTitle)}
                </p>
             </div>
             <div className="mt-12">
               <Link
                href="/about"
                className="inline-block border border-primary px-8 py-4 font-sans text-xs tracking-[0.2em] hover:bg-primary hover:text-primary-foreground transition-all duration-300"
              >
                {t('home.read_bio')}
              </Link>
             </div>
          </div>
        </div>
      </section>
    </div>
  )
}
