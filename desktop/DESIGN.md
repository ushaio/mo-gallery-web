# MO Gallery Desktop — 设计文档

## 概述

使用 **Wails v2** (Go + React) 构建的桌面管理端，完整复刻 mo-gallery-web 的后台管理功能。

### 架构选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 框架 | Wails v2 | Go 后端 + WebView 前端，原生桌面体验 |
| 后端语言 | Go 1.22+ | 业务逻辑、数据库、文件处理 |
| 前端框架 | React 19 + TypeScript | 复用 Web 端设计语言和组件模式 |
| 样式 | Tailwind CSS 4 | 与 Web 端保持一致 |
| ORM | GORM | 直接操作 PostgreSQL |
| 构建 | wails build | Windows 打包为单 .exe |

### 混合架构策略

Go 后端根据**具体业务场景**灵活选择数据路径，而非按模块固定分组：

- **API 网关模式**：Go 作为中间层，转发请求给 mo-gallery-web API（适用于依赖 Web 后端特有逻辑的场景，如 AI 生成、JWT 认证等）
- **直连数据库模式**：Go 直接通过 GORM 操作 PostgreSQL（适用于追求性能、离线可用、或本地文件处理的场景）
- **同一条业务线也可能混合**：比如照片上传，元数据写入走直连 DB，但存储策略可能需要读取 Web 端的设置

每个功能在实现时再确认具体走哪条路径。

```
┌──────────────────────────────────────────────────┐
│               Desktop App (Wails)                │
│  ┌──────────────┐  ┌───────────────────────────┐ │
│  │  Go Backend  │  │  React Frontend (WebView) │ │
│  │  ┌─────────┐ │  │                           │ │
│  │  │Services │ │  │   Photos / Albums / ...   │ │
│  │  └────┬────┘ │  │                           │ │
│  └───────┼──────┘  └───────────────────────────┘ │
│          │                                       │
│  ┌───────┴───────────────────────────────────┐   │
│  │           按业务场景选择路径               │   │
│  │                                           │   │
│  │   ┌─────────────┐   ┌─────────────────┐   │   │
│  │   │  直连 DB    │   │  API 网关代理   │   │   │
│  │   │  (GORM→PG)  │   │  (→ Web API)    │   │   │
│  │   └──────┬──────┘   └───────┬─────────┘   │   │
│  └──────────┼──────────────────┼─────────────┘   │
└─────────────┼──────────────────┼─────────────────┘
              ▼                  ▼
        PostgreSQL         mo-gallery-web API
        (直接连接)          (HTTP, JWT Auth)
```

> **注意**：具体每个功能走哪条路径，待实现该功能时逐一确认。设计文档后续会按功能标注实际路径。

---

## 项目结构

