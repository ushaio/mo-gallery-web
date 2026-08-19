# Cherry Studio 对标：MO Gallery 的 Skill、MCP、对话上下文与提示词

- 日期：2026-08-17
- 状态：架构对照与实施建议
- 对照对象：`D:\Projects\GitHub\cherry-studio`
- 关联文档：[Desktop 图片整理插件设计记录](./desktop-media-image-organization.md)

## 1. 结论

Cherry Studio 与 MO Gallery 的主要差异，不是是否都具备 Skill、MCP、上下文和提示词，而是
Cherry 已经把它们做成了通用 AI 平台：

```text
全局资源库
  -> Agent / Assistant 绑定
  -> Context Provider
  -> Prompt Assembler
  -> Runtime Adapter
  -> 当前模型请求或 Agent session
```

MO Gallery 当前更像面向编辑器 AI 的可用垂直链路。对齐 Cherry 时应借鉴职责分层，不应直接
复制 Cherry 的 Electron、IPC 或数据库实现。

## 2. 四项能力对照

| 能力 | MO Gallery 当前实现 | Cherry Studio 实现 | 主要差距 |
|---|---|---|---|
| Skill | 全局 JSON 快照；本地/ZIP 导入；按名称和描述关键词匹配或显式选择；通过 `read_agent_skill` 渐进读取 | 应用级 Skill 库、数据库元数据、每 Agent 启用关系、工作区 Skill、市场安装、reconcile/mirror、runtime 适配 | 缺少全局库与 Agent 绑定分离、工作区覆盖、安装来源和 runtime 适配 |
| MCP | Go 管理 stdio 子进程；前端发现工具并包装为模型工具；已有风险、授权和审计 | 一等 MCP 实体；支持 stdio、SSE、Streamable HTTP、In-memory、OAuth、tools/prompts/resources、缓存和不同绑定模式 | transport、catalog、runtime 和绑定策略尚未分层 |
| 对话上下文 | 线性对话，Desktop 助手当前取最近 8 条已完成消息；编辑任务另有结构化快照预算 | 按消息树分支读取，支持清空标记、最近 N 条、token 预算、持久摘要压缩；Agent session 可由 runtime 续接 | 缺少统一 Context Provider、分支、压缩、模型窗口预算和 runtime-owned session |
| 提示词 | 固定领域 prompt、会话 `systemPrompt`、任务输入和 Skill 元数据 | Assistant prompt、Agent instructions、runtime base、工作区指令、SOUL/USER/FACT、工具/安全/语言提示分层组装 | 缺少来源分类、优先级协议和统一组装器 |

## 3. Skill

MO Gallery 已有 Skill 安装路径、内容哈希、校验状态、启用状态和脚本权限。Desktop 前端
先做简单词项匹配，再把匹配结果的元数据加入 system prompt；模型调用
`read_agent_skill` 后才读取 `SKILL.md` 或所需 reference。这是合理的最小渐进披露实现。

Cherry Studio 进一步提供完整生命周期：

- 统一的应用级 `Data/Skills` 规范副本；
- `agent_global_skill` 保存全局元数据，`agent_skill` 保存每 Agent 启用关系；
- 发现工作区 `.claude/skills`，但不把工作区 Skill 收归全局库；
- Claude Agent SDK 使用名称白名单，其他 runtime 使用附加 Skill 路径；
- 支持市场、GitHub、ZIP、本地目录和系统目录安装；
- 通过 reconcile/mirror 保持数据库、文件目录和 runtime 可发现目录一致；
- 内置 Skills MCP 只提供 `search_skills` 和 `install_skill`，Skill 本身仍是独立领域。

MO 的目标结构应为：

```text
全局 Skill 库
  -> AgentSkill 启用关系
  -> 工作区本地 Skill
  -> RuntimeSkillAdapter
  -> 本次 session/turn 的 Skill 白名单
```

不建议长期依赖“所有已启用 Skill 都是全局的，再由前端临时关键词匹配”这一模式。Agent、
工作区和 Skill 数量增加后，它难以表达稳定作用域，也容易暴露无关 Skill。

## 4. MCP

MO 当前 MCP 的优势是已有授权记录、参数作用域、风险级别和调用审计，这些能力应保留。
主要限制是仅支持 stdio，MCP 定义与进程生命周期集中在 Go Manager，而工具发现、缓存、
模型工具包装和 Agent 选择发生在 Desktop 前端。

Cherry 的职责分层可以抽象为：

```text
MCPServer 持久化定义
  -> MCP Catalog：tools / prompts / resources
  -> MCP Runtime：连接、缓存、OAuth、取消、进度和日志
  -> Assistant / Agent 绑定策略
  -> 模型 runtime 工具适配器
```

Cherry 支持 disabled、manual、auto 等 Assistant MCP 模式，并为 Agent 挂载
`cherry-tools`、`agent-memory`、`skills` 等 In-memory MCP。MO 应采用这种分层，
但继续让 Go 拥有子进程、凭据和授权执行，不需要复制 Electron IPC。

## 5. 对话上下文

