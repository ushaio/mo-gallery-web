import { hasExplicitZineEditIntent } from './zine-ai-intent'
import type { EditorAiHistoryMessage } from '@mo-gallery/ai-agent'

export type ZineAiMode = 'ask' | 'agent'
export type ZineAgentPermissionState = 'pending' | 'continued' | 'kept'

export interface ZineAgentPermissionMetadata {
  [key: string]: string
  type: 'zine_agent_permission'
  state: ZineAgentPermissionState
  instruction: string
}

const MAX_ZINE_CONVERSATION_TURNS = 8
const MAX_ZINE_CONVERSATION_TURN_CHARS = 3_000

interface ZineConversationMessageSource {
  role: string
  status: string
  content: string
  metadata?: unknown
}

export function buildZineConversationHistory(
  messages: readonly ZineConversationMessageSource[],
  currentInstruction: string,
  currentInstructionWillBeAppended: boolean,
): EditorAiHistoryMessage[] {
  const history = messages.flatMap((message): EditorAiHistoryMessage[] => {
    if (
      message.status !== 'completed'
      || (message.role !== 'user' && message.role !== 'assistant')
      || !message.content.trim()
      || readZineAgentPermissionMetadata(message.metadata)
    ) return []
    return [{
      role: message.role,
      content: message.content.trim().slice(0, MAX_ZINE_CONVERSATION_TURN_CHARS),
    }]
  }).slice(-MAX_ZINE_CONVERSATION_TURNS)

  if (!currentInstructionWillBeAppended) {
    const last = history.at(-1)
    if (last?.role === 'user' && last.content === currentInstruction.trim()) history.pop()
  }
  return history
}

export function shouldRequestZineAgentPermission(mode: ZineAiMode, instruction: string): boolean {
  return mode === 'ask' && hasExplicitZineEditIntent(instruction)
}

export function createZineAgentPermissionMetadata(
  instruction: string,
  state: ZineAgentPermissionState = 'pending',
): ZineAgentPermissionMetadata {
  return { type: 'zine_agent_permission', state, instruction }
}

export function readZineAgentPermissionMetadata(value: unknown): ZineAgentPermissionMetadata | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (candidate.type !== 'zine_agent_permission' || typeof candidate.instruction !== 'string') return null
  if (candidate.state !== 'pending' && candidate.state !== 'continued' && candidate.state !== 'kept') return null
  return {
    type: 'zine_agent_permission',
    state: candidate.state,
    instruction: candidate.instruction,
  }
}
