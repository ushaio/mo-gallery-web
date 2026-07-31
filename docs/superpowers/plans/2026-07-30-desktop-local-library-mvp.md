# Desktop 本地资源库 MVP 实施计划

> 本文档同时作为实施计划和进度记录；以代码与验证结果为准。

**目标：** 在 Wails Desktop 交付 Windows 10/11 x64 本地照片资源库：库内 SQLite、渐进扫描、安全文件操作、三栏工作台、组织与查询、预览、回收站、备份及现有上传队列集成。

**架构：** 新建独立 Go `local_library` 模块，由 `App` 提供薄 Wails 门面；每次只打开一个 `LibraryManager`。库内 `library.db` 保存管理事实，扫描与 watcher 经统一协调器更新索引。React 只持有当前页面/选择/查询状态，通过分页 DTO 和小型事件工作，不镜像全库。媒体通过受校验的同源 handler 提供。

**基线：** `docs/requirements/desktop-local-library/spec.md`、`domain-model.md`、ADR 0001～0037。


## 2026-07-31 实现进度

本节记录当前代码事实；ADR 的“已接受”表示产品决策已确定，不等于实现已完成。

### 阶段状态（按代码与验证证据）

| 阶段 | 当前状态 | 代码事实 |
|---|---|---|
| Phase 0：阻塞性技术 Spike | 未完成 | SQLite、媒体、watcher 和锁方案已进入代码，但正式样本库、10 万项基准、干净 Windows VM 以及 ADR-0038～0040 尚缺 |
| Phase 1：资源库基础 | 基本完成 | 独立模块、路径策略、清单、SQLite、最近库、独占锁、生命周期、扫描和 cursor 分页已实现并有测试 |
| Phase 2：完整索引与媒体服务 | 大部分完成 | 统一校准、缩略图/预览、安全 handler、失败重试和事件已实现；完整格式矩阵与发布环境验证未完成 |
| Phase 3：React 工作台 | 基本完成 | 入口、欢迎页、三栏工作台、筛选、虚拟化网格、详情和预览已接入；viewer 与 UI 验收矩阵仍需收尾 |
| Phase 4：组织、查询和文件命令 | 大部分完成 | 标签、集合、批量组织、结构化筛选/排序、资产和文件夹真实操作已实现；通用操作计划及冲突决策尚缺 |
| Phase 5：回收、失联、备份与上传 | 大部分完成 | 回收/恢复/永久删除、失联维护和上传集成已完成；手动数据库备份、恢复前保护、完整性检查及恢复 UI 已接入，日变更备份和升级前自动备份仍待完成 |
| Phase 6：性能、安全和发布 Gate | 未完成 | Go 测试和前端构建通过；性能、安全、真实介质、可访问性、截图及正式 Wails/Windows 验证未完成 |

> 下方 Phase 复选框是逐项验收清单，不再用未勾选数量直接推导阶段完成度；只有具备对应代码和验证证据的条目才应勾选。

### 已完成

