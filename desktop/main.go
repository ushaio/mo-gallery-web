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
	flag.Parse()

	// 加载配置
	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("加载配置失败: %v", err)
	}

	// 初始化数据库连接
	if cfg.Database.DSN() != "" {
		if err := db.Connect(cfg.Database.DSN()); err != nil {
			log.Printf("数据库连接失败: %v (部分功能不可用)", err)
		} else {
			log.Println("数据库连接成功")
		}
	}

	// 创建 App 实例
	app := NewApp(cfg)

	// 启动 Wails 应用
	err = wails.Run(&options.App{
		Title:  "MO Gallery Desktop",
		Width:  1440,
		Height: 900,
		MinWidth: 1024,
		MinHeight: 700,
		AssetServer: &assetserver.Options{
			Assets: assets,
			// /__zine/* 同源动态资源：PDF 导出用的系统中文字体与远程图片代理
			Handler: services.NewZineAssetHandler(app.Proxy),
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop: true,
		},
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			Theme:                windows.SystemDefault,
		},
	})

	if err != nil {
		fmt.Println("启动失败:", err.Error())
		os.Exit(1)
	}
}
