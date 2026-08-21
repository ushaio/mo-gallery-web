# Desktop 本地资源库云端路径同步实施计划

- 状态：已实施
- 日期：2026-08-19
- 范围：Web Photo 路径/存储源变化同步到 Desktop 本地资源库
- 关联设计：[desktop-local-photo-cloud-sync.md](./desktop-local-photo-cloud-sync.md)、[photo-change-table.md](./photo-change-table.md)（PhotoChange 变更流表作用范围与逻辑）

## 1. 目标

实现 Desktop 本地资源库在不依赖云端 PostgreSQL 的情况下继续使用本地照片、缩略图、组织信息和本地索引；在重新联网后，能够发现 Web 端对云端照片进行的移动、删除和存储源变化，并更新本地保存的云端资源投影。

本计划不把本地资源库做成云端数据库的完整镜像，也不把 `cloud_url` 作为持久化事实字段。云端 URL 由存储源配置和资源路径动态派生。

## 2. 当前缺口

1. `prisma.Photo` 目前有 `createdAt`，没有可用于增量同步的 `updatedAt` 或版本号。
2. Desktop 本地资产当前主要保存 `cloud_photo_id`，仅凭 ID 无法在云端数据库不可用时解析云端路径。
3. Desktop `PhotoDTO` 已包含 `path`、`thumbPath`、`storageSourceId` 等字段，但没有同步游标和远程更新时间。
4. Web 移动接口会更新 Photo 的 `path`/`thumbPath`，但没有面向 Desktop 的变更 feed；云端删除也没有可供 Desktop 拉取的 tombstone。
5. 存储源公开地址变化不一定修改 Photo 行，因此不能只依赖 Photo 行的更新时间。

## 3. 目标架构

```text
Web 移动/删除 Photo
        │
        ├─ 更新 path、thumbPath、updatedAt
        └─ 产生可分页的 Photo change
                    │
Desktop 联网同步 ────┘
        │
        ├─ 按 cloud_photo_id 更新本地云端投影
        ├─ 按 tombstone 清理或标记云端关联
        └─ 保存 sync cursor，失败可重试

本地展示 URL = 当前本地存储源配置 + 本地相对路径
云端展示 URL = 当前云端存储源配置 + cloud_path
```

### 3.1 本地与云端数据所有权

- `relative_path`、本地文件、缩略图、标签、集合、评分等属于本地库。
- `cloud_path`、`cloud_thumb_path`、云端存储源和远程更新时间属于云端资源投影。
- Web 改变云端路径时，不自动改写本地 `relative_path`，避免把两个不同的目录语义混在一起。
- 若产品需要本地目录跟随云端目录，必须另建显式的本地文件操作任务，不能在同步事务中直接移动本地文件。

## 4. 数据模型改造

### 4.1 Web Photo

在 `prisma/schema.prisma` 的 `Photo` 增加：

```prisma
updatedAt DateTime @updatedAt
```

迁移时为已有记录填充当前时间。同步游标使用 `(updatedAt, id)`，而不是只使用时间，避免同一时间戳下漏掉记录。

如果未来需要严格的全序和跨数据库迁移，可增加单调递增的 `changeVersion`；首期使用时间加 ID 游标即可。

### 4.2 Desktop `assets`

在本地 SQLite `assets` 增加以下可空字段：

```text
cloud_storage_source_id
cloud_storage_plugin_id
cloud_path
cloud_thumb_path
cloud_url_type
cloud_remote_updated_at
cloud_sync_state
cloud_sync_error
```

保留现有 `cloud_photo_id`。不增加 `cloud_url` 事实字段。

推荐的 `cloud_sync_state` 值：

```text
synced | pending | conflict | deleted_remote | error
```

在本地元数据表或 `library_meta` 中保存：

```text
cloud_sync_cursor
cloud_sync_last_success_at
```

所有字段必须通过本地库 SQL migration 增加，并兼容旧库打开、备份、恢复和升级门禁。

### 4.3 Desktop DTO

扩展 `AssetDTO` 和 Wails 生成模型，至少暴露：

```text
cloudPhotoId
cloudPath
cloudThumbPath
cloudStorageSourceId
cloudStoragePluginId
cloudSyncState
cloudRemoteUpdatedAt
```

