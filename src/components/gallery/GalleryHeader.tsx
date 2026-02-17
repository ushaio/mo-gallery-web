'use client'

import { motion } from 'framer-motion'
import { Search, Circle, CircleOff, Maximize2, Minimize2 } from 'lucide-react'
import { ViewModeToggle, ViewMode } from './ViewModeToggle'

// 画廊页面头部组件 - 包含标题、分类筛选和照片计数
interface GalleryHeaderProps {
  activeCategory: string
  categories: string[]
  onCategoryChange: (category: string) => void
  photoCount: number
  t: (key: string) => string
}

export function GalleryHeader({
  activeCategory,
  categories,
  onCategoryChange,
  photoCount,
  t,
}: GalleryHeaderProps) {
  return (
    <header className="mb-12 md:mb-16">
      <div className="flex flex-col gap-8">
        {/* 标题区域 */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-3">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3"
            >
              <div className="h-px w-6 bg-primary/60" />
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary/80">
                Collection
              </span>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-5xl lg:text-6xl font-serif font-light tracking-tight"
            >
              {activeCategory === 'all' ? t('gallery.title') : activeCategory}
            </motion.h1>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-4"
          >
            <span className="text-xs text-muted-foreground/60 font-serif italic hidden md:block">
              Visual moments
            </span>
            <div className="h-4 w-px bg-border/50 hidden md:block" />
            <div className="text-xs font-mono text-muted-foreground tracking-wider">
              {photoCount} {t('gallery.count_suffix')}
            </div>
          </motion.div>
        </div>

        {/* 分类筛选导航 */}
        <motion.nav
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="border-t border-border/30 pt-4"
        >
          {/* 移动端横向滚动，桌面端自动换行 */}
          <div className="flex md:flex-wrap gap-2 md:gap-1 overflow-x-auto pb-2 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide mask-gradient-x md:mask-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => onCategoryChange(cat)}
                className={`relative px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-all whitespace-nowrap flex-shrink-0 ${
                  activeCategory === cat
                    ? 'text-primary bg-primary/8'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {cat === 'all' ? t('gallery.all') : cat}
                {activeCategory === cat && (
                  <motion.div
                    layoutId="activeCategory"
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary"
                  />
                )}
              </button>
            ))}
          </div>
        </motion.nav>
      </div>
    </header>
  )
}

// 画廊工具栏组件 - 搜索、显示选项和视图模式切换
interface GalleryToolbarProps {
  search: string
  onSearchChange: (search: string) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  grayscale: boolean
  onGrayscaleChange: (grayscale: boolean) => void
  immersive: boolean
  onImmersiveChange: (immersive: boolean) => void
  t: (key: string) => string
}

export function GalleryToolbar({
  search,
  onSearchChange,
  viewMode,
  onViewModeChange,
  grayscale,
  onGrayscaleChange,
  immersive,
  onImmersiveChange,
  t,
}: GalleryToolbarProps) {
  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border/30 transition-all duration-300">
      <div className="px-4 md:px-8 lg:px-12">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-2 sm:gap-4 h-12 md:h-14">
          {/* 搜索栏 - 移动端自适应宽度 */}
          <div className="flex-1 min-w-0 max-w-[140px] sm:max-w-xs transition-all duration-300 ease-in-out focus-within:max-w-full sm:focus-within:max-w-xs">
            <div className="relative group">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={t('common.search')}
                className="w-full h-8 pl-8 pr-3 bg-muted/30 border-transparent focus:bg-background border focus:border-border rounded-full text-xs font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          {/* 显示控制项 */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* 沉浸模式 / 黑白模式 */}
            <button
              onClick={() => onImmersiveChange(!immersive)}
              className={`px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider ${
                immersive
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-label={t('gallery.immersive') || '沉浸模式'}
              aria-pressed={immersive}
            >
              {t('gallery.immersive') || '沉浸'}
            </button>

            <button
              onClick={() => onGrayscaleChange(!grayscale)}
              className={`px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider flex items-center gap-1.5 ${
                grayscale
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-label="Black & White mode"
              aria-pressed={grayscale}
            >
              {grayscale ? <Circle className="size-2.5" /> : <CircleOff className="size-2.5" />}
              <span className="hidden sm:inline">B&W</span>
            </button>

            <div className="w-px h-4 bg-border/50 mx-1" />

            {/* 视图模式切换 */}
            <ViewModeToggle
              viewMode={viewMode}
              onViewModeChange={onViewModeChange}
              t={t}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
