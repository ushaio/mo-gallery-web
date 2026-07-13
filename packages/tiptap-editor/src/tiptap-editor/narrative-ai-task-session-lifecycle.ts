import type { NarrativeAiTaskLock } from './ai-task-lock'
import {
  createNarrativeAiTaskSession,
  type NarrativeAiTaskSession,
} from './narrative-ai-task-session'

export interface NarrativeAiTaskSessionSetup {
  session: NarrativeAiTaskSession
  isCurrent: () => boolean
  cleanup: () => void
}

export interface NarrativeAiTaskSessionLifecycle {
  readonly current: NarrativeAiTaskSession | null
  setup: (lock: NarrativeAiTaskLock) => NarrativeAiTaskSessionSetup
  requireCurrent: () => NarrativeAiTaskSession
}

export function createNarrativeAiTaskSessionLifecycle(): NarrativeAiTaskSessionLifecycle {
  let currentSession: NarrativeAiTaskSession | null = null

  return {
    get current() {
      return currentSession
    },
    setup(lock) {
      const session = createNarrativeAiTaskSession(lock)
      currentSession = session

      return {
        session,
        isCurrent: () => currentSession === session,
        cleanup() {
          session.dispose()
          if (currentSession === session) {
            currentSession = null
          }
        },
      }
    },
    requireCurrent() {
      if (!currentSession) {
        throw new Error('The narrative AI task session is not mounted')
      }
      return currentSession
    },
  }
}
