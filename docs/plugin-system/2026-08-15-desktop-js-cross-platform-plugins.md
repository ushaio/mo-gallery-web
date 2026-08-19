# Desktop JS/TS 与跨平台插件支持开发计划

## 目标

在不破坏现有 Desktop 存储插件协议和数据边界的前提下，实现：

1. 插件作者可以使用 TypeScript/JavaScript 开发插件。
2. 同一份 JS/TS 插件代码可以在 Windows、macOS、Linux Desktop 上运行。
3. 现有 Go、Rust 等独立可执行文件插件继续可用。
4. 插件仍通过外部进程和 JSON-RPC over stdio 运行，不把任意 JS 直接加载进 Go/Wails 主进程。
5. 插件可以安全地访问配置、凭据和文件传输能力，但不能获得不受约束的 Desktop 内部对象、数据库或 renderer 权限。
6. 官方插件可以自动打包、签名、发布和升级，社区插件可以通过同一套 manifest 和 SDK 接入。

## 非目标

- 第一阶段不实现 Web 端或 Flutter 端直接运行 Desktop 插件。
- 不把 Desktop 所有能力暴露成任意脚本执行 API。
- 不允许插件注入任意 React/HTML 到主界面。
- 不强制所有插件使用 Node；Go/Rust/其他语言的外部插件仍是合法实现。
- 不在本计划中迁移 Web 端已有 storage provider。
- 不直接复刻 PicGo、Obsidian 或思源笔记的 in-process 插件模型。

## 当前基线

### 已有能力

- `desktop/storage_plugins/` 已有 `Manager`、manifest 解析、插件发现、安装、卸载和 source registry。
- `desktop/storage_plugins/manager.go` 会从已安装 manifest 解析 command，避免 renderer 自己传入任意 command/args。
- 插件使用外部进程和 JSON-RPC over stdio。
- 插件协议已有 `plugin.getManifest`、`plugin.health`、`source.validate`、`object.put`、`object.delete`、`object.getUrl` 等方法。
- 上传内容通过 transfer handle 传输，不把完整文件内容放进 JSON-RPC。
- 凭据通过 Desktop credential store 引用注入插件运行环境。
- `desktop/app.go` 和 `desktop/frontend/src/pages/SettingsPage.tsx` 已暴露插件和 source 管理入口。

### 当前限制

- manifest 的 `entry` 只有单一入口，不能按 `GOOS/GOARCH` 选择二进制。
- `entry` 需要指向可执行文件，不能直接运行 `main.js`。
- `InstallPlugin` 目前主要复制解包目录，签名 zip、信任根、撤销和升级回滚尚未完整实现。
- 没有 Node runtime 分发策略和 JS 插件生命周期适配器。
- 没有 TypeScript SDK、插件模板和 contract test harness。
- 现有插件目录和发布流水线还没有 Windows、macOS、Linux 的全矩阵验证。

## 总体架构

```text
Desktop Go Host
  |
  | Plugin Manager
  | - manifest/platform selection
  | - install/signature/update
  | - credentials/transfer handles
  | - process supervision
  v
Plugin Process
  |-- native executable plugin (Go/Rust/...)
  |-- Node runtime + main.js (JS/TS plugin)
  |
  `-- JSON-RPC 2.0 over stdin/stdout