- 已建立本地资源库生命周期、库内 SQLite、最近资源库、独占打开、扫描/暂停/继续/取消、watcher 校准、断盘 suspended 与同路径失联恢复。
- 已实现首次导入时选择“复制到库 / 移动到库”，取消不导入且不保存偏好；偏好可在“系统设置 → 本地资源库”修改。
- 已实现安全媒体路由、缩略图/预览、预览失败占位与重试、系统默认程序打开、失联记录显式移除。
- 已实现真实文件夹创建、重命名、库内移动、整树回收/恢复/永久删除；操作使用持久化意图并覆盖磁盘成功但数据库失败的恢复路径。
- 已实现普通资产真实文件重命名及单个/批量移动到已有真实文件夹；保留资产 ID、标签、集合、评分、备注和收藏，不覆盖同名目标，并提供详情栏、批量栏和右键菜单入口。
- 已实现库内拖放语义：拖到真实文件夹会移动磁盘文件，拖到集合、标签或收藏只更新逻辑关系；库外文件只可落到资源库根目录或真实文件夹，落到逻辑目标时会明确拒绝并引导先导入。
- 已实现标签、集合、嵌套集合组、标题、备注、评分、颜色和收藏；支持多选及批量组织，逻辑组织删除不触碰原文件。
- 已实现统一关键词搜索，以及文件夹/集合/标签/收藏、评分、颜色、格式、预览状态、拍摄/发现日期、相机/镜头、ISO、光圈、焦距、方向和宽高筛选；同组多选 OR、跨组 AND。
- 已实现拍摄/修改/发现/文件名/大小/评分排序、升降序、稳定 ID 次级排序与 cursor 分页；筛选条件有可移除摘要和一键清除。
- 已生成最新 Wails 绑定，并通过 `cd desktop && go test ./...` 与 `cd desktop/frontend && npm run build`。前端仅有既有 bundle size / Rollup 提示。

### 仍未完成的主要工作

1. 通用批量文件操作计划、冲突处理界面、自动重命名/跳过、逐项结果与完整恢复日志。
2. 数据库备份与恢复：7 份日备份、3 份升级前备份、立即备份、恢复 UI、integrity check 与恢复后校准。
3. 查询性能收尾：FTS/索引、`EXPLAIN QUERY PLAN`、10 万资产 P50/P95 与冷暖缓存基准。
4. 真实媒体样本、NTFS/exFAT、Windows 10/11 干净 VM、Wails production build、故障注入、无障碍及截图矩阵。

## 全局约束

- 不复用 `desktop/db` 的服务端 PostgreSQL/GORM 模型，不修改 Web/Prisma schema；
- 不让前端传绝对路径读取媒体；当前库和资产 ID 是唯一入口；
- 不实现覆盖、嵌套库、库外长期引用、自动清理失联或哈希身份迁移；
- 未经 Windows 打包与真实样本验证，不宣称 HEIC/AVIF/RAW 完整支持；
- 不覆盖现有未提交的 `OverviewPage.tsx` 等用户修改；
- 每阶段运行 Go 测试、前端构建；UI 阶段保存人工验证截图。

---

## Phase 0：阻塞性技术 Spike

### Task 0.1：测试样本库

**创建：** `desktop/testdata/local-library/README.md`、基础 fixture 生成器、样本清单。

- [ ] 覆盖 JPEG/PNG/WebP/GIF/静态 AVIF、HEIC、8/16-bit TIFF；
- [ ] CR2、CR3、NEF、ARW、DNG、RAF 各至少两个真实机型样本；
- [ ] EXIF 旋转、无 EXIF、损坏截断、超大尺寸、动画资源攻击样本；
- [ ] NTFS 大小写、保留名称、长路径、库外 junction、循环链接；
- [ ] exFAT 外接卷断开/重连；
- [ ] 记录来源、授权、预期尺寸/方向/可预览性；私有大样本不提交仓库；
- [ ] CI 跳过私有样本时明确报告“未验证”，不得报告通过。

### Task 0.2：SQLite/FTS/备份选型

优先评估 `modernc.org/sqlite`（无 CGO）；若 FTS5、备份 API、性能或外接盘行为不满足，再评估 `mattn/go-sqlite3` 与 Windows CGO 分发。

- [ ] 构造 100,000 资产、关系与 EXIF 数据库；
- [ ] 验证 foreign keys、busy timeout、WAL、FTS5、事务和迁移；
- [x] 验证一致性在线备份，不直接复制活动 WAL 数据库；
- [ ] NTFS/exFAT 测试写入、强制断开与恢复；
- [ ] 记录 `.exe` 体积、DLL、构建命令和许可证；
- [ ] 基准常用分页查询 P50/P95；
- [ ] 新建 `ADR-0038` 选定驱动。

### Task 0.3：媒体后端选型

