import { useCallback, useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import {
  Activity, Archive, Bot, Box, Check, ChevronRight, CircleAlert, Clock3,
  FileJson, FolderInput, KeyRound, Loader2, Play, Plus, RefreshCw,
  ScrollText, Server, ShieldCheck, Terminal, Trash2, Wrench,
  type LucideIcon,
} from 'lucide-react'
import {
  agentExtensions,
  type AgentAuthorization,
  type AgentExtensionSnapshot,
  type AgentMcpEnvironmentVariable,
  type AgentMcpServer,
  type AgentMcpServerInput,
  type AgentSkill,
} from '@/lib/agent-extensions'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'

type Section = 'skills' | 'mcp' | 'security'
type SelectedItem = { type: 'skill'; id: string } | { type: 'mcp'; id: string } | null

const emptySnapshot: AgentExtensionSnapshot = { skills: [], mcpServers: [], authorizations: [], audits: [] }

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function AgentExtensionsTab() {
  const [section, setSection] = useState<Section>('skills')
  const [snapshot, setSnapshot] = useState<AgentExtensionSnapshot>(emptySnapshot)
  const [selected, setSelected] = useState<SelectedItem>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [mcpEditorOpen, setMcpEditorOpen] = useState(false)
  const [jsonImporterOpen, setJsonImporterOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<AgentMcpServer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SelectedItem>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const next = await agentExtensions.snapshot()
      setSnapshot({
        skills: next.skills || [],
        mcpServers: next.mcpServers || [],
        authorizations: next.authorizations || [],
        audits: next.audits || [],
      })
      setSelected(current => {
        if (!current) return next.skills?.[0] ? { type: 'skill', id: next.skills[0].id } : next.mcpServers?.[0] ? { type: 'mcp', id: next.mcpServers[0].id } : null
        const exists = current.type === 'skill'
          ? next.skills?.some(item => item.id === current.id)
          : next.mcpServers?.some(item => item.id === current.id)
        return exists ? current : null
      })
    } catch (error) {
      toast.error(`读取 Agent 扩展失败：${getErrorMessage(error)}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const selectedSkill = selected?.type === 'skill' ? snapshot.skills.find(item => item.id === selected.id) : undefined
  const selectedServer = selected?.type === 'mcp' ? snapshot.mcpServers.find(item => item.id === selected.id) : undefined

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key)
    try {
      await action()
      toast.success(success)
      await refresh()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const importSkill = async (source: 'directory' | 'archive') => {
    setBusy(`import-${source}`)
    try {
      const action = source === 'directory' ? agentExtensions.importSkillDirectory : agentExtensions.importSkillArchive
      const imported = await action()
      if (imported.length === 0) return
      toast.success(`已导入 ${imported.length} 个 Skill`)
      await refresh()
      setSelected({ type: 'skill', id: imported[0].id })
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await run(
      `delete-${deleteTarget.type}-${deleteTarget.id}`,
      () => deleteTarget.type === 'skill'
        ? agentExtensions.removeSkill(deleteTarget.id)
        : agentExtensions.removeMcpServer(deleteTarget.id),
      deleteTarget.type === 'skill' ? 'Skill 已移除' : 'MCP Server 已移除',
    )
    setDeleteTarget(null)
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <aside className="flex w-[292px] shrink-0 flex-col border-r" style={{ borderColor: 'var(--border)' }}>
        <div className="border-b p-3" style={{ borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-3 rounded-md p-0.5" style={{ backgroundColor: 'var(--muted)' }}>
            <SectionButton active={section === 'skills'} icon={Box} label="Skills" onClick={() => setSection('skills')} />
            <SectionButton active={section === 'mcp'} icon={Server} label="MCP" onClick={() => setSection('mcp')} />
            <SectionButton active={section === 'security'} icon={ShieldCheck} label="权限" onClick={() => setSection('security')} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
          {loading ? (
            <div className="space-y-2 p-1">{[0, 1, 2].map(item => <div key={item} className="h-14 animate-pulse rounded-md" style={{ backgroundColor: 'var(--muted)' }} />)}</div>
          ) : section === 'skills' ? (
            <ExtensionListEmptyGuard count={snapshot.skills.length} label="尚未安装 Skill" description="从本地目录或压缩包导入 SKILL.md 能力包。">
              {snapshot.skills.map(skill => (
                <ExtensionListItem key={skill.id} active={selected?.type === 'skill' && selected.id === skill.id} icon={Box} title={skill.name} subtitle={skill.description} status={skill.enabled ? skill.validationStatus : 'disabled'} onClick={() => setSelected({ type: 'skill', id: skill.id })} />
              ))}
            </ExtensionListEmptyGuard>
          ) : section === 'mcp' ? (
            <ExtensionListEmptyGuard count={snapshot.mcpServers.length} label="尚未配置 MCP" description="添加 stdio Server，让 Agent 使用外部工具。">
              {snapshot.mcpServers.map(server => (
                <ExtensionListItem key={server.id} active={selected?.type === 'mcp' && selected.id === server.id} icon={Terminal} title={server.name} subtitle={[server.command, ...(server.args || [])].join(' ')} status={server.enabled ? server.runtimeStatus : 'disabled'} onClick={() => setSelected({ type: 'mcp', id: server.id })} />
              ))}
            </ExtensionListEmptyGuard>
          ) : (
            <SecurityOverview snapshot={snapshot} onRevoke={id => run(`revoke-${id}`, () => agentExtensions.revokeAuthorization(id), '授权已撤销')} busy={busy} />
          )}
        </div>

        <div className="border-t p-3" style={{ borderColor: 'var(--border)' }}>
          {section === 'skills' ? (
            <div className="grid grid-cols-2 gap-2">
              <ActionButton icon={FolderInput} label="导入目录" busy={busy === 'import-directory'} onClick={() => void importSkill('directory')} />
              <ActionButton icon={Archive} label="导入压缩包" busy={busy === 'import-archive'} onClick={() => void importSkill('archive')} />
            </div>
          ) : section === 'mcp' ? (
            <div className="grid grid-cols-2 gap-2">
              <ActionButton icon={Plus} label="添加 Server" onClick={() => { setEditingServer(null); setMcpEditorOpen(true) }} />
              <ActionButton icon={FileJson} label="导入 JSON" onClick={() => setJsonImporterOpen(true)} />
            </div>
          ) : (
            <ActionButton icon={RefreshCw} label="刷新权限与审计" busy={loading} onClick={() => void refresh()} />
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto custom-scrollbar">
        {section === 'security' ? (
          <AuditPanel audits={snapshot.audits} />
        ) : selectedSkill ? (
          <SkillDetail
            skill={selectedSkill}
            busy={busy}
            onToggle={enabled => run(`skill-toggle-${selectedSkill.id}`, () => agentExtensions.setSkillEnabled(selectedSkill.id, enabled), enabled ? 'Skill 已启用' : 'Skill 已禁用')}
            onScriptToggle={enabled => run(`skill-script-${selectedSkill.id}`, () => agentExtensions.setSkillScriptExecution(selectedSkill.id, enabled), enabled ? '已允许脚本执行' : '已关闭脚本执行')}
            onDelete={() => setDeleteTarget({ type: 'skill', id: selectedSkill.id })}
          />
        ) : selectedServer ? (
          <McpDetail
            server={selectedServer}
            busy={busy}
            onToggle={enabled => run(`mcp-toggle-${selectedServer.id}`, () => agentExtensions.setMcpServerEnabled(selectedServer.id, enabled), enabled ? 'MCP Server 已启用' : 'MCP Server 已禁用')}
            onTest={() => run(`mcp-test-${selectedServer.id}`, () => agentExtensions.testMcpServer(selectedServer.id), '连接成功，工具列表已更新')}
            onEdit={() => { setEditingServer(selectedServer); setMcpEditorOpen(true) }}
            onDelete={() => setDeleteTarget({ type: 'mcp', id: selectedServer.id })}
          />
        ) : (
          <EmptyDetail section={section} />
        )}
      </main>

      {mcpEditorOpen && <McpEditor server={editingServer} onClose={() => setMcpEditorOpen(false)} onSaved={async () => { setMcpEditorOpen(false); await refresh() }} />}
      {jsonImporterOpen && <McpJsonImporter onClose={() => setJsonImporterOpen(false)} onImported={async () => { setJsonImporterOpen(false); await refresh() }} />}
      <SimpleDeleteDialog isOpen={deleteTarget !== null} title={deleteTarget?.type === 'skill' ? '移除 Skill' : '移除 MCP Server'} message="该扩展的长期授权也会一并撤销。此操作不会删除原始导入目录。" confirmLabel="移除" cancelLabel="取消" pendingLabel="正在移除..." confirmVariant="destructive" onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} t={key => key} />
    </div>
  )
}

function SectionButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex h-8 items-center justify-center gap-1.5 rounded text-[11px] font-medium transition-colors" style={{ backgroundColor: active ? 'var(--background)' : 'transparent', color: active ? 'var(--foreground)' : 'var(--muted-foreground)', boxShadow: active ? 'var(--shadow-sm)' : 'none' }}><Icon size={13} />{label}</button>
}

function ExtensionListEmptyGuard({ count, label, description, children }: { count: number; label: string; description: string; children: React.ReactNode }) {
  if (count) return <div className="space-y-1">{children}</div>
  return <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center"><Box size={22} style={{ color: 'var(--muted-foreground)' }} /><p className="mt-3 text-xs font-medium">{label}</p><p className="mt-1 text-[11px] leading-5" style={{ color: 'var(--muted-foreground)' }}>{description}</p></div>
}

function ExtensionListItem({ active, icon: Icon, title, subtitle, status, onClick }: { active: boolean; icon: LucideIcon; title: string; subtitle: string; status: string; onClick: () => void }) {
  const healthy = status === 'valid' || status === 'ready' || status === 'stopped'
  return <button type="button" onClick={onClick} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-secondary" style={{ backgroundColor: active ? 'var(--accent)' : 'transparent' }}><span className="flex size-8 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: active ? 'var(--background)' : 'var(--muted)' }}><Icon size={14} /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{title}</span><span className="mt-0.5 block truncate text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{subtitle}</span></span><span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: status === 'disabled' ? 'var(--muted-foreground)' : healthy ? '#22c55e' : '#f59e0b' }} /><ChevronRight size={13} style={{ color: 'var(--muted-foreground)' }} /></button>
}

function ActionButton({ icon: Icon, label, busy, onClick }: { icon: LucideIcon; label: string; busy?: boolean; onClick: () => void }) {
  return <button type="button" disabled={busy} onClick={onClick} className="flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-[11px] font-medium transition-colors hover:bg-secondary disabled:opacity-50" style={{ borderColor: 'var(--border)' }}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}{label}</button>
}

function Header({ icon: Icon, title, description, actions }: { icon: LucideIcon; title: string; description: string; actions: React.ReactNode }) {
  return <div className="flex items-start gap-4 border-b px-7 py-6" style={{ borderColor: 'var(--border)' }}><span className="flex size-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--muted)' }}><Icon size={18} /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 max-w-2xl text-[11px] leading-5" style={{ color: 'var(--muted-foreground)' }}>{description}</p></div><div className="flex shrink-0 gap-2">{actions}</div></div>
}

function Toggle({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className="relative h-5 w-9 rounded-full transition-colors disabled:opacity-50" style={{ backgroundColor: checked ? 'var(--primary)' : 'var(--muted)' }}><span className="absolute top-0.5 size-4 rounded-full transition-all" style={{ left: checked ? 18 : 2, backgroundColor: checked ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }} /></button>
}

function SkillDetail({ skill, busy, onToggle, onScriptToggle, onDelete }: { skill: AgentSkill; busy: string | null; onToggle: (enabled: boolean) => void; onScriptToggle: (enabled: boolean) => void; onDelete: () => void }) {
  const [readme, setReadme] = useState('')
  const [readmeLoading, setReadmeLoading] = useState(true)
  const [readmeError, setReadmeError] = useState('')

  useEffect(() => {
    let active = true
    setReadme('')
    setReadmeError('')
    setReadmeLoading(true)
    void agentExtensions.readSkill(skill.id).then(content => {
      if (active) setReadme(content.readme)
    }).catch(error => {
      if (active) setReadmeError(getErrorMessage(error))
    }).finally(() => {
      if (active) setReadmeLoading(false)
    })
    return () => { active = false }
  }, [skill.id])

  return (
    <div>
      <Header icon={Box} title={skill.name} description={skill.description} actions={<><button type="button" onClick={onDelete} className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] hover:bg-secondary" style={{ borderColor: 'var(--border)', color: 'var(--destructive)' }}><Trash2 size={13} />移除</button><Toggle checked={skill.enabled} disabled={busy !== null} onChange={onToggle} label="启用 Skill" /></>} />
      <div className="max-w-4xl space-y-6 p-7">
        <DetailSection title="介绍">
          {readmeLoading ? (
            <div className="space-y-2 py-2">{[0, 1, 2].map(item => <div key={item} className="h-3 animate-pulse rounded" style={{ width: item === 2 ? '68%' : '100%', backgroundColor: 'var(--muted)' }} />)}</div>
          ) : readmeError ? (
            <StatusCard healthy={false} title="README 读取失败" description={readmeError} />
          ) : readme ? (
            <div className="ai-markdown min-w-0 break-words text-sm leading-relaxed">
              <Markdown remarkPlugins={[remarkGfm]}>{readme}</Markdown>
            </div>
          ) : (
            <p className="rounded-md border border-dashed px-4 py-8 text-center text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>此 Skill 未提供 README.md</p>
          )}
        </DetailSection>
        <DetailSection title="安装信息"><DetailRow label="版本" value={skill.version || '未声明'} /><DetailRow label="来源" value={skill.sourcePath} mono /><DetailRow label="管理目录" value={skill.installPath} mono /><DetailRow label="能力指纹" value={skill.contentHash} mono /></DetailSection>
        <DetailSection title="安全策略" description="脚本权限独立于 Skill 启用状态。首次真实执行仍需用户确认。"><div className="flex items-center justify-between rounded-md border px-3 py-3" style={{ borderColor: 'var(--border)' }}><div><p className="text-xs font-medium">允许执行包内脚本</p><p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>默认关闭；仅对当前 Skill 生效。</p></div><Toggle checked={skill.scriptExecutionEnabled} disabled={busy !== null} onChange={onScriptToggle} label="允许 Skill 脚本" /></div></DetailSection>
        <DetailSection title="校验"><StatusCard healthy={skill.validationStatus === 'valid'} title={skill.validationStatus === 'valid' ? 'Skill 可用' : 'Skill 校验失败'} description={skill.validationError || 'SKILL.md 元数据与安装快照完整。'} /></DetailSection>
      </div>
    </div>
  )
}

function McpDetail({ server, busy, onToggle, onTest, onEdit, onDelete }: { server: AgentMcpServer; busy: string | null; onToggle: (enabled: boolean) => void; onTest: () => void; onEdit: () => void; onDelete: () => void }) {
  return <div><Header icon={Terminal} title={server.name} description={server.description || 'stdio MCP Server'} actions={<><button type="button" disabled={busy !== null} onClick={onTest} className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] hover:bg-secondary disabled:opacity-50" style={{ borderColor: 'var(--border)' }}>{busy === `mcp-test-${server.id}` ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}测试连接</button><button type="button" onClick={onEdit} className="h-8 rounded-md border px-2.5 text-[11px] hover:bg-secondary" style={{ borderColor: 'var(--border)' }}>编辑</button><button type="button" onClick={onDelete} className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] hover:bg-secondary" style={{ borderColor: 'var(--border)', color: 'var(--destructive)' }}><Trash2 size={13} />移除</button><Toggle checked={server.enabled} disabled={busy !== null} onChange={onToggle} label="启用 MCP Server" /></>} /><div className="max-w-4xl space-y-6 p-7"><DetailSection title="运行配置"><DetailRow label="命令" value={[server.command, ...(server.args || [])].join(' ')} mono /><DetailRow label="状态" value={server.enabled ? server.runtimeStatus : 'disabled'} /><DetailRow label="请求超时" value={`${server.requestTimeoutSeconds} 秒`} /><DetailRow label="空闲关闭" value={`${server.idleTimeoutSeconds} 秒`} /><DetailRow label="能力指纹" value={server.capabilityFingerprint} mono /></DetailSection>{server.lastError && <StatusCard healthy={false} title="最近一次连接失败" description={server.lastError} />}<DetailSection title={`工具 · ${server.tools?.length || 0}`} description="风险等级根据工具名称和描述推断；写入、执行、删除及网络外发默认逐次确认。"><div className="divide-y rounded-md border" style={{ borderColor: 'var(--border)' }}>{server.tools?.length ? server.tools.map(tool => <div key={tool.name} className="flex items-start gap-3 px-3 py-3"><span className="flex size-7 shrink-0 items-center justify-center rounded" style={{ backgroundColor: 'var(--muted)' }}><Wrench size={13} /></span><div className="min-w-0 flex-1"><p className="font-mono text-[11px] font-medium">{tool.name}</p><p className="mt-1 text-[10px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{tool.description || '无描述'}</p></div><RiskBadge risk={tool.riskClass} /></div>) : <p className="px-4 py-8 text-center text-[11px]" style={{ color: 'var(--muted-foreground)' }}>测试连接后显示 Server 工具列表</p>}</div></DetailSection><DetailSection title={`环境变量 · ${server.env?.length || 0}`}><div className="flex flex-wrap gap-2">{server.env?.map(variable => <span key={variable.name} className="inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10px]" style={{ borderColor: 'var(--border)' }}>{variable.secret ? <KeyRound size={11} /> : null}{variable.name}{variable.secret ? ' · 已保护' : ''}</span>)}</div></DetailSection></div></div>
}

function SecurityOverview({ snapshot, onRevoke, busy }: { snapshot: AgentExtensionSnapshot; onRevoke: (id: string) => void; busy: string | null }) {
  return <div className="space-y-4 p-2"><div className="grid grid-cols-2 gap-2"><Metric icon={ShieldCheck} value={snapshot.authorizations.length} label="长期授权" /><Metric icon={Activity} value={snapshot.audits.length} label="调用记录" /></div><p className="px-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>授权</p>{snapshot.authorizations.length ? snapshot.authorizations.map(grant => <button key={grant.id} type="button" disabled={busy === `revoke-${grant.id}`} onClick={() => onRevoke(grant.id)} className="group flex w-full items-start gap-2 rounded-md border p-2.5 text-left hover:bg-secondary" style={{ borderColor: 'var(--border)' }}><ShieldCheck size={13} className="mt-0.5" /><span className="min-w-0 flex-1"><span className="block truncate font-mono text-[10px]">{grant.capabilityName}</span><span className="mt-1 block truncate text-[9px]" style={{ color: 'var(--muted-foreground)' }}>{grant.sourceId} · {grant.parameterScope || '全部参数'}</span></span><Trash2 size={12} className="opacity-0 group-hover:opacity-100" /></button>) : <p className="rounded-md border border-dashed px-3 py-8 text-center text-[10px]" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>暂无长期授权</p>}</div>
}

function AuditPanel({ audits }: { audits: AgentExtensionSnapshot['audits'] }) {
  return <div><Header icon={ScrollText} title="权限与审计" description="只记录来源、工具、脱敏参数摘要、耗时和执行状态，不保存密钥或完整敏感内容。" actions={null} /><div className="p-7"><div className="overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)' }}><div className="grid grid-cols-[minmax(150px,1fr)_100px_100px_100px] gap-3 border-b px-4 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)', backgroundColor: 'var(--muted)' }}><span>调用</span><span>风险</span><span>状态</span><span>耗时</span></div>{audits.length ? [...audits].reverse().map(audit => <div key={audit.id} className="grid grid-cols-[minmax(150px,1fr)_100px_100px_100px] gap-3 border-b px-4 py-3 text-[11px] last:border-b-0" style={{ borderColor: 'var(--border)' }}><div className="min-w-0"><p className="truncate font-mono font-medium">{audit.capabilityName}</p><p className="mt-1 truncate text-[10px]" title={audit.parameterSummary} style={{ color: 'var(--muted-foreground)' }}>{audit.sourceId} · {audit.parameterSummary}</p></div><RiskBadge risk={audit.riskClass} /><span className="flex items-center gap-1.5">{audit.resultStatus === 'success' ? <Check size={12} color="#22c55e" /> : <CircleAlert size={12} color="#ef4444" />}{audit.resultStatus}</span><span className="flex items-center gap-1.5"><Clock3 size={12} />{audit.durationMs} ms</span></div>) : <div className="px-4 py-16 text-center text-[11px]" style={{ color: 'var(--muted-foreground)' }}>尚无工具调用记录</div>}</div></div></div>
}

function Metric({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) { return <div className="rounded-md border p-3" style={{ borderColor: 'var(--border)' }}><Icon size={14} /><p className="mt-3 text-lg font-semibold">{value}</p><p className="text-[9px]" style={{ color: 'var(--muted-foreground)' }}>{label}</p></div> }
function DetailSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) { return <section><h3 className="text-xs font-semibold">{title}</h3>{description && <p className="mt-1 text-[10px] leading-5" style={{ color: 'var(--muted-foreground)' }}>{description}</p>}<div className="mt-3">{children}</div></section> }
function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) { return <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-4 border-b py-2.5 text-[11px] last:border-b-0" style={{ borderColor: 'var(--border)' }}><span style={{ color: 'var(--muted-foreground)' }}>{label}</span><span className={`break-all ${mono ? 'font-mono text-[10px]' : ''}`}>{value}</span></div> }
function StatusCard({ healthy, title, description }: { healthy: boolean; title: string; description: string }) { return <div className="flex gap-3 rounded-md border p-3" style={{ borderColor: healthy ? 'color-mix(in srgb, #22c55e 40%, var(--border))' : 'color-mix(in srgb, #ef4444 40%, var(--border))', backgroundColor: healthy ? 'color-mix(in srgb, #22c55e 6%, transparent)' : 'color-mix(in srgb, #ef4444 6%, transparent)' }}>{healthy ? <ShieldCheck size={15} color="#22c55e" /> : <CircleAlert size={15} color="#ef4444" />}<div><p className="text-[11px] font-medium">{title}</p><p className="mt-1 text-[10px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{description}</p></div></div> }
function RiskBadge({ risk }: { risk: string }) { const risky = risk !== 'read'; return <span className="inline-flex h-5 items-center rounded px-1.5 text-[9px] font-medium" style={{ backgroundColor: risky ? 'color-mix(in srgb, #f59e0b 14%, transparent)' : 'var(--muted)', color: risky ? '#d97706' : 'var(--muted-foreground)' }}>{risk}</span> }
function EmptyDetail({ section }: { section: Section }) { return <div className="flex h-full min-h-80 flex-col items-center justify-center text-center"><Bot size={28} style={{ color: 'var(--muted-foreground)' }} /><p className="mt-4 text-sm font-medium">选择一个{section === 'skills' ? ' Skill' : ' MCP Server'}</p><p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>在左侧查看配置、运行状态和安全策略。</p></div> }

function McpEditor({ server, onClose, onSaved }: { server: AgentMcpServer | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<AgentMcpServerInput>(() => ({ id: server?.id, name: server?.name || '', description: server?.description || '', command: server?.command || '', args: server?.args || [], env: server?.env || [], enabled: server?.enabled ?? true, idleTimeoutSeconds: server?.idleTimeoutSeconds || 300, requestTimeoutSeconds: server?.requestTimeoutSeconds || 60 }))
  const [argsText, setArgsText] = useState((server?.args || []).join('\n'))
  const [envText, setEnvText] = useState((server?.env || []).map(item => `${item.name}=${item.secret ? '' : item.value || ''}${item.secret ? ' # secret' : ''}`).join('\n'))
  const [saving, setSaving] = useState(false)
  const save = async () => { setSaving(true); try { const env: AgentMcpEnvironmentVariable[] = envText.split('\n').map(line => line.trim()).filter(Boolean).map(line => { const secret = /#\s*secret$/i.test(line); const cleaned = line.replace(/\s*#\s*secret$/i, ''); const [name, ...parts] = cleaned.split('='); const existing = server?.env.find(item => item.name === name.trim()); return { name: name.trim(), value: parts.join('='), secret, configured: secret ? Boolean(parts.join('=') || existing?.configured) : true, credentialRef: secret && !parts.join('=') ? existing?.credentialRef : undefined } }); await agentExtensions.saveMcpServer({ ...form, args: argsText.split('\n').map(item => item.trim()).filter(Boolean), env }); toast.success(server ? 'MCP Server 已更新' : 'MCP Server 已添加'); await onSaved() } catch (error) { toast.error(getErrorMessage(error)) } finally { setSaving(false) } }
  return <Modal title={server ? '编辑 MCP Server' : '添加 MCP Server'} description="首期仅支持 stdio。敏感环境变量在行尾添加 # secret，将保存到系统凭据库。" onClose={onClose} footer={<><button type="button" onClick={onClose} className="h-9 rounded-md border px-4 text-xs" style={{ borderColor: 'var(--border)' }}>取消</button><button type="button" disabled={saving || !form.name.trim() || !form.command.trim()} onClick={() => void save()} className="flex h-9 items-center gap-2 rounded-md px-4 text-xs font-medium disabled:opacity-50" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>{saving && <Loader2 size={13} className="animate-spin" />}保存</button></>}><div className="space-y-4"><FormField label="名称"><input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} className="h-9 w-full rounded-md border bg-transparent px-3 text-xs outline-none focus:ring-1 focus:ring-ring" style={{ borderColor: 'var(--border)' }} /></FormField><FormField label="描述"><input value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} className="h-9 w-full rounded-md border bg-transparent px-3 text-xs outline-none focus:ring-1 focus:ring-ring" style={{ borderColor: 'var(--border)' }} /></FormField><FormField label="Command"><input value={form.command} onChange={event => setForm(current => ({ ...current, command: event.target.value }))} className="h-9 w-full rounded-md border bg-transparent px-3 font-mono text-xs outline-none focus:ring-1 focus:ring-ring" style={{ borderColor: 'var(--border)' }} /></FormField><div className="grid grid-cols-2 gap-4"><FormField label="Args（每行一个）"><textarea value={argsText} onChange={event => setArgsText(event.target.value)} className="h-28 w-full resize-none rounded-md border bg-transparent p-3 font-mono text-[11px] outline-none focus:ring-1 focus:ring-ring" style={{ borderColor: 'var(--border)' }} /></FormField><FormField label="环境变量"><textarea value={envText} onChange={event => setEnvText(event.target.value)} placeholder={'API_KEY=... # secret\nMODE=readonly'} className="h-28 w-full resize-none rounded-md border bg-transparent p-3 font-mono text-[11px] outline-none focus:ring-1 focus:ring-ring" style={{ borderColor: 'var(--border)' }} /></FormField></div><div className="grid grid-cols-2 gap-4"><FormField label="请求超时（秒）"><input type="number" min={1} value={form.requestTimeoutSeconds} onChange={event => setForm(current => ({ ...current, requestTimeoutSeconds: Number(event.target.value) }))} className="h-9 w-full rounded-md border bg-transparent px-3 text-xs" style={{ borderColor: 'var(--border)' }} /></FormField><FormField label="空闲关闭（秒）"><input type="number" min={1} value={form.idleTimeoutSeconds} onChange={event => setForm(current => ({ ...current, idleTimeoutSeconds: Number(event.target.value) }))} className="h-9 w-full rounded-md border bg-transparent px-3 text-xs" style={{ borderColor: 'var(--border)' }} /></FormField></div></div></Modal>
}

function McpJsonImporter({ onClose, onImported }: { onClose: () => void; onImported: () => Promise<void> }) {
  const [value, setValue] = useState('{\n  "mcpServers": {\n    "example": {\n      "command": "npx",\n      "args": ["-y", "@example/mcp-server"],\n      "env": {}\n    }\n  }\n}')
  const [saving, setSaving] = useState(false)
  const importJson = async () => { setSaving(true); try { const servers = await agentExtensions.importMcpServers(value); toast.success(`已导入 ${servers.length} 个 MCP Server`); await onImported() } catch (error) { toast.error(getErrorMessage(error)) } finally { setSaving(false) } }
  return <Modal title="导入 mcpServers JSON" description="兼容常见 MCP 客户端的 command、args、env 配置。包含 key/token/secret/password 的变量会自动存入系统凭据库。" onClose={onClose} footer={<><button type="button" onClick={onClose} className="h-9 rounded-md border px-4 text-xs" style={{ borderColor: 'var(--border)' }}>取消</button><button type="button" disabled={saving} onClick={() => void importJson()} className="flex h-9 items-center gap-2 rounded-md px-4 text-xs font-medium" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>{saving && <Loader2 size={13} className="animate-spin" />}导入</button></>}><textarea value={value} onChange={event => setValue(event.target.value)} spellCheck={false} className="h-80 w-full resize-none rounded-md border bg-transparent p-4 font-mono text-[11px] leading-5 outline-none focus:ring-1 focus:ring-ring" style={{ borderColor: 'var(--border)' }} /></Modal>
}

function Modal({ title, description, children, footer, onClose }: { title: string; description: string; children: React.ReactNode; footer: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><div role="dialog" aria-modal="true" className="w-full max-w-2xl overflow-hidden rounded-xl border shadow-2xl" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}><div className="flex items-start gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}><span className="flex size-9 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--muted)' }}><Server size={16} /></span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-[10px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{description}</p></div></div><div className="max-h-[70vh] overflow-y-auto p-5 custom-scrollbar">{children}</div><div className="flex justify-end gap-2 border-t px-5 py-4" style={{ borderColor: 'var(--border)' }}>{footer}</div></div></div> }
function FormField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[10px] font-medium" style={{ color: 'var(--muted-foreground)' }}>{label}</span>{children}</label> }
