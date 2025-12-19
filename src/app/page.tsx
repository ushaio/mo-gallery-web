'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default function Home() {
  const featuredImages = [
    { id: 1, title: '城市光影', category: '建筑', url: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=800&q=80' },
    { id: 2, title: '林间清晨', category: '自然', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=800&q=80' },
    { id: 3, title: '街头瞬间', category: '人文', url: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=800&q=80' },
  ]

  return (
    <div className="flex flex-col items-center">
      {/* Hero Section */}
      <section className="relative w-full h-[80vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=2000&q=80" 
            alt="Hero" 
            className="w-full h-full object-cover brightness-50"
          />
        </div>
        
        <div className="relative z-10 text-center px-4">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-5xl md:text-7xl font-bold text-white tracking-tighter mb-6"
          >
            捕获瞬间的永恒
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto mb-8"
          >
            在这里，每一张照片都是一个故事。探索自然、城市与人文交织的世界。
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <Link 
              href="/gallery" 
              className="inline-flex items-center px-8 py-3 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition-colors group"
            >
              浏览相册
              <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Featured Works */}
      <section className="max-w-7xl w-full px-4 py-24 sm:px-6 lg:px-8">
        <div className="flex justify-between items-end mb-12">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">精选作品</h2>
            <p className="text-muted-foreground mt-2">每一张都是精心挑选的瞬间</p>
          </div>
          <Link href="/gallery" className="text-sm font-medium hover:underline flex items-center">
            查看全部 <ArrowRight className="ml-1 w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {featuredImages.map((image, index) => (
            <motion.div
              key={image.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="group relative cursor-pointer"
            >
              <div className="aspect-[4/5] overflow-hidden rounded-lg bg-muted">
                <img 
                  src={image.url} 
                  alt={image.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              <div className="mt-4">
                <h3 className="text-lg font-semibold">{image.title}</h3>
                <p className="text-sm text-muted-foreground">{image.category}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Call to action */}
      <section className="w-full bg-muted/30 py-24">
        <div className="max-w-3xl mx-auto text-center px-4">
          <h2 className="text-3xl font-bold mb-6">关于 MO GALLERY</h2>
          <p className="text-muted-foreground mb-10 leading-relaxed">
            MO GALLERY 是一个致力于展示高质量摄影作品的平台。我们相信影像的力量，
            它能够跨越语言与文化的障碍，触动人心。
          </p>
          <Link 
            href="/about" 
            className="text-sm font-semibold border-b-2 border-primary pb-1 hover:text-muted-foreground hover:border-muted-foreground transition-colors"
          >
            了解更多关于我的故事
          </Link>
        </div>
      </section>
    </div>
  )
}