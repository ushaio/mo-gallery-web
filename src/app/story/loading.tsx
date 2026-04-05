export default function StoryListLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-16">
      <div className="px-4 md:px-8 lg:px-12">
        <div className="max-w-screen-2xl mx-auto">
          {/* Header */}
          <header className="relative mb-12 md:mb-16">
            <div className="flex flex-col gap-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-px w-6 bg-primary/60" />
                    <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="h-12 w-40 animate-pulse rounded bg-muted md:h-14 md:w-56" />
                </div>
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              </div>
              <div className="border-t border-border/30" />
            </div>
          </header>

          {/* Grid skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10 pl-4 md:pl-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-5">
                <div
                  className={`animate-pulse rounded bg-muted ${
                    i % 3 === 0 ? 'aspect-[21/9] md:col-span-2' : 'aspect-[3/2]'
                  }`}
                />
                <div className="space-y-2 px-1">
                  <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
