import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { toast } from 'sonner'
import { Check, ChevronLeft, Film, Image as ImageIcon, LayoutGrid, List, Plus, RefreshCw, Save, Search, Trash2, X } from 'lucide-react'

import { CardGridSkeleton, ListSkeleton } from '@/components/admin/Skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { resolveAssetUrl } from '@/lib/api'
import { FILM_FORMATS, FILM_STOCK_BRANDS, FILM_STOCK_PRESETS, getFilmStockDisplay, getFilmStockDisplayStyle, getFilmStockNames, type FilmFormat } from '@/lib/film-presets'
import { t, type Locale } from '@/lib/i18n'
import { usePreferences } from '@/store/preferences'

type ViewMode = 'grid' | 'list'
type DetailTab = 'overview' | 'photos'
type PhotoTypeFilter = 'all' | 'digital' | 'film'

interface PhotoDTO {
  id: string
  title: string
  url: string
  thumbnailUrl?: string
  category?: string
  photoType?: 'digital' | 'film'
  filmRollId?: string | null
}

interface FilmPhotoDTO {
  id: string
  filmRollId: string
  photoId: string
  frameNumber: number
  createdAt?: string
  photo?: PhotoDTO
}

interface FilmRollDTO {
  id: string
  name: string
  brand: string
  format?: FilmFormat
  iso: number
  frameCount: number
  notes?: string | null
  shootDate?: string | null
  endDate?: string | null
  createdAt: string
  updatedAt: string
  photoCount?: number
  filmPhotos?: FilmPhotoDTO[]
}

interface FilmRollPayload {
  name: string
  brand: string
  format: FilmFormat
  iso: number
  frameCount: number
  notes?: string | null
  shootDate?: string | null
  endDate?: string | null
}

interface WailsAppAPI {
  GetFilmRolls(): Promise<FilmRollDTO[]>
  GetFilmRoll(id: string): Promise<FilmRollDTO>
  CreateFilmRoll(params: FilmRollPayload): Promise<FilmRollDTO>
  UpdateFilmRoll(id: string, params: Partial<FilmRollPayload>): Promise<FilmRollDTO>
  DeleteFilmRoll(id: string): Promise<void>
  AddPhotosToFilmRoll(id: string, photoIds: string[]): Promise<FilmRollDTO>
  RemovePhotoFromFilmRoll(rollId: string, photoId: string): Promise<FilmRollDTO>
  ReorderFilmRollFrames(id: string): Promise<FilmRollDTO>
  GetAllPhotos(): Promise<PhotoDTO[]>
}

declare global {
  interface Window {
    go?: { main?: { App?: WailsAppAPI } }
  }
}

const FORMAT_OPTIONS = FILM_FORMATS.map(value => ({ value, label: value }))
const BRAND_OPTIONS = FILM_STOCK_BRANDS.map(value => ({ value, label: value }))

function appApi(): WailsAppAPI {
  const app = window.go?.main?.App
  if (!app) throw new Error('Wails API is not available')
  return app
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function currentFormat(roll?: FilmRollDTO | null): FilmFormat {
  return roll?.format === '120' ? '120' : '135'
}

function normalizeRoll(roll: FilmRollDTO): FilmRollDTO {
  return {
    ...roll,
    format: currentFormat(roll),
    filmPhotos: roll.filmPhotos ?? [],
    photoCount: roll.photoCount ?? roll.filmPhotos?.length ?? 0,
  }
}

function newDraftRoll(): FilmRollDTO {
  const preset = FILM_STOCK_PRESETS[0]
  const now = new Date().toISOString()
  return {
    id: '',
    name: preset.name,
    brand: preset.brand,
    format: preset.format,
    iso: preset.iso,
    frameCount: preset.frameCount,
    notes: null,
    shootDate: null,
    endDate: null,
    createdAt: now,
    updatedAt: now,
    photoCount: 0,
    filmPhotos: [],
  }
}

function presetFor(brand: string, name: string, format: FilmFormat) {
  return FILM_STOCK_PRESETS.find(item => item.brand === brand && item.name === name && item.format === format)
}

function isoFromDateInput(value: string) {
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null
}

function dateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : ''
}

function inputStyle(): CSSProperties {
  return { borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }
}

