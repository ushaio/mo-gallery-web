'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import {
  Camera,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Film,
  Folder,
  FolderOpen,
  Images,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Tag,
  Trash2,
} from 'lucide-react'
import { useAdmin } from '../layout'
import { deleteAlbum, getAdminAlbums, updateAlbum } from '@/lib/api/albums'
import { ApiUnauthorizedError } from '@/lib/api/core'
import type { AlbumDto, PhotoDto } from '@/lib/api/types'
import { AdminButton } from '@/components/admin/AdminButton'
import { LibraryAlbumsWorkspace } from '@/components/admin/LibraryAlbumsWorkspace'
import { LibraryFilmRollWorkspace } from '@/components/admin/LibraryFilmRollWorkspace'
import { LibraryPhotoWorkspace, type LibraryPhotoFilters } from '@/components/admin/LibraryPhotoWorkspace'
import { PhotoPreviewOverlay } from '@/components/admin/PhotoPreviewOverlay'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { cn } from '@/lib/utils'

type LibraryView = 'photos' | 'albums' | 'film-rolls'
type SectionKey = 'photoType' | 'categories' | 'albums'
type AlbumWorkspaceTab = 'overview' | 'photos'

interface AlbumWorkspaceRequest {
  albumId: string | null
  tab: AlbumWorkspaceTab
  requestId: number
}

interface AlbumContextMenuState {
  album: AlbumDto
  x: number
  y: number
}

const SECTION_STORAGE_KEY = 'admin-resource-library-sections'

const DEFAULT_SECTIONS: Record<SectionKey, boolean> = { photoType: true, categories: true, albums: true }

function readSections(): Record<SectionKey, boolean> {
  try {
    const raw = window.localStorage.getItem(SECTION_STORAGE_KEY)
    if (raw) return { ...DEFAULT_SECTIONS, ...JSON.parse(raw) }
  } catch { }
  return DEFAULT_SECTIONS
}

