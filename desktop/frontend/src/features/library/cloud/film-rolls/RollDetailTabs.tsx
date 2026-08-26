import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, Image as ImageIcon, RefreshCw, Search, X } from 'lucide-react'

import { SelectDropdown } from '@/components/ui/SelectDropdown'
import { resolveAssetUrl } from '@/lib/api'
import { getFilmStockNames, type FilmFormat } from '@/lib/film-presets'
import { t, type Locale } from '@/lib/i18n'
import {
  BRAND_OPTIONS,
  currentFormat,
  dateInputValue,
  FORMAT_OPTIONS,
  formInputClass,
  inputStyle,
  isoFromDateInput,
  presetFor,
} from './helpers'
import type { FilmPhotoDTO, FilmRollDTO, PhotoDTO, PhotoTypeFilter } from './types'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      {children}
    </label>
  )
}

export function OverviewTab({ roll, onChange, language }: { roll: FilmRollDTO; onChange: (roll: FilmRollDTO) => void; language: Locale }) {
  const format = currentFormat(roll)
  const nameOptions = useMemo(() => getFilmStockNames(roll.brand, format), [format, roll.brand])
  const update = (patch: Partial<FilmRollDTO>) => onChange({ ...roll, ...patch })

  const handleFormatChange = (nextFormat: FilmFormat) => {
    const names = getFilmStockNames(roll.brand, nextFormat)
    const name = names.includes(roll.name) ? roll.name : names[0] ?? roll.name
    const preset = presetFor(roll.brand, name, nextFormat)
    update({ format: nextFormat, name, iso: preset?.iso ?? roll.iso, frameCount: preset?.frameCount ?? roll.frameCount })
  }

  const handleBrandChange = (brand: string) => {
    const names = getFilmStockNames(brand, format)
    const name = names.includes(roll.name) ? roll.name : names[0] ?? roll.name
    const preset = presetFor(brand, name, format)
    update({ brand, name, iso: preset?.iso ?? roll.iso, frameCount: preset?.frameCount ?? roll.frameCount })
  }

  const handleNameChange = (name: string) => {
    const preset = presetFor(roll.brand, name, format)
    update({ name, iso: preset?.iso ?? roll.iso, frameCount: preset?.frameCount ?? roll.frameCount })
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label={language === 'zh' ? '画幅' : 'Format'}>
          <SelectDropdown value={format} options={FORMAT_OPTIONS} onChange={value => handleFormatChange(value as FilmFormat)} size="md" ariaLabel={language === 'zh' ? '画幅' : 'Format'} className="w-full" />
        </Field>
        <Field label={t('admin.film_roll_brand', language)}>
          <SelectDropdown value={roll.brand} options={BRAND_OPTIONS} onChange={value => handleBrandChange(String(value))} size="md" ariaLabel={t('admin.film_roll_brand', language)} className="w-full" />
        </Field>
        <Field label={t('admin.film_roll_name', language)}>
          {nameOptions.length > 0 ? (
            <SelectDropdown value={roll.name} options={nameOptions.map(name => ({ value: name, label: name }))} onChange={value => handleNameChange(String(value))} size="md" ariaLabel={t('admin.film_roll_name', language)} className="w-full" />
          ) : (
            <input value={roll.name} onChange={event => update({ name: event.target.value })} className={formInputClass} style={inputStyle()} />
          )}
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t('admin.film_roll_iso', language)}>
          <input type="number" min={1} value={roll.iso} onChange={event => update({ iso: Number(event.target.value) || 1 })} className={formInputClass} style={inputStyle()} />
        </Field>
        <Field label={t('admin.film_roll_frame_count', language)}>
          <input type="number" min={1} value={roll.frameCount} onChange={event => update({ frameCount: Number(event.target.value) || 1 })} className={formInputClass} style={inputStyle()} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t('admin.film_roll_shoot_date', language)}>
          <input type="date" value={dateInputValue(roll.shootDate)} onChange={event => update({ shootDate: isoFromDateInput(event.target.value) })} className={formInputClass} style={inputStyle()} />
        </Field>
        <Field label={t('admin.film_roll_end_date', language)}>
          <input type="date" value={dateInputValue(roll.endDate)} onChange={event => update({ endDate: isoFromDateInput(event.target.value) })} className={formInputClass} style={inputStyle()} />
        </Field>
      </div>
      <Field label={t('admin.film_roll_notes', language)}>
        <textarea value={roll.notes ?? ''} onChange={event => update({ notes: event.target.value })} rows={4} className={`${formInputClass} resize-none`} style={inputStyle()} />
      </Field>
    </div>
  )
}

