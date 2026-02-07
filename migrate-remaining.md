# 剩余文件迁移指南

## 需要迁移的文件

1. **hono/photos.ts** (1035 行) - 最复杂
2. **hono/stories.ts** (513 行)
3. **hono/albums.ts** (418 行)

## 通用转换规则

### 导入替换
```typescript
// 旧的
import { db } from '~/server/lib/db'
import { Prisma } from '@prisma/client'

// 新的
import { db, photos, categories, photoCategories, cameras, lenses, stories, photoStories, albums, albumPhotos, comments } from '~/server/lib/drizzle'
import { eq, and, or, desc, asc, count, sql, inArray } from 'drizzle-orm'
```

### 常见模式转换

#### 1. findMany with include
```typescript
// Prisma
const photos = await db.photo.findMany({
  where: { category: 'nature' },
  include: { categories: true, camera: true, lens: true },
  orderBy: { createdAt: 'desc' },
  skip: 10,
  take: 20,
})

// Drizzle (使用 query API)
const photosList = await db.query.photos.findMany({
  where: eq(photos.category, 'nature'),
  with: {
    camera: true,
    lens: true,
  },
  orderBy: desc(photos.createdAt),
  offset: 10,
  limit: 20,
})

// 对于多对多关系，需要手动处理
```

#### 2. 多对多关系处理
```typescript
// Prisma - 自动处理
const photo = await db.photo.create({
  data: {
    title: 'Photo',
    categories: {
      connectOrCreate: categoriesArray.map(name => ({
        where: { name },
        create: { name },
      })),
    },
  },
})

// Drizzle - 手动处理
const [photo] = await db.insert(photos)
  .values({ title: 'Photo' })
  .returning()

// 处理分类关系
for (const name of categoriesArray) {
  // 查找或创建分类
  let category = await db.query.categories.findFirst({
    where: eq(categories.name, name),
  })
  
  if (!category) {
    [category] = await db.insert(categories)
      .values({ name })
      .returning()
  }
  
  // 创建关联
  await db.insert(photoCategories)
    .values({ A: category.id, B: photo.id })
    .onConflictDoNothing()
}
```

#### 3. 断开关系
```typescript
// Prisma
await db.photo.update({
  where: { id },
  data: {
    categories: { set: [] },
  },
})

// Drizzle
await db.delete(photoCategories)
  .where(eq(photoCategories.B, id))
```

## 具体文件迁移步骤

### photos.ts 迁移要点

1. **getStorageConfig** 函数已在 storage.ts 中迁移，可以复用模式
2. **复杂的关系查询**：使用 query API 或手动 join
3. **批量操作**：使用 Promise.all 处理多个插入/更新
4. **文件上传逻辑**：保持不变，只改数据库操作

关键转换：
- `db.photo.findMany` → `db.query.photos.findMany` 或 `db.select().from(photos)`
- `db.photo.create` → `db.insert(photos).values().returning()`
- `db.photo.update` → `db.update(photos).set().where().returning()`
- `db.photo.delete` → `db.delete(photos).where()`
- `db.category.upsert` → 手动实现 upsert 逻辑
- `db.camera.upsert` → 手动实现 upsert 逻辑

### stories.ts 迁移要点

1. **Story-Photo 多对多关系**：使用 photoStories 连接表
2. **coverPhotoId 外键**：保持不变
3. **发布状态过滤**：使用 eq(stories.isPublished, true)

### albums.ts 迁移要点

1. **Album-Photo 多对多关系**：使用 albumPhotos 连接表
2. **排序逻辑**：使用 orderBy(asc(albums.sortOrder))
3. **批量添加照片**：循环插入到 albumPhotos 表

## 执行计划

由于文件太大，建议：
1. 先备份原文件
2. 逐个函数/路由迁移
3. 每迁移一个路由就测试一次
4. 使用 git 提交保存进度
