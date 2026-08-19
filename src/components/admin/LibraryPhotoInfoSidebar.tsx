'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Aperture,
  BookOpen,
  Camera,
  Check,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Film,
  Focus,
  ImageOff,
  Maximize2,
  Pencil,
  RefreshCw,
  Star,
  Sun,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { ApiUnauthorizedError, reanalyzePhotoColors, resolveAssetUrl, updatePhoto } from '@/lib/api'
import type { PhotoDto } from '@/lib/api/types'
import { AdminButton } from '@/components/admin/AdminButton'

interface LibraryPhotoInfoSidebarProps {
  photo: PhotoDto | null
  token: string | null
  cdnDomain?: string
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  onClose: () => void
  onOpenPreview?: (photo: PhotoDto) => void
  onOpenEditor: (photo: PhotoDto) => void
  onEditStory?: (photo: PhotoDto) => void
  onDelete: (id: string) => void
  onToggleFeatured: (photo: PhotoDto) => Promise<void>
  onSave?: (photo: PhotoDto) => void
  onUnauthorized: (error?: unknown) => void
}

function formatDate(value: string | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

function formatBytes(value: number | undefined) {
  if (!value) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function LibraryPhotoInfoSidebar({
  photo,
  token,
  cdnDomain,
  t,
  notify,
  onClose,
  onOpenPreview,
  onOpenEditor,
  onEditStory,
  onDelete,
  onToggleFeatured,
  onSave,
  onUnauthorized,
}: LibraryPhotoInfoSidebarProps) {
  const [updatingVisibility, setUpdatingVisibility] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copyTimerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
  }, [])

  const handleToggleVisibility = async () => {
    if (!photo || !token || updatingVisibility) return

    setUpdatingVisibility(true)
    try {
      const updated = await updatePhoto({
        token,
        id: photo.id,
        patch: { showFlag: !(photo.showFlag ?? true) },
      })
      onSave?.(updated)
      notify(t(photo.showFlag ?? true ? 'admin.hide_in_gallery' : 'admin.show_in_gallery'))
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        onUnauthorized(error)
        return
      }
      notify(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      setUpdatingVisibility(false)
    }
  }

  const handleCopy = async (value: string, key: string) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(`${photo?.id || 'photo'}:${key}`)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopiedKey(null), 1200)
      notify(t('common.copied'))
    } catch {
      notify(t('common.error'), 'error')
    }
  }

  const handleReanalyze = async () => {
    if (!photo || !token || reanalyzing) return
    setReanalyzing(true)
    try {
      const updated = await reanalyzePhotoColors(token, photo.id)
      onSave?.(updated)
      notify(t('admin.notify_success'))
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) onUnauthorized(error)
      else notify(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      setReanalyzing(false)
    }
  }

  if (!photo) {
    return (
      <aside className="hidden h-full w-[304px] shrink-0 items-center justify-center border-l border-border bg-background px-6 text-center xl:flex">
        <div className="text-muted-foreground">
          <ImageOff className="mx-auto mb-3 h-6 w-6" />
          <p className="text-xs">{t('admin.resource_library_no_photo_selected')}</p>
        </div>
      </aside>
    )
  }

  const isVisible = photo.showFlag ?? true
  const details = [
    { label: t('admin.resource_library_dimensions'), value: photo.width && photo.height ? `${photo.width} × ${photo.height}` : '—' },
    { label: t('admin.storage_file_size'), value: formatBytes(photo.size) },
    { label: t('admin.resource_library_captured_at'), value: formatDate(photo.takenAt) },
    { label: t('admin.storage_provider'), value: photo.storageProvider?.toUpperCase() || '—' },
  ]
  const copyRows = [
    { key: 'id', label: t('admin.resource_library_photo_id'), value: photo.id },
    { key: 'storage-key', label: t('admin.resource_library_storage_path'), value: photo.path || '' },
    { key: 'thumbnail-url', label: t('admin.resource_library_thumbnail_url'), value: photo.thumbnailUrl ? resolveAssetUrl(photo.thumbnailUrl, cdnDomain) : '' },
    { key: 'original-url', label: t('admin.resource_library_original_url'), value: resolveAssetUrl(photo.url, cdnDomain) },
  ]
  const cameraDetails = [
    { label: t('admin.camera'), icon: Camera, value: photo.cameraModel || '—' },
    { label: t('admin.lens'), icon: Focus, value: photo.lensModel || '—' },
    { label: t('admin.resource_library_aperture'), icon: Aperture, value: photo.aperture || '—' },
    { label: t('admin.resource_library_shutter'), icon: Clock, value: photo.shutterSpeed || '—' },
    { label: 'ISO', icon: Sun, value: photo.iso ? String(photo.iso) : '—' },
    { label: t('admin.resource_library_focal_length'), icon: Film, value: photo.focalLength || '—' },
  ]

  return (
    <aside className="hidden h-full w-[304px] shrink-0 flex-col overflow-hidden border-l border-border bg-background xl:flex">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t('admin.resource_library_photo_details')}</span>
        <AdminButton onClick={onClose} adminVariant="icon" size="xs" className="p-1.5" title={t('common.close')}>
          <X className="h-3.5 w-3.5" />
        </AdminButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-border p-3">
          <button
            type="button"
            onClick={() => onOpenPreview?.(photo)}
            className="group relative block aspect-[4/3] w-full overflow-hidden rounded-md bg-muted"
            title={t('admin.photo_preview')}
          >
            <img
              src={resolveAssetUrl(photo.thumbnailUrl || photo.url, cdnDomain)}
              alt={photo.title}
              className="h-full w-full object-contain"
            />
            <span className="absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/65 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <Maximize2 className="h-4 w-4" />
            </span>
          </button>
        </div>

        <div className="space-y-5 p-4">
          <section>
            <div className="flex items-start justify-between gap-2">
              <h2 className="min-w-0 break-words text-sm font-semibold leading-5">
                {photo.title || t('admin.resource_library_untitled_photo')}
              </h2>
              <div className="flex shrink-0 items-center gap-0.5">
                <AdminButton
                  onClick={() => void onToggleFeatured(photo)}
                  adminVariant="icon"
                  size="xs"
                  className="p-1.5"
                  title={photo.isFeatured ? t('admin.notify_featured_removed') : t('admin.notify_featured_added')}
                >
                  <Star className={`h-4 w-4 ${photo.isFeatured ? 'fill-current text-primary' : ''}`} />
                </AdminButton>
                <AdminButton
                  onClick={() => void handleToggleVisibility()}
                  disabled={updatingVisibility}
                  adminVariant="icon"
                  size="xs"
                  className="p-1.5"
                  title={isVisible ? t('admin.hide_in_gallery') : t('admin.show_in_gallery')}
                >
                  {isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-primary" />}
                </AdminButton>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {photo.category && (
                <span className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">
                  <Tag className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{photo.category}</span>
                </span>
              )}
              <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">
                {photo.photoType === 'film' ? t('admin.upload_type_film') : t('admin.upload_type_digital')}
              </span>
              {photo.filmRollName && (
                <span className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">
                  <Film className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{photo.filmRollName}</span>
                </span>
              )}
            </div>
          </section>

          <section className="border-t border-border pt-4">
            <SectionLabel label={t('admin.resource_library_basic_info')} />
            <dl className="grid grid-cols-[82px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[11px]">
              {details.map((detail) => (
                <div key={detail.label} className="contents">
                  <dt className="text-muted-foreground">{detail.label}</dt>
                  <dd className="truncate" title={detail.value}>{detail.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="border-t border-border pt-4">
            <SectionLabel label={t('admin.resource_library_file_info')} />
            <div className="space-y-1">
              {copyRows.map((row) => (
                <div key={row.key} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60">
                  <span className="w-[76px] shrink-0 text-[10px] text-muted-foreground">{row.label}</span>
                  <span className="min-w-0 flex-1 truncate text-[10px]" title={row.value || '—'}>{row.value || '—'}</span>
                  <button
                    type="button"
                    disabled={!row.value}
                    onClick={() => void handleCopy(row.value, row.key)}
                    className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-35"
                    title={t('admin.resource_library_copy_value')}
                  >
                    {copiedKey === `${photo.id}:${row.key}` ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-border pt-4">
            <SectionLabel label={t('admin.resource_library_shooting_info')} />
            <div className="grid grid-cols-2 gap-1.5">
              {cameraDetails.map(({ label, icon: Icon, value }) => (
                <div key={label} className="min-w-0 rounded-md border border-border bg-muted/40 px-2 py-1.5">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                    <Icon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{label}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] font-medium" title={value}>{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-border pt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <SectionLabel label={t('admin.resource_library_palette')} className="mb-0" />
              <button
                type="button"
                disabled={reanalyzing || !token}
                onClick={() => void handleReanalyze()}
                className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-50"
                title={t('admin.resource_library_reanalyze_colors')}
              >
                <RefreshCw className={`h-3 w-3 ${reanalyzing ? 'animate-spin' : ''}`} />
                {t('admin.resource_library_reanalyze')}
              </button>
            </div>
            {photo.dominantColors && photo.dominantColors.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {photo.dominantColors.map((color) => (
                  <span key={color} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="size-4 rounded border border-border" style={{ backgroundColor: color }} />
                    {color}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground">{t('admin.resource_library_no_palette')}</p>
            )}
          </section>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-border p-3">
        <AdminButton onClick={() => onOpenEditor(photo)} adminVariant="outline" size="sm" className="min-w-0 flex-1 px-2 text-[10px]">
          <Pencil className="h-3.5 w-3.5" />
          {t('admin.edit_photo')}
        </AdminButton>
        <AdminButton onClick={() => onEditStory?.(photo)} disabled={!onEditStory} adminVariant="outline" size="sm" className="min-w-0 flex-1 px-2 text-[10px]">
          <BookOpen className="h-3.5 w-3.5" />
          {t('admin.edit_story')}
        </AdminButton>
        <AdminButton
          onClick={() => {
            onDelete(photo.id)
            onClose()
          }}
          adminVariant="iconDestructive"
          size="sm"
          className="p-2"
          title={t('common.delete')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </AdminButton>
      </div>
    </aside>
  )
}

function SectionLabel({ label, className = 'mb-2' }: { label: string; className?: string }) {
  return <p className={`${className} text-[10px] font-bold uppercase tracking-widest text-muted-foreground`}>{label}</p>
}
