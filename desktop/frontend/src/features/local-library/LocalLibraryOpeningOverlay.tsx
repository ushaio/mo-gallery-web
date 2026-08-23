import { FolderOpen, Loader2 } from 'lucide-react'
import type { LibrarySnapshot } from './types'
import type { LocalLibraryCopy } from './copy'

interface LocalLibraryOpeningOverlayProps {
  copy: LocalLibraryCopy
  snapshot: LibrarySnapshot
  scanningLabel?: string
}

export function LocalLibraryOpeningOverlay({ copy, snapshot, scanningLabel }: LocalLibraryOpeningOverlayProps) {
  const scan = snapshot.scan
  const current = Math.max(0, Number(scan.current) || 0)
  const total = scan.total != null && Number(scan.total) > 0 ? Number(scan.total) : null
  const percent = total != null ? Math.min(100, Math.round((current / total) * 100)) : null
  const detail = scan.lastPath
    ? copy.openingCurrent.replace('{path}', scan.lastPath)
    : scanningLabel ?? copy.openingScanning

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-6" style={{ backgroundColor: 'var(--background)' }}>
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="relative">
          <Loader2 size={30} className="animate-spin" style={{ color: 'var(--primary)' }} />
        </div>
        <div className="text-center">
          <div className="text-sm font-medium tracking-[-0.01em]">{copy.preparing}</div>
          <div className="mx-auto mt-2 flex max-w-xs items-center justify-center gap-1.5 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
            <FolderOpen size={12} className="shrink-0" />
            <span className="truncate" title={snapshot.rootPath}>{snapshot.rootPath}</span>
          </div>
        </div>
        <div className="w-full">
          <div className="mb-2 flex items-baseline justify-between gap-3 text-[11px]">
            <span className="truncate" style={{ color: 'var(--muted-foreground)' }}>
              {total != null
                ? copy.openingProgress.replace('{current}', current.toLocaleString()).replace('{total}', total.toLocaleString())
                : scanningLabel ?? copy.openingScanning}
            </span>
            {percent != null && <span className="shrink-0 font-medium tabular-nums">{percent}%</span>}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 14%, var(--border))' }}>
            <div
              className="h-full rounded-full transition-[width] duration-150"
              style={{ width: percent != null ? `${percent}%` : '40%', backgroundColor: 'var(--primary)' }}
            />
          </div>
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          <Loader2 size={11} className="shrink-0 animate-spin" />
          <span className="min-w-0 flex-1 truncate" title={scan.lastPath}>{detail}</span>
        </div>
      </div>
    </div>
  )
}
