# photos.ts Drizzle Migration Guide

## 概述
photos.ts 是最复杂的文件（1035 行），包含照片上传、管理、存储等核心功能。

## 迁移策略

由于文件超过 600 行限制，建议采用以下策略之一：

### 方案 1：手动迁移（推荐）
按照下面的转换模式，逐个函数迁移。

### 方案 2：使用提供的完整代码
我已经准备好完整的 Drizzle 版本代码，可以分两次粘贴到文件中。

## 关键转换模式

### 1. 导入语句
```typescript
// 旧的
import { db } from '~/server/lib/db'

// 新的
import { db, photos as photosTable, categories, photoCategories, cameras, lenses, photoStories, settings as settingsTable } from '~/server/lib/drizzle'
import { eq, and, desc, asc, count, inArray, sql } from 'drizzle-orm'
```

### 2. getStorageConfig 函数
```typescript
// 旧的
const settings = await db.setting.findMany()

// 新的
const settings = await db.select().from(settingsTable)
```

### 3. 辅助函数：getPhotoWithDetails
```typescript
async function getPhotoWithDetails(photoId: string) {
  const [photo] = await db.select().from(photosTable).where(eq(photosTable.id, photoId)).limit(1)
  if (!photo) return null

  // Get categories
  const photoCats = await db
    .select({ id: categories.id, name: categories.name })
    .from(photoCategories)
    .innerJoin(categories, eq(photoCategories.A, categories.id))
    .where(eq(photoCategories.B, photoId))

  // Get camera
  let camera = null
  if (photo.cameraId) {
    const [cam] = await db.select().from(cameras).where(eq(cameras.id, photo.cameraId)).limit(1)
    camera = cam || null
  }

  // Get lens
  let lens = null
  if (photo.lensId) {
    const [len] = await db.select().from(lenses).where(eq(lenses.id, photo.lensId)).limit(1)
    lens = len || null
  }

  return {
    ...photo,
    categories: photoCats,
    camera,
    lens,
  }
}
```

### 4. GET /photos（分类过滤）
```typescript
// 处理分类过滤
let photoIds: string[] | null = null
if (category && category !== '全部') {
  const catResult = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, category))
    .limit(1)
  
  if (catResult.length > 0) {
    const photoCatLinks = await db
      .select({ photoId: photoCategories.B })
      .from(photoCategories)
      .where(eq(photoCategories.A, catResult[0].id))
    
    photoIds = photoCatLinks.map(pc => pc.photoId)
  }
}

// 使用 photoIds 过滤
if (photoIds) {
  query = query.where(inArray(photosTable.id, photoIds))
}
```

### 5. POST /admin/photos（创建照片）
```typescript
// 1. 创建照片记录
const [photo] = await db.insert(photosTable)
  .values({
    title,
    url: uploadResult.url,
    // ... 其他字段
  })
  .returning()

// 2. 处理分类（connectOrCreate 模式）
for (const name of categoriesArray) {
  let [cat] = await db.select().from(categories).where(eq(categories.name, name)).limit(1)
  if (!cat) {
    [cat] = await db.insert(categories).values({ name }).returning()
  }
  await db.insert(photoCategories).values({ A: cat.id, B: photo.id }).onConflictDoNothing()
}

// 3. 处理相机（upsert 模式）
if (exifData.cameraMake) {
  const brandKey = makeBrandKey(normalizedMake)
  let [camera] = await db.select().from(cameras).where(eq(cameras.id, brandKey)).limit(1)
  if (camera) {
    [camera] = await db.update(cameras).set({ name: normalizedMake }).where(eq(cameras.id, brandKey)).returning()
  } else {
    [camera] = await db.insert(cameras).values({ id: brandKey, name: normalizedMake }).returning()
  }
  cameraId = camera.id
}
```

### 6. PATCH /admin/photos/:id（更新照片）
```typescript
// 处理分类更新
if (body.category !== undefined) {
  const categoriesArray = body.category.split(',').map(c => c.trim()).filter(c => c.length > 0)
  
  // 1. 删除现有关联
  await db.delete(photoCategories).where(eq(photoCategories.B, id))
  
  // 2. 创建新关联
  for (const name of categoriesArray) {
    let [cat] = await db.select().from(categories).where(eq(categories.name, name)).limit(1)
    if (!cat) {
      [cat] = await db.insert(categories).values({ name }).returning()
    }
    await db.insert(photoCategories).values({ A: cat.id, B: id }).onConflictDoNothing()
  }
}

// 更新照片
const [photo] = await db.update(photosTable)
  .set(updateData)
  .where(eq(photosTable.id, id))
  .returning()
```

