import { Check, Image as ImageIcon, Plus, RefreshCw, Search, Star, X } from 'lucide-react'

import { resolveAssetUrl } from '@/lib/api'
import { t, type Locale } from '@/lib/i18n'
import type { Album, Photo } from '@/types'
import { inputStyle, isCoverPhoto } from './helpers'

export function AlbumPhotos({ album, onRemovePhoto, onSetCover, onShowSelector, language }: {
  album: Album
  onRemovePhoto: (photoId: string) => void
  onSetCover: (photoId: string) => void
  onShowSelector: () => void
  language: Locale
}) {
  const albumPhotos = album.photos ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{albumPhotos.length} {t('admin.photos', language)}</span>
        <button onClick={onShowSelector} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          <Plus size={14} /> {t('admin.add_photos', language)}
        </button>
      </div>

      {albumPhotos.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          {albumPhotos.map(photo => {
            const cover = isCoverPhoto(album, photo)
            return (
              <div key={photo.id} className="relative group rounded-lg overflow-hidden border" style={{ borderColor: cover ? 'var(--primary)' : 'var(--border)', backgroundColor: 'var(--muted)' }}>
                <div className="aspect-square">
                  <img src={resolveAssetUrl(photo.thumbnailUrl || photo.url)} alt={photo.title} className="w-full h-full object-cover" />
                </div>
                <div className="absolute inset-x-0 bottom-0 px-2 pt-6 pb-2 bg-gradient-to-t from-black/80 to-transparent">
                  <p className="text-[11px] text-white truncate">{photo.title}</p>
                </div>
                {cover && (
                  <span className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/65 text-[10px] text-white">
                    <Star size={10} fill="currentColor" /> {t('admin.cover', language)}
                  </span>
                )}
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!cover && (
                    <button onClick={() => onSetCover(photo.id)} title={t('admin.set_cover', language)} className="p-1.5 rounded-md" style={{ backgroundColor: 'rgba(0,0,0,0.65)', color: 'white' }}>
                      <Star size={12} />
                    </button>
                  )}
                  <button onClick={() => onRemovePhoto(photo.id)} title={t('admin.remove', language)} className="p-1.5 rounded-md" style={{ backgroundColor: 'rgba(0,0,0,0.65)', color: 'white' }}>
                    <X size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-52 border border-dashed rounded-lg" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
          <ImageIcon size={32} className="mb-3 opacity-40" />
          <p className="text-sm mb-4">{t('admin.album_empty', language)}</p>
          <button onClick={onShowSelector} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border" style={{ borderColor: 'var(--border)' }}>
            <Plus size={14} /> {t('admin.add_photos', language)}
          </button>
        </div>
      )}
    </div>
  )
}

export function AlbumPhotoSelector({ photos, selectedIds, search, saving, onSearchChange, onToggle, onConfirm, onClose, language }: {
  photos: Photo[]
  selectedIds: Set<string>
  search: string
  saving: boolean
  onSearchChange: (value: string) => void
  onToggle: (photoId: string) => void
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
            <input value={search} onChange={event => onSearchChange(event.target.value)} placeholder={t('common.search', language)} className="w-56 pl-8 pr-3 py-1.5 text-xs rounded-md border outline-none" style={inputStyle()} />
          </div>
        </div>
        <button onClick={onConfirm} disabled={saving || selectedIds.size === 0} className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md disabled:opacity-50" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
          {t('admin.confirm_add', language)} ({selectedIds.size})
        </button>
      </div>

      {photos.length === 0 ? (
        <div className="flex items-center justify-center h-48 border border-dashed rounded-lg" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
          <p className="text-sm">{t('admin.no_photos_available', language)}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-5 xl:grid-cols-7 gap-2">
          {photos.map(photo => (
            <button key={photo.id} onClick={() => onToggle(photo.id)} className="relative aspect-square rounded-md overflow-hidden border-2 transition-all" style={{ borderColor: selectedIds.has(photo.id) ? 'var(--primary)' : 'transparent', backgroundColor: 'var(--muted)' }}>
              <img src={resolveAssetUrl(photo.thumbnailUrl || photo.url)} alt={photo.title} className="w-full h-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 px-1.5 pt-5 pb-1.5 text-left text-[10px] text-white truncate bg-gradient-to-t from-black/75 to-transparent">{photo.title}</span>
              {selectedIds.has(photo.id) && <span className="absolute top-1.5 right-1.5 flex items-center justify-center w-5 h-5 rounded-full" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}><Check size={12} /></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
