# MO Gallery

一个现代化的图片画廊应用，前后端集成，支持多种部署方式和存储后端。

## 功能特性

- 图片上传与管理
- EXIF 信息自动提取
- 多种存储后端支持（本地、GitHub、R2）
- 响应式设计
- 管理后台

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
## env
```bash
# Database URL (SQLite)
DATABASE_URL="file:./dev.db"
DIRECT_URL="file:./dev.db"

# JWT Secret
JWT_SECRET="mo-gallery-secret-key"

# Admin credentials for seed
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
| `STORAGE_PROVIDER` | 存储方式 | `local` |

### 存储配置

#### 本地存储
```env
STORAGE_PROVIDER="local"
```

#### GitHub 存储
```env
STORAGE_PROVIDER="github"
GITHUB_TOKEN="ghp_xxxx"
GITHUB_REPO="username/repo"
GITHUB_PATH="uploads"
GITHUB_BRANCH="main"
GITHUB_ACCESS_METHOD="jsdelivr"
```

#### Cloudflare R2
```env
STORAGE_PROVIDER="r2"
R2_ACCESS_KEY_ID="xxx"
R2_SECRET_ACCESS_KEY="xxx"
R2_BUCKET="my-bucket"
R2_ENDPOINT="https://xxx.r2.cloudflarestorage.com"
```

## 项目结构

```
mo-gallery-web/
├── prisma/              # 数据库模型和迁移
├── server/              # 服务端逻辑
│   └── lib/
│       ├── db.ts        # Prisma 客户端
│       ├── jwt.ts       # JWT 工具
│       ├── exif.ts      # EXIF 提取
│       └── storage/     # 存储抽象层
├── hono/                # API 路由
│   ├── index.ts
│   ├── auth.ts
│   ├── photos.ts
│   └── settings.ts
├── src/
│   ├── app/             # Next.js 页面
│   │   └── api/         # API 入口
│   ├── components/      # React 组件
│   ├── contexts/        # React Context
│   └── lib/             # 前端工具
└── public/              # 静态资源
```

## 技术栈

- **前端**: Next.js 16, React 19, Tailwind CSS
- **后端**: Hono.js, Prisma
- **数据库**: SQLite / PostgreSQL
- **存储**: 本地 / GitHub / Cloudflare R2

## License

MIT
