# Desktop 本地资源库领域模型

- 状态：MVP 设计基线
- 日期：2026-07-30
- 决策来源：`adr/0001`～`adr/0037`

## 1. 核心原则

1. **资源库是迁移单元**：一个普通磁盘文件夹对应一个库，原文件、清单、SQLite、组织数据和派生预览随目录迁移。
2. **相对路径是资产身份边界**：库内持久化规范化相对路径；内容哈希不参与自动身份迁移。
3. **磁盘是内容事实，SQLite 是管理事实**：技术索引可重建，标签、集合、评分等不可重建数据必须备份。
4. **应用内命令保留身份，外部操作按现状校准**：应用内改名/移动更新原资产；外部改名/移动形成失联旧资产与新资产。
5. **安全优先**：不静默覆盖、不读取库外路径、不把回收站等同永久删除。
6. **渐进一致**：watcher 降低延迟，扫描保证最终一致；扫描、导入、watcher 共用幂等建档管线。
7. **派生数据可重建**：缩略图、屏幕预览与 RAW+JPEG 显示配对不是用户数据。

## 2. 磁盘结构

```text
<LibraryRoot>/
├─ 用户照片与真实文件夹/
└─ .mo-gallery/
   ├─ library.json
   ├─ library.db
   ├─ library.db-wal / library.db-shm
   ├─ lock
   ├─ operations/
   ├─ thumbnails/
   ├─ previews/
   ├─ trash/<trash-entry-id>/{entry.json,payload/}
   └─ backups/
```

`library.json` 建议包含：固定格式标识、格式版本、UUID 库 ID、显示名称、创建时间、创建应用版本、最低兼容应用版本。它不保存账号、绝对资产路径或组织数据。未知格式、未来不兼容版本和损坏清单必须拒绝写入，不能自动覆盖。

### 2.1 路径策略

所有 UI、扫描、watcher 与资源请求共用 `PathPolicy`：

- 持久化路径统一为 `/` 分隔的相对路径；
- 拒绝绝对路径、盘符、UNC、空片段、`.`、`..`、NUL；
- Windows 首期按目标文件系统大小写规则生成唯一 `path_key`；
- 创建/打开时解析真实路径，向上检查父库、向下检查后代库，禁止嵌套；
- 识别 junction、reparse point 和符号链接，默认不跟随指向库外的目录链接；
- 每次打开原文件前再次验证真实目标仍在当前库内且不位于 `.mo-gallery`；
- `.mo-gallery` 全树从媒体扫描、watcher 和用户文件命令目标中排除。

## 3. 聚合与实体

### 3.1 `Library`

顶层聚合负责清单、路径、写锁、数据库与后台任务。一次只存在一个当前库。它不归属线上账号。

```text
closed -> opening -> open -> closing -> closed
                     |-> suspended
                     |-> repair_required
```

- `suspended`：卷断开或严重 I/O 错误，停止写入，不制造全库失联；
- `repair_required`：磁盘命令完成但索引提交失败等需要恢复的状态；
- `ScanJobState` 与 `LibraryState` 正交，open 库可同时扫描中或暂停。

### 3.2 `Folder`

真实目录索引实体，用于表达空目录、树导航和目录命令。核心字段：`id`、`parent_id`、`relative_path`、`path_key`、`name`、`availability`、`trash_entry_id`、时间戳。

应用内创建、改名、移动保留文件夹 ID 并更新全部后代路径；外部目录改名不自动继承身份。

### 3.3 `Asset`

一条资产对应一个受支持媒体原文件，MVP 无组合资产。

- 身份：UUID `id`、`relative_path`、唯一 `path_key`、`folder_id`、文件名和扩展名；
- 文件事实：格式、MIME、大小、mtime 纳秒、尺寸、方向、动画信息、发现与技术更新时间；
- 用户字段：标题、备注、0～5 星、颜色、收藏、标签与集合；
- 可空 `content_sha256` 只为后续重复检测预留，MVP 不全库计算。

状态分开建模：

- `availability`: `active | missing | trashed`；
- `preview_status`: `pending | generating | ready | stale | unavailable`；
- `metadata_status`: `pending | ready | partial | unavailable`。

同路径外部覆盖保留 ID 与用户字段，刷新文件事实并使预览失效。完全相同路径恢复时，missing 资产回到 active。