```

JS/TS 插件和原生插件共享同一个 host contract。区别只在于 Plugin Manager 如何解析并启动入口：

- `type: executable`：直接启动平台可执行文件。
- `type: node`：启动随插件或 Desktop 分发的 Node runtime，再传入 JS 入口。

插件进程的 stdout 只能输出 JSON-RPC，诊断日志必须输出到 stderr 或由 host 提供日志方法。

## 关键设计决策

### 1. 使用 Node 外部进程作为第一版 JS runtime

第一版采用随 Desktop 分发的 Node runtime 或受信任的插件 runtime，而不是把 V8/QuickJS 嵌入 Go。

原因：

- 可以使用成熟的 TypeScript、npm、`fetch` 和 Node stream 生态。
- 不需要为 JS 插件重新设计一套非标准运行时 API。
- 外部进程保留崩溃隔离和超时终止能力。
- 后续可以替换 runtime，而不改变 JSON-RPC contract。

代价：

- Desktop 安装包会变大。
- Node runtime 需要按平台发布和签名。
- 原生 npm 依赖仍然需要平台构建，官方 SDK 第一阶段应限制为纯 JS 依赖。

### 2. 插件包声明运行类型和平台入口

建议将 manifest 从单一 `entry` 扩展为：

```json
{
  "id": "s3-compatible",
  "version": "1.0.0",
  "apiVersion": "1",
  "type": "node",
  "name": "S3 Compatible",
  "runtime": "node22",
  "entry": "dist/main.js",
  "platforms": ["windows-amd64", "darwin-amd64", "darwin-arm64", "linux-amd64", "linux-arm64"],
  "capabilities": ["plugin.health", "source.validate", "object.put", "object.getUrl"],
  "configSchema": {},
  "credentialSchema": {}
}
```

对需要平台二进制的插件，增加：

```json
{
  "type": "executable",
  "binaries": {
    "windows-amd64": "bin/windows-amd64/plugin.exe",
    "darwin-arm64": "bin/darwin-arm64/plugin",
    "linux-amd64": "bin/linux-amd64/plugin"
  }
}
```

JS 插件的 `entry` 是平台无关的，Node runtime 由 host 根据当前平台选择；原生插件使用 `binaries`。最终 DTO 应向前端返回已解析的 `command`、`args`、`type`、`runtime` 和可用平台，不把未校验的路径暴露为可执行配置。

### 3. SDK 只封装 host contract

新增 `packages/desktop-plugin-sdk/`，至少包含：

- `Plugin` 生命周期：`getManifest`、`health`、`validate`。
- Storage API：`put`、`get`、`stat`、`list`、`move`、`delete`、`getUrl`。
- Transfer API：通过 transfer ID 读取流，不暴露任意本地路径。
- 配置和 credential 引用读取。
- 结构化错误、请求 ID、超时取消和幂等键。
- stderr 日志适配器。
- Node 版本和 API 版本校验。

SDK 不提供：

- 任意 Wails binding。
- 任意 SQL/SQLite 访问。
- 任意 Desktop 配置目录写入。
- 任意 renderer DOM 注入。
- 未经能力声明的网络或删除操作。

插件作者使用 TypeScript，发布产物为 `dist/main.js` 和纯 JS 依赖。SDK 应提供 `createStoragePlugin()`、manifest 类型、请求/响应类型和本地 fake host。

## 实施阶段

### Phase 0：协议和兼容性冻结

目标：先把现有可执行插件行为固定下来，避免引入 Node 后修改业务语义。

任务：

- 审核 `desktop/storage_plugins/types.go`，补齐 `StoragePort` 中尚未暴露给 manager 的 `get/stat/list/move` 方法或明确延期原因。
- 定义 `pluginType`、`runtime`、`platformKey`、`binary` 和 manifest API 版本字段。
- 定义错误码：`invalid_manifest`、`unsupported_platform`、`runtime_missing`、`capability_missing`、`request_timeout`、`plugin_crashed`、`credential_unavailable`、`transfer_failed`。
- 明确 stdout/stderr、请求 ID、取消、超时、最大消息大小和日志脱敏规则。
- 为旧 manifest 保留兼容读取：没有 `type` 时按 `executable` 处理；没有 `binaries` 时按旧 `entry` 处理。
- 更新 `docs/plugin-system/desktop-storage-plugins.md`，增加 JS runtime、平台选择和向后兼容规则。

涉及文件：

- `desktop/storage_plugins/types.go`
- `desktop/storage_plugins/catalog.go`
- `desktop/storage_plugins/manager.go`
- `desktop/storage_plugins/runtime.go`
- `docs/plugin-system/desktop-storage-plugins.md`

验收：现有 fake/native plugin contract tests 在不修改 manifest 的情况下继续通过。

### Phase 1：平台和 runtime 抽象

目标：让 Plugin Manager 不再把“插件入口”等同于“Windows exe”。

任务：

- 新增 `platformKey()`，统一返回 `windows-amd64`、`darwin-arm64` 等值。
- 新增 `RuntimeResolver` 接口：

```go
type RuntimeResolver interface {
    Resolve(ctx context.Context, manifest Manifest, pluginDir string) (command string, args []string, env []string, err error)
}
```

- 实现 `ExecutableRuntimeResolver`，校验平台 binary、文件权限和路径逃逸。
- 实现 `NodeRuntimeResolver`，按策略查找 bundled Node，不允许 renderer 指定任意 node 路径。
- 统一处理 Windows `.exe`、macOS executable bit、Linux executable bit 和平台不支持错误。
- 禁止插件 manifest 的 entry 指向 manifest 目录外文件。
- 将 `command/args` 设为 host 生成字段，source registry 不接受 renderer 覆盖。
- 增加 runtime 缺失时的可诊断错误和设置页状态。

建议新增文件：

- `desktop/storage_plugins/platform.go`
- `desktop/storage_plugins/runtime_resolver.go`
- `desktop/storage_plugins/node_runtime.go`

验收：同一个 manager 可以发现并启动 fake executable plugin；Node resolver 可以在测试目录启动 fake node；错误信息明确指出缺失的平台或 runtime。

### Phase 2：Node/JS 插件 SDK

目标：让第三方可以不理解底层 JSON-RPC 细节就开发插件。

任务：

- 创建 `packages/desktop-plugin-sdk/package.json`、TypeScript config、构建和发布脚本。
- 定义 manifest、capability、request/response、ObjectInfo、TransferHandle 类型。
- 实现 JSON-RPC stdio transport，严格区分 stdout 协议输出和 stderr 日志。
- 实现 host request handler、插件 method registration 和生命周期管理。
- 实现大文件流读取 API，禁止 `fs.readFile` 作为 SDK 默认上传路径。
- 实现结构化错误和 AbortSignal 取消。
- 实现 `createStoragePlugin` 高阶 API。
- 提供 `create-plugin` 模板，生成：

```text
manifest.json
src/index.ts
src/plugin.ts
package.json
tsconfig.json
vitest.config.ts
```

- 提供本地 fake host 和 contract test helpers。
- 在 README 中说明插件没有任意 Desktop 权限，所有能力必须在 manifest 声明。

建议接口形态：

```ts
export interface StoragePlugin {
  manifest: PluginManifest
  validate(request: ValidateRequest): Promise<ValidateResult>
  health(request: HealthRequest): Promise<HealthResult>
  put(request: PutRequest): Promise<ObjectInfo>
  getUrl(request: UrlRequest): Promise<ObjectInfo>
}
```

验收：使用 SDK 编写的最小 S3 fake plugin 能被 Go manager 启动，并完成 health、validate、put、getUrl 及错误场景测试。

### Phase 3：Node runtime 分发

目标：用户安装 Desktop 后无需自行安装 Node 即可运行官方 JS 插件。

任务：

- 选择并记录 Node LTS 版本，优先使用官方可再分发构建。
- 为 Windows x64、macOS x64、macOS arm64、Linux x64、Linux arm64 准备 runtime 包。
- 明确 runtime 的目录布局，例如：

```text
resources/runtimes/node/windows-amd64/node.exe
resources/runtimes/node/darwin-arm64/node
resources/runtimes/node/linux-amd64/node
```

- 在 Go 侧通过 executable 所在目录或 Wails asset 目录解析 runtime。
- 在构建脚本中验证 Node 版本、SHA-256、可执行权限和签名。
- 禁止下载并执行未校验的 Node runtime。
- 对 Node 插件设置内存、消息大小、并发和空闲退出策略。
- 记录 runtime 版本到诊断信息，但不写入凭据或完整路径日志。
- 评估安装包体积；若过大，允许第二阶段改为按需下载已签名 runtime，但默认仍应内置官方 runtime。

涉及文件/配置：

- `desktop/build/`
- Wails 构建配置
- `.github/workflows/`
- `package.json` / workspace scripts
- `desktop/storage_plugins/node_runtime.go`

验收：在五类目标平台上，安装后的 Desktop 可在没有系统 Node 的环境中启动 JS fake plugin。

### Phase 4：跨平台插件打包和签名

目标：形成可发布、可升级、可回滚的插件包格式。

统一包格式：

```text
plugin-package.zip
  manifest.json
  signature.sig
  checksums.json
  icon.png
  dist/main.js                 # Node plugin
  bin/<platform>/plugin        # executable plugin，可选
