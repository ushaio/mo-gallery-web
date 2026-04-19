export default function GalleryLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-16">
      <div className="px-4 md:px-8 lg:px-12">
        <div className="max-w-screen-2xl mx-auto">
          {/* Header skeleton */}
          <header className="mb-6 md:mb-8">
            <div className="flex flex-col gap-6 md:gap-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-3">
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                  <div className="h-12 w-36 animate-pulse rounded bg-muted md:h-14 md:w-48" />
                </div>
                <div className="flex gap-3">
                  <div className="h-8 w-20 animate-pulse rounded bg-muted" />
                  <div className="h-8 w-20 animate-pulse rounded bg-muted" />
                </div>
              </div>
              <div className="flex gap-2 overflow-hidden">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-8 w-16 shrink-0 animate-pulse rounded bg-muted" />
                ))}
              </div>
            </div>
          </header>

          {/* Toolbar skeleton */}
          <div className="mb-8 flex items-center gap-4">
            <div className="h-10 flex-1 animate-pulse rounded bg-muted" />
            <div className="h-10 w-10 animate-pulse rounded bg-muted" />
            <div className="h-10 w-10 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>

      {/* Photo grid skeleton */}
      <div className="px-2 sm:px-4 md:px-8 lg:px-12 pt-4 md:pt-8">
        <div className="max-w-screen-2xl mx-auto">
          <div className="columns-2 gap-4 md:columns-3 lg:columns-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="mb-4 break-inside-avoid animate-pulse rounded bg-muted"
                style={{ height: `${180 + (i % 3) * 80}px` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
