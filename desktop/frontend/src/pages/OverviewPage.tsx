import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, ElementType, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Aperture,
  BookMarked,
  BookOpen,
  Camera,
  Clock,
  EyeOff,
  Film,
  FolderOpen,
  HardDrive,
  Image,
  MessageSquare,
  Star,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Skeleton } from '@/components/admin/Skeleton'
import {
  getEquipmentItemsCache,
  getOverviewCache,
  isEquipmentCacheLoaded,
  setEquipmentItemsCache,
  setOverviewCache,
  type EquipmentItem,
  type EquipmentKind,
} from '@/lib/app-cache'
import { resolveAssetUrl } from '@/lib/api'
import { t } from '@/lib/i18n'
import { usePreferences } from '@/store/preferences'
import { GetCameras, GetLenses, GetOverview } from '../../wailsjs/go/main/App'
import type { services } from '../../wailsjs/go/models'
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime'

type OverviewDTO = services.OverviewDTO
type RecentPhoto = services.RecentPhotoDTO
type RecentTextItem = services.RecentStoryDTO | services.RecentBlogDTO

const OVERVIEW_PAGE_CLASS = 'p-6 space-y-6 w-full min-w-0 max-w-6xl mx-auto h-full overflow-y-scroll'
const OVERVIEW_PAGE_STYLE: CSSProperties = { scrollbarGutter: 'stable' }
const SERVER_KEY = 'mo-gallery-server'

function openPublicContent(path: 'story' | 'blog', id: string) {
  const server = localStorage.getItem(SERVER_KEY)?.replace(/\/+$/, '')
  if (!server) return
  BrowserOpenURL(`${server}/${path}/${encodeURIComponent(id)}`)
}

function handleRecentTextClick(path: 'story' | 'blog' | undefined, id: string, isPublished: boolean) {
  if (!path || !isPublished) return
  openPublicContent(path, id)
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return ''
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 0) return ''
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return date.toLocaleDateString('zh-CN')
}

interface StatCardProps {
  icon: ElementType
  label: string
  value: ReactNode
  color: string
  sub?: ReactNode
  to?: string
  loading?: boolean
  showSubSkeleton?: boolean
}

function StatCard({ icon: Icon, label, value, color, sub, to, loading = false, showSubSkeleton = false }: StatCardProps) {
  const navigate = useNavigate()
  const clickable = !!to && !loading

  return (
    <div
      className={`min-w-0 rounded-lg border p-4 transition-colors ${clickable ? 'cursor-pointer hover:opacity-80' : ''}`}
      style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
      onClick={() => {
        if (clickable) navigate(to)
      }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color + '18', color }}>
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs" style={{ color: 'var(--muted-foreground)' }}>{label}</div>
          <div className="text-2xl font-semibold mt-0.5" style={{ color: 'var(--foreground)' }}>
            {loading ? <Skeleton className="h-[30px] w-12" /> : value}
          </div>
          {(sub || showSubSkeleton) && (
            <div className="truncate text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              {loading ? <Skeleton className="h-3 w-28" /> : sub}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface MetricRowProps {
  icon?: ElementType
  label: ReactNode
  value: ReactNode
  loading: boolean
}

function MetricRow({ icon: Icon, label, value, loading }: MetricRowProps) {
  const labelNode = typeof label === 'string'
    ? <span className="truncate">{label}</span>
    : label

  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon size={14} style={{ color: 'var(--muted-foreground)' }} />}
        <span className="min-w-0 text-xs" style={{ color: 'var(--muted-foreground)' }}>{labelNode}</span>
      </div>
      {loading ? (
        <Skeleton className="h-[20px] w-8" />
      ) : (
        <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{value}</span>
      )}
    </div>
  )
}

interface ProgressBarProps {
  label: string
  value: number
  total: number
  color: string
  loading: boolean
}

function ProgressBar({ label, value, total, color, loading }: ProgressBarProps) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="min-w-0">
      <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>
        <span className="min-w-0 truncate">{label}</span>
        {loading ? <Skeleton className="h-3 w-10" /> : <span>{value} / {total}</span>}
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--secondary)' }}>
        {loading ? (
          <Skeleton className="h-full w-full rounded-full" />
        ) : (
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
        )}
      </div>
    </div>
  )
}

interface EquipmentHoverTargetProps {
  label: string
  items: EquipmentItem[]
  loading: boolean
  error: string | null
  noDataLabel: string
  onOpen: () => void
}

