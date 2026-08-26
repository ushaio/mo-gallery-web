import type { ReactNode } from 'react'
import { Film, Pencil, Trash2 } from 'lucide-react'

import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/ContextMenu'
import { getFilmStockDisplay, getFilmStockDisplayStyle } from '@/lib/film-presets'
import { t, type Locale } from '@/lib/i18n'
import { currentFormat } from './helpers'
import type { FilmRollDTO } from './types'

export function DetailTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex h-full items-center gap-1.5 px-3 text-xs font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      style={{ color: active ? 'var(--foreground)' : 'var(--muted-foreground)' }}
    >
      {children}
      {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full" style={{ backgroundColor: 'var(--primary)' }} />}
    </button>
  )
}

export function RollRow({ roll, selected, language, onClick, onEdit, onDelete }: {
  roll: FilmRollDTO
  selected: boolean
  language: Locale
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const display = getFilmStockDisplay(roll.brand, roll.name, currentFormat(roll), 14 / 10)
  const style = getFilmStockDisplayStyle(display)
  const photoCount = roll.photoCount ?? roll.filmPhotos?.length ?? 0
  const percent = roll.frameCount > 0 ? Math.min(100, Math.round(photoCount / roll.frameCount * 100)) : 0
  const accentText = selected ? 'color-mix(in srgb, var(--accent-foreground) 70%, transparent)' : 'var(--muted-foreground)'

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="group relative flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          style={{ backgroundColor: selected ? 'var(--accent)' : undefined }}
        >
          <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md border p-1" style={{ borderColor: 'var(--border)', backgroundColor: selected ? 'color-mix(in srgb, var(--accent-foreground) 8%, transparent)' : 'var(--muted)' }}>
            <img src={display.asset} alt="" className="max-h-full max-w-full object-contain" style={style} />
          </span>
          <span className="min-w-0 flex-1 pr-7">
            <span className="block truncate text-xs font-medium" style={{ color: selected ? 'var(--accent-foreground)' : 'var(--foreground)' }}>{roll.name}</span>
            <span className="mt-0.5 block truncate text-[10px]" style={{ color: accentText }}>{roll.brand} · {currentFormat(roll)} · ISO {roll.iso}</span>
            <span className="mt-1.5 flex items-center gap-1.5">
              <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: selected ? 'color-mix(in srgb, var(--accent-foreground) 18%, transparent)' : 'var(--muted)' }}>
                <span className="block h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: 'var(--primary)' }} />
              </span>
              <span className="shrink-0 text-[9px] tabular-nums" style={{ color: accentText }}>{photoCount}/{roll.frameCount}</span>
            </span>
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={event => { event.stopPropagation(); onDelete() }}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onDelete() } }}
            title={t('common.delete', language)}
            aria-label={t('common.delete', language)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)', color: 'white' }}
          >
            <Trash2 size={12} />
          </span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel className="max-w-56 truncate">{roll.name}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onClick}><Film size={14} />{t('admin.film_roll_open', language)}</ContextMenuItem>
        <ContextMenuItem onSelect={onEdit}><Pencil size={14} />{t('admin.edit_film_roll', language)}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={onDelete}><Trash2 size={14} />{t('common.delete', language)}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function RollGridCard({ roll, selected, language, onClick, onEdit, onDelete }: {
  roll: FilmRollDTO
  selected: boolean
  language: Locale
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const display = getFilmStockDisplay(roll.brand, roll.name, currentFormat(roll), 4 / 3)
  const style = getFilmStockDisplayStyle(display)
  const photoCount = roll.photoCount ?? roll.filmPhotos?.length ?? 0
  const accentText = selected ? 'color-mix(in srgb, var(--accent-foreground) 70%, transparent)' : 'var(--muted-foreground)'

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="group relative min-w-0 rounded-lg border p-1 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          style={{ borderColor: selected ? 'var(--primary)' : 'var(--border)', backgroundColor: selected ? 'var(--accent)' : undefined }}
        >
          <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-md" style={{ backgroundColor: 'var(--muted)' }}>
            <img src={display.asset} alt="" className="h-full w-full object-contain p-2" style={style} />
            <span className="absolute left-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[9px] font-medium text-white tabular-nums">{photoCount}</span>
            <span
              role="button"
              tabIndex={0}
              onClick={event => { event.stopPropagation(); onDelete() }}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onDelete() } }}
              title={t('common.delete', language)}
              aria-label={t('common.delete', language)}
              className="absolute right-1.5 top-1.5 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              style={{ backgroundColor: 'rgba(0,0,0,0.55)', color: 'white' }}
            >
              <Trash2 size={11} />
            </span>
          </span>
          <span className="block min-w-0 px-1 pb-1 pt-1.5">
            <span className="block truncate text-[11px] font-medium" style={{ color: selected ? 'var(--accent-foreground)' : 'var(--foreground)' }}>{roll.name}</span>
            <span className="mt-0.5 block truncate text-[9px]" style={{ color: accentText }}>{roll.brand} · ISO {roll.iso}</span>
          </span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel className="max-w-56 truncate">{roll.name}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onClick}><Film size={14} />{t('admin.film_roll_open', language)}</ContextMenuItem>
        <ContextMenuItem onSelect={onEdit}><Pencil size={14} />{t('admin.edit_film_roll', language)}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={onDelete}><Trash2 size={14} />{t('common.delete', language)}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
