# Desktop Agent 扩展能力 — Glossary

| 术语 | 英文 | 定义 |
|---|---|---|
| Agent 扩展 | Agent Extension | 可向 Desktop AI Agent 提供指令、资源或工具的 Skill/MCP 能力集合。 |
| Skill | Skill | 以 `SKILL.md` 为入口的渐进披露能力包，可包含指令、引用资料、脚本和静态资源。 |
| 渐进披露 | Progressive Disclosure | 先向 Agent 提供名称/描述等轻量元数据，只有匹配任务时才加载完整指令或引用资料。 |
| MCP Server | MCP Server | 通过 Model Context Protocol 暴露工具/资源的服务进程；本期仅支持 stdio。 |
| stdio | stdio transport | Desktop 通过子进程 stdin/stdout 与 MCP Server 通讯的传输方式。 |
| 能力 | Capability | Skill 指令/资源或 MCP 工具的统一可授权描述。 |
| 参数范围 | Parameter Scope | 授权允许的最小参数边界，如目录、资源 ID、域名或谓词。 |
| 能力指纹 | Capability Fingerprint | Skill 内容或 MCP 配置/声明能力的哈希；变化会使长期授权失效。 |
| 权限门 | Permission Gate | 在工具调用前校验启用状态、参数范围、风险等级和用户授权的安全组件。 |
| 高风险能力 | High-risk Capability | 写入、执行、删除或向外部网络发送数据的能力。默认逐次确认。 |
| 记住授权 | Remembered Grant | 按来源、工具、参数范围和能力指纹持久化的授权决定。 |
| 降级 | Degradation | MCP 失败后移除工具能力，继续提供不依赖工具的 Agent 回答。 |
| 扩展快照 | Extension Snapshot | 导入目录/压缩包复制到应用管理目录后的不可变版本副本。 |
| 系统凭据库 | OS Credential Store | Windows Credential Manager；其他平台对应平台安全凭据服务。 |
| 参数摘要 | Parameter Summary | 脱敏后的调用参数摘要，用于审计和排障，不等同于完整参数。 |
