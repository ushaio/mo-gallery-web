'use client'

import { motion } from 'framer-motion'
import { Search, Circle, CircleOff } from 'lucide-react'
import { ViewModeToggle, ViewMode } from './ViewModeToggle'
import { SiteInput } from '@/components/ui/SiteFormControls'

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
        {/* Title Section */}
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

        {/* Category Filter */}
        <motion.nav
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="border-t border-border/30 pt-4"
        >
          <div className="flex flex-wrap gap-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => onCategoryChange(cat)}
                className={`relative px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-all ${
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
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border/30 transition-all">
      <div className="px-4 md:px-8 lg:px-12">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-3 h-12">
          {/* Search Bar */}
          <div className="flex-1 min-w-0 max-w-[140px] sm:max-w-xs">
            <div className="relative group">
              <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60 group-focus-within:text-primary transition-colors" />
              <SiteInput
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={t('common.search')}
              />
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1">
            {/* Immersive Toggle */}
            <button
              onClick={() => onImmersiveChange(!immersive)}
              className={`px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-all ${
                immersive
                  ? 'text-primary bg-primary/8'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              title={t('gallery.immersive') || '沉浸模式'}
            >
              {t('gallery.immersive') || '沉浸'}
            </button>

            {/* Grayscale Toggle */}
            <button
              onClick={() => onGrayscaleChange(!grayscale)}
              className={`px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                grayscale
                  ? 'text-primary bg-primary/8'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {grayscale ? <Circle className="w-2.5 h-2.5" /> : <CircleOff className="w-2.5 h-2.5" />}
              <span className="hidden sm:inline">B&W</span>
            </button>

            <div className="w-px h-4 bg-border/30 mx-1" />

            {/* View Mode Toggle */}
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
