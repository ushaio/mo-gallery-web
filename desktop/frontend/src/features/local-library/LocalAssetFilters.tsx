import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, Filter, X } from 'lucide-react'
import type { AssetStructuredFilters } from './types'
import type { LocalLibraryCopy } from './copy'

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
    <div className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex h-8 items-center gap-1.5 rounded-md border bg-input px-2.5 text-xs hover:bg-secondary">
        <Filter size={13} />{copy.filters}{count > 0 && <span className="rounded-full bg-primary px-1.5 text-[9px] text-primary-foreground">{count}</span>}<ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-[min(720px,calc(100vw-260px))] rounded-lg border bg-card p-4 shadow-xl" style={{ borderColor: 'var(--border)' }}>
          <div className="mb-3 flex items-center justify-between">
            <div><h2 className="text-sm font-semibold">{copy.filters}</h2><p className="mt-0.5 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{copy.filterLogicHint}</p></div>
            <div className="flex items-center gap-2"><button type="button" disabled={count === 0} onClick={onClear} className="rounded px-2 py-1 text-[10px] hover:bg-secondary disabled:opacity-40">{copy.clearFilters}</button><button type="button" onClick={() => setOpen(false)} className="rounded p-1 hover:bg-secondary" aria-label={copy.close}><X size={14} /></button></div>
          </div>
          {chips.length > 0 && <div className="mb-4 flex flex-wrap gap-1.5">{chips.map((chip) => <button key={chip.key} type="button" onClick={chip.remove} className="flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] hover:bg-secondary">{chip.label}<X size={10} /></button>)}</div>}
          <div className="custom-scrollbar grid max-h-[62vh] grid-cols-2 gap-x-5 gap-y-4 overflow-y-auto pr-1">
            <FilterSection title={copy.filterRating}>
              <RangeInputs min={filters.ratingMin} max={filters.ratingMax} minLimit={0} maxLimit={5} onMin={(value) => update('ratingMin', value)} onMax={(value) => update('ratingMax', value)} />
            </FilterSection>
            <FilterSection title={copy.filterColor}>
              <div className="flex flex-wrap gap-1">{COLORS.map((color) => <Toggle key={color} active={filters.colorLabels?.includes(color) ?? false} onClick={() => update('colorLabels', toggleValue(filters.colorLabels, color))}>{copy[color]}</Toggle>)}</div>
            </FilterSection>
            <FilterSection title={copy.filterFormat}>
              <div className="flex flex-wrap gap-1">{FORMATS.map((format) => <Toggle key={format} active={filters.formats?.includes(format) ?? false} onClick={() => update('formats', toggleValue(filters.formats, format))}>{format.toUpperCase()}</Toggle>)}</div>
            </FilterSection>
            <FilterSection title={copy.filterPreview}>
              <div className="flex flex-wrap gap-1">{PREVIEW_STATUSES.map((status) => <Toggle key={status} active={filters.previewStatuses?.includes(status) ?? false} onClick={() => update('previewStatuses', toggleValue(filters.previewStatuses, status))}>{copy[`preview_${status}` as keyof LocalLibraryCopy]}</Toggle>)}</div>
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
              <select value={filters.orientation ?? ''} onChange={(event) => update('orientation', (event.target.value || undefined) as AssetStructuredFilters['orientation'])} className="h-8 w-full rounded-md border bg-input px-2 text-xs"><option value="">{copy.any}</option><option value="landscape">{copy.landscape}</option><option value="portrait">{copy.portrait}</option><option value="square">{copy.square}</option></select>
            </FilterSection>
            <FilterSection title={copy.filterDimensions}>
              <div className="space-y-2"><LabeledRange label={`${copy.filterWidth} (px)`} min={filters.widthMin} max={filters.widthMax} onMin={(value) => update('widthMin', value)} onMax={(value) => update('widthMax', value)} /><LabeledRange label={`${copy.filterHeight} (px)`} min={filters.heightMin} max={filters.heightMax} onMin={(value) => update('heightMin', value)} onMax={(value) => update('heightMax', value)} /></div>
            </FilterSection>
          </div>
        </div>
      )}
    </div>
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
