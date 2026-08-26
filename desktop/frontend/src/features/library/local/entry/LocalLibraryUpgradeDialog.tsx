import { CheckCircle2, Database, Loader2, X } from 'lucide-react'
import type { LibraryUpgradeInfo } from '../types'
import type { LocalLibraryCopy } from '../copy'

interface Props {
  copy: LocalLibraryCopy
  info: LibraryUpgradeInfo
  phase: 'confirm' | 'running' | 'completed' | 'failed'
  error?: string
  onStart: () => void
  onCancel: () => void
  onConfirm: () => void
}

function replaceVersion(copy: string, info: LibraryUpgradeInfo) {
  return copy.replace('{current}', String(info.currentVersion)).replace('{target}', String(info.targetVersion))
}

export function LocalLibraryUpgradeDialog({ copy, info, phase, error, onStart, onCancel, onConfirm }: Props) {
  const busy = phase === 'running'
  const completed = phase === 'completed'

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-5">
      <button type="button" aria-label={copy.upgradeCancel} disabled={busy || completed} className="absolute inset-0 bg-black/55 backdrop-blur-sm disabled:cursor-not-allowed" onClick={onCancel} />
      <div role="dialog" aria-modal="true" aria-labelledby="local-library-upgrade-title" className="relative w-full max-w-md rounded-xl border bg-background shadow-2xl" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-start gap-3 border-b p-5" style={{ borderColor: 'var(--border)' }}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
            {completed ? <CheckCircle2 size={18} className="text-emerald-500" /> : <Database size={17} />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="local-library-upgrade-title" className="font-sans text-sm font-semibold">{completed ? copy.upgradeDoneTitle : copy.upgradeTitle}</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{completed ? copy.upgradeDoneBody : copy.upgradeBody}</p>
          </div>
          <button type="button" aria-label={copy.upgradeCancel} disabled={busy || completed} onClick={onCancel} className="rounded-md p-1.5 hover:bg-secondary disabled:opacity-40"><X size={15} /></button>
        </div>

        <div className="space-y-3 p-5">
          <div className="rounded-lg border bg-card px-3 py-2 text-xs" style={{ borderColor: 'var(--border)' }}>
            <div className="font-medium">{replaceVersion(copy.upgradeVersion, info)}</div>
            <div className="mt-1 truncate text-[10px] text-muted-foreground">{info.rootPath}</div>
          </div>
          {phase === 'running' && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />{copy.upgradeRunning}</div>}
          {phase === 'failed' && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error || copy.upgradeFailed}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t p-4" style={{ borderColor: 'var(--border)' }}>
          {!completed && <button type="button" disabled={busy} onClick={onCancel} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">{copy.upgradeCancel}</button>}
          {phase === 'confirm' || phase === 'failed' ? (
            <button type="button" onClick={onStart} className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
              {phase === 'failed' ? copy.upgradeStart : copy.upgradeStart}
            </button>
          ) : completed ? (
            <button type="button" onClick={onConfirm} className="rounded-md px-3 py-2 text-xs font-medium" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>{copy.upgradeConfirm}</button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
