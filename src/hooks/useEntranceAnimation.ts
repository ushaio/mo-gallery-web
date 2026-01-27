'use client'

import { useRef, useEffect, useState, useMemo, CSSProperties } from 'react'

interface UseEntranceAnimationOptions {
  /** Index of the item in the list */
  index: number
  /** Number of columns in the grid (for stagger calculation) */
  columnCount?: number
  /** Threshold for IntersectionObserver (0-1) */
  threshold?: number
  /** Root margin for IntersectionObserver */
  rootMargin?: string
  /** Whether to disable the animation */
  disabled?: boolean
}

interface UseEntranceAnimationReturn {
  ref: React.RefObject<HTMLDivElement | null>
  isVisible: boolean
  style: CSSProperties
}

/**
 * Hook for elegant entrance animations with IntersectionObserver
 * Features:
 * - Row/column-based stagger delay for natural wave effect
 * - Subtle blur transition for depth
 * - Optimized easing curve
 */
export function useEntranceAnimation({
  index,
  columnCount = 6,
  threshold = 0.1,
  rootMargin = '50px',
  disabled = false,
}: UseEntranceAnimationOptions): UseEntranceAnimationReturn {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(disabled)

  useEffect(() => {
    if (disabled) {
      setIsVisible(true)
      return
    }

    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold, rootMargin }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [disabled, threshold, rootMargin])

  // Calculate stagger delay based on row and column position
  const staggerDelay = useMemo(() => {
    const row = Math.floor(index / columnCount)
    const col = index % columnCount
    // Row contributes more to delay for top-to-bottom wave
    // Column adds subtle left-to-right variation
    const delay = (row * 0.04) + (col * 0.025)
    // Cap at 0.4s to prevent too long delays for items far down
    return Math.min(delay, 0.4)
  }, [index, columnCount])

  const style = useMemo<CSSProperties>(() => ({
    opacity: isVisible ? 1 : 0,
    transform: isVisible
      ? 'translateY(0) scale(1)'
      : 'translateY(20px) scale(0.98)',
    filter: isVisible ? 'blur(0px)' : 'blur(4px)',
    transition: [
      `opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1) ${staggerDelay}s`,
      `transform 0.6s cubic-bezier(0.22, 1, 0.36, 1) ${staggerDelay}s`,
      `filter 0.5s cubic-bezier(0.22, 1, 0.36, 1) ${staggerDelay}s`,
    ].join(', '),
  }), [isVisible, staggerDelay])

  return { ref, isVisible, style }
}
