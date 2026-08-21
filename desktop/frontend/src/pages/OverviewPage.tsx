import { useCallback, useMemo, useState } from 'react'
import type { CSSProperties, ElementType, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Aperture,
  BookOpen,
  Camera,
  Clock,
  EyeOff,
  FolderOpen,
  Image,
  RefreshCw,
  Star,
  TrendingUp,
} from 'lucide-react'
import { AdminButton } from '@/components/admin/AdminButton'
import { Skeleton } from '@/components/admin/Skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import { useDataRevision } from '@/hooks/useDataRevision'
import {
  getEquipmentItemsCache,
  getOverviewCache,
  isEquipmentCacheFresh,
  isEquipmentCacheLoaded,
  isOverviewCacheFresh,
  setEquipmentItemsCache,
  setOverviewCache,
  type EquipmentItem,
  type EquipmentKind,
} from '@/lib/app-cache'
import { AUTH_ERROR_MESSAGE_KEY, getAuthErrorMessage, getErrorMessage, isAuthError } from '@/lib/auth-errors'
import { buildApiUrl, resolveAssetUrl } from '@/lib/api'
import { t } from '@/lib/i18n'
import { cn, formatBytes } from '@/lib/utils'
import { usePreferences } from '@/store/preferences'
import { GetCameras, GetLenses, GetOverview } from '../../wailsjs/go/main/App'
import type { services } from '../../wailsjs/go/models'
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime'

type OverviewDTO = services.OverviewDTO
type RecentPhoto = services.RecentPhotoDTO
type RecentTextItem = services.RecentStoryDTO | services.RecentBlogDTO

type FeedKind = 'story' | 'blog'

type FeedItem = RecentTextItem & { kind: FeedKind }

const OVERVIEW_SCROLL_CLASS = 'flex-1 min-h-0 w-full overflow-y-auto p-6'
const OVERVIEW_SCROLL_STYLE: CSSProperties = { scrollbarGutter: 'stable' }
const OVERVIEW_INNER_CLASS = 'mx-auto max-w-6xl space-y-6 pb-2'

/** 应用内标准面板：圆角发丝描边 + --card 表面，无投影。 */
function Panel({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon?: ElementType
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('min-w-0 overflow-hidden rounded-lg border', className)}
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
      <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
        {Icon && <Icon size={14} style={{ color: 'var(--muted-foreground)' }} />}
        <h2 className="truncate font-serif text-sm font-medium tracking-tight" style={{ color: 'var(--foreground)' }}>{title}</h2>
      </div>
      {children}
    </section>
  )
}

function getGreetingKey(hour: number): string {
  if (hour >= 5 && hour < 12) return 'admin.overview_greeting_morning'
  if (hour >= 12 && hour < 18) return 'admin.overview_greeting_afternoon'
  return 'admin.overview_greeting_evening'
}

function getPublicContentUrl(path: FeedKind, id: string) {
  const url = buildApiUrl(`/${path}/${encodeURIComponent(id)}`)
  return /^https?:\/\//i.test(url) ? url : null
}

function openPublicContent(path: FeedKind, id: string) {
  const url = getPublicContentUrl(path, id)
  if (!url) return
  BrowserOpenURL(url)
}

