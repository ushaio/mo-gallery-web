'use client'

import { motion } from 'framer-motion'
import { Search, Circle, CircleOff } from 'lucide-react'
import { ViewModeToggle, ViewMode } from './ViewModeToggle'
import { CustomInput } from '@/components/ui/CustomInput'

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
    <header className="mb-6 md:mb-8">
      <div className="flex flex-col gap-6 md:gap-8">
        {/* Title Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-8">
          <div className="space-y-3 md:space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 text-primary"
            >
              <span className="text-[10px] font-black uppercase tracking-[0.4em]">Collection</span>
              <div className="h-[1px] w-12 bg-primary/30" />
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-5xl lg:text-7xl font-serif font-light tracking-tighter leading-none"
            >
              {activeCategory === '全部' ? t('gallery.title') : activeCategory}
            </motion.h1>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest"
          >
            {photoCount} {t('gallery.count_suffix')}
          </motion.div>
        </div>

        {/* Category Filter - Horizontal scroll on mobile */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="-mx-4 md:mx-0 px-4 md:px-0 overflow-x-auto scrollbar-hide"
        >
          <div className="flex gap-2 md:flex-wrap md:justify-start pb-2 md:pb-0">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => onCategoryChange(cat)}
                className={`px-3 md:px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all border whitespace-nowrap shrink-0 ${activeCategory === cat
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
                  }`}
              >
                {cat === '全部' ? t('gallery.all') : cat}
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
  t: (key: string) => string
}

export function GalleryToolbar({
  search,
  onSearchChange,
  viewMode,
  onViewModeChange,
  grayscale,
  onGrayscaleChange,
  t,
}: GalleryToolbarProps) {
  return (
    <div className="sticky top-16 z-30 bg-background px-4 md:px-8 lg:px-12">
      <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4 pt-4 pb-2">
        {/* Search Bar */}
        <div className="flex-1 max-w-md">
          <CustomInput
            variant="search"
            icon={Search}
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Grayscale Toggle */}
          <button
            onClick={() => onGrayscaleChange(!grayscale)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all border ${
              grayscale
                ? 'bg-foreground text-background border-foreground'
                : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
            }`}
            title={grayscale ? 'B&W On' : 'B&W Off'}
          >
            {grayscale ? (
              <Circle className="w-3 h-3" />
            ) : (
              <CircleOff className="w-3 h-3" />
            )}
            <span className="hidden sm:inline">B&W</span>
          </button>

          {/* View Mode Toggle */}
          <ViewModeToggle
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            t={t}
          />
        </div>
      </div>
    </div>
  )
}
