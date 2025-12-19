# 外部后端接口约定

本仓库已移除 Next.js 后端能力，仅保留纯前端。以下接口需要由**外部后端服务**提供，前端通过 `NEXT_PUBLIC_API_URL` 访问。

## 数据模型（参考）

### User (用户)
- id, email, password, name
- 用于管理员认证

### Album (相册)
- id, title, description, slug, coverImage, order, published
- 组织照片的相册

### Photo (照片)
- id, title, description, filename, url, thumbnailUrl
- width, height, size, storageProvider, storageKey
- albumId, order, published, exif

### Setting (设置)
- id, key, value
- 站点配置

## 接口列表

### 认证 API

#### POST /api/auth/register
注册新用户
```json
{
  "email": "admin@example.com",
  "password": "password123",
  "name": "Admin"
}
```

#### POST /api/auth/login
用户登录
```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```

返回:
```json
{
  "token": "jwt-token",
  "user": { "id": "...", "email": "...", "name": "..." }
}
```

### 照片 API

#### GET /api/photos
获取照片列表
- Query: `albumId`, `published`

#### POST /api/photos
上传照片 (需要认证)
- Content-Type: multipart/form-data
- Fields: file, title, description, albumId, storageProvider

#### GET /api/photos/[id]
获取单张照片

#### PATCH /api/photos/[id]
更新照片 (需要认证)
```json
{
  "title": "新标题",
  "description": "新描述",
  "published": true,
  "order": 1
}
```

#### DELETE /api/photos/[id]
删除照片 (需要认证)

### 相册 API

#### GET /api/albums
获取相册列表
- Query: `published`

#### POST /api/albums
创建相册 (需要认证)
```json
{
  "title": "相册标题",
  "description": "相册描述",
  "slug": "album-slug",
  "coverImage": "https://..."
}
```

#### GET /api/albums/[id]
获取单个相册及其照片

#### PATCH /api/albums/[id]
更新相册 (需要认证)

#### DELETE /api/albums/[id]
删除相册 (需要认证)

## 认证

所有需要认证的请求需要在 Header 中包含:
```
Authorization: Bearer <jwt-token>
```
## 安全建议（后端侧）

1. 使用 HTTPS
2. 配置 CORS 白名单（允许前端域名）
3. 启用 Rate Limiting / WAF
4. 妥善管理 JWT 密钥与存储密钥
