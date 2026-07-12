# Flutter 移动端 App — 设计文档

- 日期: 2026-07-12
- 目标: 在仓库 `flutter/` 下新建 Flutter 客户端，优先服务移动端便捷上传，并分阶段补齐轻量浏览与精简管理
- 关联: `docs/requirements/2026-03-26-mobile-upload-app.md`（需求冻结）、`desktop/`（功能与上传字段参考）
- 范围: 新建 Flutter 工程 + 必要的后端白名单/挂接编排复用；**不**直连 PostgreSQL；**不**复刻 Zine / AI / 存储整理

## 1. 关键决策（已与用户确认）

| 维度 | 决策 | 理由 |
|------|------|------|
| 架构 | 原生 Flutter HTTP API 客户端 | 移动相册/后台队列体验好；与 Hono 现有上传链路一致 |
| 平台 | Android 优先；iOS 工程结构预留 | 先打通真机与后台续传，再补 iOS 验证 |
| 登录 | 对齐 Desktop 表单：服务器地址 + JWT Secret + 用户名 + 密码 | 运维习惯一致；Secret 用于本地校验/配置完整性（与 Desktop 同字段） |
| 上传恢复 | 任务级持久化队列 + 自动重试；非字节级分片续传 | 与需求冻结文档一致；现有 API 为单文件 multipart |
| 功能分期 | P0 上传核心 → P1 轻量图库 → P2 Desktop 精简管理 | 主目标是上传；浏览与管理按价值递进 |
| 数据路径 | 仅 Web HTTP + JWT；不走 Desktop 的 GORM 直连 | 移动端无法也不应直连生产库 |

## 2. 与既有需求文档的关系

`docs/requirements/2026-03-26-mobile-upload-app.md` 仍是 **P0 上传工作流** 的验收基准。本设计在其之上补充：

- 登录字段对齐 Desktop（含 JWT Secret）
- `origin_flag=mobile`（服务端已允许 `web|mobile|desktop`）
- 上传目标除相册/故事外，支持胶卷（对齐 Desktop 上传页）
- P1/P2 分期：图库浏览、相册/胶卷基础管理
- 目录落在仓库根 `flutter/`

若本设计与冻结需求冲突，**P0 以冻结需求验收条为准**，P1/P2 以本设计为准。

## 3. 分期范围

### P0 — 上传核心（第一批实现）

1. 管理员登录、会话持久化、服务器配置记忆
2. 系统相册多选 + 可选相机拍照
3. 本地 SHA-256、去重预检、可选客户端压缩
4. 持久化上传队列；杀进程/重启后恢复 pending 并自动重试
5. 批次目标：0+ 相册、0+ 故事、0/1 胶卷（胶卷与 Desktop 一致偏单选）；记住最近成功目标
6. 进度 UI、失败手动/自动重试、409 去重友好提示
7. 上传成功后挂接相册/故事（串行调用现有 admin API）

### P1 — 轻量浏览

1. 底部 Tab「图库」：分页缩略图、基础筛选（可见性可选）
2. 照片详情：大图、基础 EXIF 展示、打开 Web 链接（可选）

### P2 — Desktop 精简管理

1. 相册列表 / 创建 / 编辑 / 向相册加图
2. 胶卷列表 / 创建 / 编辑 / 帧管理基础
3. 照片批量可见性等轻量操作（不做存储整理、AI、Zine、博客写作）

### 明确非目标（全阶段）

- 完整后台复刻、多人协作、开放注册
- 字节级分片断点续传、推送体系
- Zine / AI 助手 / 存储扫描 / 友链 / 评论审核
- 直连数据库或嵌入式服务端

## 4. 架构

```
┌─────────────────────────────────────────┐
│              Flutter App                │
│  UI (Material 3)  +  Riverpod/Bloc      │
│  Upload Queue Worker (前台服务/Isolate) │
│  Drift (SQLite) 本地队列 + 最近目标     │
│  flutter_secure_storage (token/secret)  │
│  Dio → HTTPS → mo-gallery-web           │
└──────────────────┬──────────────────────┘
                   │ JWT Bearer
                   ▼
         Hono /api/* (现有)
                   │
                   ▼
         Prisma / Storage / PostgreSQL
```

### 4.1 与 Desktop 对照

| 能力 | Desktop | Flutter |
|------|---------|---------|
| 运行时 | Wails Go + React | Flutter |
| 认证 | Login + JWT Secret 配置 | 同字段；token 存 secure storage |
| 上传 | Go multipart 代理 `/admin/photos` | Dio multipart 直调同一 API |
| EXIF/压缩 | 客户端+服务端混合 | 客户端可选压缩+哈希；EXIF 以服务端为主（可后续补客户端 exif） |
| 图库管理 | GORM 或 API | 仅 API |
| 离线 | 部分本地能力 | 仅队列与配置离线；上传需网络 |

