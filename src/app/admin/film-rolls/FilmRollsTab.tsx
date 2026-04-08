'use client'

import { useState, useEffect, useMemo } from 'react'
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
} from 'lucide-react'
import {
  getFilmRolls,
  getFilmRoll,
  createFilmRoll,
  updateFilmRoll,
  deleteFilmRoll,
  addPhotosToFilmRoll,
  removePhotoFromFilmRoll,
  type FilmRollDto,
  type PhotoDto,
  ApiUnauthorizedError,
  resolveAssetUrl,
} from '@/lib/api'
import { CustomInput } from '@/components/ui/CustomInput'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminLoading } from '@/components/admin/AdminLoading'
import { AdminCollectionToolbar } from '@/components/admin/AdminCollectionToolbar'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'

type ViewMode = 'grid' | 'list'

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

  useEffect(() => { loadRolls() }, [token])

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

  const clearAllFilters = () => {
    setFilterBrand('')
    setSearchQuery('')
  }

  async function loadRolls() {
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
  }

  function handleCreateRoll() {
    setCurrentRoll({
      id: '', name: '', brand: '', iso: 400, frameCount: 36,
      notes: null, shootDate: null, endDate: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      photoCount: 0, filmPhotos: [],
    })
    setActiveTab('overview')
  }

  function handleDeleteRoll(roll: FilmRollDto, e?: React.MouseEvent) {
    e?.stopPropagation()
    if (!token) return
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
      notify(t('common.error'), 'error')
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
      notify(t('admin.photos_added'), 'success')
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
    return photos.filter(p => !rollPhotoIds.has(p.id))
  }, [photos, rollPhotoIds])

  const filteredAvailablePhotos = useMemo(() => {
    if (!photoSelectorSearch.trim()) return availablePhotos
    const q = photoSelectorSearch.toLowerCase()
    return availablePhotos.filter(p =>
      p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    )
  }, [availablePhotos, photoSelectorSearch])

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
              return (
                <div
                  key={roll.id}
                  onClick={async () => {
                    try {
                      const full = await getFilmRoll(roll.id)
                      setCurrentRoll(full)
                      setActiveTab('photos')
                    } catch {
                      setCurrentRoll({ ...roll, filmPhotos: [] })
                      setActiveTab('photos')
                    }
                  }}
                  className="group cursor-pointer bg-card border border-border/50 hover:border-border transition-all"
                >
                  <div className="relative aspect-[4/3] bg-muted overflow-hidden">
                    {cover ? (
                      <img src={cover} alt={roll.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Film className="w-10 h-10 opacity-10" /></div>
                    )}
                    <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/50 text-white text-[10px] font-medium">{roll.photoCount ?? 0}</div>
                    <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
                onClick={async () => {
                  try {
                    const full = await getFilmRoll(roll.id)
                    setCurrentRoll(full)
                    setActiveTab('photos')
                  } catch {
                    setCurrentRoll({ ...roll, filmPhotos: [] })
                    setActiveTab('photos')
                  }
                }}
                className="group flex items-center gap-4 p-4 bg-card border border-border/50 hover:border-border cursor-pointer transition-all"
              >
                <div className="w-16 h-12 bg-muted overflow-hidden flex-shrink-0">
                  {getRollCover(roll) ? (
                    <img src={getRollCover(roll)} alt={roll.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Film className="w-5 h-5 opacity-20" /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate">{roll.name}</h3>
                  <p className="text-xs text-muted-foreground">{roll.brand} · ISO {roll.iso} · {roll.photoCount ?? 0}/{roll.frameCount} {t('admin.film_roll_frames')}</p>
                </div>
                <div className="text-xs text-muted-foreground/60 hidden sm:block">{formatDate(roll.shootDate)}</div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <AdminButton onClick={e => handleDeleteRoll(roll, e)} disabled={deletingRollId === roll.id} adminVariant="unstyled" className="p-2 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50">
                    <Trash2 className="w-4 h-4" />
                  </AdminButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ==================== Detail View ====================
  const rollPhotos = currentRoll.filmPhotos?.map(fp => fp.photo!).filter(Boolean) ?? []

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <AdminButton onClick={() => setCurrentRoll(null)} adminVariant="icon">
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
              <AdminButton
                onClick={() => setShowPhotoSelector(true)}
                adminVariant="unstyled"
                className="flex items-center gap-2 px-5 py-2 bg-foreground text-background text-xs font-medium hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('admin.add_photos')}
              </AdminButton>
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
              <div>
                <label className="block text-xs text-muted-foreground mb-2">{t('admin.film_roll_name')}</label>
                <CustomInput variant="config" value={currentRoll.name} onChange={e => setCurrentRoll({ ...currentRoll, name: e.target.value })} placeholder={t('admin.film_roll_name')} />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-2">{t('admin.film_roll_brand')}</label>
                <CustomInput variant="config" value={currentRoll.brand} onChange={e => setCurrentRoll({ ...currentRoll, brand: e.target.value })} placeholder={t('admin.film_roll_brand')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
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
              {showPhotoSelector ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-muted/30 border border-border">
                    <div className="flex items-center gap-3">
                      <AdminButton onClick={() => { setShowPhotoSelector(false); setSelectedPhotoIds(new Set()); setPhotoSelectorSearch('') }} adminVariant="icon">
                        <X className="w-4 h-4" />
                      </AdminButton>
                      <span className="text-sm">{selectedPhotoIds.size} {t('admin.selected')}</span>
                      <input type="text" value={photoSelectorSearch} onChange={e => setPhotoSelectorSearch(e.target.value)} placeholder={t('common.search')} className="px-2 py-1 text-sm bg-transparent border border-border rounded focus:border-primary outline-none w-40" />
                    </div>
                    <AdminButton onClick={handleAddPhotos} disabled={selectedPhotoIds.size === 0 || saving} adminVariant="unstyled" className="flex items-center gap-2 px-4 py-1.5 bg-foreground text-background text-xs font-medium disabled:opacity-50 transition-colors">
                      <Check className="w-3.5 h-3.5" />
                      {t('admin.add')}
                    </AdminButton>
                  </div>
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
                          {isSelected && (
                            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><Check className="w-5 h-5 text-primary" /></div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : rollPhotos.length === 0 ? (
                <div className="py-16 text-center border border-dashed border-border/50 bg-muted/5">
                  <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-10" />
                  <p className="text-sm text-muted-foreground mb-3">{t('admin.album_empty')}</p>
                  {currentRoll.id && (
                    <AdminButton onClick={() => setShowPhotoSelector(true)} adminVariant="unstyled" className="inline-flex items-center gap-2 px-4 py-2 border border-border text-xs font-medium hover:bg-muted transition-colors">
                      <Plus className="w-4 h-4" />
                      {t('admin.add_photos')}
                    </AdminButton>
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
        message={t('admin.confirm_delete_single') + '?'}
        onConfirm={confirmDeleteRoll}
        onCancel={() => { if (!deletingRollId) setPendingRollDelete(null) }}
        t={t}
      />
    </>
  )
}