- [ ] 普通格式、GIF 首帧/动画信息与 EXIF 方向；
- [ ] 静态 AVIF、HEIC/HEIF、TIFF 在无开发环境的 Windows x64 运行；
- [ ] 六类 RAW 提取最高可用内嵌 JPEG 和 EXIF，不显影；
- [ ] 生成 512/2048 派生图，验证方向、ICC、透明度；
- [ ] 设置像素、帧数、内存与超时上限；
- [ ] 在 Wails production build 的干净 Windows VM 验证；
- [ ] 新建 `ADR-0039`，逐格式记录正式支持、降级建档或延期。

### Task 0.4：watcher、真实路径和写锁

- [ ] `fsnotify` 或候选库递归监听动态目录；
- [ ] 验证批量复制、临时改名、同路径覆盖的事件序列与去抖；
- [ ] watcher 丢事件后由校准修复；
- [ ] 验证 junction/reparse point、大小写和真实路径边界；
- [ ] 两进程竞争同库时仅一个获得写锁；
- [ ] 外接盘拔出进入 suspended，不产生全库 missing；
- [ ] 新建 `ADR-0040` 记录 watcher 与锁选型。

**Gate：** ADR-0038～0040 接受，干净 Windows VM 测试通过后再承诺完整媒体矩阵。

---

## Phase 1：资源库基础和 JPEG 纵向切片

### Task 1.1：Go 模块结构

```text
desktop/local_library/
├─ domain/          # ID、状态、DTO、错误
├─ pathpolicy/      # 路径规范化、边界、嵌套检查
├─ manifest/        # library.json
├─ sqlite/          # 连接、迁移、repository
├─ registry/        # 应用级最近库
├─ lock/            # 独占写锁
├─ manager/         # 当前库生命周期
├─ scan/  watch/  media/  preview/
├─ fileops/  trash/  backup/
└─ assetserver/
```

- [ ] 使用显式 `LibraryID`、`AssetID`、`RelativePath` 与状态类型；
- [ ] 业务错误带稳定 code，前端不解析错误文案；
- [ ] `App` 只委托 facade，不堆积 SQL/文件逻辑；
- [ ] 状态转换和错误序列化有单元测试。

### Task 1.2：`PathPolicy`

- [ ] 规范化相对路径和 Windows `path_key`；
- [ ] 拒绝绝对路径、`..`、保留名、尾随点/空格和 `.mo-gallery`；
- [ ] 每次 I/O 验证真实目标仍位于库根；
- [ ] 向上检查父库、向下检查后代库；默认跳过库外目录链接；
- [ ] junction、大小写、长路径和链接逃逸测试。

### Task 1.3：清单、schema、迁移

- [ ] 严格解析清单和版本兼容；
- [ ] 按领域模型创建 migration v1、外键、CHECK、组合索引与 FTS5；
- [ ] schema version 与 library format version 分离；
- [ ] 升级前一致性备份，迁移失败可恢复；
- [ ] repository 测试使用真实临时 SQLite 文件。

### Task 1.4：创建、初始化、打开、关闭

- [ ] 临时目录创建基础结构后提交，失败不留有效半成品；
- [ ] 打开已有库不隐式初始化；获得写锁后才 open；
- [ ] 关闭取消 manager context、关 DB、释放锁；
- [ ] 最近库保存到应用级 `local-libraries.json`，原子替换且不绑定账号；
- [ ] 路径不可用时保留条目并返回结构化原因。

### Task 1.5：Wails facade 和单实例

**修改：** `desktop/main.go`、`desktop/app.go`。

- [ ] 配置 Wails `SingleInstanceLock`，第二次启动显示并聚焦原窗口；
- [ ] startup 只创建 facade，不自动开库；shutdown 安全关闭；
- [ ] API：入口状态、最近库、创建、初始化、打开、关闭；
- [ ] DTO 不暴露数据库 model 或缓存绝对路径。

