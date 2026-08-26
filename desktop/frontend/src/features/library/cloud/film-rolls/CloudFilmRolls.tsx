import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Film, LayoutGrid, List, Loader2, Plus, RefreshCw, Save } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { LibrarySearchInput, LibraryStatusBar, LibraryToolbar, LibraryViewToggle } from '@/components/ui/library'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import { invalidateDesktopCache } from '@/lib/app-cache'
import { loadPersistentResource } from '@/lib/persistent-cache'
import { t } from '@/lib/i18n'
import { usePreferences } from '@/store/preferences'

import {
  appApi,
  currentFormat,
  DEFAULT_SORT,
  errorMessage,
  newDraftRoll,
  normalizeRoll,
  readLocal,
  SORT_KEY,
  SORT_OPTIONS,
  VIEW_MODE_KEY,
  writeLocal,
} from './helpers'
import { DetailTabButton, RollGridCard, RollRow } from './RollListItems'
import { OverviewTab, PhotoSelector, PhotosTab } from './RollDetailTabs'
import type {
  DetailTab,
  FilmPhotoDTO,
  FilmRollDTO,
  FilmRollPayload,
  PhotoDTO,
  PhotoTypeFilter,
  ViewMode,
} from './types'

export function CloudFilmRolls() {
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
  const [viewMode, setViewMode] = useState<ViewMode>(() => readLocal(VIEW_MODE_KEY, 'list') === 'grid' ? 'grid' : 'list')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterBrand, setFilterBrand] = useState('')
  const [sort, setSort] = useState(() => {
    const stored = readLocal(SORT_KEY, DEFAULT_SORT)
    return SORT_OPTIONS.some(option => option.value === stored) ? stored : DEFAULT_SORT
  })
  const [photoSelectorSearch, setPhotoSelectorSearch] = useState('')
  const [photoTypeFilter, setPhotoTypeFilter] = useState<PhotoTypeFilter>('film')
  const currentRollRequestIdRef = useRef(0)
  const didAutoSelectRef = useRef(false)

  useEffect(() => {
    writeLocal(VIEW_MODE_KEY, viewMode)
  }, [viewMode])

  useEffect(() => {
    writeLocal(SORT_KEY, sort)
  }, [sort])

  const fetchRolls = useCallback(async (force = false) => {
    setLoading(true)
    try {
      const data = await loadPersistentResource('film-rolls', () => appApi().GetFilmRolls(), { force })
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

  const openRoll = useCallback(async (roll: FilmRollDTO, tab: DetailTab = 'photos') => {
    const requestId = ++currentRollRequestIdRef.current
    setCurrentRoll(normalizeRoll(roll))
    setActiveTab(tab)
    setShowPhotoSelector(false)
    setSelectedPhotoIds(new Set())
    setPhotoSelectorSearch('')
    setPhotoTypeFilter('film')
    if (tab === 'photos') {
      setLoadingCurrentRoll(true)
      try {
        const full = await appApi().GetFilmRoll(roll.id)
        if (requestId === currentRollRequestIdRef.current) setCurrentRoll(normalizeRoll(full))
      } catch (error) {
        toast.error(errorMessage(error, t('common.error', language)))
      } finally {
        if (requestId === currentRollRequestIdRef.current) setLoadingCurrentRoll(false)
      }
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
      await fetchRolls(true)
      invalidateDesktopCache(['overview'])
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
      if (currentRoll?.id === pendingDelete.id) {
        const next = rolls.find(roll => roll.id !== pendingDelete.id)
        setCurrentRoll(null)
        if (next) void openRoll(next)
      }
      setPendingDelete(null)
      await fetchRolls(true)
      invalidateDesktopCache(['overview'])
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
      setPendingDelete(null)
    }
  }, [currentRoll?.id, fetchRolls, language, openRoll, pendingDelete, rolls])

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
      await fetchRolls(true)
      await fetchPhotos()
      invalidateDesktopCache(['photos'])
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
      await fetchRolls(true)
      await fetchPhotos()
      invalidateDesktopCache(['photos'])
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

  // 拖拽排序：先乐观更新本地顺序，再提交到后端；失败时回滚重载
  const handleReorderByDrag = useCallback(async (orderedIds: string[]) => {
    if (!currentRoll?.id) return
    const currentPhotos = currentRoll.filmPhotos ?? []
    const byId = new Map(currentPhotos.map(fp => [fp.id, fp]))
    const ordered = orderedIds.map(id => byId.get(id)).filter((fp): fp is FilmPhotoDTO => Boolean(fp))
    if (ordered.length === currentPhotos.length) {
      setCurrentRoll({ ...currentRoll, filmPhotos: ordered })
    }
    setSaving(true)
    try {
      const updated = await appApi().SetFilmRollFrameOrder(currentRoll.id, orderedIds)
      setCurrentRoll(normalizeRoll(updated))
      toast.success(t('admin.film_roll_frames_reordered', language))
      await fetchRolls(true)
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
      try {
        setCurrentRoll(normalizeRoll(await appApi().GetFilmRoll(currentRoll.id)))
      } catch {
        // 回滚失败时保留本地状态，等待用户手动刷新
      }
    } finally {
      setSaving(false)
    }
  }, [currentRoll, fetchRolls, language])

  const brands = useMemo(() => Array.from(new Set(rolls.map(roll => roll.brand))).sort(), [rolls])
  const filteredRolls = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return rolls.filter(roll => {
      const matchesQuery = !query || roll.name.toLowerCase().includes(query) || roll.brand.toLowerCase().includes(query)
      return matchesQuery && (!filterBrand || roll.brand === filterBrand)
    })
  }, [filterBrand, rolls, searchQuery])

  const sortedRolls = useMemo(() => {
    const [key, order] = sort.split(':') as ['shootDate' | 'createdAt', 'asc' | 'desc']
    return [...filteredRolls].sort((left, right) => {
      const leftTime = new Date(left[key] || 0).getTime()
      const rightTime = new Date(right[key] || 0).getTime()
      return order === 'asc' ? leftTime - rightTime : rightTime - leftTime
    })
  }, [filteredRolls, sort])

  const totalFrames = useMemo(() => filteredRolls.reduce((sum, roll) => sum + (roll.photoCount ?? roll.filmPhotos?.length ?? 0), 0), [filteredRolls])

  const currentFilmPhotos = useMemo(() => currentRoll?.filmPhotos ?? [], [currentRoll?.filmPhotos])

  // 首次加载完成后自动选中第一卷（桌面资源管理器习惯）
  useEffect(() => {
    if (didAutoSelectRef.current || loading) return
    if (currentRoll) {
      didAutoSelectRef.current = true
      return
    }
    if (sortedRolls.length === 0) return
    didAutoSelectRef.current = true
    void openRoll(sortedRolls[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, sortedRolls, currentRoll])

  const rollPhotoIds = useMemo(() => new Set(currentFilmPhotos.map(item => item.photoId)), [currentFilmPhotos])
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

  const clearFilters = useCallback(() => {
    setSearchQuery('')
    setFilterBrand('')
  }, [])

  return (
    <>
      <PageHeader
        title={t('admin.page_film_rolls', language)}
        description={`${filteredRolls.length} ${t('admin.film_roll_unit', language)}`}
        actions={
          <button onClick={handleCreateRoll} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90">
            <Plus size={14} /> {t('admin.new_film_roll', language)}
          </button>
        }
      />

      {/* 内容工具栏：与照片库保持一致的位置与样式 */}
      <LibraryToolbar>
        <LibrarySearchInput
          className="max-w-sm"
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={`${t('admin.film_roll_name', language)} / ${t('admin.film_roll_brand', language)}`}
          clearLabel={t('common.close', language)}
        />
        <SelectDropdown
          value={filterBrand}
          options={brands.map(brand => ({ value: brand, label: brand }))}
          onChange={value => setFilterBrand(String(value))}
          placeholder={t('common.all', language)}
          clearLabel={t('common.all', language)}
          ariaLabel={t('admin.film_roll_brand', language)}
          className="w-32 shrink-0"
        />
        <LibraryViewToggle
          value={viewMode}
          onChange={(value) => setViewMode(value as ViewMode)}
          options={[
            { value: 'grid', icon: LayoutGrid, title: language === 'zh' ? '网格视图' : 'Grid view' },
            { value: 'list', icon: List, title: language === 'zh' ? '列表视图' : 'List view' },
          ]}
        />
        <SelectDropdown
          value={sort}
          options={SORT_OPTIONS.map(option => ({ value: option.value, label: t(option.labelKey, language) }))}
          onChange={value => setSort(String(value))}
          ariaLabel={language === 'zh' ? '排序' : 'Sort'}
          className="w-32 shrink-0"
        />
      </LibraryToolbar>

      {/* 主区域：左侧胶卷列表 + 右侧详情（桌面 master-detail） */}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-r bg-card" style={{ borderColor: 'var(--border)' }}>
          <div className="flex h-9 shrink-0 items-center justify-between border-b px-3" style={{ borderColor: 'var(--border)' }}>
            <span className="text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>{t('admin.film_roll_list', language)}</span>
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums" style={{ color: 'var(--foreground)' }}>{filteredRolls.length}</span>
          </div>
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? (
              Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="mb-2 flex items-center gap-2.5 rounded-lg px-2 py-2">
                  <div className="h-10 w-14 shrink-0 animate-pulse rounded-md" style={{ backgroundColor: 'var(--muted)' }} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-3 w-3/4 animate-pulse rounded" style={{ backgroundColor: 'var(--muted)' }} />
                    <div className="h-2 w-1/2 animate-pulse rounded" style={{ backgroundColor: 'var(--muted)' }} />
                    <div className="h-1 w-full animate-pulse rounded" style={{ backgroundColor: 'var(--muted)' }} />
                  </div>
                </div>
              ))
            ) : rolls.length === 0 ? (
              <div className="flex flex-col items-center gap-3 p-6 text-center">
                <span className="flex size-12 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--muted)' }}><Film size={20} style={{ color: 'var(--muted-foreground)' }} /></span>
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{t('admin.no_film_rolls', language)}</p>
                <button onClick={handleCreateRoll} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                  <Plus size={14} /> {t('admin.create_first_film_roll', language)}
                </button>
              </div>
            ) : filteredRolls.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{t('admin.no_film_rolls_match_filters', language)}</p>
                <button onClick={clearFilters} className="text-xs underline-offset-2 hover:underline" style={{ color: 'var(--muted-foreground)' }}>{t('common.reset', language)}</button>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 gap-2">
                {sortedRolls.map(roll => (
                  <RollGridCard
                    key={roll.id}
                    roll={roll}
                    selected={currentRoll?.id === roll.id}
                    language={language}
                    onClick={() => void openRoll(roll)}
                    onEdit={() => void openRoll(roll, 'overview')}
                    onDelete={() => setPendingDelete(roll)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-0.5">
                {sortedRolls.map(roll => (
                  <RollRow
                    key={roll.id}
                    roll={roll}
                    selected={currentRoll?.id === roll.id}
                    language={language}
                    onClick={() => void openRoll(roll)}
                    onEdit={() => void openRoll(roll, 'overview')}
                    onDelete={() => setPendingDelete(roll)}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {!currentRoll ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6" style={{ color: 'var(--muted-foreground)' }}>
              <span className="flex size-14 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--muted)' }}><Film size={24} /></span>
              <p className="text-sm">{t('admin.film_roll_select_hint', language)}</p>
              <button onClick={handleCreateRoll} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                <Plus size={14} /> {t('admin.new_film_roll', language)}
              </button>
            </div>
          ) : (
            <>
              {/* 详情头部：胶卷信息 + 上下文操作 */}
              <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-5" style={{ borderColor: 'var(--border)' }}>
                <div className="min-w-0">
                  <h2 className="truncate font-serif text-base font-medium">{currentRoll.name || t('admin.new_film_roll', language)}</h2>
                  <p className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                    {currentRoll.brand ? `${currentRoll.brand} · ${currentFormat(currentRoll)} · ISO ${currentRoll.iso}` : t('admin.new_film_roll', language)}
                    {currentRoll.shootDate && ` · ${new Date(currentRoll.shootDate).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {activeTab === 'overview' ? (
                    <button onClick={handleSave} disabled={saving} className="flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-50" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                      {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                      {t('common.save', language)}
                    </button>
                  ) : (
                    <>
                      <button onClick={handleReorderFrames} disabled={saving || currentFilmPhotos.length === 0} className="flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                        <RefreshCw size={13} /> {t('admin.reorder_frames', language)}
                      </button>
                      <button onClick={() => setShowPhotoSelector(true)} className="flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-opacity hover:opacity-90" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                        <Plus size={14} /> {t('admin.add_photos', language)}
                      </button>
                    </>
                  )}
                </div>
              </header>

              {/* 详情页签 */}
              <div className="flex h-10 shrink-0 items-center gap-1 border-b px-3" style={{ borderColor: 'var(--border)' }}>
                <DetailTabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
                  {t('admin.overview', language)}
                </DetailTabButton>
                <DetailTabButton active={activeTab === 'photos'} onClick={() => setActiveTab('photos')}>
                  {t('admin.associate_photos', language)}
                  {currentRoll.id && (
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
                      {currentFilmPhotos.length}/{currentRoll.frameCount}
                    </span>
                  )}
                </DetailTabButton>
              </div>

              <div className="custom-scrollbar min-h-0 flex-1 overflow-auto p-5">
                {activeTab === 'overview' ? (
                  <OverviewTab roll={currentRoll} onChange={setCurrentRoll} language={language} />
                ) : loadingCurrentRoll ? (
                  <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3" style={{ color: 'var(--muted-foreground)' }}>
                    <Loader2 size={22} className="animate-spin" />
                    <p className="text-xs">{t('common.loading', language)}</p>
                  </div>
                ) : showPhotoSelector ? (
                  <PhotoSelector
                    photos={availablePhotos}
                    selectedIds={selectedPhotoIds}
                    search={photoSelectorSearch}
                    typeFilter={photoTypeFilter}
                    saving={saving}
                    language={language}
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
                  />
                ) : (
                  <PhotosTab
                    roll={currentRoll}
                    language={language}
                    saving={saving}
                    onRemovePhoto={handleRemovePhoto}
                    onReorderFrames={handleReorderByDrag}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 底部状态栏：与照片库一致 */}
      <LibraryStatusBar>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          <span>{filteredRolls.length} {t('admin.film_roll_unit', language)}</span>
          <span className="opacity-60">·</span>
          <span>{totalFrames} {t('admin.film_roll_frames', language)}</span>
          {(searchQuery || filterBrand) && filteredRolls.length !== rolls.length && (
            <>
              <span className="opacity-60">·</span>
              <span>{rolls.length} {t('admin.film_roll_unit', language)}</span>
            </>
          )}
        </div>
        <button type="button" disabled={loading} onClick={() => void fetchRolls(true)} className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] hover:bg-secondary disabled:cursor-wait disabled:opacity-50">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />{t('common.refresh', language)}
        </button>
      </LibraryStatusBar>

      <SimpleDeleteDialog
        isOpen={!!pendingDelete}
        title={t('admin.delete_film_roll', language)}
        message={pendingDelete ? `${t('admin.film_roll_delete_confirm', language)}：${pendingDelete.name}` : ''}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
        t={(key) => t(key, language)}
      />
    </>
  )
}
