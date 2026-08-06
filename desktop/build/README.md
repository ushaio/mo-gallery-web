# Build Assets

- `appicon.png` — 应用图标 (512x512 PNG)
- `windows/` — Windows 平台特定资源

## 本地构建

在 `desktop/` 目录执行：

```bash
# 当前主机平台的 Portable 包
wails build

# Windows NSIS 安装包
wails build -nsis

# 指定目标平台
wails build -platform windows/amd64
wails build -platform darwin/universal
wails build -platform linux/amd64 -tags webkit2_41
```

## Release 产物

GitHub Actions 使用原生平台 runner 构建并上传：

- `windows-amd64` / `windows-arm64`：`*-portable.exe` 与 `*-setup.exe`
- `macos-amd64` / `macos-arm64` / `macos-universal`：`.app` ZIP
- `linux-amd64` / `linux-arm64`：`.tar.gz` 可执行文件归档

NSIS 只用于 Windows。macOS 的归档内包含 `.app` 应用包；Linux 归档内包含 `mo-gallery-desktop` 可执行文件。Linux 运行时需要发行版提供 GTK3/WebKitGTK 运行库。
