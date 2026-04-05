'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function BlogError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Blog error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 pt-24 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl font-serif font-light">Failed to load blog</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Unable to load the blog content. Please try again.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="border border-border px-6 py-2.5 text-xs font-bold uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
        >
          Retry
        </button>
        <Link
          href="/"
          className="border border-border px-6 py-2.5 text-xs font-bold uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
        >
          Home
        </Link>
      </div>
    </div>
  )
}