`active` 资产必须始终对应库内真实文件，不能只删除数据库记录而让文件继续留在资源库目录树中。正常资产离开普通视图的稳定路径只有两种：应用内删除后进入 `trashed`，或用户通过系统文件资源管理器移出/删除文件后由校准标记为 `missing`。只有 `missing` 记录可以在不操作磁盘文件的前提下被显式清理。

### 3.4 `ExifMetadata`

一对一可重建技术信息：拍摄时间、相机厂商/型号、镜头、ISO、光圈、快门、焦距、可选 GPS。高频筛选字段必须使用类型化列与索引，补充字段才可进入受大小限制的 JSON。

### 3.5 `CollectionGroup`、`Collection`、`Tag`

- 集合组可嵌套，只包含子组与集合，不能直接放资产；
- 集合与资产多对多，删除集合不删除原文件；
- 标签扁平且与资产多对多；
- MVP 无智能集合、标签层级、继承与同义词。

### 3.6 `TrashEntry`

回收站恢复单元，可代表资产批次或完整目录树。字段包含：ID、类型、原父路径和名称、payload 路径、状态、大小、已索引资产数、其他文件数、目录数、删除时间。

目录删除时其他文件随 payload 移动，但不自动建档。恢复冲突不覆盖，可改顶层名称或选择库内其他父目录。

### 3.7 `FileOperation`

文件系统与 SQLite 不能共享 ACID 事务，因此文件命令使用持久化恢复流程：

```text
planned -> confirmed -> running -> completed
                              -> completed_with_errors
                              -> repair_required
planned -> cancelled_before_run
```

步骤：规范化和预检、持久化意图、执行磁盘操作、SQLite 事务更新、标记完成、异常退出后重放或修复。批量命令允许部分成功并返回逐项结果，永不覆盖。

应用内导入由应用级“本地资源库导入方式”决定：首次导入必须选择复制或移动，取消则不导入且不保存偏好；确认后后续导入沿用该偏好，并可在“系统设置 → 本地资源库”修改。

复制导入：复制到目标临时文件、完整性校验、原子改名、更新索引，保留库外源文件。移动导入：同卷可安全移动；跨卷先复制到目标临时文件、完整性校验、原子改名，确认目标成功后再删除源文件并更新索引。至少验证字节长度；是否流式计算摘要由技术 spike 决定。两种方式均永不覆盖目标。

### 3.8 `ScanJob` 与 `PreviewJob`

`ScanJob` 状态：`queued | enumerating | indexing | paused | completed | cancelled | failed`。任务幂等、可取消、可续跑；枚举完成前不伪造百分比；单文件失败不阻断全库。

预览任务优先级：选中项、可视项、后台项。同一资产与变体幂等去重。

### 3.9 `DerivedPair` 扩展预留

RAW+JPEG 合并显示只建立可重建展示关系：同一真实目录、同一主文件名、恰好一个 RAW 与一个 JPEG。JPEG 为主项，RAW 仍是独立资产。MVP 不持久化配对，不实现组级命令。

## 4. SQLite Schema 草案

时间使用 UTC Unix 毫秒；文件 mtime 另存纳秒。逻辑表：

```sql
library_meta(key PRIMARY KEY, value)
folders(id PRIMARY KEY, parent_id, relative_path, path_key UNIQUE,
        name, availability, trash_entry_id, discovered_at, updated_at)
assets(id PRIMARY KEY, folder_id, relative_path, path_key UNIQUE,
       file_name, extension, format, mime_type, media_kind,
       byte_size, modified_at_ns, width, height, orientation,
       is_animated, frame_count, duration_ms,
       availability, preview_status, metadata_status,
       display_title, notes, rating, color_label, is_favorite,
       captured_at, discovered_at, technical_updated_at,
       content_sha256, trash_entry_id)
exif_metadata(asset_id PRIMARY KEY, camera_make, camera_model,
              lens_model, iso, aperture, shutter_seconds,
              focal_length_mm, latitude, longitude, raw_json)
collection_groups(id PRIMARY KEY, parent_id, name, position)
collections(id PRIMARY KEY, group_id, name, notes, position,
            created_at, updated_at)
collection_assets(collection_id, asset_id, added_at,
                  PRIMARY KEY(collection_id, asset_id))
tags(id PRIMARY KEY, name, name_key UNIQUE, color, created_at)
asset_tags(asset_id, tag_id, PRIMARY KEY(asset_id, tag_id))
trash_entries(id PRIMARY KEY, kind, original_parent_path,
              original_name, payload_relative_path UNIQUE, state,
              total_bytes, indexed_asset_count, other_file_count,
              directory_count, trashed_at)
jobs(id PRIMARY KEY, kind, state, priority, progress_current,
     progress_total, checkpoint_json, error_json, created_at, updated_at)
file_operations(id PRIMARY KEY, kind, state, plan_json, result_json,
                created_at, updated_at)
preview_cache(asset_id, variant, cache_key, relative_cache_path,
              byte_size, created_at, last_accessed_at,
              PRIMARY KEY(asset_id, variant))
```

