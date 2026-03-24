'use client'

import Link from 'next/link'
import { ArrowRight, Mail, Instagram, Twitter } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'

export default function About() {
  const { t } = useLanguage()

  return (
    <div className="flex min-h-screen items-center bg-background pt-24 text-foreground md:pt-0">
      <div className="mx-auto w-full max-w-[1920px] px-6 py-24 md:py-12">
        <div className="flex flex-col items-stretch gap-16 md:flex-row lg:gap-32">
          <div className="relative min-h-[50vh] w-full md:min-h-[70vh] md:w-1/2">
            <div className="absolute inset-0 overflow-hidden bg-secondary">
              <img
                src="https://r2.mo-gallery.shaio.top/2023/2afb8c3aabd86e361ade492ded3293fa.JPG?auto=format&fit=crop&w=1200&q=80"
                alt={t('about.artist_alt')}
                className="h-full w-full object-cover grayscale transition-all duration-1000 ease-out hover:grayscale-0"
              />
              <div className="pointer-events-none absolute inset-0 border border-border/50" />
            </div>

            <div className="absolute bottom-[-2rem] right-[-1rem] z-10 max-w-xs border border-border bg-background p-6 md:right-[-4rem] md:p-8">
              <p className="font-serif text-3xl italic">
                {t('about.quote')}
              </p>
            </div>
          </div>

          <div className="flex w-full flex-col justify-center md:w-1/2">
            <div className="mb-12">
              <span className="mb-4 block text-xs font-bold uppercase tracking-[0.2em] text-primary">
                {t('about.bio_label')}
              </span>
              <h1 className="mb-8 font-serif text-6xl font-light leading-none tracking-tighter md:text-8xl">
                {t('about.title')}
                <br />
                {t('about.subtitle')}
              </h1>
            </div>

            <div className="prose prose-lg prose-invert space-y-6 font-serif leading-relaxed text-muted-foreground">
              <p>
                <span className="float-left mr-3 mt-[-10px] text-5xl text-foreground">
                  {t('about.p1_start')}
                </span>
                {t('about.p1')}
              </p>
              <p>{t('about.p2')}</p>
            </div>

            <div className="mt-16 border-t border-border pt-8">
              <h3 className="mb-8 text-xs font-bold uppercase tracking-[0.2em] text-primary">
                {t('about.contact')}
              </h3>

              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                <div className="space-y-4">
                  <a href="mailto:hi@mogallery.com" className="group flex items-center gap-4">
                    <div className="border border-border p-3 transition-colors group-hover:bg-primary group-hover:text-background">
                      <Mail className="h-4 w-4" />
                    </div>
                    <span className="text-sm uppercase tracking-widest text-muted-foreground transition-colors group-hover:text-foreground">
                      hi@mogallery.com
                    </span>
                  </a>
                </div>

                <div className="flex gap-4">
                  <a href="#" className="border border-border p-3 transition-colors hover:bg-primary hover:text-background">
                    <Instagram className="h-4 w-4" />
                  </a>
                  <a href="#" className="border border-border p-3 transition-colors hover:bg-primary hover:text-background">
                    <Twitter className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>

            <div className="mt-12">
              <Link
                href="/gallery"
                className="group inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] transition-colors hover:text-primary"
              >
                {t('about.view_portfolio')}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-2" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
