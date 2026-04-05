'use client'

import { motion } from 'framer-motion'
import { Calendar, ArrowLeft, BookText } from 'lucide-react'
import Link from 'next/link'
import type { BlogDto } from '@/lib/api/types'
import { useLanguage } from '@/contexts/LanguageContext'
import { StoryRichContent } from '@/components/StoryRichContent'

interface BlogDetailContentProps {
  blog: BlogDto
}

export function BlogDetailContent({ blog }: BlogDetailContentProps) {
  const { t, locale } = useLanguage()

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-16 px-4 md:px-8 lg:px-12">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-8"
        >
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('story.back_to_list')}
          </Link>
        </motion.div>

        <header className="mb-12 pb-8 border-b border-border">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 text-primary mb-4"
          >
            <BookText className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-[0.4em]">{t('blog.title')}</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-6xl font-serif font-light tracking-tighter leading-tight mb-6"
          >
            {blog.title}
          </motion.h1>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-widest"
          >
            <Calendar className="w-3 h-3" />
            {new Date(blog.createdAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </motion.div>
        </header>

        <motion.article
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <StoryRichContent content={blog.content} photos={[]} className="story-rich-content--article" />
        </motion.article>

        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-16 pt-8 border-t border-border flex flex-col sm:flex-row gap-4 justify-between"
        >
          <Link
            href="/blog"
            className="inline-block px-8 py-3 border border-border hover:border-primary hover:text-primary transition-all text-xs font-bold uppercase tracking-widest text-center"
          >
            {t('story.back_to_list')}
          </Link>
          <Link
            href="/gallery"
            className="inline-block px-8 py-3 border border-border hover:border-primary hover:text-primary transition-all text-xs font-bold uppercase tracking-widest text-center"
          >
            {t('blog.back_to_gallery')}
          </Link>
        </motion.footer>
      </div>
    </div>
  )
}
