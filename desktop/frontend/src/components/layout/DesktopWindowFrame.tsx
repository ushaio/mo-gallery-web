import { useEffect, useState, type ReactNode } from 'react'
import { Maximize2, Minimize2, Minus, X } from 'lucide-react'
import {
  Quit,
  WindowIsMaximised,
  WindowMinimise,
  WindowToggleMaximise,
} from '../../../wailsjs/runtime/runtime'
import { getWindowAppearance, type WindowStyle } from '@/lib/window-appearance'

function DesktopTitleBar() {
  const [isMaximised, setIsMaximised] = useState(false)
  const [isFocused, setIsFocused] = useState(true)

  const syncMaximisedState = () => {
    void WindowIsMaximised().then(setIsMaximised).catch(() => undefined)
  }

  useEffect(() => {
    syncMaximisedState()
    const handleFocus = () => setIsFocused(true)
    const handleBlur = () => setIsFocused(false)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  const toggleMaximise = () => {
    WindowToggleMaximise()
    window.setTimeout(syncMaximisedState, 80)
  }

  return (
    <header
      className={`desktop-title-bar window-drag-region relative z-10 flex h-10 shrink-0 select-none items-center border-b bg-card transition-colors ${isFocused ? '' : 'opacity-80'}`}
      style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
      onDoubleClick={toggleMaximise}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5 px-3">
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded text-[9px] font-bold"
          style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          M
        </span>
        <span className="truncate text-[11px] font-medium tracking-wide">MO Gallery Desktop</span>
      </div>
      <div className="window-no-drag flex h-full shrink-0" onDoubleClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={() => WindowMinimise()}
          className="flex h-full w-12 items-center justify-center transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          title="最小化"
          aria-label="最小化"
        >
          <Minus size={14} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          onClick={toggleMaximise}
          className="flex h-full w-12 items-center justify-center transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          title={isMaximised ? '还原窗口' : '最大化'}
          aria-label={isMaximised ? '还原窗口' : '最大化'}
        >
          {isMaximised ? <Minimize2 size={12} strokeWidth={1.8} /> : <Maximize2 size={12} strokeWidth={1.8} />}
        </button>
        <button
          type="button"
          onClick={() => Quit()}
          className="flex h-full w-12 items-center justify-center transition-colors hover:bg-destructive hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          title="关闭"
          aria-label="关闭"
        >
          <X size={15} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  )
}

export function DesktopWindowFrame({ children }: { children: ReactNode }) {
  const [activeStyle, setActiveStyle] = useState<WindowStyle | null>(null)

  useEffect(() => {
    let cancelled = false
    getWindowAppearance()
      .then((appearance) => {
        if (!cancelled) setActiveStyle(appearance.activeStyle)
      })
      .catch(() => {
        // Keep window controls available if a frameless window cannot read its startup style.
        if (!cancelled) setActiveStyle('integrated')
      })
    return () => { cancelled = true }
  }, [])

  return (
    <div className={`flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground${activeStyle === 'integrated' ? ' integrated-window-frame' : ''}`}>
      {activeStyle === 'integrated' && <DesktopTitleBar />}
      <div className="relative z-0 min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
