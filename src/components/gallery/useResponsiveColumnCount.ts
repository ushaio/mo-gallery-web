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
 * On the client the initial render already uses the real viewport width so the
 * grid never paints with the fallback column count and reflows a frame later;
 * during SSR it falls back to the last rule (smallest breakpoint).
 */
export function useResponsiveColumnCount(rules: ResponsiveRule[]) {
  const [columnCount, setColumnCount] = useState(() => {
    if (typeof window === 'undefined') {
      return rules[rules.length - 1]?.columns ?? 1
    }
    return resolveColumnCount(rules)
  })

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