function handleRecentTextClick(path: FeedKind, id: string, isPublished: boolean) {
  if (!isPublished) return
  openPublicContent(path, id)
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

interface StatCellProps {
  label: string
  value: ReactNode
  sub?: ReactNode
  to?: string
  loading?: boolean
  showSubSkeleton?: boolean
}

/** 主指标格：--card 表面 + mono 数字 + 标签语汇（大写宽字距小字），与应用内统计小格同源。
    可点击单元格渲染为 <button>，保证键盘可聚焦（a11y）。 */
function StatCell({ label, value, sub, to, loading = false, showSubSkeleton = false }: StatCellProps) {
  const navigate = useNavigate()
  const clickable = !!to && !loading

  const content = (
    <>
      <div className="truncate text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
        {label}
      </div>
      <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums leading-none" style={{ color: 'var(--foreground)' }}>
        {loading ? <Skeleton className="h-7 w-14" /> : value}
      </div>
      {(sub || showSubSkeleton) && (
        <div className="mt-1.5 truncate text-[11px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
          {loading ? <Skeleton className="h-3 w-24" /> : sub}
        </div>
      )}
    </>
  )

  const base = 'flex min-w-0 flex-col bg-[var(--card)] px-5 py-4'

  if (!clickable) {
    return <div className={base}>{content}</div>
  }

  return (
    <button
      type="button"
      onClick={() => navigate(to!)}
      className={cn(base, 'w-full cursor-pointer appearance-none border-0 text-left transition-colors duration-150 hover:bg-secondary')}
    >
      {content}
    </button>
  )
}

interface CompactStatCellProps {
  label: string
  value: ReactNode
  sub?: ReactNode
  to?: string
  loading?: boolean
}

/** 次级指标格：单行紧凑排布，与主指标拉开层级 */
function CompactStatCell({ label, value, sub, to, loading = false }: CompactStatCellProps) {
  const navigate = useNavigate()
  const clickable = !!to && !loading

  const content = (
    <>
      <span className="truncate text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
        {label}
      </span>
      <span className="flex shrink-0 items-baseline gap-2">
        {loading ? (
          <Skeleton className="h-4 w-8" />
        ) : (
          <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: 'var(--foreground)' }}>{value}</span>
        )}
        {sub && (
          loading
            ? <Skeleton className="h-3 w-14" />
            : <span className="text-[11px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>{sub}</span>
        )}
      </span>
    </>
  )

  const base = 'flex min-w-0 items-center justify-between gap-3 bg-[var(--card)] px-5 py-3.5'

  if (!clickable) {
    return <div className={base}>{content}</div>
  }

  return (
    <button
      type="button"
      onClick={() => navigate(to!)}
      className={cn(base, 'w-full cursor-pointer appearance-none border-0 text-left transition-colors duration-150 hover:bg-secondary')}
    >
      {content}
    </button>
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
    <div className="flex min-w-0 items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon size={14} style={{ color: 'var(--muted-foreground)' }} />}
        <span className="min-w-0 text-xs" style={{ color: 'var(--muted-foreground)' }}>{labelNode}</span>
      </div>
      {loading ? (
        <Skeleton className="h-[20px] w-8" />
      ) : (
        <span className="text-sm font-medium tabular-nums" style={{ color: 'var(--foreground)' }}>{value}</span>
      )}
    </div>
  )
}

interface PublishStatusRowProps {
  label: string
  published: number
  total: number
  publishedLabel: string
  draftLabel: string
  loading: boolean
}

