'use client'

import { Grid3X3, LayoutGrid, Clock } from 'lucide-react'

// 视图模式类型：网格、瀑布流、时间线
export type ViewMode = 'grid' | 'masonry' | 'timeline'

interface ViewModeToggleProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  t: (key: string) => string
}

// 视图模式配置项
const viewModes: { mode: ViewMode; icon: typeof Grid3X3; labelKey: string }[] = [
  { mode: 'grid', icon: Grid3X3, labelKey: 'gallery.view_grid' },
  { mode: 'masonry', icon: LayoutGrid, labelKey: 'gallery.view_masonry' },
  { mode: 'timeline', icon: Clock, labelKey: 'gallery.view_timeline' },
]

// 视图模式切换组件 - 单选按钮组样式
export function ViewModeToggle({ viewMode, onViewModeChange, t }: ViewModeToggleProps) {
  return (
    <div className="flex items-center border border-border p-0.5" role="radiogroup" aria-label="View mode">
      {viewModes.map(({ mode, icon: Icon, labelKey }) => (
        <button
          key={mode}
          onClick={() => onViewModeChange(mode)}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${
            viewMode === mode
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          role="radio"
          aria-checked={viewMode === mode}
          aria-label={t(labelKey)}
        >
          <Icon className="size-3.5" />
          <span className="hidden sm:inline">{t(labelKey)}</span>
        </button>
      ))}
    </div>
  )
}
