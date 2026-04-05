'use client'

import { useEffect, useState } from 'react'

type ResponsiveRule = {
  minWidth: number
  columns: number
}

function resolveColumnCount(rules: ResponsiveRule[]) {
  const width = window.innerWidth
  for (const rule of rules) {
    if (width >= rule.minWidth) {
      return rule.columns
    }
  }

  return rules[rules.length - 1]?.columns ?? 1
}

/**
 * SSR-safe responsive column count hook.
 * Returns the SSR fallback on first render to avoid hydration mismatch,
 * then syncs to the real viewport width in useEffect.
 */
export function useResponsiveColumnCount(rules: ResponsiveRule[]) {
  // SSR fallback: use the last rule (smallest breakpoint) for consistent hydration
  const ssrFallback = rules[rules.length - 1]?.columns ?? 1
  const [columnCount, setColumnCount] = useState(ssrFallback)

  useEffect(() => {
    const updateColumnCount = () => {
      setColumnCount((current) => {
        const next = resolveColumnCount(rules)
        return current === next ? current : next
      })
    }

    updateColumnCount()
    window.addEventListener('resize', updateColumnCount)
    return () => window.removeEventListener('resize', updateColumnCount)
  }, [rules])

  return columnCount
}
