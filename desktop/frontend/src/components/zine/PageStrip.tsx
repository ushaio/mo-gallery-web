import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { BookMarked, ChevronDown, ChevronUp, Files, Images, Plus, Trash2 } from 'lucide-react'

import { t } from '@/lib/i18n'
import { getSpreadPageNumbers, getTotalPageCount, hasCoverSpread, isCoverSpread } from '@/lib/zine/print'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

import { PageThumb } from './PageThumb'
import { PhotoTray } from './PhotoTray'

const STRIP_MIN_WIDTH = 140
const STRIP_MAX_WIDTH = 320
const STRIP_DEFAULT_WIDTH = 176

function clampStripWidth(width: number) {
  return Math.min(STRIP_MAX_WIDTH, Math.max(STRIP_MIN_WIDTH, width))
}

interface RailActionProps {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}

function RailAction({ label, onClick, disabled, children }: RailActionProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className="flex h-5 w-5 items-center justify-center rounded bg-black/65 text-white transition hover:bg-black/85 disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function PageStrip() {
  const [activeView, setActiveView] = useState<'pages' | 'assets'>('pages')
  const { language } = usePreferences()
  const storedWidth = usePreferences((state) => state.zineStripWidth)
  const setStripWidth = usePreferences((state) => state.setZineStripWidth)
  const project = useZineStore((state) => state.project)
  const activeSpreadId = useZineStore((state) => state.activeSpreadId)
  const setActiveSpread = useZineStore((state) => state.setActiveSpread)
  const addSpread = useZineStore((state) => state.addSpread)
  const addCoverSpread = useZineStore((state) => state.addCoverSpread)
  const moveSpread = useZineStore((state) => state.moveSpread)
  const removeSpread = useZineStore((state) => state.removeSpread)
  const activeItemRef = useRef<HTMLDivElement | null>(null)
  // 拖动中用本地宽度，松手才写入持久化 store，避免拖动时高频写 localStorage
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const resizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const stripWidth = dragWidth ?? clampStripWidth(storedWidth)

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeSpreadId])

  useEffect(() => () => {
    document.body.style.cursor = ''
  }, [])

  function commitResize(event: React.PointerEvent) {
    const session = resizeRef.current
    if (!session || session.pointerId !== event.pointerId) return
    resizeRef.current = null
    document.body.style.cursor = ''
    setStripWidth(clampStripWidth(session.startWidth + event.clientX - session.startX))
    setDragWidth(null)
  }

  if (!project) return null

  const coverExists = hasCoverSpread(project)
  const contentCount = project.spreads.filter((spread) => !isCoverSpread(spread)).length
  const firstContentIndex = project.spreads.findIndex((spread) => !isCoverSpread(spread))

  return (
    <aside className="relative flex shrink-0 flex-col border-r bg-card" style={{ width: `${stripWidth}px`, borderColor: 'var(--border)' }}>
      <div className="border-b p-2" style={{ borderColor: 'var(--border)' }}>
        <div className="grid grid-cols-2 rounded-md bg-muted p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setActiveView('pages')}
            className={`flex h-7 min-w-0 items-center justify-center gap-1 rounded transition ${activeView === 'pages' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            aria-pressed={activeView === 'pages'}
          >
            <Files size={13} aria-hidden="true" />
            <span className="truncate">{t('admin.zine_pages', language)}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('assets')}
            className={`flex h-7 min-w-0 items-center justify-center gap-1 rounded transition ${activeView === 'assets' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            aria-pressed={activeView === 'assets'}
          >
            <Images size={13} aria-hidden="true" />
            <span className="truncate">{t('admin.zine_assets', language)}</span>
          </button>
        </div>
      </div>

      {activeView === 'pages' ? (
        <>
          <div className="flex items-baseline justify-between px-4 pb-1 pt-3">
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
              {t('admin.zine_pages', language)}
            </span>
            <span className="text-[11px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
              {t('admin.zine_page_total', language, { count: getTotalPageCount(project) })}
            </span>
          </div>

          <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {!coverExists && (
          <button
            type="button"
            onClick={addCoverSpread}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-[11px] font-medium transition hover:border-primary hover:text-primary"
            style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
          >
            <BookMarked size={13} />
            {t('admin.zine_add_cover', language)}
          </button>
        )}

        {project.spreads.map((spread, index) => {
          const active = spread.id === activeSpreadId
          const isCover = isCoverSpread(spread)
          const pageNumbers = getSpreadPageNumbers(project, index)
          const label =
            pageNumbers === 'cover'
              ? `${t('admin.zine_back_cover', language)} · ${t('admin.zine_front_cover', language)}`
              : `P${pageNumbers.left} · P${pageNumbers.right}`
          const canDelete = isCover || contentCount > 1

          return (
            <div key={spread.id} ref={active ? activeItemRef : undefined} className="group relative">
              <button
                type="button"
                onClick={() => setActiveSpread(spread.id)}
                aria-current={active ? 'true' : undefined}
                className="block w-full rounded-lg border p-1.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  borderColor: active ? 'var(--primary)' : 'transparent',
                  backgroundColor: active ? 'var(--accent)' : 'transparent',
                  boxShadow: active ? '0 0 0 1px var(--primary)' : undefined,
                }}
              >
                <PageThumb project={project} spread={spread} fluid />
                <span
                  className="mt-1.5 block text-center text-[11px] tabular-nums"
                  style={{ color: active ? 'var(--foreground)' : 'var(--muted-foreground)', fontWeight: active ? 600 : 400 }}
                >
                  {label}
                </span>
              </button>

              <div className="absolute right-2.5 top-2.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                {!isCover && (
                  <>
                    <RailAction label={t('admin.zine_move_up', language)} onClick={() => moveSpread(spread.id, -1)} disabled={index <= firstContentIndex}>
                      <ChevronUp size={11} />
                    </RailAction>
                    <RailAction
                      label={t('admin.zine_move_down', language)}
                      onClick={() => moveSpread(spread.id, 1)}
                      disabled={index === project.spreads.length - 1}
                    >
                      <ChevronDown size={11} />
                    </RailAction>
                  </>
                )}
                {canDelete && (
                  <RailAction label={t('admin.zine_delete_spread', language)} onClick={() => removeSpread(spread.id)}>
                    <Trash2 size={11} />
                  </RailAction>
                )}
              </div>
            </div>
          )
        })}

        <button
          type="button"
          onClick={() => addSpread()}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-3.5 text-[11px] font-medium transition hover:border-primary hover:text-primary"
          style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
        >
          <Plus size={14} />
          {t('admin.zine_add_spread', language)}
        </button>
          </div>
        </>
      ) : (
        <PhotoTray />
      )}

      {/* 右缘拖拽手柄：拖动调宽 · 双击复位 · 方向键微调 */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(stripWidth)}
        aria-valuemin={STRIP_MIN_WIDTH}
        aria-valuemax={STRIP_MAX_WIDTH}
        aria-label={t('admin.zine_resize_pages', language)}
        title={t('admin.zine_resize_pages', language)}
        tabIndex={0}
        className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none outline-none transition-colors hover:bg-primary/50 focus-visible:bg-primary/50"
        style={dragWidth !== null ? { backgroundColor: 'var(--primary)' } : undefined}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          resizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: stripWidth }
          setDragWidth(stripWidth)
          document.body.style.cursor = 'col-resize'
        }}
        onPointerMove={(event) => {
          const session = resizeRef.current
          if (!session || session.pointerId !== event.pointerId) return
          setDragWidth(clampStripWidth(session.startWidth + event.clientX - session.startX))
        }}
        onPointerUp={commitResize}
        onPointerCancel={commitResize}
        onDoubleClick={() => setStripWidth(STRIP_DEFAULT_WIDTH)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          event.preventDefault()
          setStripWidth(clampStripWidth(stripWidth + (event.key === 'ArrowRight' ? 8 : -8)))
        }}
      />
    </aside>
  )
}
