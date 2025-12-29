'use client'

import { Grid3X3, LayoutGrid, Clock } from 'lucide-react'

export type ViewMode = 'grid' | 'masonry' | 'timeline'

interface ViewModeToggleProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  t: (key: string) => string
}

const viewModes: { mode: ViewMode; icon: typeof Grid3X3; labelKey: string }[] = [
  { mode: 'grid', icon: Grid3X3, labelKey: 'gallery.view_grid' },
  { mode: 'masonry', icon: LayoutGrid, labelKey: 'gallery.view_masonry' },
  { mode: 'timeline', icon: Clock, labelKey: 'gallery.view_timeline' },
]

export function ViewModeToggle({ viewMode, onViewModeChange, t }: ViewModeToggleProps) {
  return (
    <div className="flex items-center gap-1 border border-border p-1">
      {viewModes.map(({ mode, icon: Icon, labelKey }) => (
        <button
          key={mode}
          onClick={() => onViewModeChange(mode)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all ${
            viewMode === mode
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title={t(labelKey)}
        >
          <Icon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t(labelKey)}</span>
        </button>
      ))}
    </div>
  )
}