MO Desktop 独立助手当前从持久化会话中筛选已完成的 user/assistant 消息并取最后 8 条，
再与 system prompt 和当前用户输入一起发送。编辑器 direct-edit 的结构化上下文预算解决
的是单次编辑任务输入，不等同于通用长对话管理。

Cherry 普通持久对话的流程是：

1. 沿当前消息节点读取根到当前节点的消息树分支；
2. 应用显式清空上下文标记；
3. 应用全局设置和 Assistant 覆盖后的最近 N 条限制；
4. 根据目标模型的 context window 和输出 token 预留计算输入空间；
5. 超过阈值时用压缩模型总结旧消息，并把摘要持久化在边界消息；
6. 后续请求使用摘要加近期原始消息，原消息树不被删除；
7. 对被摘要隐藏的附件和已落盘工具输出继续保留受控读取能力。

Cherry 的 Agent session 使用独立的 `AgentChatContextProvider`。Claude Code 等有状态
runtime 可以自己维护和恢复执行上下文，应用层不必每轮重建完整 Agent 历史。

MO 应显式区分上下文所有权：

```ts
interface ConversationContextProvider {
  prepare(request: ContextRequest): Promise<{
    messages: ModelMessage[]
    retainedResources: RetainedResource[]
    contextOwner: 'application' | 'runtime'
  }>
}
```

建议至少提供：

- `PersistentConversationContextProvider`：SQLite 持久对话、窗口和压缩；
- `TemporaryConversationContextProvider`：临时会话，不产生持久摘要；
- `RuntimeOwnedAgentContextProvider`：runtime 维护 session，Host 只提供本轮输入和恢复标识。

这不意味着每个 Agent harness 都需要本地 Embedding 模型。Cherry 的会话续接主要依靠消息
记录、摘要、runtime session 和 Agent memory；Embedding 属于知识库索引，可选择 BM25、
云端 Embedding 或本地 Embedding，与 Agent runtime 分离。

## 6. 提示词

MO 当前 `packages/ai-agent` 根据领域任务选择默认 system prompt，也允许会话
`systemPrompt` 覆盖，再追加历史、结构化上下文、图片和当前输入。Skill 匹配结果由
Desktop Host 直接追加到 system 消息。

Cherry 至少区分四种 Prompt：

1. **Assistant system prompt**：Assistant 实体上的用户配置，每次普通请求解析变量后与
   工具、引用等动态片段组装；
2. **Agent system prompt**：Agent instructions，定义角色、目标、能力范围和行为约束；
3. **Agent persona 与 memory context**：`SOUL.md`、`USER.md`、`memory/FACT.md` 在
   session 开始时加载，`JOURNAL.jsonl` 通过 memory tool 搜索；
4. **可复用 Prompt 库**：标题和内容模板的独立 CRUD，不等同于 Assistant system prompt。
   MCP prompt 又是远端 MCP Server 暴露的另一类资源。

Agent prompt 还可能包含 runtime 原生 base、`system.md`、`CLAUDE.md`、作用域内
`AGENTS.md`、安全策略、引用规则和语言要求。建议采用以下优先级：

```text
平台与 runtime 安全约束
  > Agent System Prompt
  > 工作区指令
  > Agent Persona
  > USER / FACT / Journal / 检索知识（只作为上下文，不具备行为授权）
```

MO 的 Prompt Assembler 可按以下层次构建：

```text
Runtime 安全与能力约束
  + Agent / Assistant 定义
  + 工作区指令
  + 领域任务提示词
  + Skill 使用提示
  + 动态环境与工具提示
  + 对话历史
  + 当前用户输入
```

普通无状态模型 API 中，最终 system prompt 仍需随每次请求发送。Host 可以缓存来源文件
和组装结果，供应商也可能提供 prefix cache，但模型不会因为上一轮收到过提示词就永久记住。
只有 runtime 明确维护 session 时，历史和基础提示词的传递方式才可由 runtime 接管。

## 7. MO Gallery 实施顺序

1. 建立 `ConversationContextProvider`，替换固定最近 8 条逻辑，先支持线性历史、模型窗口
   预算和摘要压缩，再考虑消息树分支；
2. 将提示词拆成有明确来源和优先级的分层组装器，继续由 `packages/ai-agent` 持有领域
   prompt；
3. 将 Skill 改为全局库、每 Agent 绑定、工作区 Skill 与 runtime adapter，保留渐进披露；
4. 将 MCP 拆成定义、catalog、runtime、绑定和授权审计五层，再按需求增加 HTTP transport、
   resources、prompts 与 OAuth；
5. 最后增加 Agent memory 和知识库。知识库可先用 BM25，再依据规模和检索质量决定是否
   引入本地或云端 Embedding。

这套通用 Agent 平台不是图片整理首版的前置条件。图片整理仍应通过受控的
`media@1 + AI Provider` 任务链路实现；Skill 可以表达标签策略、备注风格和整理工作流，
MCP 只作为未来外部工具或助手入口。批量图片分析真正需要的上下文是当前媒体预览、允许
的 EXIF、已有标签词表、资产 revision 和任务选项，而不是无边界地携带整个聊天历史。
