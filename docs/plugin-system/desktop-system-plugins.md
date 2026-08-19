# ADR-0009: Desktop 系统插件平台与能力域

- 状态：已接受，待渐进迁移
- 日期：2026-08-16
- 决策者：产品 + 桌面端开发
- 取代：ADR-0008 的“插件仅属于存储功能”定位
- 关联模块：`desktop/plugin_core/`、`desktop/storage_plugins/`、`packages/desktop-plugin-sdk/`、`desktop/agent_extensions/`、`desktop/frontend/src/pages/SettingsPage.tsx`

## 背景

首版插件基础设施以远程存储为唯一业务场景，因而安装、运行时、manifest、source
registry、SDK 和设置 UI 都使用了 storage plugin 语义。但其通用部分已经承担了
插件安装、签名、进程生命周期、运行时选择、配置、凭据和版本管理，这些职责并不
属于存储领域。

Desktop 后续需要允许插件扩展更多功能。如果继续把新能力塞入存储协议，会造成
错误的领域耦合；如果一次性开放任意 UI、文件系统、数据库和进程能力，又会扩大
安全面并重复当前过度设计问题。

## 决策

建立一个系统级 Plugin Core，并通过独立、可版本化的 capability domain 暴露具体
扩展能力。存储是首个能力域，不再等同于插件平台本身。

```text
Desktop Plugin Core
├─ Catalog / package / trust / update
├─ Runtime supervisor / transport / cancellation
├─ Credential / permission / audit
└─ Capability brokers
   ├─ storage.*       当前已有，迁移保留
   ├─ command.*       后续：显式触发的命令与工作流
   ├─ import.*        后续：外部内容导入
   ├─ export.*        后续：导出目标与发布渠道
   ├─ media.*         后续：受控媒体处理和元数据增强
   └─ ui.*            暂缓，须单独 ADR 和隔离方案
```

Plugin Core 不理解对象 key、照片、缩略图、S3、相册或编辑器等业务概念。这些类型和
协议属于各能力域。Host 业务模块只能通过对应 broker 调用插件，不能直接向插件开放
Wails bindings、数据库连接、任意本地路径或 renderer DOM。

## Manifest 与版本

manifest 使用一个核心协议版本，并为每个 contribution 声明独立能力版本：

```json
{
  "id": "example.publisher",
  "version": "1.0.0",
  "coreApiVersion": "1",
  "runtime": { "type": "node", "version": "node22", "entry": "dist/main.js" },
  "contributions": [
    { "domain": "storage", "apiVersion": "1", "capabilities": ["object.put", "object.delete"] },
    { "domain": "export", "apiVersion": "1", "capabilities": ["export.publish"] }
  ],
  "permissions": ["network:https://example.test"]
}
```

兼容迁移期间继续读取现有 `apiVersion`、`type`、`runtime`、`entry` 和顶层
`capabilities`，并将其解释为 `storage@1` contribution。不能通过一次 manifest
升级自动获得新权限。

## 权限和信任边界

1. 生产模式只启动安装时和启动时均通过签名、checksum 与兼容性校验的插件。
2. 插件声明 contribution 不等于获得权限。网络、文件读取、文件写入、执行、删除和
   凭据访问由 Host 按 capability 与资源范围授权。
3. 凭据按插件 ID、能力域和实例隔离；storage source 的凭据不能被其他 contribution
   自动读取。
4. transfer handle 只授权当前请求所需的文件和方向，不能升级为任意路径访问。
5. 外部进程提供崩溃隔离，不视为 OS 沙箱。没有完成沙箱前，第三方插件仍是用户明确
   安装的受信任代码。
6. 配置 Schema 继续由 Host 渲染。任意 HTML/React 面板、DOM 注入和主窗口脚本均不在
   首期范围，`ui.*` 必须另立 ADR。

## 与 Agent Extensions 的关系

`desktop/agent_extensions/` 当前管理 Skill、MCP、Agent 权限和调用审计。它与系统插件
共享进程、凭据、授权和审计需求，但领域协议不同。

首期不把 MCP/Skill 强行迁入 Plugin Core，也不让系统插件绕过 Agent permission gate。
后续可以抽取共同的 runtime supervisor、credential store 和审计组件；是否将 Agent
能力作为 `agent.*` contribution，需要在现有 Agent 验证矩阵完成后另行决策。

## 存储能力迁移

- `desktop/storage_plugins/` 暂时保留，作为 `storage@1` 的现有实现和兼容入口。
- `StoragePort`、source registry、对象 transfer、Photo 登记补偿仍属于 storage domain，
  不提升到通用核心。
- `storageRuntime = desktop-plugin`、`storagePluginId`、`storageSourceId` 等已落库字段保持
  兼容，不为概念重命名立即迁移数据库。
- 先修复签名校验、删除、GPS/WebP 和 URL 生命周期，再抽取通用核心。不能用重构掩盖
  已知行为缺陷。

## 分阶段实施

### Phase 0：稳定现有存储能力

- 完成 `PLUG-SEC-01`、`PLUG-STO-01`、`PLUG-MEDIA-01`、`PLUG-URL-01`。
- 提供独立“插件市场 / 已安装”视图，并保持存储源页面只处理业务实例。
- 发布包只携带当前目标平台需要的 runtime。

### Phase 1：抽取 Plugin Core

- 抽取 package catalog、trust verifier、runtime supervisor、credential adapter 和 audit。
- 为现有 manifest 提供明确的 `storage@1` 兼容解析层。
- 保持现有 Wails API 和数据库字段兼容，避免 UI、上传和历史照片同时大迁移。

### Phase 2：验证第二能力域

- 只选择一个有真实产品需求的非存储能力域作为试点。
- 优先考虑 host-rendered、权限边界清晰的 `command.*`、`import.*` 或 `export.*`。
- 第二能力域落地前，不新增通用 UI 注入和任意文件系统 API。

### Phase 3：分发与第三方生态

- 使用宿主内置的官方仓库索引提供发现、平台兼容判断、缓存、下载摘要校验和安装/更新入口。
- GitHub 与 S3 插件源码从主仓库迁出到 `../mo-gallery-plugin-github/` 与
  `../mo-gallery-plugin-s3/`；插件包由各自仓库发布，中央索引只保存元数据和带摘要的 Release 下载地址。
- 第三方安装入口开放前完成权限提示、审计、损坏恢复和真实多平台验证。

## 备选方案

| 方案 | 结论 | 原因 |
|---|---|---|
| 继续使用“存储插件”总模型 | 否决 | 新能力会被迫使用 source/object 等错误领域语义 |
| 一次性开放完整 UI 和业务 API | 否决 | 权限面过大，版本兼容和宿主稳定性不可控 |
| 每个功能各建一套插件运行时 | 否决 | 重复安装、签名、凭据、进程和审计基础设施 |
| 系统核心 + 独立能力域 | 采用 | 复用通用基础设施，同时保持最小权限和领域契约 |

## 影响

正面影响：插件成为 Desktop 的系统扩展机制；存储协议不再限制未来能力；通用安全、
生命周期和发布逻辑可以复用；每个能力域可以独立演进和测试。

代价：需要为核心协议和能力域分别维护版本；现有 storage 命名需要兼容层；UI 插件、
Agent 插件和第三方生态仍需后续决策，不能因“系统插件”定位而默认获得授权。
