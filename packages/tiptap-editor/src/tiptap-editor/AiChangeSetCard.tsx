'use client'

import React from 'react'
import type { EditorAiCompletedTaskMetadata } from '@mo-gallery/ai-agent'

import type { NarrativeAiTaskHistoryState } from './narrative-direct-edit-host'

interface AiChangeSetCardProps {
  task: EditorAiCompletedTaskMetadata
  historyState: NarrativeAiTaskHistoryState | null
  disabled?: boolean
  onUndo: () => void
  onRedo: () => void
  t: (key: string) => string
}

function formatChangeValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return ''
  return JSON.stringify(value)
}

export function AiChangeSetCard({
  task,
  historyState,
  disabled = false,
  onUndo,
  onRedo,
  t,
}: AiChangeSetCardProps) {
  const { changeSet } = task
  const state = historyState?.state ?? changeSet.state

  return (
    <section className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 p-3" data-ai-task-id={task.taskId}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-foreground">{changeSet.targetLabel}</div>
        <div className="rounded-full bg-background px-2 py-1 text-[11px] text-muted-foreground">
          {state}
        </div>
      </div>

      {task.summary.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {task.summary.map((summary, index) => <li key={`${index}-${summary}`}>{summary}</li>)}
        </ul>
      ) : null}

      <div className="mt-3 space-y-2">
        {changeSet.entries.map((entry, index) => (
          <div key={`${entry.operation}-${entry.targetId}-${index}`} className="rounded-xl border border-border/70 bg-background/80 p-2 text-xs">
            <div className="font-medium text-foreground">{entry.targetLabel}</div>
            <div className="mt-1 grid gap-1 text-muted-foreground">
              <div className="whitespace-pre-wrap line-through opacity-70">{formatChangeValue(entry.before)}</div>
              <div className="whitespace-pre-wrap text-foreground">{formatChangeValue(entry.after)}</div>
            </div>
          </div>
        ))}
      </div>

      {changeSet.warnings.length > 0 ? (
        <div className="mt-3 space-y-1 text-xs text-amber-700 dark:text-amber-300">
          {changeSet.warnings.map((warning, index) => (
            <div key={`${warning.code}-${index}`}>{warning.message}</div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={disabled || !historyState?.canUndo}
          onClick={onUndo}
          className="rounded-full border border-border px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('editor.undo')}
        </button>
        <button
          type="button"
          disabled={disabled || !historyState?.canRedo}
          onClick={onRedo}
          className="rounded-full border border-border px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('editor.redo')}
        </button>
      </div>
    </section>
  )
}
