export const INITIAL_AI_SIDEBAR_STATE = false

export function getAiSidebarPresentation(expanded: boolean) {
  return {
    ariaExpanded: expanded,
    ariaHidden: !expanded,
    panelState: expanded ? 'expanded' as const : 'collapsed' as const,
  }
}

export function toggleAiSidebar(expanded: boolean) {
  const nextExpanded = !expanded
  return {
    expanded: nextExpanded,
    shouldNotifyExpand: nextExpanded,
  }
}
