import { useState } from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { EditorAiTraceBlock } from '@mo-gallery/ai-agent'
import type { AgentSkill } from '@/lib/agent-extensions'

function ReasoningTraceBlock({ block, active }: {
  block: Extract<EditorAiTraceBlock, { type: 'reasoning' }>
  active: boolean
}) {
  const [open, setOpen] = useState(active)
  const [userInteracted, setUserInteracted] = useState(false)
  const effectiveOpen = userInteracted ? open : active
  return (
    <div className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
      <button
        type="button"
        aria-expanded={effectiveOpen}
        onClick={() => { setUserInteracted(true); setOpen(previous => !previous) }}
        className="flex w-full items-center gap-2 py-1 text-left"
      >
        <Sparkles size={11} />
        <span>{active ? '思考中...' : '思考过程'}</span>
        <ChevronRight size={11} className={`ml-auto transition-transform ${effectiveOpen ? 'rotate-90' : ''}`} />
      </button>
      {effectiveOpen && <div className="whitespace-pre-wrap break-words pl-5 pt-1 leading-relaxed">{block.text}</div>}
    </div>
  )
}

function formatTraceValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

function getSkillIdFromTool(tool: Extract<EditorAiTraceBlock, { type: 'tool' }>): string | null {
  if (tool.name !== 'read_agent_skill') return null
  const input = tool.input && typeof tool.input === 'object' && !Array.isArray(tool.input)
    ? tool.input as Record<string, unknown>
    : null
  if (typeof input?.skillId === 'string' && input.skillId.trim()) return input.skillId
  if (tool.inputText) {
    try {
      const parsed = JSON.parse(tool.inputText) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const skillId = (parsed as Record<string, unknown>).skillId
        return typeof skillId === 'string' && skillId.trim() ? skillId : null
      }
    } catch { /* input is still streaming */ }
  }
  return null
}

function ToolTraceBlock({ tool, skills }: {
  tool: Extract<EditorAiTraceBlock, { type: 'tool' }>
  skills: AgentSkill[]
}) {
  const skillId = getSkillIdFromTool(tool)
  const skill = skillId ? skills.find(item => item.id === skillId) : undefined
  const label = skill ? `Skill: ${skill.name}` : skillId ? `Skill: ${skillId}` : tool.name || 'tool'
  const status = tool.status === 'preparing' ? 'preparing'
    : tool.status === 'running' ? 'running'
      : tool.status === 'completed' ? 'completed' : 'failed'
  return (
    <details className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
      <summary className="cursor-pointer select-none py-1">{label} · {status}</summary>
      <div className="space-y-1.5 pl-4 pt-1">
        {(tool.inputText || tool.input !== undefined) && (
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-black/5 p-2 text-[10px] dark:bg-white/5">
            {tool.input !== undefined ? formatTraceValue(tool.input) : tool.inputText}
          </pre>
        )}
        {tool.output !== undefined && <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-black/5 p-2 text-[10px] dark:bg-white/5">{formatTraceValue(tool.output)}</pre>}
        {tool.error && <div className="text-destructive">{tool.error}</div>}
      </div>
    </details>
  )
}

export function AssistantTrace({ blocks, streaming, skills }: {
  blocks: EditorAiTraceBlock[]
  streaming: boolean
  skills: AgentSkill[]
}) {
  if (blocks.length === 0) return null
  const activeReasoningId = streaming && blocks.at(-1)?.type === 'reasoning' ? blocks.at(-1)?.id : null
  return (
    <div className="space-y-2">
      {blocks.map(block => block.type === 'reasoning' ? (
        <ReasoningTraceBlock key={block.id} block={block} active={block.id === activeReasoningId} />
      ) : block.type === 'tool' ? (
        <ToolTraceBlock key={block.id} tool={block} skills={skills} />
      ) : block.text ? (
        <div key={block.id} className="ai-markdown text-sm leading-relaxed break-words" style={{ color: 'var(--foreground)' }}>
          <Markdown remarkPlugins={[remarkGfm]}>{block.text}</Markdown>
          {streaming && blocks.at(-1)?.id === block.id && (
            <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse rounded-sm align-middle" style={{ backgroundColor: 'var(--foreground)' }} />
          )}
        </div>
      ) : null)}
    </div>
  )
}
