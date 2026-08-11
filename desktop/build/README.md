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

- `windows-amd64` / `windows-arm64` / `windows-x86`：`*-portable.exe` 与 `*-setup.exe`
- `macos-amd64` / `macos-arm64` / `macos-universal`：`.zip`、`.dmg`、`.pkg`
- `linux-amd64` / `linux-arm64`：`.tar.gz`、`.deb`、`.rpm`、`.AppImage`

NSIS 只用于 Windows。macOS 的 DMG/PKG 包含 `.app` 应用；配置 Apple Developer Secrets 后，workflow 会对应用和安装包执行签名与公证。Linux 包仍需要发行版提供 GTK3/WebKitGTK 运行库。

macOS 签名与公证使用以下 GitHub Actions Secrets（未配置时生成未签名包）：

- `MACOS_CERTIFICATE_P12_BASE64`
- `MACOS_CERTIFICATE_PASSWORD`
- `MACOS_SIGNING_IDENTITY`
- `MACOS_INSTALLER_IDENTITY`
- `APPLE_ID`
- `APPLE_TEAM_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