```
desktop/
├── main.go                      # Wails 入口
├── wails.json                   # Wails 配置
├── go.mod
├── go.sum
│
├── app.go                       # App struct — 所有绑定方法的注册
│
├── config/
│   └── config.go                # 配置管理 (DB URL, API URL, JWT Secret 等)
│
├── db/
│   ├── db.go                    # GORM 连接初始化
│   ├── models.go                # 所有数据模型 (对应 Prisma schema)
│   └── seed.go                  # 种子数据 (可选)
│
├── middleware/
│   └── auth.go                  # API 代理时的 JWT 注入
│
├── services/                    # 业务逻辑层
│   ├── photo.go                 # 照片 CRUD、批量操作、上传处理
│   ├── album.go                 # 相册 CRUD、照片关联
│   ├── story.go                 # 故事 CRUD、照片关联、排序
│   ├── blog.go                  # 博客 CRUD
│   ├── filmroll.go              # 胶卷 CRUD、照片关联、帧排序
│   ├── friend.go                # 友链 CRUD、排序
│   ├── comment.go               # 评论 CRUD、审核
│   ├── category.go              # 分类查询
│   ├── equipment.go             # 相机/镜头查询
│   ├── storage.go               # 存储扫描、清理、修复
│   ├── storage_source.go        # 存储源 CRUD
│   ├── settings.go              # 设置读写
│   ├── upload.go                # 上传流水线 (EXIF/压缩/缩略图/哈希/存储)
│   ├── ai.go                    # AI 助手 (API 代理)
│   └── proxy.go                 # 通用 API 代理客户端
│
├── storage/                     # 存储提供者抽象
│   ├── provider.go              # StorageProvider 接口
│   ├── local.go                 # 本地文件系统
│   ├── s3.go                    # S3 / R2
│   └── github.go                # GitHub API
│
├── image/                       # 图像处理
│   ├── exif.go                  # EXIF 提取
│   ├── compress.go              # AVIF 压缩
│   ├── thumbnail.go             # 缩略图生成
│   ├── colors.go                # 主色提取
│   └── hash.go                  # 文件哈希
│
├── frontend/                    # React 前端
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   │
│   ├── src/
│   │   ├── main.tsx             # React 入口
│   │   ├── App.tsx              # 路由 + 布局
│   │   │
│   │   ├── bindings/            # Wails 自动生成的 Go 绑定 (或手写)
│   │   │   └── go/
│   │   │       ├── App.d.ts     # TypeScript 类型声明
│   │   │       └── App.js       # JS 调用桥
│   │   │
│   │   ├── lib/                 # 工具函数
│   │   │   ├── api.ts           # API 代理调用封装
│   │   │   ├── utils.ts         # 通用工具
│   │   │   └── i18n.ts          # 国际化 (zh/en)
│   │   │
│   │   ├── hooks/               # 自定义 hooks
│   │   │   ├── useAuth.ts
│   │   │   ├── usePhotos.ts
│   │   │   └── ...
│   │   │
│   │   ├── components/          # UI 组件
│   │   │   ├── ui/              # 基础 UI 原子 (button, input, dialog...)
│   │   │   ├── layout/          # 布局组件 (sidebar, header)
│   │   │   ├── photo/           # 照片相关组件
│   │   │   ├── album/           # 相册相关组件
│   │   │   ├── story/           # 故事相关组件
│   │   │   ├── blog/            # 博客相关组件
│   │   │   ├── filmroll/        # 胶卷相关组件
│   │   │   ├── upload/          # 上传相关组件
│   │   │   ├── ai/              # AI 助手组件
│   │   │   ├── storage/         # 存储清理组件
│   │   │   ├── settings/        # 设置组件
│   │   │   └── friends/         # 友链组件
│   │   │
│   │   ├── pages/               # 页面 (对应 9 个管理模块)
│   │   │   ├── PhotosPage.tsx
│   │   │   ├── AlbumsPage.tsx
│   │   │   ├── FilmRollsPage.tsx
│   │   │   ├── UploadPage.tsx
│   │   │   ├── StoriesPage.tsx
│   │   │   ├── BlogsPage.tsx
│   │   │   ├── AiAssistantPage.tsx
│   │   │   ├── StoragePage.tsx
│   │   │   ├── SettingsPage.tsx
│   │   │   └── FriendsPage.tsx
│   │   │
│   │   ├── store/               # 状态管理 (Zustand)
│   │   │   ├── auth.ts
│   │   │   ├── preferences.ts
│   │   │   └── uploadQueue.ts
│   │   │
│   │   └── types/               # TypeScript 类型
│   │       └── index.ts
│   │
│   └── public/
│       └── favicon.ico
│
└── build/                       # Wails 构建配置
    ├── README.md
    ├── windows/
    │   ├── icon.ico
    │   └── info.json            # Windows 版本信息
    └── appicon.png
```

---

## 数据模型映射

GORM 模型与 Prisma schema 一一对应。关键映射：

| Prisma | GORM | 说明 |
|--------|------|------|
| `@id @default(uuid())` | `gorm:"type:uuid;default:gen_random_uuid()"` | PostgreSQL uuid |
| `@default(cuid())` | `gorm:"type:text"` + Go 侧 cuid 生成 | 使用 `github.com/lucsky/cuid` |
| `DateTime` | `*time.Time` | 指针类型，nullable |
| `Json` | `datatypes.JSON` | GORM JSON 类型 |
| `@relation` many-to-many | `gorm:"many2many:table_name"` | 自动建中间表 |
| `@unique` | `gorm:"uniqueIndex"` | 唯一索引 |
| `@db.Text` | `gorm:"type:text"` | 长文本 |

