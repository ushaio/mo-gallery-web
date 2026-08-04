'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Check,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react'
import {
  addPhotosToFilmRoll,
  ApiUnauthorizedError,
  createFilmRoll,
  deleteFilmRoll,
  getFilmRoll,
  getFilmRolls,
  removePhotoFromFilmRoll,
  reorderFilmRollFrames,
  resolveAssetUrl,
  updateFilmRoll,
} from '@/lib/api'
import type { FilmRollDto, PhotoDto } from '@/lib/api/types'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminSelect } from '@/components/admin/AdminFormControls'
import { CustomInput } from '@/components/ui/CustomInput'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import {
  FILM_FORMATS,
  FILM_STOCK_BRANDS,
  FILM_STOCK_PRESETS,
  getFilmStockDisplay,
  getFilmStockDisplayStyle,
  getFilmStockNames,
  type FilmFormat,
} from '@/lib/film-presets'

interface LibraryFilmRollWorkspaceProps {
  token: string | null
  photos: PhotoDto[]
  cdnDomain?: string
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  onUnauthorized: () => void
  onPreview: (photo: PhotoDto) => void
  onPhotosChanged: () => Promise<void>
  createSignal?: number
}

type DetailTab = 'overview' | 'photos'
type ListView = 'list' | 'grid'
type PhotoFilter = 'all' | 'digital' | 'film'

const VIEW_STORAGE_KEY = 'admin-resource-library-film-roll-list-view'
const SORT_STORAGE_KEY = 'admin-resource-library-film-roll-sort'

function formatFor(roll: FilmRollDto | null): FilmFormat {
  return roll?.format === '120' ? '120' : '135'
}

function newDraftRoll(): FilmRollDto {
  const preset = FILM_STOCK_PRESETS[0]
  const now = new Date().toISOString()
  return {
    id: '', name: preset.name, brand: preset.brand, format: preset.format, iso: preset.iso, frameCount: preset.frameCount,
    notes: null, shootDate: null, endDate: null, createdAt: now, updatedAt: now, photoCount: 0, filmPhotos: [],
  }
}

function readPreference<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  try {
    const value = window.localStorage.getItem(key) as T | null
    return value && allowed.includes(value) ? value : fallback
  } catch {
    return fallback
  }
}

