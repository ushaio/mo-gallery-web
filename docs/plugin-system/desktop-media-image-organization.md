# Desktop 图片整理插件设计记录

- 日期：2026-08-17
- 状态：设计提案，尚未准入实现
- 目标能力域：`media@1`
- 首版范围：Desktop 本地资源库
- 关联文档：`docs/plugin-system/spec.md`、`docs/plugin-system/desktop-system-plugins.md`、
  `docs/plugin-system/cherry-studio-ai-architecture-comparison.md`

## 1. 决策摘要

Desktop 可以增加“图片整理”插件，通过用户已经接入的 AI 供应商，为图片生成标签和
备注。该功能应归入新的 `media@1` 能力域，不属于 `storage@1`，也不应通过 MCP 实现
核心处理链路。

首版只面向本地资源库：读取本地资产的受控预览，生成标签和备注建议，经 Host 校验
和用户确认后写入当前资源库的 SQLite。首版不读取、修改或同步任何云端资源字段。

当前 Plugin Core 尚未实现 `media@1` 执行 broker、任务队列和结果提交协议，并且系统
插件规格要求先关闭现有四项 P1 问题。因此建议先以 Host 内部实现验证完整工作流，
接口按未来 `media@1` 设计；准入条件满足后，再抽取为官方图片整理插件。

## 2. 产品范围

### 2.1 首版功能

- 对当前图片、选中图片或当前筛选结果执行 AI 整理；
- 自动生成标签建议；
- 自动生成简短备注建议；
- 优先匹配和复用当前资源库已有标签；
- 支持逐项或批量确认结果；
- 支持取消、失败重试、跳过和一键撤销；
- 显示任务所用供应商、模型、图片数量和处理状态。

“自动生成”不等于默认静默写入。首版默认流程为“生成建议 -> 审核 -> 提交”。后续若
增加自动应用模式，也必须保留修改记录和撤销能力。

### 2.2 首版非目标

- 云端资源库整理；
- 本地标签或备注自动同步到云端；
- 人脸身份识别、人物命名或敏感属性推断；
- 自然语言搜图、相似图片和自动聚类；
- 任意插件 UI、Wails binding、SQLite 或本地路径访问；
- 由 MCP Server 直接修改本地资源库。

## 3. 本地资源库边界

首版只处理 `desktop/local_library` 管理的本地资产：

- 只处理 `availability=active` 且可生成或读取预览的图片；
- 默认跳过缺失资产、回收站资产、视频和预览失败资产，并返回明确原因；
- 结果只写入本地资产的标签和备注；
- 不读取或修改 `CloudPhotoID`、`CloudURL`、上传状态及云端 Photo 数据；
- 任务、建议、修改历史和资源库绑定，切换资源库后相互隔离；
- 批量处理当前筛选结果时使用 Host 创建的查询快照或 query token，避免结果集在任务
  执行期间无边界变化。

本地资源库不等于本地推理。若用户选择远程 AI 供应商，处理后的图片预览仍会发送给
该供应商。执行前必须显示隐私提示；默认发送正确旋转、限制尺寸且不包含 GPS 等非必要
元数据的预览，不发送原始文件。

## 4. 系统职责边界

### 4.1 Desktop Host

Host 负责：

- 选择和锁定任务的资产范围；
- 生成安全预览并通过临时 transfer handle 授权读取；
- 选择 AI 供应商和模型，校验视觉与结构化输出能力；
- 管理任务队列、并发、取消、重试、限流和费用提示；
- 校验插件输出的长度、数量、字符和结构；
- 将标签名称映射为当前资源库的标签 ID；
- 展示审核 UI，并通过本地事务提交或撤销修改；
- 保存任务、建议、错误和修改审计记录。

### 4.2 `media@1` 图片整理插件

插件负责：

- 图片整理的 prompt、标签策略和输出规则；
- 将图片内容、允许的 EXIF 上下文和已有标签词表组织为分析请求；
- 返回 Host 可验证的结构化标签和备注建议；
- 对供应商响应执行领域级规范化，但不直接提交业务数据。

插件不得直接访问本地资源库路径、SQLite、Wails API 或云端数据库，也不得直接创建、
修改或删除 Host 标签。

### 4.3 `storage@1`

