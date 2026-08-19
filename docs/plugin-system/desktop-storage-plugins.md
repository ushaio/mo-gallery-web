# ADR-0008: 桌面端存储源插件化

- 状态：已被 ADR-0009 取代（实现保留为系统插件存储能力域的迁移基线）
- 日期：2026-08-15
- 决策者：产品 + 桌面端开发
- 关联模块：`desktop/storage/`、`desktop/services/upload.go`、`desktop/agent_extensions/`、`hono/photos.ts`、`prisma/schema.prisma`

> 2026-08-16 更新：插件的产品定位已从“存储插件”提升为 Desktop 系统插件。
> 本 ADR 保留最初的存储能力设计、数据迁移和实施历史；新的核心边界、能力域、
> 权限模型与分阶段策略以 `docs/plugin-system/desktop-system-plugins.md` 为准。

## 背景

桌面端需要支持 GitHub、Cloudflare R2 以及未来更多存储系统，同时不能因为新增存储系统而重新编译桌面主程序。

当前代码存在两个不同的存储边界：

- `desktop/storage/` 中有旧的 `local`、`s3`、`github` provider 和编译期 `switch`，但它目前没有接入桌面上传主链路。
- 桌面端 `UploadService` 当前将文件通过 `ProxyClient` 发送到 `/admin/photos`；实际上传、缩略图生成、删除、下载和移动由 Web/Hono 侧的 `server/lib/storage/` 执行。
- Web 端已有 `/admin/photos/register`，可以把已经上传到外部对象存储的文件登记为 `Photo`，不必再次上传原文件。
- `desktop/local_library/` 是本地照片索引和文件所有权系统，不属于本 ADR 的远程对象存储插件范围。

本 ADR 只解决“Desktop 独立运行外部存储插件并上传到远程对象存储”的问题。Web 端继续使用现有服务端 provider；本 ADR 不引入独立 Node Worker，也不把 Web provider 迁移到 Desktop 插件。

## 决策

采用“Web 原有链路 + Desktop 插件链路”的双轨架构：

```text
Web 上传：
  Web UI -> Hono -> server storage provider -> Photo

Desktop 插件上传：
  Desktop UploadQueue -> Plugin Manager
                       -> GitHub plugin / S3-compatible plugin(R2)
                       -> /admin/photos/register -> Photo
```

Desktop 插件使用外部进程和 JSON-RPC over stdio。Desktop 主进程负责插件生命周期、统一端口、凭据引用、传输、任务、重试和 Wails API；插件负责具体服务的认证和对象操作。

第一版不允许插件注入 React/HTML UI。配置页面由 Desktop 根据插件 manifest 的 JSON Schema 渲染。已有 `desktop/agent_extensions/` 中的进程管理、stdio、凭据和审计模式可以复用，但存储插件使用独立的存储协议，不直接复用 MCP 工具协议。

## 运行时和数据所有权

- `storageRuntime = web` 的来源继续由 Web/Hono 处理，现有 Local、GitHub、S3/R2 行为保持不变。
- `storageRuntime = desktop-plugin` 的来源只由 Desktop 插件处理。Desktop 保存插件配置和系统凭据引用；服务端不保存 Desktop Credential Manager/Keychain/Secret Service 的实际凭据。
- Desktop 插件来源使用稳定 UUID。服务端的 `storageSourceId` 可以保存该 UUID，但不能假设它一定对应服务端 `StorageSource` 行。
- GitHub 和 S3-compatible（包括 Cloudflare R2）作为第一批插件。Google Drive 暂不纳入实施阶段。
- Web 可以读取具有公开 URL 的 Desktop 插件照片，但默认不能对这类对象执行远程删除、移动、重上传或生成缩略图。需要这些操作时，必须从 Desktop 发起，或在未来另行设计 Desktop 在线代理。

## 核心抽象

业务服务只依赖统一端口，不依赖具体插件名称：

```go
type StoragePort interface {
    Validate(ctx context.Context, sourceID string) error
    Health(ctx context.Context, sourceID string) HealthResult
    Put(ctx context.Context, req PutRequest) (ObjectInfo, error)
    Get(ctx context.Context, req GetRequest) (TransferHandle, error)
    Stat(ctx context.Context, sourceID, key string) (ObjectInfo, error)
    List(ctx context.Context, req ListRequest) (ListResult, error)
    Move(ctx context.Context, req MoveRequest) (ObjectInfo, error)
    Delete(ctx context.Context, req DeleteRequest) error
    GetURL(ctx context.Context, req URLRequest) (URLInfo, error)
}
```