### 核心模型 (db/models.go)

```go
// Photo — 核心照片实体
type Photo struct {
    ID               string          `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
    Title            string          `gorm:"type:text" json:"title"`
    URL              string          `gorm:"type:text" json:"url"`
    ThumbnailURL     string          `gorm:"type:text" json:"thumbnailUrl"`
    OriginFlag       string          `gorm:"type:text;default:web" json:"originFlag"`
    StorageProvider  string          `gorm:"type:text;default:local" json:"storageProvider"`
    StorageSourceID  *string         `gorm:"type:text" json:"storageSourceId"`
    StorageKey       *string         `gorm:"type:text" json:"storageKey"`
    Width            int             `json:"width"`
    Height           int             `json:"height"`
    Size             int64           `json:"size"`
    IsFeatured       bool            `gorm:"default:false" json:"isFeatured"`
    ShowFlag         bool            `gorm:"default:true" json:"showFlag"`
    DominantColors   string          `gorm:"type:text" json:"dominantColors"`
    FileHash         *string         `gorm:"type:text" json:"fileHash"`
    // EXIF 字段
    CameraMake       *string         `gorm:"type:text" json:"cameraMake"`
    CameraModel      *string         `gorm:"type:text" json:"cameraModel"`
    LensModel        *string         `gorm:"type:text" json:"lensModel"`
    FocalLength      *string         `gorm:"type:text" json:"focalLength"`
    Aperture         *string         `gorm:"type:text" json:"aperture"`
    ShutterSpeed     *string         `gorm:"type:text" json:"shutterSpeed"`
    ISO              *string         `gorm:"type:text" json:"iso"`
    TakenAt          *time.Time      `json:"takenAt"`
    Orientation      *int            `json:"orientation"`
    Software         *string         `gorm:"type:text" json:"software"`
    ExifRaw          *string         `gorm:"type:text" json:"exifRaw"`
    GPS              datatypes.JSON  `gorm:"type:jsonb" json:"gps"`
    // 外键
    CameraID         *string         `gorm:"type:text" json:"cameraId"`
    LensID           *string         `gorm:"type:text" json:"lensId"`
    CreatedAt        time.Time       `json:"createdAt"`
    UpdatedAt        time.Time       `json:"updatedAt"`
    // 关联
    Camera           *Camera         `gorm:"foreignKey:CameraID" json:"camera,omitempty"`
    Lens             *Lens           `gorm:"foreignKey:LensID" json:"lens,omitempty"`
    Categories       []Category      `gorm:"many2many:PhotoCategories" json:"categories,omitempty"`
    Albums           []Album         `gorm:"many2many:AlbumPhotos" json:"albums,omitempty"`
    Stories          []Story         `gorm:"many2many:PhotoStories" json:"stories,omitempty"`
    FilmPhoto        *FilmPhoto      `json:"filmPhoto,omitempty"`
    Comments         []Comment       `json:"comments,omitempty"`
}
```

其他模型以此类推，完整定义见 `db/models.go`。

---

## Go 后端服务设计

### 服务层接口模式

每个服务模块遵循统一模式：

```go
// services/photo.go
type PhotoService struct {
    db        *gorm.DB
    storage   storage.ProviderFactory
    imageProc *image.Processor
}

// 返回给前端的 DTO
type PhotoDTO struct {
    Photo
    Category    string  `json:"category"`     // categories 数组 → 逗号分隔字符串
    PhotoType   string  `json:"photoType"`    // "film" | "digital"
    FilmRollID  *string `json:"filmRollId"`
    FilmRollName *string `json:"filmRollName"`
}

type PaginatedResponse[T any] struct {
    Data []T           `json:"data"`
    Meta PaginationMeta `json:"meta"`
}

