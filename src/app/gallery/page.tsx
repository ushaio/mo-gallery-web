'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Star, Info, MessageSquare, Camera, Palette } from 'lucide-react'

const categories = ['全部', '自然', '城市', '建筑', '人文', '星空']

type PhotoComment = {
  user: string
  content: string
}

type Photo = {
  id: number
  title: string
  category: string
  url: string
  story?: string
  rating: number
  params?: Record<string, string>
  palette?: string[]
  comments?: PhotoComment[]
}

const photos: Photo[] = [
  { 
    id: 1, 
    title: '山间晨雾', 
    category: '自然', 
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
    story: '这张照片拍摄于川西四姑娘山的一个清晨。当第一缕阳光穿透云雾，远处的雪山若隐若现，空气中弥漫着泥土和冷杉的味道。',
    rating: 5,
    params: {
      camera: 'Sony A7R IV',
      lens: '24-70mm f/2.8 GM',
      iso: '100',
      shutter: '1/200s',
      aperture: 'f/8.0'
    },
    palette: ['#2F4F4F', '#8FBC8F', '#F5F5DC', '#708090'],
    comments: [
      { user: '摄影迷', content: '构图太棒了，光影处理得恰到好处！' },
      { user: '路人甲', content: '想知道具体的拍摄地点。' }
    ]
  },
  { 
    id: 2, 
    title: '霓虹街头', 
    category: '城市', 
    url: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1200&q=80',
    story: '雨后的东京街头，霓虹灯倒映在积水中，仿佛进入了一个赛博朋克的世界。',
    rating: 4,
    params: {
      camera: 'Fujifilm X-T4',
      lens: '35mm f/1.4',
      iso: '800',
      shutter: '1/60s',
      aperture: 'f/2.0'
    },
    palette: ['#FF00FF', '#00FFFF', '#000033', '#FFFFFF'],
    comments: [
      { user: 'CityWalker', content: '色彩饱和度很高，很有氛围感。' }
    ]
  },
  { 
    id: 3, 
    title: '现代几何', 
    category: '建筑', 
    url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80',
    story: '线条与阴影的交织，展现了现代建筑的力量与纯粹。',
    rating: 5,
    params: {
      camera: 'Canon EOS R5',
      lens: '15-35mm f/2.8L',
      iso: '100',
      shutter: '1/500s',
      aperture: 'f/11'
    },
    palette: ['#333333', '#CCCCCC', '#FFFFFF', '#1A1A1A'],
    comments: []
  },
  { id: 4, title: '深山老林', category: '自然', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=800&q=80', rating: 4, story: '大自然的氧吧', params: { camera: 'Sony A7R', iso: '100' }, palette: ['#2d5a27', '#ffffff'], comments: [] },
  { id: 5, title: '夕阳西下', category: '人文', url: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80', rating: 5, story: '岁月的宁静', params: { camera: 'Sony A7R', iso: '100' }, palette: ['#ff8c00', '#ffffff'], comments: [] },
  { id: 6, title: '银河璀璨', category: '星空', url: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?auto=format&fit=crop&w=800&q=80', rating: 5, story: '宇宙的奥秘', params: { camera: 'Sony A7R', iso: '1000' }, palette: ['#000080', '#ffffff'], comments: [] },
]

export default function Gallery() {
  const [selectedCategory, setSelectedCategory] = useState('全部')
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null)

  const filteredPhotos = selectedCategory === '全部' 
    ? photos 
    : photos.filter(p => p.category === selectedCategory)

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold tracking-tight mb-4 text-foreground">相册展示</h1>
        <p className="text-muted-foreground">在这里发现不同主题下的美妙瞬间</p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap justify-center gap-4 mb-12">
        {categories.map(category => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
              selectedCategory === category
                ? 'bg-primary text-primary-foreground shadow-lg'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Grid */}
      <motion.div 
        layout
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        <AnimatePresence mode='popLayout'>
          {filteredPhotos.map(photo => (
            <motion.div
              key={photo.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileHover={{ y: -5 }}
              transition={{ duration: 0.3 }}
              className="group relative overflow-hidden rounded-xl bg-muted aspect-square cursor-zoom-in"
              onClick={() => setSelectedPhoto(photo)}
            >
              <img 
                src={photo.url} 
                alt={photo.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                <p className="text-white/70 text-xs mb-1">{photo.category}</p>
                <h3 className="text-white font-semibold text-lg">{photo.title}</h3>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedPhoto && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 lg:p-12">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPhoto(null)}
              className="absolute inset-0 bg-background/95 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-6xl h-full max-h-[90vh] bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col lg:flex-row border border-border"
            >
              {/* Close Button */}
              <button 
                onClick={() => setSelectedPhoto(null)}
                className="absolute top-4 right-4 z-10 p-2 bg-background/50 backdrop-blur-md rounded-full hover:bg-background transition-colors border border-border"
              >
                <X className="w-6 h-6" />
              </button>

              {/* Left Side: Image */}
              <div className="w-full lg:w-3/5 h-[40vh] lg:h-full bg-black flex items-center justify-center">
                <img 
                  src={selectedPhoto.url} 
                  alt={selectedPhoto.title}
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Right Side: Info */}
              <div className="w-full lg:w-2/5 h-full overflow-y-auto p-8 lg:p-10 bg-card">
                <div className="space-y-8">
                  {/* Title & Category */}
                  <div>
                    <span className="inline-block px-3 py-1 bg-muted rounded-full text-xs font-semibold text-muted-foreground mb-3">
                      {selectedPhoto.category}
                    </span>
                    <h2 className="text-3xl font-bold tracking-tight">{selectedPhoto.title}</h2>
                    <div className="flex items-center mt-3 space-x-1">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-4 h-4 ${i < selectedPhoto.rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted'}`} />
                      ))}
                      <span className="ml-2 text-sm text-muted-foreground">({selectedPhoto.rating}.0)</span>
                    </div>
                  </div>

                  {/* Story */}
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2 text-foreground font-semibold">
                      <Info className="w-4 h-4" />
                      <span>照片故事</span>
                    </div>
                    <p className="text-muted-foreground text-sm leading-relaxed italic">
                      &quot;{selectedPhoto.story || '未填写照片背后的故事...'}&quot;
                    </p>
                  </div>

                  {/* Shooting Parameters */}
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2 text-foreground font-semibold">
                      <Camera className="w-4 h-4" />
                      <span>拍摄参数</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedPhoto.params && Object.entries(selectedPhoto.params).map(([key, value]) => (
                        <div key={key} className="bg-muted/50 p-3 rounded-lg">
                          <p className="text-[10px] uppercase text-muted-foreground font-bold mb-1">{key}</p>
                          <p className="text-sm font-medium">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Color Palette */}
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2 text-foreground font-semibold">
                      <Palette className="w-4 h-4" />
                      <span>色卡盘</span>
                    </div>
                    <div className="flex space-x-2">
                      {selectedPhoto.palette?.map((color: string, i: number) => (
                        <div key={i} className="flex flex-col items-center">
                          <div 
                            className="w-12 h-12 rounded-lg shadow-inner border border-white/10" 
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-[9px] mt-1 font-mono text-muted-foreground uppercase">{color}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Comments */}
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2 text-foreground font-semibold">
                      <MessageSquare className="w-4 h-4" />
                      <span>评论 ({selectedPhoto.comments?.length || 0})</span>
                    </div>
                    <div className="space-y-3">
                      {selectedPhoto.comments?.length > 0 ? (
                        selectedPhoto.comments.map((comment, i) => (
                          <div key={i} className="bg-muted/30 p-4 rounded-xl border border-border/50">
                            <p className="text-xs font-bold mb-1">{comment.user}</p>
                            <p className="text-sm text-muted-foreground">{comment.content}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground italic">暂无评论</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
