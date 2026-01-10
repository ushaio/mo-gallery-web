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
    <header className="mb-20">
      <div className="flex flex-col gap-12">
        {/* Title Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-4"
            >
              <div className="h-px w-8 bg-primary" />
              <span className="text-label-sm font-bold uppercase tracking-[0.4em] text-primary">
                Collection
              </span>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-5xl md:text-7xl lg:text-8xl font-serif font-light tracking-tighter leading-[0.9]"
            >
              {activeCategory === 'all' ? t('gallery.title') : activeCategory}
            </motion.h1>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-start md:items-end gap-2"
          >
             <p className="text-body-sm text-muted-foreground font-serif italic max-w-xs text-right hidden md:block">
              Curated visual moments and captured memories.
            </p>
            <div className="text-label-sm font-mono text-muted-foreground uppercase tracking-widest">
              {photoCount} {t('gallery.count_suffix')}
            </div>
          </motion.div>
        </div>

        {/* Category Filter - Minimalist Text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="border-t border-border/50 pt-6"
        >
          <div className="flex flex-wrap gap-6 md:gap-8">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => onCategoryChange(cat)}
                className={`relative py-2 text-label font-bold uppercase tracking-[0.2em] transition-colors group ${
                  activeCategory === cat
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {cat === 'all' ? t('gallery.all') : cat}
                {/* Active Indicator */}
                {activeCategory === cat && (
                  <motion.div
                    layoutId="activeCategory"
                    className="absolute bottom-0 left-0 w-full h-px bg-primary"
                  />
                )}
                {/* Hover Indicator */}
                <div className="absolute bottom-0 left-0 w-0 h-px bg-foreground/30 transition-all group-hover:w-full" />
              </button>
            ))}
          </div>
        </motion.div>
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
    <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/50 transition-all">
      <div className="px-4 md:px-8 lg:px-12">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-2 sm:gap-4 h-14 sm:h-16">
          {/* Search Bar - Minimal */}
          <div className="flex-1 min-w-0 max-w-[120px] sm:max-w-sm">
             <div className="relative group">
               <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
               <SiteInput
                 value={search}
                 onChange={(e) => onSearchChange(e.target.value)}
                 placeholder={t('common.search')}
               />
             </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 sm:gap-6 overflow-x-auto">
            {/* Immersive Toggle */}
            <button
              onClick={() => onImmersiveChange(!immersive)}
              className={`flex-shrink-0 flex items-center gap-1 sm:gap-2 text-label-sm font-bold uppercase tracking-widest transition-colors ${
                immersive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              title={t('gallery.immersive') || '沉浸模式'}
            >
              <span>{t('gallery.immersive') || '沉浸'}</span>
            </button>

            <div className="w-px h-4 bg-border flex-shrink-0" />

            {/* Grayscale Toggle */}
            <button
              onClick={() => onGrayscaleChange(!grayscale)}
              className={`flex-shrink-0 flex items-center gap-1 sm:gap-2 text-label-sm font-bold uppercase tracking-widest transition-colors ${
                grayscale ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {grayscale ? <Circle className="w-3 h-3" /> : <CircleOff className="w-3 h-3" />}
              <span className="hidden sm:inline">B&W</span>
            </button>

            <div className="w-px h-4 bg-border flex-shrink-0" />

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