export function FilmRollsPage() {
  const { language } = usePreferences()
  const [rolls, setRolls] = useState<FilmRollDTO[]>([])
  const [photos, setPhotos] = useState<PhotoDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingCurrentRoll, setLoadingCurrentRoll] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentRoll, setCurrentRoll] = useState<FilmRollDTO | null>(null)
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')
  const [showPhotoSelector, setShowPhotoSelector] = useState(false)
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<FilmRollDTO | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterBrand, setFilterBrand] = useState('')
  const [photoSelectorSearch, setPhotoSelectorSearch] = useState('')
  const [photoTypeFilter, setPhotoTypeFilter] = useState<PhotoTypeFilter>('film')
  const currentRollRequestIdRef = useRef(0)

  const fetchRolls = useCallback(async () => {
    setLoading(true)
    try {
      const data = await appApi().GetFilmRolls()
      setRolls((data ?? []).map(normalizeRoll))
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    } finally {
      setLoading(false)
    }
  }, [language])

  const fetchPhotos = useCallback(async () => {
    try {
      setPhotos(await appApi().GetAllPhotos())
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    }
  }, [language])

  useEffect(() => {
    void fetchRolls()
    void fetchPhotos()
  }, [fetchPhotos, fetchRolls])
  const openRoll = useCallback(async (roll: FilmRollDTO) => {
    const requestId = ++currentRollRequestIdRef.current
    setCurrentRoll(normalizeRoll(roll))
    setActiveTab('photos')
    setShowPhotoSelector(false)
    setSelectedPhotoIds(new Set())
    setPhotoSelectorSearch('')
    setPhotoTypeFilter('film')
    setLoadingCurrentRoll(true)
    try {
      const full = await appApi().GetFilmRoll(roll.id)
      if (requestId === currentRollRequestIdRef.current) setCurrentRoll(normalizeRoll(full))
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    } finally {
      if (requestId === currentRollRequestIdRef.current) setLoadingCurrentRoll(false)
    }
  }, [language])

  const handleCreateRoll = useCallback(() => {
    currentRollRequestIdRef.current += 1
    setCurrentRoll(newDraftRoll())
    setActiveTab('overview')
    setShowPhotoSelector(false)
    setSelectedPhotoIds(new Set())
    setPhotoSelectorSearch('')
    setPhotoTypeFilter('film')
    setLoadingCurrentRoll(false)
  }, [])

  const handleSave = useCallback(async () => {
    if (!currentRoll) return
    const name = currentRoll.name.trim()
    const brand = currentRoll.brand.trim()
    if (!name) {
      toast.error(t('admin.film_roll_name_required', language))
      return
    }
    if (!brand) {
      toast.error(t('admin.film_roll_brand_required', language))
      return
    }

    setSaving(true)
    try {
      const payload: FilmRollPayload = {
        name,
        brand,
        format: currentFormat(currentRoll),
        iso: currentRoll.iso,
        frameCount: currentRoll.frameCount,
        notes: currentRoll.notes?.trim() || null,
        shootDate: currentRoll.shootDate || null,
        endDate: currentRoll.endDate || null,
      }
      const result = currentRoll.id
        ? await appApi().UpdateFilmRoll(currentRoll.id, payload)
        : await appApi().CreateFilmRoll(payload)
      const full = await appApi().GetFilmRoll(result.id)
      setCurrentRoll(normalizeRoll(full))
      setActiveTab('photos')
      toast.success(t(currentRoll.id ? 'admin.film_roll_updated' : 'admin.film_roll_created', language))
      await fetchRolls()
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    } finally {
      setSaving(false)
    }
  }, [currentRoll, fetchRolls, language])

  const handleDelete = useCallback(async () => {
    if (!pendingDelete) return
    const photoCount = pendingDelete.photoCount ?? pendingDelete.filmPhotos?.length ?? 0
    if (photoCount > 0) {
      toast.error(t('admin.film_roll_delete_not_empty', language))
      setPendingDelete(null)
      return
    }

    try {
      await appApi().DeleteFilmRoll(pendingDelete.id)
      toast.success(t('common.deleted', language))
      if (currentRoll?.id === pendingDelete.id) setCurrentRoll(null)
      setPendingDelete(null)
      await fetchRolls()
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
      setPendingDelete(null)
    }
  }, [currentRoll?.id, fetchRolls, language, pendingDelete])

  const handleAddPhotos = useCallback(async () => {
    if (!currentRoll?.id || selectedPhotoIds.size === 0) return
    setSaving(true)
    try {
      const updated = await appApi().AddPhotosToFilmRoll(currentRoll.id, Array.from(selectedPhotoIds))
      setCurrentRoll(normalizeRoll(updated))
      setSelectedPhotoIds(new Set())
      setShowPhotoSelector(false)
      setPhotoSelectorSearch('')
      setPhotoTypeFilter('film')
      toast.success(t('admin.photos_added', language))
      await fetchRolls()
      await fetchPhotos()
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    } finally {
      setSaving(false)
    }
  }, [currentRoll?.id, fetchPhotos, fetchRolls, language, selectedPhotoIds])

  const handleRemovePhoto = useCallback(async (photoId: string) => {
    if (!currentRoll?.id) return
    try {
      const updated = await appApi().RemovePhotoFromFilmRoll(currentRoll.id, photoId)
      setCurrentRoll(normalizeRoll(updated))
      toast.success(t('admin.photo_removed', language))
      await fetchRolls()
      await fetchPhotos()
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    }
  }, [currentRoll?.id, fetchPhotos, fetchRolls, language])

  const handleReorderFrames = useCallback(async () => {
    if (!currentRoll?.id) return
    setSaving(true)
    try {
      setCurrentRoll(normalizeRoll(await appApi().ReorderFilmRollFrames(currentRoll.id)))
      toast.success(t('admin.film_roll_frames_reordered', language))
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    } finally {
      setSaving(false)
    }
  }, [currentRoll?.id, language])

  const brands = useMemo(() => Array.from(new Set(rolls.map(roll => roll.brand))).sort(), [rolls])
  const filteredRolls = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return rolls.filter(roll => {
      const matchesQuery = !query || roll.name.toLowerCase().includes(query) || roll.brand.toLowerCase().includes(query)
      return matchesQuery && (!filterBrand || roll.brand === filterBrand)
    })
  }, [filterBrand, rolls, searchQuery])

  const rollPhotoIds = useMemo(() => new Set(currentRoll?.filmPhotos?.map(item => item.photoId) ?? []), [currentRoll?.filmPhotos])
  const availablePhotos = useMemo(() => {
    const query = photoSelectorSearch.trim().toLowerCase()
    return photos.filter(photo => {
      if (rollPhotoIds.has(photo.id)) return false
      if (photo.filmRollId && photo.filmRollId !== currentRoll?.id) return false
      const resolvedType = photo.photoType ?? (photo.filmRollId ? 'film' : 'digital')
      if (photoTypeFilter !== 'all' && resolvedType !== photoTypeFilter) return false
      if (!query) return true
      return [photo.title, photo.category].some(value => value?.toLowerCase().includes(query))
    })
  }, [currentRoll?.id, photoSelectorSearch, photoTypeFilter, photos, rollPhotoIds])

  if (currentRoll) {
    return (
      <>
        <PageHeader
          title={currentRoll.name || t('admin.new_film_roll', language)}
          description={currentRoll.brand ? `${currentRoll.brand} · ISO ${currentRoll.iso}` : t('admin.new_film_roll', language)}
          actions={
            <div className="flex items-center gap-2">
              <button onClick={() => { setCurrentRoll(null); void fetchRolls() }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                <ChevronLeft size={14} /> {t('admin.back_list', language)}
              </button>
              {activeTab === 'overview' && (
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md disabled:opacity-50" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  {t('common.save', language)}
                </button>
              )}
            </div>
          }
        />
        <div className="flex-1 overflow-auto p-6">
          <div className="flex gap-4 mb-6 border-b" style={{ borderColor: 'var(--border)' }}>
            {(['overview', 'photos'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className="pb-2 text-sm transition-colors relative" style={{ color: activeTab === tab ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                {tab === 'overview' ? t('admin.overview', language) : t('admin.associate_photos', language)}
                {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: 'var(--primary)' }} />}
              </button>
            ))}
          </div>
          {activeTab === 'overview' ? (
            <OverviewTab roll={currentRoll} onChange={setCurrentRoll} language={language} />
          ) : loadingCurrentRoll ? (
            <ListSkeleton count={3} />
          ) : showPhotoSelector ? (
            <PhotoSelector
              photos={availablePhotos}
              selectedIds={selectedPhotoIds}
              search={photoSelectorSearch}
              typeFilter={photoTypeFilter}
              saving={saving}
              onSearchChange={setPhotoSelectorSearch}
              onTypeFilterChange={setPhotoTypeFilter}
              onToggle={(id) => setSelectedPhotoIds(prev => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })}
              onConfirm={handleAddPhotos}
              onClose={() => { setShowPhotoSelector(false); setSelectedPhotoIds(new Set()); setPhotoSelectorSearch(''); setPhotoTypeFilter('film') }}
              language={language}
            />
          ) : (
            <PhotosTab
              roll={currentRoll}
              saving={saving}
              onRemovePhoto={handleRemovePhoto}
              onReorderFrames={handleReorderFrames}
              onShowSelector={() => setShowPhotoSelector(true)}
              language={language}
            />
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={t('admin.page_film_rolls', language)}
        description={`${filteredRolls.length} ${t('admin.film_rolls', language)}`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} className="p-1.5 rounded-md border" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
              {viewMode === 'grid' ? <List size={14} /> : <LayoutGrid size={14} />}
            </button>
            <button onClick={handleCreateRoll} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
              <Plus size={14} /> {t('admin.new_film_roll', language)}
            </button>
          </div>
        }
      />
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
            <input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder={`${t('admin.film_roll_name', language)} / ${t('admin.film_roll_brand', language)}`} className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border outline-none" style={inputStyle()} />
          </div>
          <select value={filterBrand} onChange={event => setFilterBrand(event.target.value)} className="px-2.5 py-1.5 text-xs rounded-md border outline-none" style={inputStyle()}>
            <option value="">{t('common.all', language)}</option>
            {brands.map(brand => <option key={brand} value={brand}>{brand}</option>)}
          </select>
        </div>

        {loading ? (
          viewMode === 'grid' ? <CardGridSkeleton count={6} cols={3} /> : <ListSkeleton count={5} />
        ) : filteredRolls.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border border-dashed" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
            <Film size={32} className="mb-2 opacity-40" />
            <p className="text-sm mb-4">{searchQuery || filterBrand ? t('admin.no_film_rolls_match_filters', language) : t('admin.no_film_rolls', language)}</p>
            {!searchQuery && !filterBrand && (
              <button onClick={handleCreateRoll} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border" style={{ borderColor: 'var(--border)' }}>
                <Plus size={14} /> {t('admin.create_first_film_roll', language)}
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredRolls.map(roll => (
              <FilmRollCard key={roll.id} roll={roll} onClick={() => void openRoll(roll)} onDelete={() => setPendingDelete(roll)} language={language} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRolls.map(roll => (
              <FilmRollListItem key={roll.id} roll={roll} onClick={() => void openRoll(roll)} onDelete={() => setPendingDelete(roll)} language={language} />
            ))}
          </div>
        )}
      </div>

      {pendingDelete && (
        <DeleteDialog roll={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={handleDelete} language={language} />
      )}
    </>
  )
}

function FilmRollCard({ roll, onClick, onDelete, language }: { roll: FilmRollDTO; onClick: () => void; onDelete: () => void; language: Locale }) {
  const display = getFilmStockDisplay(roll.brand, roll.name, currentFormat(roll), 4 / 3)
  const style = getFilmStockDisplayStyle(display)

  return (
    <button type="button" onClick={onClick} className="group overflow-hidden rounded-lg border text-left transition-opacity hover:opacity-90" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
      <div className="aspect-[4/3] relative overflow-hidden" style={{ backgroundColor: 'var(--muted)' }}>
        <div className="w-full h-full flex items-center justify-center p-6" style={{ backgroundColor: 'color-mix(in srgb, var(--muted) 50%, transparent)' }}>
          <img src={display.asset} alt="" className="max-h-full max-w-full object-contain opacity-90" style={style} />
        </div>
        <span className="absolute top-2 right-2 rounded bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">{roll.photoCount ?? 0}</span>
        <span role="button" tabIndex={0} onClick={event => { event.stopPropagation(); onDelete() }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onDelete() } }} className="absolute bottom-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: 'white' }}>
          <Trash2 size={12} />
        </span>
      </div>
      <div className="p-3">
        <h3 className="text-sm font-medium truncate">{roll.name}</h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{roll.brand} · {currentFormat(roll)} · ISO {roll.iso} · {roll.frameCount} {t('admin.film_roll_frames', language)}</p>
        {roll.shootDate && <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>{new Date(roll.shootDate).toLocaleDateString()}</p>}
      </div>
    </button>
  )
}

function FilmRollListItem({ roll, onClick, onDelete, language }: { roll: FilmRollDTO; onClick: () => void; onDelete: () => void; language: Locale }) {
  const display = getFilmStockDisplay(roll.brand, roll.name, currentFormat(roll), 20 / 14)
  const style = getFilmStockDisplayStyle(display)

  return (
    <button type="button" onClick={onClick} className="flex items-center gap-4 px-4 py-3 rounded-lg border text-left w-full transition-opacity hover:opacity-90" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
      <div className="w-20 h-14 flex-shrink-0 flex items-center justify-center p-1.5" style={{ backgroundColor: 'color-mix(in srgb, var(--muted) 40%, transparent)' }}>
        <img src={display.asset} alt="" className="max-h-full max-w-full object-contain" style={style} />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium truncate">{roll.name}</h3>
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{roll.brand} · ISO {roll.iso} · {roll.photoCount ?? 0}/{roll.frameCount} {t('admin.film_roll_frames', language)}</p>
      </div>
      <span className="hidden sm:block text-xs" style={{ color: 'var(--muted-foreground)' }}>{roll.shootDate ? new Date(roll.shootDate).toLocaleDateString() : ''}</span>
      <span role="button" tabIndex={0} onClick={event => { event.stopPropagation(); onDelete() }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onDelete() } }} className="p-1 rounded" style={{ color: 'var(--destructive)' }}>
        <Trash2 size={14} />
      </span>
    </button>
  )
}
function OverviewTab({ roll, onChange, language }: { roll: FilmRollDTO; onChange: (roll: FilmRollDTO) => void; language: Locale }) {
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="画幅">
          <select value={format} onChange={event => handleFormatChange(event.target.value as FilmFormat)} className="w-full px-2.5 py-1.5 text-xs rounded-lg border outline-none" style={inputStyle()}>
            {FORMAT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
        <Field label={t('admin.film_roll_brand', language)}>
          <select value={roll.brand} onChange={event => handleBrandChange(event.target.value)} className="w-full px-2.5 py-1.5 text-xs rounded-lg border outline-none" style={inputStyle()}>
            {BRAND_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
        <Field label={t('admin.film_roll_name', language)}>
          {nameOptions.length > 0 ? (
            <select value={roll.name} onChange={event => handleNameChange(event.target.value)} className="w-full px-2.5 py-1.5 text-xs rounded-lg border outline-none" style={inputStyle()}>
              {nameOptions.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          ) : (
            <input value={roll.name} onChange={event => update({ name: event.target.value })} className="w-full px-2.5 py-1.5 text-xs rounded-lg border outline-none" style={inputStyle()} />
          )}
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label={t('admin.film_roll_iso', language)}>
          <input type="number" min={1} value={roll.iso} onChange={event => update({ iso: Number(event.target.value) || 1 })} className="w-full px-2.5 py-1.5 text-xs rounded-lg border outline-none" style={inputStyle()} />
        </Field>
        <Field label={t('admin.film_roll_frame_count', language)}>
          <input type="number" min={1} value={roll.frameCount} onChange={event => update({ frameCount: Number(event.target.value) || 1 })} className="w-full px-2.5 py-1.5 text-xs rounded-lg border outline-none" style={inputStyle()} />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label={t('admin.film_roll_shoot_date', language)}>
          <input type="date" value={dateInputValue(roll.shootDate)} onChange={event => update({ shootDate: isoFromDateInput(event.target.value) })} className="w-full px-2.5 py-1.5 text-xs rounded-lg border outline-none" style={inputStyle()} />
        </Field>
        <Field label={t('admin.film_roll_end_date', language)}>
          <input type="date" value={dateInputValue(roll.endDate)} onChange={event => update({ endDate: isoFromDateInput(event.target.value) })} className="w-full px-2.5 py-1.5 text-xs rounded-lg border outline-none" style={inputStyle()} />
        </Field>
      </div>
      <Field label={t('admin.film_roll_notes', language)}>
        <textarea value={roll.notes ?? ''} onChange={event => update({ notes: event.target.value })} rows={4} className="w-full px-2.5 py-2 text-xs rounded-lg border outline-none resize-none" style={inputStyle()} />
      </Field>
    </div>
  )
}

function PhotosTab({ roll, saving, onRemovePhoto, onReorderFrames, onShowSelector, language }: {
  roll: FilmRollDTO
  saving: boolean
  onRemovePhoto: (photoId: string) => void
  onReorderFrames: () => void
  onShowSelector: () => void
  language: Locale
}) {
  const filmPhotos = roll.filmPhotos ?? []
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{filmPhotos.length} / {roll.frameCount} {t('admin.film_roll_frames', language)}</span>
        <div className="flex items-center gap-2">
          <button onClick={onReorderFrames} disabled={saving || filmPhotos.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border disabled:opacity-50" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
            <RefreshCw size={12} /> {t('admin.reorder_frames', language)}
          </button>
          <button onClick={onShowSelector} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            <Plus size={14} /> {t('admin.add_photos', language)}
          </button>
        </div>
      </div>
      {filmPhotos.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {filmPhotos.map(item => (
            <div key={item.id} className="relative group rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--muted)' }}>
              <div className="aspect-square">
                {item.photo?.thumbnailUrl || item.photo?.url ? (
                  <img src={resolveAssetUrl(item.photo.thumbnailUrl || item.photo.url)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><ImageIcon size={24} style={{ color: 'var(--muted-foreground)' }} /></div>
                )}
              </div>
              <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/70 to-transparent"><span className="text-[10px] text-white">#{item.frameNumber}</span></div>
              <button onClick={() => onRemovePhoto(item.photoId)} className="absolute top-1.5 right-1.5 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: 'white' }}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 border border-dashed rounded-lg" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
          <ImageIcon size={32} className="mb-2 opacity-40" />
          <p className="text-sm">{t('admin.no_photos', language)}</p>
        </div>
      )}
    </div>
  )
}

function PhotoSelector({ photos, selectedIds, search, typeFilter, saving, onSearchChange, onTypeFilterChange, onToggle, onConfirm, onClose, language }: {
  photos: PhotoDTO[]
  selectedIds: Set<string>
  search: string
  typeFilter: PhotoTypeFilter
  saving: boolean
  onSearchChange: (value: string) => void
  onTypeFilterChange: (value: PhotoTypeFilter) => void
  onToggle: (id: string) => void
  onConfirm: () => void
  onClose: () => void
  language: Locale
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={onClose} className="p-1.5 rounded-md border" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}><X size={14} /></button>
          <span className="text-sm">{selectedIds.size} {t('admin.selected', language)}</span>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
            <input value={search} onChange={event => onSearchChange(event.target.value)} placeholder={t('common.search', language)} className="w-44 pl-8 pr-3 py-1.5 text-xs rounded-md border outline-none" style={inputStyle()} />
          </div>
          <select value={typeFilter} onChange={event => onTypeFilterChange(event.target.value as PhotoTypeFilter)} className="px-2.5 py-1.5 text-xs rounded-md border outline-none" style={inputStyle()}>
            <option value="all">{t('common.all', language)}</option>
            <option value="digital">{t('admin.upload_type_digital', language)}</option>
            <option value="film">{t('admin.upload_type_film', language)}</option>
          </select>
        </div>
        <button onClick={onConfirm} disabled={saving || selectedIds.size === 0} className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md disabled:opacity-50" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
          {t('admin.confirm_add', language)} ({selectedIds.size})
        </button>
      </div>
      {photos.length === 0 ? (
        <div className="flex items-center justify-center h-48 border border-dashed rounded-lg" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}><p className="text-sm">{t('admin.no_photos', language)}</p></div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-5 xl:grid-cols-6 gap-2">
          {photos.map(photo => (
            <button key={photo.id} onClick={() => onToggle(photo.id)} className="relative aspect-square rounded-md overflow-hidden border-2 transition-all" style={{ borderColor: selectedIds.has(photo.id) ? 'var(--primary)' : 'transparent', backgroundColor: 'var(--muted)' }}>
              {photo.thumbnailUrl || photo.url ? <img src={resolveAssetUrl(photo.thumbnailUrl || photo.url)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={16} style={{ color: 'var(--muted-foreground)' }} /></div>}
              {selectedIds.has(photo.id) && <div className="absolute inset-0 flex items-center justify-center bg-black/30"><Check size={20} className="text-white" /></div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DeleteDialog({ roll, onCancel, onConfirm, language }: { roll: FilmRollDTO; onCancel: () => void; onConfirm: () => void; language: Locale }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="rounded-lg border p-6 max-w-sm w-full mx-4" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
        <h3 className="text-sm font-medium mb-2">{t('common.confirm', language)}</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--muted-foreground)' }}>{t('admin.film_roll_delete_confirm', language)}: {roll.name}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-md" style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>{t('common.cancel', language)}</button>
          <button onClick={onConfirm} className="px-3 py-1.5 text-xs rounded-md" style={{ backgroundColor: 'var(--destructive)', color: 'var(--destructive-foreground)' }}>{t('common.delete', language)}</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      {children}
    </label>
  )
}