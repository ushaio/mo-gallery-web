# PhotoChange 表：作用范围与业务范围逻辑

- 状态：已实施
- 日期：2026-08-19
- 关联设计：[desktop-local-photo-cloud-sync.md](./desktop-local-photo-cloud-sync.md)（ADR-0007）、[desktop-local-photo-cloud-sync-implementation-plan.md](./desktop-local-photo-cloud-sync-implementation-plan.md)（实施计划）
- 对应代码：`prisma/schema.prisma`（`model PhotoChange`）、`prisma/migrations/20260819000000_add_photo_cloud_sync/migration.sql`、`hono/photo-changes-route.ts`、`desktop/local_library/store.go`（`applyCloudPhotoChanges`）、`desktop/services/photo.go`（`Changes`）

## 1. 定位：服务端变更流（Change Feed / Outbox）

`PhotoChange` 是一张**服务端 PostgreSQL 变更流表**，由数据库触发器自动写入，用于把云端 `Photo` 的写操作（新增 / 更新 / 删除）变成可分页、可增量拉取的变更事件，供桌面端本地资源库在重新联网后同步。

**业务对象是「桌面端本地资源库通过存储源插件上传到云端的照片」**：本地库选择照片 → 插件上传并登记云端 → 在其它机器 / 其它场景通过 mo-gallery 对该照片做迁移（改变 `path` / `thumbPath` / 存储源等）后，本机依据本表把迁移结果同步回本地库的云端投影。Web 端直接上传的照片不属于本表所服务的业务范围（虽然触发器机制对它们同样生效，但那不是本表的设计目标）。

它不参与任何业务查询，不承载任何前端展示。它只回答一个问题：**“自某个游标之后，哪些云端照片发生了变化，以及它们当前（或删除时）的云端投影是什么。”**

## 2. 作用范围（Scope）

### 2.1 覆盖什么

| 维度 | 说明 |
|------|------|
| 写入方 | 仅数据库触发器 `photo_change_feed_after_write`（`AFTER INSERT OR UPDATE OR DELETE ON "Photo"`）。应用代码从不直接 `INSERT` 该表。 |
| 读取方 | 仅受保护接口 `GET /admin/photos/changes`（`authMiddleware` 鉴权），桌面端 `PhotoService.Changes` 通过 proxy 调用。 |
| 字段快照 | `photoId`、`path`、`thumbPath`、`storageSourceId`、`storagePluginId`、`storageUrlType` —— 即桌面端解析云端 URL 所需的“云端投影”字段。 |
| 变更类型 | 新增（`deletedAt = NULL`）、更新（`deletedAt = NULL`）、删除（`deletedAt = 删除时间`，作为墓碑 tombstone）。 |

### 2.2 不覆盖什么（明确边界）

- **不是 Photo 的完整镜像**：不复制标题、EXIF、分类、标签、评分、展示标记等字段。桌面端只需要云端存储投影，其余字段仍属 Web 本地库所有。
- **不是存储源地址的事实来源**：存储源公开地址变化通常不修改 `Photo` 行，因此不产生 `PhotoChange`。存储源配置变化走独立的 source 版本号 + 详情刷新机制，不写回该表。
- **不参与 Web 端业务读路径**：该表没有外键约束、不被 Web 查询、不驱动任何 Gallery/管理后台展示。
- **首期不自动清理**：墓碑行不自动删除（见 §4.3），意味着表会随写操作单调增长，这是刻意的取舍。
- **触发面是 `Photo` 行本身，与 `storageRuntime` 无关**：触发器挂在 `Photo` 表上，只要 `Photo` 行发生 INSERT / UPDATE / DELETE 就会产生变更。**前提是迁移必须真正落库到 `Photo` 的投影字段（`path` / `thumbPath` / `storageSourceId` 等）**。迁移由 mo-gallery 端发起并写回这些列，因此会被变更流捕获；`desktop-plugin` 照片之所以 Web 端以 `DESKTOP_PLUGIN_SOURCE_READ_ONLY`（409）拒绝直接改路径，是为了阻止绕过插件的“就地改路径”，并非指迁移流程不能更新 `Photo` 行。

