# Desktop 缓存管理词汇表

- 状态：已收敛
- 日期：2026-08-02

| 术语 | 英文/代码候选 | 定义 | 不等同于 |
|---|---|---|---|
| 应用数据缓存 | Application Data Cache | Desktop 前端为减少重复请求而保留的运行时页面状态、持久化页面数据和 CacheStorage。 | 账户、设置、服务端数据 |
| 页面运行时状态 | Runtime Page State | 仅存在于当前应用进程内的已加载数据、分页进度和滚动位置。 | 磁盘占用、持久化页面数据 |
| 持久化页面数据 | Persistent Page Data | 按服务端与用户作用域写入 localStorage、带版本和 TTL 的页面资源。 | 用户设置、资源库数据库 |
| CacheStorage | CacheStorage | WebView 暴露的响应缓存容器；缓存页只统计和清理 MO Gallery 当前服务端与账号命名空间。 | 系统 HTTP 图片缓存、其他账号或同源功能的缓存、localStorage |
| 系统 HTTP 图片缓存 | System HTTP Image Cache | 由 WebView 根据 HTTP 响应头管理、应用前端无法准确统计或单独删除的缓存。 | CacheStorage |
| 本地预览缓存 | Local Preview Cache | `.mo-gallery` 中按需生成的约 2048px 屏幕预览，可删除并重新生成。 | 原文件、网格缩略图、原图查看 |
| 网格缩略图 | Grid Thumbnail | `.mo-gallery` 中约 512px 的浏览派生图，当前版本长期保留。 | 可由缓存页清理的屏幕预览 |
| 资源库数据 | Library Data | `.mo-gallery` 中的数据库、清单、备份、回收站和任务状态等不可再生内容。 | 缓存 |
| 可释放空间 | Reclaimable Disk Space | 当前清理能力能够释放的磁盘估算量，仅包含持久化应用缓存、CacheStorage 和本地屏幕预览。 | 运行时内存、`.mo-gallery` 总占用 |
| 清理并重建 | Clear and Rebuild | 清除全部应用数据缓存，使相关页面在后续访问时重新请求和建立缓存。 | 删除用户数据、立即全量预加载 |