### 4.2 目录结构（拟）

```
flutter/
├── pubspec.yaml
├── analysis_options.yaml
├── README.md
├── android/
├── ios/                    # 结构预留
├── lib/
│   ├── main.dart
│   ├── app/
│   │   ├── app.dart
│   │   ├── router.dart
│   │   └── theme.dart
│   ├── core/
│   │   ├── api/            # Dio client, interceptors, endpoints
│   │   ├── auth/           # session, secure storage
│   │   ├── config/         # server url, jwt secret
│   │   ├── db/             # Drift schema (queue, recent targets)
│   │   └── error/          # 可读错误映射
│   ├── features/
│   │   ├── auth/           # 登录页
│   │   ├── upload/         # 选图、设置 sheet、队列 UI、worker
│   │   ├── gallery/        # P1
│   │   ├── albums/         # P2
│   │   ├── filmrolls/      # P2
│   │   └── settings/       # 服务器/账号/退出
│   └── l10n/               # zh / en 键值
└── test/
    ├── core/
    └── features/
```

## 5. 认证与配置

### 5.1 登录表单（对齐 Desktop）

字段：

- 服务器地址（如 `https://gallery.example.com`，规范化去尾 `/`）
- JWT Secret
- 用户名
- 密码
- 记住登录（可选；密码若记住需 secure storage，默认仅记 server + username）

流程：

1. `POST {server}/api/auth/login` body `{ username, password }`
2. 成功得到 `token` + `user`
3. 持久化：`server`、`jwtSecret`、`token`、`user` 到 secure storage / 本地配置
4. 后续请求：`Authorization: Bearer {token}`，Base URL = `{server}/api`

说明：Web 登录本身不校验客户端 JWT Secret；Secret 与 Desktop 一致用于本地配置完整性和未来可能的 token 解析/联调。401 时清会话并回到登录页。

### 5.2 会话恢复

冷启动：若 token 存在则进入主界面；首次受保护 API 401 再踢回登录。

## 6. 上传工作流

### 6.1 用户路径

1. 打开「上传」Tab → 展示队列 +「添加照片」
2. 系统相册多选（`image_picker` / `photo_manager`）；可选拍照
3. 展示默认最近目标；用户可改相册/故事/胶卷/压缩/可见/strip GPS
4. 确认入队 → 后台 worker 顺序（或并发 1–2）处理
5. 每项：hash → check-duplicate → multipart 上传 → 挂接相册/故事
6. UI 实时进度；完成/失败/重复分状态展示

### 6.2 API 契约（对齐 Desktop / Web）

**去重**

- `POST /api/admin/photos/check-duplicate` body `{ fileHashes: string[] }`

**上传**

- `POST /api/admin/photos` multipart
- 字段（与 `desktop/services/upload.go` 对齐）：
  - `file`（文件）
  - `title`
  - `origin_flag` = `mobile`（服务端已支持）
  - `file_hash`
  - `category`（可选，逗号分隔）
  - `storage_source_id` / `storage_provider` / `storage_path`（可选；默认服务端默认存储源）
  - `film_roll_id`（可选）
  - `show_flag`（默认 true；false 时传 `"false"`）
  - `compression_mode` = `compress`（若开启客户端/请求服务端压缩）
  - `max_size_mb`（可选）
  - `strip_gps` = `true`（可选）
  - `exif_json`（可选；P0 可不传，由服务端从文件提取）

**挂接（上传成功后）**

- 相册：现有 admin 相册加照片 API（与 `src/lib/api/albums.ts` 一致）
- 故事：现有 admin 故事加照片 API（与 `src/lib/api/stories.ts` 一致）
- 胶卷：若上传表单已带 `film_roll_id`，服务端入库时关联；否则走对应 admin API

**列表（P0 选目标 / P1 图库）**

- 相册列表、故事列表、胶卷列表、照片分页：现有 admin GET 端点

### 6.3 本地队列模型（Drift）

表 `upload_tasks` 核心字段：

| 字段 | 说明 |
|------|------|
| id | 本地 UUID |
| localPath | 可恢复的本地文件路径（Android 需复制到 app 私有目录，避免相册 URI 失效） |
| fileName | 展示名 |
| fileHash | SHA-256 hex |
| status | `pending` / `uploading` / `done` / `error` / `duplicate` |
| progress | 0–100 |
| errorMessage | 可读错误 |
| settingsJson | 批次设置快照（目标、压缩等） |
| photoId | 成功后服务端 id |
| attemptCount | 重试次数 |
| createdAt / updatedAt | 时间戳 |
| batchId | 同批入队分组 |

