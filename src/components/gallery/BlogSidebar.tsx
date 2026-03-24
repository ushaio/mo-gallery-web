'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, BookText, Calendar } from 'lucide-react'
import Link from 'next/link'
import { getBlogs } from '@/lib/api/blogs'
import type { BlogDto } from '@/lib/api/types'
import { useLanguage } from '@/contexts/LanguageContext'

export function BlogSidebar() {
  const { t, locale } = useLanguage()
  const [blogs, setBlogs] = useState<BlogDto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchBlogs() {
      try {
        const data = await getBlogs(3)
        setBlogs(data)
      } catch (error) {
        console.error('Failed to fetch blogs:', error)
      } finally {
        setLoading(false)
      }
    }

    void fetchBlogs()
  }, [])

  if (loading) {
    return (
      <aside className="w-full shrink-0 lg:w-80">
        <div className="sticky top-24 space-y-6">
          <div className="border border-border bg-card/50 p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-4 w-1/2 rounded bg-muted" />
              <div className="h-3 rounded bg-muted" />
              <div className="h-3 w-5/6 rounded bg-muted" />
            </div>
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside className="w-full shrink-0 lg:w-80">
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
        className="sticky top-24 space-y-6"
      >
        <div className="border border-border bg-card/50">
          <div className="border-b border-border p-6">
            <div className="mb-2 flex items-center gap-3">
              <BookText className="h-5 w-5 text-primary" />
              <h3 className="font-serif text-xl uppercase tracking-tight">{t('blog.title')}</h3>
            </div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t('blog.latest')}</p>
          </div>

          <div className="divide-y divide-border">
            {blogs.length === 0 ? (
              <div className="p-6 text-center">
                <BookText className="mx-auto mb-2 h-8 w-8 opacity-20" />
                <p className="text-xs text-muted-foreground">{t('blog.empty')}</p>
              </div>
            ) : (
              blogs.map((blog, index) => (
                <motion.div
                  key={blog.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + index * 0.1 }}
                >
                  <Link
                    href={`/blog/${blog.id}`}
                    className="group block p-6 transition-colors hover:bg-muted/20"
                  >
                    <div className="space-y-2">
                      <h4 className="line-clamp-2 font-serif text-base leading-tight transition-colors group-hover:text-primary">
                        {blog.title}
                      </h4>
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {new Date(blog.updatedAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{blog.content}</p>
                      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-primary opacity-0 transition-opacity group-hover:opacity-100">
                        {t('blog.read_more')}
                        <ArrowRight className="h-3 w-3" />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))
            )}
          </div>

          {blogs.length > 0 ? (
            <div className="border-t border-border p-4">
              <Link
                href="/blog"
                className="block py-2 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-primary"
              >
                {t('blog.view_all')}
              </Link>
            </div>
          ) : null}
        </div>
      </motion.div>
    </aside>
  )
}
