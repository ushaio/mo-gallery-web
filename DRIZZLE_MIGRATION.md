# Prisma to Drizzle Migration Guide

## 已完成的迁移

### 已迁移的文件
- ✅ `hono/auth.ts` - 用户认证
- ✅ `hono/settings.ts` - 系统设置
- ✅ `hono/equipment.ts` - 设备管理
- ✅ `hono/comments.ts` - 评论管理
- ✅ `hono/friends.ts` - 友情链接
- ✅ `hono/blogs.ts` - 博客管理
- ✅ `hono/storage.ts` - 存储管理

### 待迁移的文件
- ⏳ `hono/photos.ts` (1035 行) - 照片管理
- ⏳ `hono/stories.ts` (513 行) - 故事管理
- ⏳ `hono/albums.ts` (418 行) - 相册管理

## 转换模式参考

### 1. 导入语句
```typescript
// Prisma
import { db } from '~/server/lib/db'

// Drizzle
import { db, photos, users, categories } from '~/server/lib/drizzle'
import { eq, and, or, desc, asc, count, sql } from 'drizzle-orm'
```

### 2. 查询操作

#### findMany
```typescript
// Prisma
const photos = await db.photo.findMany({
  where: { isFeatured: true },
  orderBy: { createdAt: 'desc' },
  take: 10,
})

// Drizzle
const photosList = await db
  .select()
  .from(photos)
  .where(eq(photos.isFeatured, true))
  .orderBy(desc(photos.createdAt))
  .limit(10)
```

#### findUnique / findFirst
```typescript
// Prisma
const photo = await db.photo.findUnique({
  where: { id },
})

// Drizzle
const [photo] = await db
  .select()
  .from(photos)
  .where(eq(photos.id, id))
  .limit(1)
```

#### 关系查询 (include)
```typescript
// Prisma
const photo = await db.photo.findUnique({
  where: { id },
  include: {
    categories: true,
    camera: true,
  },
})

// Drizzle - 使用 leftJoin
const result = await db
  .select({
    id: photos.id,
    title: photos.title,
    camera: cameras,
  })
  .from(photos)
  .leftJoin(cameras, eq(photos.cameraId, cameras.id))
  .where(eq(photos.id, id))
  .limit(1)

// 或使用 query API (推荐用于复杂关系)
const photo = await db.query.photos.findFirst({
  where: eq(photos.id, id),
  with: {
    categories: true,
    camera: true,
  },
})
```

### 3. 创建操作

#### create
```typescript
// Prisma
const photo = await db.photo.create({
  data: {
    title: 'Photo',
    url: 'https://...',
  },
})

// Drizzle
const [photo] = await db
  .insert(photos)
  .values({
    title: 'Photo',
    url: 'https://...',
  })
  .returning()
```

#### 关系创建 (connectOrCreate)
```typescript
// Prisma
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

// Drizzle - 需要分步操作
const [photo] = await db.insert(photos)
  .values({ title: 'Photo' })
  .returning()

// 然后处理关系
for (const name of categoriesArray) {
  let [category] = await db.select()
    .from(categories)
    .where(eq(categories.name, name))
    .limit(1)
  
  if (!category) {
    [category] = await db.insert(categories)
      .values({ name })
      .returning()
  }
  
  await db.insert(photoCategories)
    .values({ A: category.id, B: photo.id })
}
```

### 4. 更新操作

#### update
```typescript
// Prisma
const photo = await db.photo.update({
  where: { id },
  data: { title: 'New Title' },
})

// Drizzle
const [photo] = await db
  .update(photos)
  .set({ 
    title: 'New Title',
    updatedAt: new Date(),
  })
  .where(eq(photos.id, id))
  .returning()
```

#### updateMany
```typescript
// Prisma
const result = await db.photo.updateMany({
  where: { isFeatured: true },
  data: { status: 'archived' },
})

// Drizzle
const result = await db
  .update(photos)
  .set({ status: 'archived' })
  .where(eq(photos.isFeatured, true))
  .returning()

// result.length 代替 result.count
```

