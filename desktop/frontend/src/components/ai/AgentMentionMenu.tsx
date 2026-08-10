import { Box, Server } from 'lucide-react'

import type { AgentMentionCandidate } from '@/lib/agent-composer-mentions'

export function AgentMentionMenu({
  candidates,
  activeIndex,
  onSelect,
}: {
  candidates: AgentMentionCandidate[]
  activeIndex: number
  onSelect: (candidate: AgentMentionCandidate) => void
}) {
  if (candidates.length === 0) {
    return (
      <div role="listbox" id="agent-mention-listbox" className="absolute bottom-full left-3 z-50 mb-2 w-[min(24rem,calc(100%-1.5rem))] rounded-md border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-xl">
        没有匹配的可用扩展
      </div>
    )
  }
  return (
    <div role="listbox" id="agent-mention-listbox" className="absolute bottom-full left-3 z-50 mb-2 max-h-64 w-[min(24rem,calc(100%-1.5rem))] overflow-y-auto rounded-md border bg-popover p-1 shadow-xl">
      {candidates.map((candidate, index) => {
        const Icon = candidate.kind === 'skill' ? Box : Server
        return (
          <button
            key={`${candidate.kind}:${candidate.id}`}
            type="button"
            role="option"
            id={`agent-mention-option-${index}`}
            aria-selected={index === activeIndex}
            onMouseDown={event => event.preventDefault()}
            onClick={() => onSelect(candidate)}
            className={`flex w-full items-start gap-2 rounded px-2.5 py-2 text-left ${index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'}`}
          >
            <Icon size={14} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium">{candidate.label}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{candidate.token}</span>
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{candidate.description}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