function EquipmentHoverTarget({ label, items, loading, error, noDataLabel, onOpen }: EquipmentHoverTargetProps) {
  const [open, setOpen] = useState(false)

  const show = () => {
    setOpen(true)
    onOpen()
  }

  return (
    <button
      type="button"
      className="relative inline-flex appearance-none border-0 bg-transparent p-0 text-inherit"
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={() => setOpen(false)}
      style={{ color: 'inherit', font: 'inherit' }}
    >
      <span className="cursor-help rounded-sm underline decoration-dotted underline-offset-4">
        {label}
      </span>
      {open && (
        <span
          className="absolute left-0 top-full z-50 mt-2 w-56 rounded-lg border p-2 shadow-xl"
          style={{ backgroundColor: 'var(--popover, var(--card))', borderColor: 'var(--border)', color: 'var(--foreground)' }}
        >
          <span className="mb-1 block px-2 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
            {label}
          </span>
          <span className="block max-h-56 overflow-y-auto">
            {loading ? (
              <span className="block space-y-1.5 px-1 py-1">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-6 w-full" />
                ))}
              </span>
            ) : error ? (
              <span className="block px-2 py-2 text-xs" style={{ color: 'var(--destructive)' }}>
                {error}
              </span>
            ) : items.length > 0 ? (
              items.map((item) => (
                <span
                  key={item.id}
                  className="block truncate rounded-md px-2 py-1.5 text-xs"
                  style={{ color: 'var(--foreground)' }}
                >
                  {item.name}
                </span>
              ))
            ) : (
              <span className="block px-2 py-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {noDataLabel}
              </span>
            )}
          </span>
        </span>
      )}
    </button>
  )
}

