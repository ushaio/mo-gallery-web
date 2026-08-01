import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, Filter, X } from 'lucide-react'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import type { AssetStructuredFilters } from './types'
import type { LocalLibraryCopy, LocalLibraryStringKey } from './copy'

interface Props {
  copy: LocalLibraryCopy
  filters: AssetStructuredFilters
  onChange: (filters: AssetStructuredFilters) => void
  onClear: () => void
}

type FilterKey = keyof AssetStructuredFilters

const COLORS = ['red', 'yellow', 'green', 'blue', 'purple'] as const
const FORMATS = ['jpeg', 'png', 'gif', 'webp', 'tiff', 'heif', 'avif', 'cr2', 'cr3', 'nef', 'arw', 'raf']
const PREVIEW_STATUSES = ['pending', 'generating', 'ready', 'unavailable']

function numberValue(value: string) {
  if (value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function dateInputValue(value?: number) {
  if (value === undefined) return ''
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateMilliseconds(value: string, endOfDay = false) {
  if (!value) return undefined
  const timestamp = new Date(`${value}T00:00:00`).getTime()
  return Number.isFinite(timestamp) ? timestamp + (endOfDay ? 86_399_999 : 0) : undefined
}

function activeCount(filters: AssetStructuredFilters) {
  return Object.values(filters).filter((value) => Array.isArray(value) ? value.length > 0 : value !== undefined && value !== '').length
}

function toggleValue(values: string[] | undefined, value: string) {
  const current = values ?? []
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
}

function TextListInput({ value, placeholder, onCommit }: { value?: string[], placeholder: string, onCommit: (value: string[] | undefined) => void }) {
  const [text, setText] = useState((value ?? []).join(', '))
  useEffect(() => setText((value ?? []).join(', ')), [value])
  return <input value={text} placeholder={placeholder} onChange={(event) => setText(event.target.value)} onBlur={() => {
    const next = [...new Set(text.split(/[,?]/).map((item) => item.trim()).filter(Boolean))]
    onCommit(next.length ? next : undefined)
  }} className="h-8 w-full rounded-md border bg-input px-2 text-xs outline-none focus:ring-1" />
}

export function LocalAssetFilters({ copy, filters, onChange, onClear }: Props) {
  const [open, setOpen] = useState(false)
  const count = activeCount(filters)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const update = <K extends FilterKey>(key: K, value: AssetStructuredFilters[K]) => {
    const next = { ...filters, [key]: value }
    if (value === undefined || (Array.isArray(value) && value.length === 0)) delete next[key]
    onChange(next)
  }
  const removeMany = (...keys: FilterKey[]) => {
    const next = { ...filters }
    keys.forEach((key) => delete next[key])
    onChange(next)
  }

  const chips = useMemo(() => {
    const result: Array<{ key: string, label: string, remove: () => void }> = []
    const range = (key: string, label: string, minKey: FilterKey, maxKey: FilterKey, suffix = '') => {
      const min = filters[minKey] as number | undefined
      const max = filters[maxKey] as number | undefined
      if (min !== undefined || max !== undefined) result.push({ key, label: `${label}: ${min ?? '?'}?${max ?? '?'}${suffix}`, remove: () => removeMany(minKey, maxKey) })
    }
    range('rating', copy.filterRating, 'ratingMin', 'ratingMax')
    if (filters.colorLabels?.length) result.push({ key: 'colors', label: `${copy.filterColor}: ${filters.colorLabels.join('/')}`, remove: () => update('colorLabels', undefined) })
    if (filters.formats?.length) result.push({ key: 'formats', label: `${copy.filterFormat}: ${filters.formats.join('/')}`, remove: () => update('formats', undefined) })
    if (filters.previewStatuses?.length) result.push({ key: 'previews', label: `${copy.filterPreview}: ${filters.previewStatuses.join('/')}`, remove: () => update('previewStatuses', undefined) })
    if (filters.capturedFromMs !== undefined || filters.capturedToMs !== undefined) result.push({ key: 'captured', label: copy.filterCapturedDate, remove: () => removeMany('capturedFromMs', 'capturedToMs') })
    if (filters.discoveredFromMs !== undefined || filters.discoveredToMs !== undefined) result.push({ key: 'discovered', label: copy.filterDiscoveredDate, remove: () => removeMany('discoveredFromMs', 'discoveredToMs') })
    if (filters.cameraMakes?.length) result.push({ key: 'make', label: `${copy.filterCameraMake}: ${filters.cameraMakes.join('/')}`, remove: () => update('cameraMakes', undefined) })
    if (filters.cameraModels?.length) result.push({ key: 'model', label: `${copy.filterCameraModel}: ${filters.cameraModels.join('/')}`, remove: () => update('cameraModels', undefined) })
    if (filters.lensModels?.length) result.push({ key: 'lens', label: `${copy.filterLens}: ${filters.lensModels.join('/')}`, remove: () => update('lensModels', undefined) })
    range('iso', 'ISO', 'isoMin', 'isoMax')
    range('aperture', copy.filterAperture, 'apertureMin', 'apertureMax')
    range('focal', copy.filterFocalLength, 'focalLengthMin', 'focalLengthMax', 'mm')
    if (filters.orientation) result.push({ key: 'orientation', label: `${copy.filterOrientation}: ${copy[filters.orientation]}`, remove: () => update('orientation', undefined) })
    range('width', copy.filterWidth, 'widthMin', 'widthMax', 'px')
    range('height', copy.filterHeight, 'heightMin', 'heightMax', 'px')
    return result
  }, [copy, filters]) // callback closures intentionally track current filters

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={copy.filters}
        aria-label={copy.filters}
        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-input hover:bg-secondary"
      >
        <Filter size={13} />
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[8px] font-medium text-primary-foreground">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-5">
          <button type="button" aria-label={copy.closeFilters} className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="local-library-filters-title" className="relative flex max-h-[86vh] w-full max-w-3xl flex-col rounded-xl border bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h2 id="local-library-filters-title" className="text-sm font-semibold">{copy.filters}</h2>
                <p className="mt-0.5 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{copy.filterLogicHint}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={copy.closeFilters} className="rounded-md p-1.5 hover:bg-secondary"><X size={15} /></button>
            </div>
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-b px-5 py-3" style={{ borderColor: 'var(--border)' }}>
                {chips.map((chip) => <button key={chip.key} type="button" onClick={chip.remove} className="flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] hover:bg-secondary">{chip.label}<X size={10} /></button>)}
              </div>
            )}
            <div className="custom-scrollbar grid min-h-0 flex-1 grid-cols-2 gap-x-5 gap-y-4 overflow-y-auto p-5">
            <FilterSection title={copy.filterRating}>
              <RangeInputs min={filters.ratingMin} max={filters.ratingMax} minLimit={0} maxLimit={5} onMin={(value) => update('ratingMin', value)} onMax={(value) => update('ratingMax', value)} />
            </FilterSection>
            <FilterSection title={copy.filterColor}>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((color) => {
                  const active = filters.colorLabels?.includes(color) ?? false
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => update('colorLabels', toggleValue(filters.colorLabels, color))}
                      title={copy[color]}
                      aria-label={copy[color]}
                      aria-pressed={active}
                      className="relative h-6 w-6 rounded-full border transition-transform hover:scale-110"
                      style={{
                        backgroundColor: color,
                        borderColor: active ? 'var(--foreground)' : 'var(--border)',
                        boxShadow: active ? '0 0 0 2px var(--background), 0 0 0 4px var(--foreground)' : undefined,
                      }}
                    >
                      {active && <Check size={13} className="absolute inset-0 m-auto" style={{ color: 'white', filter: 'drop-shadow(0 0 1.5px rgba(0,0,0,0.9))' }} />}
                    </button>
                  )
                })}
              </div>
            </FilterSection>
            <FilterSection title={copy.filterFormat}>
              <div className="flex flex-wrap gap-1">{FORMATS.map((format) => <Toggle key={format} active={filters.formats?.includes(format) ?? false} onClick={() => update('formats', toggleValue(filters.formats, format))}>{format.toUpperCase()}</Toggle>)}</div>
            </FilterSection>
            <FilterSection title={copy.filterPreview}>
              <div className="flex flex-wrap gap-1">{PREVIEW_STATUSES.map((status) => <Toggle key={status} active={filters.previewStatuses?.includes(status) ?? false} onClick={() => update('previewStatuses', toggleValue(filters.previewStatuses, status))}>{copy[`preview_${status}` as LocalLibraryStringKey]}</Toggle>)}</div>
            </FilterSection>
            <FilterSection title={copy.filterCapturedDate}>
              <DateRange from={filters.capturedFromMs} to={filters.capturedToMs} copy={copy} onFrom={(value) => update('capturedFromMs', value)} onTo={(value) => update('capturedToMs', value)} />
            </FilterSection>
            <FilterSection title={copy.filterDiscoveredDate}>
              <DateRange from={filters.discoveredFromMs} to={filters.discoveredToMs} copy={copy} onFrom={(value) => update('discoveredFromMs', value)} onTo={(value) => update('discoveredToMs', value)} />
            </FilterSection>
            <FilterSection title={copy.filterCamera}>
              <div className="space-y-2"><TextListInput value={filters.cameraMakes} placeholder={copy.filterCameraMake} onCommit={(value) => update('cameraMakes', value)} /><TextListInput value={filters.cameraModels} placeholder={copy.filterCameraModel} onCommit={(value) => update('cameraModels', value)} /><TextListInput value={filters.lensModels} placeholder={copy.filterLens} onCommit={(value) => update('lensModels', value)} /></div>
            </FilterSection>
            <FilterSection title={copy.filterExposure}>
              <div className="space-y-2"><LabeledRange label="ISO" min={filters.isoMin} max={filters.isoMax} onMin={(value) => update('isoMin', value)} onMax={(value) => update('isoMax', value)} /><LabeledRange label={copy.filterAperture} min={filters.apertureMin} max={filters.apertureMax} step="0.1" onMin={(value) => update('apertureMin', value)} onMax={(value) => update('apertureMax', value)} /><LabeledRange label={`${copy.filterFocalLength} (mm)`} min={filters.focalLengthMin} max={filters.focalLengthMax} step="0.1" onMin={(value) => update('focalLengthMin', value)} onMax={(value) => update('focalLengthMax', value)} /></div>
            </FilterSection>
            <FilterSection title={copy.filterOrientation}>
              <SelectDropdown
                value={filters.orientation ?? ''}
                options={[
                  { value: '', label: copy.any },
                  { value: 'landscape', label: copy.landscape },
                  { value: 'portrait', label: copy.portrait },
                  { value: 'square', label: copy.square },
                ]}
                onChange={(value) => update('orientation', ((value as string) || undefined) as AssetStructuredFilters['orientation'])}
                ariaLabel={copy.filterOrientation}
              />
            </FilterSection>
            <FilterSection title={copy.filterDimensions}>
              <div className="space-y-2"><LabeledRange label={`${copy.filterWidth} (px)`} min={filters.widthMin} max={filters.widthMax} onMin={(value) => update('widthMin', value)} onMax={(value) => update('widthMax', value)} /><LabeledRange label={`${copy.filterHeight} (px)`} min={filters.heightMin} max={filters.heightMax} onMin={(value) => update('heightMin', value)} onMax={(value) => update('heightMax', value)} /></div>
            </FilterSection>
            </div>
            <div className="flex items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: 'var(--border)' }}>
              <button type="button" disabled={count === 0} onClick={onClear} className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-[10px] hover:bg-secondary disabled:opacity-40"><X size={11} />{copy.clearFilters}</button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md bg-primary px-4 py-1.5 text-[10px] font-medium text-primary-foreground hover:opacity-90">{copy.filterDone}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function FilterSection({ title, children }: { title: string, children: ReactNode }) {
  return <section><h3 className="mb-2 text-[11px] font-medium">{title}</h3>{children}</section>
}

