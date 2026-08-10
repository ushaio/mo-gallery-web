import { useMemo, useSyncExternalStore } from 'react'

export type AgentToolApprovalDecision = 'approve' | 'approve_session' | 'approve_remembered' | 'deny'

export type AgentToolApprovalSettlement =
  | { kind: 'decided'; decision: AgentToolApprovalDecision }
  | { kind: 'timeout' }
  | { kind: 'cancelled' }

export type PendingAgentToolApproval = {
  id: string
  conversationId: string
  serverId: string
  serverName: string
  toolName: string
  riskClass: string
  parameterSummary: string
  deadlineAt: number
}

type PendingEntry = PendingAgentToolApproval & {
  settle: (settlement: AgentToolApprovalSettlement) => void
}

const APPROVAL_TIMEOUT_MS = 120_000
const pendingById = new Map<string, PendingEntry>()
const sessionApprovals = new Map<string, Set<string>>()
const listeners = new Set<() => void>()
let snapshot: PendingAgentToolApproval[] = []

function sessionKey(serverId: string, toolName: string): string {
  return `${serverId}\u0000${toolName}`
}

function emitChange(): void {
  snapshot = [...pendingById.values()].map((entry) => {
    const pending = { ...entry }
    delete (pending as Partial<PendingEntry>).settle
    return pending
  })
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): PendingAgentToolApproval[] {
  return snapshot
}

export function useAgentToolApprovals(conversationId: string | null): PendingAgentToolApproval[] {
  const approvals = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return useMemo(
    () => conversationId ? approvals.filter(item => item.conversationId === conversationId) : [],
    [approvals, conversationId],
  )
}

export function isAgentToolSessionApproved(conversationId: string, serverId: string, toolName: string): boolean {
  return sessionApprovals.get(conversationId)?.has(sessionKey(serverId, toolName)) ?? false
}

export function answerAgentToolApproval(id: string, decision: AgentToolApprovalDecision): boolean {
  const pending = pendingById.get(id)
  if (!pending) return false
  pending.settle({ kind: 'decided', decision })
  return true
}

export function cancelAgentToolApprovals(conversationId: string): void {
  for (const pending of pendingById.values()) {
    if (pending.conversationId === conversationId) pending.settle({ kind: 'cancelled' })
  }
  sessionApprovals.delete(conversationId)
}

export function requestAgentToolApproval(params: Omit<PendingAgentToolApproval, 'deadlineAt'> & {
  signal?: AbortSignal
  timeoutMs?: number
}): Promise<AgentToolApprovalSettlement> {
  if (params.signal?.aborted) return Promise.resolve({ kind: 'cancelled' })
  const timeoutMs = params.timeoutMs ?? APPROVAL_TIMEOUT_MS

  return new Promise(resolve => {
    let settled = false
    const settle = (settlement: AgentToolApprovalSettlement) => {
      if (settled) return
      settled = true
      pendingById.delete(params.id)
      clearTimeout(timeoutId)
      params.signal?.removeEventListener('abort', handleAbort)
      if (settlement.kind === 'decided' && settlement.decision === 'approve_session') {
        const approved = sessionApprovals.get(params.conversationId) ?? new Set<string>()
        approved.add(sessionKey(params.serverId, params.toolName))
        sessionApprovals.set(params.conversationId, approved)
      }
      emitChange()
      resolve(settlement)
    }
    const handleAbort = () => settle({ kind: 'cancelled' })
    const timeoutId = window.setTimeout(() => settle({ kind: 'timeout' }), timeoutMs)
    pendingById.set(params.id, {
      id: params.id,
      conversationId: params.conversationId,
      serverId: params.serverId,
      serverName: params.serverName,
      toolName: params.toolName,
      riskClass: params.riskClass,
      parameterSummary: params.parameterSummary,
      deadlineAt: Date.now() + timeoutMs,
      settle,
    })
    params.signal?.addEventListener('abort', handleAbort, { once: true })
    emitChange()
  })
}
