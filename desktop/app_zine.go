package main

import (
	"mo-gallery-desktop/services"
)

// ─── Zine ─────────────────────────────────────────────

// GetZineCJKFontInfo 返回 PDF 导出可用的系统中文字体（字体文件本身由
// AssetServer 的 /__zine/cjk-font 路由提供）
func (a *App) GetZineCJKFontInfo() services.ZineCJKFontInfo {
	return services.ResolveZineCJKFont()
}

func (a *App) GetZineSystemFonts() []string {
	return services.ListZineSystemFonts()
}

// GetZineImageDataURL loads a remote Zine image through Go so editor AI can
// inspect it without WebView CORS or development-server routing limitations.
func (a *App) GetZineImageDataURL(src string) (string, error) {
	return services.GetZineImageDataURL(a.ctx, a.Proxy, src)
}

func (a *App) AppendZineLogs(lines []string) error {
	return a.ZineOperationLogger.Append(lines)
}

func (a *App) GetZineLogPath() string {
	return a.ZineOperationLogger.FilePath()
}
