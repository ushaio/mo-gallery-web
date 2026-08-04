# Desktop 本地资源库 V1.1 发布 Gate 报告

- 应用版本/提交：
- 验证日期：
- 验证负责人：
- 结论：`通过 / 阻断 / 部分验证`

## 1. 环境

| 项目 | 记录 |
|---|---|
| Windows 版本 | |
| CPU / RAM | |
| 磁盘与文件系统 | |
| WebView2 版本 | |
| Wails production build | |
| 冷/暖缓存 | |

## 2. 阻断项

| ID | 场景 | 结果 | 证据 | 缺陷/备注 |
|---|---|---|---|---|
| P0-OPS-01 | 文件操作强制退出恢复 | 未验证 | | |
| P0-OPS-02 | 磁盘成功、SQLite 失败 | 未验证 | | |
| P0-OPS-03 | 外部竞态冲突 | 未验证 | | |
| P0-OPS-04 | 重开重放或 repair_required | 未验证 | | |
| P0-OPS-05 | SQLite 已提交、后续清理失败 | 未验证 | | |
| P0-PERF-01 | 10 万项首屏与查询 | 未验证 | | |
| P0-MEDIA-01 | 私有真实媒体矩阵 | 未验证 | | |
| P0-FS-01 | NTFS/exFAT 与卷断开 | 未验证 | | |
| P0-SEC-01 | 路径、链接和旧 session | 未验证 | | |
| P0-A11Y-01 | 键盘、缩放、主题和语言 | 未验证 | | |

## 3. 性能

| 指标 | 冷缓存 | 暖缓存 | 目标 | 结论 |
|---|---:|---:|---:|---|
| 已有索引首屏 | | | <= 2s | 未验证 |
| 常用查询 P50 | | | 记录 | 未验证 |
| 常用查询 P95 | | | < 300ms | 未验证 |
| 新增稳定 JPEG 可见 | | | <= 3s | 未验证 |
| 峰值 RAM | | | 记录 | 未验证 |
| 峰值 CPU | | | 记录 | 未验证 |

## 4. 媒体能力

引用本机 `desktop/testdata/local-library/manifest.local.json`，只记录样本 ID、哈希和结果，不附私有原文件。

| 格式 | 必需样本 | 已验证 | 失败 | 未验证 | 发布声明 |
|---|---:|---:|---:|---:|---|
| JPEG/PNG/WebP | | | | | |
| GIF | | | | | |
| AVIF | | | | | |
| HEIC/HEIF | | | | | |
| TIFF | | | | | |
| RAW | | | | | |

## 5. 原图查看证据

| ID | 场景 | 结果 | 样本/环境 | 证据 | 备注 |
|---|---|---|---|---|---|
| ORIGINAL-01 | 默认进入屏幕预览 | 未验证 | | | 不得首次打开即加载超大原文件 |
| ORIGINAL-02 | 显式原图 / 100% | 未验证 | | | 按资产 ID 与当前 session 读取 |
| ORIGINAL-03 | 适应窗口、100%、缩放、拖动 | 未验证 | | | 记录峰值 RAM 与最大测试尺寸 |
| ORIGINAL-04 | 查询结果连续上一张/下一张 | 未验证 | | | 覆盖目录、搜索、筛选、排序与分页 |
| ORIGINAL-05 | RAW 内嵌 JPEG | 未验证 | | | 必须显示“非 RAW 显影”提示 |
| ORIGINAL-06 | 超限、损坏、解码失败与取消 | 未验证 | | | 保留屏幕预览并提供重试 |
| ORIGINAL-07 | 系统默认程序打开 | 未验证 | | | 与应用内原图查看独立 |
| ORIGINAL-08 | AVIF/HEIC/TIFF 原图 | 未验证 | | | 未完成真实样本验证前不得宣称完整支持 |

## 6. 结构化证据

| 证据 | 报告路径/制品 | Schema | 结果 |
|---|---|---|---|
| 私有媒体 | | `desktop/testdata/local-library/evidence-report.schema.json` | 未验证 |
| 10 万项冷缓存 | | `desktop/testdata/local-library/evidence-report.schema.json` | 未验证 |
| 10 万项暖缓存 | | `desktop/testdata/local-library/evidence-report.schema.json` | 未验证 |

私有媒体使用 `TestPrivateMediaReleaseEvidence`；10 万项查询使用 `TestLocalLibraryBenchmarkReleaseEvidence`。性能 Gate 必须归档同一 fixture 签名、应用版本、提交和验收环境下的一冷一暖两份不可覆盖报告；冷缓存准备动作必须写入结构化环境字段。Go 证据覆盖 SQLite 打开/迁移到后端首屏数据返回，WebView2 渲染耗时在本表单单独记录。执行命令、环境变量和隐私规则见 `desktop/testdata/local-library/README.md`。本地 `reports/` 被忽略，正式验收必须将脱敏 JSON 报告归档为发布制品。

## 7. 发布结论

只有全部 P0 阻断项通过，且没有违反资产身份、路径安全、禁止覆盖、可恢复删除和资源库边界不变量的问题时，才允许 V1.1 正式发布。缺少真实证据的能力必须标记为“未验证”，不得写成完整支持。
