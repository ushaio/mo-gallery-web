# Desktop Agent 扩展能力 — 验证矩阵

| ID | 验收场景 | 预期结果 | 实现状态 | 自动化测试状态 | Windows 手工状态 | 证据/阻塞项 |
|---|---|---|---|
| V-01 | 导入有效 Skill 目录 | 生成快照、读取 frontmatter、展示 valid 和指纹 | 已实现 | 未验证（缺少有效目录导入单测） | 未验证 | `ImportSkill` 与设置页已接入；本次未补场景测试 |
| V-02 | 导入 zip 路径穿越包 | 拒绝导入，不写出管理目录边界 | 已实现 | 已运行：`go test ./...`；仅覆盖重复路径，路径穿越仍缺专测 | 未验证 | 归档路径/符号链接校验已存在 |
| V-03 | 缺少/非法 SKILL.md | 标记 invalid，不进入 Agent 能力列表 | 部分实现 | 未验证 | 未验证 | 当前直接拒绝导入，不持久化 `invalid`，与规格语义不一致 |
| V-04 | Skill 含 scripts | 可安装，但执行权限默认关闭 | 已实现 | 未验证（无 scripts 默认值场景测试） | 未验证 | 配置层默认 false；没有脚本执行器 |
| V-05 | 导入 MCP stdio JSON | 保存 command/args/env 引用并可测试连接 | 已实现 | 已运行 Go 基线；缺 JSON/真实连接场景测试 | 未验证 | Secret fake store 测试已运行；真实凭据未验证 |
| V-06 | 导入 HTTP/SSE 配置 | 明确提示首期不支持，不启动进程 | 已实现 | 未验证（缺对应单测） | 未验证 | `ImportMCPServers` 明确拒绝 HTTP/SSE |
| V-07 | 测试 MCP 连接 | 按需启动、初始化、列出工具、关闭 | 已实现 | 未验证（无最小 stdio Server 集成测试） | 未验证 | 代码包含 initialize/initialized/tools/list/stop |
| V-08 | MCP 空闲超时 | 进程退出且状态回到 stopped | 部分实现 | 未验证 | 未验证 | 成功调用/权限等待均安排 idle timer；无集成证据 |
| V-09 | MCP 首次调用 | 经过权限门；低风险可复用范围授权，高风险弹确认 | 部分实现 | 未验证 | 未验证 | 过期 grant 已补检查；仍为 `window.confirm`，无自动化权限测试 |
| V-10 | 高风险工具再次调用 | 默认仍逐次确认，不因 Server 启用而放行 | 已实现 | 未验证 | 未验证 | Go 权限分支与前端默认 `remember:false` 已接入 |
| V-11 | command/args/env 变化 | 能力指纹变化，旧 remembered grant 失效 | 部分实现 | 未验证 | 未验证 | 配置与已发现工具契约纳入指纹；缺专门指纹/授权测试 |
| V-12 | MCP 崩溃 | 自动重启一次；再次失败后 Agent 降级并可继续回答 | 部分实现 | 未验证 | 未验证 | `tools/call` 有一次重试；初始化失败/取消链路缺集成验证 |
| V-13 | Secret 保存 | 文件中只有 reference，值进入 Windows Credential Manager | 代码已实现，发布阻断 | 已运行 fake store 基线；未做 Windows API 实测 | 未验证 | ABI、完整读回/删除/不存在凭据均待验证 |
| V-14 | 审计记录 | 记录元数据/脱敏摘要/耗时/状态，不含密钥和完整内容 | 部分实现 | 已运行嵌套脱敏测试；拒绝/前置失败审计未覆盖 | 未验证 | 成功与 tools/call 失败有审计，授权拒绝等路径不完整 |
| V-15 | Agent 助手页自动匹配 | 只加载匹配 Skill，用户可会话级开关 | 部分实现 | `desktop/frontend npm run build`、AI typecheck 已通过；无场景测试 | 未验证 | 已增加轻量会话面板；工具发现仍依赖缓存的 `server.tools` |
| V-16 | 非 Windows 编译 | macOS/Linux 构建路径保留抽象，不引入平台编译错误 | 抽象已实现 | 已运行 Linux 交叉编译/测试编译检查；完整非 Windows测试未运行 | 不适用 | `credential_store_other.go` 保留非 Windows adapter |

## 2026-08-07 实施与验证状态

- **本次已运行并通过**：`cd desktop && gofmt -w agent_extensions/*.go && go test ./...`；`cd desktop/frontend && npm run build`；`cd packages/ai-agent && npm run typecheck && npm run test`。
- **本次已完成的代码修复**：过期 remembered grant 不再放行；权限等待中的 MCP runtime 安排 idle 回收；已发现工具契约参与能力指纹；AI MCP 调用带 conversation ID 并识别 `isError`；工具执行边界转发 abort signal；Assistant 增加轻量会话扩展面板和 Skill/MCP 会话开关。
- **仍未完成/未验证**：Windows Credential Manager 实测、真实 stdio MCP Server 联调、崩溃重启与空闲退出端到端场景、Wails 重新生成核对、Windows 发布构建。Assistant 的工具发现当前仍依赖设置页/历史测试缓存的 `server.tools`。
- **Linux 交叉检查**：`GOOS=linux GOARCH=amd64 go build ./agent_extensions` 与测试编译通过；直接在当前 Windows Go 环境运行 `GOOS=linux go test` 会尝试执行 Linux 二进制，未将其结果误记为测试通过。