**关键约束：入队时把选中图片复制到应用沙箱**，队列只引用沙箱路径，保证杀进程后仍可读。

### 6.4 Worker 与后台

- Android：前台服务（`flutter_foreground_task` 或等价）显示上传进度通知
- 应用回到前台：恢复 pending/error（可配置自动重试）
- 并发：默认 1，可配置到 2
- 退避：指数退避 + 上限；用户可手动「全部重试」
- 幂等：始终带 `file_hash`；409 `DUPLICATE_PHOTO` 标为 `duplicate` 不重复入库

### 6.5 最近目标

本地存 `recent_targets`：相册 id 列表、故事 id 列表、胶卷 id；每次成功上传后更新。打开上传页默认填充。

## 7. UI 结构

### 导航

未登录：仅登录页  
已登录底部 Tab：

| Tab | P0 | P1 | P2 |
|-----|----|----|-----|
| 上传 | ✅ | ✅ | ✅ |
| 图库 | 占位或隐藏 | ✅ | ✅ |
| 管理 | 仅入口到设置 | 设置 | 相册/胶卷/设置 |

### 视觉

- Material 3，深浅色跟随系统
- 中英文：复用 Desktop/Web 文案键语义（`admin.*` 风格），实现独立 ARB/json
- 不要求像素级复刻 Desktop，优先拇指可达与大触控

## 8. 错误处理

| 场景 | 行为 |
|------|------|
| 无法连接服务器 | 登录/上传页明确错误，保留已填表单 |
| 登录失败 | 展示服务端 message |
| 401 | 清 token，回登录，提示会话过期 |
| 413 文件过大 | 任务 error，提示压缩或缩小 |
| 409 重复 | 状态 `duplicate`，展示已存在标题 |
| 本地文件丢失 | 任务 error，允许删除任务 |
| 相册挂接失败但上传成功 | 任务标记部分成功/可重试挂接；不删除已上传照片 |
| 系统限制后台 | 通知引导回前台；队列不丢 |

## 9. 测试与验收

### 自动化

- `flutter analyze` 无 error
- 单元测试：hash 工具、队列状态迁移、错误映射、API JSON 解析（mock Dio）
- 队列：入队 → 成功/失败/重复路径

### 真机（Android P0 必过）

对照需求冻结验收 1–10，并额外验证：

1. Desktop 同字段登录成功并记住服务器
2. 多选 20+ 图入队，进度正确
3. 杀进程后重开，pending 继续且无重复照片
4. 多相册 + 多故事挂接正确
5. 胶卷目标可选且服务端可见

### P1/P2

各自阶段计划中再列验收条；不阻塞 P0 合并。

## 10. 后端改动预期

**默认尽量零改动。** 已确认：

- `origin_flag=mobile` 已在 `hono/photos.ts` 白名单

**仅在实现中发现缺口时再补**（需单独小 PR）：

- 批量上传编排 API（可选优化，非 P0 必须）
- 移动端专用「最近目标」服务端存储（P0 用本地即可）
- 相册/故事批量挂接单接口（可选，减少串行请求）

## 11. 仓库与工程约定

- 代码位于 `flutter/`，与 `desktop/` 并列
- `flutter/.gitignore` 忽略 `build/`、`.dart_tool/` 等
- 根 README 后续可加 Flutter 一节（实现阶段或文档任务）
- 提交信息：`feat(flutter): ...` Conventional Commits
- 不在未授权时提交密钥；`.env` 类不进入仓库

## 12. 实现顺序（写入计划时展开）

1. `flutter create` 脚手架 + 主题/路由/依赖
2. API 客户端 + 登录 + secure storage
3. Drift 队列 + 沙箱拷贝 + worker
4. 上传页 UI + 目标选择 + 进度
5. 相册/故事/胶卷列表 API 与挂接
6. Android 前台服务与杀进程恢复验证
7. 测试与 `flutter analyze`
8.（后续）P1 图库 → P2 管理

## 13. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 相册 URI 失效导致无法续传 | 入队立即复制到 app 文档目录 |
| 大图 OOM / 超时 | 客户端压缩选项 + 服务端已有尺寸限制 |
| Android 后台杀进程 | 前台服务 + 任务级恢复（非字节续传） |
| 挂接中途失败 | 分步状态；上传成功与挂接解耦可重试 |
| JWT 过期中断队列 | 401 暂停队列并引导重登；重登后续传 |

## 14. 成功标准（P0）

满足 `docs/requirements/2026-03-26-mobile-upload-app.md` 验收 1–10，且：

- 工程位于 `flutter/` 可 `flutter run` 到 Android
- 登录表单字段与 Desktop 对齐
- `origin_flag=mobile` 入库可查
- 弱网/杀进程后任务可恢复且不重复入库
