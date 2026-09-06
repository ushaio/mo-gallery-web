# Flutter Emulsion 账号登录与站点连接引导流程

## Goal

Flutter 端复刻 desktop 端认证体系：进入 app 必须先登录 Emulsion 官方账号（支持注册），登录后才能连接自建站点（可跳过）；设置页支持切换站点与退出 Emulsion 登录。首次使用出现两步引导向导。

## Background

Desktop 端（`desktop/frontend/src` + `desktop/services/official_auth.go`）已有成熟的双账号体系：

- **Emulsion 官方账号（必选）**：`OfficialLogin/OfficialRegister` → `{official_base}/api/auth/login|register`，`GET /api/auth/me` 校验恢复，token 加密持久化；未登录只渲染 `/login`。
- **站点连接（可选）**：连接自建 MO Gallery 站点（`/api/auth/login`，支持 `/login/<slug>` 端点），可跳过，跳过后本地功能照常。
- **引导**：`SetupPage` 两步向导——Step 0 官方账号（必须完成才能下一步），Step 1 连接站点（可"暂不连接"）。

Flutter 端现状：已有完整的**站点多环境连接**层（`AuthController` + `SessionStore` 多环境 + `parseServerEndpoint`），有"本地模式"（`localModeProvider`，免站点进入 Zine）；**完全没有 Emulsion 官方账号层**。

## Requirements

### R1 启动门禁（官方账号必选）
- App 启动恢复期显示会话门禁页（现有 `/session`）。
- 未登录 Emulsion 账号时，无论是否已有站点会话/本地模式，一律只显示 Emulsion 登录页（`/login`），页面提供登录/注册切换。
- 已登录 Emulsion 后按站点状态路由（见 R3）。

### R2 首次使用引导向导
- 首次使用（未完成引导）且已登录 Emulsion 时进入两步向导 `/onboarding`：
  - **Step 1 — Emulsion 账号**：登录或创建账号（用户名/密码/确认密码，高级选项可改官方服务器地址，记住登录默认开启）。已有账号直接登录；未完成本步不能进入下一步。
  - **Step 2 — 连接站点**：站点地址（根地址或 `/login/<安全后缀>`）/用户名/密码，连接成功进入 app；提供"暂不连接"跳过，跳过即进入本地模式（复用现有 `localMode` 机制）。
- 引导完成状态持久化，完成后不再出现。

### R3 登录后的路由
- 已登录 Emulsion + 有站点会话 → `/gallery`。
- 已登录 Emulsion + 无站点会话 + 本地模式 → `/zine`。
- 已登录 Emulsion + 无站点会话 + 非本地模式 → `/connect`（连接站点页，含"暂不连接，进入本地模式"次级动作）。

### R4 设置页
- **账号页**：展示 Emulsion 账号信息（用户名、角色），提供"退出 Emulsion 登录"；保留现有站点环境/服务器信息展示。
- **环境页**：保留多站点切换/删除；"连接新站点"改为跳转 `/connect`（替代现有"退出站点登录再去登录页"的加环境路径）；"退出登录"语义调整为断开当前站点会话（保留 Emulsion 登录）。
- 退出 Emulsion 登录后回到 `/login`。

### R5 约束
- UI 严格遵循 flutter-gallery-ui skill：仅用 `ui.dart` kit、`AppIcons.*`、设计 tokens、`strings.dart` i18n，无 Material 原生组件/硬编码字面量。
- 官方账号 token 持久化于 flutter_secure_storage（对齐 desktop 的加密持久化）。
- 现有站点多环境、静默重登、上传队列行为不回归。

## Acceptance Criteria

- [ ] 全新安装：启动 → 门禁 → Emulsion 登录页 → 注册或登录 → 引导向导 Step 2 → 连接站点成功进入 `/gallery`；或跳过进入 `/zine`（本地模式）。
- [ ] 引导 Step 1 未完成官方登录时无法进入 Step 2。
- [ ] 已登录 Emulsion + 已有站点会话：启动直接 `/gallery`，不出现向导。
- [ ] 已登录 Emulsion + 无站点会话 + 非本地模式：进入 `/connect`，可连接或跳过。
- [ ] 设置 → 账号：显示 Emulsion 用户名/角色，退出后回到 `/login`。
- [ ] 设置 → 环境：可切换/删除站点、经 `/connect` 连接新站点；断开站点后保留 Emulsion 登录。
- [ ] `cd flutter && flutter analyze` 通过；现有 `flutter test`（若有）不回归。

## Notes

- 复杂任务：技术设计见 `design.md`，执行计划见 `implement.md`。
- 端点对齐参考：`desktop/services/official_auth.go`（官方账号）、`desktop/services/auth.go`（站点，Flutter 已对齐）。