type PaginationMeta struct {
    Total      int  `json:"total"`
    Page       int  `json:"page"`
    PageSize   int  `json:"pageSize"`
    TotalPages int  `json:"totalPages"`
    HasMore    bool `json:"hasMore"`
}
```

### App 绑定 (app.go)

```go
type App struct {
    ctx     context.Context
    cfg     *config.Config
    db      *gorm.DB

    // 服务
    Photo       *services.PhotoService
    Album       *services.AlbumService
    Story       *services.StoryService
    Blog        *services.BlogService
    FilmRoll    *services.FilmRollService
    Friend      *services.FriendService
    Comment     *services.CommentService
    Category    *services.CategoryService
    Equipment   *services.EquipmentService
    Storage     *services.StorageService
    StorageSrc  *services.StorageSourceService
    Settings    *services.SettingsService
    Upload      *services.UploadService
    AI          *services.AIService
    Proxy       *services.ProxyClient
}

// Wails 启动时调用
func (a *App) startup(ctx context.Context) {
    a.ctx = ctx
    // 初始化 DB 连接、服务实例
}

// 前端调用示例 — Wails 自动绑定所有 public 方法
func (a *App) GetPhotos(params services.ListPhotosParams) (*services.PaginatedResponse[services.PhotoDTO], error) {
    return a.Photo.List(params)
}
```

### 上传流水线 (services/upload.go)

这是最复杂的服务，完整的处理流程：

```
前端选择文件 → Go 接收 (Wails runtime)
    │
    ├─ 1. 计算 SHA-256 哈希 → 检查重复
    ├─ 2. EXIF 提取 → 写入数据库字段
    │     ├─ 相机/镜头 → upsert Camera/Lens 表
    │     ├─ GPS 坐标 → 存储为 JSON
    │     └─ 拍摄时间 → takenAt
    ├─ 3. 图像压缩 (可选 AVIF) → 压缩后文件
    ├─ 4. 缩略图生成 → 缩略图文件
    ├─ 5. 主色提取 → dominantColors JSON
    ├─ 6. GPS 擦除 (可选) → 清除 EXIF GPS
    ├─ 7. 上传到存储 → 获取 URL
    │     ├─ 本地: 复制到指定目录
    │     ├─ S3: PutObject
    │     └─ GitHub: API 上传
    ├─ 8. 写入数据库 → Photo 记录
    └─ 9. 关联分类/相册/胶卷/故事
```

Go 实现优势：
- **EXIF 提取**：`github.com/rwcarlsen/goexif/exif` — 比 Node.js 更快
- **AVIF 压缩**：`github.com/Kagami/go-avif` 或调用 libvips (`github.com/davidbyttow/govips`)
- **缩略图**：`github.com/disintegration/imaging` 或 govips
- **主色提取**：`github.com/EdlinOrg/prominentcolor` — k-means 聚类
- **文件哈希**：标准库 `crypto/sha256`

### 存储提供者 (storage/)

```go
// storage/provider.go
type Provider interface {
    Upload(ctx context.Context, key string, data io.Reader, contentType string) (string, error)
    Delete(ctx context.Context, key string) error
    GetURL(key string) string
    List(ctx context.Context, prefix string) ([]FileInfo, error)
    Exists(ctx context.Context, key string) (bool, error)
}

type ProviderFactory struct {
    sources []db.StorageSource
}

func (f *ProviderFactory) Create(provider string, sourceID *string) (Provider, error) {
    switch provider {
    case "local":
        return NewLocalProvider(...)
    case "s3":
        return NewS3Provider(...)
    case "github":
        return NewGitHubProvider(...)
    }
}
```

### API 代理 (services/proxy.go)

对于需要依赖 Web 后端的功能（AI 助手、JWT 认证）：

```go
type ProxyClient struct {
    baseURL    string       // mo-gallery-web API URL
    httpClient *http.Client
    token      string       // JWT token, 由登录流程设置
}

func (p *ProxyClient) Login(username, password string) (*LoginResponse, error) {
    // POST /api/auth/login → 获取 JWT
}

