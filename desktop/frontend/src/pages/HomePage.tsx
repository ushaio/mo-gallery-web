import { useCallback, useMemo, useState } from 'react'
import type { CSSProperties, ElementType, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Aperture,
  ArrowUpRight,
  Bot,
  BookImage,
  BookMarked,
  Camera,
  CheckCircle2,
  Clock,
  ExternalLink,
  EyeOff,
  FolderOpen,
  HardDrive,
  Image,
  LibraryBig,
  MessageSquare,
  PenLine,
  RefreshCw,
  Star,
  Upload,
  Users,
} from 'lucide-react'
import { Skeleton } from '@/components/admin/Skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { useDesktopSiteIdentity } from '@/components/layout/useDesktopSiteIdentity'
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
import type { Locale } from '@/lib/i18n'
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

const SURFACE_BORDER = 'color-mix(in srgb, var(--border) 78%, transparent)'
const PAGE_BACKGROUND = 'color-mix(in srgb, var(--background) 96%, var(--secondary))'
const CARD_SHADOW = '0 16px 30px -28px rgb(0 0 0 / 0.55)'
const RECENT_PHOTO_LIMIT = 8

const SCROLL_STYLE: CSSProperties = { scrollbarGutter: 'stable' }

/** 工作台卡片：柔和描边 + card 表面 + 极浅投影，与本地资源库欢迎页同一套语汇。 */
function Card({
  title,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string
  icon?: ElementType
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section
      className={cn('flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card/80', className)}
      style={{ borderColor: SURFACE_BORDER, boxShadow: CARD_SHADOW }}
    >
      <div className="flex items-center justify-between gap-3 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon size={14} style={{ color: 'var(--muted-foreground)' }} />}
          <h2 className="truncate font-sans text-[13px] font-medium tracking-tight" style={{ color: 'var(--foreground)' }}>
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div className={cn('min-w-0 flex-1', bodyClassName ?? 'px-5 pb-5')}>{children}</div>
    </section>
  )
}

/** 卡片右上角的文字入口，替代原来分散在各处的「查看全部」按钮。 */
function CardLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex shrink-0 items-center gap-1 rounded-md text-[11px] font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      style={{ color: 'var(--muted-foreground)' }}
    >
      {label}
      <ArrowUpRight size={12} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </button>
  )
}

function getGreetingKey(hour: number): string {
  if (hour >= 5 && hour < 12) return 'admin.home_greeting_morning'
  if (hour >= 12 && hour < 18) return 'admin.home_greeting_afternoon'
  return 'admin.home_greeting_evening'
}

function formatToday(language: Locale): string {
  return new Date().toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
}

