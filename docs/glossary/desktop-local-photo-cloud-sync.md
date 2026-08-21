# Glossary — 桌面端本地照片库云端同步

本词表服务于「桌面端本地照片库上传/关联/删除」设计与实现，统一术语定义。

## 核心术语

| 术语 | 英文 | 定义 |
|------|------|------|
| 本地照片库 | Local Library | 桌面端管理的本地照片集合，以 `desktop/local_library` 包实现，数据存于 `library.db`（sqlite）与文件系统。 |
| 本地资产 | Local Asset | 本地照片库中的一张照片（`assets` 表一行），以 `AssetID` 标识。 |
| 云端照片 | Cloud Photo | 上传到云端后创建的 `Photo` 记录（hono `Photo` 表 + 存储），以 `Photo.id` 标识。 |
| 云端关联 | Cloud Link | 本地 asset 与云端 `Photo` 的关联，由 `cloud_photo_id` 表达；访问地址由云端 Photo 的存储源配置动态派生。 |
| 已上传 | Uploaded | 本地 asset 的 `cloud_photo_id` 非空的状态，表示该照片已上传到云端。 |
| 未上传 | Not Uploaded | 本地 asset 的 `cloud_photo_id` 为空的状态，可进行上传。 |
| 上传回写 | Upload Write-back | 云端上传成功后，把 `cloud_photo_id` 写回本地 `assets` 表；URL 不在本地持久化。 |
| 补偿对账（规划项） | Sync Reconciliation (Planned) | 未来可按 `fileHash` 补齐缺失关联的后台机制；当前版本未实现，现阶段写回失败会同步返回错误。 |
| 文件哈希 | File Hash | 本地 asset 的 `fileHash`，用于上传去重与对账匹配。 |
| 变更流表 | Change Feed / Outbox | 服务端 `PhotoChange` 表，由数据库触发器记录 `Photo` 的每次写操作（含墓碑），供桌面端增量同步云端投影。详见 [photo-change-table.md](../library/cloud/photo-change-table.md)。 |
| 云端投影 | Cloud Projection | 桌面端本地保存的云端照片存储字段快照（`cloud_path`、`cloud_thumb_path`、存储源等），由变更流同步刷新，非云端数据完整镜像。 |
| 墓碑 | Tombstone | `PhotoChange.deletedAt` 非空的变更行，表示云端照片已被删除；桌面端据此标记 `deleted_remote`。 |

## 删除能力

| 术语 | 英文 | 定义 |
|------|------|------|
| 仅删除云端 | Delete Cloud Only | 删除云端 `Photo` 记录与存储文件，本地保留，关联清除后回到「未上传」。 |
| 仅删除本地 | Delete Local Only | 走现有本地删除流程（回收站/永久删除），不影响云端副本与关联。 |
| 云端+本地都删 | Delete Both | 同时删除云端副本与本地文件/关联。 |
| 清除关联 | Clear Cloud Link | 删除云端后清空本地 `cloud_photo_id`，使照片回到「未上传」。 |

## 关联技术

| 接口 | 说明 |
|------|------|
| `SetCloudLink` | 本地库写回云端关联的 API（新增）。 |
| `ClearCloudLink` | 本地库清除云端关联的 API（新增）。 |
| `DELETE /photos/:id` | 云端删除照片的接口，desktop 通过 `ProxyClient` 代理调用。 |
| `PrepareLocalAssetUpload` | 现有上传链路：把本地 asset 转为待上传文件。 |
| `UploadLocalAsset` | 现有上传链路：上传并创建云端 `Photo`，成功后回写关联。 |