func (p *ProxyClient) AIGenerate(ctx context.Context, req AIRequest) (<-chan AIChunk, error) {
    // POST /api/admin/stories/ai/generate → SSE 流式响应
    // 通过 channel 传给前端
}
```

---

## React 前端设计

### Wails 绑定调用

Wails v2 为每个 Go public 方法生成 TypeScript 绑定。前端调用方式：

```typescript
// 自动生成的绑定
import { GetPhotos, UploadPhoto, DeletePhoto } from '../bindings/go/App';

// 调用 Go 方法（返回 Promise）
const result = await GetPhotos({ page: 1, pageSize: 50, category: '' });
```

### 页面映射 (9 个模块)

| 页面 | Go 服务 | 关键功能 |
|------|---------|----------|
| `PhotosPage` | `PhotoService` | 网格/列表视图、筛选、排序、批量操作、详情面板 |
| `AlbumsPage` | `AlbumService` | CRUD、拖拽排序、照片管理、封面设置 |
| `FilmRollsPage` | `FilmRollService` | CRUD、胶卷预设、照片管理、帧排序 |
| `UploadPage` | `UploadService` | 拖拽上传、压缩预览、去重检测、后台队列 |
| `StoriesPage` | `StoryService` | 富文本编辑器(TipTap)、照片面板、封面裁剪 |
| `BlogsPage` | `BlogService` | 富文本编辑器、分类标签、草稿管理 |
| `AiAssistantPage` | `AIService` (proxy) | 对话管理、流式响应、图片附件、模型选择 |
| `StoragePage` | `StorageService` | 扫描、清理孤立文件、修复缺失、缩略图生成 |
| `SettingsPage` | `SettingsService` | 站点配置、存储源管理、评论管理、账户绑定 |
| `FriendsPage` | `FriendService` | CRUD、拖拽排序 |

### 前端技术栈

- **React 19** + **TypeScript strict**
- **Tailwind CSS 4** — 与 Web 端一致的样式系统
- **Zustand** — 轻量状态管理
- **react-router-dom** — 页面路由
- **@tiptap/react** — 富文本编辑器 (Stories/Blogs)
- **react-beautiful-dnd** — 拖拽排序
- **framer-motion** — 动画
- **lucide-react** — 图标
- **sonner** — Toast 通知

### 核心 UI 组件

复刻 Web 端的组件体系，但适配桌面场景：

```
components/
├── ui/                    # 基础原语
│   ├── Button.tsx         # CVA variants
│   ├── Input.tsx
│   ├── Select.tsx
│   ├── Dialog.tsx         # 原生窗口 or 模态
│   ├── DropdownMenu.tsx
│   ├── Tabs.tsx
│   ├── Badge.tsx
│   ├── Tooltip.tsx
│   └── ScrollArea.tsx
│
├── layout/
│   ├── AdminLayout.tsx    # 主布局：侧边栏 + 内容区
│   ├── Sidebar.tsx        # 导航侧边栏
│   └── Header.tsx         # 顶部栏（搜索、用户信息）
│
├── photo/
│   ├── PhotoGrid.tsx      # 可调列数的网格视图
│   ├── PhotoList.tsx      # 列表视图
│   ├── PhotoCard.tsx      # 单张照片卡片
│   ├── PhotoDetailPanel.tsx # 侧面板详情编辑
│   ├── PhotoFilters.tsx   # 筛选工具栏
│   └── PhotoSelector.tsx  # 照片选择弹窗
│
├── upload/
│   ├── DropZone.tsx       # 拖拽上传区域
│   ├── UploadQueue.tsx    # 上传队列面板
│   ├── CompressionPreview.tsx # 压缩对比预览
│   └── UploadParams.tsx   # 上传参数配置
│
├── editor/
│   ├── TipTapEditor.tsx   # 富文本编辑器
│   ├── EditorToolbar.tsx  # 编辑器工具栏
│   └── ImageInsert.tsx    # 图片插入
│
└── shared/
    ├── DeleteConfirmDialog.tsx
    ├── BatchActionDialog.tsx
    └── DataGrid.tsx       # 通用数据表格
