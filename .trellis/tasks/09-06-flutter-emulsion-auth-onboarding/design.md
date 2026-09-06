# 技术设计 — Flutter Emulsion 账号登录与站点连接引导流程

## 1. 总体结构

在现有"站点会话层"（`AuthController` + `SessionStore`）之上新增独立的"官方账号层"，router 门禁串成两级：

```
启动 → /session（等待两层 restore）
  ├─ 官方未登录            → /login（Emulsion 登录/注册）
  ├─ 未完成引导            → /onboarding（两步向导）
  ├─ 有站点会话            → /gallery
  ├─ 本地模式              → /zine
  └─ 其余                  → /connect（连接站点，可跳过转本地模式）
```

两条会话线完全独立：退出 Emulsion 不清除站点环境数据（desktop 同款语义——`OfficialLogout` 只清 `cfg.Official.*`）；断开站点不动官方账号。

## 2. 新增模块

### 2.1 数据模型与存储 — `core/auth/official_session.dart` + `official_session_store.dart`

```dart
class OfficialSession {
  final String baseUrl;      // 官方服务地址（scheme+host，归一化）
  final String token;        // JWT
  final String userId;
  final String username;
  final String role;         // admin / user …
  final bool rememberLogin;
  bool get isAuthenticated => token.isNotEmpty;
}
```

- `OfficialSessionStore`（抽象 + `SecureOfficialSessionStore` + `MemoryOfficialSessionStore` 测试实现），flutter_secure_storage key：`official_auth_v1`，JSON 序列化。结构模仿 `core/auth/session_store.dart`。
- secure storage 即对齐 desktop 的 AES-GCM 加密持久化，无需自建加密。

### 2.2 API — `features/auth/official_auth_api.dart`

复用 `ApiClient`（`baseUrl` 可注入、`environmentId: null` 使 401 回调短路），端点对齐 `desktop/services/official_auth.go`：

| 端点 | Method | Body / 头 | 响应 |
|---|---|---|---|
| `{base}/api/auth/login` | POST | `{username, password}` | `{success, token, user:{id, username, role}}` |
| `{base}/api/auth/register` | POST | `{username, password}` | 同上（注册即登录） |
| `{base}/api/auth/me` | GET | `Authorization: Bearer` | `{success, data: OfficialUser}` |

- baseUrl 归一化：只保留 scheme+host（对齐 `NormalizeOfficialBaseURL`）。
- 校验规则对齐 `OfficialAuthForm.tsx`：用户名 `^[\w\u4e00-\u9fa5-]{2,32}$`，密码 6–128 位。
- 默认服务器地址：`http://localhost:3001`；Android 模拟器默认 `http://10.0.2.2:3001`（与 `zine_plaza.dart` 的 plaza_url 默认值一致），实现为平台判断。

### 2.3 状态 — `app/providers.dart` 新增

- `OfficialAuthController extends StateNotifier<AsyncValue<OfficialSession?>>`：
  - `restore()`：读 store → 有 token 则 `GET /auth/me` 校验；**网络异常宽限放行**（用缓存会话，对齐 desktop `GetOfficialAuthState` 的断网策略）；401/403 清除会话。
  - `login(baseUrl, username, password, rememberLogin)` / `register(...)`：成功写 store + state。
  - `logout()`：清 store + state（不动站点 `SessionStore`）。
- `officialAuthControllerProvider`。
- `OnboardingController extends StateNotifier<bool>`（已完成与否）+ `OnboardingStore`：shared_preferences key `onboarding_completed_v1`，结构模仿 `LocalModeStore`/`ThemeModeStore`；`complete()` 持久化。
- `authListenableProvider` 同时监听 `officialAuthControllerProvider`，保证官方登录/登出驱动 router 刷新。

### 2.4 UI

#### `/login` — 重构为 Emulsion 登录页（`features/auth/login_page.dart`）
- 保留品牌 masthead / 双栏布局骨架（`_Wordmark`、brand panel 复用）。
- 表单改为 `OfficialAuthForm`：`AppSegmented` 登录/创建账号切换；字段用户名/密码/（注册时确认密码）；高级选项折叠官方服务器地址（预填默认值）；"记住登录" `AppCheckbox`。
- 移除：站点地址字段、环境选择 sheet、本地模式入口（本地模式唯一入口变为引导/`/connect` 的"暂不连接"）。