云端 URL 由 resolver 生成；签名 URL 的过期时间不能作为长期关联依据。

## 5. Web API 设计

### 5.1 Photo 增量变更接口

新增受保护接口：

```text
GET /admin/photos/changes?cursor=<opaque>&limit=200
```

响应使用现有 `{ success, data, meta }` envelope：

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "photo-id",
        "path": "2026/travel/a.jpg",
        "thumbPath": "2026/travel/a-thumb.jpg",
        "storageSourceId": "source-id",
        "storagePluginId": null,
        "storageUrlType": "public",
        "updatedAt": "2026-08-19T10:30:00Z",
        "deletedAt": null
      }
    ],
    "nextCursor": "opaque-cursor",
    "hasMore": false
  }
}
```

实现要求：

- 首次同步支持空 cursor，并分页返回全量云端照片。
- 修改路径、缩略图路径、存储源或删除照片都必须可被查询到。
- 删除不能只物理删除数据库行；需要保存 tombstone，至少保留到同步保留窗口结束。
- cursor 必须是 opaque，客户端不能依赖内部时间格式。
- 同一条变更重复返回必须是幂等的。

### 5.2 存储源配置变化

存储源地址变化不一定更新 Photo，因此增加以下一种机制：

1. 在现有存储源接口增加 `updatedAt`/版本号，Desktop 按 source ID 增量拉取；或
2. Desktop resolver 在发现本地 source 版本过期时，调用存储源详情接口刷新配置。

首期建议采用 source 版本号加详情刷新。Photo 只保存 `storageSourceId` 和路径，不批量回写 URL。

### 5.3 Web 移动事务边界

`PATCH /admin/photos/:id` 的 `storagePath` 流程保持：

1. 校验照片和存储源。
2. 移动原图及缩略图。
3. 成功后更新 Photo 的 `path`、`thumbPath`，由 Prisma 更新 `updatedAt`。
4. 返回最新 PhotoDTO。

如果文件移动成功但数据库更新失败，必须进入现有错误/修复流程，不能向 Desktop 发布不完整变更。

## 6. Desktop 同步流程

### 6.1 触发时机

- 登录成功或会话恢复后执行一次。
- Desktop 网络从离线恢复时执行一次。
- 用户手动点击“同步”时执行一次。
- 可选：应用运行期间按 5～15 分钟周期执行；周期不能阻塞本地库操作。

### 6.2 同步步骤

1. 从本地读取 `cloud_sync_cursor`。
2. 调用 `/admin/photos/changes`，按页处理，单页成功后再提交 cursor。
3. 在 SQLite 事务中按 `cloud_photo_id` 更新云端投影字段。
4. 对 tombstone 清除关联或标记 `deleted_remote`，由产品策略决定是否保留历史投影。
5. 刷新 URL resolver 和相关前端查询缓存。
6. 所有分页成功后保存 `nextCursor` 和 `cloud_sync_last_success_at`。
7. 网络错误、鉴权过期或单条数据异常时保留旧 cursor，下一次从旧位置重试。

### 6.3 幂等与并发

- 以 `cloud_photo_id` 唯一匹配本地资产；重复变更不会重复创建本地资产。
- 只有远程 `updatedAt` 新于本地 `cloud_remote_updated_at` 时才覆盖投影。
- 同步事务不移动本地原图，不阻塞扫描、watcher 或本地文件操作。
- 本地库关闭、卷断开或升级时，取消同步并保留 cursor。

### 6.4 冲突策略

首期不自动把本地文件移动反向写入云端。若未来支持双向路径同步，必须增加操作 ID 和冲突状态：

```text
本地待同步移动 + 云端路径已变化
        -> cloud_sync_state = conflict
        -> 保留双方路径
        -> UI 显示选择：采用本地、采用云端、保留两者