```

---

## 关键流程详细设计

### 1. 照片上传流程 (桌面端优化)

```
用户拖入文件 → Wails OnFileDrop 事件
    │
    ├─ 前端: 收集文件路径列表
    ├─ 调用 Go: UploadService.PrepareUpload(filePaths)
    │   ├─ 读取每个文件
    │   ├─ 计算 SHA-256
    │   ├─ 提取 EXIF 预览信息
    │   └─ 返回: [{hash, exifPreview, duplicateCheck}]
    │
    ├─ 前端: 展示文件列表 + 去重警告 + EXIF 预览
    ├─ 用户配置: 压缩选项、存储目标、分类、相册...
    │
    ├─ 调用 Go: UploadService.Upload(params)
    │   ├─ 并发处理 (goroutine pool, 可配置并发数)
    │   ├─ 每个文件: 压缩 → 缩略图 → 主色 → 存储 → 写DB
    │   └─ 通过 Wails Events 发送进度更新
    │
    └─ 前端: 实时显示进度、成功/失败状态
```

**桌面端优势：**
- 直接读取本地文件，无需 HTTP 上传
- Go 并发处理，比 Node.js 更快
- 拖拽原生支持 (Wails runtime)
- 系统文件对话框

### 2. 存储扫描流程

```
用户选择存储源 → 调用 Go: StorageService.Scan(provider, sourceID)
    │
    ├─ 并发扫描: 存储文件列表 + 数据库记录
    ├─ 对比分析: linked / orphan / missing / missing_original / missing_thumbnail
    ├─ 通过 Events 发送进度
    └─ 返回: 文件列表 + 统计数据
    
用户选择清理 → 调用 Go: StorageService.Cleanup(keys, provider)
    ├─ 并发删除孤立文件
    └─ 返回结果
```

### 3. AI 助手 (API 代理)

```
前端发送消息 → 调用 Go: AIProxy.Generate(conversationId, message)
    │
    ├─ Go: HTTP POST → mo-gallery-web /api/admin/stories/ai/generate
    ├─ Go: 读取 SSE 流
    ├─ Go: 通过 Wails Events 逐块推送给前端
    └─ 前端: 实时渲染流式响应
