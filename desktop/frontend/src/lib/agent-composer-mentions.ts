import type { AgentExtensionSnapshot } from './agent-extensions'

export type AgentMentionKind = 'skill' | 'mcp'

export type AgentMentionContext = {
  kind: AgentMentionKind
  start: number
  end: number
  query: string
}

export type AgentMentionCandidate = {
  id: string
  kind: AgentMentionKind
  label: string
  description: string
  token: string
}

export function findAgentMentionContext(text: string, caret: number): AgentMentionContext | null {
  const safeCaret = Math.max(0, Math.min(caret, text.length))
  const prefix = text.slice(0, safeCaret)
  const match = prefix.match(/(?:^|\s)([/@])([^\s]*)$/u)
  if (!match || match.index === undefined) return null
  const trigger = match[1]
  const query = match[2] ?? ''
  if (trigger === '/' && query.includes('/')) return null
  const leadingBoundaryLength = match[0].length - 1 - query.length
  const start = match.index + leadingBoundaryLength
  return {
    kind: trigger === '/' ? 'skill' : 'mcp',
    start,
    end: safeCaret,
    query,
  }
}

export function replaceAgentMention(
  text: string,
  context: AgentMentionContext,
  token: string,
): { text: string; caret: number } {
  const before = text.slice(0, context.start)
  const after = text.slice(context.end)
  const existingSpace = after.startsWith(' ')
  const suffix = existingSpace ? '' : ' '
  const next = `${before}${token}${suffix}${after}`
  return { text: next, caret: before.length + token.length + suffix.length + (existingSpace ? 1 : 0) }
}

export function removeAgentMentionQuery(
  text: string,
  context: AgentMentionContext,
): { text: string; caret: number } {
  let before = text.slice(0, context.start)
  let after = text.slice(context.end)

  if (!before && /^\s/u.test(after)) {
    after = after.slice(1)
  } else if (/\s$/u.test(before) && /^\s/u.test(after)) {
    after = after.slice(1)
  } else if (!after && /\s$/u.test(before)) {
    before = before.slice(0, -1)
  }

  return { text: `${before}${after}`, caret: before.length }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasToken(text: string, token: string): boolean {
  return new RegExp(`(^|\\s)${escapeRegExp(token)}(?=\\s|$)`, 'u').test(text)
}

export function buildAgentMentionCandidates(snapshot: AgentExtensionSnapshot): AgentMentionCandidate[] {
  const skills = snapshot.skills
    .filter(skill => skill.enabled && skill.validationStatus === 'valid')
    .map(skill => ({
      id: skill.id,
      kind: 'skill' as const,
      label: skill.name,
      description: skill.description,
      token: `/${skill.id}`,
    }))
  const servers = snapshot.mcpServers
    .filter(server => server.enabled)
    .map(server => ({
      id: server.id,
      kind: 'mcp' as const,
      label: server.name,
      description: server.description || `${server.tools?.length ?? 0} tools`,
      token: `@mcp:${server.id}`,
    }))
  return [...skills, ...servers]
}

export function filterAgentMentionCandidates(
  candidates: AgentMentionCandidate[],
  context: AgentMentionContext | null,
): AgentMentionCandidate[] {
  if (!context) return []
  const query = context.query.toLocaleLowerCase().replace(/^mcp:/, '')
  return candidates
    .filter(candidate => candidate.kind === context.kind)
    .filter(candidate => !query || `${candidate.label} ${candidate.id} ${candidate.description}`.toLocaleLowerCase().includes(query))
    .slice(0, 8)
}

export function resolveAgentMentionSelection(
  text: string,
  snapshot: AgentExtensionSnapshot,
  selectedMentions: AgentMentionCandidate[] = [],
): {
  selectedSkillIds: string[]
  selectedMcpServerIds: string[]
  hasExplicitMcpMention: boolean
} {
  const candidates = buildAgentMentionCandidates(snapshot)
  const selectedKeys = new Set(selectedMentions.map(candidate => `${candidate.kind}:${candidate.id}`))
  return {
    selectedSkillIds: candidates
      .filter(candidate => candidate.kind === 'skill' && (hasToken(text, candidate.token) || selectedKeys.has(`skill:${candidate.id}`)))
      .map(candidate => candidate.id),
    selectedMcpServerIds: candidates
      .filter(candidate => candidate.kind === 'mcp' && (hasToken(text, candidate.token) || selectedKeys.has(`mcp:${candidate.id}`)))
      .map(candidate => candidate.id),
    hasExplicitMcpMention: /(^|\s)@mcp:[^\s]+/u.test(text) || selectedMentions.some(candidate => candidate.kind === 'mcp'),
  }
}
