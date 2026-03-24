'use client'

import { useEffect, useState } from 'react'

type ResponsiveRule = {
  minWidth: number
  columns: number
}

function resolveColumnCount(rules: ResponsiveRule[]) {
  if (typeof window === 'undefined') {
    return rules[rules.length - 1]?.columns ?? 1
  }

  const width = window.innerWidth
  for (const rule of rules) {
    if (width >= rule.minWidth) {
      return rule.columns
    }
  }

  return rules[rules.length - 1]?.columns ?? 1
}

export function useResponsiveColumnCount(rules: ResponsiveRule[]) {
  const [columnCount, setColumnCount] = useState(() => resolveColumnCount(rules))

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
