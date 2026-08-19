# Desktop Agent 扩展能力 — 需求访谈记录

- 日期：2026-08-07
- 状态：已收敛，可进入实施规划
- 关联技能：`grill-with-docs`

## 背景

Desktop 已有 AI 助手页、共享 `packages/ai-agent` 编排包，以及 Go 侧本地 AI HTTP 代理；但尚未具备可安装、可授权、可监管的 Skill 与 MCP 扩展能力。现有系统设置包含“模型配置”等标签，本需求将新增“Agent 扩展”一级标签。

## 已确认决策

1. **产品定位**：Skill/MCP 服务于 Desktop 内置 AI Agent，首期先接入 AI 助手页。
2. **Skill 来源**：支持本地目录和 `.skill`/`.zip` 压缩包；导入后复制到应用管理目录，形成版本快照。
3. **Skill 规范**：采用 `SKILL.md` 渐进披露约定，支持 frontmatter、Markdown 指令及 `references/`、`scripts/`、`assets/`。
4. **Skill 激活**：Agent 根据描述自动匹配，用户可在会话中手动开关或显式指定。
5. **MCP 传输**：首期仅支持 stdio；配置兼容通用 `mcpServers` JSON 的 `command`、`args`、`env` 形态，并补充本地权限字段。
6. **MCP 生命周期**：按需启动，空闲关闭；无响应/崩溃时自动重启一次，仍失败则降级为无工具回答。
7. **运行时边界**：Go 管理进程、文件、凭据和安全；TypeScript/共享 `ai-agent` 管理 Agent 编排与工具循环。
8. **密钥**：Token/API Key 等敏感环境变量写入系统凭据库，配置文件只保存引用，不保存明文。
9. **授权**：按来源 + 工具 + 参数范围记录；低风险读取可按范围记住，高风险写入、执行、删除和网络外发默认逐次确认。
10. **授权失效**：Skill 内容哈希或 MCP command/args/env 等能力指纹变化时，撤销相关长期授权。
11. **审计**：保留来源、工具、参数脱敏摘要、耗时、授权决定和结果状态，不保存完整敏感输入输出。
12. **平台**：Windows 完整实现（含 Windows Credential Manager）；macOS/Linux 首期要求可编译，凭据库与运行时留接口。

## 待明确但不阻塞首期

- Agent 自动匹配的具体排序算法与最大注入 Skill 数量。
- MCP 空闲关闭时长和单次调用超时的默认值。
- 系统设置中是否提供导出/导入整套扩展配置（不含密钥值）。
- 后续是否把能力接入故事/博客编辑和 Zine。
