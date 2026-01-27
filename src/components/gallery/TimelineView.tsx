'use client'

import { useMemo, useState, useRef, useCallback, useEffect, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, ChevronRight, X } from 'lucide-react'
import { PhotoDto, PublicSettingsDto, resolveAssetUrl } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'

// Unified photo item with IntersectionObserver-based entrance animation
interface TimelinePhotoItemProps {
  photo: PhotoDto
  index: number
  settings: PublicSettingsDto | null
  grayscale: boolean
  onClick: () => void
}

const TimelinePhotoItem = memo(function TimelinePhotoItem({ photo, index, settings, grayscale, onClick }: TimelinePhotoItemProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1, rootMargin: '50px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Stagger delay - creates wave effect across grid
  const staggerDelay = (index % 6) * 0.06

  return (
    <div
      ref={ref}
      className="group relative aspect-square cursor-pointer overflow-hidden bg-muted"
      onClick={onClick}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.96)',
        transition: `opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${staggerDelay}s, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${staggerDelay}s`,
      }}
    >
      <img
        src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
        alt={photo.title}
        className={`w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-105 ${
          grayscale ? 'grayscale group-hover:grayscale-0' : ''
        }`}
      />

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
        <p className="text-ui-xs font-black text-primary uppercase tracking-[0.2em] mb-0.5">
          {photo.category.split(',')[0]}
        </p>
        <h3 className="text-lg font-serif text-white leading-tight line-clamp-1">
          {photo.title}
        </h3>
      </div>

      {/* Time Badge */}
      {photo.takenAt && (
        <div className="absolute top-2 right-2 text-ui-micro font-mono text-white/70 bg-black/40 px-1.5 py-0.5">
          {new Date(photo.takenAt).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          })}
        </div>
      )}

      {/* No date indicator */}
      {!photo.takenAt && (
        <div className="absolute top-2 right-2 text-ui-micro font-mono text-white/50 bg-black/30 px-1.5 py-0.5">
          ?
        </div>
      )}
    </div>
  )
})

interface TimelineViewProps {
  photos: PhotoDto[]
  settings: PublicSettingsDto | null
  grayscale: boolean
  onPhotoClick: (photo: PhotoDto) => void
}

interface DayGroup {
  date: Date
  dateKey: string
  year: number
  month: number
  day: number
  photos: PhotoDto[]
  hasTakenAt: boolean
}

interface YearGroup {
  year: number
  months: {
    month: number
    days: DayGroup[]
  }[]
}

