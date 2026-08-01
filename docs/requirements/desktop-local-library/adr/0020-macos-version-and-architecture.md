# ADR-0020：macOS 最低版本与 CPU 架构

- 状态：已接受，适用于后续 macOS 发布阶段
- 日期：2026-07-30

## 背景

已决定首期正式支持 macOS。Wails 应用本身以及 HEIC/RAW 原生依赖需要明确部署目标和 CPU 架构。Apple Silicon 与 Intel 分别构建通常比直接制作 Universal 包更容易诊断原生依赖问题。

## 候选方案

### A. macOS 13+，同时发布 Apple Silicon 与 Intel 两个制品（建议）

- `arm64`：M1 及后续 Apple Silicon；
- `amd64`：Intel Mac；
- 两个制品独立构建、签名、公证和冒烟测试；
- 下载页根据架构明确标注，不依赖 Rosetta 作为正式运行路径。

优点：覆盖仍在使用的 Intel 摄影工作站，同时避免 Universal 包合并原生媒体依赖的复杂度。

代价：CI、签名、公证和发布制品数量增加；两个架构都需要测试机或可靠的实际验证环境。

### B. macOS 13+，只支持 Apple Silicon

优点：构建矩阵较小，面向当前主流 Mac，原生媒体依赖更容易控制。

代价：Intel Mac 无正式支持，可能排除仍在使用老款摄影工作站的用户。

### C. macOS 12+，发布 Universal 2 单一制品

优点：下载选择最简单，系统覆盖更广。

代价：老系统兼容、双架构原生库合并和公证复杂度最高；单一包体更大，问题诊断不如分架构制品清晰。

## 建议的不变量

- 资源库文件格式不得因 CPU 架构不同而变化；
- SQLite 数据库和缩略图必须可在 Windows、Intel Mac、Apple Silicon Mac 之间迁移；
- CI 编译成功不替代对应架构上的打开库、扫描、监听、导入和预览冒烟测试；
- 不支持的平台或版本应在安装/启动前明确提示，不能在写入资源库后才失败。

## 决策

采用 **方案 A：macOS 13+，分别发布 Apple Silicon 与 Intel 制品**，但该决策适用于后续 macOS 正式发布阶段，不构成当前 Windows 开发阶段的完成条件。

- Apple Silicon 发布原生 `arm64` 制品；
- Intel Mac 发布原生 `amd64` 制品；
- 两个制品分别构建、签名、公证和冒烟测试；
- 不依赖 Rosetta 作为正式运行路径；
- 不要求当前仅有 Windows 环境的阶段完成上述 macOS 发布工作；
- 在真实 macOS 环境完成验收前，项目只能表述为“架构计划兼容 macOS”，不能表述为“已支持 macOS”。

## 启动后续 macOS 阶段的前置条件

- 可用的 Apple Silicon 与 Intel 验证环境，或明确接受缩减 Intel 支持范围的新 ADR；
- Apple Developer 证书、公证凭据和安全的 CI secrets；
- HEIC/RAW 依赖的双架构构建与许可证审核；
- APFS、FSEvents、目录授权和跨卷文件操作测试样本。
