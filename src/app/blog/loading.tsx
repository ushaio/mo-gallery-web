export default function BlogListLoading() {
  return (
    <div className="min-h-screen bg-background pt-24 pb-16 text-foreground">
      <div className="px-4 md:px-8 lg:px-12">
        <div className="mx-auto max-w-screen-2xl">
          <header className="mb-6 md:mb-8">
            <div className="flex flex-col gap-6 md:gap-8">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end md:gap-8">
                <div className="space-y-3 md:space-y-4">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-12 w-48 animate-pulse rounded bg-muted md:h-14 md:w-64" />
                </div>
                <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              </div>
              <div className="flex gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-8 w-20 animate-pulse rounded bg-muted" />
                ))}
              </div>
            </div>
          </header>

          {/* Timeline skeleton */}
          <div className="space-y-16">
            {Array.from({ length: 2 }).map((_, yearIdx) => (
              <div key={yearIdx}>
                <div className="mb-8 flex items-center gap-4">
                  <div className="h-8 w-20 animate-pulse rounded bg-muted" />
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="space-y-4 border-l-2 border-border pl-6 md:pl-8">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-2 p-4 md:p-6">
                      <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