## 3. 表结构

```prisma
model PhotoChange {
  id                String   @id @default(cuid())
  photoId           String
  path              String?
  thumbPath         String?
  storageSourceId   String?
  storagePluginId   String?
  storageUrlType    String
  updatedAt         DateTime
  deletedAt         DateTime?
  createdAt         DateTime @default(now())

  @@index([updatedAt, id])
  @@index([photoId, updatedAt])
}
```

字段语义：

| 字段 | 语义 |
|------|------|
| `id` | 变更行自身的主键（cuid），**不是** `Photo.id`。仅用于游标在相同 `updatedAt` 下的确定性排序。 |
| `photoId` | 云端 `Photo.id`，即桌面端本地 `assets.cloud_photo_id` 的匹配键。 |
| `path` / `thumbPath` | 云端原图 / 缩略图相对路径（`Photo` 的权威字段快照）。 |
| `storageSourceId` / `storagePluginId` | 云端存储源 / 存储插件引用，用于派生展示 URL。 |
| `storageUrlType` | `public \| signed \| temporary \| local`，非空（继承 `Photo.storageUrlType` 默认 `public`）。 |
| `updatedAt` | **变更时间**：新增/更新取 `Photo.updatedAt`，删除取 `CURRENT_TIMESTAMP`。是游标排序的第一键。 |
| `deletedAt` | **墓碑**：非空即表示该照片已被删除，值为删除时间；否则为 `NULL`。 |
| `createdAt` | 变更行写入时间（记账用，不参与游标）。 |

索引：

- `(updatedAt, id)` —— 游标分页排序。
- `(photoId, updatedAt)` —— 按照片查其变更历史（当前未直接使用，预留）。

## 4. 业务范围逻辑（设计逻辑）

### 4.1 变更如何产生

`Photo` 上挂有两个触发器（见迁移 SQL）：

1. `photo_touch_updated_at`（`BEFORE UPDATE`）：任何对 `Photo` 的更新都把 `NEW.updatedAt` 置为 `CURRENT_TIMESTAMP`。
2. `photo_change_feed_after_write`（`AFTER INSERT OR UPDATE OR DELETE`）：每行变化写入一条 `PhotoChange`：
   - **DELETE**：快照取 `OLD`，`updatedAt = CURRENT_TIMESTAMP`，`deletedAt = CURRENT_TIMESTAMP`（墓碑）。
   - **INSERT / UPDATE**：快照取 `NEW`，`updatedAt = NEW.updatedAt`，`deletedAt = NULL`。

由此产生两个有意为之的范围特性：

- **变更流是 `Photo` 的全量写事件流，而非仅路径/存储变化**。由于 `BEFORE UPDATE` 触发器对任意列更新都刷新 `updatedAt`，一条元数据改动同样会产生一条变更。桌面端消费时只关心投影字段，忽略其余字段——用“全量事件 + 消费方选择性投影”换取“单一触发器、零遗漏”的简单性。
- **删除以墓碑而非物理消除表达**。`Photo` 行物理删除后，唯一保留删除事实的就是这条 `PhotoChange` 墓碑；这保证了离线客户端能发现云端删除。

### 4.2 首次全量 & 增量游标

- 迁移时用 `INSERT ... SELECT` 把当时所有 `Photo` 行回填为 `PhotoChange`（`deletedAt = NULL`，`updatedAt` 取自新加的 `Photo.updatedAt` 默认 `CURRENT_TIMESTAMP`），因此桌面端以空游标首次同步即可拿到全量云端照片。
- 增量游标采用 `(updatedAt, id)` 而非单一时间戳：相同 `updatedAt` 下用 `id` 破平，避免漏记录。排序为 `updatedAt ASC, id ASC`。
- 游标对客户端**不透明**（base64url 编码的 `{ updatedAt, id }`），客户端不得依赖内部时间格式；`hono/photo-changes-route.ts` 负责编解码与合法性校验。

### 4.3 墓碑保留策略

