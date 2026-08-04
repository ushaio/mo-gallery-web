import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Aperture, BookOpen, Camera, Check, Clock, Copy, Crosshair, Eye, EyeOff, Film, Focus,
  ImageOff, Maximize2, Pencil, RefreshCw, Star, Sun, Tag, Trash2,
} from 'lucide-react'
import { resolveAssetUrl, reanalyzePhotoColors, ApiUnauthorizedError, type PhotoDto } from '@/lib/api'
import { normalizeDominantColors } from '@/lib/photoColors'
import type { Photo } from '@/types'

interface Props {
  photo: Photo | null
  token: string | null
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  onOpenPreview: (photo: Photo) => void
  onEditDetails: (photo: Photo) => void
  onEditStory: (photo: Photo) => void
  onToggleFeatured: (id: string) => void
  onToggleShow: (id: string) => void
  onDelete: (photo: Photo) => void
  onSave: (photo: PhotoDto) => void
  onUnauthorized: () => void
}

const missing = '—'

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return missing
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function SectionLabel({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      {action}
    </div>
  )
}

export function PhotoInfoSidebar({
  photo, token, t, notify, onOpenPreview, onEditDetails, onEditStory,
  onToggleFeatured, onToggleShow, onDelete, onSave, onUnauthorized,
}: Props) {
  const [reanalyzing, setReanalyzing] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copyTimerRef = useRef<number | null>(null)

  const specs = useMemo(() => {
    if (!photo) return []
    return [
      { label: t('admin.camera'), icon: Camera, value: photo.cameraModel || missing },
      { label: t('gallery.aperture'), icon: Aperture, value: photo.aperture || missing },
      { label: t('gallery.shutter'), icon: Clock, value: photo.shutterSpeed || missing },
      { label: t('gallery.iso'), icon: Sun, value: photo.iso ? String(photo.iso) : missing },
      { label: t('gallery.focal'), icon: Crosshair, value: photo.focalLength || missing },
      { label: t('admin.lens'), icon: Focus, value: photo.lensModel || missing },
    ]
  }, [photo, t])

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      notify(t('common.copied'), 'success')
      setCopiedKey(key)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopiedKey(null), 1200)
    } catch (error) {
      console.error('Failed to copy text:', error)
      notify(t('common.error'), 'error')
    }
  }

  const handleReanalyze = async () => {
    if (!token || !photo || reanalyzing) return
    setReanalyzing(true)
    try {
      const updated = await reanalyzePhotoColors(token, photo.id)
      onSave(updated)
      notify(t('admin.notify_success'), 'success')
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) onUnauthorized()
      else notify(err instanceof Error ? err.message : t('common.error'), 'error')
    } finally {
      setReanalyzing(false)
    }
  }

  if (!photo) {
    return (
      <aside
        className="hidden h-full w-[292px] shrink-0 items-center justify-center border-l p-6 text-center xl:flex"
        style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
      >
        <div>
          <ImageOff size={26} className="mx-auto mb-3" />
          <p className="text-xs">{t('admin.no_photo_selected')}</p>
        </div>
      </aside>
    )
  }

  const storagePath = photo.storageKey ? photo.storageKey.replace(/\/[^/]+$/, '') : ''
  const dominantColors = normalizeDominantColors(photo.dominantColors)
  const copyableUrls = [
    { label: t('admin.thumbnail_url'), key: 'thumb', value: photo.thumbnailUrl ? resolveAssetUrl(photo.thumbnailUrl) : '' },
    { label: t('admin.original_url'), key: 'original', value: resolveAssetUrl(photo.url) },
  ]

  return (
    <aside
      className="custom-scrollbar hidden h-full w-[292px] shrink-0 overflow-y-auto border-l bg-card xl:block"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* 预览缩略图：点击打开大图 */}
      <div className="border-b p-3" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          onClick={() => onOpenPreview(photo)}
          className="group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-secondary"
        >
          <img
            src={resolveAssetUrl(photo.thumbnailUrl || photo.url)}
            alt={photo.title || ''}
            className="h-full w-full object-contain"
          />
          <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white opacity-0 transition group-hover:opacity-100">
            <Maximize2 size={15} />
          </span>
        </button>
        <p className="mt-2 text-center text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
          {t('admin.double_click_hint')}
        </p>
      </div>

      <div className="space-y-5 p-4">
        {/* 标题 + 快捷操作 */}
        <section>
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 break-words font-sans text-sm font-semibold leading-5">
              {photo.title || t('admin.untitled_photo')}
            </h2>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                title={photo.isFeatured ? t('admin.notify_featured_removed') : t('admin.notify_featured_added')}
                aria-label={photo.isFeatured ? t('admin.notify_featured_removed') : t('admin.notify_featured_added')}
                onClick={() => onToggleFeatured(photo.id)}
                className="flex size-8 items-center justify-center rounded-md hover:bg-secondary"
              >
                <Star size={17} fill={photo.isFeatured ? 'currentColor' : 'none'} style={{ color: photo.isFeatured ? 'var(--primary)' : 'var(--muted-foreground)' }} />
              </button>
              <button
                type="button"
                title={photo.showFlag ? t('admin.hide_in_gallery') : t('admin.show_in_gallery')}
                aria-label={photo.showFlag ? t('admin.hide_in_gallery') : t('admin.show_in_gallery')}
                onClick={() => onToggleShow(photo.id)}
                className="flex size-8 items-center justify-center rounded-md hover:bg-secondary"
                style={{ color: photo.showFlag ? 'var(--muted-foreground)' : 'var(--primary)' }}
              >
                {photo.showFlag ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleCopy(photo.id, 'id')}
            title={`${t('admin.copy_link')}: ${photo.id}`}
            className="group mt-1.5 flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left font-mono text-[10px] transition hover:bg-secondary"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {copiedKey === 'id'
              ? <Check size={11} className="shrink-0 text-primary" />
              : <Copy size={11} className="shrink-0 opacity-0 transition group-hover:opacity-100" />}
            <span className="break-all">{photo.id}</span>
          </button>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {photo.category && (
              <span className="flex items-center gap-1 rounded border bg-secondary px-1.5 py-0.5 text-[10px]" style={{ borderColor: 'var(--border)' }}>
                <Tag size={9} style={{ color: 'var(--muted-foreground)' }} />
                <span className="truncate">{photo.category}</span>
              </span>
            )}
            <span className="rounded border bg-secondary px-1.5 py-0.5 text-[10px]" style={{ borderColor: 'var(--border)' }}>
              {photo.photoType === 'film' ? t('admin.upload_type_film') : t('admin.upload_type_digital')}
            </span>
            {photo.filmRollName && (
              <span className="flex items-center gap-1 rounded border bg-secondary px-1.5 py-0.5 text-[10px]" style={{ borderColor: 'var(--border)' }}>
                <Film size={9} style={{ color: 'var(--muted-foreground)' }} />
                <span className="truncate">{photo.filmRollName}</span>
              </span>
            )}
            {photo.isFeatured && (
              <span className="flex items-center gap-1 rounded border bg-secondary px-1.5 py-0.5 text-[10px]" style={{ borderColor: 'var(--border)' }}>
                <Star size={9} fill="currentColor" />
                {t('gallery.featured')}
              </span>
            )}
          </div>
        </section>

        {/* 基本信息 */}
        <section className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <SectionLabel label={t('admin.basic_info')} />
          <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-2 text-[11px]">
            <dt style={{ color: 'var(--muted-foreground)' }}>{t('gallery.dimensions')}</dt>
            <dd>{photo.width && photo.height ? `${photo.width} × ${photo.height}` : missing}</dd>
            <dt style={{ color: 'var(--muted-foreground)' }}>{t('admin.file_size')}</dt>
            <dd>{photo.size ? formatBytes(photo.size) : missing}</dd>
            <dt style={{ color: 'var(--muted-foreground)' }}>{t('admin.captured_on')}</dt>
            <dd>{formatDate(photo.takenAt || photo.createdAt)}</dd>
            <dt style={{ color: 'var(--muted-foreground)' }}>{t('gallery.timeline_uploaded')}</dt>
            <dd>{formatDate(photo.createdAt)}</dd>
            <dt style={{ color: 'var(--muted-foreground)' }}>{t('admin.provider')}</dt>
            <dd className="uppercase">{photo.storageProvider || missing}</dd>
          </dl>
        </section>

        {/* 拍摄参数 */}
        <section className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <SectionLabel label={t('admin.shooting_info')} />
          <div className="grid grid-cols-2 gap-1.5">
            {specs.map(({ label, icon: Icon, value }) => (
              <div key={label} className="min-w-0 rounded-md border bg-secondary/40 px-2 py-1.5" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                  <Icon size={10} className="shrink-0 opacity-70" />
                  <span className="truncate">{label}</span>
                </div>
                <p className="mt-0.5 truncate text-[11px] font-medium" title={value}>{value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 色彩分析 */}
        <section className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <SectionLabel
            label={t('gallery.palette')}
            action={(
              <button
                type="button"
                disabled={reanalyzing}
                onClick={handleReanalyze}
                title={t('admin.re_analyze')}
                className="flex items-center gap-1 rounded p-1 text-[10px] transition-colors hover:bg-secondary disabled:cursor-wait disabled:opacity-50"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <RefreshCw size={11} className={reanalyzing ? 'animate-spin' : ''} />
                {t('admin.re_analyze')}
              </button>
            )}
          />
          {dominantColors.length > 0 ? (
            <div className="flex h-7 overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)' }}>
              {dominantColors.map((color) => (
                <span
                  key={color}
                  title={`${t('admin.copy_link')}: ${color}`}
                  onClick={() => handleCopy(color, `color-${color}`)}
                  className="min-w-0 flex-1 cursor-pointer transition-opacity hover:opacity-85"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          ) : (
            <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{t('admin.no_color_data')}</p>
          )}
        </section>

        {/* 文件与存储 */}
        <section className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <SectionLabel label={t('admin.file_storage')} />
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>{t('admin.path_prefix')}</span>
              <button
                type="button"
                disabled={!storagePath}
                onClick={() => handleCopy(storagePath, 'path')}
                className="flex items-center gap-1 rounded p-1 text-[10px] transition-colors hover:bg-secondary disabled:opacity-40"
                title={t('admin.copy_link')}
              >
                {copiedKey === 'path' ? <Check size={11} className="text-primary" /> : <Copy size={12} style={{ color: 'var(--muted-foreground)' }} />}
              </button>
            </div>
            <p className="break-all rounded-md border bg-input px-2.5 py-2 font-mono text-[10px]" style={{ borderColor: 'var(--border)' }}>
              {storagePath || missing}
            </p>
            {copyableUrls.map((item) => (
              <div key={item.key} className="flex items-start gap-2 rounded-md border px-2.5 py-2" style={{ borderColor: 'var(--border)' }}>
                <button
                  type="button"
                  disabled={!item.value}
                  onClick={() => handleCopy(item.value, item.key)}
                  className="mt-0.5 shrink-0 transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-40"
                  title={t('admin.copy_link')}
                >
                  {copiedKey === item.key ? <Check size={13} className="text-primary" /> : <Copy size={13} style={{ color: 'var(--muted-foreground)' }} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>{item.label}</p>
                  <p className="mt-0.5 break-all font-mono text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                    {item.value || t('admin.not_available')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 操作 */}
        <section className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <SectionLabel label={t('admin.actions')} />
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => onEditDetails(photo)}
              className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              <Pencil size={14} />
              {t('admin.edit_details')}
            </button>
            <button
              type="button"
              onClick={() => onEditStory(photo)}
              className="flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors hover:bg-secondary"
              style={{ borderColor: 'var(--border)' }}
            >
              <BookOpen size={14} style={{ color: 'var(--muted-foreground)' }} />
              {t('admin.edit_story')}
            </button>
            <button
              type="button"
              onClick={() => onDelete(photo)}
              className="flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors hover:bg-secondary"
              style={{ borderColor: 'var(--border)', color: 'var(--destructive)' }}
            >
              <Trash2 size={14} />
              {t('admin.delete')}
            </button>
          </div>
        </section>
      </div>
    </aside>
  )
}