```

## 7. 分阶段实施

### 阶段 0：契约与迁移设计

- 定义 Photo change、tombstone、source version 的 JSON 契约。
- 确认旧版本 Desktop 对新增 API/字段的兼容行为。
- 确认本地库当前 schema 版本，编写升级和回滚说明。

### 阶段 1：Web 变更事实

- 修改 `prisma/schema.prisma`，增加 `Photo.updatedAt`。
- 新增 migration 和 Photo 变更查询。
- 在 `hono/photos.ts` 实现 changes endpoint。
- 增加删除 tombstone 的保留与清理策略。
- 补充存储源版本/详情刷新接口。

### 阶段 2：Desktop 本地投影

- 在 `desktop/local_library/store.go` 增加 migration、读写和索引。
- 在 `desktop/local_library/types.go` 扩展 `AssetDTO`。
- 更新 `desktop/services/photo.go` 的 `PhotoDTO` 和 changes client。
- 增加本地 sync cursor、状态和错误持久化。

### 阶段 3：同步 Worker 与 UI

- 在 Desktop service/manager 增加可取消、可重试的同步 worker。
- 网络恢复、登录恢复和手动同步触发 worker。
- 前端显示同步状态、上次成功时间和冲突/远程删除状态。
- URL resolver 在投影更新后失效缓存并按 source 配置重新生成地址。

### 阶段 4：移动与边界行为

- 验证 Web 移动后 Desktop 仅更新云端投影，不移动本地文件。
- 验证 Desktop 插件资源移动仍由插件执行，Web 端对 desktop-plugin 照片继续拒绝直接移动。
- 明确本地副本是否需要独立的下载/缓存任务。

### 阶段 5：测试与发布

- Web：migration、changes 分页、同时间戳游标、移动、删除 tombstone、存储源变更。
- Go：本地 migration、幂等更新、断网重试、cursor 提交、旧库升级、同步期间本地移动。
- Desktop 前端：同步状态、远程删除、冲突提示和 URL 刷新。
- 回归：`pnpm run lint`、Web 构建、`cd desktop && go test ./...`、`cd desktop/frontend && npm run build`。

## 8. 验收标准

1. PostgreSQL 不可用时，Desktop 仍可打开本地库、浏览本地文件、生成预览、搜索、移动和编辑本地元数据。
2. Web 移动照片后，Desktop 联网同步一次即可更新 `cloud_path/cloud_thumb_path`。
3. Web 修改存储源公开地址后，不需要批量修改 Photo 行，Desktop 能按 source 版本刷新解析结果。
4. Web 删除照片后，Desktop 能收到 tombstone，并按策略清除或标记本地云端关联。
5. 同步中断后不会丢失 cursor；重试不会重复创建本地资产或覆盖更新的投影。
6. 本地文件移动不会被远程路径变化静默移动或覆盖。
7. 签名 URL 过期不会导致云端关联丢失；离线预览只依赖本地副本或缓存。

## 9. 风险与回滚

- **旧库升级失败**：沿用本地图库现有升级前备份和恢复流程，禁止半升级状态继续打开。
- **changes feed 漏变更**：保留全量对账入口，允许用户手动执行从空 cursor 的重建同步。
- **tombstone 清理过早**：保留窗口必须大于支持的最大离线时长；清理后仍可通过全量对账修复。
- **URL/凭据过期**：URL 只做派生缓存，失败时重新解析或刷新 source 配置，不修改云端关联字段。
- **双向移动冲突**：首期不自动反向写云端，避免本地移动覆盖 Web 端事实。

## 10. 待确认决策

1. 本地库是否保存云端照片的完整副本，还是只保存本地原图与云端关联？
2. 远程删除后本地是清除 `cloud_photo_id`，还是保留 `deleted_remote` 历史状态？
3. 存储源配置是否允许 Desktop 持有可生成签名 URL 的凭据？
4. Web 端需要支持多长的离线同步窗口，以确定 tombstone 保留时间？

## 11. 实施决策与结果

- 本地库只保留用户本地原图与云端关联/投影，不因远程路径变化下载或移动本地文件。
- 远程删除保留 `cloud_photo_id` 和历史投影，并标记为 `deleted_remote`，便于用户识别和后续处理。
- Desktop 不保存 Web 存储凭据或签名 URL；云端 URL 继续由服务端按存储源当前配置派生，存储源详情通过受保护接口按需刷新。
- 首期 `PhotoChange` tombstone 不自动清理，优先保证长期离线客户端可恢复同步；后续引入清理窗口前必须同时提供全量对账/游标过期处理。
- 同步在登录/会话恢复、打开/恢复本地库、手动操作和应用运行期间每 10 分钟触发；分页投影与 cursor 在同一个 SQLite 事务提交。
