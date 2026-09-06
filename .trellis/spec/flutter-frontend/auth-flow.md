# 两级认证门禁（Emulsion 官方账号 + 站点连接）

来源：任务 09-06-flutter-emulsion-auth-onboarding。对齐 desktop 端 `desktop/services/official_auth.go` 与 `SetupPage` 语义。

## 门禁顺序（flutter/lib/app/router.dart redirect）

两条身份线独立、串行门禁，`/session` 是唯一等待页（任一线 restore 中都只放行它）：

```
Gate 1 官方账号（必选）  未登录 → 只放行 /login
Gate 2 首次引导（一次）  未完成 → 只放行 /onboarding
之后按站点状态路由：
  有站点会话            → /gallery（仅 /login、/onboarding 被送回）
  本地模式              → /zine（server-backed 路由 /gallery /stories /upload 送回 /zine）
  其余（无站点未选择）  → /connect 唯一出口
```

关键不变式：
- `/connect` **不在** `_preConnectionRoutes`（仅 `/login`、`/onboarding`）：已登录后它仍是"连接新站点"入口。从环境页进入带 route extra `ConnectSiteAddMode`（add-mode 调 `AuthController.addEnvironment` 建新环境并 pop；门禁模式调 `login` 且无返回键）。
- 本地模式唯一入口 = "暂不连接站点"（onboarding Step2 与 `/connect` 的次级动作 → `localMode.enable()`）。登录页无本地模式按钮。
- `authListenableProvider` 必须监听 official/site/onboarding 三条线，否则门禁不刷新。

## 官方账号层契约

- 存储：flutter_secure_storage key `official_auth_v1`（JSON：baseUrl/token/userId/username/role/rememberLogin）；引导标记 shared_preferences key `onboarding_completed_v1`。
- 端点（`features/auth/official_auth_api.dart`，复用 `ApiClient` 但**不注入 onUnauthorized**——官方 401 绝不能触发站点登出）：`POST {base}/api/auth/login|register`（注册即登录），`GET {base}/api/auth/me`（Bearer）。
- baseUrl 归一化只保留 scheme+host；默认地址 Android 模拟器 `http://10.0.2.2:3001`，其余 `http://localhost:3001`。
- `/auth/me` 网络异常（无 statusCode）宽限放行用缓存会话；401/403 及 HTTP 200 + envelope `{success:false}`（抛 `statusCode: 401`）清会话。
- 校验规则同 desktop：用户名 `^[\w\u4e00-\u9fa5-]{2,32}$`，密码 6–128 位。
- 退出 Emulsion 只清官方凭证，不动站点环境；断开站点只清站点 token，不动 Emulsion。

## 已知陷阱

- `AuthController.login` 会复用活跃环境的 `environmentId` 原地覆盖——"新增站点"必须走 `addEnvironment`，否则当前环境被替换。
- 改动 router redirect 时每分支必须有显式放行清单，否则易引入重定向死循环。
