import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Skeleton } from '@/components/admin/Skeleton'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { Locale } from '@/lib/i18n'
import type { services } from '../../../wailsjs/go/models'

const DAY_MS = 86_400_000
const LEVEL_COLORS = [
  'bg-[#ebedf0] [.dark_&]:bg-[#202520]',
  'bg-[#9be9a8] [.dark_&]:bg-[#0e4429]',
  'bg-[#40c463] [.dark_&]:bg-[#006d32]',
  'bg-[#30a14e] [.dark_&]:bg-[#26a641]',
  'bg-[#216e39] [.dark_&]:bg-[#39d353]',
]

interface HomePhotoActivityProps {
  data: services.OverviewDTO | null
  loading: boolean
  language: Locale
}

interface ActivityTooltip {
  label: string
  x: number
  y: number
  below: boolean
}

export function HomePhotoActivity({ data, loading, language }: HomePhotoActivityProps) {
  const navigate = useNavigate()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const [focusedDay, setFocusedDay] = useState<number | null>(null)
  const [tooltip, setTooltip] = useState<ActivityTooltip | null>(null)
  const tooltipVisible = tooltip !== null

  useEffect(() => {
    if (!tooltipVisible) return
    const dismiss = () => setTooltip(null)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [tooltipVisible])
  const today = new Date().toISOString().slice(0, 10)
  const year = data?.photoActivityYear || new Date().getUTCFullYear()
  const ready = !loading && Array.isArray(data?.dailyPhotos)
  const locale = language === 'zh' ? 'zh-CN' : 'en-US'

  const calendar = useMemo(() => {
    const start = Date.UTC(year, 0, 1)
    const dayCount = (Date.UTC(year + 1, 0, 1) - start) / DAY_MS
    const offset = new Date(start).getUTCDay()
    const counts = new Map(data?.dailyPhotos?.map(day => [day.date, day.count]) ?? [])
    const days = Array.from({ length: dayCount }, (_, index) => {
      const date = new Date(start + index * DAY_MS)
      const key = date.toISOString().slice(0, 10)
      return { date, key, count: counts.get(key) ?? 0 }
    })
    return {
      days,
      offset,
      weeks: Math.ceil((offset + dayCount) / 7),
      peak: Math.max(0, ...days.map(day => day.count)),
      activeDays: days.filter(day => day.count > 0).length,
    }
  }, [data?.dailyPhotos, year])

  const lastAvailableDay = calendar.days.reduce((last, day, index) => day.key <= today ? index : last, -1)
  const tabStop = Math.min(focusedDay ?? lastAvailableDay, lastAvailableDay)
  const columns = `repeat(${calendar.weeks}, minmax(0, 1fr))`
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC',
  })

  function showTooltip(element: HTMLButtonElement, label: string) {
    const rect = element.getBoundingClientRect()
    const below = rect.top < 64
    setTooltip({
      label,
      x: Math.max(128, Math.min(window.innerWidth - 128, rect.left + rect.width / 2)),
      y: below ? rect.bottom + 8 : rect.top - 8,
      below,
    })
  }

  return (
    <div aria-busy={loading} className="min-w-0 border-y border-border py-4">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="flex items-baseline gap-2.5">
          {loading ? <Skeleton className="h-7 w-16" /> : (
            <span className="font-mono text-2xl font-semibold leading-none tabular-nums text-foreground">
              {(data?.photosThisYear ?? 0).toLocaleString(locale)}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{t('admin.home_year_uploads', language)}</span>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
          <span>{t('admin.home_year_active_days', language)} <b className="ml-1 font-mono font-medium tabular-nums text-foreground">{ready ? calendar.activeDays : '--'}</b></span>
          <span>{t('admin.home_year_peak', language)} <b className="ml-1 font-mono font-medium tabular-nums text-foreground">{ready ? calendar.peak.toLocaleString(locale) : '--'}</b></span>
        </div>
      </div>

      <div
        className="overflow-x-auto pb-1 custom-scrollbar"
        onScroll={() => setTooltip(null)}
        onMouseLeave={() => setTooltip(null)}
      >
        <div className="min-w-[640px]">
          <div className="mb-2 ml-8 grid gap-[3px] text-[10px] leading-4 text-muted-foreground" style={{ gridTemplateColumns: columns }} aria-hidden="true">
            {Array.from({ length: 12 }, (_, month) => {
              const date = new Date(Date.UTC(year, month, 1))
              const dayIndex = (date.getTime() - Date.UTC(year, 0, 1)) / DAY_MS
              return (
                <span key={month} className="whitespace-nowrap" style={{ gridColumn: `${Math.floor((calendar.offset + dayIndex) / 7) + 1} / span 3` }}>
                  {monthFormatter.format(date)}
                </span>
              )
            })}
          </div>
          <div className="flex gap-2">
            <div className="grid w-6 shrink-0 grid-rows-7 gap-[3px] text-[9px] leading-none text-muted-foreground" aria-hidden="true">
              {Array.from({ length: 7 }, (_, weekday) => (
                <span key={weekday} className="flex items-center">
                  {weekday % 2 === 1 && (language === 'zh'
                    ? ['日', '一', '二', '三', '四', '五', '六'][weekday]
                    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday])}
                </span>
              ))}
            </div>
            <div
              role="group"
              aria-label={t('admin.home_year_calendar', language, { year })}
              className={cn('grid min-w-0 flex-1 grid-flow-col grid-rows-7 gap-[3px]', loading && 'motion-safe:animate-pulse')}
              style={{ gridTemplateColumns: columns }}
            >
              {Array.from({ length: calendar.weeks * 7 }, (_, cellIndex) => {
                const dayIndex = cellIndex - calendar.offset
                const day = calendar.days[dayIndex]
                if (!day) return <span key={cellIndex} className="aspect-square" />
                const future = day.key > today
                const level = day.count > 0 ? Math.max(1, Math.ceil((day.count / Math.max(1, calendar.peak)) * 4)) : 0
                const label = `${dateFormatter.format(day.date)} · ${t('admin.home_year_day_count', language, { n: day.count })}`
                if (!ready || future) return (
                  <span key={cellIndex} className={cn('aspect-square rounded-[3px]', LEVEL_COLORS[0], future && 'opacity-35')} />
                )
                return (
                  <button
                    key={cellIndex}
                    ref={element => { buttons.current[dayIndex] = element }}
                    type="button"
                    tabIndex={dayIndex === tabStop ? 0 : -1}
                    aria-label={label}
                    aria-disabled={day.count === 0}
                    aria-current={day.key === today ? 'date' : undefined}
                    className={cn(
                      'aspect-square min-w-0 rounded-[3px] border-0 p-0 ring-inset ring-foreground/10 transition-shadow hover:ring-2 hover:ring-foreground/50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                      LEVEL_COLORS[level],
                      day.count > 0 ? 'cursor-pointer' : 'cursor-default',
                      day.key === today && 'ring-1 ring-foreground/50',
                    )}
                    onMouseEnter={event => showTooltip(event.currentTarget, label)}
                    onFocus={event => {
                      setFocusedDay(dayIndex)
                      showTooltip(event.currentTarget, label)
                    }}
                    onBlur={() => setTooltip(null)}
                    onKeyDown={event => {
                      const nextDay = {
                        ArrowLeft: dayIndex - 7, ArrowRight: dayIndex + 7,
                        ArrowUp: dayIndex - 1, ArrowDown: dayIndex + 1,
                        Home: 0, End: lastAvailableDay,
                      }[event.key]
                      if (event.key === 'Escape') setTooltip(null)
                      if (nextDay === undefined) return
                      event.preventDefault()
                      buttons.current[Math.max(0, Math.min(lastAvailableDay, nextDay))]?.focus()
                    }}
                    onClick={() => {
                      if (day.count <= 0) return
                      setTooltip(null)
                      const query = language === 'zh'
                        ? `回顾 ${day.key}（UTC）上传的照片`
                        : `Review my photos uploaded on ${day.key} (UTC)`
                      navigate(`/ai-assistant?q=${encodeURIComponent(query)}&send=1`)
                    }}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-[10px] text-muted-foreground">
        <span className="min-w-0">
          {!loading && !ready
            ? t('admin.home_year_unavailable', language)
            : ready && calendar.activeDays === 0
              ? t('admin.home_year_empty', language)
              : t('admin.home_year_date_basis', language)}
        </span>
        <div className="flex shrink-0 items-center gap-1" aria-hidden="true">
          <span className="mr-1">{t('admin.home_year_less', language)}</span>
          {LEVEL_COLORS.map(color => <span key={color} className={cn('size-2.5 rounded-[2px]', color)} />)}
          <span className="ml-1">{t('admin.home_year_more', language)}</span>
        </div>
      </div>
      {tooltip && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 w-max max-w-[240px] rounded-md border border-border bg-popover px-3 py-2 text-center text-[11px] leading-relaxed text-popover-foreground shadow-md"
          style={{ left: tooltip.x, top: tooltip.y, transform: `translate(-50%, ${tooltip.below ? '0' : '-100%'})` }}
        >
          {tooltip.label}
        </div>,
        document.body,
      )}
    </div>
  )
}