### Task 1.6：JPEG 渐进扫描与分页

- [ ] 后台枚举 JPEG 并以 `path_key` 幂等 upsert；
- [ ] 任务持久化计数和检查点，支持暂停/继续/取消；
- [ ] `ListLocalAssets` 返回 cursor、`isComplete` 和扫描状态；
- [ ] 先显示数据库结果，不等待校准；
- [ ] 100,000 项验证分页稳定性。

**Phase 1 Gate：** 可创建、打开、迁移和切换资源库；JPEG 可渐进扫描并分页列出；切库释放锁。

---

## Phase 2：完整索引、预览与安全媒体服务

### Task 2.1：统一建档管线

- [x] `Indexer.ReconcilePath(relativePath, source, operationID)` 供扫描、watcher、导入共用；
- [x] 等待文件大小/mtime 稳定后读取；
- [x] 外部新增、删除、覆盖按 ADR 更新；外部移动不做哈希配对；
- [x] 卷级 I/O 错误进入 suspended，重连校验 library ID 后校准。

### Task 2.2：媒体与元数据

- [ ] 接入 Phase 0 选定后端和全部已承诺格式；
- [x] 扩展名白名单、文件头与解码结果联合识别；
- [x] 提取尺寸、方向、动画信息和类型化 EXIF；
- [x] 解码失败仍建档为 `preview_unavailable`，错误可重试且不 panic worker。

> 当前已完成与媒体后端无关的识别、元数据、失败降级和手动重试管线；JPEG/PNG/GIF/WebP/TIFF 使用当前 Go 解码能力。HEIC/RAW/AVIF 目前仅做保守容器识别并降级为不可预览，正式解码支持与真实厂商样本矩阵仍等待 Phase 0 后端选型和验证，因此第一项保持未完成。

### Task 2.3：派生图任务

- [x] 512px 后台生成，2048px 首次查看生成；
- [x] cache key 包含资产、mtime/size、内容版本、变体和解码器版本；
- [x] 选中项高于可视项，高于后台项；同 key 单飞去重；
- [ ] 临时文件写入后原子改名；RAW 用内嵌 JPEG，GIF 用首帧；
- [x] 2048 可清理，512 默认保留。

> 实施说明：临时文件原子落盘、GIF 首帧派生图、2048px LRU/空间上限清理以及设置页手动清理命令已经完成。RAW 内嵌 JPEG 提取仍依赖 Phase 0 媒体后端选型和真实样本验证，因此包含 RAW 要求的第四项保持未完成；当前无法解码的 RAW 继续按 Task 2.2 规则建档为 `preview_unavailable`。

### Task 2.4：同源资源 handler

- [x] 构建组合 asset mux，同时保留现有 `/__zine/` 并新增 `/__local-library/`；
- [x] 只接收资产 ID/缓存键，不接收绝对路径；
- [x] 每次读取重新验证当前 session、状态和真实路径；
- [x] 设置正确 MIME、缓存、Range/流式响应和取消；切库后旧 URL 失效；
- [x] 更新 Vite 开发路由 404 转发，避免 SPA fallback 返回 HTML；
- [x] 测试穿越、伪造 ID、旧 session、链接逃逸和 `.mo-gallery`。

### Task 2.5：事件与并发

- [ ] 事件携带 library session ID，只发送小型状态/进度/失效消息；
- [ ] 高频进度节流，前端切库后丢弃旧事件；
- [ ] 文件命令按路径子树锁定并优先于扫描/预览；
- [ ] SQLite 单写者队列，应用自身 watcher 事件按 operation ID 去重。

---

## Phase 3：React 工作台

### Task 3.1：入口和路由

**修改：** `App.tsx`、`Sidebar.tsx`、现有 i18n；创建 `LocalLibraryPage.tsx`。