export function LibraryFilmRollWorkspace({
  token,
  photos,
  cdnDomain,
  t,
  notify,
  onUnauthorized,
  onPreview,
  onPhotosChanged,
  createSignal = 0,
}: LibraryFilmRollWorkspaceProps) {
  const [rolls, setRolls] = useState<FilmRollDto[]>([])
  const [loading, setLoading] = useState(true)
  const [currentRoll, setCurrentRoll] = useState<FilmRollDto | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<DetailTab>('photos')
  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [listView, setListView] = useState<ListView>('list')
  const [sort, setSort] = useState<'created-desc' | 'created-asc' | 'shoot-desc' | 'shoot-asc'>('created-desc')
  const [showPhotoPicker, setShowPhotoPicker] = useState(false)
  const [photoSearch, setPhotoSearch] = useState('')
  const [photoFilter, setPhotoFilter] = useState<PhotoFilter>('film')
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<FilmRollDto | null>(null)
  const requestIdRef = useRef(0)
  const handledCreateSignalRef = useRef(0)
  const autoSelectRef = useRef(false)

  useEffect(() => {
    setListView(readPreference<ListView>(VIEW_STORAGE_KEY, 'list', ['list', 'grid']))
    setSort(readPreference<typeof sort>(SORT_STORAGE_KEY, 'created-desc', ['created-desc', 'created-asc', 'shoot-desc', 'shoot-asc']))
  }, [])
  useEffect(() => { window.localStorage.setItem(VIEW_STORAGE_KEY, listView) }, [listView])
  useEffect(() => { window.localStorage.setItem(SORT_STORAGE_KEY, sort) }, [sort])

  const loadRolls = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      setRolls(await getFilmRolls())
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) onUnauthorized()
      else notify(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      setLoading(false)
    }
  }, [notify, onUnauthorized, t, token])

  useEffect(() => { void loadRolls() }, [loadRolls])

  useEffect(() => {
    if (!createSignal || handledCreateSignalRef.current === createSignal) return
    handledCreateSignalRef.current = createSignal
    autoSelectRef.current = true
    requestIdRef.current += 1
    setCurrentRoll(newDraftRoll())
    setActiveTab('overview')
    setShowPhotoPicker(false)
    setSelectedPhotoIds(new Set())
  }, [createSignal])

  const brands = useMemo(() => Array.from(new Set(rolls.map((roll) => roll.brand))).sort(), [rolls])
  const visibleRolls = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = rolls.filter((roll) => {
      return (!brandFilter || roll.brand === brandFilter) && (!query || roll.name.toLowerCase().includes(query) || roll.brand.toLowerCase().includes(query))
    })
    return filtered.toSorted((left, right) => {
      const direction = sort.endsWith('asc') ? 1 : -1
      const leftValue = sort.startsWith('shoot') ? left.shootDate : left.createdAt
      const rightValue = sort.startsWith('shoot') ? right.shootDate : right.createdAt
      return (new Date(leftValue || 0).getTime() - new Date(rightValue || 0).getTime()) * direction
    })
  }, [brandFilter, rolls, search, sort])

  useEffect(() => {
    if (autoSelectRef.current || loading || currentRoll || visibleRolls.length === 0) return
    autoSelectRef.current = true
    void openRoll(visibleRolls[0])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, visibleRolls, currentRoll])

  const openRoll = async (roll: FilmRollDto, tab: DetailTab = 'photos') => {
    const requestId = ++requestIdRef.current
    setCurrentRoll({ ...roll, filmPhotos: roll.filmPhotos ?? [] })
    setActiveTab(tab)
    setLoadingDetail(true)
    setShowPhotoPicker(false)
    setSelectedPhotoIds(new Set())
    setPhotoSearch('')
    try {
      const full = await getFilmRoll(roll.id)
      if (requestId !== requestIdRef.current) return
      setCurrentRoll({ ...full, filmPhotos: full.filmPhotos ?? [] })
      setRolls((current) => current.map((item) => item.id === full.id ? full : item))
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) onUnauthorized()
      else notify(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      if (requestId === requestIdRef.current) setLoadingDetail(false)
    }
  }

  const currentFormat = formatFor(currentRoll)
  const nameOptions = useMemo(() => currentRoll ? getFilmStockNames(currentRoll.brand, currentFormat).map((name) => ({ value: name, label: name })) : [], [currentFormat, currentRoll])
  const rollPhotos = useMemo(() => currentRoll?.filmPhotos?.map((item) => item.photo).filter((photo): photo is PhotoDto => Boolean(photo)) ?? [], [currentRoll?.filmPhotos])
  const availablePhotos = useMemo(() => {
    const used = new Set(currentRoll?.filmPhotos?.map((item) => item.photoId) ?? [])
    const query = photoSearch.trim().toLowerCase()
    return photos.filter((photo) => {
      if (used.has(photo.id) || (photo.filmRollId && photo.filmRollId !== currentRoll?.id)) return false
      const type = photo.photoType ?? (photo.filmRollId ? 'film' : 'digital')
      return (photoFilter === 'all' || type === photoFilter) && (!query || photo.title.toLowerCase().includes(query) || photo.category.toLowerCase().includes(query))
    })
  }, [currentRoll?.filmPhotos, currentRoll?.id, photoFilter, photoSearch, photos])

  const updateDraft = (patch: Partial<FilmRollDto>) => setCurrentRoll((current) => current ? { ...current, ...patch } : current)
  const applyPreset = (brand: string, name: string, format: FilmFormat) => {
    const preset = FILM_STOCK_PRESETS.find((item) => item.brand === brand && item.name === name && item.format === format)
    updateDraft({ brand, name, format, iso: preset?.iso ?? currentRoll?.iso ?? 0, frameCount: preset?.frameCount ?? currentRoll?.frameCount ?? 0 })
  }

  const saveRoll = async () => {
    if (!token || !currentRoll) return
    if (!currentRoll.name.trim() || !currentRoll.brand.trim()) {
      notify(!currentRoll.name.trim() ? t('admin.film_roll_name_required') : t('admin.film_roll_brand_required'), 'error')
      return
    }
    setSaving(true)
    try {
      const data = { name: currentRoll.name.trim(), brand: currentRoll.brand.trim(), format: currentFormat, iso: currentRoll.iso, frameCount: currentRoll.frameCount, notes: currentRoll.notes?.trim() || null, shootDate: currentRoll.shootDate || null, endDate: currentRoll.endDate || null }
      const saved = currentRoll.id ? await updateFilmRoll(token, currentRoll.id, data) : await createFilmRoll(token, data)
      const full = await getFilmRoll(saved.id)
      setCurrentRoll({ ...full, filmPhotos: full.filmPhotos ?? [] })
      setRolls((current) => current.some((item) => item.id === full.id) ? current.map((item) => item.id === full.id ? full : item) : [...current, full])
      setActiveTab('photos')
      notify(t(currentRoll.id ? 'admin.film_roll_updated' : 'admin.film_roll_created'), 'success')
      await onPhotosChanged()
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) onUnauthorized()
      else notify(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const addSelectedPhotos = async () => {
    if (!token || !currentRoll?.id || selectedPhotoIds.size === 0) return
    setSaving(true)
    try {
      const updated = await addPhotosToFilmRoll(token, currentRoll.id, Array.from(selectedPhotoIds))
      setCurrentRoll(updated)
      setRolls((current) => current.map((item) => item.id === updated.id ? updated : item))
      setSelectedPhotoIds(new Set())
      setShowPhotoPicker(false)
      setPhotoSearch('')
      notify(t('admin.photos_added'), 'success')
      await onPhotosChanged()
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) onUnauthorized()
      else notify(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const removePhoto = async (photoId: string) => {
    if (!token || !currentRoll?.id) return
    try {
      const updated = await removePhotoFromFilmRoll(token, currentRoll.id, photoId)
      setCurrentRoll(updated)
      setRolls((current) => current.map((item) => item.id === updated.id ? updated : item))
      notify(t('admin.photo_removed'), 'success')
      await onPhotosChanged()
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) onUnauthorized()
      else notify(error instanceof Error ? error.message : t('common.error'), 'error')
    }
  }

  const reorderFrames = async () => {
    if (!token || !currentRoll?.id) return
    setSaving(true)
    try {
      const updated = await reorderFilmRollFrames(token, currentRoll.id)
      setCurrentRoll(updated)
      notify(t('admin.film_roll_frames_reordered'), 'success')
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) onUnauthorized()
      else notify(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!token || !pendingDelete) return
    if ((pendingDelete.photoCount ?? pendingDelete.filmPhotos?.length ?? 0) > 0) {
      notify(t('admin.film_roll_delete_not_empty'), 'error')
      setPendingDelete(null)
      return
    }
    try {
      await deleteFilmRoll(token, pendingDelete.id)
      setRolls((current) => current.filter((roll) => roll.id !== pendingDelete.id))
      if (currentRoll?.id === pendingDelete.id) setCurrentRoll(null)
      setPendingDelete(null)
      notify(t('common.deleted'), 'success')
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) onUnauthorized()
      else notify(error instanceof Error ? error.message : t('common.error'), 'error')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="relative min-w-[180px] max-w-sm flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('common.search')} className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-8 text-sm outline-none focus:border-primary" />{search && <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-4 w-4" /></button>}</div>
        <AdminSelect value={brandFilter} onChange={setBrandFilter} options={[{ value: '', label: t('common.all') }, ...brands.map((brand) => ({ value: brand, label: brand }))]} className="min-w-28" />
        <AdminSelect value={sort} onChange={(value) => setSort(value as typeof sort)} options={[{ value: 'created-desc', label: t('admin.film_roll_sort_created_desc') }, { value: 'created-asc', label: t('admin.film_roll_sort_created_asc') }, { value: 'shoot-desc', label: t('admin.film_roll_sort_shoot_desc') }, { value: 'shoot-asc', label: t('admin.film_roll_sort_shoot_asc') }]} className="min-w-36" />
        <div className="flex overflow-hidden rounded-md border border-border"><AdminButton onClick={() => setListView('list')} adminVariant="unstyled" className={`p-2 ${listView === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`} title={t('admin.list_view')}><List className="h-4 w-4" /></AdminButton><AdminButton onClick={() => setListView('grid')} adminVariant="unstyled" className={`p-2 ${listView === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`} title={t('admin.grid_view')}><LayoutGrid className="h-4 w-4" /></AdminButton></div>
        <AdminButton onClick={() => void loadRolls()} disabled={loading} adminVariant="icon" size="sm" className="p-2" title={t('common.refresh')}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</AdminButton>
        <AdminButton onClick={() => { autoSelectRef.current = true; setCurrentRoll(newDraftRoll()); setActiveTab('overview'); setShowPhotoPicker(false) }} adminVariant="primary" size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" />{t('admin.new_film_roll')}</AdminButton>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-[310px] shrink-0 flex-col overflow-hidden border-r border-border bg-background">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3"><span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t('admin.film_rolls')}</span><span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{visibleRolls.length}</span></div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? <RollListSkeleton /> : visibleRolls.length === 0 ? <WorkspaceEmpty icon={Film} label={rolls.length ? t('admin.no_film_rolls_match_filters') : t('admin.no_film_rolls')} actionLabel={t('admin.new_film_roll')} onAction={() => { autoSelectRef.current = true; setCurrentRoll(newDraftRoll()); setActiveTab('overview') }} /> : listView === 'grid' ? <div className="grid grid-cols-2 gap-2">{visibleRolls.map((roll) => <RollGridCard key={roll.id} roll={roll} selected={currentRoll?.id === roll.id} onClick={() => void openRoll(roll)} />)}</div> : <div className="space-y-1">{visibleRolls.map((roll) => <RollRow key={roll.id} roll={roll} selected={currentRoll?.id === roll.id} onClick={() => void openRoll(roll)} />)}</div>}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {!currentRoll ? <WorkspaceEmpty icon={Film} label={t('admin.film_roll_select_hint')} actionLabel={t('admin.new_film_roll')} onAction={() => { autoSelectRef.current = true; setCurrentRoll(newDraftRoll()); setActiveTab('overview') }} /> : <>
            <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-5"><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{currentRoll.name || t('admin.new_film_roll')}</h2><p className="truncate text-[11px] text-muted-foreground">{currentRoll.brand} · {currentFormat} · ISO {currentRoll.iso} · {rollPhotos.length}/{currentRoll.frameCount}</p></div><div className="flex shrink-0 items-center gap-2">{currentRoll.id && <AdminButton onClick={() => setPendingDelete(currentRoll)} adminVariant="iconDestructive" size="sm" className="p-2" title={t('admin.delete_film_roll')}><Trash2 className="h-3.5 w-3.5" /></AdminButton>}{activeTab === 'overview' ? <AdminButton onClick={() => void saveRoll()} disabled={saving} adminVariant="primary" size="sm" className="gap-1.5"><Save className="h-3.5 w-3.5" />{saving ? t('common.loading') : t('common.save')}</AdminButton> : currentRoll.id ? <><AdminButton onClick={() => void reorderFrames()} disabled={saving || rollPhotos.length === 0} adminVariant="outline" size="sm" className="gap-1.5"><RefreshCw className={`h-3.5 w-3.5 ${saving ? 'animate-spin' : ''}`} />{t('admin.reorder_frames')}</AdminButton><AdminButton onClick={() => setShowPhotoPicker(true)} adminVariant="primary" size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" />{t('admin.add_photos')}</AdminButton></> : null}</div></header>
            <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-3"><DetailTabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={Settings} label={t('admin.overview')} /><DetailTabButton active={activeTab === 'photos'} onClick={() => setActiveTab('photos')} icon={ImageIcon} label={`${t('admin.photos')} (${rollPhotos.length})`} /></div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">{activeTab === 'overview' ? <RollOverview roll={currentRoll} format={currentFormat} nameOptions={nameOptions} t={t} onChange={updateDraft} onFormatChange={(format) => { const name = getFilmStockNames(currentRoll.brand, format)[0] ?? currentRoll.name; applyPreset(currentRoll.brand, name, format) }} onBrandChange={(brand) => { const name = getFilmStockNames(brand, currentFormat)[0] ?? currentRoll.name; applyPreset(brand, name, currentFormat) }} onNameChange={(name) => applyPreset(currentRoll.brand, name, currentFormat)} /> : loadingDetail ? <Loading /> : showPhotoPicker ? <RollPhotoPicker photos={availablePhotos} selectedIds={selectedPhotoIds} search={photoSearch} typeFilter={photoFilter} saving={saving} t={t} cdnDomain={cdnDomain} onSearchChange={setPhotoSearch} onTypeChange={setPhotoFilter} onToggle={(id) => setSelectedPhotoIds((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next })} onConfirm={() => void addSelectedPhotos()} onClose={() => { setShowPhotoPicker(false); setSelectedPhotoIds(new Set()); setPhotoSearch('') }} /> : rollPhotos.length === 0 ? <WorkspaceEmpty icon={ImageIcon} label={t('admin.album_empty')} actionLabel={t('admin.add_photos')} onAction={() => setShowPhotoPicker(true)} /> : <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-8">{rollPhotos.map((photo, index) => <div key={photo.id} className="group relative aspect-square cursor-pointer overflow-hidden bg-muted" onClick={() => onPreview(photo)}><img src={resolveAssetUrl(photo.thumbnailUrl || photo.url, cdnDomain)} alt={photo.title} className="h-full w-full object-cover" /><span className="absolute left-1 top-1 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[9px] text-white">#{index + 1}</span><div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"><AdminButton onClick={(event) => { event.stopPropagation(); void removePhoto(photo.id) }} adminVariant="iconOnDarkDanger" size="xs" title={t('admin.remove')}><Trash2 className="h-3.5 w-3.5" /></AdminButton></div></div>)}</div>}</div>
          </>}
        </section>
      </div>
      <footer className="flex h-10 shrink-0 items-center gap-2 border-t border-border px-4 text-[11px] text-muted-foreground"><span>{visibleRolls.length} {t('admin.film_rolls')}</span><span>·</span><span>{visibleRolls.reduce((sum, roll) => sum + (roll.photoCount ?? roll.filmPhotos?.length ?? 0), 0)} {t('admin.film_roll_frames')}</span></footer>
      <SimpleDeleteDialog isOpen={pendingDelete !== null} title={t('admin.delete_film_roll')} message={pendingDelete?.name || ''} onConfirm={confirmDelete} onCancel={() => setPendingDelete(null)} t={t} />
    </div>
  )
}

