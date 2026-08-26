import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Download, FolderOpen, Image as ImageIcon, Loader2 } from 'lucide-react'
import { localLibraryApi, parseLocalLibraryError } from '@/features/library/local/api'
import type { RecentLibrary } from '@/features/library/local/types'

export function useImageContextMenu(
  savedInitially: boolean,
  onSave: () => Promise<void>,
  onDownload: () => Promise<void>,
) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [saved, setSaved] = useState(savedInitially)

  useEffect(() => {
    if (savedInitially) setSaved(true)
  }, [savedInitially])

  useEffect(() => {
    if (!contextMenu) return
    const closeMenu = () => setContextMenu(null)
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
  }, [contextMenu])

  const handleContextMenu = (event: React.MouseEvent<HTMLImageElement>) => {
    event.preventDefault()
    const menuWidth = 176
    const menuHeight = 84
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
    })
  }

  const handleSave = async () => {
    if (saving || saved) return
    setContextMenu(null)
    setSaving(true)
    try {
      await onSave()
      setSaved(true)
    } catch {
      // The save callback reports the user-facing error.
    } finally {
      setSaving(false)
    }
  }

  const handleDownload = async () => {
    if (downloading) return
    setContextMenu(null)
    setDownloading(true)
    try {
      await onDownload()
    } catch {
      // The download callback reports the user-facing error.
    } finally {
      setDownloading(false)
    }
  }

  return { contextMenu, saving, downloading, saved, handleContextMenu, handleSave, handleDownload }
}

export function ImageContextMenu({
  position,
  saving,
  downloading,
  saved,
  onSave,
  onDownload,
  onSelectLibrary,
  t,
}: {
  position: { x: number; y: number } | null
  saving: boolean
  downloading: boolean
  saved: boolean
  onSave: () => Promise<void>
  onDownload: () => Promise<void>
  onSelectLibrary: (library: RecentLibrary) => Promise<void>
  t: (key: string) => string
}) {
  const [libraryMenuOpen, setLibraryMenuOpen] = useState(false)
  const [libraries, setLibraries] = useState<RecentLibrary[]>([])
  const [librariesLoading, setLibrariesLoading] = useState(false)
  const [librariesError, setLibrariesError] = useState('')
  useEffect(() => {
    if (!position) setLibraryMenuOpen(false)
  }, [position])
  const loadLibraries = async () => {
    if (librariesLoading) return
    setLibrariesLoading(true)
    setLibrariesError('')
    try {
      setLibraries((await localLibraryApi.entryState()).recent)
    } catch (cause) {
      setLibrariesError(parseLocalLibraryError(cause).message)
    } finally {
      setLibrariesLoading(false)
    }
  }
  if (!position || typeof document === 'undefined') return null
  return createPortal(
    <div
      role="menu"
      className="fixed z-50 min-w-44 rounded-md border p-1 shadow-xl"
      style={{
        left: position.x,
        top: position.y,
        borderColor: 'var(--border)',
        backgroundColor: 'var(--background)',
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        disabled={saving || saved}
        onClick={() => void onSave()}
        className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-default disabled:opacity-50"
        style={{ color: 'var(--foreground)' }}
      >
        {saving ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
        {saved ? t('admin.ai_saved_to_album') : t('admin.ai_save_to_album')}
      </button>
      <div className="relative" onMouseEnter={() => { if (!libraryMenuOpen) { setLibraryMenuOpen(true); void loadLibraries() } }}>
        <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={libraryMenuOpen} onClick={() => { setLibraryMenuOpen((open) => !open); if (!libraryMenuOpen) void loadLibraries() }} className="flex w-full items-center justify-between gap-2 rounded px-2.5 py-2 text-left text-xs hover:bg-accent" style={{ color: 'var(--foreground)' }}>
          <span className="flex items-center gap-2"><FolderOpen size={13} />{t('admin.ai_save_to_library')}</span><ChevronRight size={13} />
        </button>
        {libraryMenuOpen && <div role="menu" className="absolute left-full top-0 ml-1 min-w-52 rounded-md border p-1 shadow-xl" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }} onPointerDown={(event) => event.stopPropagation()}>
          {librariesLoading ? <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin" />{t('admin.loading')}</div> : librariesError ? <div className="max-w-56 px-2.5 py-2 text-xs text-destructive">{librariesError}</div> : libraries.length === 0 ? <div className="px-2.5 py-2 text-xs text-muted-foreground">{t('admin.ai_no_local_libraries')}</div> : libraries.map((library) => <button key={library.path} type="button" role="menuitem" disabled={!library.available} onClick={() => void onSelectLibrary(library)} className="flex w-full flex-col rounded px-2.5 py-2 text-left text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"><span className="truncate">{library.name}</span><span className="truncate text-[10px] text-muted-foreground">{library.available ? library.path : t('admin.ai_library_unavailable')}</span></button>)}
        </div>}
      </div>
      <button
        type="button"
        role="menuitem"
        disabled={downloading}
        onClick={() => void onDownload()}
        className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-default disabled:opacity-50"
        style={{ color: 'var(--foreground)' }}
      >
        {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        {t('admin.ai_download_to_local')}
      </button>
    </div>,
    document.body,
  )
}