- [ ] 新增 `/local-library` 且仍在 `ProtectedRoute`；
- [ ] 明确区分线上图库与本地资源库文案；
- [ ] 点击入口后才恢复最近库；
- [ ] 欢迎页提供创建、初始化、打开与最近库；
- [ ] 路径选择使用 Wails 原生对话框，Go 再验证。

### Task 3.2：状态与 API adapter

- [ ] 创建类型、API adapter 和 Zustand store；
- [ ] store 只保存 session、导航、查询、选择和面板状态；
- [ ] 不保存全库数组，分页缓存有界；
- [ ] 封装 Wails 调用，不在组件散布 `(window as any)`；
- [ ] 事件按 session 过滤并使相关查询失效。

### Task 3.3：三栏与虚拟化网格

- [ ] 左栏状态/文件夹/集合/标签，中栏工具栏与网格，右栏详情/批量编辑；
- [ ] 1024px 折叠详情，状态涵盖扫描、暂停、卷断开、修复和错误；
- [ ] 文件夹与集合有不同图标和拖放反馈；
- [ ] 评估 `@tanstack/react-virtual` 或等效方案，cursor 无限分页；
- [ ] 只为可视项请求高优先缩略图；100,000 项 DOM 有界；
- [ ] “选择全部结果”使用后端查询 token，扫描中提示范围不完整。

### Task 3.4：预览和原图 viewer

- [ ] 默认 2048，支持前后切换；原图模式含适应、100%、缩放和拖动；
- [ ] GIF 仅预览区播放并可暂停；RAW 标注内嵌预览；
- [ ] 超大图使用 spike 确定的后端降采样/分块方案；
- [ ] “系统默认程序打开”走 Go 校验路径命令。

---

## Phase 4：组织、查询和文件命令

### Task 4.1：组织 CRUD

- [ ] 扁平标签、嵌套集合组、集合及关系 CRUD；集合组不能放资产；
- [ ] 批量编辑标签、集合、评分、颜色、收藏；标题/备注只写本地库；
- [ ] 删除逻辑组织不触碰磁盘；名称冲突和树循环返回结构化错误。

### Task 4.2：搜索、筛选、排序

- [ ] FTS 和结构化 filter compiler 使用白名单与参数绑定；
- [ ] 同组 OR、跨组 AND；实现规格中的字段；
- [ ] 每种排序有 ID 次级排序和 cursor 测试；
- [ ] 用 `EXPLAIN QUERY PLAN` 验证索引。

### Task 4.3：文件命令计划与执行

- [ ] `PlanFileOperation` 返回 plan ID、冲突、数量/大小和警告；
- [ ] `ExecuteFileOperation` 执行前复核计划版本与磁盘状态；
- [ ] 支持自动改名和跳过，不支持覆盖；返回逐项结果；
- [ ] 持久化恢复日志，故障注入磁盘成功/DB 失败及各阶段退出；
- [ ] 路径锁阻止扫描读取中间状态。

> 当前资产重命名/移动已具备逐项结果、冲突不覆盖、磁盘回滚和开库恢复，但尚未抽象为 ADR-0036 规定的通用 `PlanFileOperation` / `ExecuteFileOperation`，因此本任务仍保持未完成。

### Task 4.4：导入、拖放与文件夹命令

- [x] 库顶层、当前目录、具体文件夹映射正确目标；
- [x] 库外文件拖到逻辑目标时拒绝并提示先入库；
- [ ] 同卷与跨卷移动分开实现，跨卷校验成功后才删源；
- [x] 创建、改名、移动文件夹并更新全部后代路径；
- [ ] 禁止越界、保留目录、后代、链接循环和嵌套库；
- [ ] 文件夹移动执行前展开后代冲突。

---

## Phase 5：回收站、失联、备份与上传

### Task 5.1：回收与恢复

