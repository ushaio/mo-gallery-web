'use client'

import { useState, useEffect, useMemo } from 'react'
import { Film, X, Search, Check } from 'lucide-react'
import type { FilmRollDto } from '@/lib/api/types'
import { AdminButton } from '@/components/admin/AdminButton'

interface FilmRollSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (rollId: string | null, rollName?: string) => void
  filmRolls: FilmRollDto[]
  selectedRollId?: string
  loading?: boolean
  t: (key: string) => string
}

export function FilmRollSelectorModal({
  isOpen,
  onClose,
  onSelect,
  filmRolls,
  selectedRollId,
  loading,
  t,
}: FilmRollSelectorModalProps) {
  const [search, setSearch] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) setSearch('')
  }, [isOpen])

  const filtered = useMemo(() => {
    if (!search.trim()) return filmRolls
    const q = search.toLowerCase()
    return filmRolls.filter(r => r.name.toLowerCase().includes(q) || r.brand.toLowerCase().includes(q))
  }, [filmRolls, search])

  const handleSelect = (roll: FilmRollDto | null) => {
    onSelect(roll?.id || null, roll?.name)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Film className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-medium">{t('admin.film_roll_select')}</h3>
          </div>
          <AdminButton onClick={onClose} adminVariant="icon" className="p-1.5 hover:bg-muted" aria-label="Close">
            <X className="w-4 h-4" />
          </AdminButton>
        </div>

        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={t('admin.search_film_roll')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-4 bg-muted/30 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">{t('common.loading')}...</div>
          ) : (
            <div className="py-1">
              <button
                onClick={() => handleSelect(null)}
                onMouseEnter={() => setHoveredId('none')}
                onMouseLeave={() => setHoveredId(null)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  !selectedRollId ? 'bg-primary/5' : hoveredId === 'none' ? 'bg-muted/50' : ''
                }`}
              >
                <div className={`size-4 rounded-full border-2 flex items-center justify-center ${
                  !selectedRollId ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                }`}>
                  {!selectedRollId && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </div>
                <span className="text-sm text-muted-foreground">{t('admin.no_film_roll')}</span>
              </button>

              {filtered.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  {search ? t('common.no_results') : t('admin.no_film_rolls')}
                </div>
              ) : (
                filtered.map(roll => (
                  <button
                    key={roll.id}
                    onClick={() => handleSelect(roll)}
                    onMouseEnter={() => setHoveredId(roll.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      selectedRollId === roll.id ? 'bg-primary/5' : hoveredId === roll.id ? 'bg-muted/50' : ''
                    }`}
                  >
                    <div className={`size-4 rounded-full border-2 flex items-center justify-center ${
                      selectedRollId === roll.id ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                    }`}>
                      {selectedRollId === roll.id && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{roll.name}</p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {roll.brand} · ISO {roll.iso} · {roll.frameCount} {t('admin.film_roll_frames')}
                        <span className="mx-1.5">·</span>
                        {roll.photoCount ?? 0} {t('admin.photos')}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