```

---

## 配置管理

### 配置文件位置

- Windows: `%APPDATA%/mo-gallery-desktop/config.json`
- macOS: `~/Library/Application Support/mo-gallery-desktop/config.json`
- Linux: `~/.config/mo-gallery-desktop/config.json`

### 配置项

```json
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "user": "postgres",
    "password": "",
    "dbname": "mo_gallery",
    "sslmode": "disable"
  },
  "api": {
    "base_url": "http://localhost:3000",
    "jwt_secret": ""
  },
  "upload": {
    "default_provider": "local",
    "default_compression": "avif",
    "max_concurrent": 3,
    "strip_gps_default": true
  },
  "ui": {
    "language": "zh",
    "theme": "system",
    "photo_columns": 8
  }
}
```

首次启动时显示配置向导，引导用户填写数据库连接和 API 地址。

---

## 依赖清单

### Go 依赖

| 包 | 用途 |
|----|------|
| `github.com/wailsapp/wails/v2` | 桌面框架 |
| `gorm.io/gorm` | ORM |
| `gorm.io/driver/postgres` | PostgreSQL 驱动 |
| `github.com/rwcarlsen/goexif/exif` | EXIF 提取 |
| `github.com/disintegration/imaging` | 图像缩放 |
| `github.com/Kagami/go-avif` | AVIF 编码 |
| `github.com/EdlinOrg/prominentcolor` | 主色提取 |
| `github.com/aws/aws-sdk-go-v2` | S3 存储 |
| `github.com/google/go-github/v60` | GitHub API |
| `github.com/golang-jwt/jwt/v5` | JWT 签发/验证 |
| `github.com/lucsky/cuid` | CUID 生成 |
| `github.com/joho/godotenv` | .env 文件读取 |
| `github.com/samber/lo` | Go 泛型工具库 |

### 前端依赖

| 包 | 用途 |
|----|------|
| `react` + `react-dom` | UI 框架 |
| `typescript` | 类型系统 |
| `tailwindcss` | 样式 |
| `@tailwindcss/vite` | Tailwind Vite 插件 |
| `react-router-dom` | 路由 |
| `zustand` | 状态管理 |
| `@tiptap/react` + extensions | 富文本编辑器 |
| `@hello-pangea/dnd` | 拖拽排序 |
| `framer-motion` | 动画 |
| `lucide-react` | 图标 |
| `sonner` | Toast |
| `clsx` + `tailwind-merge` | 类名合并 |
| `class-variance-authority` | 组件变体 |
| `date-fns` | 日期处理 |

---

## 实施阶段

### Phase 1: 基础骨架 (Week 1)
- [ ] Wails 项目初始化 (`wails init -n desktop -t react-ts`)
- [ ] GORM 数据库连接 + 模型定义
- [ ] 配置管理 (config.json + 配置向导)
- [ ] 前端布局 (AdminLayout + Sidebar + 路由)
- [ ] 认证流程 (JWT 登录)

### Phase 2: 照片管理 (Week 2-3)
- [ ] PhotoService — CRUD + 筛选 + 分页 + 批量操作
- [ ] 照片网格/列表视图 + 详情面板
- [ ] 上传流水线 (EXIF + 压缩 + 缩略图 + 哈希 + 存储)
- [ ] 拖拽上传 + 上传队列
- [ ] 分类/设备服务

### Phase 3: 相册 + 胶卷 + 友链 (Week 4)
- [ ] AlbumService — CRUD + 照片关联 + 排序
- [ ] FilmRollService — CRUD + 预设 + 照片关联
- [ ] FriendService — CRUD + 排序
- [ ] 对应前端页面

### Phase 4: 故事 + 博客 (Week 5-6)
- [ ] StoryService — CRUD + 照片关联
- [ ] BlogService — CRUD
- [ ] TipTap 富文本编辑器集成
- [ ] 封面裁剪、照片面板、拖拽排序
- [ ] 本地草稿自动保存 (IndexedDB 或本地文件)

### Phase 5: 评论 + 设置 + 存储 (Week 7)
- [ ] CommentService — 列表 + 审核 + 删除
- [ ] SettingsService — 读写设置
- [ ] StorageSourceService — CRUD
- [ ] StorageService — 扫描 + 清理 + 修复
- [ ] 存储设置页面

### Phase 6: AI 助手 + 打磨 (Week 8)
- [ ] AI 代理 (SSE 流式)
- [ ] AI 助手页面 (对话、模型选择、图片附件)
- [ ] 国际化 (zh/en)
- [ ] 暗色模式
- [ ] Windows 打包测试
- [ ] 性能优化

---

## 与 Web 端的兼容性

### API 响应格式一致

Go 后端直接返回与 Web 端 API 相同的响应格式：

```json
{
  "success": true,
  "data": { ... },
  "meta": { "total": 100, "page": 1, "pageSize": 50, "totalPages": 2, "hasMore": true }
}
```

### 数据库兼容

- 使用相同的 PostgreSQL 数据库
- GORM 模型与 Prisma schema 保持一致
- 不修改现有表结构，只读/写现有数据
- 使用相同的 UUID/CUID 主键策略

### 存储兼容

- 使用相同的存储目录结构和命名规则
- URL 格式与 Web 端一致
- 支持所有三种存储后端 (local, S3, GitHub)

---

## 注意事项

1. **不破坏现有 Web 端** — 桌面端是增量开发，不修改 mo-gallery-web 的任何代码
2. **数据路径灵活选择** — 每个功能实现时确认走直连 DB 还是 API 网关，设计文档会逐一标注
3. **数据库 schema 同步** — 如果 Web 端有 schema 变更，桌面端需要同步更新 GORM 模型
4. **并发安全** — Web 端和桌面端可能同时操作数据库，需要考虑乐观锁或最后写入胜出
5. **大文件处理** — 桌面端直接读取本地文件，需要流式处理避免内存溢出
6. **Windows 路径** — 注意 `\` vs `/` 路径分隔符
