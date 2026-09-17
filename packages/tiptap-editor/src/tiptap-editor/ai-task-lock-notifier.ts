export type AiTaskLockObserver = ((locked: boolean) => void) | undefined

export interface AiTaskLockNotifier {
  update: (observer: AiTaskLockObserver, locked: boolean) => void
  dispose: () => void
}

export function createAiTaskLockNotifier(): AiTaskLockNotifier {
  let currentObserver: AiTaskLockObserver
  let currentValue = false

  return {
    update(observer, locked) {
      if (observer !== currentObserver) {
        currentObserver?.(false)
        currentObserver = observer
        currentValue = locked
        currentObserver?.(locked)
        return
      }

      if (locked === currentValue) return
      currentValue = locked
      currentObserver?.(locked)
    },
    dispose() {
      currentObserver?.(false)
      currentObserver = undefined
      currentValue = false
    },
  }
}
