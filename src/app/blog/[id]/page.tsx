'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Calendar, ArrowLeft, BookText } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { getBlog, type BlogDto } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'

// Dynamically import MilkdownViewer to avoid SSR issues
const MilkdownViewer = dynamic(
  () => import('@/components/MilkdownViewer'),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse space-y-4">
        <div className="h-4 bg-muted rounded w-full"></div>
        <div className="h-4 bg-muted rounded w-5/6"></div>
        <div className="h-4 bg-muted rounded w-4/6"></div>
      </div>
    )
  }
)

export default function BlogDetailPage() {
  const params = useParams()
  const id = params.id as string
  const { t, locale } = useLanguage()
  const [blog, setBlog] = useState<BlogDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchBlog() {
      try {
        const data = await getBlog(id)
        setBlog(data)
      } catch (err) {
        console.error('Failed to fetch blog:', err)
        setError(t('blog.not_found'))
      } finally {
        setLoading(false)
      }
    }
    if (id) {
      fetchBlog()
    }
  }, [id, t])

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground pt-24 pb-16 px-4 md:px-8 lg:px-12">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-8">
            <div className="h-12 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/4"></div>
            <div className="space-y-4 mt-12">
              <div className="h-4 bg-muted rounded"></div>
              <div className="h-4 bg-muted rounded"></div>
              <div className="h-4 bg-muted rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !blog) {
    return (
      <div className="min-h-screen bg-background text-foreground pt-24 pb-16 px-4 md:px-8 lg:px-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-20">
            <BookText className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-muted-foreground mb-8">{error || t('blog.not_found')}</p>
            <Link
              href="/blog"
              className="inline-block px-8 py-3 border border-border hover:border-primary hover:text-primary transition-all text-xs font-bold uppercase tracking-widest"
            >
              {t('story.back_to_list')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-16 px-4 md:px-8 lg:px-12">
      <div className="max-w-4xl mx-auto">
        {/* Back Button */}
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

        {/* Article Header */}
        <header className="mb-12 pb-8 border-b border-border">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 text-primary mb-4"
          >
            <BookText className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-[0.4em]">Blog</span>
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

        {/* Article Content */}
        <motion.article
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="milkdown-article"
        >
          <MilkdownViewer content={blog.content} />
        </motion.article>

        {/* Footer Navigation */}
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
