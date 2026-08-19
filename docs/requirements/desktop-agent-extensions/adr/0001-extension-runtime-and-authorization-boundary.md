# ADR-0001：Desktop Agent 扩展运行时与授权边界

- 状态：已接受
- 日期：2026-08-07
- 决策者：产品 + Desktop 开发
- 关联技能：`grill-with-docs`

## 背景

Desktop 需要让内置 AI Agent 使用可安装 Skill 与 MCP 工具。Wails WebView 适合承载现有 TypeScript Agent UI 和共享编排，但不应直接拥有子进程、密钥或文件系统权限。Skill/MCP 又可能执行脚本、读取本地文件、写入数据或向网络发送内容，必须把发现、授权和运行时监管明确分层。

## 决策

采用 **Go supervisor + TypeScript Agent runtime** 的混合边界：

- Go 负责 Skill 快照安装与校验、MCP stdio 子进程、系统凭据库、权限门、审计和跨平台接口。
- TypeScript/`packages/ai-agent` 负责元数据匹配、渐进披露、会话级选择和模型工具循环。
- 前端通过 Wails bindings 请求 Go 执行，禁止 WebView 直接 spawn 或读取 secret。
- Skill 采用 `SKILL.md`；导入目录或压缩包后复制为应用管理目录中的快照。
- MCP 配置兼容通用 `mcpServers` JSON，但首期仅接受 stdio。
- 授权以来源 + 工具 + 参数范围为粒度；高风险调用默认逐次确认。能力指纹变化即撤销长期授权。
- MCP 按需启动、空闲关闭；失败只自动重启一次，然后从当前 Agent 任务中降级。

## 备选方案

| 方案 | 结论 | 原因 |
|---|---|---|
| 全部放 Go | 否决 | Agent 编排与共享包边界被复制，WebView 只剩薄 UI，迁移成本高。 |
| 全部放前端 | 否决 | 子进程、凭据和本地文件安全边界不可接受。 |
| MCP Server 全部常驻 | 否决 | 资源占用高，且不利于最小权限和异常回收。 |
| 扩展启用即全放行 | 否决 | 无法区分读取与副作用，风险过高。 |
| 配置文件保存明文密钥 | 否决 | 备份、日志和同步会扩大 secret 泄露面。 |

## 后果

### 正向

- 现有 `packages/ai-agent` 可以复用能力与工具循环；Go 侧集中处理高风险边界。
- Windows 可提供真实凭据保护，后续平台只需替换 credential adapter。
- 能力指纹和参数范围让长期授权可审计、可撤销、可随升级失效。

### 代价

- 需要新增 Go/TS bridge contract、进程状态机、授权存储和审计存储。
- stdio 协议、超时、重启和清理需要集成测试。
- 需要在设置页与 AI 助手页维护两套但一致的扩展状态视图。

## 实施约束

1. 不覆盖用户当前工作树的未提交 SettingsPage 改动；实现时必须以当前源码为准合并。
2. 先完成读取/列举/权限，再接入写入与执行能力。
3. 所有 secret 处理必须经过 Go credential adapter；不得进入 TypeScript 日志或持久化消息。
4. 首期发布门槛以 Windows 完整验收 + macOS/Linux 可编译为准。