function formatClock(date: Date, language: Locale): string {
  return date.toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelative(dateStr: string, language: Locale): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  if (diff < 0) return ''
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return t('admin.relative_just_now', language)
  if (minutes < 60) return t('admin.relative_minutes_ago', language, { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('admin.relative_hours_ago', language, { n: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return t('admin.relative_days_ago', language, { n: days })
  return date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')
}

function siteLabel(siteUrl: string): string {
  if (!siteUrl) return ''
  try {
    return new URL(siteUrl).host
  } catch {
    return siteUrl.replace(/^https?:\/\//i, '').split('/')[0]
  }
}

function getPublicContentUrl(path: FeedKind, id: string) {
  const url = buildApiUrl(`/${path}/${encodeURIComponent(id)}`)
  return /^https?:\/\//i.test(url) ? url : null
}

interface QuickAction {
  key: string
  icon: ElementType
  label: string
  hint: string
  to: string
  primary?: boolean
}

/** 快速开始磁贴：图标胶囊 + 名称 + 一句说明，悬停轻微抬起。 */
function QuickActionTile({ action, onSelect }: { action: QuickAction; onSelect: (to: string) => void }) {
  const { icon: Icon, label, hint, primary } = action
  return (
    <button
      type="button"
      onClick={() => onSelect(action.to)}
      className="group flex min-w-0 flex-col items-start gap-3 rounded-2xl border bg-card/70 p-4 text-left transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-card hover:shadow-[0_18px_30px_-26px_rgb(0_0_0/0.6)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      style={{ borderColor: SURFACE_BORDER }}
    >
      <span
        className="flex size-9 items-center justify-center rounded-xl transition-colors"
        style={
          primary
            ? { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }
            : { backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }
        }
      >
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium" style={{ color: 'var(--foreground)' }}>{label}</span>
        <span className="mt-0.5 block text-[11px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{hint}</span>
      </span>
    </button>
  )
}

interface MetricProps {
  label: string
  value: ReactNode
  sub?: ReactNode
  to?: string
  loading?: boolean
}

/** 资源库指标格：标签小字 + mono 数字，点击进入对应工作区。 */
function Metric({ label, value, sub, to, loading = false }: MetricProps) {
  const navigate = useNavigate()
  const clickable = !!to && !loading

  const body = (
    <>
      <span className="truncate text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      {loading ? (
        <Skeleton className="mt-1.5 h-5 w-12" />
      ) : (
        <span className="mt-1 flex min-w-0 items-baseline gap-1.5">
          <span className="font-mono text-lg font-semibold tabular-nums leading-none" style={{ color: 'var(--foreground)' }}>
            {value}
          </span>
          {sub && <span className="truncate text-[11px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>{sub}</span>}
        </span>
      )}
    </>
  )

  const base = 'flex min-w-0 flex-col rounded-xl px-3 py-2.5 text-left transition-colors'

  if (!clickable) {
    return <div className={cn(base, 'bg-secondary/40')}>{body}</div>
  }

  return (
    <button
      type="button"
      onClick={() => navigate(to!)}
      className={cn(base, 'bg-secondary/40 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring')}
    >
      {body}
    </button>
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

/** 器材名称悬停展开清单，沿用旧概览页的交互，避免丢掉相机/镜头明细。 */
function EquipmentHoverTarget({ label, items, loading, error, noDataLabel, onOpen }: EquipmentHoverTargetProps) {
  const [open, setOpen] = useState(false)

  const show = () => {
    setOpen(true)
    onOpen()
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="cursor-help appearance-none border-0 bg-transparent p-0 text-[11px] underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        style={{ color: 'var(--muted-foreground)' }}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
      >
        {label}
      </button>
      {open && (
        <span
          className="absolute left-0 top-full z-50 mt-2 w-56 rounded-xl border p-2 shadow-xl"
          style={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)' }}
        >
          <span className="mb-1 block px-2 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
            {label}
          </span>
          <span className="block max-h-56 overflow-y-auto custom-scrollbar">
            {loading ? (
              <span className="block space-y-1.5 px-1 py-1">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-6 w-full" />
                ))}
              </span>
            ) : error ? (
              <span className="block px-2 py-2 text-xs" style={{ color: 'var(--destructive)' }}>{error}</span>
            ) : items.length > 0 ? (
              items.map((item) => (
                <span key={item.id} className="block truncate rounded-md px-2 py-1.5 text-xs" style={{ color: 'var(--foreground)' }}>
                  {item.name}
                </span>
              ))
            ) : (
              <span className="block px-2 py-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>{noDataLabel}</span>
            )}
          </span>
        </span>
      )}
    </span>
  )
}

function RecentPhotoWall({
  photos,
  loading,
  noDataLabel,
  language,
}: {
  photos: RecentPhoto[]
  loading: boolean
  noDataLabel: string
  language: Locale
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: RECENT_PHOTO_LIMIT }).map((_, index) => (
          <Skeleton key={index} className="aspect-square rounded-xl" />
        ))}
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-xs"
        style={{ borderColor: SURFACE_BORDER, color: 'var(--muted-foreground)' }}>
        <Image size={18} />
        {noDataLabel}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {photos.slice(0, RECENT_PHOTO_LIMIT).map((photo) => {
        const imgSrc = photo.thumbnailUrl
          ? resolveAssetUrl(photo.thumbnailUrl)
          : photo.url
            ? resolveAssetUrl(photo.url)
            : null
        const time = formatRelative(photo.createdAt, language)
        return (
          <figure
            key={photo.id}
            className="group relative aspect-square min-h-0 w-full overflow-hidden rounded-xl"
            style={{ backgroundColor: 'var(--secondary)' }}
          >
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={photo.title}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                <Image size={16} style={{ color: 'var(--muted-foreground)' }} />
              </span>
            )}
            <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/75 to-transparent px-2.5 pb-2 pt-6 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-y-0 group-hover:opacity-100">
              <span className="block truncate text-[11px] font-medium text-white">{photo.title}</span>
              {time && <span className="block text-[10px] text-white/70">{time}</span>}
            </figcaption>
          </figure>
        )
      })}
    </div>
  )
}