/** 发布状态行：已发布 / 草稿 计数拆分，避免「X / Y + 进度条」的进度感 */
function PublishStatusRow({ label, published, total, publishedLabel, draftLabel, loading }: PublishStatusRowProps) {
  const drafts = Math.max(0, total - published)
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-2.5">
      <span className="min-w-0 truncate text-xs" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      {loading ? (
        <Skeleton className="h-[20px] w-20" />
      ) : (
        <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
          <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{publishedLabel}</span>
          <span className="min-w-7 text-right text-sm font-medium" style={{ color: 'var(--foreground)' }}>{published}</span>
          <span className="ml-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{draftLabel}</span>
          <span className="min-w-7 text-right text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{drafts}</span>
        </span>
      )}
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
          <Skeleton key={index} className="aspect-[5/4] rounded-md" />
        ))}
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-xs" style={{ color: 'var(--muted-foreground)' }}>
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
          <div key={photo.id} className="group relative min-h-0 aspect-[5/4] w-full overflow-hidden rounded-md bg-secondary" style={{ backgroundColor: 'var(--secondary)' }}>
            {imgSrc ? (
              <img src={imgSrc} alt={photo.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Image size={16} style={{ color: 'var(--muted-foreground)' }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface RecentFeedProps {
  items: FeedItem[]
  loading: boolean
  noDataLabel: string
}

/** 叙事 + 博客合并为一条按时间排序的动态列表；内容标题沿用衬线语汇 */
function RecentFeed({ items, loading, noDataLabel }: RecentFeedProps) {
  const { language } = usePreferences()
  const storyLabel = t('admin.overview_stories', language)
  const blogLabel = t('admin.overview_blogs', language)
  const draftLabel = t('admin.overview_draft', language)

  if (loading) {
    return (
      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex min-w-0 items-center gap-3 px-4 py-3">
            <Skeleton className="h-3 w-10 shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-3 w-10 shrink-0" />
            <Skeleton className="h-3 w-[72px] shrink-0" />
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-xs" style={{ color: 'var(--muted-foreground)' }}>
        {noDataLabel}
      </div>
    )
  }

  return (
    <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
      {items.map((item) => {
        const contentUrl = item.isPublished ? getPublicContentUrl(item.kind, item.id) : null
        return (
          <div key={`${item.kind}-${item.id}`} className="flex min-w-0 items-center gap-3 px-4 py-3">
            <span className="w-10 shrink-0 truncate text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
              {item.kind === 'story' ? storyLabel : blogLabel}
            </span>
            {contentUrl ? (
              <a
                href={contentUrl}
                className="flex-1 cursor-pointer truncate font-serif text-sm font-medium tracking-tight underline-offset-2 hover:underline"
                style={{ color: 'var(--foreground)' }}
                onClick={(event) => {
                  event.preventDefault()
                  handleRecentTextClick(item.kind, item.id, item.isPublished)
                }}
              >{item.title}</a>
            ) : (
              <span
                className="flex-1 truncate font-serif text-sm font-medium tracking-tight"
                style={{ color: item.isPublished ? 'var(--foreground)' : 'var(--muted-foreground)' }}
              >{item.title}</span>
            )}
            <span className="flex shrink-0 items-center text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
              <span className="w-10 text-right">{!item.isPublished ? draftLabel : ''}</span>
              {item.createdAt && (
                <span className="ml-2 flex w-[72px] items-center justify-end gap-1 tabular-nums">
                  <Clock size={10} className="shrink-0" />
                  {formatDate(item.createdAt)}
                </span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function OverviewPage() {
  const { language } = usePreferences()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const overviewRevision = useDataRevision('overview')
  const cachedOverview = getOverviewCache()
  const [data, setData] = useState<OverviewDTO | null>(cachedOverview)
  const [loading, setLoading] = useState(!cachedOverview)
  const [error, setError] = useState<string | null>(null)
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
      setError(null)
      if (isOverviewCacheFresh()) return
    }

    setLoading(!cache)
    setError(null)
    try {
      const result = await GetOverview()
      setOverviewCache(result)
      setData(result)
    } catch (err) {
      console.error('Failed to fetch overview:', err)
      if (isAuthError(err)) {
        sessionStorage.setItem(AUTH_ERROR_MESSAGE_KEY, getAuthErrorMessage(err))
        logout()
        navigate('/library?source=local', { replace: true })
        return
      }
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [logout, navigate])

  // 菜单页常驻缓存：切回本页不重新加载，只有概览数据被写操作失效后才重新拉取
  useCachedPageEffect(() => { void fetchData() }, [fetchData, overviewRevision])

  const fetchEquipment = useCallback(async (kind: EquipmentKind) => {
    if (equipmentLoading[kind]) return
    if (equipmentLoaded[kind] && isEquipmentCacheFresh(kind)) return

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
  const draftLabel = t('admin.overview_draft', language)
  const digitalLabel = t('admin.overview_digital', language)
  const filmLabel = t('admin.overview_film', language)
  const albumLabel = t('admin.overview_albums', language)
  const storyLabel = t('admin.overview_stories', language)
  const blogLabel = t('admin.overview_blogs', language)

  const primaryStats: StatCellProps[] = [
    {
      label: t('admin.overview_total_photos', language),
      value: data?.photoCount ?? 0,
      sub: data ? `${digitalLabel} ${data.digitalCount} · ${filmLabel} ${data.filmCount}` : undefined,
      showSubSkeleton: true,
      to: '/photos',
    },
    {
      label: albumLabel,
      value: data?.albumCount ?? 0,
      sub: data ? `${publishedLabel} ${data.publishedAlbums}` : undefined,
      showSubSkeleton: true,
      to: '/albums',
    },
    {
      label: storyLabel,
      value: data?.storyCount ?? 0,
      sub: data ? `${publishedLabel} ${data.publishedStories}` : undefined,
      showSubSkeleton: true,
      to: '/photo-journal',
    },
    {
      label: blogLabel,
      value: data?.blogCount ?? 0,
      sub: data ? `${publishedLabel} ${data.publishedBlogs}` : undefined,
      showSubSkeleton: true,
      to: '/photo-journal',
    },
  ]

  const secondaryStats: CompactStatCellProps[] = [
    {
      label: t('admin.overview_film_rolls', language),
      value: data?.filmRollCount ?? 0,
      to: '/library?source=cloud&view=film-rolls',
    },
    {
      label: t('admin.overview_friends', language),
      value: data?.friendCount ?? 0,
      to: '/friends',
    },
    {
      label: t('admin.overview_comments', language),
      value: data?.commentCount ?? 0,
      sub: data ? `${data.pendingComments} ${t('admin.overview_pending', language)}` : undefined,
    },
    {
      label: t('admin.overview_storage', language),
      value: data ? formatBytes(data.totalSize) : '',
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

  const publishRows = [
    { key: 'albums', label: albumLabel, published: data?.publishedAlbums ?? 0, total: data?.albumCount ?? 0 },
    { key: 'stories', label: storyLabel, published: data?.publishedStories ?? 0, total: data?.storyCount ?? 0 },
    { key: 'blogs', label: blogLabel, published: data?.publishedBlogs ?? 0, total: data?.blogCount ?? 0 },
  ]

  // 叙事与博客合并为一条按创建时间倒序的动态流
  const recentFeed = useMemo<FeedItem[]>(() => {
    if (!data) return []
    const items: FeedItem[] = [
      ...data.recentStories.map(item => ({ ...item, kind: 'story' as const })),
      ...data.recentBlogs.map(item => ({ ...item, kind: 'blog' as const })),
    ]
    return items.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return timeB - timeA
    })
  }, [data])

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t('admin.overview_title', language)}
        description={t(getGreetingKey(new Date().getHours()), language)}
        actions={
          <AdminButton adminVariant="outline" size="sm" type="button" onClick={() => fetchData(true)}>
            <RefreshCw size={13} className="mr-1.5" />
            {t('admin.refresh', language)}
          </AdminButton>
        }
      />

      <div className={OVERVIEW_SCROLL_CLASS} style={OVERVIEW_SCROLL_STYLE}>
        <div className={OVERVIEW_INNER_CLASS}>
          {error && (
            <div className="rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--destructive)', color: 'var(--destructive)' }}>
              {error}
            </div>
          )}

          {/* 数据总览：发丝网格 + --card 表面 + mono 数字，与应用内统计小格同源 */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border md:grid-cols-4"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--border)' }}>
            {primaryStats.map((item) => (
              <StatCell key={item.label} {...item} loading={isLoading} />
            ))}
            {secondaryStats.map((item) => (
              <CompactStatCell key={item.label} {...item} loading={isLoading} />
            ))}
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel icon={Image} title={t('admin.overview_recent_photos', language)}>
              <div className="p-4">
                <RecentPhotoGrid photos={data?.recentPhotos ?? []} loading={isLoading} noDataLabel={noDataLabel} />
              </div>
            </Panel>

            <Panel icon={BookOpen} title={t('admin.overview_recent_content', language)}>
              <RecentFeed items={recentFeed} loading={isLoading} noDataLabel={noDataLabel} />
            </Panel>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel icon={Camera} title={t('admin.overview_equipment', language)}>
              <div className="px-4">
                {equipmentRows.map(({ key, ...row }, index) => (
                  <div key={key} className={cn(index > 0 && 'border-t border-border')}>
                    <MetricRow {...row} loading={isLoading} />
                  </div>
                ))}
              </div>
            </Panel>

            <Panel icon={TrendingUp} title={t('admin.overview_publish_status', language)}>
              <div className="px-4">
                <MetricRow label={t('admin.overview_photos_this_month', language)} value={data?.photosThisMonth ?? 0} loading={isLoading} />
                <div className="border-t border-border" />
                <MetricRow label={t('admin.overview_photos_this_year', language)} value={data?.photosThisYear ?? 0} loading={isLoading} />
                <div className="my-1 border-t border-border" />
                {publishRows.map((row) => (
                  <PublishStatusRow
                    key={row.key}
                    label={row.label}
                    published={row.published}
                    total={row.total}
                    publishedLabel={publishedLabel}
                    draftLabel={draftLabel}
                    loading={isLoading}
                  />
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  )
}