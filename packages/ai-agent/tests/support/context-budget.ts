import { applyEditorAiContextBudget } from '../../src/domain/capabilities'
import { withContextBudgetInstrumentation } from '../../src/internal/context-budget'

import type {
  EditorAiContextBudget,
  EditorAiContextBudgetResult,
} from '../../src/domain/capabilities'
import type { StructuredEditorSnapshot } from '../../src/domain/document'
import type {
  ContextBudgetInstrumentation,
  ContextTokenEstimator,
} from '../../src/internal/context-budget'

export type { ContextBudgetInstrumentation, ContextTokenEstimator }

export function applyEditorAiContextBudgetWithEstimatorForTest<
  Snapshot extends StructuredEditorSnapshot,
>(
  input: Snapshot,
  budget: EditorAiContextBudget,
  estimateTokens: ContextTokenEstimator,
  hooks: Omit<ContextBudgetInstrumentation, 'estimateTokens'> = {},
): EditorAiContextBudgetResult<Snapshot> {
  return withContextBudgetInstrumentation(
    { ...hooks, estimateTokens },
    () => applyEditorAiContextBudget(input, budget),
  )
}
