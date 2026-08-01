# ADR-0038：SQLite 驱动、查询与备份实现选型

- 状态：已接受（FTS 已实现，性能基准仍待完成）
- 日期：2026-07-31
- 关联：ADR-0017、ADR-0025、`domain-model.md`

## 背景

本地资源库需要一个随 Wails 应用发布、无需用户安装数据库服务的 SQLite 实现，同时支持事务、外键、WAL、一致性在线备份和后续全文检索。驱动选择还会影响 Windows 打包、CGO 依赖、备份 API 和测试方式。

## 决策

采用 `modernc.org/sqlite`，通过 Go 标准库 `database/sql` 访问。当前锁定版本以 `desktop/go.mod` 为准，作出本决策时为 `v1.38.2`。

### 连接配置

每个资源库使用 `.mo-gallery/library.db`，连接时启用：

- `foreign_keys=1`；
- `busy_timeout=5000`；
- `journal_mode=WAL`；
- `synchronous=NORMAL`；
- 最多 4 个打开连接、2 个空闲连接。

不复用 Desktop 中面向服务端数据的 GORM/PostgreSQL 模型。本地资源库 repository 直接使用参数化 SQL 和真实临时 SQLite 文件测试。

### Schema 与迁移

- `library_meta.schema_version` 是数据库 schema 版本；
- `library.json.formatVersion` 是资源库容器格式版本，两者不能混用；
- 应用不得打开高于当前支持版本的数据库并继续写入；
- 旧版本数据库迁移前必须使用 SQLite online backup API 创建 `upgrade` 备份；
- 升级备份失败时阻断迁移；迁移失败时恢复升级前数据库；
- 默认保留最近 3 份升级前备份。

### 一致性备份

使用 `modernc.org/sqlite` 驱动连接暴露的 online backup API，分步复制到临时文件，执行 SQLite 完整性检查后再原子改名。禁止在活动 WAL 数据库写入期间直接复制 `library.db`。

该机制同时用于：

- 每次成功打开后的首次数据变更日备份，保留最近 7 份；
- Schema 升级前备份，保留最近 3 份；
- 用户手动备份；
- 数据库恢复前保护备份。

### 查询与 FTS

当前实现使用参数绑定的结构化 SQL、白名单排序、稳定 ID 次级排序和 cursor 分页。关键词查询使用 SQLite FTS5 `asset_search` 虚表，覆盖文件名/路径、标题/备注、标签/集合和相机/镜头。输入按空白拆词并转义为前缀词项，各词项采用 AND 语义，不开放原始 FTS 运算符。

`asset_search_source` 视图负责汇总跨表文本；资产、EXIF、标签和集合关系的插入、更新与删除通过数据库触发器在同一事务内刷新受影响资产。Schema 6 迁移会回填已有资产。`modernc.org/sqlite v1.38.2` 的 FTS5 可用性、索引同步、特殊输入和 `EXPLAIN QUERY PLAN` 使用虚表已有自动测试。100,000 资产下相对原 `LIKE` 查询的收益和 P50/P95 仍须专项基准验证。

## 已验证证据

- repository 和迁移测试使用磁盘上的临时 SQLite 文件；
- foreign key、WAL、busy timeout 等配置由连接 DSN 固定；
- online backup、手动恢复、日备份、升级备份、迁移阻断和迁移失败恢复有自动测试；
- FTS5 可用性、索引同步、Schema 5 到 6 回填、特殊输入转义和虚表查询计划有自动测试；
- `go test ./...` 可覆盖当前实现。

## 尚未完成

- 100,000 资产、关系和 EXIF 数据集；
- 100,000 资产下的 FTS5 索引重建耗时与索引体积报告；
- 常用查询 P50/P95 报告；
- NTFS/exFAT 强制断开、disk full、SQLite busy/corrupt 故障注入；
- 干净 Windows 10/11 VM 的正式 Wails production build、二进制体积和许可证清单。

## 后果

- 纯 Go SQLite 降低 Windows 发布时的原生 DLL/CGO 复杂度；
- 驱动升级必须重新运行迁移、备份、并发和发布环境测试；
- 未完成 10 万资产性能验证前，查询性能目标仍不是已验收状态；
- 数据库备份只保护索引和组织数据，不包含照片原文件与可重建缓存。