export function TimelineView({ photos, settings, grayscale, onPhotoClick }: TimelineViewProps) {
  const { t } = useLanguage()
  const [showJumpDialog, setShowJumpDialog] = useState(false)
  const [expandedYear, setExpandedYear] = useState<number | null>(null)
  const dayRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Group photos by date (takenAt first, then createdAt for those without takenAt)
  const groupedByDay = useMemo(() => {
    const withTakenAt: PhotoDto[] = []
    const withoutTakenAt: PhotoDto[] = []

    photos.forEach(photo => {
      if (photo.takenAt) {
        withTakenAt.push(photo)
      } else {
        withoutTakenAt.push(photo)
      }
    })

    withTakenAt.sort((a, b) => new Date(b.takenAt!).getTime() - new Date(a.takenAt!).getTime())
    withoutTakenAt.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const dayGroups: Map<string, DayGroup> = new Map()

    withTakenAt.forEach(photo => {
      const date = new Date(photo.takenAt!)
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

      if (!dayGroups.has(dateKey)) {
        dayGroups.set(dateKey, {
          date,
          dateKey,
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          day: date.getDate(),
          photos: [],
          hasTakenAt: true,
        })
      }
      dayGroups.get(dateKey)!.photos.push(photo)
    })

    const noDateGroups: Map<string, DayGroup> = new Map()
    withoutTakenAt.forEach(photo => {
      const date = new Date(photo.createdAt)
      const dateKey = `upload-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

      if (!noDateGroups.has(dateKey)) {
        noDateGroups.set(dateKey, {
          date,
          dateKey,
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          day: date.getDate(),
          photos: [],
          hasTakenAt: false,
        })
      }
      noDateGroups.get(dateKey)!.photos.push(photo)
    })

    const sortedDaysWithTakenAt = Array.from(dayGroups.values()).sort((a, b) =>
      b.date.getTime() - a.date.getTime()
    )

    const sortedDaysWithoutTakenAt = Array.from(noDateGroups.values()).sort((a, b) =>
      b.date.getTime() - a.date.getTime()
    )

    return [...sortedDaysWithTakenAt, ...sortedDaysWithoutTakenAt]
  }, [photos])

  // Group by year > month for jump dialog
  const yearGroups = useMemo((): YearGroup[] => {
    const groups: Map<number, Map<number, DayGroup[]>> = new Map()

    groupedByDay.forEach(day => {
      const year = day.hasTakenAt ? day.year : 0 // 0 for unknown dates
      const month = day.month

      if (!groups.has(year)) {
        groups.set(year, new Map())
      }
      if (!groups.get(year)!.has(month)) {
        groups.get(year)!.set(month, [])
      }
      groups.get(year)!.get(month)!.push(day)
    })

    return Array.from(groups.entries())
      .sort(([a], [b]) => b - a)
      .map(([year, months]) => ({
        year,
        months: Array.from(months.entries())
          .sort(([a], [b]) => b - a)
          .map(([month, days]) => ({ month, days }))
      }))
  }, [groupedByDay])

  const formatMonth = (month: number) => {
    const monthKeys = [
      'gallery.months_jan', 'gallery.months_feb', 'gallery.months_mar',
      'gallery.months_apr', 'gallery.months_may', 'gallery.months_jun',
      'gallery.months_jul', 'gallery.months_aug', 'gallery.months_sep',
      'gallery.months_oct', 'gallery.months_nov', 'gallery.months_dec'
    ]
    return t(monthKeys[month - 1] || '')
  }

  const formatMonthShort = (month: number) => {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
    return months[month - 1] || ''
  }

  const formatDay = (day: number) => {
    return String(day).padStart(2, '0')
  }

  const getWeekday = (date: Date) => {
    const weekdayKeys = [
      'gallery.weekday_sun', 'gallery.weekday_mon', 'gallery.weekday_tue',
      'gallery.weekday_wed', 'gallery.weekday_thu', 'gallery.weekday_fri',
      'gallery.weekday_sat'
    ]
    return t(weekdayKeys[date.getDay()])
  }

  const setDayRef = useCallback((dateKey: string, el: HTMLDivElement | null) => {
    if (el) {
      dayRefs.current.set(dateKey, el)
    } else {
      dayRefs.current.delete(dateKey)
    }
  }, [])

  const scrollToDate = (dateKey: string) => {
    const element = dayRefs.current.get(dateKey)
    if (element) {
      const headerOffset = 80
      const elementPosition = element.getBoundingClientRect().top + window.scrollY
      window.scrollTo({
        top: elementPosition - headerOffset,
        behavior: 'smooth'
      })
    }
    setShowJumpDialog(false)
    setExpandedYear(null)
  }

  const totalPhotos = groupedByDay.reduce((sum, day) => sum + day.photos.length, 0)

  return (
    <div className="relative">
      {/* Jump Dialog */}
      <AnimatePresence>
        {showJumpDialog && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                setShowJumpDialog(false)
                setExpandedYear(null)
              }}
            />

            {/* Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md max-h-[70vh] bg-background border border-border shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-primary" />
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-[0.15em]">{t('gallery.timeline_navigator')}</h3>
                    <p className="text-ui-micro text-muted-foreground font-mono mt-0.5">
                      {totalPhotos} {t('gallery.timeline_photos')} · {groupedByDay.length} {t('gallery.timeline_days')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowJumpDialog(false)
                    setExpandedYear(null)
                  }}
                  className="p-2 hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Content */}
              <div className="overflow-y-auto max-h-[calc(70vh-64px)] custom-scrollbar">
                {yearGroups.map((yearGroup) => (
                  <div key={yearGroup.year} className="border-b border-border last:border-b-0">
                    {/* Year Header */}
                    <button
                      onClick={() => setExpandedYear(expandedYear === yearGroup.year ? null : yearGroup.year)}
                      className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-2xl font-serif font-light">
                          {yearGroup.year === 0 ? '?' : yearGroup.year}
                        </span>
                        {yearGroup.year === 0 && (
                          <span className="text-xs text-muted-foreground uppercase tracking-widest">
                            {t('gallery.timeline_unknown_date')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                      <span className="text-ui-micro text-muted-foreground font-mono">
                        {yearGroup.months.reduce((sum, m) => sum + m.days.reduce((s, d) => s + d.photos.length, 0), 0)} {t('gallery.timeline_photos')}
                      </span>
                        <motion.div
                          animate={{ rotate: expandedYear === yearGroup.year ? 90 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </motion.div>
                      </div>
                    </button>

                    {/* Months & Days */}
                    <AnimatePresence>
                      {expandedYear === yearGroup.year && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden bg-muted/20"
                        >
                          {yearGroup.months.map((monthGroup) => (
                            <div key={monthGroup.month} className="border-t border-border/50">
                              {/* Month Header */}
                              <div className="px-6 py-2 bg-muted/30">
                                <span className="text-ui-micro font-black uppercase tracking-[0.2em] text-muted-foreground">
                                  {yearGroup.year === 0 ? t('gallery.timeline_uploaded') : formatMonth(monthGroup.month)}
                                </span>
                              </div>

                              {/* Days Grid */}
                              <div className="px-6 py-3 flex flex-wrap gap-2">
                                {monthGroup.days.map((day) => (
                                  <button
                                    key={day.dateKey}
                                    onClick={() => scrollToDate(day.dateKey)}
                                    className="group relative flex flex-col items-center justify-center w-12 h-14 border border-border hover:border-primary hover:bg-primary/5 transition-all"
                                  >
                                    <span className="text-lg font-light font-serif group-hover:text-primary transition-colors">
                                      {formatDay(day.day)}
                                    </span>
                                    <span className="text-ui-nano text-muted-foreground font-mono">
                                      {day.photos.length}
                                    </span>
                                    {/* Indicator dot */}
                                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Timeline Line - Left side */}
      <div className="absolute left-4 md:left-8 top-0 bottom-0 w-px bg-border" />

      {groupedByDay.map((dayGroup, dayIndex) => (
        <div
          key={dayGroup.dateKey}
          ref={(el) => setDayRef(dayGroup.dateKey, el)}
          className="relative"
        >
            {/* Sticky Date Header */}
            <div className="sticky top-[116px] z-20 -ml-1 md:-ml-0">
              <div className="relative py-3 bg-background/95 backdrop-blur-sm">
                {/* Timeline Node - Clickable */}
                <button
                  onClick={() => setShowJumpDialog(true)}
                  className="absolute left-[17px] md:left-[33px] top-1/2 -translate-y-1/2 w-3 h-3 bg-primary border-2 border-background z-10 shadow-sm hover:scale-150 hover:bg-primary/80 transition-transform cursor-pointer"
                  title={t('gallery.timeline_jump_hint')}
                />

                {/* Date Label - Also Clickable */}
                <div className="ml-10 md:ml-16">
                  <button
                    onClick={() => setShowJumpDialog(true)}
                    className="inline-flex items-center gap-3 border border-border px-4 py-2 bg-background shadow-sm hover:border-primary hover:shadow-md transition-all group"
                  >
                    <Calendar className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
                    {dayGroup.hasTakenAt ? (
                      <div className="flex items-center gap-2">
                        <span className="text-ui-xs font-black uppercase tracking-[0.2em]">
                          {formatMonthShort(dayGroup.month)} {formatDay(dayGroup.day)}
                        </span>
                        <span className="text-ui-micro text-muted-foreground font-mono">
                          {dayGroup.year}
                        </span>
                        <span className="text-ui-micro text-muted-foreground/60 font-mono">
                          {getWeekday(dayGroup.date)}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-ui-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
                          {t('gallery.timeline_uploaded')}
                        </span>
                        <span className="text-ui-micro text-muted-foreground font-mono">
                          {formatMonthShort(dayGroup.month)} {formatDay(dayGroup.day)}, {dayGroup.year}
                        </span>
                      </div>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Photos Grid */}
            <div className="ml-10 md:ml-16 pb-8 pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
                {dayGroup.photos.map((photo, index) => (
                  <TimelinePhotoItem
                    key={photo.id}
                    photo={photo}
                    index={index}
                    settings={settings}
                    grayscale={grayscale}
                    onClick={() => onPhotoClick(photo)}
                  />
                ))}
              </div>
            </div>
        </div>
      ))}

      {/* Empty State */}
      {groupedByDay.length === 0 && (
        <div className="ml-10 md:ml-16 py-20 text-center">
          <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-sm text-muted-foreground">{t('gallery.timeline_no_photos')}</p>
        </div>
      )}
    </div>
  )
}
