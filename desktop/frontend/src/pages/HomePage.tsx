import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUpRight,
  BookMarked,
  Bot,
  BookImage,
  Check,
  FileText,
  FolderOpen,
  Image,
  LibraryBig,
  MessageSquare,
  PenLine,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { Skeleton } from '@/components/admin/Skeleton'
import { HomePhotoActivity } from '@/components/admin/HomePhotoActivity'
import { useAuth } from '@/contexts/AuthContext'
import { useDesktopSiteIdentity } from '@/components/layout/useDesktopSiteIdentity'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import { useDataRevision } from '@/hooks/useDataRevision'
import {
  getOverviewCache,
  isOverviewCacheFresh,
  setOverviewCache,
} from '@/lib/app-cache'
import { AUTH_ERROR_MESSAGE_KEY, getAuthErrorMessage, getErrorMessage, isAuthError } from '@/lib/auth-errors'
import { buildApiUrl, resolveAssetUrl } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { usePreferences, useSettingsNav } from '@/store/preferences'
import { GetOverview } from '../../wailsjs/go/main/App'
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
const ACCENT_SOFT = 'color-mix(in srgb, var(--primary) 12%, transparent)'
const RECENT_PHOTO_LIMIT = 9
const RECENT_FEED_LIMIT = 5

const SCROLL_STYLE: CSSProperties = { scrollbarGutter: 'stable' }

function getGreetingKey(hour: number): string {
  if (hour >= 5 && hour < 12) return 'admin.home_greeting_morning'
  if (hour >= 12 && hour < 18) return 'admin.home_greeting_afternoon'
  return 'admin.home_greeting_evening'
}