`ObjectInfo` 至少包含 `key`、`url`、`urlType`、`size`、`contentType`、`checksum`、`version` 和可选的 `expiresAt`。原图和缩略图是两个明确的 rendition，不能只依靠文件名猜测。

插件 manifest 声明能力，例如：

```text
object.put, object.get, object.delete, object.stat, object.list, object.move
resumable.upload, checksum, public-url, signed-url, oauth
```

插件不把文件内容编码进 JSON。Host 为每次传输创建带随机 ID 的 transfer handle。插件通过 Host 提供的流式 transfer API 读取内容，或使用独立的本地 pipe；不允许把完整文件路径或完整文件内容直接放进 JSON-RPC 请求。

所有请求必须支持超时、取消、请求 ID、幂等键和结构化错误码。非幂等操作不能由核心无条件重试。

## Desktop 插件上传流程

1. Desktop 根据来源的 `storageRuntime` 选择现有 Web 上传路径或插件路径。
2. 插件路径在 Desktop 本地完成文件校验、SHA-256、EXIF 提取、压缩和缩略图生成。Web 服务端不会再看到原文件内容。
3. Desktop 先调用现有重复检查 API；命中重复时不上传对象。
4. Plugin Manager 调用 `source.validate`，然后分别上传原图和缩略图，并使用 `fileHash + sourceID + targetKey` 作为幂等依据。
5. 插件返回原图和缩略图的对象引用。
6. Desktop 调用现有 `/admin/photos/register`，提交标题、分类、尺寸、hash、EXIF、颜色、`storageRuntime`、`storagePluginId`、`storageSourceId`、`storageKey`、URL 和缩略图引用。
7. 登记成功后，Desktop 继续执行现有的相册、故事关联和本地图库云端关联逻辑。
8. 对象上传成功但 Photo 登记失败时，Desktop 保存待登记任务并重试；不能直接重新上传。确认登记不可恢复后，才清理对象并记录审计日志。

## 插件包和运行时

插件以带签名的 zip 分发：

```text
manifest.json
checksums.json
signature.sig
icon.png
dist/main.js                 # type: node，可跨五个平台复用
bin/<platform>-<arch>/plugin # type: executable，可选
```

Node 插件使用 Desktop 随包提供的 Node 22 runtime，不要求用户安装
Node，也不允许 manifest 或 renderer 指定任意 Node 路径。runtime 的固定
源文件布局是：

```text
desktop/storage_plugins/runtime_assets/windows-amd64/node.exe
desktop/storage_plugins/runtime_assets/darwin-amd64/node
desktop/storage_plugins/runtime_assets/darwin-arm64/node
desktop/storage_plugins/runtime_assets/linux-amd64/node
desktop/storage_plugins/runtime_assets/linux-arm64/node
desktop/storage_plugins/runtime_assets/runtime-manifest.json
```

发布构建通过 `go:embed` 将上述目录编译进 Desktop，再由 host 首次运行时
物化到配置目录并校验。当前 host runtime 版本为 `22.14.0`。发布流水线必须
在打包前校验 Node 版本、SHA-256、Unix executable bit 和签名；host 不会下载
并执行未校验的 runtime。生产构建不会回退到系统 Node。Wails `dev` 构建已显式
允许安装未签名开发目录，因此在签名 runtime 未准备时可由 host 从自身 PATH
选择 Node；该回退仍要求可执行文件报告 Node 22，且路径不接受 manifest 或
renderer 输入。

manifest 至少包含 `id`、`version`、`apiVersion`、`type`、`runtime`、`entry`
（Node）或 `binaries`（原生）、平台列表、能力列表和 `configSchema`。
没有 `type` 的旧 manifest 仍按 `executable` 读取，没有 `binaries` 时继续使用旧
`entry`。Plugin Manager 负责安装、签名校验、启停、版本兼容、按需启动、超时、
崩溃恢复、日志、卸载和版本回滚。安装版本位于
`storage-plugins/<id>/<version>/`，`current` 指针决定活动版本；回滚只切换已校验
的版本，不覆盖源对象 key。

