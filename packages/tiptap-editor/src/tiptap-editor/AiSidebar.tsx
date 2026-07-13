'use client'

import React, { createContext, use, useId, useState } from 'react'
import { PanelRightClose, Sparkles } from 'lucide-react'
import {
  INITIAL_AI_SIDEBAR_STATE,
  getAiSidebarPresentation,
  toggleAiSidebar,
} from './ai-sidebar-state'

interface AiSidebarContextValue {
  expanded: boolean
  panelId: string
  label: string
  toggle: () => void
}

const AiSidebarContext = createContext<AiSidebarContextValue | null>(null)

function useAiSidebar() {
  const context = use(AiSidebarContext)
  if (!context) {
    throw new Error('AiSidebar components must be rendered inside AiSidebar')
  }
  return context
}

interface AiSidebarProps {
  label: string
  children: React.ReactNode
  onExpand?: () => void
}

function AiSidebarRoot({ label, children, onExpand }: AiSidebarProps) {
  const [expanded, setExpanded] = useState(INITIAL_AI_SIDEBAR_STATE)
  const panelId = useId()

  const toggle = () => {
    const transition = toggleAiSidebar(expanded)
    setExpanded(transition.expanded)
    if (transition.shouldNotifyExpand) onExpand?.()
  }

  return (
    <AiSidebarContext value={{ expanded, panelId, label, toggle }}>
      <div className="ai-sidebar-shell" data-expanded={expanded ? 'true' : 'false'}>
        {children}
      </div>
    </AiSidebarContext>
  )
}

function AiSidebarContent({ children }: { children: React.ReactNode }) {
  return <div className="ai-sidebar-content">{children}</div>
}

function AiSidebarToggle() {
  const { expanded, panelId, label, toggle } = useAiSidebar()
  const { ariaExpanded } = getAiSidebarPresentation(expanded)

  return (
    <button
      type="button"
      className="ai-sidebar-toggle"
      aria-label={label}
      aria-expanded={ariaExpanded}
      aria-controls={panelId}
      onClick={toggle}
    >
      {expanded ? <PanelRightClose className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
    </button>
  )
}

function AiSidebarPanel({ children }: { children: React.ReactNode }) {
  const { expanded, panelId, label } = useAiSidebar()
  const { ariaHidden, panelState } = getAiSidebarPresentation(expanded)

  return (
    <aside
      id={panelId}
      className="ai-sidebar-panel"
      aria-label={label}
      aria-hidden={ariaHidden}
      data-state={panelState}
      inert={ariaHidden}
    >
      {children}
    </aside>
  )
}

export const AiSidebar = Object.assign(AiSidebarRoot, {
  Content: AiSidebarContent,
  Toggle: AiSidebarToggle,
  Panel: AiSidebarPanel,
})
