# Desktop Agent 扩展能力 — 领域模型

## 边界上下文

```text
┌──────────────────── Desktop Agent Extension Context ────────────────────┐
│  Skill Catalog     MCP Catalog       Authorization       Audit           │
│       │                 │                  │               │              │
│       └──────────────┬──┴──────────────────┴───────────────┘              │
│                      ▼                                                   │
│              Agent Capability Resolver                                   │
└──────────────────────┬───────────────────────────────────────────────────┘
                       │ tool/capability contract
                       ▼
                 packages/ai-agent (TS)
                       │ Wails/local bridge
                       ▼
                 Go Runtime Supervisor
                 ├─ Skill file/material loader
                 ├─ MCP stdio process manager
                 ├─ Credential adapter
                 └─ Permission gate + audit writer
```

## 核心实体

### Skill

- `id`：稳定标识，来源目录名或 manifest 标识。
- `name`、`description`：用于 Agent 自动匹配。
- `version`：导入快照版本。
- `sourceType`：`directory | archive`。
- `installPath`：应用管理目录中的快照路径。
- `contentHash`：Skill 内容/脚本/引用文件的能力指纹。
- `enabled`：是否可被匹配。
- `scriptExecutionEnabled`：是否允许执行包内脚本，默认 false。
- `validationStatus`：`valid | invalid | incompatible`。

### MCP Server

- `id`、`name`、`description`。
- `command`、`args`：stdio 启动命令。
- `envRefs`：环境变量名到系统凭据引用的映射；普通非敏感值可保存于配置。
- `enabled`：是否允许连接。
- `capabilityFingerprint`：由配置与声明能力计算。
- `runtimeStatus`：`stopped | starting | ready | degraded | crashed`。
- `lastError`、`lastStartedAt`、`lastUsedAt`。
- `idleTimeout`、`requestTimeout`：运行时策略。

### Capability

统一描述 Skill 提供的提示/上下文能力与 MCP 暴露的工具能力：

- `sourceId`、`sourceType`。
- `kind`：`instruction | resource | tool`。
- `name`、`description`、`inputSchema`。
- `riskClass`：`read | write | execute | delete | network`。
- `scope`：参数匹配所需的最小范围约束。

### Authorization Grant

- `sourceId`、`capabilityName`。
- `parameterScope`：允许的目录、资源 ID、域名或参数谓词。
- `decision`：`allow | deny`。
- `mode`：`session | remembered`。
- `fingerprint`：授权建立时的能力指纹。
- `expiresAt`（可选）。

### Tool Invocation Audit

- `invocationId`、`conversationId`。
- `sourceId`、`capabilityName`。
- `parameterSummary`：脱敏摘要。
- `authorizationDecision`、`riskClass`。
- `startedAt`、`durationMs`、`resultStatus`。
- `errorCode`（可选）。

## 关键不变量

1. 未通过校验、未启用或无有效授权的能力不能进入 Agent 工具列表。
2. 高风险能力不能仅凭 Skill/MCP 总体启用状态获得永久放行。
3. 能力指纹变化后，旧的 remembered 授权不可复用。
4. MCP Server 进程由 Go supervisor 独占管理，前端不得直接 spawn。
5. 审计只保存脱敏摘要，不保存 API Key、完整文件内容或完整模型工具输出。
6. MCP 失败最多自动重启一次；二次失败后当前 Agent 任务降级，不循环重试。