export function PhotosTab({ roll, language, saving, onRemovePhoto, onReorderFrames }: {
  roll: FilmRollDTO
  language: Locale
  saving: boolean
  onRemovePhoto: (photoId: string) => void
  onReorderFrames: (orderedIds: string[]) => void
}) {
  const filmPhotos = roll.filmPhotos ?? []
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [previewOrder, setPreviewOrder] = useState<FilmPhotoDTO[] | null>(null)

  // 拖拽过程中用 previewOrder 实时预览，释放时提交最终顺序
  const displayOrder = previewOrder ?? filmPhotos
  const dragEnabled = filmPhotos.length > 1 && !saving

  const handleDragStart = (item: FilmPhotoDTO) => {
    if (!dragEnabled) return
    setDraggingId(item.id)
    setPreviewOrder([...filmPhotos])
  }

  const handleDragEnter = (targetId: string) => {
    if (!draggingId || draggingId === targetId || !previewOrder) return
    const from = previewOrder.findIndex(fp => fp.id === draggingId)
    const to = previewOrder.findIndex(fp => fp.id === targetId)
    if (from < 0 || to < 0 || from === to) return
    const next = [...previewOrder]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setPreviewOrder(next)
  }

  const handleDrop = () => {
    if (draggingId && previewOrder) onReorderFrames(previewOrder.map(fp => fp.id))
    setDraggingId(null)
    setPreviewOrder(null)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setPreviewOrder(null)
  }

  if (filmPhotos.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
        <span className="flex size-12 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--muted)' }}><ImageIcon size={20} /></span>
        <p className="text-sm">{t('admin.no_photos', language)}</p>
      </div>
    )
  }

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
      onDrop={handleDrop}
      onDragOver={event => { if (draggingId) event.preventDefault() }}
    >
      {displayOrder.map(item => (
        <div
          key={item.id}
          draggable={dragEnabled}
          onDragStart={() => handleDragStart(item)}
          onDragEnter={() => handleDragEnter(item.id)}
          onDragEnd={handleDragEnd}
          className={`group relative overflow-hidden rounded-lg border ${dragEnabled ? 'cursor-grab active:cursor-grabbing' : ''} transition-colors ${draggingId === item.id ? 'opacity-50 ring-2 ring-primary' : ''}`}
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)' }}
        >
            <div className="aspect-square">
              {item.photo?.thumbnailUrl || item.photo?.url ? (
                <img src={resolveAssetUrl(item.photo.thumbnailUrl || item.photo.url)} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
              ) : (
                <div className="flex h-full w-full items-center justify-center"><ImageIcon size={22} style={{ color: 'var(--muted-foreground)' }} /></div>
              )}
            </div>
            <span draggable={false} className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-white tabular-nums backdrop-blur-sm">#{item.frameNumber}</span>
            <button
              draggable={false}
              onMouseDown={event => event.stopPropagation()}
              onClick={() => onRemovePhoto(item.photoId)}
              title={t('common.delete', language)}
              aria-label={t('common.delete', language)}
              className="absolute right-1.5 top-1.5 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: 'white' }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
    </div>
  )
}

export function PhotoSelector({ photos, selectedIds, search, typeFilter, saving, language, onSearchChange, onTypeFilterChange, onToggle, onConfirm, onClose }: {
  photos: PhotoDTO[]
  selectedIds: Set<string>
  search: string
  typeFilter: PhotoTypeFilter
  saving: boolean
  language: Locale
  onSearchChange: (value: string) => void
  onTypeFilterChange: (value: PhotoTypeFilter) => void
  onToggle: (id: string) => void
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={onClose} title={t('common.close', language)} aria-label={t('common.close', language)} className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-secondary" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}><X size={14} /></button>
          <span className="text-xs font-medium">{selectedIds.size} {t('admin.selected', language)}</span>
          <div className="relative w-44">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
            <input value={search} onChange={event => onSearchChange(event.target.value)} placeholder={t('common.search', language)} className="h-8 w-full rounded-md border bg-input pl-8 pr-3 text-xs outline-none focus:ring-1" />
          </div>
          <SelectDropdown
            value={typeFilter}
            options={[
              { value: 'all', label: t('common.all', language) },
              { value: 'digital', label: t('admin.upload_type_digital', language) },
              { value: 'film', label: t('admin.upload_type_film', language) },
            ]}
            onChange={value => onTypeFilterChange(value as PhotoTypeFilter)}
            ariaLabel={language === 'zh' ? '照片类型' : 'Photo type'}
            className="w-32"
          />
        </div>
        <button onClick={onConfirm} disabled={saving || selectedIds.size === 0} className="flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
          {t('admin.confirm_add', language)} ({selectedIds.size})
        </button>
      </div>
      {photos.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
          <div className="flex h-48 flex-col items-center justify-center gap-2">
            <ImageIcon size={22} className="opacity-40" />
            <p className="text-sm">{t('admin.no_photos_available', language)}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
          {photos.map(photo => (
            <button key={photo.id} onClick={() => onToggle(photo.id)} className="relative aspect-square overflow-hidden rounded-md border-2 transition-all" style={{ borderColor: selectedIds.has(photo.id) ? 'var(--primary)' : 'transparent', backgroundColor: 'var(--muted)' }}>
              {photo.thumbnailUrl || photo.url ? <img src={resolveAssetUrl(photo.thumbnailUrl || photo.url)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><ImageIcon size={16} style={{ color: 'var(--muted-foreground)' }} /></div>}
              {selectedIds.has(photo.id) && <div className="absolute inset-0 flex items-center justify-center bg-black/30"><Check size={20} className="text-white" /></div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
