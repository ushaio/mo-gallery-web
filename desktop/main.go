package main

import (
	"embed"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"mo-gallery-desktop/config"
	"mo-gallery-desktop/db"
	"mo-gallery-desktop/services"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var icon []byte

func main() {
	// 命令行参数：指定配置文件路径
	configPath := flag.String("config", "", "配置文件路径 (默认: ~/.mo-gallery-desktop/config.json)")
	automationEnabled := flag.Bool("automation", false, "启用仅限本机的编辑器自动化接口")
	flag.Parse()

	// 加载配置
	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("加载配置失败: %v", err)
	}

	// Editor AI conversations are local and remain available when PostgreSQL
	// is offline. Failure here would make conversation persistence unsafe.
	if err := db.ConnectLocalAI(config.ConfigDir()); err != nil {
		log.Fatalf("初始化本地 AI 会话数据库失败: %v", err)
	}
	if err := db.ConnectLocalDrafts(config.ConfigDir()); err != nil {
		log.Fatalf("初始化本地草稿数据库失败: %v", err)
	}
	if err := db.ConnectLocalZine(config.ConfigDir()); err != nil {
		log.Fatalf("初始化本地 Zine 数据库失败: %v", err)
	}
	if err := db.ConnectLocalDesignCanvas(config.ConfigDir()); err != nil {
		log.Fatalf("初始化本地设计画布数据库失败: %v", err)
	}

	// 创建 App 实例
	app := NewApp(cfg, *automationEnabled)

	// 重启流程中，新进程需要绕过旧进程尚未释放的单实例锁。
	var singleInstanceLock *options.SingleInstanceLock
	if os.Getenv("MO_GALLERY_RESTART") != "1" {
		singleInstanceLock = &options.SingleInstanceLock{
			UniqueId: "mo-gallery-desktop-single-instance-v1",
			OnSecondInstanceLaunch: func(_ options.SecondInstanceData) {
				if app.ctx != nil {
					runtime.WindowShow(app.ctx)
					runtime.WindowUnminimise(app.ctx)
				}
			},
		}
	}

	// 启动 Wails 应用
	err = wails.Run(&options.App{
		Title:     "Emulsion",
		Width:     1440,
		Height:    900,
		MinWidth:  1024,
		MinHeight: 700,
		Frameless: config.NormalizeWindowStyle(cfg.UI.WindowStyle) == config.WindowStyleIntegrated,
		AssetServer: &assetserver.Options{
			Assets: assets,
			Handler: services.NewDesktopAssetHandler(
				services.NewZineAssetHandler(app.Proxy),
				app.LocalLibrary.AssetHandler(),
			),
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		// Keep production WebView free from browser chrome such as its native right-click menu.
		// Feature-specific application context menus continue to work in the frontend.
		EnableDefaultContextMenu: false,
		OnStartup:                app.startup,
		OnShutdown:               app.shutdown,
		SingleInstanceLock:       singleInstanceLock,
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop: true,
		},
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			// Prevent Ctrl+wheel/keyboard zoom and touch pinch zoom from making the app feel like a browser.
			IsZoomControlEnabled: false,
			DisablePinchZoom:     true,
			Theme:                windows.SystemDefault,
		},
	})

	if err != nil {
		fmt.Println("启动失败:", err.Error())
		os.Exit(1)
	}
}
