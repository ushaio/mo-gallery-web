import type { EditorAiCompletedTaskMetadata } from '@mo-gallery/ai-agent'

import { t } from '@/lib/i18n'
import type { ZineAiTaskHistoryState } from '@/lib/zine/zine-direct-edit-host'

interface ZineAiChangeSetCardProps {
  task: EditorAiCompletedTaskMetadata
  history: ZineAiTaskHistoryState | null
  language: Parameters<typeof t>[1]
  onUndo: () => void
  onRedo: () => void
}

function formatValue(value: unknown) {
  if (typeof value === 'string') return value
  if (value === undefined) return ''
  const serialized = JSON.stringify(value)
  if (!serialized) return String(value)
  return serialized.length > 500 ? `${serialized.slice(0, 500)}...` : serialized
}

export function ZineAiChangeSetCard({
  task,
  history,
  language,
  onUndo,
  onRedo,
}: ZineAiChangeSetCardProps) {
  const { changeSet } = task
  const state = history?.state ?? changeSet.state

  return (
    <section className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-2.5" data-ai-task-id={task.taskId}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-foreground">{t('admin.zine_ai_changes', language)}</div>
        <span className="rounded-full bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
          {t(`admin.zine_ai_${state}`, language)}
        </span>
      </div>

      <div className="mt-2 space-y-2">
        {changeSet.entries.map((entry, index) => (
          <div key={`${entry.operation}-${entry.targetId}-${index}`} className="rounded-lg border bg-background/80 p-2" style={{ borderColor: 'var(--border)' }}>
            <div className="text-[11px] font-medium text-foreground">{entry.targetLabel}</div>
            <div className="mt-1 space-y-1 break-words text-[10px] leading-4 text-muted-foreground">
              <div className="line-through opacity-70">{formatValue(entry.before)}</div>
              <div className="text-foreground">{formatValue(entry.after)}</div>
            </div>
          </div>
        ))}
      </div>

      {changeSet.warnings.length > 0 ? (
        <div className="mt-2 space-y-1 text-[10px] leading-4 text-amber-700 dark:text-amber-300">
          {changeSet.warnings.map((warning, index) => (
            <div key={`${warning.code}-${index}`}>{warning.message}</div>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex gap-2 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          disabled={!history?.canUndo}
          onClick={onUndo}
          className="flex h-7 flex-1 items-center justify-center rounded-md border text-[10px] font-medium transition hover:bg-accent disabled:pointer-events-none disabled:opacity-35"
          style={{ borderColor: 'var(--border)' }}
        >
          {t('admin.zine_ai_undo', language)}
        </button>
        <button
          type="button"
          disabled={!history?.canRedo}
          onClick={onRedo}
          className="flex h-7 flex-1 items-center justify-center rounded-md border text-[10px] font-medium transition hover:bg-accent disabled:pointer-events-none disabled:opacity-35"
          style={{ borderColor: 'var(--border)' }}
        >
          {t('admin.zine_ai_redo', language)}
        </button>
      </div>
    </section>
  )
}