function formatToday(language: Locale): string {
  return new Date().toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
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

/** 小节标题：字距拉开的小写标签 + 右侧可选动作。 */
function SectionHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

/** 虚线下划线的行内跳转文字，对应参考页 sub 行的 em 元素。 */
function InlineLink({ label, onClick }: { label: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer appearance-none border-0 bg-transparent p-0 underline decoration-dashed decoration-from-font underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      style={{ color: 'var(--foreground)' }}
    >
      {label}
    </button>
  )
}

interface CommandItem {
  cmd: string
  desc: string
  to: string
}

/** 万能输入框：一句意图、/ 命令，回车分发到对应工作区。 */
function OmniBox({
  language,
  draftTotal,
  pendingComments,
}: {
  language: Locale
  draftTotal: number
  pendingComments: number
}) {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const commands = useMemo<CommandItem[]>(() => [
    { cmd: '/zine', desc: t('admin.home_cmd_zine', language), to: '/design/zine' },
    { cmd: '/draft', desc: t('admin.home_cmd_draft', language), to: '/photo-journal' },
    { cmd: '/album', desc: t('admin.home_cmd_album', language), to: '/library?source=cloud&view=albums' },
    { cmd: '/find', desc: t('admin.home_cmd_find', language), to: '/library?source=cloud' },
    { cmd: '/caption', desc: t('admin.home_cmd_caption', language), to: '/ai-assistant' },
  ], [language])

  const showMenu = value.startsWith('/')

  const run = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const matched = commands.find(c => trimmed.startsWith(c.cmd))
    if (matched) {
      navigate(matched.to)
      return
    }
    // 自由意图直接交给 AI 助手自动发送，而不是只预填输入框
    navigate(`/ai-assistant?q=${encodeURIComponent(trimmed)}&send=1`)
  }, [commands, navigate])

  // Ctrl/Cmd+K 聚焦输入框，对齐参考页的快捷键
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const chips: { label: string; icon: typeof Upload; to: string }[] = [
    { label: t('admin.home_action_upload', language), icon: Upload, to: '/upload' },
    { label: t('admin.home_act_write', language), icon: PenLine, to: '/photo-journal' },
    { label: t('admin.home_act_album', language), icon: FolderOpen, to: '/library?source=cloud&view=albums' },
    { label: t('admin.home_act_zine', language), icon: BookImage, to: '/design/zine' },
    { label: t('admin.home_act_ask', language), icon: Bot, to: '/ai-assistant' },
  ]

  return (
    <div className="mt-5">
      <div
        className="overflow-hidden rounded-2xl border bg-card/85 transition-shadow focus-within:shadow-[0_0_0_4px_var(--tw-shadow-color),var(--tw-shadow)]"
        style={{ borderColor: SURFACE_BORDER, boxShadow: CARD_SHADOW, ['--tw-shadow-color' as string]: ACCENT_SOFT }}
      >
        <div className="flex items-center gap-3 px-4 py-4">
          <Sparkles size={18} style={{ color: 'var(--primary)' }} className="shrink-0" />
          <input
            ref={inputRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                run(value)
              } else if (e.key === 'Escape') {
                setValue('')
                inputRef.current?.blur()
              }
            }}
            placeholder={t('admin.home_omni_placeholder', language)}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:opacity-60"
            style={{ color: 'var(--foreground)' }}
          />
          <span className="hidden shrink-0 items-center gap-1 text-[11px] sm:flex" style={{ color: 'var(--muted-foreground)' }}>
            {t('admin.home_omni_hint', language)}
          </span>
        </div>

        {showMenu && (
          <div className="border-t px-2 py-2" style={{ borderColor: SURFACE_BORDER }}>
            {commands.map(c => (
              <button
                key={c.cmd}
                type="button"
                onClick={() => run(c.cmd)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <code className="w-20 shrink-0 font-mono text-xs" style={{ color: 'var(--primary)' }}>{c.cmd}</code>
                <span className="truncate text-xs" style={{ color: 'var(--muted-foreground)' }}>{c.desc}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 px-4 pb-3.5">
          {chips.map(({ label, icon: Icon, to }) => (
            <button
              key={label}
              type="button"
              onClick={() => navigate(to)}
              className="inline-flex items-center gap-1.5 rounded-full border bg-secondary/50 px-3 py-1.5 text-xs transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              style={{ borderColor: SURFACE_BORDER, color: 'var(--muted-foreground)' }}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
          {draftTotal + pendingComments > 0 && (
            <button
              type="button"
              onClick={() => navigate(draftTotal > 0 ? '/photo-journal' : '/settings')}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              style={{ backgroundColor: ACCENT_SOFT, color: 'var(--primary)' }}
            >
              {draftTotal > 0
                ? t('admin.home_proposal_drafts', language, { n: draftTotal })
                : t('admin.home_proposal_comments', language, { n: pendingComments })}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

interface Proposal {
  key: 'drafts' | 'comments'
  icon: typeof PenLine
  title: string
  evidence: string
  actionLabel: string
  onGo: () => void
}

/** 提案卡片：图标胶囊 + 一句建议 + 依据 + 去处理。 */
function ProposalCard({ proposal }: { proposal: Proposal }) {
  const { icon: Icon, title, evidence, actionLabel, onGo } = proposal
  return (
    <div
      className="flex items-start gap-3 rounded-xl border bg-card/85 p-4"
      style={{ borderColor: SURFACE_BORDER, boxShadow: CARD_SHADOW }}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: ACCENT_SOFT, color: 'var(--primary)' }}>
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug" style={{ color: 'var(--foreground)' }}>{title}</p>
        <p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{evidence}</p>
      </div>
      <button
        type="button"
        onClick={onGo}
        className="shrink-0 self-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', borderColor: 'var(--primary)' }}
      >
        {actionLabel}
      </button>
    </div>
  )
}

/** 继续上次：最近叙事 / 博客混排，点标题打开站点或进编辑器。 */
function ContinueList({
  items,
  loading,
  noDataLabel,
  language,
  onOpen,
}: {
  items: FeedItem[]
  loading: boolean
  noDataLabel: string
  language: Locale
  onOpen: (item: FeedItem) => void
}) {
  const storyLabel = t('admin.overview_stories', language)
  const blogLabel = t('admin.overview_blogs', language)
  const draftLabel = t('admin.overview_draft', language)
  const untitledLabel = t('admin.overview_untitled', language)

  if (loading) {
    return (
      <div className="space-y-2 rounded-xl border p-3" style={{ borderColor: SURFACE_BORDER, boxShadow: CARD_SHADOW }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: SURFACE_BORDER, boxShadow: CARD_SHADOW }}>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>
          {noDataLabel}
        </div>
      ) : (
        items.map((item, index) => {
          const time = formatRelative(item.createdAt, language)
          return (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              onClick={() => onOpen(item)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
                index > 0 && 'border-t',
              )}
              style={index > 0 ? { borderColor: SURFACE_BORDER } : undefined}
            >
              <span className="shrink-0" style={{ color: 'var(--muted-foreground)' }}>
                {item.kind === 'story' ? <PenLine size={13} /> : <FileText size={13} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-serif text-[14px] font-medium" style={{ color: 'var(--foreground)' }}>
                  {item.title || untitledLabel}
                </span>
                <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                  {item.kind === 'story' ? storyLabel : blogLabel}
                  {time ? ` · ${time}` : ''}
                </span>
              </span>
              {!item.isPublished && (
                <span
                  className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px]"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--muted-foreground) 14%, transparent)', color: 'var(--muted-foreground)' }}
                >
                  {draftLabel}
                </span>
              )}
              <ArrowUpRight size={13} className="shrink-0 opacity-40" />
            </button>
          )
        })
      )}
    </div>
  )
}

interface StreamAction {
  key: string
  icon: typeof PenLine
  label: string
  onRun: (photos: RecentPhoto[]) => void
}

/** 照片流：可多选，选中后浮出动作条。 */
function PhotoStream({
  photos,
  loading,
  noDataLabel,
  language,
  actions,
}: {
  photos: RecentPhoto[]
  loading: boolean
  noDataLabel: string
  language: Locale
  actions: StreamAction[]
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const runAction = (action: StreamAction) => {
    const picked = photos.filter(photo => selected.has(photo.id))
    if (picked.length === 0) return
    setSelected(new Set())
    action.onRun(picked)
  }

  if (loading) {
    return (
      <div className="grid grid-cols-4 gap-2.5 [grid-auto-rows:130px]">
        {Array.from({ length: RECENT_PHOTO_LIMIT }).map((_, index) => (
          <Skeleton key={index} className={cn('rounded-xl', index === 0 && 'col-span-2 row-span-2')} />
        ))}
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-xs"
        style={{ borderColor: SURFACE_BORDER, color: 'var(--muted-foreground)' }}
      >
        <Image size={18} />
        {noDataLabel}
      </div>
    )
  }

  return (
    <div className="relative">
      {selected.size > 0 && (
        <div
          className="mb-2.5 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2"
          style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}
        >
          <span className="text-xs font-semibold tabular-nums">
            {t('admin.home_photo_stream_selected', language, { n: selected.size })}
          </span>
          {actions.map(action => (
            <button
              key={action.key}
              type="button"
              onClick={() => runAction(action)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              style={{ backgroundColor: 'color-mix(in srgb, var(--background) 14%, transparent)' }}
            >
              <action.icon size={12} />
              {action.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            aria-label={t('admin.window_close', language)}
            className="ml-auto rounded-lg p-1.5 opacity-60 transition-opacity hover:opacity-100"
          >
            <X size={13} />
          </button>
        </div>
      )}
      <div className="grid auto-rows-[130px] grid-cols-4 gap-2.5 [grid-auto-flow:dense]">
        {photos.slice(0, RECENT_PHOTO_LIMIT).map((photo, index) => {
          const imgSrc = photo.thumbnailUrl
            ? resolveAssetUrl(photo.thumbnailUrl)
            : photo.url
              ? resolveAssetUrl(photo.url)
              : null
          const isSel = selected.has(photo.id)
          const time = formatRelative(photo.createdAt, language)
          return (
            <figure
              key={photo.id}
              onClick={() => toggle(photo.id)}
              className={cn(
                'group relative min-h-0 cursor-pointer overflow-hidden rounded-xl transition-shadow',
                index === 0 && 'col-span-2 row-span-2',
                isSel && 'ring-2 ring-offset-2',
              )}
              style={{
                backgroundColor: 'var(--secondary)',
                ['--tw-ring-color' as string]: 'var(--primary)',
                ['--tw-ring-offset-color' as string]: 'var(--background)',
              }}
            >
              {imgSrc ? (
                <img
                  src={imgSrc}
                  alt={photo.title}
                  loading="lazy"
                  draggable={false}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <Image size={16} style={{ color: 'var(--muted-foreground)' }} />
                </span>
              )}
              <span
                className={cn(
                  'absolute left-2.5 top-2.5 z-10 flex size-5 items-center justify-center rounded-full border-2 border-white/90 bg-black/25 text-[10px] text-white transition-opacity',
                  isSel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                )}
                style={isSel ? { backgroundColor: 'var(--primary)', borderColor: 'var(--primary)' } : undefined}
              >
                <Check size={11} />
              </span>
              <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/75 to-transparent px-2.5 pb-2 pt-7 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                <span className="block truncate text-[11px] font-medium text-white">{photo.title}</span>
                {time && <span className="block font-mono text-[10px] text-white/70">{time}</span>}
              </figcaption>
            </figure>
          )
        })}
      </div>
    </div>
  )
}

export function HomePage() {
  const { language } = usePreferences()
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const { siteTitle, siteUrl } = useDesktopSiteIdentity()
  const setSettingsTab = useSettingsNav(state => state.setTab)
  const overviewRevision = useDataRevision('overview')
  const cachedOverview = getOverviewCache()
  const [data, setData] = useState<OverviewDTO | null>(cachedOverview)
  const [loading, setLoading] = useState(!cachedOverview)
  const [error, setError] = useState<string | null>(null)
  const [syncedAt, setSyncedAt] = useState<Date | null>(null)
  const [quietMode, setQuietMode] = useState(false)

  const fetchData = useCallback(async (force = false) => {
    const cache = getOverviewCache()
    if (!force && cache) {
      setData(cache)
      setLoading(false)
      setError(null)
      if (isOverviewCacheFresh() && Array.isArray(cache.dailyPhotos) && cache.photoActivityYear === new Date().getUTCFullYear()) return
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

  const isLoading = loading || !data
  const noDataLabel = t('admin.overview_no_data', language)
  const host = siteLabel(siteUrl)

  const draftTotal = (data?.draftAlbums ?? 0) + (data?.draftStories ?? 0) + (data?.draftBlogs ?? 0)
  const pendingComments = data?.pendingComments ?? 0

  const recentFeed = useMemo<FeedItem[]>(() => {
    if (!data) return []
    const items: FeedItem[] = [
      ...data.recentStories.map(item => ({ ...item, kind: 'story' as const })),
      ...data.recentBlogs.map(item => ({ ...item, kind: 'blog' as const })),
    ]
    return items
      .sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return timeB - timeA
      })
      .slice(0, RECENT_FEED_LIMIT)
  }, [data])

  const openFeedItem = useCallback((item: FeedItem) => {
    if (item.isPublished) {
      const url = getPublicContentUrl(item.kind, item.id)
      if (url) {
        BrowserOpenURL(url)
        return
      }
    }
    // 未发布的草稿直接在编辑器里打开这一篇，而不是落在列表页
    navigate(
      `/photo-journal?automationDocument=${encodeURIComponent(item.id)}&automationKind=${item.kind}&automationSource=database`,
    )
  }, [navigate])

  const proposals = useMemo<Proposal[]>(() => {
    const list: Proposal[] = []
    if (draftTotal > 0) {
      list.push({
        key: 'drafts',
        icon: PenLine,
        title: t('admin.home_proposal_drafts', language, { n: draftTotal }),
        evidence: t('admin.home_proposal_drafts_evidence', language, {
          stories: data?.draftStories ?? 0,
          blogs: data?.draftBlogs ?? 0,
          albums: data?.draftAlbums ?? 0,
        }),
        actionLabel: t('admin.home_proposal_write', language),
        onGo: () => navigate('/photo-journal'),
      })
    }
    if (pendingComments > 0) {
      list.push({
        key: 'comments',
        icon: MessageSquare,
        title: t('admin.home_proposal_comments', language, { n: pendingComments }),
        evidence: t('admin.home_proposal_comments_evidence', language),
        actionLabel: t('admin.home_proposal_review', language),
        onGo: () => {
          setSettingsTab('comments')
          navigate('/settings')
        },
      })
    }
    return list
  }, [data, draftTotal, pendingComments, language, navigate, setSettingsTab])

  // 把选中照片的访问地址交给 AI 助手（视觉模型按 URL 取图）
  const photoHandoffUrls = useCallback((picked: RecentPhoto[]) => (
    picked
      .map(photo => photo.url || photo.thumbnailUrl)
      .filter(Boolean)
      .map(src => resolveAssetUrl(src))
  ), [])

  const streamActions: StreamAction[] = useMemo(() => [
    {
      key: 'write',
      icon: PenLine,
      label: t('admin.home_act_write', language),
      onRun: picked => navigate(`/photo-journal?newStoryPhotos=${picked.map(p => p.id).join(',')}`),
    },
    {
      key: 'album',
      icon: LibraryBig,
      label: t('admin.home_act_album', language),
      onRun: picked => navigate(`/library?source=cloud&view=albums&create=1&photos=${picked.map(p => p.id).join(',')}`),
    },
    { key: 'zine', icon: BookImage, label: t('admin.home_act_zine', language), onRun: () => navigate('/design') },
    {
      key: 'ask',
      icon: Bot,
      label: t('admin.home_act_ask', language),
      onRun: picked => {
        const params = new URLSearchParams({
          q: t('admin.home_ask_with_photos', language, { n: picked.length }),
          images: photoHandoffUrls(picked).join(','),
          send: '1',
        })
        navigate(`/ai-assistant?${params.toString()}`)
      },
    },
  ], [language, navigate, photoHandoffUrls, t])

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col overflow-y-auto custom-scrollbar"
      style={{ ...SCROLL_STYLE, backgroundColor: PAGE_BACKGROUND }}
    >
      <div className="mx-auto w-full max-w-6xl px-8 pb-12 pt-8">

        {/* Hero：问候 + 今日一句话 + 万能输入框 */}
        <section>
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: 'var(--muted-foreground)' }}>
            {siteTitle} · {t('admin.home_workbench', language)}
          </div>
          <h1 className="mt-3 font-serif text-[38px] leading-tight tracking-tight">
            {t('admin.home_greeting_line', language, {
              greeting: t(getGreetingKey(new Date().getHours()), language),
              name: user?.username || 'Admin',
            })}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[13px]" style={{ color: 'var(--muted-foreground)' }}>
            <span>{formatToday(language)}</span>
            <span className="opacity-50">·</span>
            <span>
              {host
                ? t('admin.home_connected_to', language, { site: host })
                : t('admin.home_not_connected', language)}
            </span>
            {syncedAt && (
              <>
                <span className="opacity-50">·</span>
                <span className="tabular-nums">{t('admin.home_synced_at', language, { time: formatClock(syncedAt, language) })}</span>
              </>
            )}
            {draftTotal > 0 && (
              <>
                <span className="opacity-50">·</span>
                <InlineLink
                  label={t('admin.home_proposal_drafts', language, { n: draftTotal })}
                  onClick={() => navigate('/photo-journal')}
                />
              </>
            )}
            {pendingComments > 0 && (
              <>
                <span className="opacity-50">·</span>
                <InlineLink
                  label={t('admin.home_proposal_comments', language, { n: pendingComments })}
                  onClick={() => {
                    setSettingsTab('comments')
                    navigate('/settings')
                  }}
                />
              </>
            )}
          </p>

          <OmniBox language={language} draftTotal={draftTotal} pendingComments={pendingComments} />
        </section>

        {error && (
          <div className="mt-6 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--destructive)', color: 'var(--destructive)' }}>
            {error}
          </div>
        )}

        {/* 今日提案 / 继续上次 */}
        <div className="mt-9 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <section className="min-w-0">
            <SectionHeader title={t('admin.home_proposals', language)}>
              {(proposals.length > 0 || !isLoading) && (
                <button
                  type="button"
                  onClick={() => setQuietMode(true)}
                  className="text-[11px] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  {quietMode
                    ? t('admin.home_proposals_quiet_done', language)
                    : t('admin.home_proposals_quiet', language)}
                </button>
              )}
            </SectionHeader>
            {isLoading ? (
              <div className="space-y-2.5">
                <Skeleton className="h-[86px] w-full rounded-xl" />
                <Skeleton className="h-[86px] w-full rounded-xl" />
              </div>
            ) : quietMode || proposals.length === 0 ? (
              <div
                className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-xs"
                style={{ borderColor: SURFACE_BORDER, color: 'var(--muted-foreground)' }}
              >
                <Sparkles size={14} />
                {quietMode
                  ? t('admin.home_proposals_quiet_done', language)
                  : t('admin.home_proposal_empty', language)}
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {proposals.map(proposal => (
                  <ProposalCard key={proposal.key} proposal={proposal} />
                ))}
              </div>
            )}
          </section>

          <aside className="min-w-0">
            <SectionHeader title={t('admin.home_continue', language)} />
            <ContinueList
              items={recentFeed}
              loading={isLoading}
              noDataLabel={noDataLabel}
              language={language}
              onOpen={openFeedItem}
            />
          </aside>
        </div>

        {/* 照片流 */}
        <section className="mt-9">
          <SectionHeader title={t('admin.home_photo_stream', language)}>
            <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
              {t('admin.home_photo_stream_hint', language)}
            </span>
          </SectionHeader>
          <PhotoStream
            photos={data?.recentPhotos ?? []}
            loading={isLoading}
            noDataLabel={t('admin.home_photo_stream_empty', language)}
            language={language}
            actions={streamActions}
          />
        </section>

        {/* 今年：按上传日期汇总的全年热力图 */}
        <section className="mt-9">
          <SectionHeader title={t('admin.home_year', language)}>
            <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
              {data?.photoActivityYear || new Date().getUTCFullYear()}
            </span>
          </SectionHeader>
          <HomePhotoActivity data={data} loading={isLoading} language={language} />
        </section>

      </div>
    </div>
  )
}