export default function LibraryPage() {
  const searchParams = useSearchParams()
  const {
    token,
    photos,
    categories,
    settings,
    t,
    notify,
    refreshPhotos,
    handleUnauthorized,
  } = useAdmin()
  const initialView = searchParams.get('view')
  const [view, setView] = useState<LibraryView>(
    initialView === 'albums' || initialView === 'film-rolls' ? initialView : 'photos',
  )
  const [sections, setSections] = useState<Record<SectionKey, boolean>>(DEFAULT_SECTIONS)
  const [albums, setAlbums] = useState<AlbumDto[]>([])
  const [albumsLoading, setAlbumsLoading] = useState(false)
  const [albumCreateSignal, setAlbumCreateSignal] = useState(0)
  const [albumWorkspaceRequest, setAlbumWorkspaceRequest] = useState<AlbumWorkspaceRequest | null>(null)
  const [albumContextMenu, setAlbumContextMenu] = useState<AlbumContextMenuState | null>(null)
  const [updatingAlbumId, setUpdatingAlbumId] = useState<string | null>(null)
  const [pendingAlbumDelete, setPendingAlbumDelete] = useState<AlbumDto | null>(null)
  const [photoFilters, setPhotoFilters] = useState<LibraryPhotoFilters>({})
  const [previewPhoto, setPreviewPhoto] = useState<PhotoDto | null>(null)

  useEffect(() => {
    setSections(readSections())
  }, [])

  const loadAlbums = useCallback(async () => {
    if (!token) return
    setAlbumsLoading(true)
    try {
      setAlbums(await getAdminAlbums(token))
    } catch (error) {
      if (error instanceof Error) notify(error.message, 'error')
    } finally {
      setAlbumsLoading(false)
    }
  }, [notify, token])

  useEffect(() => { void loadAlbums() }, [loadAlbums])

  const updateView = (next: LibraryView) => {
    setView(next)
    window.history.replaceState(null, '', `/admin/library?view=${next}`)
    if (next !== 'photos') setPhotoFilters({})
  }

  const toggleSection = (key: SectionKey) => {
    setSections((current) => {
      const next = { ...current, [key]: !current[key] }
      window.localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const showPhotos = (filters: LibraryPhotoFilters = {}) => {
    setPhotoFilters(filters)
    updateView('photos')
  }

  const openAlbumWorkspace = (albumId: string, tab: AlbumWorkspaceTab) => {
    setAlbumWorkspaceRequest((current) => ({
      albumId,
      tab,
      requestId: (current?.requestId ?? 0) + 1,
    }))
    updateView('albums')
  }

  const openAlbumContextMenu = (event: React.MouseEvent<HTMLButtonElement>, album: AlbumDto) => {
    event.preventDefault()
    const menuWidth = 208
    const menuHeight = 236
    setAlbumContextMenu({
      album,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
    })
  }

  const toggleAlbumPublished = async (album: AlbumDto) => {
    if (!token || updatingAlbumId) return
    setAlbumContextMenu(null)
    setUpdatingAlbumId(album.id)
    try {
      const updated = await updateAlbum(token, album.id, { isPublished: !album.isPublished })
      setAlbums((current) => current.map((item) => item.id === updated.id ? updated : item))
      notify(t('admin.notify_success'), 'success')
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) handleUnauthorized(error)
      else notify(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      setUpdatingAlbumId(null)
    }
  }

  const confirmAlbumDelete = async () => {
    if (!token || !pendingAlbumDelete) return
    const target = pendingAlbumDelete
    try {
      await deleteAlbum(token, target.id)
      setAlbums((current) => current.filter((album) => album.id !== target.id))
      if (photoFilters.albumFilter === target.id) showPhotos()
      if (view === 'albums') {
        setAlbumWorkspaceRequest((current) => ({
          albumId: null,
          tab: 'overview',
          requestId: (current?.requestId ?? 0) + 1,
        }))
      }
      setPendingAlbumDelete(null)
      notify(t('common.deleted'), 'success')
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) handleUnauthorized(error)
      else notify(error instanceof Error ? error.message : t('common.error'), 'error')
    }
  }

  const sortedAlbums = useMemo(
    () => [...albums].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [albums],
  )
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <aside className="flex w-[238px] shrink-0 flex-col overflow-hidden border-r border-border bg-background">
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <NavButton active={view === 'photos' && !photoFilters.categoryFilter && !photoFilters.photoTypeFilter && !photoFilters.albumFilter && !photoFilters.onlyFeatured} icon={Images} label={t('admin.resource_library_all_photos')} onClick={() => showPhotos()} />
          <NavButton active={view === 'photos' && photoFilters.onlyFeatured === true} icon={Star} label={t('admin.featured')} onClick={() => showPhotos({ onlyFeatured: true })} />
          <NavButton active={view === 'film-rolls'} icon={Film} label={t('admin.film_rolls')} onClick={() => updateView('film-rolls')} />

          <SectionHeader open={sections.photoType} label={t('admin.all_types')} onToggle={() => toggleSection('photoType')} />
          {sections.photoType && <div className="space-y-0.5">
            <NavButton active={view === 'photos' && photoFilters.photoTypeFilter === 'digital'} icon={Camera} label={t('admin.upload_type_digital')} onClick={() => showPhotos({ photoTypeFilter: 'digital' })} />
            <NavButton active={view === 'photos' && photoFilters.photoTypeFilter === 'film'} icon={Film} label={t('admin.upload_type_film')} onClick={() => showPhotos({ photoTypeFilter: 'film' })} />
          </div>}

          <SectionHeader open={sections.categories} label={t('ui.category_filter')} onToggle={() => toggleSection('categories')} />
          {sections.categories && <div className="space-y-0.5">
            {categories.filter((category) => category !== 'all' && category !== '全部').map((category) => (
              <NavButton key={category} active={view === 'photos' && photoFilters.categoryFilter === category} icon={Tag} label={category} onClick={() => showPhotos({ categoryFilter: category })} />
            ))}
          </div>}

          <div className="mb-2 mt-5 flex items-center gap-1 px-1">
            <button type="button" onClick={() => toggleSection('albums')} className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted" aria-label={sections.albums ? t('common.collapse') : t('common.expand')}>
              {sections.albums ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
            <button type="button" onClick={() => updateView('albums')} className={cn('flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted', view === 'albums' && 'bg-primary/10 text-foreground')}>
              <FolderOpen size={13} /><span className="truncate">{t('admin.albums')}</span><span className="ml-auto tabular-nums">{albums.length}</span>
            </button>
            <AdminButton onClick={() => { setAlbumCreateSignal((current) => current + 1); updateView('albums') }} adminVariant="icon" size="xs" className="p-1" title={t('admin.create_album')}><Plus size={12} /></AdminButton>
            <AdminButton onClick={() => void loadAlbums()} adminVariant="icon" size="xs" className="p-1" title={t('common.refresh')}>
              {albumsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </AdminButton>
          </div>
          {sections.albums && <div className="space-y-0.5">
            {sortedAlbums.map((album) => <button
              key={album.id}
              type="button"
              onClick={() => showPhotos({ albumFilter: album.id })}
              onContextMenu={(event) => openAlbumContextMenu(event, album)}
              className={cn('flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-muted-foreground hover:bg-muted', view === 'photos' && photoFilters.albumFilter === album.id && 'bg-primary/10 text-foreground')}
              title={album.name}
            >
              <Folder size={14} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{album.name}</span>{!album.isPublished && <EyeOff size={11} />}<span className="tabular-nums">{album.photoCount}</span>
            </button>)}
            {!albumsLoading && sortedAlbums.length === 0 && <p className="px-2.5 py-3 text-[10px] text-muted-foreground">{t('admin.no_albums')}</p>}
          </div>}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden">
        {view === 'photos' ? (
          <LibraryPhotoWorkspace
            key={JSON.stringify(photoFilters)}
            token={token}
            categories={categories}
            albums={albums}
            settings={settings}
            initialFilters={photoFilters}
            t={t}
            notify={notify}
            onUnauthorized={handleUnauthorized}
          />
        ) : view === 'albums' ? (
          <LibraryAlbumsWorkspace
            token={token}
            photos={photos}
            cdnDomain={settings?.cdn_domain?.trim() || undefined}
            t={t}
            notify={notify}
            onUnauthorized={handleUnauthorized}
            onPreview={setPreviewPhoto}
            onAlbumsChanged={loadAlbums}
            createSignal={albumCreateSignal}
            openRequest={albumWorkspaceRequest ?? undefined}
            onOpenRequestHandled={() => setAlbumWorkspaceRequest(null)}
          />
        ) : (
          <LibraryFilmRollWorkspace
            token={token}
            photos={photos}
            cdnDomain={settings?.cdn_domain?.trim() || undefined}
            t={t}
            notify={notify}
            onUnauthorized={handleUnauthorized}
            onPreview={setPreviewPhoto}
            onPhotosChanged={refreshPhotos}
          />
        )}
      </main>

      {albumContextMenu && <AlbumContextMenu
        album={albumContextMenu.album}
        x={albumContextMenu.x}
        y={albumContextMenu.y}
        busy={updatingAlbumId === albumContextMenu.album.id}
        t={t}
        onClose={() => setAlbumContextMenu(null)}
        onOpen={() => {
          showPhotos({ albumFilter: albumContextMenu.album.id })
          setAlbumContextMenu(null)
        }}
        onEdit={() => {
          openAlbumWorkspace(albumContextMenu.album.id, 'overview')
          setAlbumContextMenu(null)
        }}
        onManagePhotos={() => {
          openAlbumWorkspace(albumContextMenu.album.id, 'photos')
          setAlbumContextMenu(null)
        }}
        onTogglePublished={() => void toggleAlbumPublished(albumContextMenu.album)}
        onDelete={() => {
          setPendingAlbumDelete(albumContextMenu.album)
          setAlbumContextMenu(null)
        }}
      />}

      <SimpleDeleteDialog
        isOpen={pendingAlbumDelete !== null}
        title={t('admin.delete_album')}
        message={t('admin.album_delete_confirm')}
        onConfirm={confirmAlbumDelete}
        onCancel={() => setPendingAlbumDelete(null)}
        t={t}
      />

      {previewPhoto && (
        <PhotoPreviewOverlay
          photo={previewPhoto}
          cdnDomain={settings?.cdn_domain?.trim() || undefined}
          t={t}
          onClose={() => setPreviewPhoto(null)}
        />
      )}
    </div>
  )
}

function SectionHeader({ open, label, onToggle }: { open: boolean; label: string; onToggle: () => void }) {
  return <button type="button" onClick={onToggle} className="mb-2 mt-5 flex w-full items-center gap-1 rounded px-1 py-1 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted" aria-expanded={open}>
    {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<span className="truncate">{label}</span>
  </button>
}

function NavButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Images; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn('mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted', active && 'bg-primary text-primary-foreground hover:bg-primary')}>
    <Icon size={15} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{label}</span>
  </button>
}

function AlbumContextMenu({
  album,
  x,
  y,
  busy,
  t,
  onClose,
  onOpen,
  onEdit,
  onManagePhotos,
  onTogglePublished,
  onDelete,
}: {
  album: AlbumDto
  x: number
  y: number
  busy: boolean
  t: (key: string) => string
  onClose: () => void
  onOpen: () => void
  onEdit: () => void
  onManagePhotos: () => void
  onTogglePublished: () => void
  onDelete: () => void
}) {
  useEffect(() => {
    const closeMenu = () => onClose()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }

    window.addEventListener('pointerdown', closeMenu)
    window.addEventListener('blur', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', closeMenu)
      window.removeEventListener('blur', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="menu"
      aria-label={album.name}
      className="fixed z-[130] min-w-52 border border-border bg-popover p-1 shadow-xl"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <p className="max-w-48 truncate px-2.5 py-2 text-xs font-medium text-popover-foreground">{album.name}</p>
      <div className="my-1 h-px bg-border" />
      <button type="button" role="menuitem" onClick={onOpen} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground"><FolderOpen className="h-3.5 w-3.5" />{t('admin.open_album')}</button>
      <button type="button" role="menuitem" onClick={onEdit} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground"><Pencil className="h-3.5 w-3.5" />{t('admin.edit_album')}</button>
      <button type="button" role="menuitem" onClick={onManagePhotos} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground"><Images className="h-3.5 w-3.5" />{t('admin.manage_photos')}</button>
      <div className="my-1 h-px bg-border" />
      <button type="button" role="menuitem" disabled={busy} onClick={onTogglePublished} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-default disabled:opacity-50">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : album.isPublished ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        {t(album.isPublished ? 'admin.unpublish' : 'admin.publish')}
      </button>
      <div className="my-1 h-px bg-border" />
      <button type="button" role="menuitem" onClick={onDelete} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs text-destructive transition-colors hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" />{t('admin.delete_album')}</button>
    </div>,
    document.body,
  )
}