正式 migration 必须包含外键、CHECK 约束与删除策略。必要索引覆盖 availability 加拍摄/发现/修改时间、folder、favorite、rating、format、相机/镜头/ISO、关系表反向查询和 folder parent。

使用 FTS5 投影文件名/路径、标题/备注、相机/镜头；标签和集合通过关系查询合并。FTS 必须在数据库事务内维护，前端不维护索引。

查询采用 Go/SQLite 稳定分页，优先 keyset cursor（排序值加资产 ID）；不同筛选组 AND，同组 OR；扫描未完成响应返回 `isComplete: false`。

## 5. 媒体能力

| 格式 | 建档 | 网格 | 预览/原图 |
|---|---:|---|---|
| JPEG/PNG/WebP | 是 | 512px | 2048px及原文件 |
| GIF | 是 | 静态首帧 | 预览区播放原动画 |
| 静态 AVIF | 是 | 解码派生图 | 解码器支持时原文件 |
| 动画 AVIF | 是 | 可降级 | MVP 明确不承诺播放 |
| HEIC/HEIF、TIFF | 是 | 解码派生图 | 受控解码 |
| CR2/CR3/NEF/ARW/DNG/RAF | 是 | 内嵌 JPEG | 最高内嵌 JPEG并标注 |

格式识别组合扩展名白名单、文件头与解码结果。受支持格式解码失败仍建档为 `preview_status=unavailable`。现有 `goexif` 不足以满足全部矩阵，媒体后端必须经 Windows 打包与真实样本 spike 决定。

## 6. 安全媒体服务

WebView 不接收任意绝对路径。Wails `AssetServer.Handler` 提供只接受资产 ID 的同源接口：

```text
/__local-library/thumbnail/<asset-id>
/__local-library/preview/<asset-id>
/__local-library/original/<asset-id>?session=<短期令牌>
```

处理时验证当前库状态、按 ID 查询、校验资产状态、重新解析真实路径、限制 MIME/大小/解码资源。切库后旧会话失效。缩略图 URL 包含内容版本键，原图 URL 不成为永久能力凭证。

## 7. 事件与并发

建议 Wails 事件：库状态、扫描进度、资产失效、文件夹失效、任务变化、卷断开、待修复。事件只传 session ID 和小型增量；前端使分页查询失效，不维护整库镜像。

每库一个 manager context；文件命令按路径子树加锁并优先于扫描；watcher 去抖、批处理并抑制自身事件；SQLite 使用单写者队列和受控读取连接；卷断开取消 I/O 并进入 suspended。

## 8. 不变量

1. Desktop 全局单实例，当前库最多一个且持有独占写锁。
2. 禁止嵌套库，`.mo-gallery` 永不建档。
3. 活跃资产 `path_key` 库内唯一。
4. 应用内路径操作保留身份；外部路径操作不自动继承组织数据。
5. 同路径覆盖保留组织数据并刷新技术信息。
6. 失联永不自动清理，重复文件永不自动删除。
7. 正常库内资产不能只删索引；默认删除处理库内真实文件并进入库回收站，永久删除显式二次确认。
8. 只有 `missing` 资产可在不操作磁盘文件的前提下显式移除失联记录。
9. 应用内导入按应用级复制/移动偏好执行；首次选择取消时不导入、不保存默认值。
10. 任何路径冲突不覆盖。
11. 派生缓存可重建，数据库备份不包含照片。
12. 线上账号不拥有资源库，只决定上传目标。
