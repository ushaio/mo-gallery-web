'use client'

import { motion } from 'framer-motion'
import { Search, Circle, CircleOff } from 'lucide-react'
import { ViewModeToggle, ViewMode } from './ViewModeToggle'

export type GalleryView = 'photos' | 'albums'

interface GalleryHeaderProps {
  activeCategory: string
  categories: string[]
  onCategoryChange: (category: string) => void
  photoCount: number
  albumCount?: number
  view: GalleryView
  onViewChange: (view: GalleryView) => void
  t: (key: string) => string
}

export function GalleryHeader({
  activeCategory,
  categories,
  onCategoryChange,
  photoCount,
  albumCount,
  view,
  onViewChange,
  t,
}: GalleryHeaderProps) {
  return (
    <header className="mb-12 md:mb-16">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="space-y-3">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3"
            >
              <div className="h-px w-6 bg-primary/60" />
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary/80">
                {t('gallery.collection_label')}
              </span>
            </motion.div>
            <motion.h1
              key={view === 'albums' ? 'albums' : activeCategory}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl font-serif font-light tracking-tight md:text-5xl lg:text-6xl"
            >
              {view === 'albums'
                ? t('gallery.albums')
                : activeCategory === 'all'
                  ? t('gallery.title')
                  : activeCategory}
            </motion.h1>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-4"
          >
            <span className="hidden font-serif text-xs italic text-muted-foreground/60 md:block">
              {t('gallery.visual_moments')}
            </span>
            <div className="hidden h-4 w-px bg-border/50 md:block" />
            <div className="text-xs font-mono tracking-wider text-muted-foreground">
              {view === 'albums'
                ? `${albumCount ?? 0} ${t('gallery.album_count_suffix')}`
                : `${photoCount} ${t('gallery.count_suffix')}`}
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="border-t border-border/30 pt-4"
        >
          <div role="tablist" aria-label={t('gallery.gallery_view_aria')} className="mb-4 flex gap-0">
            {(['photos', 'albums'] as const).map((nextView) => (
              <button
                key={nextView}
                role="tab"
                aria-selected={view === nextView}
                onClick={() => onViewChange(nextView)}
                className={`relative rounded-sm px-4 py-2 text-xs font-medium uppercase tracking-wider transition-all ${
                  view === nextView
                    ? 'bg-primary/8 text-primary'
                    : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                }`}
              >
                {nextView === 'photos'
                  ? t('gallery.photos_tab')
                  : t('gallery.albums_tab')}
                {view === nextView ? (
                  <motion.div
                    layoutId="activeViewTab"
                    className="absolute bottom-0 left-0 right-0 h-px bg-primary"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                ) : null}
              </button>
            ))}
          </div>

          {view === 'photos' || view === 'film' ? (
            <div className="mask-gradient-x scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 md:mx-0 md:flex-wrap md:gap-1 md:px-0 md:pb-0 md:mask-none">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => onCategoryChange(category)}
                  className={`relative flex-shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-all ${
                    activeCategory === category
                      ? 'bg-primary/8 text-primary'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }`}
                >
                  {category === 'all' ? t('gallery.all') : category}
                  {activeCategory === category ? (
                    <motion.div
                      layoutId="activeCategory"
                      className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary"
                    />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
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
  view?: GalleryView
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
  view,
  t,
}: GalleryToolbarProps) {
  return (
    <div className="sticky top-0 z-30 border-b border-border/30 bg-background/95 backdrop-blur-sm transition-all duration-300">
      <div className="px-4 md:px-8 lg:px-12">
        <div className="mx-auto flex h-12 max-w-screen-2xl items-center justify-between gap-2 sm:gap-4 md:h-14">
          <div className="max-w-[140px] min-w-0 flex-1 transition-all duration-300 ease-in-out focus-within:max-w-full sm:max-w-xs sm:focus-within:max-w-xs">
            <div className="group relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50 transition-colors group-focus-within:text-primary" />
              <input
                type="text"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={t('common.search')}
                className="h-8 w-full rounded-full border border-transparent bg-muted/30 pl-8 pr-3 text-xs font-mono transition-all placeholder:text-muted-foreground/40 focus:border-border focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {view !== 'film' ? (
              <button
                onClick={() => onImmersiveChange(!immersive)}
                className={`px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider ${
                  immersive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-label={t('gallery.immersive')}
                aria-pressed={immersive}
              >
                {t('gallery.immersive')}
              </button>
            ) : null}

            <button
              onClick={() => onGrayscaleChange(!grayscale)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider ${
                grayscale ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-label={t('gallery.black_white_mode')}
              aria-pressed={grayscale}
            >
              {grayscale ? <Circle className="size-2.5" /> : <CircleOff className="size-2.5" />}
              <span className="hidden sm:inline">{t('gallery.black_white_short')}</span>
            </button>

            {view !== 'film' ? (
              <>
                <div className="mx-1 h-4 w-px bg-border/50" />

                <ViewModeToggle
                  viewMode={viewMode}
                  onViewModeChange={onViewModeChange}
                  t={t}
                />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
