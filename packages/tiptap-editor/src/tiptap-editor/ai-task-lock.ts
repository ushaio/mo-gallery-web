import { useSyncExternalStore } from 'react'

export type NarrativeAiTask = symbol

export interface NarrativeAiTaskLock {
  acquire: (task: NarrativeAiTask) => boolean
  release: (task: NarrativeAiTask) => boolean
  isOwnedBy: (task: NarrativeAiTask) => boolean
  getSnapshot: () => boolean
  subscribe: (listener: () => void) => () => void
}

export function createNarrativeAiTask(label: string): NarrativeAiTask {
  return Symbol(label)
}

export function createNarrativeAiTaskLock(): NarrativeAiTaskLock {
  let owner: NarrativeAiTask | null = null
  let lastReleasedOwner: NarrativeAiTask | null = null
  const listeners = new Set<() => void>()

  const notify = () => {
    for (const listener of listeners) listener()
  }

  return {
    acquire(task) {
      if (owner === task) return true
      if (owner !== null) return false
      owner = task
      lastReleasedOwner = null
      notify()
      return true
    },
    release(task) {
      if (owner === null) return lastReleasedOwner === task
      if (owner !== task) return false
      owner = null
      lastReleasedOwner = task
      notify()
      return true
    },
    isOwnedBy(task) {
      return owner === task
    },
    getSnapshot() {
      return owner !== null
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function useNarrativeAiTaskLock(lock: NarrativeAiTaskLock) {
  return useSyncExternalStore(lock.subscribe, lock.getSnapshot, lock.getSnapshot)
}

export async function runWithNarrativeAiTaskLock<T>(
  lock: NarrativeAiTaskLock,
  task: NarrativeAiTask,
  operation: () => Promise<T>,
): Promise<T> {
  if (lock.isOwnedBy(task)) {
    throw new Error('This task already owns the narrative AI task lock')
  }

  if (!lock.acquire(task)) {
    throw new Error('The narrative editor is already running another AI task')
  }

  try {
    return await operation()
  } finally {
    lock.release(task)
  }
}

export function executeNarrativeAiTask<T>(
  lock: NarrativeAiTaskLock,
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  return runWithNarrativeAiTaskLock(lock, createNarrativeAiTask(label), operation)
}