存储插件只负责对象上传、下载、读取、删除和 URL 获取。它不理解图片标签、备注、相册
或用户权限，也不负责 AI 整理。

未来处理云端资源时，只有在 Host 无法通过云端预览 API 读取对象的情况下，才可能通过
对应存储插件的 `object.get` 或 transfer 能力取得图片内容。这仍然只是文件读取，不是
图片整理能力。

## 5. 建议的能力契约

`media@1` 首个候选 capability 为 `media.annotate`。Host 每次授权一个媒体输入，插件
返回建议，不产生直接副作用。以下结构用于表达边界，不是已经冻结的 SDK contract：

```ts
interface MediaAnnotationRequest {
  requestId: string
  subjectRef: string
  baseRevision: string
  media: {
    transferId: string
    mimeType: string
    width: number
    height: number
    fingerprint: string
  }
  context: {
    locale: string
    existingTags: string[]
    exif?: Record<string, string | number>
  }
  options: {
    maxTags: number
    maxNoteLength: number
  }
}

interface MediaAnnotationProposal {
  requestId: string
  subjectRef: string
  baseRevision: string
  tags: Array<{
    name: string
    confidence?: number
    evidence?: string
  }>
  note: string
  warnings: string[]
  provenance: {
    pluginId: string
    pluginVersion: string
    providerId: string
    model: string
    promptVersion: string
  }
}
```

置信度可以用于排序和提示，但模型自报置信度通常未经过校准，不能单独作为静默自动
应用的依据。

## 6. AI 供应商接入

Desktop 已有多供应商配置以及显式的模型能力声明。图片整理首版要求：

- `vision=true`：必须；
- `structuredOutput=true`：建议作为首版硬要求，保证结果可靠解析；
- Tool Calling：不需要；
- Image Generation：不需要。

AI API Key 不应直接交给插件。短期由 Host 使用现有 AI 代理执行推理。未来若允许外部
插件自主调用模型，应提供有时效、指定模型、指定调用次数和指定媒体输入的 inference
grant，由 Host 代理实际请求并注入密钥，不能向插件暴露供应商原始凭据。

## 7. 标签和备注提交规则

### 7.1 标签

- 对名称进行 trim、大小写和重复项规范化；
- 优先复用已有标签，默认不创建语义近似但名称不同的新标签；
- 新标签必须在审核结果中明确标识；
- 一次图片整理限制最大标签数量；
- Host 在一个事务中创建必要标签并建立资产关系；
- 重试使用幂等键，避免重复创建或重复关联。

### 7.2 备注

- 默认只填充空备注；
- 已有备注默认保留，AI 结果作为待审核建议；
- “替换”和“追加”必须由用户明确选择；
- 提交前检查资产组织数据 revision，发现用户已修改时转为冲突；
- 不能使用当前会同时写入标题、评分、颜色和收藏状态的全量更新方式提交 AI 备注，
  应新增只修改目标字段的原子 Patch API。

### 7.3 建议与历史

建议至少保存以下信息：任务 ID、资产 ID、输入 fingerprint、base revision、插件及模型
版本、标签建议、备注建议、处理状态、错误、创建时间和应用时间。已应用结果还应保存
修改前后值，支持一次任务的一键撤销。

## 8. MCP 与 Embedding 决策

### 8.1 MCP

首版不需要 MCP。MCP 是 Agent 发现和调用外部工具的协议，不解决图片授权、批处理、
AI 供应商密钥、本地事务和撤销问题。系统插件与 `desktop/agent_extensions/` 继续保持
领域分离。

未来可以把“整理选中图片”暴露为 AI 助手的 MCP/Agent tool，但该工具仍必须调用 Host
受控的 `media@1` 和资源库提交接口，不能绕过权限与审核链路。

### 8.2 Embedding

自动标签和备注首版不需要 Embedding。视觉语言模型可以直接从图片生成结构化结果，
已有标签数量可控时也可以把候选标签词表作为上下文提供。

出现以下需求后再引入 Embedding：

- 自然语言搜图；
- 相似图片和视觉去重；
- 自动聚类或相册建议；
- 跨语言、同义词标签归一；
- 从大量已有标签中召回少量候选标签。

引入时必须同时设计向量模型、维度、模型版本、输入 fingerprint、重建任务、索引方式和
模型切换后的迁移策略，不能只在资产表中增加一个无版本向量字段。

