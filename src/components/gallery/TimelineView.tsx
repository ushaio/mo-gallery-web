'use client'

import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, ChevronRight, X } from 'lucide-react'
import { resolveAssetUrl } from '@/lib/api/core'
import type { PhotoDto, PublicSettingsDto } from '@/lib/api/types'
import { useLanguage } from '@/contexts/LanguageContext'
import { useEntranceAnimation } from '@/hooks/useEntranceAnimation'

const MONTH_KEYS = [
  'gallery.months_jan',
  'gallery.months_feb',
  'gallery.months_mar',
  'gallery.months_apr',
  'gallery.months_may',
  'gallery.months_jun',
  'gallery.months_jul',
  'gallery.months_aug',
  'gallery.months_sep',
  'gallery.months_oct',
  'gallery.months_nov',
  'gallery.months_dec',
]

const SHORT_MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const WEEKDAY_KEYS = [
  'gallery.weekday_sun',
  'gallery.weekday_mon',
  'gallery.weekday_tue',
  'gallery.weekday_wed',
  'gallery.weekday_thu',
  'gallery.weekday_fri',
  'gallery.weekday_sat',
]

interface TimelinePhotoItemProps {
  photo: PhotoDto
  index: number
  settings: PublicSettingsDto | null
  grayscale: boolean
  onClick: () => void
}

