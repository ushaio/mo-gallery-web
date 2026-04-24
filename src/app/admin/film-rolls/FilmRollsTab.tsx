'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Film,
  Plus,
  Trash2,
  ChevronLeft,
  Save,
  Image as ImageIcon,
  X,
  Check,
  Settings,
  LayoutGrid,
  List,
  Filter,
  Layout,
  RefreshCw,
} from 'lucide-react'
import {
  getFilmRolls,
  getFilmRoll,
  createFilmRoll,
  updateFilmRoll,
  deleteFilmRoll,
  addPhotosToFilmRoll,
  reorderFilmRollFrames,
  removePhotoFromFilmRoll,
  type FilmRollDto,
  type PhotoDto,
  ApiUnauthorizedError,
  resolveAssetUrl,
} from '@/lib/api'
import { CustomInput } from '@/components/ui/CustomInput'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminSelect } from '@/components/admin/AdminFormControls'
import { AdminLoading } from '@/components/admin/AdminLoading'
import { AdminCollectionToolbar } from '@/components/admin/AdminCollectionToolbar'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import {
  FILM_FORMATS,
  FILM_STOCK_BRANDS,
  FILM_STOCK_PRESETS,
  getFilmStockNames,
  getFilmStockAsset,
  type FilmFormat,
} from '@/lib/film-presets'

type ViewMode = 'grid' | 'list'
type PhotoTypeFilter = 'all' | 'digital' | 'film'

const FILM_STOCK_BRAND_OPTIONS = FILM_STOCK_BRANDS.map((brand) => ({
  value: brand,
  label: brand,
}))

const FILM_FORMAT_OPTIONS = FILM_FORMATS.map((format) => ({
  value: format,
  label: format,
}))

interface FilmRollsTabProps {
  token: string | null
  photos: PhotoDto[]
  cdnDomain: string
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  onUnauthorized: () => void
  onPreview: (photo: PhotoDto) => void
}

