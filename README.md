# MO GALLERY Frontend

这是一个使用 Next.js 16, React 19, Tailwind CSS 4 和 Framer Motion 构建的个人摄影网站纯前端（通过 `NEXT_PUBLIC_API_URL` 对接外部后端）。

## 功能

- **首页**: 响应式英雄区，精选作品展示。
- **相册**: 支持按类别过滤的照片网格。
- **关于**: 摄影师个人介绍。
- **管理后台**: 照片管理、上传和系统配置的界面原型。

## 开发

```bash
cd web
npm install
npm run dev
```

## 部署

此项目设计用于部署到 Cloudflare Pages。

```bash
npm run build
npx wrangler pages deploy out
```