## 9. 云端资源库扩展

云端扩展复用相同的 `MediaAnnotationProposal`、AI 调用层和审核 UI，只替换图片读取器与
结果提交器：

```text
云端资源记录
  -> Host 获取授权后的图片预览
  -> media@1 生成标签和备注建议
  -> Host 审核并校验资源版本
  -> 云端资源库 API 持久化标签和备注
```

云端图片整理不要求 `storage@1` 增加 AI 能力。真正需要补充的是云端标签/备注数据模型、
鉴权 API、资源 revision、幂等提交、审计和撤销。

### 9.1 本地与云端差异

| 维度 | 本地资源库 | 云端资源库 |
|---|---|---|
| 图片来源 | 本地文件或预览缓存 | 鉴权预览、稳定 URL 或受控对象读取 |
| 数据存储 | 当前资源库 SQLite | PostgreSQL/API 与对象存储 |
| 资源身份 | 本地 `AssetID` | 云端 `PhotoID`，不保证一一映射 |
| 权限 | 当前 Desktop 用户拥有资源库 | 账号、站点、相册和照片写权限 |
| 并发 | 通常是当前进程修改 | Web、Desktop 和其他设备并发修改 |
| 提交 | SQLite 原子事务 | 网络超时、重试、部分成功和幂等 |
| 标签体系 | 每个本地资源库独立 | 需定义站点级、用户级或相册级所有权 |
| 撤销 | 本地前后值恢复 | 服务端审计、版本检查和跨设备可见性 |
| 批处理 | Desktop 保持运行 | 整库后台处理通常需要服务端队列 |
| 隐私与费用 | 用户选择的供应商 | 可能经过对象存储、服务端和 AI 供应商 |

### 9.2 云端主要困难

1. 图片访问：处理签名 URL 过期、对象权限、跨域和稳定预览；
2. 并发冲突：AI 运行期间其他设备可能已经修改标签或备注；
3. 标签所有权：定义标签作用域、同名规则、创建权限和删除影响；
4. 分布式提交：处理超时、重复请求、部分成功、重试和审计；
5. 执行位置：决定任务依赖 Desktop 在线，还是由服务端后台执行。

### 9.3 推荐的首个云端版本

首个云端版本建议由 Desktop 驱动：

- Desktop 通过云端资源库 API 获取授权预览；
- 复用用户已配置的视觉模型；
- 用户确认后，通过携带 `expectedRevision` 和幂等键的云端批量 API 提交；
- 存储插件仅在无法通过云端 API 读取对象时提供受控读取；
- 不支持关闭 Desktop 后继续执行整库任务。

当产品需要跨设备查看任务、关闭 Desktop 后继续处理或定时整理整个云端图库时，再增加
服务端任务队列、集中式 AI 凭据、计费、限流和任务监控。

## 10. 实施准入与阶段

### Phase 0：关闭系统插件 P1

完成 `PLUG-SEC-01`、`PLUG-STO-01`、`PLUG-MEDIA-01` 和 `PLUG-URL-01`，满足现有系统
插件规格的能力域准入要求。

### Phase 1：本地 Host 垂直验证

- 建立图片整理领域 contract 和结构化输出 schema；
- 实现本地任务、建议、审核、原子提交和撤销；
- 复用 Desktop AI 供应商配置，只允许合格的视觉模型；
- 验证单图、选中图片和筛选结果批处理；
- 验证取消、重试、资源变更冲突和隐私提示。

### Phase 2：正式建立 `media@1`

- 编写 `media@1` ADR、错误模型、取消语义和数据所有权说明；
- 实现 capability broker、transfer 授权和 contract tests；
- 将图片整理逻辑抽取为官方签名插件；
- 保持 Host 拥有 UI、AI 凭据、资源库写入和撤销。

### Phase 3：云端 Desktop 驱动

- 增加云端标签/备注及 revision API；
- 增加云端预览读取适配器和结果提交适配器；
- 复用本地版本的 proposal、审核和 AI 层；
- 补齐权限、幂等、冲突、部分失败和跨设备审计测试。

### Phase 4：按需扩展

根据真实需求评估服务端后台整理、Embedding 语义检索、相似图片、聚类和 Agent/MCP
入口，不在首版预先实现。
