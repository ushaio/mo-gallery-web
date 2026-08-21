import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { toast } from 'sonner'
import { Check, Film, Image as ImageIcon, LayoutGrid, List, Loader2, Pencil, Plus, RefreshCw, Save, Search, Trash2, X } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { LibrarySearchInput, LibraryStatusBar, LibraryToolbar, LibraryViewToggle } from '@/components/ui/library'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/ContextMenu'
import { resolveAssetUrl } from '@/lib/api'
import { invalidateDesktopCache } from '@/lib/app-cache'
import { loadPersistentResource } from '@/lib/persistent-cache'
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
  SetFilmRollFrameOrder(id: string, filmPhotoIds: string[]): Promise<FilmRollDTO>
  GetAllPhotos(): Promise<PhotoDTO[]>
}

declare global {
  interface Window {
    go?: { main?: { App?: WailsAppAPI } }
  }
}

const FORMAT_OPTIONS = FILM_FORMATS.map(value => ({ value, label: value }))
const BRAND_OPTIONS = FILM_STOCK_BRANDS.map(value => ({ value, label: value }))

// 视图与排序偏好持久化到 localStorage：跨页面/重启保留（与照片库一致）
const VIEW_MODE_KEY = 'mo-gallery:film-rolls:view-mode'
const SORT_KEY = 'mo-gallery:film-rolls:sort'
const DEFAULT_SORT = 'createdAt:desc'

const SORT_OPTIONS = [
  { value: 'shootDate:desc', labelKey: 'admin.film_roll_sort_shoot_desc' },
  { value: 'shootDate:asc', labelKey: 'admin.film_roll_sort_shoot_asc' },
  { value: 'createdAt:desc', labelKey: 'admin.film_roll_sort_created_desc' },
  { value: 'createdAt:asc', labelKey: 'admin.film_roll_sort_created_asc' },
] as const

function readLocal(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function writeLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore quota / privacy mode errors
  }
}

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

const formInputClass = 'w-full rounded-lg border bg-input px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20'

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

function DetailTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
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

function RollRow({ roll, selected, language, onClick, onEdit, onDelete }: {
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

function RollGridCard({ roll, selected, language, onClick, onEdit, onDelete }: {
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

function PhotosTab({ roll, language, saving, onRemovePhoto, onReorderFrames }: {
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

function PhotoSelector({ photos, selectedIds, search, typeFilter, saving, language, onSearchChange, onTypeFilterChange, onToggle, onConfirm, onClose }: {
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      {children}
    </label>
  )
}
