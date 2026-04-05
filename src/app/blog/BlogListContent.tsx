'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, BookText, Calendar, Clock, Tag } from 'lucide-react'
import Link from 'next/link'
import type { BlogListItemDto } from '@/lib/api/types'
import { useLanguage } from '@/contexts/LanguageContext'

const ALL_CATEGORY_KEY = 'all'

interface BlogListContentProps {
  initialBlogs: BlogListItemDto[]
  initialCategories: string[]
}

export function BlogListContent({ initialBlogs, initialCategories }: BlogListContentProps) {
  const { t, locale } = useLanguage()
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY_KEY)

  const categories = useMemo(
    () => [ALL_CATEGORY_KEY, ...initialCategories],
    [initialCategories],
  )

  const filteredBlogs = useMemo(() => {
    if (activeCategory === ALL_CATEGORY_KEY) return initialBlogs
    return initialBlogs.filter((blog) => blog.category === activeCategory)
  }, [activeCategory, initialBlogs])

  const timelineData = useMemo(() => {
    const grouped: Record<string, Record<string, BlogListItemDto[]>> = {}

    filteredBlogs.forEach((blog) => {
      const date = new Date(blog.createdAt)
      const year = String(date.getFullYear())
      const month = String(date.getMonth() + 1).padStart(2, '0')

      if (!grouped[year]) grouped[year] = {}
      if (!grouped[year][month]) grouped[year][month] = []
      grouped[year][month].push(blog)
    })

    return grouped
  }, [filteredBlogs])

  return (
    <div className="min-h-screen bg-background pt-24 pb-16 text-foreground">
      <div className="px-4 md:px-8 lg:px-12">
        <div className="mx-auto max-w-screen-2xl">
          <header className="mb-6 md:mb-8">
            <div className="flex flex-col gap-6 md:gap-8">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end md:gap-8">
                <div className="space-y-3 md:space-y-4">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 text-primary"
                  >
                    <span className="text-label-sm font-black uppercase tracking-[0.4em]">{t('blog.title')}</span>
                    <div className="h-[1px] w-12 bg-primary/30" />
                  </motion.div>
                  <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-4xl font-serif font-light leading-none tracking-tighter md:text-5xl lg:text-7xl"
                  >
                    {activeCategory === ALL_CATEGORY_KEY ? t('nav.logs') : activeCategory}
                  </motion.h1>
                </div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-label-sm font-mono uppercase tracking-widest text-muted-foreground"
                >
                  {filteredBlogs.length} {t('blog.count_suffix')}
                </motion.div>
              </div>

              {categories.length > 1 ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="-mx-4 overflow-x-auto px-4 scrollbar-hide md:mx-0 md:px-0"
                >
                  <div className="flex gap-2 pb-2 md:flex-wrap md:justify-start md:pb-0">
                    {categories.map((category) => (
                      <button
                        key={category}
                        onClick={() => setActiveCategory(category)}
                        className={`shrink-0 whitespace-nowrap border px-3 py-1.5 text-label font-bold uppercase tracking-widest transition-all md:px-4 ${
                          activeCategory === category
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
                        }`}
                      >
                        {category === ALL_CATEGORY_KEY ? t('gallery.all') : category}
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </div>
          </header>
        </div>
      </div>

      <div className="px-4 md:px-8 lg:px-12">
        <div className="mx-auto max-w-screen-2xl">
          {filteredBlogs.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="border border-dashed border-border py-20 text-center"
            >
              <BookText className="mx-auto mb-4 h-16 w-16 opacity-20" />
              <p className="text-muted-foreground">{t('blog.empty')}</p>
            </motion.div>
          ) : (
            <div className="space-y-16">
              {Object.keys(timelineData)
                .toSorted((left, right) => parseInt(right, 10) - parseInt(left, 10))
                .map((year, yearIndex) => (
                  <motion.div
                    key={year}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + yearIndex * 0.1 }}
                  >
                    <div className="mb-8 flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-primary" />
                        <h2 className="text-3xl font-serif font-light tracking-tight">{year}</h2>
                      </div>
                      <div className="h-[1px] flex-1 bg-border" />
                    </div>

                    <div className="space-y-12">
                      {Object.keys(timelineData[year])
                        .toSorted((left, right) => parseInt(right, 10) - parseInt(left, 10))
                        .map((month) => (
                          <div key={`${year}-${month}`} className="relative">
                            <div className="mb-6 flex items-center gap-4">
                              <div className="text-label font-mono uppercase tracking-widest text-muted-foreground">
                                {new Date(`${year}-${month}-01`).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
                                  month: 'long',
                                })}
                              </div>
                              <div className="h-[1px] flex-1 bg-border/50" />
                            </div>

                            <div className="space-y-4 border-l-2 border-border pl-6 md:space-y-6 md:pl-8" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 300px' }}>
                              {timelineData[year][month].map((blog, index) => (
                                <motion.article
                                  key={blog.id}
                                  initial={{ opacity: 0, x: -20 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: index * 0.05 }}
                                  className="group relative"
                                >
                                  <div className="absolute top-2 -left-[27px] h-2 w-2 rounded-full bg-border transition-colors group-hover:bg-primary md:-left-[33px]" />

                                  <Link
                                    href={`/blog/${blog.id}`}
                                    className="-ml-6 block space-y-2 border border-transparent p-4 transition-all hover:border-border hover:bg-card/30 md:-ml-8 md:space-y-3 md:p-6"
                                  >
                                    <h3 className="text-xl font-serif font-light leading-tight transition-colors group-hover:text-primary md:text-2xl">
                                      {blog.title}
                                    </h3>

                                    <div className="flex flex-wrap items-center gap-3 text-label-sm uppercase tracking-widest text-muted-foreground md:gap-4">
                                      <div className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        {new Date(blog.createdAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
                                          month: 'long',
                                          day: 'numeric',
                                        })}
                                      </div>
                                      {blog.category && blog.category !== t('blog.uncategorized') ? (
                                        <div className="flex items-center gap-1">
                                          <Tag className="h-3 w-3" />
                                          {blog.category}
                                        </div>
                                      ) : null}
                                    </div>

                                    <p className="line-clamp-2 text-body-sm leading-relaxed text-muted-foreground md:text-body">
                                      {blog.previewText}...
                                    </p>

                                    <div className="flex items-center gap-2 text-label-sm font-bold uppercase tracking-widest text-primary opacity-0 transition-opacity group-hover:opacity-100">
                                      {t('blog.read_more')}
                                      <ArrowRight className="h-3 w-3" />
                                    </div>
                                  </Link>
                                </motion.article>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  </motion.div>
                ))}
            </div>
          )}

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-16 text-center"
          >
            <Link
              href="/gallery"
              className="inline-block border border-border px-8 py-3 text-label font-bold uppercase tracking-widest transition-all hover:border-primary hover:text-primary"
            >
              {t('blog.back_to_gallery')}
            </Link>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
