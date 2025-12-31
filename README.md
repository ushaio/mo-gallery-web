# MO Gallery

一个现代化的图片画廊应用，前后端集成，支持多种部署方式和存储后端。

## 功能特性

- 图片上传与管理（支持批量上传、进度显示）
- EXIF 信息自动提取（相机、镜头、光圈、快门等）
- 主色调自动提取
- 相册管理
- 故事/叙事（将多张照片组织成故事）
- 博客系统（Markdown 支持）
- 评论系统（支持审核）
- 多种存储后端支持（本地、GitHub、Cloudflare R2）
- 多视图模式（网格、瀑布流、时间线）
- 响应式设计
- 国际化支持
- 深色/浅色主题

## 快速开始

### 本地开发

```bash
# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 初始化数据库
pnpm run prisma:dev

# 启动开发服务器
pnpm run dev
```

### 最小环境变量配置

```env
# 数据库（SQLite 本地开发）
DATABASE_URL="file:./dev.db"
DIRECT_URL="file:./dev.db"

# JWT 密钥
JWT_SECRET="your-secret-key"

# 管理员账号（用于 seed）
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"
```

### Docker 部署

```bash
# 使用 Docker Compose（包含 PostgreSQL）
docker-compose up -d

# 或者单独构建镜像
docker build -t mo-gallery .
docker run -p 3000:3000 --env-file .env mo-gallery
```

### Vercel 部署

1. Fork 本仓库
2. 在 Vercel 中导入项目
3. 配置环境变量（参考 `.env.example`）
4. 设置构建命令为 `pnpm run build:vercel`
5. 使用 Neon 或 Supabase 作为数据库

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | 数据库连接 URL | `file:./dev.db` |
| `DIRECT_URL` | 直连数据库 URL（用于迁移） | 同上 |
| `JWT_SECRET` | JWT 密钥 | - |
| `ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | `admin123` |
| `SITE_TITLE` | 站点标题 | `MO GALLERY` |
| `CDN_DOMAIN` | CDN 域名 | - |

### 存储配置

存储方式可通过管理后台配置，也可通过环境变量预设：

#### 本地存储
```env
STORAGE_PROVIDER="local"
```

## 项目结构

```
mo-gallery-web/
├── prisma/              # 数据库模型和迁移
│   └── schema.prisma    # Prisma 模型定义
├── server/lib/          # 服务端工具库
│   ├── db.ts            # Prisma 客户端
│   ├── jwt.ts           # JWT 工具
│   ├── exif.ts          # EXIF 提取
│   ├── colors.ts        # 主色调提取
│   └── storage/         # 存储抽象层
│       ├── types.ts     # 接口定义
│       ├── factory.ts   # 工厂函数
│       ├── local.ts     # 本地存储
│       ├── github.ts    # GitHub 存储
│       └── r2.ts        # R2 存储
├── hono/                # API 路由 (Hono.js)
│   ├── index.ts         # 路由聚合
│   ├── auth.ts          # 认证
│   ├── photos.ts        # 照片管理
│   ├── albums.ts        # 相册管理
│   ├── stories.ts       # 故事/叙事
│   ├── blogs.ts         # 博客
│   ├── comments.ts      # 评论
│   ├── settings.ts      # 设置
│   └── middleware/      # 中间件
├── src/
│   ├── app/             # Next.js App Router
│   │   ├── api/         # API 入口点
│   │   ├── admin/       # 管理后台
│   │   ├── gallery/     # 画廊页面
│   │   └── blog/        # 博客页面
│   ├── components/      # React 组件
│   │   ├── admin/       # 管理组件
│   │   ├── gallery/     # 画廊组件
│   │   └── ui/          # 通用 UI 组件
│   ├── contexts/        # React Context
│   │   ├── AuthContext.tsx
│   │   ├── ThemeContext.tsx
│   │   ├── LanguageContext.tsx
│   │   └── SettingsContext.tsx
│   └── lib/             # 前端工具
│       ├── api.ts       # API 客户端
│       ├── i18n.ts      # 国际化
│       └── utils.ts
└── public/              # 静态资源
```

## 技术栈

- **前端**: Next.js 16, React 19, Tailwind CSS 4, Framer Motion
- **后端**: Hono.js, Prisma ORM
- **数据库**: SQLite / PostgreSQL
- **存储**: 本地 / GitHub / Cloudflare R2
- **图像处理**: Sharp, ExifReader

## 开发命令

```bash
pnpm run dev           # 启动开发服务器
pnpm run build         # 构建生产版本
pnpm run start         # 启动生产服务器
pnpm run lint          # 代码检查

# 数据库
pnpm run prisma:dev      # 创建并应用迁移（开发）
pnpm run prisma:deploy   # 应用迁移（生产）
pnpm run prisma:generate # 生成 Prisma 客户端
pnpm run prisma:seed     # 初始化管理员账号
```

## License

MIT