- [ ] 默认删除移入 `.mo-gallery/trash/<id>`；
- [ ] 目录树预检统计受管理资产、其他文件、目录和大小；
- [ ] 目录树作为一个批次，保留原路径和资产关系；
- [ ] 恢复原位置或库内其他父目录，冲突不覆盖；
- [ ] 永久删除确认含数量和大小，并清理关系与缓存；
- [ ] 故障时进入可诊断/修复状态。

### Task 5.2：失联视图

- [x] 外部删除只置 missing，不进入 trash；
- [x] 完全相同路径回归恢复原记录；
- [x] 仅显式“移除失联记录”清理；
- [x] 卷断开不改变全库 missing 数。

### Task 5.3：备份恢复

- [ ] 日变更备份 7 份、升级前备份 3 份、立即备份；
- [x] 使用已验证一致性备份 API；
- [x] 恢复前停止写入并备份当前 DB，恢复后 integrity check 和校准；
- [x] UI 明确备份不含原图与缓存。

> 2026-07-31 实现说明：已提供备份列表、立即备份和从指定备份恢复；备份通过 SQLite online backup API 生成并执行完整性检查，恢复前自动创建 `pre-restore` 备份、停止 watcher/扫描/派生图任务并替换数据库，随后以新 session 重开并启动校准扫描。当前未完成项是“发生数据变更后的每日首次自动备份”和“schema 升级前自动备份/失败阻断迁移”，因此第一项保持未勾选。

### Task 5.4：上传集成

- [x] 从资产 ID 在 Go 侧解析并复核当前原文件；
- [x] 复用现有上传设置、`PrepareUpload`、`UploadFile` 和进度弹窗；
- [x] 上传读取期间阻止应用内移动、改名、回收、恢复和永久删除，完成后再释放文件操作；
- [x] 本地组织字段不自动映射；桌面上传在预处理和真正上传前都校验支持格式与文件签名，对 RAW、HEIC/HEIF 等不受支持格式给出清晰错误。

---

## Phase 6：性能、安全和发布 Gate

- [ ] 固定测试硬件、盘、冷暖缓存，100,000 项验证首屏、查询、新增发现目标；
- [ ] 记录扫描/缩略图吞吐、峰值 RAM/CPU 和缓存体积；
- [ ] 故障注入：退出、SQLite busy/corrupt/disk full、卷断开、watcher 风暴、迁移失败；
- [ ] 安全：目录穿越、链接 TOCTOU、伪造 ID、旧 session、保留目录、危险默认焦点；
- [ ] 可访问性：键盘等价操作、颜色非唯一表达、GIF 暂停、reduced motion；
- [ ] UI：1024/1440/4K、125%/150% 缩放、明暗主题、中英文并保存截图；
- [x] 从 `desktop` 运行 `go test ./...`；从 `desktop/frontend` 运行 `npm run build`；
- [ ] Wails production build 在干净 Windows 10/11 VM 运行；
- [ ] NTFS/exFAT 测试完成，发布说明不宣称未验证格式或 macOS。

## 建议 Wails API

生命周期：入口状态、最近库、创建、初始化、打开、关闭。查询：库快照、资产分页、资产详情、文件夹、集合、标签、任务。组织：批量更新资产、标签/集合组/集合 CRUD。任务：扫描暂停/继续/取消、预览重试。文件：计划操作、执行计划、恢复、永久删除、移除失联。备份与集成：列出/创建/恢复备份、资产入上传队列、系统程序打开。

长任务返回 job/operation ID，进度通过节流事件和查询接口提供，不用单个阻塞 Wails 调用返回全过程。

## 推荐提交拆分

1. `feat(desktop): add local library foundation and sqlite schema`
2. `feat(desktop): add progressive scan and secure media service`
3. `feat(desktop): add local library workbench and virtual grid`
4. `feat(desktop): add local organization and indexed search`
5. `feat(desktop): add safe local file operations`
6. `feat(desktop): add trash backup and upload integration`
7. `perf(desktop): harden 100k local library workflows`

每个提交保持可构建，不混入无关重构或用户现有修改。