签名校验必须定义信任根、签名算法、manifest 哈希绑定、密钥轮换、撤销和 zip-slip/符号链接防护。外部进程默认提供崩溃隔离，不等同于完整操作系统沙箱；在没有 OS 级沙箱前，插件应被视为用户明确安装的受信任代码。

JSON-RPC 初始方法：

```text
plugin.getManifest
plugin.health
source.validate
source.authorize
object.put
object.get
object.delete
object.stat
object.list
object.move
object.getUrl
```

## 存储源模型

Web 端现有 `StorageSource` 继续服务于 `web` 来源。Desktop 插件来源先保存在 Desktop 本地配置或 SQLite 中：

```text
id
name
pluginId
pluginVersion
config (非敏感 JSON)
credentialRef (本机凭据库引用)
enabled
status
lastError
createdAt / updatedAt
```

`credentialRef` 只在 Desktop 本地有意义，不写入服务端数据库，也不通过命令行参数传递。GitHub token、R2 Access Key、Secret Key 和 OAuth token 均由 Desktop 凭据适配器提供给插件。

## Photo 数据模型和存量迁移

现有 `Photo` 的 `url`、`thumbnailUrl`、`storageProvider`、`storageSourceId`、`storageKey` 和 `fileHash` 可以继续兼容旧数据。建议增加：

```prisma
storageRuntime      String    @default("web") // web | desktop-plugin
storagePluginId     String?
thumbnailStorageKey String?
storageUrlType      String    @default("public")
storageUrlExpiresAt DateTime?
```

同时增加 `storageRuntime + storageSourceId` 的查询索引。`storageProvider` 保留兼容读取，不再用它判断插件是否运行在 Web 还是 Desktop。

存量迁移规则：

1. 迁移前备份数据库，并统计 `Photo` 按 `storageProvider`、`storageSourceId`、`storageKey` 的数量。
2. 新增字段允许旧版本客户端读取；新增字段默认使旧照片保持 `storageRuntime = "web"`。
3. 所有已有照片回填为 `storageRuntime = "web"`、`storagePluginId = null`；不改写现有 `storageProvider`、URL、storageKey、fileHash 和图片文件。
4. 现有服务端 `StorageSource` 全部视为 Web 来源，继续使用原有加密凭据和 API。不会把 `StorageSource` 的密钥自动迁移到 Desktop 本地凭据库。
5. 旧照片的 `thumbnailStorageKey` 保持为空，Web 端继续使用现有缩略图 key 推导逻辑。只有新登记的 Desktop 插件照片写入明确的缩略图 key。
6. 不根据 `originFlag = desktop` 自动把历史照片改成 Desktop 插件照片；只有显式选择插件来源并重新登记时才使用 `storageRuntime = "desktop-plugin"`。
7. `/admin/photos/register` 新增字段采用向后兼容读取：旧客户端不传这些字段时仍按 Web 来源处理；新客户端必须传入插件运行时和插件 ID，并由服务端校验来源格式。
8. Web 删除、移动、重上传、缩略图生成和存储扫描必须先判断 `storageRuntime`。Desktop 插件照片默认返回“不支持 Web 端远程操作”，避免错误调用服务端 `StorageProviderFactory`。
9. 迁移完成后执行总数、hash、URL 可访问性和缩略图覆盖率校验。校验失败时停止废弃字段计划，不自动删除任何旧对象。
10. 插件上传登记失败产生的孤儿对象只允许由 Desktop 的幂等补偿任务清理；不得在一次普通 Web 扫描中删除未知来源对象。

## Provider 适配原则

1. GitHub 插件：使用 Contents API，保存稳定的文件路径和 blob/version 信息；删除和覆盖必须处理 SHA 或条件更新。
2. S3-compatible 插件：统一支持 AWS S3、Cloudflare R2 等 endpoint；实现分段/断点上传、checksum、分页 list、对象版本和公开 URL 配置。
3. 后续插件优先复用标准协议。只有标准协议无法覆盖能力时，才增加专用协议。

## Web 端兼容行为

- `storageRuntime = web`：沿用当前 Hono provider、扫描、删除、移动、下载和缩略图逻辑。
- `storageRuntime = desktop-plugin`：Web 允许展示公开 URL；远程对象操作默认拒绝，数据库元数据操作必须明确区分“解除关联”和“删除远程对象”。
- 临时 URL 不能当作永久 CDN URL 保存。需要刷新时由 Desktop 插件路径调用 `object.getUrl`，并更新 Photo 的 URL 和过期时间。

## 安全约束