```

任务：

- 定义 zip 内路径规范和大小限制。
- 禁止绝对路径、`..`、符号链接和重复文件名，防止 zip-slip。
- 对 manifest、入口文件和全部 payload 计算 hash 并签名。
- 定义官方信任根、密钥轮换、撤销列表和开发模式行为。
- 将 `InstallPlugin` 从“复制目录”扩展为“校验 zip -> 临时目录 -> 原子安装”。
- 安装失败时保留原版本，不覆盖当前可用插件。
- 升级前检查 source 是否兼容目标 API 和新插件能力。
- 卸载前检查 source 引用；已有行为保留并覆盖测试。
- 支持安装目录版本化：`storage-plugins/<id>/<version>/`，通过 current pointer 或 registry 选择活动版本。
- 增加回滚 API 和升级后的 health smoke test。

验收：损坏签名、过期签名、未知平台、zip-slip、符号链接、缺少入口和 API 不兼容包均被拒绝；升级失败可以恢复旧版本。

### Phase 5：Settings UI 与开发者体验

目标：用户能区分插件类型、平台兼容性和 runtime 状态。

任务：

- 在 `SettingsPage.tsx` 增加插件类型、支持平台、runtime 版本和签名状态。
- 区分“已安装插件”和“已配置存储来源”。
- 对 Node runtime 缺失、平台不支持、签名失败和插件崩溃显示可操作错误。
- 增加安装 zip、检查更新、升级、回滚、卸载和查看诊断日志入口。
- 配置表单继续由 manifest JSON Schema 渲染，不允许插件直接注入设置 UI。
- 提供官方/社区来源标识和来源 URL，但安装前仍由 host 完成签名校验。
- 增加“测试连接”按钮，复用 `TestDesktopStorageSource`。
- 继续沿用现有 i18n、master-detail 和设置持久化模式。

涉及文件：

- `desktop/frontend/src/pages/SettingsPage.tsx`
- `desktop/app.go`
- `desktop/frontend/wailsjs/go/models.ts`
- desktop 设置相关 i18n 文件

验收：用户可以发现插件类型、创建 source、测试连接、停用 source、升级插件并看到明确的平台/runtime 状态。

### Phase 6：官方插件和迁移

目标：用真实 provider 验证方案，而不是只依赖 fake plugin。

任务：

- 先实现纯 TypeScript fake storage plugin，覆盖全部 contract test。
- 将 S3-compatible/R2 作为第一个 Node/TS 官方插件，优先使用纯 JS 依赖。
- GitHub 插件可以先保留原生实现，再评估迁移到 TS SDK。
- 官方插件同时发布 Windows、macOS、Linux 的同一 JS 产物和签名 manifest。
- 验证大文件、断点/重试、checksum、公开 URL、临时 URL、删除能力和幂等键。
- 验证上传成功但 `/admin/photos/register` 失败时的补偿任务，不直接重复上传。
- 验证 Web 对 `storageRuntime = desktop-plugin` 的只读行为不发生回归。
- 为插件版本升级定义 source migration；不得静默改变已有 object key。

验收：S3/R2 官方 Node 插件在五类平台完成真实端到端上传和登记；已有 Web source 和旧 executable plugin 行为不变。

## 安全要求

- 插件包必须经过签名校验；开发模式需要显式开关，并在 UI 中持续提示。
- 插件只能访问 host 暴露的 API，不应把 Desktop 主进程环境或任意 Wails binding 传给 JS。
- token、secret、signed URL 不得出现在 JSON-RPC 日志、错误信息或前端 DTO 中。
- 第一版 Node 插件不允许任意 `child_process`、原生 addon 和动态下载代码作为官方依赖。
- 凭据优先通过一次性 host RPC 或受控 IPC 传递；若暂时使用环境变量，必须清晰记录风险并避免写入日志。
- 上传使用 transfer handle；不能把完整文件内容或不必要的绝对路径放入 JSON。
- 对单插件设置请求超时、最大 payload、并发上限、内存上限和重启次数。
- 删除、移动、覆盖必须由 capability 声明，并由业务层做明确确认和审计。
- 插件进程退出只影响当前 source，不得使 Desktop 主进程退出。
- 安装包和 runtime 都要验证平台、架构、哈希、签名和版本兼容性。

## 测试计划

### Go 单元测试

- manifest 旧格式兼容读取。
- `type: executable` 和 `type: node` 的 runtime resolver。
- platform key 计算和不支持平台错误。
- Windows `.exe`、Unix executable bit 和路径逃逸。
- Node runtime 缺失、版本不匹配和退出码处理。
- zip-slip、符号链接、重复文件和恶意 manifest。
- 签名校验、密钥轮换、撤销和升级回滚。
- plugin crash、timeout、cancel、重启和 idle cleanup。
- credential 脱敏、transfer handle 和幂等键。

### SDK 测试

- JSON-RPC 编码、请求 ID、错误响应和 stderr 分离。
- `AbortSignal` 取消和超时。
- 大文件流式上传，确保不整文件读入内存。
- capability 缺失时阻止调用。
- fake host contract tests。

### 端到端测试

- Windows x64：Node 插件和 `.exe` 插件。
- macOS x64/arm64：Node 插件和 Unix executable 插件。
- Linux x64/arm64：Node 插件和 Unix executable 插件。
- 没有系统 Node 的干净环境。
- 安装、升级、回滚、停用、卸载和 source 引用保护。
- S3/R2 上传原图和缩略图、登记失败补偿、临时 URL 刷新。
- Web 展示 Desktop plugin photo，以及 Web 端拒绝远程删除/移动/重上传。

### 项目基线命令

```bash
cd desktop && go test ./...
cd desktop/frontend && npm run build
pnpm run lint
pnpm run build:node
```

发布前额外执行：

```bash
pnpm --filter @mo-gallery/desktop-plugin-sdk test
pnpm --filter @mo-gallery/desktop-plugin-sdk build
```

每个平台至少需要一次真实构建或 CI 交叉构建检查；不能只在 Windows 上验证跨平台逻辑。

## 交付顺序和依赖

```text
Phase 0 协议冻结
  -> Phase 1 runtime/platform resolver
  -> Phase 2 TS SDK
  -> Phase 3 Node runtime 分发
  -> Phase 4 签名包和升级
  -> Phase 5 UI
  -> Phase 6 官方 S3/R2 插件
