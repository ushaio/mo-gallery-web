import { useCallback, useEffect, useMemo } from 'react'
import { Cloud, HardDrive, LibraryBig } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { CloudLibraryPage } from '@/pages/CloudLibraryPage'
import { LocalLibraryPage } from '@/pages/LocalLibraryPage'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'

const SOURCE_STORAGE_KEY = 'mo-gallery:resource-library-source'
type LibrarySource = 'cloud' | 'local'

function isLibrarySource(value: string | null): value is LibrarySource {
  return value === 'cloud' || value === 'local'
}

export function ResourceLibraryPage() {
  const language = usePreferences((state) => state.language)
  const [searchParams, setSearchParams] = useSearchParams()

  const source = useMemo<LibrarySource>(() => {
    const querySource = searchParams.get('source')
    if (isLibrarySource(querySource)) return querySource

    const storedSource = window.localStorage.getItem(SOURCE_STORAGE_KEY)
    return isLibrarySource(storedSource) ? storedSource : 'cloud'
  }, [searchParams])

  useEffect(() => {
    window.localStorage.setItem(SOURCE_STORAGE_KEY, source)
    if (!isLibrarySource(searchParams.get('source'))) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        next.set('source', source)
        return next
      }, { replace: true })
    }
  }, [searchParams, setSearchParams, source])

  const switchSource = useCallback((nextSource: LibrarySource) => {
    if (nextSource === source) return
    window.localStorage.setItem(SOURCE_STORAGE_KEY, nextSource)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('source', nextSource)
      return next
    }, { replace: true })
  }, [setSearchParams, source])

  const sources = [
    { value: 'cloud' as const, label: t('admin.resource_library_cloud', language), icon: Cloud },
    { value: 'local' as const, label: t('admin.resource_library_local', language), icon: HardDrive },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-11 shrink-0 items-center gap-4 border-b bg-card px-4" style={{ borderColor: 'var(--border)' }}>
        <div className="flex min-w-0 items-center gap-2">
          <LibraryBig size={15} style={{ color: 'var(--muted-foreground)' }} />
          <span className="truncate text-xs font-semibold">{t('admin.resource_library', language)}</span>
        </div>
        <div className="flex h-8 items-center rounded-md border bg-background p-0.5" role="tablist" aria-label={t('admin.resource_library', language)} style={{ borderColor: 'var(--border)' }}>
          {sources.map(({ value, label, icon: Icon }) => {
            const active = source === value
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchSource(value)}
                className="flex h-7 items-center gap-1.5 rounded px-3 text-[11px] font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                style={{
                  backgroundColor: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                }}
              >
                <Icon size={12} />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className={source === 'cloud' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'}>
          <CloudLibraryPage />
        </div>
        <div className={source === 'local' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'}>
          <LocalLibraryPage />
        </div>
      </div>
    </div>
  )
}