function RollRow({ roll, selected, onClick }: { roll: FilmRollDto; selected: boolean; onClick: () => void }) { const display = getFilmStockDisplay(roll.brand, roll.name, formatFor(roll), 14 / 10); const count = roll.photoCount ?? roll.filmPhotos?.length ?? 0; const percent = roll.frameCount ? Math.min(100, Math.round(count / roll.frameCount * 100)) : 0; return <button type="button" onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left ${selected ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted'}`}><span className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted"><img src={display.asset} alt="" className="max-h-full max-w-full object-contain" style={getFilmStockDisplayStyle(display)} /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{roll.name}</span><span className="mt-0.5 block truncate text-[10px]">{roll.brand} · {formatFor(roll)} · ISO {roll.iso}</span><span className="mt-1 flex items-center gap-1.5"><span className="h-1 min-w-0 flex-1 overflow-hidden rounded bg-muted"><span className="block h-full bg-primary" style={{ width: `${percent}%` }} /></span><span className="text-[9px] tabular-nums">{count}/{roll.frameCount}</span></span></span></button> }
function RollGridCard({ roll, selected, onClick }: { roll: FilmRollDto; selected: boolean; onClick: () => void }) { const display = getFilmStockDisplay(roll.brand, roll.name, formatFor(roll), 4 / 3); return <button type="button" onClick={onClick} className={`min-w-0 rounded-md border p-1 text-left ${selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}><span className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded bg-muted"><img src={display.asset} alt="" className="max-h-full max-w-full object-contain p-2" style={getFilmStockDisplayStyle(display)} /></span><span className="block truncate px-1 pt-1.5 text-[11px] font-medium">{roll.name}</span><span className="block truncate px-1 pb-1 text-[9px] text-muted-foreground">{roll.brand} · ISO {roll.iso}</span></button> }
function DetailTabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Settings; label: string }) { return <button type="button" onClick={onClick} className={`flex h-full items-center gap-1.5 border-b-2 px-3 text-xs font-medium ${active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><Icon className="h-3.5 w-3.5" />{label}</button> }
function WorkspaceEmpty({ icon: Icon, label, actionLabel, onAction }: { icon: typeof Film; label: string; actionLabel: string; onAction: () => void }) { return <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground"><Icon className="h-8 w-8" /><p className="text-sm">{label}</p><AdminButton onClick={onAction} adminVariant="outline" size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" />{actionLabel}</AdminButton></div> }
function RollListSkeleton() { return <div className="space-y-2">{Array.from({ length: 7 }, (_, index) => <div key={index} className="h-14 animate-pulse rounded-md bg-muted" />)}</div> }
function Loading() { return <div className="flex h-full min-h-48 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> }
function RollOverview({ roll, format, nameOptions, t, onChange, onFormatChange, onBrandChange, onNameChange }: { roll: FilmRollDto; format: FilmFormat; nameOptions: { value: string; label: string }[]; t: (key: string) => string; onChange: (patch: Partial<FilmRollDto>) => void; onFormatChange: (format: FilmFormat) => void; onBrandChange: (brand: string) => void; onNameChange: (name: string) => void }) { return <div className="max-w-2xl space-y-5"><div className="grid gap-4 sm:grid-cols-3"><Field label={t('admin.film_roll_format')}><AdminSelect value={format} onChange={(value) => onFormatChange(value as FilmFormat)} options={FILM_FORMATS.map((value) => ({ value, label: value }))} /></Field><Field label={t('admin.film_roll_brand')}><AdminSelect value={roll.brand} onChange={onBrandChange} options={FILM_STOCK_BRANDS.map((value) => ({ value, label: value }))} /></Field><Field label={t('admin.film_roll_name')}><AdminSelect value={roll.name} onChange={onNameChange} options={nameOptions} /></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label={t('admin.film_roll_iso')}><CustomInput variant="config" type="number" value={String(roll.iso)} onChange={(event) => onChange({ iso: Number(event.target.value) || 0 })} /></Field><Field label={t('admin.film_roll_frame_count')}><CustomInput variant="config" type="number" value={String(roll.frameCount)} onChange={(event) => onChange({ frameCount: Number(event.target.value) || 0 })} /></Field><Field label={t('admin.film_roll_shoot_date')}><CustomInput variant="config" type="date" value={roll.shootDate?.slice(0, 10) || ''} onChange={(event) => onChange({ shootDate: event.target.value ? new Date(event.target.value).toISOString() : null })} /></Field><Field label={t('admin.film_roll_end_date')}><CustomInput variant="config" type="date" value={roll.endDate?.slice(0, 10) || ''} onChange={(event) => onChange({ endDate: event.target.value ? new Date(event.target.value).toISOString() : null })} /></Field></div><Field label={t('admin.film_roll_notes')}><textarea value={roll.notes || ''} onChange={(event) => onChange({ notes: event.target.value })} className="h-28 w-full resize-none border border-border bg-background p-3 text-sm outline-none focus:border-primary" /></Field></div> }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-2 block text-xs text-muted-foreground">{label}</span>{children}</label> }
function RollPhotoPicker({ photos, selectedIds, search, typeFilter, saving, t, cdnDomain, onSearchChange, onTypeChange, onToggle, onConfirm, onClose }: { photos: PhotoDto[]; selectedIds: Set<string>; search: string; typeFilter: PhotoFilter; saving: boolean; t: (key: string) => string; cdnDomain?: string; onSearchChange: (value: string) => void; onTypeChange: (value: PhotoFilter) => void; onToggle: (id: string) => void; onConfirm: () => void; onClose: () => void }) { return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-muted/30 p-3"><div className="flex flex-wrap items-center gap-3"><AdminButton onClick={onClose} adminVariant="icon" size="xs" className="p-1.5"><X className="h-4 w-4" /></AdminButton><span className="text-sm">{selectedIds.size} {t('admin.selected')}</span><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={t('common.search')} className="h-8 w-40 border border-border bg-background px-2 text-sm outline-none focus:border-primary" /><AdminSelect value={typeFilter} onChange={(value) => onTypeChange(value as PhotoFilter)} options={[{ value: 'all', label: t('common.all') }, { value: 'digital', label: t('admin.upload_type_digital') }, { value: 'film', label: t('admin.upload_type_film') }]} className="min-w-28" /></div><AdminButton onClick={onConfirm} disabled={selectedIds.size === 0 || saving} adminVariant="primary" size="sm" className="gap-1.5"><Check className="h-3.5 w-3.5" />{t('admin.add')}</AdminButton></div>{photos.length === 0 ? <WorkspaceEmpty icon={ImageIcon} label={t('admin.no_photos_available')} actionLabel={t('common.close')} onAction={onClose} /> : <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-8">{photos.map((photo) => <button key={photo.id} type="button" onClick={() => onToggle(photo.id)} className={`relative aspect-square overflow-hidden ${selectedIds.has(photo.id) ? 'ring-2 ring-primary' : ''}`}><img src={resolveAssetUrl(photo.thumbnailUrl || photo.url, cdnDomain)} alt={photo.title} className="h-full w-full object-cover" />{selectedIds.has(photo.id) && <span className="absolute inset-0 flex items-center justify-center bg-primary/20"><Check className="h-5 w-5 text-primary" /></span>}</button>)}</div>}</div> }
