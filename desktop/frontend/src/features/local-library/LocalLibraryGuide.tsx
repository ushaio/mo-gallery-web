import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { LocalLibraryCopy } from './copy'

export const LOCAL_LIBRARY_GUIDE_SEEN_KEY = 'mo-gallery:local-library:guide-seen'

const TARGET_IDS = [
  'library', 'import', 'nav', 'folders', 'toolbar', 'grid', 'details', 'statusbar', 'guide',
] as const

const HIGHLIGHT_PADDING = 8

interface HighlightRect {
  top: number
  left: number
  width: number
  height: number
}

interface Props {
  copy: LocalLibraryCopy
  onClose: () => void
}

export function LocalLibraryGuide({ copy, onClose }: Props) {
  const steps = copy.guide.steps
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<HighlightRect | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const total = steps.length

  const measure = useCallback(() => {
    const element = document.querySelector<HTMLElement>(`[data-local-library-guide="${TARGET_IDS[index]}"]`)
    if (!element) {
      setRect(null)
      return
    }
    const bounds = element.getBoundingClientRect()
    setRect({
      top: bounds.top - HIGHLIGHT_PADDING,
      left: bounds.left - HIGHLIGHT_PADDING,
      width: bounds.width + HIGHLIGHT_PADDING * 2,
      height: bounds.height + HIGHLIGHT_PADDING * 2,
    })
  }, [index])

  useLayoutEffect(() => {
    const element = document.querySelector<HTMLElement>(`[data-local-library-guide="${TARGET_IDS[index]}"]`)
    element?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
    const raf = requestAnimationFrame(measure)
    // Re-measure after the smooth scroll settles so the highlight follows the final position.
    const settle = window.setTimeout(measure, 450)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(settle)
    }
  }, [index, measure])

  useEffect(() => {
    const refresh = () => requestAnimationFrame(measure)
    window.addEventListener('resize', refresh)
    window.addEventListener('scroll', refresh, true)
    return () => {
      window.removeEventListener('resize', refresh)
      window.removeEventListener('scroll', refresh, true)
    }
  }, [measure])

  const goNext = useCallback(() => setIndex((current) => Math.min(current + 1, total - 1)), [total])
  const goPrev = useCallback(() => setIndex((current) => Math.max(current - 1, 0)), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowRight') goNext()
      else if (event.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [goNext, goPrev, onClose])

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const cardBounds = card.getBoundingClientRect()
    const viewportPadding = 16
    const gap = 14
    let top: number
    let left = rect ? rect.left + rect.width / 2 - cardBounds.width / 2 : (window.innerWidth - cardBounds.width) / 2
    if (rect) {
      top = rect.top + rect.height + gap
      if (top + cardBounds.height > window.innerHeight - viewportPadding) {
        top = rect.top - cardBounds.height - gap
      }
    } else {
      top = (window.innerHeight - cardBounds.height) / 2
    }
    top = Math.max(viewportPadding, Math.min(top, window.innerHeight - cardBounds.height - viewportPadding))
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - cardBounds.width - viewportPadding))
    card.style.top = `${Math.round(top)}px`
    card.style.left = `${Math.round(left)}px`
  }, [index, rect])

  const step = steps[index]
  const isFirst = index === 0
  const isLast = index === total - 1

  return (
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} role="presentation" />
      {rect && (
        <div
          className="pointer-events-none fixed z-[9999] transition-all duration-300 ease-out"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
          }}
        >
          <div
            className="absolute inset-0 animate-pulse rounded-[10px]"
            style={{ boxShadow: '0 0 0 2px var(--background), 0 0 0 3.5px var(--primary)' }}
          />
        </div>
      )}
      <div
        ref={cardRef}
        className="fixed z-[10000] w-[340px] max-w-[calc(100vw-32px)] rounded-xl border bg-card p-4 shadow-2xl"
        style={{ borderColor: 'var(--border)', top: -9999, left: -9999 }}
        role="dialog"
        aria-modal="true"
        aria-label={copy.guide.label}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--muted-foreground)' }}>
            {index + 1} / {total}
          </span>
          <button type="button" onClick={onClose} className="rounded-md border px-2.5 py-1 text-[11px] hover:bg-secondary">
            {copy.guide.skip}
          </button>
        </div>
        <h3 className="mt-1.5 font-sans text-sm font-semibold">{step.title}</h3>
        <p className="mt-1.5 text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {steps.map((_, dotIndex) => (
              <span
                key={dotIndex}
                className="h-1.5 rounded-full transition-all duration-200"
                style={{ width: dotIndex === index ? 14 : 6, backgroundColor: dotIndex === index ? 'var(--primary)' : 'var(--border)' }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button type="button" onClick={goPrev} className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-secondary">
                <ChevronLeft size={13} />{copy.guide.prev}
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-xs font-medium"
                style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                {copy.guide.finish}
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium"
                style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                {copy.guide.next}<ChevronRight size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
