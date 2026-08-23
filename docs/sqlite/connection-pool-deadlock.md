# SQLite 连接池死锁：技术参考与排查记录

- 日期：2026-08-23
- 组件：`desktop/local_library`（Wails + `modernc.org/sqlite` + Go `database/sql`）
- 关联：ADR-0038（SQLite 驱动/连接配置）、ADR-0023（资源库并发与锁）
- 触发场景：批量「下载至本地资源库」等高并发库访问

## 摘要

本地资源库使用单个 `*sql.DB` 连接池（`.mo-gallery/library.db`，WAL 模式）。`listAssets` 在遍历结果集 `rows` 期间保持连接不放，同时调用 `loadAssetOrganization` 向同一个池发起第二条查询。当多个 `ListAssets`、全量扫描、4 个缩略图派生 worker、批量下载同时竞争该池时，全部连接被「持有 rows、等待下一条查询」的 goroutine 占满，池中所有后续查询永久排队在 `database/sql.(*DB).conn`，应用表现为彻底卡死（0 CPU，无任何 goroutine 在执行 SQL）。

## 1. 现象

- 本地资源库「加载不出来」，界面停留在加载态；保存至资源库弹窗的按钮一直转圈。
- 桌面进程 CPU 完全冻结（多次采样无增长），`library.db` / `library.db-wal` 不再写入。
- 磁盘数据与数据库完整性均正常（`PRAGMA integrity_check` = ok），并非数据损坏。

## 2. 根因

### 连接池耗尽机制

`store` 使用 `database/sql` 连接池，原配置 `SetMaxOpenConns(4)`。`database/sql` 中一条查询返回的 `*sql.Rows` 会一直占用一个池连接，直到 `rows.Close()` 被调用。

`listAssets`（`desktop/local_library/store.go`）的结构：

```
rows, err := s.db.QueryContext(ctx, sqlQuery, args...)   // 占用连接 A
defer rows.Close()                                        // 仅在函数返回时才释放
for rows.Next() { ... scan ... }
s.loadAssetOrganization(ctx, items)                       // 持有连接 A 的同时请求连接 B
```

当 ≥连接数 个 `listAssets` 同时执行时：

- 每个 goroutine 持有自己主查询的 `rows`（占用 1 个连接）；
- 随后 `loadAssetOrganization` 等待空闲连接，但池已被其他 goroutine 的 `rows` 占满；
- 没有任何 goroutine 会先 `rows.Close()`（它等 `loadAssetOrganization` 返回后才返回）→ **互相等待，死锁**。

其余参与者（扫描 upsert、缩略图 `setDominantColors`、`counts`、`listFolders`、云端同步）共用同一个池，进一步放大竞争，使死锁几乎必然发生。

### 为什么是「零 CPU」

所有 goroutine 都阻塞在 `database/sql.(*DB).conn` 的 `select` 上等待池连接，没有 goroutine 在执行 SQLite 调用（dump 中没有任何 `modernc.org/sqlite` 栈帧），因此进程不消耗 CPU。

## 3. 排查方法

### 抓取 goroutine dump

开发模式下在 `desktop/app.go` 的 `startup` 里挂一个仅本机的 pprof HTTP 端口（`http.ListenAndServe("127.0.0.1:6060", nil)` + `import _ "net/http/pprof"`），卡死时抓取：

```
curl "http://127.0.0.1:6060/debug/pprof/goroutine?debug=2" -o goroutines.txt
```

### 判定特征

1. 大量 goroutine 阻塞在 `database/sql.(*DB).conn`（`sql.go:1369` 的 `select`）等待检出一个连接；
2. **没有**任何 goroutine 位于 `modernc.org/sqlite` 驱动调用中（说明连接被占用但无人在执行 SQL）；
3. 被占用的连接归属为「持有 `rows` 又发起嵌套查询」的代码路径（如 `listAssets → loadAssetOrganization`）。

这三点同时出现即可判定为连接池耗尽死锁，而不是 SQLite busy 或慢查询。

## 4. 修复

`desktop/local_library/store.go`：

1. `listAssets`：在调用 `loadAssetOrganization` 前显式 `rows.Close()`，先释放连接再发起嵌套查询（保留 `defer` 覆盖提前返回路径）。`rows.Err()` 在 Close 后仍可读取，不改变语义。这是消除连接池死锁的核心修复。

> 备注：曾尝试把扫描对未变更资产的 `scan_token` 更新改成批量 `UPDATE … WHERE id IN (…)` 以加快「打开资源库」的扫描速度，但该改动在 Windows 上会引入测试收尾期的文件句柄竞态（`go test ./local_library/` 间歇性报 TempDir 清理失败），已回退。当前保持「每文件一次 `UPDATE`」的稳定行为；扫描耗时为 `O(已索引文件数)` 的固有成本，安全提速需另行设计（例如基于变更清单的增量扫描）。

## 5. 代码位置

| 位置 | 说明 |
|---|---|
| `desktop/local_library/store.go` `listAssets` | 曾持有 rows 期间嵌套查询，已修复 |
| `desktop/local_library/store.go` `openStoreForUse` | 连接池配置 `SetMaxOpenConns/SetMaxIdleConns` |
| `desktop/local_library/manager.go` `Open/Close` | 会话打开/关闭，`Close` 会等待 session workers |
| `desktop/app.go` `DownloadCloudPhotoToLocalLibrary` | 批量下载入口，已用 `localDownloadMu` 串行化库变更段，降低并发冲击 |

## 6. 预防与最佳实践

- **不要在持有 `*sql.Rows` 期间向同一个 `*sql.DB` 发起新查询**。需要先 `rows.Close()` 再查询；分页/列表与附属信息加载务必拆成顺序执行的独立查询。
- 引入新 `QueryContext` 时自查：调用点是否处于外层 `rows` 的迭代/生命周期内；外层 `rows` 是否有 `defer Close` 且调用点在返回之前。
- 共享连接池的并发量需评估上限：`SetMaxOpenConns` 只是兜底，不等于可以无视嵌套占用；扫描、派生 worker、前端列表、云端同步、下载/上传共用同一池时应按最坏并发校核。
- 变更连接配置（数量、`busy_timeout`、`_txlock`）后同步更新 ADR-0038 的「连接配置」段落。
- 排查疑似「应用卡死」时优先抓 goroutine dump 而非直接重启；`0 CPU + 全部阻塞在 `DB.conn` + 无驱动栈帧` 是连接池死锁的典型信号。