#### `/onboarding` — `features/auth/onboarding_page.dart`（新）
- `AppStepStrip` 步骤条 + `AppBottomAction` 底部主/次动作（kit 已有 wizard 原语）。
- Step 1：内嵌 `OfficialAuthForm`，官方会话就绪后"下一步"可用；已登录用户进入向导时本步直接显示已登录态可跳过。
- Step 2：内嵌 `SiteConnectForm`（见下），"暂不连接" = `localMode.enable()` + `onboarding.complete()` → `/zine`；连接成功 = `onboarding.complete()` → router 自动放行 `/gallery`。
- 阻断返回：未完成引导时 router 把其它路由重定向回 `/onboarding`（对齐 desktop `!setupState.completed → /setup`）。

#### `SiteConnectForm` — 从现 login 表单抽取（`features/auth/site_connect_form.dart`，新）
- 现登录页的站点地址/用户名/密码/记住密码 + 错误展示 + 提交逻辑抽成独立 widget，供 `/onboarding` Step 2 与 `/connect` 复用；内部调 `authControllerProvider.login(...)`（多环境保存逻辑不变）。

#### `/connect` — `features/auth/connect_site_page.dart`（新）
- `AppScreen` + 标题 + `SiteConnectForm`；次级按钮"暂不连接，进入本地模式"（同 onboarding skip 语义）。
- 无站点会话且非本地模式时由 router 送入；连接成功后 router 自动离开。

#### 设置页改动（`features/settings/settings_detail_pages.dart`）
- `AccountPage`：顶部 `SettingsGroup` 增加 Emulsion 区块——用户名、角色 chip（`AppStatusChip`）、"退出 Emulsion 登录"（`AppButton` danger outlined，确认对话框后调 `officialAuthController.logout()`，router 自动回 `/login`）。
- `EnvironmentsPage`：`_signOutToLogin` 改为 `context.push('/connect')`（"连接新站点"）；底部"退出登录"按钮语义改为"断开当前站点"——调 `authController.logout()` 后 router 因无站点会话且非本地模式送至 `/connect`（如用户更愿意直接留在本地模式，断开时给确认对话框说明）。

### 2.5 Router — `app/router.dart`

redirect 重写（伪码）：

```
official = officialAuthController; onboardingDone; site = authController
if (official.isLoading || site.isLoading) → /session
if (!officialLoggedIn)  → /login（/login 与 /session 放行，其余拦截）
if (!onboardingDone)    → /onboarding 放行，其余 → /onboarding
// 官方已登录且引导完成：
if (siteSession != null) → 登录类页面(/login,/onboarding,/connect) → /gallery；其余放行
if (localMode) → 登录类页面 → /zine；其余放行（server-backed 分支仍由现有规则送 /zine）
→ /connect 放行；其余 → /connect
```

新增路由：`/onboarding`、`/connect`。`_serverBackedRoutes` 的本地模式拦截逻辑保留。

## 3. 数据流

```
OfficialAuthForm.submit
  → OfficialAuthController.login/register
  → OfficialAuthApi(POST {official_base}/api/auth/login|register)
  → SecureOfficialSessionStore.write（secure storage）
  → state 就绪 → router refresh → /onboarding

SiteConnectForm.submit
  → AuthController.login（现有链路：POST {site}/api/auth/login → SessionStore 多环境）
  → router refresh → /gallery

官方 logout：OfficialAuthController.logout → router → /login（站点数据保留）
站点断开：AuthController.logout → router → /connect
```

## 4. 兼容与风险

| 风险 | 对策 |
|---|---|
| 老用户升级后被强制官方登录（行为变化，符合产品要求 R1） | 站点会话/本地模式数据保留，官方登录后无缝恢复 |
| router redirect 复杂度上升引入死循环 | redirect 单一出口、每分支显式放行清单；`flutter test` 补 redirect 单测（现有 router 测试若存在则扩展） |
| 本地模式入口从登录页移除 | `/connect` 与 onboarding 均提供"暂不连接"等价入口 |
| `ApiClient` 复用于官方请求时 401 触发站点登出回调 | `environmentId: null` 使 `onUnauthorized` 短路（现有语义已支持） |

回滚点：新增模块均为独立文件，router/settings 改动为小面积替换，`git revert` 单提交可回滚。

## 5. i18n

`l10n/strings.dart` 新增 key（zh/en）：`official.*`（登录/注册/服务器地址/记住登录/校验错误）、`onboarding.*`（步骤标题/下一步/跳过）、`connect.*`（标题/暂不连接）、`settings.officialSection/officialLogout` 等。
