import type { StructuredEditorSnapshot } from '../domain/document'

export type ContextTokenEstimator = (snapshot: StructuredEditorSnapshot) => number

export interface ContextBudgetInstrumentation {
  estimateTokens: ContextTokenEstimator
  onCandidateSnapshot?: () => void
}

let activeInstrumentation: ContextBudgetInstrumentation | undefined

export function estimateContextBudgetTokens(
  snapshot: StructuredEditorSnapshot,
  productionEstimator: ContextTokenEstimator,
): number {
  return (activeInstrumentation?.estimateTokens ?? productionEstimator)(snapshot)
}

export function notifyContextBudgetCandidate(): void {
  activeInstrumentation?.onCandidateSnapshot?.()
}

export function withContextBudgetInstrumentation<Result>(
  instrumentation: ContextBudgetInstrumentation,
  run: () => Result,
): Result {
  const previous = activeInstrumentation
  activeInstrumentation = instrumentation
  try {
    return run()
  } finally {
    activeInstrumentation = previous
  }
}
