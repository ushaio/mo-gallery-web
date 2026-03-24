'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'

export default function NotFound() {
  const { t } = useLanguage()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="space-y-8"
      >
        <div className="space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.5em] text-primary">
            {t('not_found.eyebrow')}
          </span>
          <h1 className="select-none font-serif text-9xl leading-none tracking-tighter opacity-10 md:text-[12rem]">
            404
          </h1>
        </div>

        <div className="mx-auto max-w-md space-y-6">
          <h2 className="text-2xl font-serif font-light md:text-3xl">
            {t('not_found.title')}
          </h2>
          <p className="font-serif text-sm italic leading-relaxed text-muted-foreground">
            {t('not_found.description')}
          </p>
        </div>

        <div className="pt-8">
          <Link
            href="/"
            className="group inline-flex items-center gap-3 bg-foreground px-8 py-4 text-xs font-bold uppercase tracking-[0.2em] text-background transition-all hover:bg-foreground/90"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            <span>{t('not_found.back_home')}</span>
          </Link>
        </div>
      </motion.div>

      <div className="absolute bottom-8 left-0 right-0 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/30">
          {t('not_found.footer')}
        </p>
      </div>
    </div>
  )
}
