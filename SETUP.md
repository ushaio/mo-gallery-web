# 前端对接后端设置指南

本项目为纯前端（Next.js 静态导出），通过 `NEXT_PUBLIC_API_URL` 访问外部后端。

## 1. 配置后端地址

在 `.env.local` 中配置外部后端地址（必须）：

```env
NEXT_PUBLIC_API_URL="http://localhost:8787"
```

## 2. 后端需要提供的接口

（需后端开启 CORS 允许前端域名）

### 公共接口

- `GET /api/photos`（Query: `category` / `limit`）
- `GET /api/photos/featured`
- `GET /api/categories`

### 认证接口

- `POST /api/auth/login`
  ```json
  { "username": "admin", "password": "admin123" }
  ```

### 管理端接口（需 Token）

- `POST /api/admin/photos`（multipart/form-data: `file` / `title` / `category`）
- `DELETE /api/admin/photos/:id`
- `GET /api/admin/settings`
- `PATCH /api/admin/settings`

## 3. 本地验证流程

1. 启动开发服务器：
   ```bash
   npm run dev
   ```
2. 访问：`http://localhost:3000/login`
3. 输入后端提供的管理员账号（默认示例：`admin` / `admin123`）
4. 登录成功后进入 `/admin`：
   - 照片管理：拉取照片并支持删除
   - 上传照片：上传到 `/api/admin/photos`
   - 系统配置：读取与保存 `/api/admin/settings`

## 4. Token 说明

所有管理端请求需要在 Header 中携带：

```
Authorization: Bearer <token>
```
