import {
  executeNarrativeAiTask,
  type NarrativeAiTaskLock,
} from './ai-task-lock'

export type NarrativeAiOperationKind = 'stream-generation' | 'legacy-agent'

export interface NarrativeAiTaskWorkContext {
  signal: AbortSignal
}

export type NarrativeAiTaskWork<T> = (
  context: NarrativeAiTaskWorkContext,
) => Promise<T>

export interface NarrativeAiTaskSession {
  readonly canStart: boolean
  readonly isActive: boolean
  start: <T>(operationKind: NarrativeAiOperationKind, work: NarrativeAiTaskWork<T>) => Promise<T>
  stop: () => boolean
  dispose: () => void
}

export function createNarrativeAiTaskSession(lock: NarrativeAiTaskLock): NarrativeAiTaskSession {
  let activeAbortController: AbortController | null = null
  let disposed = false

  return {
    get canStart() {
      return !disposed && activeAbortController === null && !lock.getSnapshot()
    },
    get isActive() {
      return activeAbortController !== null
    },
    async start<T>(operationKind: NarrativeAiOperationKind, work: NarrativeAiTaskWork<T>) {
      if (disposed) {
        throw new Error('The narrative AI task session has been disposed')
      }
      if (activeAbortController !== null) {
        throw new Error('The narrative editor is already running another AI task')
      }

      const abortController = new AbortController()
      activeAbortController = abortController

      try {
        return await executeNarrativeAiTask(lock, `assistant-${operationKind}`, () => work({
          signal: abortController.signal,
        }))
      } finally {
        if (activeAbortController === abortController) {
          activeAbortController = null
        }
      }
    },
    stop() {
      if (activeAbortController === null) return false
      activeAbortController.abort()
      return true
    },
    dispose() {
      if (disposed) return
      disposed = true
      activeAbortController?.abort()
    },
  }
}