function RecentPhotoGrid({ photos, loading, noDataLabel }: { photos: RecentPhoto[]; loading: boolean; noDataLabel: string }) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="aspect-square rounded-md" />
        ))}
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="text-xs py-4 text-center" style={{ color: 'var(--muted-foreground)' }}>
        {noDataLabel}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((photo) => {
        const imgSrc = photo.thumbnailUrl
          ? resolveAssetUrl(photo.thumbnailUrl)
          : photo.url
            ? resolveAssetUrl(photo.url)
            : null
        return (
          <div key={photo.id} className="aspect-square rounded-md overflow-hidden" style={{ backgroundColor: 'var(--secondary)' }}>
            {imgSrc ? (
              <img src={imgSrc} alt={photo.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Image size={16} style={{ color: 'var(--muted-foreground)' }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface RecentListProps {
  icon: ElementType
  title: string
  items: RecentTextItem[]
  loading: boolean
  noDataLabel: string
  publicPath?: 'story' | 'blog'
}

function RecentList({ icon: Icon, title, items, loading, noDataLabel, publicPath }: RecentListProps) {
  const { language } = usePreferences()

  return (
    <div className="min-w-0 rounded-lg border p-4" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
      <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
        <Icon size={14} />
        {title}
      </h3>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex min-w-0 items-center gap-2 py-1">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--primary)' }} />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-3 w-12 shrink-0" />
            </div>
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => {
            const canOpen = !!publicPath && item.isPublished
            const statusLabel = item.isPublished
              ? t('admin.overview_published', language)
              : t('admin.overview_draft', language)

            return (
              <div key={item.id} className="flex min-w-0 items-center gap-2 py-1">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--primary)' }} />
                <span
                  className="text-xs truncate flex-1"
                  style={{ color: 'var(--foreground)' }}
                  onClick={() => handleRecentTextClick(publicPath, item.id, item.isPublished)}
                >{item.title}</span>
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] shrink-0"
                  style={{
                    backgroundColor: item.isPublished ? 'var(--accent)' : 'var(--muted)',
                    color: item.isPublished ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                  }}
                >
                  {statusLabel}
                </span>
                {item.createdAt && (
                  <span className="text-[10px] shrink-0" style={{ color: 'var(--muted-foreground)' }}>
                    <Clock size={10} className="inline mr-0.5" style={{ verticalAlign: '-1px' }} />
                    {formatDate(item.createdAt)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-xs py-4 text-center" style={{ color: 'var(--muted-foreground)' }}>
          {noDataLabel}
        </div>
      )}
    </div>
  )
}

export function OverviewPage() {
  const { language } = usePreferences()
  const cachedOverview = getOverviewCache()
  const [data, setData] = useState<OverviewDTO | null>(cachedOverview)
  const [loading, setLoading] = useState(!cachedOverview)
  const [equipmentItems, setEquipmentItems] = useState<Record<EquipmentKind, EquipmentItem[]>>(() => ({
    camera: getEquipmentItemsCache('camera'),
    lens: getEquipmentItemsCache('lens'),
  }))
  const [equipmentLoading, setEquipmentLoading] = useState<Record<EquipmentKind, boolean>>({ camera: false, lens: false })
  const [equipmentLoaded, setEquipmentLoaded] = useState<Record<EquipmentKind, boolean>>(() => ({
    camera: isEquipmentCacheLoaded('camera'),
    lens: isEquipmentCacheLoaded('lens'),
  }))
  const [equipmentErrors, setEquipmentErrors] = useState<Record<EquipmentKind, string | null>>({ camera: null, lens: null })

  const fetchData = useCallback(async (force = false) => {
    const cache = getOverviewCache()
    if (!force && cache) {
      setData(cache)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const result = await GetOverview()
      setOverviewCache(result)
      setData(result)
    } catch (err) {
      console.error('Failed to fetch overview:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const fetchEquipment = useCallback(async (kind: EquipmentKind) => {
    if (equipmentLoaded[kind] || equipmentLoading[kind]) return

    setEquipmentLoading(prev => ({ ...prev, [kind]: true }))
    setEquipmentErrors(prev => ({ ...prev, [kind]: null }))
    try {
      const result = kind === 'camera' ? await GetCameras() : await GetLenses()
      setEquipmentItemsCache(kind, result ?? [])
      setEquipmentItems(prev => ({ ...prev, [kind]: result ?? [] }))
      setEquipmentLoaded(prev => ({ ...prev, [kind]: true }))
    } catch (err) {
      console.error(`Failed to fetch ${kind} list:`, err)
      setEquipmentErrors(prev => ({ ...prev, [kind]: t('error', language) }))
    } finally {
      setEquipmentLoading(prev => ({ ...prev, [kind]: false }))
    }
  }, [equipmentLoaded, equipmentLoading, language])

  const isLoading = loading || !data
  const noDataLabel = t('admin.overview_no_data', language)
  const publishedLabel = t('admin.overview_published', language)
  const albumLabel = t('admin.overview_albums', language)
  const storyLabel = t('admin.overview_stories', language)
  const blogLabel = t('admin.overview_blogs', language)

  const statItems = [
    {
      icon: Image,
      label: t('admin.overview_total_photos', language),
      value: data?.photoCount ?? 0,
      color: '#3b82f6',
      sub: data ? `${t('admin.overview_digital', language)}: ${data.digitalCount} / ${t('admin.overview_film', language)}: ${data.filmCount}` : undefined,
      showSubSkeleton: true,
      to: '/photos',
    },
    {
      icon: BookOpen,
      label: albumLabel,
      value: data?.albumCount ?? 0,
      color: '#8b5cf6',
      sub: data ? `${publishedLabel}: ${data.publishedAlbums}` : undefined,
      showSubSkeleton: true,
      to: '/albums',
    },
    {
      icon: BookMarked,
      label: storyLabel,
      value: data?.storyCount ?? 0,
      color: '#f59e0b',
      sub: data ? `${publishedLabel}: ${data.publishedStories}` : undefined,
      showSubSkeleton: true,
      to: '/photo-journal',
    },
    {
      icon: BookMarked,
      label: blogLabel,
      value: data?.blogCount ?? 0,
      color: '#10b981',
      sub: data ? `${publishedLabel}: ${data.publishedBlogs}` : undefined,
      showSubSkeleton: true,
      to: '/photo-journal',
    },
    {
      icon: Film,
      label: t('admin.overview_film_rolls', language),
      value: data?.filmRollCount ?? 0,
      color: '#ec4899',
      to: '/film-rolls',
    },
    {
      icon: Users,
      label: t('admin.overview_friends', language),
      value: data?.friendCount ?? 0,
      color: '#06b6d4',
      to: '/friends',
    },
    {
      icon: MessageSquare,
      label: t('admin.overview_comments', language),
      value: data?.commentCount ?? 0,
      color: '#f97316',
      sub: data ? `${t('admin.overview_pending', language)}: ${data.pendingComments}` : undefined,
      showSubSkeleton: true,
    },
    {
      icon: HardDrive,
      label: t('admin.overview_storage', language),
      value: data ? formatBytes(data.totalSize) : '',
      color: '#64748b',
    },
  ]

  const equipmentRows = [
    {
      key: 'cameras',
      icon: Camera,
      label: (
        <EquipmentHoverTarget
          label={t('admin.overview_cameras', language)}
          items={equipmentItems.camera}
          loading={equipmentLoading.camera}
          error={equipmentErrors.camera}
          noDataLabel={noDataLabel}
          onOpen={() => fetchEquipment('camera')}
        />
      ),
      value: data?.cameraCount ?? 0,
    },
    {
      key: 'lenses',
      icon: Aperture,
      label: (
        <EquipmentHoverTarget
          label={t('admin.overview_lenses', language)}
          items={equipmentItems.lens}
          loading={equipmentLoading.lens}
          error={equipmentErrors.lens}
          noDataLabel={noDataLabel}
          onOpen={() => fetchEquipment('lens')}
        />
      ),
      value: data?.lensCount ?? 0,
    },
    { key: 'categories', icon: FolderOpen, label: t('admin.overview_categories', language), value: data?.categoryCount ?? 0 },
    { key: 'featured', icon: Star, label: t('admin.overview_featured', language), value: data?.featuredCount ?? 0 },
    { key: 'hidden', icon: EyeOff, label: t('admin.overview_hidden', language), value: data?.hiddenCount ?? 0 },
  ]

  return (
    <div className={OVERVIEW_PAGE_CLASS} style={OVERVIEW_PAGE_STYLE}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--foreground)' }}>
          {t('admin.overview_title', language)}
        </h1>
        <button
          onClick={() => fetchData(true)}
          className="text-xs px-3 py-1.5 rounded-md border transition-colors hover:opacity-80"
          style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
        >
          {t('admin.refresh', language)}
        </button>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {statItems.map((item) => (
          <StatCard key={item.label} {...item} loading={isLoading} />
        ))}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        <div className="min-w-0 rounded-lg border p-4" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--foreground)' }}>
            {t('admin.camera', language)} & {t('admin.lens', language)}
          </h3>
          <div className="space-y-3">
            {equipmentRows.map(({ key, ...row }) => (
              <MetricRow key={key} {...row} loading={isLoading} />
            ))}
          </div>
        </div>

        <div className="min-w-0 rounded-lg border p-4" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--foreground)' }}>
            <TrendingUp size={14} className="inline mr-1.5" style={{ verticalAlign: '-2px' }} />
            {t('admin.status', language)}
          </h3>
          <div className="space-y-3">
            <MetricRow label={t('admin.overview_photos_this_month', language)} value={data?.photosThisMonth ?? 0} loading={isLoading} />
            <MetricRow label={t('admin.overview_photos_this_year', language)} value={data?.photosThisYear ?? 0} loading={isLoading} />
            <div className="border-t my-2" style={{ borderColor: 'var(--border)' }} />
            <ProgressBar label={`${publishedLabel} ${albumLabel}`} value={data?.publishedAlbums ?? 0} total={data?.albumCount ?? 0} color="#8b5cf6" loading={isLoading} />
            <ProgressBar label={`${publishedLabel} ${storyLabel}`} value={data?.publishedStories ?? 0} total={data?.storyCount ?? 0} color="#f59e0b" loading={isLoading} />
            <ProgressBar label={`${publishedLabel} ${blogLabel}`} value={data?.publishedBlogs ?? 0} total={data?.blogCount ?? 0} color="#10b981" loading={isLoading} />
          </div>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">
        <div className="min-w-0 rounded-lg border p-4" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
            <Image size={14} />
            {t('admin.overview_recent_photos', language)}
          </h3>
          <RecentPhotoGrid photos={data?.recentPhotos ?? []} loading={isLoading} noDataLabel={noDataLabel} />
        </div>

        <RecentList
          icon={BookMarked}
          title={t('admin.overview_recent_stories', language)}
          items={data?.recentStories ?? []}
          loading={isLoading}
          noDataLabel={noDataLabel}
          publicPath="story"
        />
        <RecentList
          icon={BookOpen}
          title={t('admin.overview_recent_blogs', language)}
          items={data?.recentBlogs ?? []}
          loading={isLoading}
          noDataLabel={noDataLabel}
          publicPath="blog"
        />
      </div>
    </div>
  )
}
