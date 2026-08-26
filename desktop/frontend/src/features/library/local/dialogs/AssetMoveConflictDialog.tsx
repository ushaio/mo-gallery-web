import { useState } from 'react'
import { AlertTriangle, FileWarning, Loader2, X } from 'lucide-react'
import type { AssetFileOperationPlan } from '../types'
import type { LocalLibraryCopy } from '../copy'

interface Props {
  plan: AssetFileOperationPlan
  copy: LocalLibraryCopy
  busy: boolean
  onClose: () => void
  onConfirm: (policy: 'skip' | 'rename') => void
}

/**
 * 移动照片时遇到同名冲突，在执行前让用户选择处理方式：
 * 跳过同名文件 / 自动重命名冲突文件，取消则撤销整个移动操作。
 */
export function AssetMoveConflictDialog({ plan, copy, busy, onClose, onConfirm }: Props) {
  const [policy, setPolicy] = useState<'skip' | 'rename'>('skip')
  const conflicts = plan.items.filter((item) => item.conflict)

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-5">
      <button type="button" aria-label={copy.cancelAction} onClick={onClose} disabled={busy} className="absolute inset-0 bg-black/60" />
      <div role="dialog" aria-modal="true" aria-labelledby="asset-move-conflict-title" className="relative w-full max-w-md rounded-xl border bg-background p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300"><AlertTriangle size={17} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="asset-move-conflict-title" className="font-sans text-sm font-semibold">{copy.moveAssetsTitle}</h2>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{copy.assetMoveConflictBody.replace('{count}', String(plan.conflictCount))}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md p-1.5 hover:bg-secondary"><X size={15} /></button>
        </div>

        {conflicts.length > 0 && (
          <div className="custom-scrollbar mt-4 max-h-40 space-y-0.5 overflow-y-auto rounded-md border p-2" style={{ borderColor: 'var(--border)' }}>
            {conflicts.map((item) => {
              const name = item.source.split('/').pop() || item.source
              const dir = item.source.includes('/') ? item.source.slice(0, item.source.lastIndexOf('/')) : ''
              return (
                <div key={item.assetId} className="flex items-center gap-2 px-1 py-1 text-[11px]">
                  <FileWarning size={12} className="shrink-0" style={{ color: 'var(--muted-foreground)' }} />
                  <span className="min-w-0 max-w-[45%] truncate font-medium" style={{ color: 'var(--foreground)' }}>{name}</span>
                  {dir && <span className="truncate text-[10px] text-muted-foreground">{dir}</span>}
                </div>
              )
            })}
          </div>
        )}

        <fieldset className="mt-4 space-y-2" disabled={busy}>
          <legend className="text-[11px] font-medium">{copy.conflictHandling}</legend>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground"><input type="radio" checked={policy === 'skip'} onChange={() => setPolicy('skip')} />{copy.skipConflictingFiles}</label>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground"><input type="radio" checked={policy === 'rename'} onChange={() => setPolicy('rename')} />{copy.autoRenameConflicts}</label>
        </fieldset>

        <p className="mt-3 text-[10px] leading-4 text-muted-foreground">{copy.assetMoveHint}</p>

        <div className="mt-4 flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">{copy.cancelAction}</button>
          <button type="button" onClick={() => onConfirm(policy)} disabled={busy} className="flex min-w-20 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : null}{copy.confirmPlan}
          </button>
        </div>
      </div>
    </div>
  )
}
