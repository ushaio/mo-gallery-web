export type AgentSkill = {
  id: string
  name: string
  description: string
  version?: string
  sourceType: string
  sourcePath: string
  installPath: string
  contentHash: string
  enabled: boolean
  scriptExecutionEnabled: boolean
  validationStatus: string
  validationError?: string
  installedAt: string
  updatedAt: string
}

export type AgentSkillContent = {
  skill: AgentSkill
  instructions: string
  readme: string
  references: Array<{ path: string; content: string }>
}

export type AgentSkillResource = {
  skill: AgentSkill
  path: string
  content: string
  references: string[]
}

export type AgentMcpEnvironmentVariable = {
  name: string
  value?: string
  secret: boolean
  configured: boolean
  credentialRef?: string
}

export type AgentMcpTool = {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  riskClass: 'read' | 'write' | 'execute' | 'delete' | 'network'
}

export type AgentMcpServer = {
  id: string
  name: string
  description?: string
  command: string
  args: string[]
  env: AgentMcpEnvironmentVariable[]
  enabled: boolean
  capabilityFingerprint: string
  runtimeStatus: 'stopped' | 'starting' | 'ready' | 'degraded' | 'crashed'
  lastError?: string
  lastStartedAt?: string
  lastUsedAt?: string
  idleTimeoutSeconds: number
  requestTimeoutSeconds: number
  tools?: AgentMcpTool[]
  createdAt: string
  updatedAt: string
}

export type AgentAuthorization = {
  id: string
  sourceId: string
  sourceType: string
  capabilityName: string
  parameterScope: string
  decision: string
  mode: string
  fingerprint: string
  createdAt: string
  expiresAt?: string
}

export type AgentToolAudit = {
  id: string
  conversationId?: string
  sourceId: string
  capabilityName: string
  parameterSummary: string
  authorizationDecision: string
  riskClass: string
  startedAt: string
  durationMs: number
  resultStatus: string
  errorCode?: string
}

export type AgentExtensionSnapshot = {
  skills: AgentSkill[]
  mcpServers: AgentMcpServer[]
  authorizations: AgentAuthorization[]
  audits: AgentToolAudit[]
}

export type AgentMcpServerInput = {
  id?: string
  name: string
  description?: string
  command: string
  args: string[]
  env: AgentMcpEnvironmentVariable[]
  enabled: boolean
  idleTimeoutSeconds: number
  requestTimeoutSeconds: number
}

export type AgentMcpToolCallInput = {
  serverId: string
  toolName: string
  arguments: Record<string, unknown>
  conversationId?: string
  approved: boolean
  remember: boolean
  parameterScope?: string
  invocationId?: string
}

export type AgentMcpToolCallResult = {
  content?: unknown
  isError: boolean
  permissionRequired: boolean
  riskClass: string
  parameterSummary: string
}

type AgentExtensionBridge = {
  GetAgentExtensionSnapshot(): Promise<AgentExtensionSnapshot>
  SelectAndImportSkillDirectory(): Promise<AgentSkill[]>
  SelectAndImportSkillArchive(): Promise<AgentSkill[]>
  ReadAgentSkill(id: string): Promise<AgentSkillContent>
  ReadAgentSkillResource(id: string, path: string): Promise<AgentSkillResource>
  SetAgentSkillEnabled(id: string, enabled: boolean): Promise<void>
  SetAgentSkillScriptExecution(id: string, enabled: boolean): Promise<void>
  RemoveAgentSkill(id: string): Promise<void>
  SaveAgentMCPServer(input: AgentMcpServerInput): Promise<AgentMcpServer>
  ImportAgentMCPServers(data: string): Promise<AgentMcpServer[]>
  SetAgentMCPServerEnabled(id: string, enabled: boolean): Promise<void>
  RemoveAgentMCPServer(id: string): Promise<void>
  TestAgentMCPServer(id: string): Promise<AgentMcpServer>
  DiscoverAgentMCPServerTools(id: string): Promise<AgentMcpServer>
  CallAgentMCPTool(input: AgentMcpToolCallInput): Promise<AgentMcpToolCallResult>
  CancelAgentMCPTool(invocationId: string): Promise<boolean>
  RevokeAgentAuthorization(id: string): Promise<void>
}

function bridge(): AgentExtensionBridge {
  const runtime = window as unknown as {
    go?: { main?: { App?: AgentExtensionBridge } }
  }
  const api = runtime.go?.main?.App
  if (!api) throw new Error('Agent 扩展服务不可用')
  return api
}

function normalizeSnapshot(snapshot: AgentExtensionSnapshot | null | undefined): AgentExtensionSnapshot {
  return {
    skills: snapshot?.skills ?? [],
    mcpServers: (snapshot?.mcpServers ?? []).map(server => ({
      ...server,
      args: server.args ?? [],
      env: server.env ?? [],
      tools: server.tools ?? [],
    })),
    authorizations: snapshot?.authorizations ?? [],
    audits: snapshot?.audits ?? [],
  }
}

