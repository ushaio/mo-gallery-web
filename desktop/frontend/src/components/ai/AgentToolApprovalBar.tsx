import { ShieldAlert } from 'lucide-react'
import { answerAgentToolApproval, useAgentToolApprovals } from '@/lib/agent-tool-approval'

export function AgentToolApprovalBar({ conversationId }: { conversationId: string | null }) {
  const approvals = useAgentToolApprovals(conversationId)
  if (approvals.length === 0) return null
  return (
    <div className="border-b px-5 py-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)/10' }}>
      <div className="mx-auto max-w-[44rem] space-y-2">
        {approvals.map((approval) => {
          const canRemember = approval.riskClass === 'read'
          return (
            <div key={approval.id} className="rounded-md border p-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}>
              <div className="flex items-start gap-2">
                <ShieldAlert size={15} className="mt-0.5 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium">需要批准:{approval.serverName} / {approval.toolName}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">风险:{approval.riskClass} · 参数:{approval.parameterSummary}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => answerAgentToolApproval(approval.id, 'deny')} className="rounded-md border px-2.5 py-1.5 text-[11px]" style={{ borderColor: 'var(--border)' }}>
                  拒绝
                </button>
                <button type="button" onClick={() => answerAgentToolApproval(approval.id, canRemember ? 'approve_remembered' : 'approve')} className="rounded-md border px-2.5 py-1.5 text-[11px]" style={{ borderColor: 'var(--border)' }}>
                  {canRemember ? '允许并记住' : '允许本次'}
                </button>
                {canRemember && (
                  <button type="button" onClick={() => answerAgentToolApproval(approval.id, 'approve_session')} className="rounded-md px-2.5 py-1.5 text-[11px]" style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
                    本会话允许
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