### 7. DELETE /admin/photos/:id（删除照片）
```typescript
// 检查关联的故事
const storyLinks = await db
  .select({ storyId: photoStories.B, storyTitle: stories.title })
  .from(photoStories)
  .innerJoin(stories, eq(photoStories.B, stories.id))
  .where(eq(photoStories.A, id))

if (storyLinks.length > 0 && !forceDelete) {
  return c.json({
    success: false,
    error: 'PHOTO_HAS_STORIES',
    message: 'Photo has associated stories',
    stories: storyLinks.map(s => ({ id: s.storyId, title: s.storyTitle })),
  }, 400)
}

// 删除照片
await db.delete(photosTable).where(eq(photosTable.id, id))
```

### 8. GET /admin/photos/:id/stories
```typescript
const storyLinks = await db
  .select({
    id: stories.id,
    title: stories.title,
  })
  .from(photoStories)
  .innerJoin(stories, eq(photoStories.B, stories.id))
  .where(eq(photoStories.A, id))

return c.json({
  success: true,
  data: { stories: storyLinks },
})
```

### 9. POST /admin/photos/check-stories
```typescript
const photosList = await db
  .select({
    id: photosTable.id,
    title: photosTable.title,
  })
  .from(photosTable)
  .where(inArray(photosTable.id, photoIds))

const photosWithStories = []
for (const photo of photosList) {
  const storyLinks = await db
    .select({ id: stories.id, title: stories.title })
    .from(photoStories)
    .innerJoin(stories, eq(photoStories.B, stories.id))
    .where(eq(photoStories.A, photo.id))
  
  if (storyLinks.length > 0) {
    photosWithStories.push({
      photoId: photo.id,
      photoTitle: photo.title,
      stories: storyLinks,
    })
  }
}
```

### 10. POST /admin/photos/batch-update-urls
```typescript
const photosList = await db
  .select()
  .from(photosTable)
  .where(eq(photosTable.storageProvider, storageProvider))

for (const photo of photosList) {
  const newUrl = photo.url.replace(oldPublicUrl, newPublicUrl)
  const newThumbnailUrl = photo.thumbnailUrl?.replace(oldPublicUrl, newPublicUrl)
  
  await db.update(photosTable)
    .set({
      url: newUrl,
      thumbnailUrl: newThumbnailUrl,
    })
    .where(eq(photosTable.id, photo.id))
}
```

## 完整迁移步骤

1. **备份原文件**
   ```bash
   cp hono/photos.ts hono/photos.ts.prisma.backup
   ```

2. **更新导入语句**（第 1-11 行）

3. **更新 getStorageConfig 函数**（第 17-61 行）

4. **添加 getPhotoWithDetails 辅助函数**（新增）

5. **更新 GET /photos**（第 64-141 行）

6. **更新 GET /photos/featured**（第 143-169 行）

7. **更新 GET /categories**（第 171-187 行）

8. **更新 POST /admin/photos/check-duplicate**（第 193-272 行）

9. **更新 POST /admin/photos**（第 274-466 行）- 最复杂

10. **更新 DELETE /admin/photos/:id**（第 468-550 行）

11. **更新 PATCH /admin/photos/:id**（第 552-646 行）

12. **更新 GET /admin/photos/:id/stories**（第 648-679 行）

13. **更新 POST /admin/photos/check-stories**（第 681-727 行）

14. **更新 POST /admin/photos/batch-update-urls**（第 729-780 行）

15. **更新 POST /admin/photos/:id/reanalyze-colors**（第 782-825 行）

16. **更新 POST /admin/photos/:id/reupload**（第 827-981 行）

17. **更新 POST /admin/photos/:id/generate-thumbnail**（第 983-1033 行）

## 测试清单

迁移完成后，测试以下功能：
- [ ] 照片列表（带分页）
- [ ] 分类过滤
- [ ] 精选照片
- [ ] 照片上传
- [ ] 照片更新（标题、分类、拍摄时间）
- [ ] 照片删除
- [ ] 重复检测
- [ ] 故事关联检查
- [ ] 批量 URL 更新
- [ ] 颜色重新分析
- [ ] 文件重新上传
- [ ] 缩略图生成

## 下一步

完成 photos.ts 迁移后：
1. 运行 `pnpm run db:push` 同步数据库 schema
2. 测试所有 API 端点
3. 删除 Prisma 相关文件和依赖