function normalizeSkillContent(content: AgentSkillContent): AgentSkillContent {
  return {
    ...content,
    readme: content.readme ?? '',
    references: content.references ?? [],
  }
}

export const agentExtensions = {
  snapshot: async () => normalizeSnapshot(await bridge().GetAgentExtensionSnapshot()),
  importSkillDirectory: () => bridge().SelectAndImportSkillDirectory(),
  importSkillArchive: () => bridge().SelectAndImportSkillArchive(),
  readSkill: async (id: string) => normalizeSkillContent(await bridge().ReadAgentSkill(id)),
  readSkillResource: (id: string, path = 'SKILL.md') => bridge().ReadAgentSkillResource(id, path),
  setSkillEnabled: (id: string, enabled: boolean) => bridge().SetAgentSkillEnabled(id, enabled),
  setSkillScriptExecution: (id: string, enabled: boolean) => bridge().SetAgentSkillScriptExecution(id, enabled),
  removeSkill: (id: string) => bridge().RemoveAgentSkill(id),
  saveMcpServer: (input: AgentMcpServerInput) => bridge().SaveAgentMCPServer(input),
  importMcpServers: (data: string) => bridge().ImportAgentMCPServers(data),
  setMcpServerEnabled: (id: string, enabled: boolean) => bridge().SetAgentMCPServerEnabled(id, enabled),
  removeMcpServer: (id: string) => bridge().RemoveAgentMCPServer(id),
  testMcpServer: (id: string) => bridge().TestAgentMCPServer(id),
  discoverMcpTools: (id: string) => bridge().DiscoverAgentMCPServerTools(id),
  callMcpTool: (input: AgentMcpToolCallInput) => bridge().CallAgentMCPTool(input),
  cancelMcpTool: (invocationId: string) => bridge().CancelAgentMCPTool(invocationId),
  revokeAuthorization: (id: string) => bridge().RevokeAgentAuthorization(id),
}

function tokenize(value: string): string[] {
  return value.toLocaleLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter(token => token.length > 1)
}

export function matchAgentSkills(prompt: string, skills: AgentSkill[] | null | undefined, maximum = 3): AgentSkill[] {
  const promptTokens = new Set(tokenize(prompt))
  return (skills ?? [])
    .filter(skill => skill.enabled && skill.validationStatus === 'valid')
    .map(skill => {
      const metadataTokens = tokenize(`${skill.name} ${skill.description}`)
      const score = metadataTokens.reduce((total, token) => total + (promptTokens.has(token) ? 1 : 0), 0)
      return { skill, score }
    })
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name))
    .slice(0, maximum)
    .map(candidate => candidate.skill)
}

export async function buildSkillSystemContext(prompt: string, disabledIds: Set<string>, selectedIds: Set<string> = new Set()): Promise<{
  matched: AgentSkill[]
  context: string
}> {
  const snapshot = await agentExtensions.snapshot()
  const automaticallyMatched = matchAgentSkills(prompt, snapshot.skills)
  const explicitlySelected = snapshot.skills.filter(skill => selectedIds.has(skill.id) && skill.enabled && skill.validationStatus === 'valid')
  const matched = [...new Map([...automaticallyMatched, ...explicitlySelected].map(skill => [skill.id, skill])).values()]
    .filter(skill => !disabledIds.has(skill.id))
  const context = matched.length > 0
    ? [
        '## Available Agent Skills',
        'Only metadata is included here. Call read_agent_skill with a listed skillId before following that Skill. Read a listed reference only when the instructions require it.',
        ...matched.map(skill => `- skillId: ${JSON.stringify(skill.id)}; name: ${JSON.stringify(skill.name)}; description: ${JSON.stringify(skill.description)}`),
      ].join('\n')
    : ''
  return { matched, context }
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function normalizeAgentToolSchema(value: unknown): Record<string, unknown> {
  const schema = jsonRecord(value)
  if (!schema) return { type: 'object', properties: {} }
  const properties = jsonRecord(schema.properties) ?? {}
  const normalized: Record<string, unknown> = {
    ...schema,
    type: 'object',
    properties,
  }
  delete normalized.$schema
  if (Array.isArray(schema.required)) {
    normalized.required = schema.required.filter((name): name is string => (
      typeof name === 'string' && Object.hasOwn(properties, name)
    ))
  } else {
    delete normalized.required
  }
  return normalized
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function buildAgentMcpToolName(serverId: string, toolName: string): string {
  const sanitize = (value: string) => value.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  const server = sanitize(serverId) || 'server'
  const tool = sanitize(toolName) || 'tool'
  const base = `mcp_${server}_${tool}`
  if (base.length <= 64) return base
  return `mcp_${server.slice(0, 16)}_${tool.slice(0, 24)}_${stableHash(`${serverId}::${toolName}`)}`.slice(0, 64)
}
