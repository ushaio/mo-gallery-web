import { useState } from 'react'
import { DatabaseBackup, Loader2, RotateCcw, X } from 'lucide-react'
import { formatBytes } from '@/lib/utils'
import type { BackupInfo, BackupOverview } from './types'
import type { LocalLibraryCopy } from './copy'

interface Props {
  copy: LocalLibraryCopy
  overview?: BackupOverview
  loading: boolean
  operation: 'create' | 'restore' | null
  onClose: () => void
  onCreate: () => Promise<void>
  onRestore: (id: string) => Promise<boolean>
}

function backupKindLabel(kind: string, copy: LocalLibraryCopy) {
  if (kind === 'daily') return copy.backupKindDaily
  if (kind === 'upgrade') return copy.backupKindUpgrade
  if (kind === 'pre-restore') return copy.backupKindPreRestore
  return copy.backupKindManual
}

export function LocalLibraryBackupDialog({ copy, overview, loading, operation, onClose, onCreate, onRestore }: Props) {
  const [restoreTarget, setRestoreTarget] = useState<BackupInfo>()
  const busy = operation !== null

  const restore = async () => {
    if (!restoreTarget) return
    if (await onRestore(restoreTarget.id)) {
      setRestoreTarget(undefined)
    }
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-5">
      <button type="button" aria-label={copy.cancelAction} disabled={busy} className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="local-library-backup-title" className="relative flex max-h-[80vh] w-full max-w-xl flex-col rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center gap-3 border-b p-5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary"><DatabaseBackup size={17} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="local-library-backup-title" className="font-sans text-sm font-semibold">{copy.databaseBackups}</h2>
            <p className="truncate text-[10px] text-muted-foreground">{overview?.libraryRoot}</p>
          </div>
          <button type="button" aria-label={copy.cancelAction} disabled={busy} onClick={onClose} className="rounded-md p-1.5 hover:bg-secondary disabled:opacity-50"><X size={15} /></button>
        </div>

        <div className="border-b px-5 py-3 text-[11px] text-muted-foreground">{copy.backupScopeHint}</div>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex h-36 items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />{copy.loading}</div>
          ) : overview?.backups.length ? (
            <div className="space-y-2">
              {overview.backups.map((backup) => (
                <div key={backup.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium">{backupKindLabel(backup.kind, copy)}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">{new Date(backup.createdAt).toLocaleString()} · {formatBytes(backup.sizeBytes)}</div>
                  </div>
                  <button type="button" disabled={busy} onClick={() => setRestoreTarget(backup)} className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] hover:bg-secondary disabled:opacity-50"><RotateCcw size={11} />{copy.restoreBackup}</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-36 items-center justify-center text-xs text-muted-foreground">{copy.noBackups}</div>
          )}
        </div>

        <div className="flex items-center justify-end border-t p-4">
          <button type="button" disabled={busy || loading} onClick={() => void onCreate()} className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium disabled:opacity-60" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            {operation === 'create' ? <Loader2 size={13} className="animate-spin" /> : <DatabaseBackup size={13} />}{operation === 'create' ? copy.backingUp : copy.backupNow}
          </button>
        </div>
      </div>

      {restoreTarget && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-5">
          <div className="absolute inset-0 bg-black/35" />
          <div role="alertdialog" aria-modal="true" aria-labelledby="local-library-restore-title" className="relative w-full max-w-md rounded-xl border bg-background p-5 shadow-2xl">
            <h3 id="local-library-restore-title" className="font-sans text-sm font-semibold">{copy.restoreBackupTitle}</h3>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{copy.restoreBackupBody}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">{copy.backupRestoreWarning}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setRestoreTarget(undefined)} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">{copy.cancelAction}</button>
              <button type="button" disabled={busy} onClick={() => void restore()} className="flex items-center gap-2 rounded-md bg-destructive px-3 py-2 text-xs text-destructive-foreground disabled:opacity-60">
                {operation === 'restore' && <Loader2 size={13} className="animate-spin" />}{operation === 'restore' ? copy.restoringBackup : copy.restoreBackup}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
