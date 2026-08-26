import { useState } from 'react'
import type { ReactNode } from 'react'
import { Image as ImageIcon, MapPin } from 'lucide-react'

import { resolveAssetUrl } from '@/lib/api'
import { t, type Locale } from '@/lib/i18n'
import type { Album } from '@/types'
import { inputStyle } from './helpers'

export function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block mb-1.5 text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
        {label}
        {required && <span className="ml-0.5" style={{ color: 'var(--destructive)' }}>*</span>}
      </span>
      {children}
    </label>
  )
}

export function AlbumPreviewCard({ album, language }: { album: Album; language: Locale }) {
  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
      <div className="aspect-video relative" style={{ backgroundColor: 'var(--muted)' }}>
        {album.coverUrl ? (
          <img src={resolveAssetUrl(album.coverUrl)} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-1.5" style={{ color: 'var(--muted-foreground)' }}>
            <ImageIcon size={24} className="opacity-40" />
            <span className="text-[10px]">{t('admin.no_cover', language)}</span>
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-sm font-medium truncate">{album.name.trim() || t('admin.untitled_album', language)}</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
            style={{
              backgroundColor: album.isPublished ? 'var(--accent)' : 'var(--muted)',
              color: album.isPublished ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
            }}>
            {album.isPublished ? t('admin.albums_status_published', language) : t('admin.albums_status_draft', language)}
          </span>
        </div>
        {album.location && (
          <p className="mb-1 flex items-center gap-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
            <MapPin size={12} className="shrink-0" />
            <span className="truncate">{album.location}</span>
          </p>
        )}
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          {album.photoCount} {t('admin.photos', language)}
        </p>
      </div>
    </div>
  )
}

export function AlbumOverview({ album, onChange, language, autoFocus }: {
  album: Album
  onChange: (album: Album) => void
  language: Locale
  autoFocus?: boolean
}) {
  const [nameTouched, setNameTouched] = useState(false)
  const update = (patch: Partial<Album>) => onChange({ ...album, ...patch })
  const nameEmpty = !album.name.trim()

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-5">
        <section className="rounded-lg border p-5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
          <h3 className="mb-4 text-sm font-medium">{t('admin.album_basic_info', language)}</h3>
          <div className="space-y-4">
            <Field label={t('admin.album_name', language)} required>
              <input
                autoFocus={autoFocus}
                value={album.name}
                onChange={event => update({ name: event.target.value })}
                onBlur={() => setNameTouched(true)}
                placeholder={t('admin.album_name_placeholder', language)}
                maxLength={60}
                className="w-full px-3 py-2 text-sm rounded-lg border outline-none transition-colors"
                style={{ ...inputStyle(), borderColor: nameTouched && nameEmpty ? 'var(--destructive)' : 'var(--border)' }}
              />
              {nameTouched && nameEmpty && (
                <p className="mt-1.5 text-xs" style={{ color: 'var(--destructive)' }}>
                  {t('admin.album_name_required', language)}
                </p>
              )}
            </Field>
            <Field label={t('admin.album_location', language)}>
              <div className="relative">
                <MapPin size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
                <input
                  value={album.location ?? ''}
                  onChange={event => update({ location: event.target.value })}
                  placeholder={t('admin.album_location_placeholder', language)}
                  maxLength={80}
                  className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none"
                  style={inputStyle()}
                />
              </div>
            </Field>
            <Field label={t('admin.description', language)}>
              <textarea
                value={album.description ?? ''}
                onChange={event => update({ description: event.target.value })}
                placeholder={t('admin.description_placeholder', language)}
                rows={4}
                maxLength={300}
                className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none"
                style={inputStyle()}
              />
              <p className="mt-1 text-right text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                {(album.description ?? '').length}/300
              </p>
            </Field>
          </div>
        </section>

        <section className="rounded-lg border p-5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
          <h3 className="mb-4 text-sm font-medium">{t('admin.album_display_settings', language)}</h3>
          <div className="space-y-4">
            <Field label={t('admin.sort_order', language)}>
              <input
                type="number"
                value={album.sortOrder}
                onChange={event => update({ sortOrder: Number(event.target.value) || 0 })}
                className="w-40 px-3 py-2 text-sm rounded-lg border outline-none"
                style={inputStyle()}
              />
              <p className="mt-1.5 text-xs" style={{ color: 'var(--muted-foreground)' }}>{t('admin.sort_order_hint', language)}</p>
            </Field>
            <label className="flex items-start gap-3 p-4 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}>
              <input type="checkbox" checked={album.isPublished} onChange={event => update({ isPublished: event.target.checked })} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">{t('admin.publish', language)}</span>
                <span className="block mt-0.5 text-xs" style={{ color: 'var(--muted-foreground)' }}>{t('admin.publish_hint', language)}</span>
              </span>
            </label>
          </div>
        </section>
      </div>

      <div className="lg:sticky lg:top-0">
        <p className="mb-2 text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
          {t('admin.album_preview', language)}
        </p>
        <AlbumPreviewCard album={album} language={language} />
      </div>
    </div>
  )
}