- 插件安装包必须签名校验，插件版本和 API 版本必须兼容。
- 默认插件进程只通过 transfer handle 读取上传内容；完整文件路径和 token 不进入 JSON-RPC 日志。
- 插件崩溃、超时或协议错误只能使当前 Desktop source 不可用，不能拖垮 Desktop 主进程。
- 删除操作必须声明能力并经过明确确认；记录插件 ID、版本、source ID、请求 ID、错误码和审计日志，不得记录 token 或带签名参数的 URL。
- 网络请求设置超时、并发限制、大小限制和速率限制。

## 实施阶段

### Phase 0：边界和数据契约

- 确认 Desktop 插件只负责远程对象存储，不负责 `local_library` 的索引和组织。
- 确认 `storageRuntime`、`storagePluginId`、缩略图对象引用和 Web 端只读行为。
- 为 `/admin/photos/register` 增加兼容字段和来源校验。
- 完成 Photo schema migration 和存量回填脚本。

### Phase 1：统一 Desktop 插件接口

- 抽出 `StoragePort`、对象引用、rendition、能力和统一错误模型。
- 实现 transfer handle、幂等键、超时、取消和待登记任务。
- 使用 fake plugin 完成上传、登记失败补偿和崩溃恢复测试。

### Phase 2：插件运行时

- 新增 Desktop Plugin Manager 和插件目录。
- 实现 manifest、JSON-RPC stdio、签名校验、凭据适配、配置 Schema 和日志。
- 复用 `desktop/agent_extensions/` 的进程管理模式，但保持存储协议独立。

### Phase 3：首批插件

- 将 GitHub provider 改造成 Desktop 外部插件。
- 将 S3 provider 改造成 S3-compatible 外部插件，并用 Cloudflare R2 验证 endpoint、分段上传和公开 URL。
- 接入 Desktop UploadQueue，并验证重复检查、相册/故事关联和失败重试。

### Phase 4：迁移和发布

- 完成存量数据校验、插件来源 Web 只读行为和卸载/升级回滚。
- 为每个插件执行统一 contract tests。
- Google Drive 及其他 provider 作为后续独立 ADR，不阻塞本 ADR 的首版完成。

## 验证要求

每个插件必须通过统一 contract tests：

- validate、health、put、get、stat、list、move、delete、getUrl；
- 原图和缩略图双对象上传；
- 大文件、断点上传、checksum 和幂等重试；
- 超时、取消、崩溃重启和登记失败补偿；
- 429/5xx 重试和 URL 过期；
- 凭据隔离、manifest 签名和存量数据迁移；
- Web 对 Desktop 插件来源的只读限制和审计日志。

## 备选方案

| 方案 | 结论 | 原因 |
|---|---|---|
| 服务端 Node Worker | 暂不采用 | 当前目标是 Desktop 独立扩展；会增加部署、凭据和 Web 运行时边界 |
| Go `plugin` 动态库 | 否决 | 跨平台和 ABI 兼容性差，崩溃隔离困难 |
| WASM/WASI | 暂缓 | 沙箱较好，但 OAuth、网络和大文件传输 Host API 成本较高 |
| Desktop 内置 provider 注册表 | 否决 | 仍需修改和发布主程序，无法实现第三方独立扩展 |
| 外部进程 JSON-RPC | 采用 | 跨语言、跨平台、可隔离，适合 Desktop 首版和第三方 SDK |

## 影响

正面影响：Desktop 新增存储源无需修改桌面主业务；插件可以独立发布和升级；GitHub、R2 以及未来其他服务可以共享 Desktop 上传队列、重试和登记流程；Web 既有存储链路不需要迁移。

代价：Desktop 需要维护插件协议、安装、签名、凭据、传输和本地 source registry；Web 端必须识别 Desktop 插件照片并限制远程对象操作；跨 provider 的 URL、删除、缩略图和一致性语义必须显式建模。

本 ADR 已完成首版 Desktop-only 插件基础设施：Go host contract、Node runtime resolver、TypeScript SDK、签名插件包安装/版本回滚、Settings 管理入口、上传登记补偿任务，以及 S3-compatible/R2 Node 插件。GitHub 外部插件、真实 R2 多平台端到端验证和随 Desktop 发布的五平台 Node 22 runtime 二进制仍属于后续发布工作；在这些发布项完成前，不应把当前 Node 插件包视为生产签名发行物。
