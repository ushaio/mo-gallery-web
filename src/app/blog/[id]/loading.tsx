export default function BlogDetailLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-16 px-4 md:px-8 lg:px-12">
      <div className="max-w-4xl mx-auto">
        {/* Back link */}
        <div className="mb-8">
          <div className="h-4 w-28 animate-pulse rounded bg-muted" />
        </div>

        {/* Header */}
        <header className="mb-12 pb-8 border-b border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-5 w-5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-12 w-3/4 animate-pulse rounded bg-muted mb-4 md:h-16" />
          <div className="h-10 w-1/2 animate-pulse rounded bg-muted mb-6" />
          <div className="h-3 w-36 animate-pulse rounded bg-muted" />
        </header>

        {/* Content skeleton */}
        <div className="space-y-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-4 animate-pulse rounded bg-muted"
              style={{ width: `${70 + Math.sin(i) * 20}%` }}
            />
          ))}
          <div className="h-48 w-full animate-pulse rounded bg-muted my-6" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={`b-${i}`}
              className="h-4 animate-pulse rounded bg-muted"
              style={{ width: `${60 + Math.cos(i) * 25}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
