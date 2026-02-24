# 图床支持方案设计

## 现状分析

项目已有完善的存储抽象层，支持三种 provider：

| Provider | 文件位置 |
|----------|---------|
| `local` | `server/lib/storage/local.ts` |
| `github` | `server/lib/storage/github.ts` |
| `r2` | `server/lib/storage/r2.ts` |

**核心接口** [`StorageProvider`](server/lib/storage/types.ts) 定义了 `upload / delete / download / getUrl / validateConfig / move / list` 七个方法。

**工厂类** [`StorageProviderFactory.create()`](server/lib/storage/factory.ts) 根据 `config.provider` 字符串创建对应实例。

**配置来源**：`hono/photos.ts` 和 `hono/storage.ts` 中的 `getStorageConfig()` 函数从数据库 `Setting` 表读取配置。

---

## 推荐的图床服务及优先级

### 🥇 优先推荐：Cloudflare Images（新 Provider）

**理由**：
- 国际化友好，CDN 全球加速
- 专为图片设计，内置自动 WebP 转换、响应式变体（variants）
- 比 R2 更省钱（每月 5 美元 = 100k 图片存储 + 500k 转换）
- API 简单，S3 兼容度高
- 支持缩略图变体，可替代当前的 `thumb-` 前缀方案

### 🥇 优先推荐：S3 兼容通用 Provider

**理由**：
- 一套代码覆盖：AWS S3、阿里云 OSS、腾讯云 COS、MinIO、Backblaze B2、DigitalOcean Spaces 等
- 这些服务都兼容 AWS S3 SDK（`@aws-sdk/client-s3`）
- 现有 R2 provider 本质上就是 S3 兼容实现，只需泛化即可
- **改动最小，收益最大**

### 🥈 次选推荐：Imgur / SM.MS（免费图床）

**理由**：
- 个人用户友好，免费额度充足
- 但 API 限制多，不适合生产场景

---

## 推荐实施方案

### 方案一：泛化 S3 兼容 Provider（最推荐）

将现有 [`R2StorageProvider`](server/lib/storage/r2.ts) 升级为通用 S3 兼容 Provider，通过配置区分不同云厂商。

```
StorageConfig.provider: 'local' | 'github' | 'r2' | 's3'
```

**S3 兼容厂商预设**（可选择，自动填充 endpoint）：

| 厂商 | Endpoint 格式 |
|------|-------------|
| AWS S3 | `https://s3.{region}.amazonaws.com` |
| 阿里云 OSS | `https://oss-{region}.aliyuncs.com` |
| 腾讯云 COS | `https://{bucket}.cos.{region}.myqcloud.com` |
| MinIO（自建） | 自定义 |
| Backblaze B2 | `https://s3.{region}.backblazeb2.com` |
| DigitalOcean | `https://{region}.digitaloceanspaces.com` |

**优势**：复用现有 `@aws-sdk/client-s3`，无需新增依赖。

---

### 方案二：新增 Cloudflare Images Provider

专门利用 Cloudflare Images 的变体（variants）系统替代当前 `thumb-` 方案。

---

## 数据库 Schema 变更（最小改动）

[`prisma/schema.prisma`](prisma/schema.prisma) 中 `StorageConfig.provider` 类型字符串扩展：

```
// Setting 表新增配置键（无需改表结构）
storage_provider: 's3'           // 新增 's3' 选项
s3_access_key_id
s3_secret_access_key
s3_bucket
s3_endpoint
s3_public_url
s3_path
s3_region
s3_vendor_preset            // 预设厂商：'aws' | 'aliyun' | 'tencent' | 'backblaze' | 'do' | 'custom'
```

Photo 模型中 `storageProvider` 字段值新增 `'s3'`，其余字段无需变更。

---

## 后端实现

### 1. 更新类型定义

[`server/lib/storage/types.ts`](server/lib/storage/types.ts)：

```typescript
export interface StorageConfig {
  provider: 'local' | 'github' | 'r2' | 's3'  // 新增 's3'
  
  // 新增 S3 通用配置
  s3AccessKeyId?: string
  s3SecretAccessKey?: string
  s3Bucket?: string
  s3Endpoint?: string
  s3PublicUrl?: string
  s3Path?: string
  s3Region?: string
  s3VendorPreset?: 'aws' | 'aliyun' | 'tencent' | 'backblaze' | 'do' | 'custom'
}
```

### 2. 新建 S3 Provider

新文件 [`server/lib/storage/s3.ts`](server/lib/storage/s3.ts)，逻辑与 R2 类似但：
- 支持 `s3Region` 参数
- 根据 `s3VendorPreset` 自动生成 endpoint
- `upload()` 方法设置 `ACL: 'public-read'`（R2 不支持 ACL）

### 3. 更新工厂类

[`server/lib/storage/factory.ts`](server/lib/storage/factory.ts) 新增 `case 's3'`。

### 4. 更新 getStorageConfig