```

Phase 0 和 Phase 1 完成后即可继续发布旧 executable plugin。Phase 2 完成后可以由社区开发和测试 JS plugin，但在签名和 runtime 发布完成前不应作为正式生产插件渠道。Phase 4 完成后才开放正式社区安装入口。

## 风险与取舍

### Node runtime 体积

内置 Node 会增加安装包大小和构建复杂度。第一版优先保证离线可用和版本确定性；后续可增加按需下载，但必须使用签名和 hash 校验。

### npm 原生依赖

原生 addon 会重新引入平台构建问题。官方 SDK 第一阶段限制为纯 JS 依赖；需要原生能力的插件应使用 executable 类型或单独提供平台 binary。

### 插件权限

Node 插件不是天然沙箱。外部进程只提供崩溃隔离，不等同于 OS sandbox。没有完成权限模型和签名之前，不应默认信任任意社区插件。

### 运行时版本

Node API、SDK API 和 storage plugin API 必须分开版本化。manifest 的 `apiVersion` 只表示 host contract，不能用来隐含 Node 版本兼容性。

### UI 插件需求

本计划只解决 JS/TS 存储插件。若未来需要 Obsidian/思源式面板和命令扩展，应另立 ADR，定义受控 UI Plugin API，不要把 storage plugin 的权限直接扩大到 UI 层。

## 最终验收标准

- 现有 executable plugin 在 Windows 上继续工作。
- Node 未安装的干净机器可以运行官方 JS plugin。
- 同一份 JS plugin package 可在 Windows、macOS、Linux 上运行。
- 至少一个 TypeScript S3/R2 plugin 完成真实上传、缩略图、登记和错误补偿。
- 插件安装包经过签名、平台和 API 版本校验。
- 插件崩溃、超时、凭据错误和 runtime 缺失不会拖垮 Desktop 主进程。
- Web/Desktop photo storage metadata 兼容现有 `storageRuntime`、`storagePluginId` 和 `storageSourceId` 语义。
- `go test ./...`、Desktop frontend build、lint 和生产构建全部通过。
