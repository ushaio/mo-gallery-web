'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Unhandled error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl font-serif font-light">Something went wrong</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          An unexpected error occurred. Please try again.
        </p>
      </div>
      <button
        onClick={reset}
        className="border border-border px-6 py-2.5 text-xs font-bold uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
      >
        Try Again
      </button>
    </div>
  )
}