[`hono/photos.ts`](hono/photos.ts) 和 [`hono/storage.ts`](hono/storage.ts) 的 `getStorageConfig()` 新增 `case 's3'`。

---

## 前端实现

### 1. 更新设置页面

[`src/app/admin/settings/SettingsTab.tsx`](src/app/admin/settings/SettingsTab.tsx)：
- 存储 Provider 选择器新增 `s3` 选项
- 新增 S3 配置表单区块（类似现有 R2 配置区块）
- 新增厂商预设下拉选择，选择后自动填充 Endpoint

```
┌─────────────────────────────────────────┐
│ Provider: [S3 兼容存储  ▼]              │
├─────────────────────────────────────────┤
│ 厂商预设: [阿里云 OSS  ▼]  → 自动填充   │
│ Access Key ID: [___________________]    │
│ Secret Access Key: [________________]  │
│ Bucket: [_____] Region: [__________]   │
│ Endpoint: [https://oss-cn-...] (可改)   │
│ Public URL: [https://bucket.oss-...]    │
│ 存储路径: [photos/]                     │
│ [测试连接]                              │
└─────────────────────────────────────────┘
```

### 2. 更新存储管理页面

[`src/app/admin/storage/page.tsx`](src/app/admin/storage/page.tsx)：
- Provider 选择器新增 `s3` 选项

### 3. 更新 API 类型

[`src/lib/client-db.ts`](src/lib/client-db.ts)（或 `api.ts`）：
- `AdminSettingsDto` 新增 S3 相关字段

---

## 架构图

```mermaid
graph TB
    UploadTab[上传页面] -->|POST /admin/photos| PhotosAPI[hono/photos.ts]
    PhotosAPI --> getStorageConfig[getStorageConfig]
    getStorageConfig --> DB[(Setting 表)]
    getStorageConfig -->|provider=s3| S3Config[S3Config]
    S3Config --> Factory[StorageProviderFactory]
    Factory -->|case s3| S3Provider[S3StorageProvider]
    S3Provider -->|@aws-sdk/client-s3| AliyunOSS[阿里云 OSS]
    S3Provider --> TencentCOS[腾讯云 COS]
    S3Provider --> AWSS3[AWS S3]
    S3Provider --> MinIO[MinIO 自建]
    S3Provider --> BackblazeB2[Backblaze B2]
    
    SettingsTab[设置页面] -->|保存配置| SettingsAPI[hono/settings.ts]
    SettingsAPI -->|写入| DB
```

---

## 实施步骤（按优先级）

### 阶段一：S3 兼容 Provider（核心）

1. **更新** [`server/lib/storage/types.ts`](server/lib/storage/types.ts) - 新增 S3 类型定义
2. **新建** `server/lib/storage/s3.ts` - S3 通用 Provider 实现
3. **更新** [`server/lib/storage/factory.ts`](server/lib/storage/factory.ts) - 注册 S3 Provider
4. **更新** [`server/lib/storage/index.ts`](server/lib/storage/index.ts) - 导出 S3 Provider
5. **更新** `getStorageConfig()` - 在 `hono/photos.ts` 和 `hono/storage.ts` 中新增 s3 case
6. **更新** [`src/lib/client-db.ts`](src/lib/client-db.ts) - `AdminSettingsDto` 新增 S3 字段
7. **更新** [`src/app/admin/settings/SettingsTab.tsx`](src/app/admin/settings/SettingsTab.tsx) - 新增 S3 配置 UI
8. **更新** [`src/app/admin/storage/page.tsx`](src/app/admin/storage/page.tsx) - Provider 选项新增 s3

### 阶段二：测试连接功能（体验提升）

9. **新建** API 端点 `POST /admin/storage/test-connection` - 验证配置是否可连通
10. **更新** 设置页面 - 添加"测试连接"按钮

### 阶段三：厂商预设（便利性）

11. 前端实现厂商预设选择，自动填充 endpoint/region
12. 对各厂商做集成测试

---

## 安全注意事项

- Secret Key 保存在数据库 `Setting` 表，与现有 GitHub Token / R2 密钥一致，均未明文暴露给前端
- `hono/middleware/auth.ts` 的 `authMiddleware` 保护所有 `/admin/storage/*` 端点
- S3 Provider 中不向日志输出 Secret Key

---

## 无需改动的部分

- [`prisma/schema.prisma`](prisma/schema.prisma) - `Photo.storageProvider` 字段类型为 `String`，无需 migration
- [`server/lib/storage/local.ts`](server/lib/storage/local.ts) - 本地存储不变
- [`server/lib/storage/github.ts`](server/lib/storage/github.ts) - GitHub 存储不变  
- [`server/lib/storage/r2.ts`](server/lib/storage/r2.ts) - R2 存储保留（可选：共用 S3 实现）
- 上传队列 [`src/contexts/UploadQueueContext.tsx`](src/contexts/UploadQueueContext.tsx) - 无需变更
- 所有图片展示相关组件 - 无需变更