const TimelinePhotoItem = memo(function TimelinePhotoItem({
  photo,
  index,
  settings,
  grayscale,
  onClick,
}: TimelinePhotoItemProps) {
  const { ref, style } = useEntranceAnimation({ index, columnCount: 6 })
  const coverUrl = useMemo(
    () => resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain),
    [photo.thumbnailUrl, photo.url, settings?.cdn_domain],
  )
  const primaryCategory = useMemo(() => photo.category.split(',')[0], [photo.category])
  const takenTimeLabel = useMemo(() => {
    if (!photo.takenAt) return null
    return new Date(photo.takenAt).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }, [photo.takenAt])

  return (
    <div
      ref={ref}
      className="group relative aspect-square cursor-pointer overflow-hidden bg-muted"
      onClick={onClick}
      style={style}
    >
      <img
        src={coverUrl}
        alt={photo.title}
        className={`w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-105 ${
          grayscale ? 'grayscale group-hover:grayscale-0' : ''
        }`}
      />

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
        <p className="text-ui-xs font-black text-primary uppercase tracking-[0.2em] mb-0.5">
          {primaryCategory}
        </p>
        <h3 className="text-lg font-serif text-white leading-tight line-clamp-1">
          {photo.title}
        </h3>
      </div>

      {takenTimeLabel ? (
        <div className="absolute top-2 right-2 text-ui-micro font-mono text-white/70 bg-black/40 px-1.5 py-0.5">
          {takenTimeLabel}
        </div>
      ) : (
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
  months: Array<{
    month: number
    days: DayGroup[]
  }>
}

export function TimelineView({ photos, settings, grayscale, onPhotoClick }: TimelineViewProps) {
  const { t } = useLanguage()
  const [showJumpDialog, setShowJumpDialog] = useState(false)
  const [expandedYear, setExpandedYear] = useState<number | null>(null)
  const dayRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const groupedByDay = useMemo(() => {
    const withTakenAt: PhotoDto[] = []
    const withoutTakenAt: PhotoDto[] = []

    for (const photo of photos) {
      if (photo.takenAt) {
        withTakenAt.push(photo)
      } else {
        withoutTakenAt.push(photo)
      }
    }

    withTakenAt.sort((left, right) => new Date(right.takenAt!).getTime() - new Date(left.takenAt!).getTime())
    withoutTakenAt.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

    const takenDateGroups = new Map<string, DayGroup>()
    for (const photo of withTakenAt) {
      const date = new Date(photo.takenAt!)
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

      if (!takenDateGroups.has(dateKey)) {
        takenDateGroups.set(dateKey, {
          date,
          dateKey,
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          day: date.getDate(),
          photos: [],
          hasTakenAt: true,
        })
      }

      takenDateGroups.get(dateKey)!.photos.push(photo)
    }

    const uploadDateGroups = new Map<string, DayGroup>()
    for (const photo of withoutTakenAt) {
      const date = new Date(photo.createdAt)
      const dateKey = `upload-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

      if (!uploadDateGroups.has(dateKey)) {
        uploadDateGroups.set(dateKey, {
          date,
          dateKey,
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          day: date.getDate(),
          photos: [],
          hasTakenAt: false,
        })
      }

      uploadDateGroups.get(dateKey)!.photos.push(photo)
    }

    const sortedTakenDateGroups = Array.from(takenDateGroups.values()).toSorted((left, right) => right.date.getTime() - left.date.getTime())
    const sortedUploadDateGroups = Array.from(uploadDateGroups.values()).toSorted((left, right) => right.date.getTime() - left.date.getTime())
    return [...sortedTakenDateGroups, ...sortedUploadDateGroups]
  }, [photos])

  const yearGroups = useMemo<YearGroup[]>(() => {
    const groups = new Map<number, Map<number, DayGroup[]>>()

    for (const dayGroup of groupedByDay) {
      const year = dayGroup.hasTakenAt ? dayGroup.year : 0
      const month = dayGroup.month

      if (!groups.has(year)) {
        groups.set(year, new Map())
      }

      const monthGroups = groups.get(year)!
      if (!monthGroups.has(month)) {
        monthGroups.set(month, [])
      }

      monthGroups.get(month)!.push(dayGroup)
    }

    return Array.from(groups.entries())
      .toSorted(([leftYear], [rightYear]) => rightYear - leftYear)
      .map(([year, months]) => ({
        year,
        months: Array.from(months.entries())
          .toSorted(([leftMonth], [rightMonth]) => rightMonth - leftMonth)
          .map(([month, days]) => ({ month, days })),
      }))
  }, [groupedByDay])

  const totalPhotos = useMemo(
    () => groupedByDay.reduce((sum, dayGroup) => sum + dayGroup.photos.length, 0),
    [groupedByDay],
  )

  const formatMonth = useCallback((month: number) => t(MONTH_KEYS[month - 1] || ''), [t])
  const formatMonthShort = useCallback((month: number) => SHORT_MONTH_NAMES[month - 1] || '', [])
  const formatDay = useCallback((day: number) => String(day).padStart(2, '0'), [])
  const getWeekday = useCallback((date: Date) => t(WEEKDAY_KEYS[date.getDay()]), [t])

  const setDayRef = useCallback((dateKey: string, element: HTMLDivElement | null) => {
    if (element) {
      dayRefs.current.set(dateKey, element)
    } else {
      dayRefs.current.delete(dateKey)
    }
  }, [])

  const closeJumpDialog = useCallback(() => {
    setShowJumpDialog(false)
    setExpandedYear(null)
  }, [])

  const scrollToDate = useCallback((dateKey: string) => {
    const element = dayRefs.current.get(dateKey)
    if (element) {
      const headerOffset = 80
      const elementPosition = element.getBoundingClientRect().top + window.scrollY
      window.scrollTo({
        top: elementPosition - headerOffset,
        behavior: 'smooth',
      })
    }

    closeJumpDialog()
  }, [closeJumpDialog])

  return (
    <div className="relative">
      <AnimatePresence>
        {showJumpDialog ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={closeJumpDialog}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md max-h-[70vh] bg-background border border-border shadow-2xl overflow-hidden"
            >
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
                  onClick={closeJumpDialog}
                  className="p-2 hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto max-h-[calc(70vh-64px)] custom-scrollbar">
                {yearGroups.map((yearGroup) => (
                  <div key={yearGroup.year} className="border-b border-border last:border-b-0">
                    <button
                      onClick={() => setExpandedYear((current) => current === yearGroup.year ? null : yearGroup.year)}
                      className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-2xl font-serif font-light">
                          {yearGroup.year === 0 ? '?' : yearGroup.year}
                        </span>
                        {yearGroup.year === 0 ? (
                          <span className="text-xs text-muted-foreground uppercase tracking-widest">
                            {t('gallery.timeline_unknown_date')}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-ui-micro text-muted-foreground font-mono">
                          {yearGroup.months.reduce((sum, monthGroup) => sum + monthGroup.days.reduce((daySum, day) => daySum + day.photos.length, 0), 0)} {t('gallery.timeline_photos')}
                        </span>
                        <motion.div
                          animate={{ rotate: expandedYear === yearGroup.year ? 90 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </motion.div>
                      </div>
                    </button>

                    <AnimatePresence>
                      {expandedYear === yearGroup.year ? (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden bg-muted/20"
                        >
                          {yearGroup.months.map((monthGroup) => (
                            <div key={monthGroup.month} className="border-t border-border/50">
                              <div className="px-6 py-2 bg-muted/30">
                                <span className="text-ui-micro font-black uppercase tracking-[0.2em] text-muted-foreground">
                                  {yearGroup.year === 0 ? t('gallery.timeline_uploaded') : formatMonth(monthGroup.month)}
                                </span>
                              </div>

                              <div className="px-6 py-3 flex flex-wrap gap-2">
                                {monthGroup.days.map((dayGroup) => (
                                  <button
                                    key={dayGroup.dateKey}
                                    onClick={() => scrollToDate(dayGroup.dateKey)}
                                    className="group relative flex flex-col items-center justify-center w-12 h-14 border border-border hover:border-primary hover:bg-primary/5 transition-all"
                                  >
                                    <span className="text-lg font-light font-serif group-hover:text-primary transition-colors">
                                      {formatDay(dayGroup.day)}
                                    </span>
                                    <span className="text-ui-nano text-muted-foreground font-mono">
                                      {dayGroup.photos.length}
                                    </span>
                                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <div className="absolute left-4 md:left-8 top-0 bottom-0 w-px bg-border" />

      {groupedByDay.map((dayGroup) => (
        <div
          key={dayGroup.dateKey}
          ref={(element) => setDayRef(dayGroup.dateKey, element)}
          className="relative"
        >
          <div className="sticky top-[108px] md:top-[116px] z-20 -ml-1 md:-ml-0">
            <div className="relative py-3 bg-background/95 backdrop-blur-sm">
              <button
                onClick={() => setShowJumpDialog(true)}
                className="absolute left-[17px] md:left-[33px] top-1/2 -translate-y-1/2 w-3 h-3 bg-primary border-2 border-background z-10 shadow-sm hover:scale-150 hover:bg-primary/80 transition-transform cursor-pointer"
                title={t('gallery.timeline_jump_hint')}
              />

              <div className="ml-10 md:ml-16">
                <button
                  onClick={() => setShowJumpDialog(true)}
                  className="inline-flex items-center gap-2 md:gap-3 border border-border px-3 md:px-4 py-2 bg-background shadow-sm hover:border-primary hover:shadow-md transition-all group max-w-[calc(100vw-64px)] overflow-hidden"
                >
                  <Calendar className="w-4 h-4 text-primary group-hover:scale-110 transition-transform flex-shrink-0" />
                  {dayGroup.hasTakenAt ? (
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="text-ui-xs font-black uppercase tracking-[0.2em] whitespace-nowrap">
                        {formatMonthShort(dayGroup.month)} {formatDay(dayGroup.day)}
                      </span>
                      <span className="text-ui-micro text-muted-foreground font-mono hidden sm:inline">
                        {dayGroup.year}
                      </span>
                      <span className="text-ui-micro text-muted-foreground/60 font-mono hidden sm:inline">
                        {getWeekday(dayGroup.date)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="text-ui-xs font-black uppercase tracking-[0.2em] text-muted-foreground whitespace-nowrap">
                        {t('gallery.timeline_uploaded')}
                      </span>
                      <span className="text-ui-micro text-muted-foreground font-mono truncate">
                        {formatMonthShort(dayGroup.month)} {formatDay(dayGroup.day)}, {dayGroup.year}
                      </span>
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="ml-10 md:ml-16 pb-8 pt-2 pr-2 md:pr-0" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 300px' }}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 md:gap-4">
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

      {groupedByDay.length === 0 ? (
        <div className="ml-10 md:ml-16 py-20 text-center">
          <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-sm text-muted-foreground">{t('gallery.timeline_no_photos')}</p>
        </div>
      ) : null}
    </div>
  )
}