export function FilmRollsTab({
  token,
  photos,
  cdnDomain,
  t,
  notify,
  onUnauthorized,
  onPreview,
}: FilmRollsTabProps) {
  const [rolls, setRolls] = useState<FilmRollDto[]>([])
  const [loading, setLoading] = useState(true)
  const [currentRoll, setCurrentRoll] = useState<FilmRollDto | null>(null)
  const [loadingCurrentRoll, setLoadingCurrentRoll] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'photos'>('overview')
  const [saving, setSaving] = useState(false)
  const [showPhotoSelector, setShowPhotoSelector] = useState(false)
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set())
  const [deletingRollId, setDeletingRollId] = useState<string | null>(null)
  const [pendingRollDelete, setPendingRollDelete] = useState<FilmRollDto | null>(null)

  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filterBrand, setFilterBrand] = useState('')
  const [photoSelectorSearch, setPhotoSelectorSearch] = useState('')
  const [photoTypeFilter, setPhotoTypeFilter] = useState<PhotoTypeFilter>('film')
  const currentRollRequestIdRef = useRef(0)

  const brands = useMemo(() => {
    const set = new Set(rolls.map(r => r.brand))
    return Array.from(set).sort()
  }, [rolls])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filterBrand) count++
    return count
  }, [filterBrand])

  const filteredRolls = useMemo(() => {
    return rolls.filter(roll => {
      if (filterBrand && roll.brand !== filterBrand) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (!roll.name.toLowerCase().includes(q) && !roll.brand.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [rolls, filterBrand, searchQuery])

  const currentRollFormat = (currentRoll?.format ?? '135') as FilmFormat

  const currentNameOptions = useMemo(() => {
    if (!currentRoll?.brand) return []

    return getFilmStockNames(currentRoll.brand, currentRollFormat).map((name) => ({
      value: name,
      label: name,
    }))
  }, [currentRoll?.brand, currentRollFormat])

  const clearAllFilters = () => {
    setFilterBrand('')
    setSearchQuery('')
  }

  const loadRolls = useCallback(async () => {
    if (!token) return
    try {
      setLoading(true)
      setRolls(await getFilmRolls())
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) { onUnauthorized(); return }
      notify(t('common.error'), 'error')
    } finally {
      setLoading(false)
    }
  }, [notify, onUnauthorized, t, token])

  useEffect(() => { loadRolls() }, [loadRolls])

  function handleCreateRoll() {
    const defaultPreset = FILM_STOCK_PRESETS[0]

    currentRollRequestIdRef.current += 1
    setLoadingCurrentRoll(false)
    setCurrentRoll({
      id: '', name: defaultPreset.name, brand: defaultPreset.brand, format: defaultPreset.format, iso: defaultPreset.iso, frameCount: defaultPreset.frameCount,
      notes: null, shootDate: null, endDate: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      photoCount: 0, filmPhotos: [],
    })
    setActiveTab('overview')
  }

  function getPresetForStock(brand: string, name: string, format: FilmFormat) {
    return FILM_STOCK_PRESETS.find((item) => item.brand === brand && item.name === name && item.format === format)
  }

  function handleFilmBrandChange(brand: string) {
    if (!currentRoll) return
    const names = getFilmStockNames(brand, currentRollFormat)
    const name = names.includes(currentRoll.name) ? currentRoll.name : names[0] ?? currentRoll.name
    const preset = getPresetForStock(brand, name, currentRollFormat)

    setCurrentRoll({
      ...currentRoll,
      brand,
      name,
      iso: preset?.iso ?? currentRoll.iso,
      frameCount: preset?.frameCount ?? currentRoll.frameCount,
    })
  }

  function handleFilmFormatChange(format: string) {
    if (!currentRoll) return
    const nextFormat = format as FilmFormat
    const names = getFilmStockNames(currentRoll.brand, nextFormat)
    const name = names.includes(currentRoll.name) ? currentRoll.name : names[0] ?? currentRoll.name
    const preset = getPresetForStock(currentRoll.brand, name, nextFormat)
    setCurrentRoll({
      ...currentRoll,
      format: nextFormat,
      name,
      iso: preset?.iso ?? currentRoll.iso,
      frameCount: preset?.frameCount ?? currentRoll.frameCount,
    })
  }

  function handleFilmNameChange(name: string) {
    if (!currentRoll) return
    const preset = getPresetForStock(currentRoll.brand, name, currentRollFormat)

    setCurrentRoll({
      ...currentRoll,
      name,
      iso: preset?.iso ?? currentRoll.iso,
      frameCount: preset?.frameCount ?? currentRoll.frameCount,
    })
  }

  const openRollDetail = useCallback(async (roll: FilmRollDto) => {
    const requestId = currentRollRequestIdRef.current + 1
    currentRollRequestIdRef.current = requestId

    setCurrentRoll({ ...roll, filmPhotos: roll.filmPhotos ?? [] })
    setActiveTab('photos')
    setShowPhotoSelector(false)
    setSelectedPhotoIds(new Set())
    setPhotoSelectorSearch('')
    setPhotoTypeFilter('film')
    setLoadingCurrentRoll(true)

    try {
      const full = await getFilmRoll(roll.id)
      if (currentRollRequestIdRef.current !== requestId) return
      setCurrentRoll(full)
    } catch {
      if (currentRollRequestIdRef.current !== requestId) return
      setCurrentRoll(prev => prev?.id === roll.id ? { ...roll, filmPhotos: roll.filmPhotos ?? [] } : prev)
    } finally {
      if (currentRollRequestIdRef.current === requestId) {
        setLoadingCurrentRoll(false)
      }
    }
  }, [])

  function handleDeleteRoll(roll: FilmRollDto, e?: React.MouseEvent) {
    e?.stopPropagation()
    if (!token) return
    if ((roll.photoCount ?? roll.filmPhotos?.length ?? 0) > 0) {
      notify(t('admin.film_roll_delete_not_empty'), 'error')
      return
    }
    setPendingRollDelete(roll)
  }

  async function confirmDeleteRoll() {
    if (!token || !pendingRollDelete) return
    try {
      setDeletingRollId(pendingRollDelete.id)
      await deleteFilmRoll(token, pendingRollDelete.id)
      notify(t('admin.notify_success'), 'success')
      if (currentRoll?.id === pendingRollDelete.id) setCurrentRoll(null)
      setPendingRollDelete(null)
      await loadRolls()
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) { onUnauthorized(); return }
      notify(err instanceof Error ? err.message : t('common.error'), 'error')
    } finally {
      setDeletingRollId(null)
    }
  }

  async function handleSaveRoll() {
    if (!token || !currentRoll) return
    if (!currentRoll.name.trim()) {
      notify(t('admin.film_roll_name_required'), 'error')
      return
    }
    if (!currentRoll.brand.trim()) {
      notify(t('admin.film_roll_brand_required'), 'error')
      return
    }
    try {
      setSaving(true)
      const isNew = !currentRoll.id
      const data = {
        name: currentRoll.name,
        brand: currentRoll.brand,
        format: currentRollFormat,
        iso: currentRoll.iso,
        frameCount: currentRoll.frameCount,
        notes: currentRoll.notes || null,
        shootDate: currentRoll.shootDate || null,
        endDate: currentRoll.endDate || null,
      }
      const result = isNew
        ? await createFilmRoll(token, data)
        : await updateFilmRoll(token, currentRoll.id, data)
      notify(isNew ? t('admin.film_roll_created') : t('admin.film_roll_updated'), 'success')
      // Fetch full roll with photos if editing existing
      if (result.id && !isNew) {
        const full = await getFilmRoll(result.id)
        setCurrentRoll(full)
      } else {
        setCurrentRoll({ ...result, filmPhotos: result.filmPhotos ?? [] })
      }
      await loadRolls()
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) { onUnauthorized(); return }
      notify(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddPhotos() {
    if (!token || !currentRoll?.id || selectedPhotoIds.size === 0) return
    try {
      setSaving(true)
      const updated = await addPhotosToFilmRoll(token, currentRoll.id, Array.from(selectedPhotoIds))
      setCurrentRoll(updated)
      setRolls(prev => prev.map(r => r.id === updated.id ? { ...r, photoCount: updated.photoCount ?? updated.filmPhotos?.length ?? r.photoCount } : r))
      setShowPhotoSelector(false)
      setSelectedPhotoIds(new Set())
      setPhotoSelectorSearch('')
      setPhotoTypeFilter('film')
      notify(t('admin.photos_added'), 'success')
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) { onUnauthorized(); return }
      notify(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleReorderFrames() {
    if (!token || !currentRoll?.id) return
    try {
      setSaving(true)
      const updated = await reorderFilmRollFrames(token, currentRoll.id)
      setCurrentRoll(updated)
      notify(t('admin.film_roll_frames_reordered'), 'success')
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) { onUnauthorized(); return }
      notify(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemovePhoto(photoId: string) {
    if (!token || !currentRoll?.id) return
    try {
      const updated = await removePhotoFromFilmRoll(token, currentRoll.id, photoId)
      setCurrentRoll(updated)
      setRolls(prev => prev.map(r => r.id === updated.id ? { ...r, photoCount: updated.photoCount ?? updated.filmPhotos?.length ?? r.photoCount } : r))
      notify(t('admin.photo_removed'), 'success')
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) { onUnauthorized(); return }
      notify(t('common.error'), 'error')
    }
  }

  const rollPhotoIds = useMemo(() => {
    if (!currentRoll?.filmPhotos) return new Set<string>()
    return new Set(currentRoll.filmPhotos.map(fp => fp.photoId))
  }, [currentRoll])

  const availablePhotos = useMemo(() => {
    return photos.filter((photo) => {
      if (rollPhotoIds.has(photo.id)) return false
      if (photo.filmRollId && photo.filmRollId !== currentRoll?.id) return false
      return true
    })
  }, [currentRoll?.id, photos, rollPhotoIds])

  const filteredAvailablePhotos = useMemo(() => {
    const q = photoSelectorSearch.trim().toLowerCase()

    return availablePhotos.filter((photo) => {
      const resolvedPhotoType = photo.photoType ?? (photo.filmRollId ? 'film' : 'digital')
      const matchesPhotoType = photoTypeFilter === 'all' || resolvedPhotoType === photoTypeFilter
      if (!matchesPhotoType) return false
      if (!q) return true

      return (
        photo.title.toLowerCase().includes(q) ||
        photo.category.toLowerCase().includes(q)
      )
    })
  }, [availablePhotos, photoSelectorSearch, photoTypeFilter])

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString()
  }

  // Helper to get first photo thumbnail from a roll
  function getRollCover(roll: FilmRollDto): string | undefined {
    if (roll.filmPhotos && roll.filmPhotos.length > 0) {
      const photo = roll.filmPhotos[0].photo
      if (photo) return resolveAssetUrl(photo.thumbnailUrl || photo.url, cdnDomain)
    }
    return undefined
  }

  // ==================== List View ====================
  if (!currentRoll) {
    return (
      <>
        <div className="space-y-6">
        <AdminCollectionToolbar
          info={<span className="text-sm font-medium text-foreground"><span className="text-muted-foreground">{filteredRolls.length} {t('admin.film_rolls')}</span></span>}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder={t('common.search')}
          actions={<>
            <AdminButton
              onClick={() => setShowFilters(!showFilters)}
              adminVariant="unstyled"
              className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border rounded-md transition-all ${showFilters || activeFilterCount > 0
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-background border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span className="hidden sm:inline">{t('admin.filter') || 'Filter'}</span>
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center w-5 h-5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full">{activeFilterCount}</span>
              )}
            </AdminButton>
            <div className="flex bg-background border border-border rounded-md overflow-hidden">
              <AdminButton onClick={() => setViewMode('grid')} adminVariant="unstyled" className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`} title={t('admin.grid_view')}>
                <LayoutGrid className="w-4 h-4" />
              </AdminButton>
              <AdminButton onClick={() => setViewMode('list')} adminVariant="unstyled" className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`} title={t('admin.list_view')}>
                <List className="w-4 h-4" />
              </AdminButton>
            </div>
          </>}
          endActions={
            <AdminButton onClick={handleCreateRoll} adminVariant="unstyled" className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background text-xs font-medium hover:bg-primary hover:text-primary-foreground transition-colors">
              <Plus className="w-4 h-4" />
              {t('admin.new_film_roll')}
            </AdminButton>
          }
          filters={showFilters ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">{t('admin.film_roll_brand')}:</span>
                <div className="flex bg-background border border-border rounded-md overflow-hidden">
                  <AdminButton onClick={() => setFilterBrand('')} adminVariant="unstyled" className={`px-3 py-1.5 text-xs font-medium transition-colors ${!filterBrand ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                    {t('common.all') || 'All'}
                  </AdminButton>
                  {brands.map(brand => (
                    <AdminButton key={brand} onClick={() => setFilterBrand(brand)} adminVariant="unstyled" className={`px-3 py-1.5 text-xs font-medium transition-colors ${filterBrand === brand ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                      {brand}
                    </AdminButton>
                  ))}
                </div>
              </div>
              {activeFilterCount > 0 && (
                <>
                  <div className="h-5 w-px bg-border my-auto" />
                  <AdminButton onClick={clearAllFilters} adminVariant="unstyled" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-3.5 h-3.5" />
                    <span>{t('admin.clear_all')}</span>
                  </AdminButton>
                </>
              )}
            </div>
          ) : undefined}
          activeFilters={activeFilterCount > 0 && !showFilters ? (
            <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('admin.active_filters')}:</span>
              {filterBrand && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                  {filterBrand}
                  <AdminButton onClick={() => setFilterBrand('')} adminVariant="unstyled" className="hover:text-primary/70"><X className="w-3 h-3" /></AdminButton>
                </span>
              )}
              <AdminButton onClick={clearAllFilters} adminVariant="unstyled" className="text-xs text-muted-foreground hover:text-foreground underline">{t('admin.clear_all')}</AdminButton>
            </div>
          ) : undefined}
        />

        {loading ? (
          <div className="py-20"><AdminLoading text={t('common.loading')} className="min-h-[320px]" /></div>
        ) : filteredRolls.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-border/50 bg-muted/5">
            <Film className="w-12 h-12 mx-auto mb-4 opacity-10" />
            <p className="text-sm text-muted-foreground mb-4">{searchQuery || filterBrand ? t('admin.no_film_rolls_match_filters') : t('admin.no_film_rolls')}</p>
            {!searchQuery && !filterBrand && (
              <AdminButton onClick={handleCreateRoll} adminVariant="unstyled" className="inline-flex items-center gap-2 px-4 py-2 border border-border text-xs font-medium hover:bg-muted transition-colors">
                <Plus className="w-4 h-4" />
                {t('admin.create_first_film_roll')}
              </AdminButton>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredRolls.map(roll => {
              const cover = getRollCover(roll)
              const filmStockAsset = getFilmStockAsset(roll.brand, roll.name, roll.format ?? '135')
              return (
                <div
                  key={roll.id}
                  onClick={() => { void openRollDetail(roll) }}
                  className="group cursor-pointer bg-card border border-border/50 hover:border-border transition-all"
                >
                  <div className="relative aspect-[4/3] bg-muted overflow-hidden">
                    {cover ? (
                      <img src={cover} alt={roll.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted/50 p-6">
                        <img src={filmStockAsset} alt={`${roll.brand} ${roll.name}`} className="max-h-full max-w-full object-contain opacity-90" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/50 text-white text-[10px] font-medium">{roll.photoCount ?? 0}</div>
                    <div
                      className="absolute bottom-2 right-2 z-10 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={e => e.stopPropagation()}
                    >
                      <AdminButton onClick={e => handleDeleteRoll(roll, e)} disabled={deletingRollId === roll.id} adminVariant="unstyled" className="p-1.5 bg-red-500/80 hover:bg-red-500 text-white transition-colors disabled:opacity-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </AdminButton>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium truncate mb-1">{roll.name}</h3>
                    <p className="text-xs text-muted-foreground">{roll.brand} · ISO {roll.iso} · {roll.frameCount} {t('admin.film_roll_frames')}</p>
                    {roll.shootDate && <p className="text-xs text-muted-foreground/60 mt-1">{formatDate(roll.shootDate)}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRolls.map(roll => (
              <div
                key={roll.id}
                onClick={() => { void openRollDetail(roll) }}
                className="group flex items-center gap-4 p-4 bg-card border border-border/50 hover:border-border cursor-pointer transition-all"
              >
                <div className="w-20 h-14 flex-shrink-0 flex items-center justify-center bg-muted/40 p-1.5">
                  <img src={getFilmStockAsset(roll.brand, roll.name, roll.format ?? '135')} alt={`${roll.brand} ${roll.name}`} className="max-h-full max-w-full object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate">{roll.name}</h3>
                  <p className="text-xs text-muted-foreground">{roll.brand} · ISO {roll.iso} · {roll.photoCount ?? 0}/{roll.frameCount} {t('admin.film_roll_frames')}</p>
                </div>
                <div className="text-xs text-muted-foreground/60 hidden sm:block">{formatDate(roll.shootDate)}</div>
                <div
                  className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={e => e.stopPropagation()}
                >
                  <AdminButton onClick={e => handleDeleteRoll(roll, e)} disabled={deletingRollId === roll.id} adminVariant="unstyled" className="p-2 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50">
                    <Trash2 className="w-4 h-4" />
                  </AdminButton>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
        <SimpleDeleteDialog
          isOpen={pendingRollDelete !== null}
          title={t('common.confirm')}
          message={t('admin.film_roll_delete_confirm')}
          onConfirm={confirmDeleteRoll}
          onCancel={() => { if (!deletingRollId) setPendingRollDelete(null) }}
          t={t}
        />
      </>
    )
  }

  // ==================== Detail View ====================
  const rollPhotos = currentRoll.filmPhotos?.map(fp => fp.photo!).filter(Boolean) ?? []

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <AdminButton onClick={() => {
              currentRollRequestIdRef.current += 1
              setLoadingCurrentRoll(false)
              setCurrentRoll(null)
            }} adminVariant="icon">
              <ChevronLeft className="w-5 h-5" />
            </AdminButton>
            <div>
              <h2 className="text-lg font-medium">
                {currentRoll.name || t('admin.new_film_roll')}
              </h2>
              <p className="text-xs text-muted-foreground">
                {currentRoll.brand ? `${currentRoll.brand} · ISO ${currentRoll.iso}` : t('admin.new_film_roll')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'overview' && (
              <AdminButton
                onClick={handleSaveRoll}
                disabled={saving}
                adminVariant="unstyled"
                className="flex items-center gap-2 px-5 py-2 bg-foreground text-background text-xs font-medium hover:bg-primary hover:text-primary-foreground disabled:opacity-50 transition-colors"
              >
                <Save className="w-4 h-4" />
                {saving ? t('common.loading') : t('admin.save')}
              </AdminButton>
            )}
            {activeTab === 'photos' && currentRoll.id && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <AdminButton
                  onClick={handleReorderFrames}
                  disabled={loadingCurrentRoll || saving || rollPhotos.length === 0}
                  adminVariant="outline"
                  size="md"
                  className="gap-2"
                  title={t('admin.reorder_frames_by_filename')}
                >
                  <RefreshCw className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
                  {t('admin.reorder_frames')}
                </AdminButton>
                <AdminButton
                  onClick={() => setShowPhotoSelector(true)}
                  disabled={loadingCurrentRoll}
                  adminVariant="unstyled"
                  className="flex items-center gap-2 px-5 py-2 bg-foreground text-background text-xs font-medium hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  {t('admin.add_photos')}
                </AdminButton>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-1 border-b border-border">
          <AdminButton
            onClick={() => setActiveTab('overview')}
            adminVariant="unstyled"
            className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${activeTab === 'overview' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <Settings className="w-4 h-4" />
            {t('admin.overview') || 'Overview'}
          </AdminButton>
          {currentRoll.id && (
            <AdminButton
              onClick={() => setActiveTab('photos')}
              adminVariant="unstyled"
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${activeTab === 'photos' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <Layout className="w-4 h-4" />
              {t('admin.photos') || 'Photos'}
              <span className="ml-1 px-1.5 py-0.5 bg-muted text-[10px]">{rollPhotos.length}</span>
            </AdminButton>
          )}
        </div>

        <div className="pt-2">
          {activeTab === 'overview' ? (
            <div className="max-w-xl space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-2">画幅</label>
                  <AdminSelect
                    value={currentRollFormat}
                    onChange={handleFilmFormatChange}
                    options={FILM_FORMAT_OPTIONS}
                    placeholder="135 / 120"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-2">{t('admin.film_roll_brand')}</label>
                  <AdminSelect
                    value={currentRoll.brand}
                    onChange={handleFilmBrandChange}
                    options={FILM_STOCK_BRAND_OPTIONS}
                    placeholder={t('admin.film_roll_brand')}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-2">{t('admin.film_roll_name')}</label>
                  <AdminSelect
                    value={currentRoll.name}
                    onChange={handleFilmNameChange}
                    options={currentNameOptions}
                    placeholder={t('admin.film_roll_name')}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-2">{t('admin.film_roll_iso')}</label>
                  <CustomInput variant="config" type="number" value={String(currentRoll.iso)} onChange={e => setCurrentRoll({ ...currentRoll, iso: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-2">{t('admin.film_roll_frame_count')}</label>
                  <CustomInput variant="config" type="number" value={String(currentRoll.frameCount)} onChange={e => setCurrentRoll({ ...currentRoll, frameCount: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-2">{t('admin.film_roll_shoot_date')}</label>
                  <CustomInput variant="config" type="date" value={currentRoll.shootDate ? currentRoll.shootDate.slice(0, 10) : ''} onChange={e => setCurrentRoll({ ...currentRoll, shootDate: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-2">{t('admin.film_roll_end_date')}</label>
                  <CustomInput variant="config" type="date" value={currentRoll.endDate ? currentRoll.endDate.slice(0, 10) : ''} onChange={e => setCurrentRoll({ ...currentRoll, endDate: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-2">{t('admin.film_roll_notes')}</label>
                <textarea
                  value={currentRoll.notes || ''}
                  onChange={e => setCurrentRoll({ ...currentRoll, notes: e.target.value })}
                  placeholder={t('admin.film_roll_notes')}
                  className="w-full p-3 h-24 bg-muted/30 border-b border-border focus:border-primary outline-none text-sm transition-colors resize-none"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {loadingCurrentRoll ? (
                <div className="py-16">
                  <AdminLoading text={t('common.loading')} className="min-h-[240px]" />
                </div>
              ) : showPhotoSelector ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 p-3 bg-muted/30 border border-border sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                      <AdminButton onClick={() => { setShowPhotoSelector(false); setSelectedPhotoIds(new Set()); setPhotoSelectorSearch(''); setPhotoTypeFilter('film') }} adminVariant="icon">
                        <X className="w-4 h-4" />
                      </AdminButton>
                      <span className="text-sm">{selectedPhotoIds.size} {t('admin.selected')}</span>
                      <input type="text" value={photoSelectorSearch} onChange={e => setPhotoSelectorSearch(e.target.value)} placeholder={t('common.search')} className="px-2 py-1 text-sm bg-transparent border border-border rounded focus:border-primary outline-none w-40" />
                      <AdminSelect
                        value={photoTypeFilter}
                        onChange={(value) => setPhotoTypeFilter(value as PhotoTypeFilter)}
                        options={[
                          { value: 'all', label: t('common.all') },
                          { value: 'digital', label: t('admin.upload_type_digital') },
                          { value: 'film', label: t('admin.upload_type_film') },
                        ]}
                        className="min-w-[120px]"
                      />
                    </div>
                    <AdminButton onClick={handleAddPhotos} disabled={selectedPhotoIds.size === 0 || saving} adminVariant="unstyled" className="flex items-center gap-2 px-4 py-1.5 bg-foreground text-background text-xs font-medium disabled:opacity-50 transition-colors">
                      <Check className="w-3.5 h-3.5" />
                      {t('admin.add')}
                    </AdminButton>
                  </div>
                  {filteredAvailablePhotos.length === 0 ? (
                    <div className="py-16 text-center border border-dashed border-border/50 bg-muted/5">
                      <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-10" />
                      <p className="text-sm text-muted-foreground">
                        {availablePhotos.length === 0 ? t('admin.no_photos_available') : t('admin.no_photos_match_filter')}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
                      {filteredAvailablePhotos.map(photo => {
                        const isSelected = selectedPhotoIds.has(photo.id)
                        return (
                          <div
                            key={photo.id}
                            onClick={() => setSelectedPhotoIds(prev => {
                              const next = new Set(prev)
                              if (next.has(photo.id)) next.delete(photo.id)
                              else next.add(photo.id)
                              return next
                            })}
                            className={`relative aspect-square cursor-pointer ${isSelected ? 'ring-2 ring-primary' : 'hover:opacity-80'}`}
                          >
                            <img src={resolveAssetUrl(photo.thumbnailUrl || photo.url, cdnDomain)} alt={photo.title} className="w-full h-full object-cover" />
                            <div className="absolute left-1 bottom-1 px-1.5 py-0.5 bg-black/55 text-white text-[9px]">
                              {t(`admin.upload_type_${photo.photoType ?? (photo.filmRollId ? 'film' : 'digital')}`)}
                            </div>
                            {isSelected && (
                              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><Check className="w-5 h-5 text-primary" /></div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : rollPhotos.length === 0 ? (
                <div className="py-16 text-center border border-dashed border-border/50 bg-muted/5">
                  <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-10" />
                  <p className="text-sm text-muted-foreground mb-3">{t('admin.album_empty')}</p>
                  {currentRoll.id && (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <AdminButton
                        onClick={handleReorderFrames}
                        disabled={saving}
                        adminVariant="outline"
                        size="md"
                        className="gap-2"
                        title={t('admin.reorder_frames_by_filename')}
                      >
                        <RefreshCw className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
                        {t('admin.reorder_frames')}
                      </AdminButton>
                      <AdminButton onClick={() => setShowPhotoSelector(true)} adminVariant="unstyled" className="inline-flex items-center gap-2 px-4 py-2 border border-border text-xs font-medium hover:bg-muted transition-colors">
                        <Plus className="w-4 h-4" />
                        {t('admin.add_photos')}
                      </AdminButton>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
                  {rollPhotos.map((photo, idx) => (
                    <div key={photo.id} className="relative aspect-square group bg-muted overflow-hidden cursor-pointer" onClick={() => onPreview(photo)}>
                      <img src={resolveAssetUrl(photo.thumbnailUrl || photo.url, cdnDomain)} alt={photo.title} className="w-full h-full object-cover" />
                      <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/50 text-white text-[8px] font-mono">#{idx + 1}</div>
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <AdminButton
                          onClick={e => { e.stopPropagation(); handleRemovePhoto(photo.id) }}
                          adminVariant="unstyled"
                          className="px-2 py-1 bg-red-500/80 hover:bg-red-500 text-white text-[9px] font-medium"
                        >
                          {t('admin.remove')}
                        </AdminButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <SimpleDeleteDialog
        isOpen={pendingRollDelete !== null}
        title={t('common.confirm')}
        message={t('admin.film_roll_delete_confirm')}
        onConfirm={confirmDeleteRoll}
        onCancel={() => { if (!deletingRollId) setPendingRollDelete(null) }}
        t={t}
      />
    </>
  )
}
