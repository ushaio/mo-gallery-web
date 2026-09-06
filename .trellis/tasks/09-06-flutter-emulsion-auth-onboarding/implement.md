# 执行计划 — Flutter Emulsion 账号登录与站点连接引导流程

前置：阅读 `.agents/skills/flutter-gallery-ui/SKILL.md`、`flutter/lib/app/theme.dart`、`flutter/lib/app/ui.dart`、`flutter/lib/app/icons.dart`。

## 步骤清单

### A. 数据层（无 UI 依赖）
- [ ] A1 `flutter/lib/core/auth/official_session.dart`：`OfficialSession` 模型 + baseUrl 归一化（scheme+host）。
- [ ] A2 `flutter/lib/core/auth/official_session_store.dart`：`OfficialSessionStore` 抽象 + `SecureOfficialSessionStore`（secure storage key `official_auth_v1`）+ `MemoryOfficialSessionStore`。
- [ ] A3 `flutter/lib/core/auth/onboarding_store.dart`：shared_preferences `onboarding_completed_v1`（模仿 `LocalModeStore`）。

### B. API 与状态
- [ ] B1 `flutter/lib/features/auth/official_auth_api.dart`：login/register/me，复用 `ApiClient`（`environmentId: null`），响应解析对齐 `desktop/services/official_auth.go`。
- [ ] B2 `app/providers.dart`：`OfficialAuthController`（restore 宽限放行 / login / register / logout）+ `officialAuthControllerProvider`；`OnboardingController` + provider；`authListenableProvider` 增加对官方控制器的监听。
- [ ] B3 平台默认官方地址：Android 模拟器 `http://10.0.2.2:3001`，其余 `http://localhost:3001`。

### C. UI 组件
- [ ] C1 `flutter/lib/features/auth/official_auth_form.dart`（新）：登录/注册切换、字段校验（用户名 `^[\w\u4e00-\u9fa5-]{2,32}$`、密码 6–128）、高级服务器地址、记住登录。
- [ ] C2 `flutter/lib/features/auth/site_connect_form.dart`（新）：从现 `login_page.dart` 抽取站点连接表单（服务器/用户名/密码/记住密码 + 提交），行为不变。
- [ ] C3 重构 `login_page.dart`：仅保留品牌 masthead + `OfficialAuthForm`；移除站点表单/环境 sheet/本地模式入口。

### D. 页面与路由
- [ ] D1 `flutter/lib/features/auth/onboarding_page.dart`（新）：`AppStepStrip` 两步向导，Step1 官方账号 → Step2 `SiteConnectForm` + "暂不连接"（localMode + onboarding.complete → `/zine`）。
- [ ] D2 `flutter/lib/features/auth/connect_site_page.dart`（新）：`SiteConnectForm` + "暂不连接，进入本地模式"。
- [ ] D3 `app/router.dart`：新增 `/onboarding`、`/connect`；按 design.md §2.5 重写 redirect；`/session` 等待两层 restore。

### E. 设置页
- [ ] E1 `settings_detail_pages.dart` `AccountPage`：Emulsion 账号区块（用户名/角色/退出登录 + 确认对话框）。
- [ ] E2 `EnvironmentsPage`：加"连接新站点"→ `/connect`；"退出登录"改为断开当前站点语义（确认对话框）。

### F. i18n
- [ ] F1 `l10n/strings.dart` 新增 `official.*`、`onboarding.*`、`connect.*`、`settings.official*`（zh/en）。

### G. 验证
- [ ] G1 `cd flutter && flutter analyze` 零告警。
- [ ] G2 `cd flutter && flutter test`（现有用例不回归；若 router redirect 有既有测试则扩展新门禁分支）。
- [ ] G3 对照 PRD 验收标准手动走查：全新安装引导 / 跳过 / 已有会话直进 / 退出官方 / 断开站点 / 切换站点（需模拟器，说明截图）。

## 验证命令

```bash
cd flutter && flutter analyze
cd flutter && flutter test
```

## 回滚点

- A/B 为纯新增文件；C–E 为替换性修改但集中、边界清晰；单个 commit 可整体 revert。
- router redirect 是最高风险点：改动前先固化现有行为测试（如有），分两次提交（新增层 / 门禁切换）便于二分定位。

## 提交切分建议

1. `feat(flutter): add official account layer (session store, api, controller)`
2. `feat(flutter): onboarding wizard and connect-site page with new auth gate`
3. `feat(flutter): settings account/site management for official logout and reconnect`