### 5. 删除操作

#### delete
```typescript
// Prisma
await db.photo.delete({
  where: { id },
})

// Drizzle
await db
  .delete(photos)
  .where(eq(photos.id, id))
```

#### deleteMany
```typescript
// Prisma
const result = await db.photo.deleteMany({
  where: { id: { in: photoIds } },
})

// Drizzle
const result = await db
  .delete(photos)
  .where(inArray(photos.id, photoIds))
  .returning()
```

### 6. 聚合操作

#### count
```typescript
// Prisma
const total = await db.photo.count({
  where: { isFeatured: true },
})

// Drizzle
const [result] = await db
  .select({ count: count() })
  .from(photos)
  .where(eq(photos.isFeatured, true))

const total = result.count
```

#### 关系计数 (_count)
```typescript
// Prisma
const camera = await db.camera.findUnique({
  where: { id },
  include: {
    _count: {
      select: { photos: true },
    },
  },
})

// Drizzle - 使用 SQL 聚合
const [camera] = await db
  .select({
    id: cameras.id,
    name: cameras.name,
    photoCount: sql<number>`cast(count(${photos.id}) as int)`,
  })
  .from(cameras)
  .leftJoin(photos, eq(cameras.id, photos.cameraId))
  .where(eq(cameras.id, id))
  .groupBy(cameras.id, cameras.name)
  .limit(1)
```

### 7. 条件查询

#### 多条件 (AND)
```typescript
// Prisma
const photos = await db.photo.findMany({
  where: {
    isFeatured: true,
    isPublished: true,
  },
})

// Drizzle
const photosList = await db
  .select()
  .from(photos)
  .where(and(
    eq(photos.isFeatured, true),
    eq(photos.isPublished, true)
  ))
```

#### OR 条件
```typescript
// Prisma
const photos = await db.photo.findMany({
  where: {
    OR: [
      { status: 'published' },
      { status: 'featured' },
    ],
  },
})

// Drizzle
const photosList = await db
  .select()
  .from(photos)
  .where(or(
    eq(photos.status, 'published'),
    eq(photos.status, 'featured')
  ))
```

### 8. 事务

```typescript
// Prisma
await db.$transaction([
  db.photo.create({ data: {...} }),
  db.category.update({ where: {...}, data: {...} }),
])

// Drizzle
await db.transaction(async (tx) => {
  await tx.insert(photos).values({...})
  await tx.update(categories).set({...}).where(...)
})
```

### 9. Upsert

```typescript
// Prisma
const user = await db.user.upsert({
  where: { id },
  update: { name: 'New Name' },
  create: { id, name: 'New Name' },
})

// Drizzle - 需要手动实现
let [user] = await db.select()
  .from(users)
  .where(eq(users.id, id))
  .limit(1)

if (user) {
  [user] = await db.update(users)
    .set({ name: 'New Name', updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning()
} else {
  [user] = await db.insert(users)
    .values({ id, name: 'New Name' })
    .returning()
}
```

## 常见导入

```typescript
import { 
  eq,        // 等于
  ne,        // 不等于
  gt,        // 大于
  gte,       // 大于等于
  lt,        // 小于
  lte,       // 小于等于
  and,       // AND 条件
  or,        // OR 条件
  not,       // NOT 条件
  isNull,    // IS NULL
  isNotNull, // IS NOT NULL
  inArray,   // IN (...)
  notInArray,// NOT IN (...)
  like,      // LIKE
  ilike,     // ILIKE (不区分大小写)
  desc,      // 降序
  asc,       // 升序
  count,     // COUNT(*)
  sum,       // SUM
  avg,       // AVG
  min,       // MIN
  max,       // MAX
  sql,       // 原始 SQL
} from 'drizzle-orm'
```

## 下一步

完成剩余 3 个文件的迁移后：
1. 运行 `pnpm run db:push` 将 schema 推送到数据库
2. 测试所有 API 端点
3. 删除 Prisma 相关文件和依赖