function Toggle({ active, onClick, children }: { active: boolean, onClick: () => void, children: ReactNode }) {
  return <button type="button" onClick={onClick} className="rounded-md border px-2 py-1 text-[10px]" style={{ backgroundColor: active ? 'var(--accent)' : undefined, borderColor: active ? 'var(--primary)' : 'var(--border)' }}>{children}</button>
}

function RangeInputs({ min, max, minLimit, maxLimit, step, onMin, onMax }: { min?: number, max?: number, minLimit?: number, maxLimit?: number, step?: string, onMin: (value?: number) => void, onMax: (value?: number) => void }) {
  return <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><input type="number" value={min ?? ''} min={minLimit} max={maxLimit} step={step} placeholder="Min" onChange={(event) => onMin(numberValue(event.target.value))} className="h-8 min-w-0 rounded-md border bg-input px-2 text-xs" /><span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>?</span><input type="number" value={max ?? ''} min={minLimit} max={maxLimit} step={step} placeholder="Max" onChange={(event) => onMax(numberValue(event.target.value))} className="h-8 min-w-0 rounded-md border bg-input px-2 text-xs" /></div>
}

function LabeledRange({ label, ...props }: { label: string, min?: number, max?: number, step?: string, onMin: (value?: number) => void, onMax: (value?: number) => void }) {
  return <label className="grid grid-cols-[80px_1fr] items-center gap-2 text-[10px]"><span style={{ color: 'var(--muted-foreground)' }}>{label}</span><RangeInputs {...props} /></label>
}

function DateRange({ from, to, copy, onFrom, onTo }: { from?: number, to?: number, copy: LocalLibraryCopy, onFrom: (value?: number) => void, onTo: (value?: number) => void }) {
  return <div className="grid grid-cols-2 gap-2"><label className="text-[9px]" style={{ color: 'var(--muted-foreground)' }}>{copy.from}<input type="date" value={dateInputValue(from)} onChange={(event) => onFrom(dateMilliseconds(event.target.value))} className="mt-1 h-8 w-full rounded-md border bg-input px-2 text-xs" /></label><label className="text-[9px]" style={{ color: 'var(--muted-foreground)' }}>{copy.to}<input type="date" value={dateInputValue(to)} onChange={(event) => onTo(dateMilliseconds(event.target.value, true))} className="mt-1 h-8 w-full rounded-md border bg-input px-2 text-xs" /></label></div>
}