首期（v1）**不自动清理墓碑**，优先保证长期离线客户端可恢复同步；`PhotoChange` 因此会单调增长。后续若要引入清理窗口，必须**同时**提供全量对账 / 游标过期处理，否则被清理的墓碑会导致客户端永久漏掉一次删除。

### 4.4 消费方幂等（桌面端）

桌面端在单个 SQLite 事务内按 `photoId`（= `cloud_photo_id`）应用变更：

- 墓碑 → 标记本地 `cloud_sync_state = deleted_remote`（保留 `cloud_photo_id` 与历史投影，不主动清除）。
- 非墓碑 → 覆盖投影字段 `cloud_path / cloud_thumb_path / cloud_storage_source_id / cloud_storage_plugin_id / cloud_url_type`，并置 `cloud_sync_state = synced`。
- 只有当 `cloud_remote_updated_at IS NULL OR cloud_remote_updated_at < 远程 updatedAt` 时才覆盖，保证重复投递 / 重试幂等，不会用旧变更覆盖更新的投影。
- 同步**只更新云端投影**，绝不移动本地原文件、不改写本地 `relative_path`、不阻塞本地扫描 / watcher / 文件操作。

游标 `cloud_sync_cursor` 与分页投影在**同一个** SQLite 事务内提交，失败保留旧游标、下次从旧位置重试。

### 4.5 触发时机（桌面端）

同步在以下时机触发：登录 / 会话恢复、打开 / 恢复本地库、用户手动点击同步、应用运行期间每 10 分钟周期。

## 5. 数据流一览

```text
mo-gallery 端对云端 Photo 的迁移 / 写操作（改变 path/thumbPath/存储源 / 删除）
        │
        ▼
数据库触发器写入 PhotoChange（含墓碑）
        │
        ▼
GET /admin/photos/changes?cursor=…&limit=…   （受保护，opaque 游标，按 updatedAt,id 分页）
        │
        ▼
Desktop PhotoService.Changes → LocalLibrary.ApplyCloudPhotoChanges
        │
        ├─ 按 cloud_photo_id 更新本地云端投影（幂等，最后写入胜出）
        ├─ 墓碑 → deleted_remote
        └─ 同一事务提交 cloud_sync_cursor
```

## 6. 目标场景（典型用例）

1. 桌面端 A 在**本地资源库**选择照片，通过**存储源插件**上传到云端：`POST /admin/photos/register` 创建 `Photo`（`storageRuntime=desktop-plugin`、`storagePluginId`、`storageSourceId`、`path`、`thumbPath`），随后上传回写把 `cloud_photo_id` 写回本地 `assets`，建立「本地 asset ⇄ 云端 Photo」关联。
2. 在**其它场景**（另一台电脑 / 另一处 mo-gallery 实例 / 管理后台）通过 **mo-gallery** 对该云端照片做**迁移**：迁移更新 `Photo` 的 `path` / `thumbPath` / `storageSourceId` 等投影字段，数据库触发器据此写入一条 `PhotoChange`。
3. 桌面端 A 重新联网后，`SyncLocalLibraryCloud` 按 `cloud_sync_cursor` 增量拉取 `GET /admin/photos/changes`，在单个 SQLite 事务内按 `cloud_photo_id` 更新本地 `assets` 的云端投影（`cloud_path` / `cloud_thumb_path` / `cloud_storage_source_id` / `cloud_storage_plugin_id` / `cloud_url_type`），并提交新游标。
4. 本地资源库关联的云端信息（路径、存储源、展示 URL 派生）**及时更新**，且本地原文件与 `relative_path` 保持不变。

该场景成立的关键前提仍是 §2.2 所述：迁移必须落库到 `Photo` 的投影字段。跨机器同步本身（触发、游标、幂等、tombstone）与迁移发生在哪个 mo-gallery 实例无关。

## 7. 一句话总结

`PhotoChange` 是服务端为桌面端离线-重连同步而设的**云端照片投影变更流**：数据库触发器把 `Photo` 的每次写操作落成一条带墓碑语义、可按 `(updatedAt, id)` 游标增量拉取的快照，桌面端据此刷新本地库的云端投影字段，且**永不**触碰本地原文件与本地路径。
