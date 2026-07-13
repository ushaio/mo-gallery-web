export interface PreventableInteraction {
  preventDefault: () => void
  stopPropagation: () => void
}

export function guardNarrativeAiMutation<Args extends unknown[]>(
  isLocked: boolean,
  operation: (...args: Args) => void,
) {
  return (...args: Args) => {
    if (isLocked) return
    operation(...args)
  }
}

export function blockNarrativeAiInteraction(
  isLocked: boolean,
  event: PreventableInteraction,
) {
  if (!isLocked) return false

  event.preventDefault()
  event.stopPropagation()
  return true
}
