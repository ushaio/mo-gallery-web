import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  Eye,
  EyeOff,
  Film,
  Folder,
  FolderOpen,
  Images,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Tag,
  Trash2,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AlbumsPage } from '@/pages/AlbumsPage'
import { FilmRollsPage } from '@/pages/FilmRollsPage'
import { PhotosPage } from '@/pages/PhotosPage'
import { PageHeader } from '@/components/layout/PageHeader'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/ContextMenu'
import { resolveAssetUrl } from '@/lib/api'
import { normalizePhotoCategories } from '@/lib/photoCategories'
import { usePreferences, usePhotoFilters } from '@/store/preferences'
import { t } from '@/lib/i18n'
import type { Album } from '@/types'

type CloudView = 'photos' | 'albums' | 'film-rolls'
type AlbumDetailTab = 'overview' | 'photos'

interface AlbumAppAPI {
  GetAlbums(): Promise<Album[]>
  GetCategories(): Promise<string[]>
  UpdateAlbum(id: string, params: { isPublished?: boolean }): Promise<Album>
  DeleteAlbum(id: string): Promise<void>
}

function appApi(): AlbumAppAPI {
  const bridge = (window as unknown as { go?: { main?: { App?: AlbumAppAPI } } }).go?.main?.App
  if (!bridge) throw new Error('Wails API is not available')
  return bridge
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function CloudLibraryPage() {
  const language = usePreferences((state) => state.language)
  const albumId = usePhotoFilters((state) => state.albumId)
  const category = usePhotoFilters((state) => state.category)
  const photoType = usePhotoFilters((state) => state.photoType)
  const featured = usePhotoFilters((state) => state.featured)
  const setAlbumId = usePhotoFilters((state) => state.setAlbumId)
  const setCategory = usePhotoFilters((state) => state.setCategory)
  const setPhotoType = usePhotoFilters((state) => state.setPhotoType)
  const setFeatured = usePhotoFilters((state) => state.setFeatured)
  const [searchParams, setSearchParams] = useSearchParams()
  const [albums, setAlbums] = useState<Album[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [albumsLoaded, setAlbumsLoaded] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Album | null>(null)
  const [updatingAlbumId, setUpdatingAlbumId] = useState<string | null>(null)
  const albumsRequestIdRef = useRef(0)

  const requestedView = searchParams.get('view')
  const view: CloudView = requestedView === 'albums' || requestedView === 'film-rolls' ? requestedView : 'photos'
  const createMode = view === 'albums' && searchParams.get('create') === '1'
  const managingAlbumId = view === 'albums' ? searchParams.get('manage') : null
  const managerTab: AlbumDetailTab = searchParams.get('tab') === 'photos' ? 'photos' : 'overview'
  const showingAlbumBrowser = view === 'albums' && !createMode && !managingAlbumId

  const fetchAlbums = useCallback(async () => {
    const requestId = ++albumsRequestIdRef.current
    setLoading(true)
    try {
      const [result, categoryResult] = await Promise.all([
        appApi().GetAlbums(),
        appApi().GetCategories().catch(() => []),
      ])
      if (requestId !== albumsRequestIdRef.current) return
      setAlbums(result ?? [])
      setCategories(normalizePhotoCategories(categoryResult))
      setAlbumsLoaded(true)
    } catch (error) {
      if (requestId !== albumsRequestIdRef.current) return
      toast.error(errorMessage(error, t('common.error', language)))
    } finally {
      if (requestId === albumsRequestIdRef.current) setLoading(false)
    }
  }, [language])

  useEffect(() => {
    void fetchAlbums()
  }, [fetchAlbums])

  useEffect(() => {
    if (albumsLoaded && !loading && albumId && !albums.some((album) => album.id === albumId)) setAlbumId(null)
  }, [albumId, albums, albumsLoaded, loading, setAlbumId])

  const sortedAlbums = useMemo(() => (
    [...albums].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
  ), [albums])

  const showAllPhotos = useCallback(() => {
    setAlbumId(null)
    setCategory('全部')
    setPhotoType(null)
    setFeatured(null)
    setSearchParams({ source: 'cloud' }, { replace: true })
  }, [setAlbumId, setCategory, setFeatured, setPhotoType, setSearchParams])

  const showFeaturedPhotos = useCallback(() => {
    setAlbumId(null)
    setCategory('全部')
    setPhotoType(null)
    setFeatured(true)
    setSearchParams({ source: 'cloud' }, { replace: true })
  }, [setAlbumId, setCategory, setFeatured, setPhotoType, setSearchParams])

  const showFilmRolls = useCallback(() => {
    setAlbumId(null)
    setCategory('全部')
    setPhotoType(null)
    setFeatured(null)
    setSearchParams({ source: 'cloud', view: 'film-rolls' }, { replace: true })
  }, [setAlbumId, setCategory, setFeatured, setPhotoType, setSearchParams])

  const showPhotoType = useCallback((nextPhotoType: 'digital' | 'film') => {
    setAlbumId(null)
    setCategory('全部')
    setPhotoType(nextPhotoType)
    setFeatured(null)
    setSearchParams({ source: 'cloud' }, { replace: true })
  }, [setAlbumId, setCategory, setFeatured, setPhotoType, setSearchParams])

  const showCategory = useCallback((nextCategory: string) => {
    setAlbumId(null)
    setCategory(nextCategory)
    setPhotoType(null)
    setFeatured(null)
    setSearchParams({ source: 'cloud' }, { replace: true })
  }, [setAlbumId, setCategory, setFeatured, setPhotoType, setSearchParams])

  const showAlbum = useCallback((id: string) => {
    setCategory('全部')
    setPhotoType(null)
    setFeatured(null)
    setAlbumId(id)
    setSearchParams({ source: 'cloud' }, { replace: true })
  }, [setAlbumId, setCategory, setFeatured, setPhotoType, setSearchParams])

  const showAlbumBrowser = useCallback(() => {
    setAlbumId(null)
    setCategory('全部')
    setPhotoType(null)
    setFeatured(null)
    setSearchParams({ source: 'cloud', view: 'albums' }, { replace: true })
  }, [setAlbumId, setCategory, setFeatured, setPhotoType, setSearchParams])

  const createAlbum = useCallback(() => {
    setAlbumId(null)
    setCategory('全部')
    setPhotoType(null)
    setFeatured(null)
    setSearchParams({ source: 'cloud', view: 'albums', create: '1' }, { replace: true })
  }, [setAlbumId, setCategory, setFeatured, setPhotoType, setSearchParams])

  const manageAlbum = useCallback((id: string, tab: AlbumDetailTab) => {
    setAlbumId(null)
    setCategory('全部')
    setPhotoType(null)
    setFeatured(null)
    setSearchParams({ source: 'cloud', view: 'albums', manage: id, tab }, { replace: true })
  }, [setAlbumId, setCategory, setFeatured, setPhotoType, setSearchParams])

  const togglePublished = useCallback(async (album: Album) => {
    if (updatingAlbumId) return
    setUpdatingAlbumId(album.id)
    try {
      const updated = await appApi().UpdateAlbum(album.id, { isPublished: !album.isPublished })
      setAlbums(current => current.map(item => item.id === updated.id ? { ...item, ...updated } : item))
      toast.success(t(updated.isPublished ? 'admin.album_published' : 'admin.album_unpublished', language))
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    } finally {
      setUpdatingAlbumId(null)
    }
  }, [language, updatingAlbumId])

  const deleteAlbum = useCallback(async () => {
    const target = deleteTarget
    if (!target) return
    try {
      await appApi().DeleteAlbum(target.id)
      setAlbums(current => current.filter(album => album.id !== target.id))
      if (albumId === target.id) setAlbumId(null)
      if (managingAlbumId === target.id) showAlbumBrowser()
      setDeleteTarget(null)
      toast.success(t('common.deleted', language))
    } catch (error) {
      toast.error(errorMessage(error, t('common.error', language)))
    }
  }, [albumId, deleteTarget, language, managingAlbumId, setAlbumId, showAlbumBrowser])

  const albumMenuActions = useMemo(() => ({
    onOpen: showAlbum,
    onEdit: (id: string) => manageAlbum(id, 'overview'),
    onManagePhotos: (id: string) => manageAlbum(id, 'photos'),
    onTogglePublished: (album: Album) => void togglePublished(album),
    onDelete: setDeleteTarget,
  }), [manageAlbum, showAlbum, togglePublished])

  return (
    <div className="flex h-full min-h-0 bg-background">
      <aside className="flex w-[218px] shrink-0 flex-col overflow-hidden border-r bg-card p-3" style={{ borderColor: 'var(--border)' }}>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          <CloudNavButton
            active={view === 'photos' && !albumId && featured !== true && category === '全部' && !photoType}
            icon={Images}
            label={t('admin.resource_library_all_photos', language)}
            onClick={showAllPhotos}
          />
          <CloudNavButton
            active={view === 'photos' && !albumId && featured === true && !photoType}
            icon={Star}
            label={t('admin.featured', language)}
            onClick={showFeaturedPhotos}
          />
          <CloudNavButton
            active={view === 'film-rolls'}
            icon={Film}
            label={t('admin.film_rolls', language)}
            onClick={showFilmRolls}
          />

          <div className="mb-2 mt-5 px-2 text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>{language === 'zh' ? '照片类型' : 'Photo type'}</div>
          <div className="space-y-0.5">
            <CloudNavButton
              active={view === 'photos' && !albumId && featured !== true && category === '全部' && photoType === 'digital'}
              icon={Camera}
              label={t('admin.photos_type_digital', language)}
              onClick={() => showPhotoType('digital')}
            />
            <CloudNavButton
              active={view === 'photos' && !albumId && featured !== true && category === '全部' && photoType === 'film'}
              icon={Film}
              label={t('admin.photos_type_film', language)}
              onClick={() => showPhotoType('film')}
            />
          </div>

          <div className="mb-2 mt-5 px-2 text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>{t('ui.category_filter', language)}</div>
          <div className="space-y-0.5">
            {categories.map((item) => (
              <CloudNavButton
                key={item}
                active={view === 'photos' && !albumId && featured !== true && !photoType && category === item}
                icon={Tag}
                label={item}
                onClick={() => showCategory(item)}
              />
            ))}
            {!loading && categories.length === 0 && <p className="px-2.5 py-2 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{language === 'zh' ? '暂无分类' : 'No categories'}</p>}
          </div>

          <div className="mb-2 mt-5 flex items-center gap-1 px-1">
            <button
              type="button"
              onClick={showAlbumBrowser}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-[10px] font-medium uppercase transition hover:bg-secondary"
              style={{
                color: view === 'albums' ? 'var(--foreground)' : 'var(--muted-foreground)',
                backgroundColor: showingAlbumBrowser ? 'var(--accent)' : undefined,
              }}
              title={t('admin.album_browse', language)}
            >
              <FolderOpen size={12} className="shrink-0" />
              <span className="truncate tracking-[0.16em]">{t('gallery.albums', language)}</span>
              <span className="ml-auto text-[9px] tabular-nums tracking-normal" style={{ color: 'var(--muted-foreground)' }}>{albums.length}</span>
            </button>
            <button
              type="button"
              onClick={createAlbum}
              title={t('admin.create_album', language)}
              aria-label={t('admin.create_album', language)}
              className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-secondary"
              style={{ color: 'var(--muted-foreground)' }}
            >
              <Plus size={12} />
            </button>
            <button
              type="button"
              onClick={() => void fetchAlbums()}
              title={t('common.refresh', language)}
              aria-label={t('common.refresh', language)}
              className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-secondary"
              style={{ color: 'var(--muted-foreground)' }}
            >
              {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            </button>
          </div>

          <div className="space-y-0.5">
            {sortedAlbums.map((album) => (
              <AlbumContextTarget key={album.id} album={album} language={language} busy={updatingAlbumId === album.id} {...albumMenuActions}>
                <button
                  type="button"
                  onClick={() => showAlbum(album.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition hover:bg-secondary"
                  style={{
                    backgroundColor: view === 'photos' && albumId === album.id ? 'var(--accent)' : undefined,
                    color: view === 'photos' && albumId === album.id ? 'var(--accent-foreground)' : undefined,
                  }}
                  title={album.name}
                >
                  <Folder size={15} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{album.name}</span>
                  {!album.isPublished && <EyeOff size={11} className="shrink-0" style={{ color: 'var(--muted-foreground)' }} />}
                  <span className="shrink-0 text-[10px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>{album.photoCount || 0}</span>
                </button>
              </AlbumContextTarget>
            ))}
            {!loading && sortedAlbums.length === 0 && (
              <button type="button" onClick={createAlbum} className="w-full rounded-md px-2.5 py-3 text-left text-[10px] hover:bg-secondary" style={{ color: 'var(--muted-foreground)' }}>
                {t('admin.no_albums', language)} · {t('admin.create_album', language)}
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {view === 'photos' ? (
          <PhotosPage />
        ) : view === 'film-rolls' ? (
          <FilmRollsPage />
        ) : createMode || managingAlbumId ? (
          <AlbumsPage
            initialAlbumId={managingAlbumId}
            initialTab={managerTab}
            createMode={createMode}
            onBackToBrowser={showAlbumBrowser}
            onAlbumsChanged={() => void fetchAlbums()}
          />
        ) : (
          <CloudAlbumsBrowser
            albums={sortedAlbums}
            loading={loading}
            language={language}
            onOpen={showAlbum}
          />
        )}
      </div>

      <SimpleDeleteDialog
        isOpen={!!deleteTarget}
        title={t('admin.delete_album', language)}
        message={deleteTarget ? t('admin.album_delete_named_confirm', language).replace('{name}', deleteTarget.name) : ''}
        onConfirm={deleteAlbum}
        onCancel={() => setDeleteTarget(null)}
        t={(key) => t(key, language)}
      />
    </div>
  )
}

interface AlbumActions {
  onOpen: (id: string) => void
  onEdit: (id: string) => void
  onManagePhotos: (id: string) => void
  onTogglePublished: (album: Album) => void
  onDelete: (album: Album) => void
}

function AlbumContextTarget({ album, language, busy, children, ...actions }: AlbumActions & {
  album: Album
  language: 'zh' | 'en'
  busy: boolean
  children: React.ReactElement
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel className="max-w-56 truncate">{album.name}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => actions.onOpen(album.id)}><FolderOpen size={14} />{t('admin.open_album', language)}</ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onEdit(album.id)}><Pencil size={14} />{t('admin.edit_album', language)}</ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onManagePhotos(album.id)}><Images size={14} />{t('admin.manage_photos', language)}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={busy} onSelect={() => actions.onTogglePublished(album)}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : album.isPublished ? <EyeOff size={14} /> : <Eye size={14} />}
          {t(album.isPublished ? 'admin.unpublish_album' : 'admin.publish_album', language)}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => actions.onDelete(album)}><Trash2 size={14} />{t('admin.delete_album', language)}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function CloudAlbumsBrowser({ albums, loading, language, onOpen }: {
  albums: Album[]
  loading: boolean
  language: 'zh' | 'en'
  onOpen: (id: string) => void
}) {
  return (
    <>
      <PageHeader title={t('gallery.albums', language)} />

      <div className="custom-scrollbar min-h-0 flex-1 overflow-auto p-6">
        {loading ? (
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-3 2xl:grid-cols-5">
            {Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-[4/3] animate-pulse rounded-md bg-muted" />)}
          </div>
        ) : albums.length === 0 ? (
          <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 text-muted-foreground">
            <span className="flex size-14 items-center justify-center rounded-lg bg-muted"><FolderOpen size={25} /></span>
            <p className="text-sm">{t('admin.no_albums', language)}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-7 lg:grid-cols-3 2xl:grid-cols-5">
            {albums.map(album => (
                <button
                  key={album.id}
                  type="button"
                  onClick={() => onOpen(album.id)}
                  className="group min-w-0 text-left outline-none"
                  title={`${album.name} · ${album.photoCount || 0} ${t('admin.photos', language)}`}
                >
                  <div className="relative pt-3">
                    <span className="absolute left-3 top-0 h-5 w-20 rounded-t-md border border-b-0 bg-muted transition-colors group-hover:bg-accent" style={{ borderColor: 'var(--border)' }} />
                    <span className="relative block aspect-[4/3] overflow-hidden rounded-md rounded-tl-sm border bg-muted shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md" style={{ borderColor: 'var(--border)' }}>
                      {album.coverUrl ? (
                        <img src={resolveAssetUrl(album.coverUrl)} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                      ) : (
                        <span className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"><FolderOpen size={30} /><span className="text-[10px]">{t('admin.album_empty', language)}</span></span>
                      )}
                      <span className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                      <span className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2 text-white">
                        <span className="truncate text-xs font-medium">{album.name}</span>
                        <span className="shrink-0 rounded bg-black/45 px-1.5 py-0.5 text-[9px] tabular-nums backdrop-blur-sm">{album.photoCount || 0}</span>
                      </span>
                      {!album.isPublished && <span className="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/50 px-1.5 py-0.5 text-[9px] text-white backdrop-blur-sm"><EyeOff size={9} />{t('admin.draft', language)}</span>}
                    </span>
                  </div>
                  <span className="mt-2 block min-w-0 px-1">
                    <span className="block truncate text-xs font-medium">{album.name}</span>
                    <span className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                      {album.location ? <><MapPin size={10} className="shrink-0" /><span className="truncate">{album.location}</span></> : <span>{album.photoCount || 0} {t('admin.photos', language)}</span>}
                    </span>
                  </span>
                </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function CloudNavButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: typeof Images
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition hover:bg-secondary"
      style={{
        backgroundColor: active ? 'var(--accent)' : undefined,
        color: active ? 'var(--accent-foreground)' : undefined,
      }}
    >
      <Icon size={15} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}
