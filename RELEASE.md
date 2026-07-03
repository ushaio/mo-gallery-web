# 更新日志

## v0.7.0-beta - 2026-07-03

### 🖥 Desktop 重大更新
- 桌面端纳入统一版本体系，`desktop/frontend/package.json` 与 `desktop/wails.json` 跟随 Web 版本同步发布
- GitHub Release 自动构建 Windows 桌面端安装产物，并作为 Release 附件上传
- 桌面端构建链路接入 Wails CLI、Go 1.24 与 pnpm 前端构建流程

### 🚀 发布流程
- 明确 `dev` 开发、`master` 发版：在 `dev` 更新版本号与 `RELEASE.md`，合并到 `master` 后触发发布
- 发版前统一校验 Web 与 Desktop 版本：`package.json`、`desktop/frontend/package.json`、`desktop/wails.json` 必须与 `RELEASE.md` 版本一致
- Web 与 Desktop 分离构建，全部通过后再创建 tag 与 GitHub Release
- Release note 继续使用单版本 `RELEASE.md` 全文作为发布说明

### 🌐 Web 端
- Web 端版本升级到 `0.7.0-beta`
- 发布前保留 lint 与生产构建校验，避免未验证代码进入 release