function RecentFeed({
  items,
  loading,
  noDataLabel,
  language,
}: {
  items: FeedItem[]
  loading: boolean
  noDataLabel: string
  language: Locale
}) {
  const storyLabel = t('admin.overview_stories', language)
  const blogLabel = t('admin.overview_blogs', language)
  const draftLabel = t('admin.overview_draft', language)
  const untitledLabel = t('admin.overview_untitled', language)

  if (loading) {
    return (
      <div className="space-y-1 px-2 pb-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex min-w-0 items-center gap-3 px-3 py-2.5">
            <Skeleton className="h-4 w-10 shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-3 w-16 shrink-0" />
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="px-5 pb-6 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>
        {noDataLabel}
      </div>
    )
  }

  return (
    <div className="space-y-0.5 px-2 pb-3">
      {items.map((item) => {
        const url = item.isPublished ? getPublicContentUrl(item.kind, item.id) : null
        const time = formatRelative(item.createdAt, language)
        return (
          <div
            key={`${item.kind}-${item.id}`}
            className="flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary/60"
          >
            <span
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: 'var(--secondary)', color: 'var(--muted-foreground)' }}
            >
              {item.kind === 'story' ? storyLabel : blogLabel}
            </span>
            {url ? (
              <button
                type="button"
                onClick={() => BrowserOpenURL(url)}
                title={url}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-serif text-[15px] font-medium tracking-tight underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                style={{ color: 'var(--foreground)' }}
              >
                <span className="truncate">{item.title || untitledLabel}</span>
                <ExternalLink size={11} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ) : (
              <span className="min-w-0 flex-1 truncate font-serif text-[15px] font-medium tracking-tight" style={{ color: 'var(--muted-foreground)' }}>
                {item.title || untitledLabel}
              </span>
            )}
            {!item.isPublished && (
              <span
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px]"
                style={{ backgroundColor: 'color-mix(in srgb, var(--muted-foreground) 14%, transparent)', color: 'var(--muted-foreground)' }}
              >
                {draftLabel}
              </span>
            )}
            {time && (
              <span className="flex w-[84px] shrink-0 items-center justify-end gap-1 text-[10px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
                <Clock size={10} />
                {time}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function HomePage() {
  const { language } = usePreferences()
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const { siteTitle, siteUrl } = useDesktopSiteIdentity()
  const overviewRevision = useDataRevision('overview')
  const cachedOverview = getOverviewCache()
  const [data, setData] = useState<OverviewDTO | null>(cachedOverview)
  const [loading, setLoading] = useState(!cachedOverview)
  const [error, setError] = useState<string | null>(null)
  const [syncedAt, setSyncedAt] = useState<Date | null>(null)
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
      setSyncedAt(new Date())
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

  // 菜单页常驻缓存：切回本页不重新加载，只有数据被写操作失效后才重新拉取
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
  const host = siteLabel(siteUrl)

  const quickActions: QuickAction[] = [
    {
      key: 'upload',
      icon: Upload,
      label: t('admin.home_action_upload', language),
      hint: t('admin.home_action_upload_hint', language),
      to: '/upload',
      primary: true,
    },
    {
      key: 'cloud-library',
      icon: LibraryBig,
      label: t('admin.home_action_cloud_library', language),
      hint: t('admin.home_action_cloud_library_hint', language),
      to: '/library?source=cloud',
    },
    {
      key: 'local-library',
      icon: FolderOpen,
      label: t('admin.home_action_local_library', language),
      hint: t('admin.home_action_local_library_hint', language),
      to: '/library?source=local',
    },
    {
      key: 'journal',
      icon: BookMarked,
      label: t('admin.home_action_journal', language),
      hint: t('admin.home_action_journal_hint', language),
      to: '/photo-journal',
    },
    {
      key: 'zine',
      icon: BookImage,
      label: t('admin.home_action_zine', language),
      hint: t('admin.home_action_zine_hint', language),
      to: '/zine',
    },
    {
      key: 'ai',
      icon: Bot,
      label: t('admin.home_action_ai', language),
      hint: t('admin.home_action_ai_hint', language),
      to: '/ai-assistant',
    },
  ]

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

  const digitalCount = data?.digitalCount ?? 0
  const filmCount = data?.filmCount ?? 0
  const filmShare = digitalCount + filmCount > 0 ? (filmCount / (digitalCount + filmCount)) * 100 : 0
  const draftTotal = (data?.draftAlbums ?? 0) + (data?.draftStories ?? 0) + (data?.draftBlogs ?? 0)
  const pendingComments = data?.pendingComments ?? 0
  const hasPending = draftTotal > 0 || pendingComments > 0

  const libraryMetrics: MetricProps[] = [
    {
      label: t('admin.overview_albums', language),
      value: data?.albumCount ?? 0,
      sub: data ? `${publishedLabel} ${data.publishedAlbums}` : undefined,
      to: '/library?source=cloud&view=albums',
    },
    {
      label: t('admin.overview_film_rolls', language),
      value: data?.filmRollCount ?? 0,
      to: '/library?source=cloud&view=film-rolls',
    },
    {
      label: t('admin.overview_stories', language),
      value: data?.storyCount ?? 0,
      sub: data ? `${publishedLabel} ${data.publishedStories}` : undefined,
      to: '/photo-journal',
    },
    {
      label: t('admin.overview_blogs', language),
      value: data?.blogCount ?? 0,
      sub: data ? `${publishedLabel} ${data.publishedBlogs}` : undefined,
      to: '/photo-journal',
    },
  ]

  const equipmentMetrics = [
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
    {
      key: 'categories',
      icon: FolderOpen,
      label: <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{t('admin.overview_categories', language)}</span>,
      value: data?.categoryCount ?? 0,
    },
    {
      key: 'featured',
      icon: Star,
      label: <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{t('admin.overview_featured', language)}</span>,
      value: data?.featuredCount ?? 0,
    },
    {
      key: 'hidden',
      icon: EyeOff,
      label: <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{t('admin.overview_hidden', language)}</span>,
      value: data?.hiddenCount ?? 0,
    },
  ]

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col overflow-y-auto custom-scrollbar"
      style={{ ...SCROLL_STYLE, backgroundColor: PAGE_BACKGROUND }}
    >
      <div className="mx-auto w-full max-w-6xl space-y-7 px-8 pb-10 pt-7">
        {/* 迎宾区：身份 + 时间 + 连接状态 + 主动作，替代原来的「数据概览」标题栏 */}
        <section
          className="relative overflow-hidden rounded-2xl border p-6"
          style={{
            borderColor: SURFACE_BORDER,
            backgroundImage:
              'linear-gradient(135deg, color-mix(in srgb, var(--card) 94%, var(--background)), color-mix(in srgb, var(--secondary) 62%, var(--background)))',
            boxShadow: CARD_SHADOW,
          }}
        >
          <Aperture
            aria-hidden="true"
            size={210}
            className="pointer-events-none absolute -right-10 -top-14 opacity-[0.05]"
            style={{ color: 'var(--foreground)' }}
          />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--muted-foreground)' }}>
                {siteTitle} · {t('admin.home_workbench', language)}
              </div>
              <h1 className="mt-2.5 truncate font-serif text-[30px] leading-tight">
                {t('admin.home_greeting_line', language, {
                  greeting: t(getGreetingKey(new Date().getHours()), language),
                  name: user?.username || 'Admin',
                })}
              </h1>
              <p className="mt-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {formatToday(language)}
                <span className="mx-2 opacity-50">·</span>
                {host
                  ? t('admin.home_connected_to', language, { site: host })
                  : t('admin.home_not_connected', language)}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/upload')}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
                >
                  <Upload size={14} />
                  {t('admin.home_action_upload', language)}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/photo-journal')}
                  className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  style={{ borderColor: SURFACE_BORDER, color: 'var(--foreground)' }}
                >
                  <PenLine size={14} />
                  {t('admin.home_write', language)}
                </button>
                {siteUrl && (
                  <button
                    type="button"
                    onClick={() => BrowserOpenURL(siteUrl)}
                    title={siteUrl}
                    className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    style={{ borderColor: SURFACE_BORDER, color: 'var(--muted-foreground)' }}
                  >
                    <ExternalLink size={14} />
                    {t('admin.home_visit_site', language)}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                <span className="tabular-nums">
                  {syncedAt
                    ? t('admin.home_synced_at', language, { time: formatClock(syncedAt, language) })
                    : t('admin.home_synced_cached', language)}
                </span>
                <button
                  type="button"
                  onClick={() => void fetchData(true)}
                  title={t('admin.refresh', language)}
                  aria-label={t('admin.refresh', language)}
                  className="flex size-7 items-center justify-center rounded-lg border transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  style={{ borderColor: SURFACE_BORDER }}
                >
                  <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} />
                </button>
              </div>
            </div>
          </div>

          {/* 照片体量与数码/胶片构成：一行读完，不再铺满整屏数字格 */}
          <div className="relative mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
            <button
              type="button"
              onClick={() => navigate('/library?source=cloud')}
              className="group flex min-w-0 flex-col items-start rounded-xl text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                {t('admin.overview_total_photos', language)}
              </span>
              {isLoading ? (
                <Skeleton className="mt-1.5 h-9 w-24" />
              ) : (
                <span className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-[34px] font-semibold tabular-nums leading-none transition-opacity group-hover:opacity-80"
                    style={{ color: 'var(--foreground)' }}>
                    {data?.photoCount ?? 0}
                  </span>
                  <ArrowUpRight size={14} className="opacity-0 transition-opacity group-hover:opacity-60" />
                </span>
              )}
            </button>

            <div className="min-w-[180px] flex-1">
              <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                <span className="tabular-nums">{t('admin.overview_digital', language)} {digitalCount}</span>
                <span className="tabular-nums">{t('admin.overview_film', language)} {filmCount}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--muted-foreground) 20%, transparent)' }}>
                {!isLoading && (
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${100 - filmShare}%`, backgroundColor: 'var(--foreground)', opacity: 0.55 }}
                  />
                )}
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                  {t('admin.overview_photos_this_month', language)}
                </span>
                {isLoading
                  ? <Skeleton className="mt-1.5 h-4 w-10" />
                  : <span className="mt-1 font-mono text-sm font-semibold tabular-nums">{data?.photosThisMonth ?? 0}</span>}
              </div>
              <div className="flex flex-col">
                <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                  {t('admin.overview_photos_this_year', language)}
                </span>
                {isLoading
                  ? <Skeleton className="mt-1.5 h-4 w-10" />
                  : <span className="mt-1 font-mono text-sm font-semibold tabular-nums">{data?.photosThisYear ?? 0}</span>}
              </div>
              <div className="flex flex-col">
                <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                  {t('admin.overview_storage', language)}
                </span>
                {isLoading
                  ? <Skeleton className="mt-1.5 h-4 w-14" />
                  : <span className="mt-1 font-mono text-sm font-semibold tabular-nums">{formatBytes(data?.totalSize ?? 0)}</span>}
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--destructive)', color: 'var(--destructive)' }}>
            {error}
          </div>
        )}

        {/* 快速开始：把工作流入口摆在首页第一屏 */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--muted-foreground)' }}>
              {t('admin.home_quick_start', language)}
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => navigate('/storage')}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <HardDrive size={12} />
                {t('admin.storage_cleanup', language)}
              </button>
              <button
                type="button"
                onClick={() => navigate('/friends')}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <Users size={12} />
                {t('admin.friends', language)}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {quickActions.map((action) => (
              <QuickActionTile key={action.key} action={action} onSelect={(to) => navigate(to)} />
            ))}
          </div>
        </section>

        <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            <Card
              title={t('admin.overview_recent_photos', language)}
              icon={Image}
              action={<CardLink label={t('admin.overview_view_all', language)} onClick={() => navigate('/library?source=cloud')} />}
            >
              <RecentPhotoWall
                photos={data?.recentPhotos ?? []}
                loading={isLoading}
                noDataLabel={noDataLabel}
                language={language}
              />
            </Card>

            <Card
              title={t('admin.overview_recent_content', language)}
              icon={BookMarked}
              action={<CardLink label={t('admin.home_go_journal', language)} onClick={() => navigate('/photo-journal')} />}
              bodyClassName=""
            >
              <RecentFeed items={recentFeed} loading={isLoading} noDataLabel={noDataLabel} language={language} />
            </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <Card title={t('admin.home_pending', language)} icon={CheckCircle2}>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full rounded-xl" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                </div>
              ) : hasPending ? (
                <div className="space-y-2">
                  {draftTotal > 0 && (
                    <button
                      type="button"
                      onClick={() => navigate('/photo-journal')}
                      className="flex w-full items-center justify-between gap-3 rounded-xl bg-secondary/40 px-3 py-2.5 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-xs" style={{ color: 'var(--foreground)' }}>
                        <PenLine size={13} style={{ color: 'var(--muted-foreground)' }} />
                        <span className="truncate">{t('admin.home_pending_drafts', language)}</span>
                      </span>
                      <span className="font-mono text-sm font-semibold tabular-nums">{draftTotal}</span>
                    </button>
                  )}
                  {pendingComments > 0 && (
                    <div className="flex w-full items-center justify-between gap-3 rounded-xl bg-secondary/40 px-3 py-2.5">
                      <span className="flex min-w-0 items-center gap-2 text-xs" style={{ color: 'var(--foreground)' }}>
                        <MessageSquare size={13} style={{ color: 'var(--muted-foreground)' }} />
                        <span className="truncate">{t('admin.overview_pending_comments', language)}</span>
                      </span>
                      <span className="font-mono text-sm font-semibold tabular-nums">{pendingComments}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl bg-secondary/40 px-3 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  <CheckCircle2 size={14} />
                  {t('admin.home_pending_clear', language)}
                </div>
              )}
            </Card>

            <Card title={t('admin.home_library_status', language)} icon={LibraryBig}>
              <div className="grid grid-cols-2 gap-2">
                {libraryMetrics.map((metric) => (
                  <Metric key={metric.label} {...metric} loading={isLoading} />
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-secondary/40 px-3 py-2.5">
                <span className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                  <MessageSquare size={13} />
                  {t('admin.overview_comments', language)}
                </span>
                {isLoading
                  ? <Skeleton className="h-4 w-10" />
                  : <span className="font-mono text-sm font-semibold tabular-nums">{data?.commentCount ?? 0}</span>}
              </div>
            </Card>

            <Card title={t('admin.home_equipment', language)} icon={Camera}>
              <div className="grid grid-cols-1 gap-1">
                {equipmentMetrics.map(({ key, icon: Icon, label, value }, index) => (
                  <div
                    key={key}
                    className={cn(
                      'flex min-w-0 items-center justify-between gap-3 py-2',
                      index > 0 && 'border-t',
                    )}
                    style={index > 0 ? { borderColor: SURFACE_BORDER } : undefined}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon size={13} style={{ color: 'var(--muted-foreground)' }} />
                      {label}
                    </span>
                    {isLoading
                      ? <Skeleton className="h-4 w-8" />
                      : <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: 'var(--foreground)' }}>{value}</span>}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
