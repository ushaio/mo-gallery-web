# Desktop 系统插件 — 首期规格

- 日期：2026-08-17
- 状态：插件市场发现与安装闭环已实现
- 架构决策：`docs/plugin-system/desktop-system-plugins.md`
- 问题记录：`docs/plugin-system/插件评审.md`
- 仓库契约：`docs/plugin-system/marketplace-repository.md`

## 1. 产品定位

Desktop 插件是应用级扩展单元，可以贡献一个或多个受控能力域。插件管理入口属于
系统设置，不属于“存储源”页面；存储源管理仍是 storage capability 的业务页面。

首期只承诺：

- 一个统一的已安装插件目录；
- 一个使用宿主内置仓库源的官方插件市场；
- 插件详情、版本、签名/兼容状态、启用状态和卸载；
- 按 contribution 展示插件提供的能力；
- 现有 S3-compatible 插件作为 `storage@1`；
- 现有存储源配置、上传链路和数据字段兼容。

首期不承诺：

- 用户自定义仓库源或未经审核的社区仓库；
- 任意 React/HTML 页面注入；
- 任意 Wails、数据库、文件系统或 shell 访问；
- 自动把 Agent Skill/MCP 合并为系统插件；
- 同时实现多个尚无真实使用场景的能力域。

## 2. 核心职责

Plugin Core 负责：

- 安装包解包、签名、checksum、版本兼容和损坏检测；
- 插件启停、超时、取消、崩溃隔离和资源回收；
- contribution 注册和 capability 路由；
- 凭据引用、权限决策和脱敏审计；
- 兼容旧 storage manifest。

Plugin Core 不负责：

- 生成缩略图、照片登记或对象 key 规则；
- 编辑器文档模型、相册、故事、Zine 或本地图库业务；
- 代表具体 capability 决定重试和补偿语义。

## 3. 能力域

| 能力域 | 状态 | 首期边界 |
|---|---|---|
| `storage@1` | 已有，待修复并迁移 | validate/health/object put/get/stat/list/move/delete/getUrl |
| `command@1` | 候选 | 用户显式触发的无 UI 命令；参数由 Host Schema 渲染 |
| `import@1` | 候选 | 从外部服务列出和拉取资源，通过 transfer 写入 Host 管理目标 |
| `export@1` | 候选 | 接收 Host 授权的导出产物并发布到目标服务 |
| `media@1` | 候选 | 对 Host 授权的单个媒体输入产生派生结果或结构化元数据 |
| `ui@1` | 暂缓 | 需要单独的隔离、布局、导航、权限和兼容性 ADR |

新增能力域必须满足至少一个已确认产品场景，并提供自己的 contract tests、权限范围、
错误模型、取消语义和数据所有权说明。

## 4. 设置和交互

系统设置新增独立“插件”入口：

- 默认页展示“插件市场”，通过宿主内置的只读仓库源发现插件；仓库不可用时显示已校验的本地缓存或明确错误。
- 插件项展示名称、版本、发布者/签名状态、运行时状态和 contributions。
- 存储 contribution 提供“管理存储源”跳转，不在插件详情中复制完整存储源 CRUD。
- 安装本地目录只在开发模式出现；生产模式只接受已签名包。
- GitHub 与 S3 插件源码位于主仓库外部的 `../mo-gallery-plugin-github/` 与
  `../mo-gallery-plugin-s3/`，Desktop 不再内置这两个 provider；发布到内置仓库索引后可从市场安装，也保留手动导入。
- 外部插件仍必须经过 Host 的 manifest、checksum、签名和兼容性校验；“第三方”不等于自动放行未验证代码。
- 回滚目标必须再次通过完整性和兼容性校验。
- 删除插件前列出仍依赖它的 source、任务或其他实例，存在依赖时禁止直接卸载。

## 5. 兼容和迁移

1. 旧 manifest 继续按 `storage@1` 解析。
2. 旧插件安装目录和 `current` 版本指针先保持可读。
3. 现有 Wails `DesktopStorage*` 方法在迁移期保留，由 storage broker 适配。
4. 现有 Photo storage 字段不因平台改名而立即迁移。
5. 新核心接口稳定并覆盖测试后，再逐步把内部目录和公开 API 从 storage 命名迁移为
   plugin 命名。
6. 迁移不能改变已有对象 key、source ID、credential reference 或 Photo 所有权。

## 6. 实施准入

抽取 Plugin Core 前必须先完成四项 P1：

- 生产启动时重新校验插件完整性；
- Desktop 插件照片删除/解除关联闭环；
- GPS 清理与压缩设置在 storage capability 路径生效；
- Web 可见照片不依赖无法刷新的临时 URL。

这些问题未解决前，不增加新的 capability domain。
