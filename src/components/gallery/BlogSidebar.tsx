'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { BookText, Calendar, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { getBlogs, type BlogDto } from '@/lib/api'

// 博客侧边栏组件 - 展示最新的博客文章
interface BlogSidebarProps {
  t: (key: string) => string
}

export function BlogSidebar({ t }: BlogSidebarProps) {
  const [blogs, setBlogs] = useState<BlogDto[]>([])
  const [loading, setLoading] = useState(true)

  // 获取最新 3 篇博客
  useEffect(() => {
    async function fetchBlogs() {
      try {
        const data = await getBlogs(3) // 获取最新 3 篇博客
        setBlogs(data)
      } catch (error) {
        console.error('Failed to fetch blogs:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchBlogs()
  }, [])

  if (loading) {
    return (
      <aside className="w-full lg:w-80 shrink-0">
        <div className="sticky top-24 space-y-6">
          <div className="border border-border p-6 bg-card/50">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-muted rounded w-1/2"></div>
              <div className="h-3 bg-muted rounded"></div>
              <div className="h-3 bg-muted rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside className="w-full lg:w-80 shrink-0">
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
        className="sticky top-24 space-y-6"
      >
        {/* 博客列表区域 */}
        <div className="border border-border bg-card/50">
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3 mb-2">
              <BookText className="w-5 h-5 text-primary" />
              <h3 className="font-serif text-xl uppercase tracking-tight">
                博客
              </h3>
            </div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
              最新文章
            </p>
          </div>

          <div className="divide-y divide-border">
            {blogs.length === 0 ? (
              <div className="p-6 text-center">
                <BookText className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs text-muted-foreground">暂无博客文章</p>
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
                    className="block p-6 hover:bg-muted/20 transition-colors group"
                  >
                    <div className="space-y-2">
                      <h4 className="font-serif text-base leading-tight group-hover:text-primary transition-colors line-clamp-2">
                        {blog.title}
                      </h4>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-widest">
                        <Calendar className="w-3 h-3" />
                        {new Date(blog.updatedAt).toLocaleDateString('zh-CN', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {blog.content}
                      </p>
                      <div className="flex items-center gap-1 text-[10px] text-primary font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                        阅读更多
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))
            )}
          </div>

          {blogs.length > 0 && (
            <div className="p-4 border-t border-border">
              <Link
                href="/blog"
                className="block text-center py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
              >
                查看全部博客 →
              </Link>
            </div>
          )}
        </div>
      </motion.div>
    </aside>
  )
}
