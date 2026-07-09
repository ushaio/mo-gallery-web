/**
 * AI 应用前的 diff 预览对话框。
 *
 * 两个使用场景：
 * 1. 聊天结果"替换选区"前的确认（原文 = 当前选区文本）；
 * 2. Agent 修改提案的逐条审阅（带进度与跳过按钮）。
 * 行内高亮删除/新增；文本过长时退化为上下对照。
 */

import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { diffText } from './text-diff'

export interface AiDiffPreviewDialogProps {
  open: boolean
  title: string
  originalText: string
  newText: string
  /** Agent 提案的修改理由 */
  reason?: string
  /** 队列审阅时的进度（1 起始） */
  progress?: { index: number; total: number }
  /** 显示在按钮区上方的错误提示（如原文定位失败） */
  error?: string
  onConfirm: () => void
  /** 提供时显示"跳过"按钮（队列审阅） */
  onSkip?: () => void
  onCancel: () => void
  t: (key: string) => string
}

export function AiDiffPreviewDialog({
  open,
  title,
  originalText,
  newText,
  reason,
  progress,
  error,
  onConfirm,
  onSkip,
  onCancel,
  t,
}: AiDiffPreviewDialogProps) {
  const segments = useMemo(
    () => (open ? diffText(originalText, newText) : null),
    [open, originalText, newText],
  )

  if (!open || typeof document === 'undefined') return null

  const isDeletion = !newText.trim()

  return createPortal(
    <>
      <div className="fixed inset-0 z-[130] bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed inset-0 z-[131] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold uppercase tracking-widest">{title}</h3>
              {progress && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
                  {progress.index} / {progress.total}
                </span>
              )}
            </div>
            <button onClick={onCancel} className="text-muted-foreground transition-colors hover:text-foreground">
              ✕
            </button>
          </div>

          <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {reason && (
              <p className="text-xs text-muted-foreground">
                <span className="font-bold uppercase tracking-widest">{t('editor.ai_diff_reason')}</span>
                <span className="ml-2">{reason}</span>
              </p>
            )}

            {isDeletion && (
              <p className="text-xs text-destructive">{t('editor.ai_diff_delete_notice')}</p>
            )}

            {segments ? (
              <div className="whitespace-pre-wrap rounded-md border border-border/60 bg-muted/20 p-4 text-sm leading-7">
                {segments.map((segment, index) => (
                  segment.type === 'same' ? (
                    <span key={index}>{segment.text}</span>
                  ) : segment.type === 'del' ? (
                    <del key={index} className="rounded-sm bg-red-500/15 px-0.5 text-red-600 dark:text-red-400">
                      {segment.text}
                    </del>
                  ) : (
                    <ins key={index} className="rounded-sm bg-emerald-500/15 px-0.5 no-underline text-emerald-700 dark:text-emerald-400">
                      {segment.text}
                    </ins>
                  )
                ))}
              </div>
            ) : (
              // 文本过长，退化为上下对照
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {t('editor.ai_diff_original')}
                  </p>
                  <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/60 bg-red-500/5 p-3 text-sm leading-6">
                    {originalText}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {t('editor.ai_diff_new')}
                  </p>
                  <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/60 bg-emerald-500/5 p-3 text-sm leading-6">
                    {newText}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border px-5 py-3.5">
            {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={onCancel}
                className="rounded-md border border-border px-4 py-1.5 text-xs font-medium transition-colors hover:bg-muted">
                {t('editor.ai_diff_cancel')}
              </button>
              {onSkip && (
                <button
                  onClick={onSkip}
                  className="rounded-md border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted">
                  {t('editor.ai_diff_skip')}
                </button>
              )}
              <button
                onClick={onConfirm}
                className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90">
                {t('editor.ai_diff_apply')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
