# 登录功能设置指南

## 已完成功能

✅ 前端对接外部后端 (登录/注册)
✅ 前端登录页面
✅ 认证上下文和状态管理
✅ 导航栏登录/退出按钮
✅ 管理后台路由保护

## 配置外部后端

1. 在 `.env` 中配置外部后端地址（必须）：
```env
NEXT_PUBLIC_API_URL="http://localhost:8080"
```

2. 确保外部后端已实现并开放以下接口（需要 CORS 允许前端域名）：
- `POST /api/auth/login`
- `POST /api/auth/register`

## 创建管理员账号

使用 curl 或 Postman 调用外部后端注册 API（将 `BASE_URL` 替换为 `NEXT_PUBLIC_API_URL`）：
```bash
BASE_URL="http://localhost:8080"
curl -X POST $BASE_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123","name":"Admin"}'
```

## 测试登录

1. 启动开发服务器:
```bash
npm run dev
```

2. 访问 http://localhost:3000/login

3. 使用创建的账号登录:
   - 邮箱: `admin@example.com`
   - 密码: `admin123`

4. 登录成功后会跳转到 `/admin` 管理后台

## 功能说明

### 前端路由

- `/login` - 登录页面
- `/admin` - 管理后台 (需要登录)
- 导航栏会根据登录状态显示不同内容

### API 端点

- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册
- 所有管理 API 需要在 Header 中携带 JWT token:
  ```
  Authorization: Bearer <token>
  ```

### 认证流程

1. 用户在登录页面输入邮箱和密码
2. 前端调用外部后端 `/api/auth/login` API
3. 外部后端验证密码，返回 JWT token
4. 前端将 token 存储在 localStorage
5. 后续请求在 Header 中携带 token
6. 受保护的路由会检查认证状态

### 退出登录

- 点击导航栏的"退出"按钮
- 或在管理后台侧边栏点击"退出登录"
- 会清除 localStorage 中的 token 并跳转到首页

## 安全建议

1. 外部后端务必使用 HTTPS
2. 外部后端启用 CORS 白名单、Rate Limit 等安全策略
3. 前端避免在 `NEXT_PUBLIC_*` 中存放任何敏感信息
