package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	_ "net/http/pprof"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	agent_extensions "mo-gallery-desktop/agent_extensions"
	"mo-gallery-desktop/config"
	"mo-gallery-desktop/db"
	"mo-gallery-desktop/image"
	local_library "mo-gallery-desktop/local_library"
	"mo-gallery-desktop/services"
	"mo-gallery-desktop/storage_plugins"
)

type WindowAppearance struct {
	ActiveStyle     string `json:"activeStyle"`
	ConfiguredStyle string `json:"configuredStyle"`
}

type App struct {
	ctx                 context.Context
	cfg                 *config.Config
	authMu              sync.RWMutex
	authenticatedUserID string
	cloudSyncMu         sync.Mutex
	cloudSyncCancel     context.CancelFunc
	localDownloadMu     sync.Mutex
	activeWindowStyle   string
	Proxy               *services.ProxyClient
	Auth                *services.AuthService
	Photo               *services.PhotoService
	Album               *services.AlbumService
	Story               *services.StoryService
	Blog                *services.BlogService
	FilmRoll            *services.FilmRollService
	Friend              *services.FriendService
	Comment             *services.CommentService
	Upload              *services.UploadService
	Storage             *services.StorageService
	Settings            *services.SettingsService
	EditorAi            *services.EditorAiService
	ModelCatalog        *services.ModelCatalogService
	Logger              *services.Logger
	ZineOperationLogger *services.ZineOperationLogger
	Overview            *services.OverviewService
	Inspiration         *services.InspirationService
	Updater             *services.UpdateService
	Usage               *services.UsageService
	LocalLibrary        *local_library.Manager
	AgentExtensions     *agent_extensions.Manager
	StoragePlugins      *storage_plugins.Manager
	PluginMarketplace   *storage_plugins.Marketplace
	automationEnabled   bool
	automation          *automationBridge
}

func NewApp(cfg *config.Config, automationEnabled bool) *App {
	app := &App{
		cfg:                 cfg,
		automationEnabled:   automationEnabled,
		activeWindowStyle:   config.NormalizeWindowStyle(cfg.UI.WindowStyle),
		Proxy:               services.NewProxyClient(),
		Logger:              services.NewLogger(cfg.Log.Enabled, cfg.Log.MaxEntries),
		ZineOperationLogger: services.NewZineOperationLogger(config.ConfigDir()),
		Updater:             services.NewUpdateService(config.ConfigDir()),
		Usage:               services.NewUsageService(config.ConfigDir(), desktopAppVersion()),
		ModelCatalog:        services.NewModelCatalogService(config.ConfigDir()),
		Inspiration:         services.NewInspirationService(),
	}
	if storageManager, err := storage_plugins.NewManager(config.ConfigDir()); err != nil {
		log.Printf("storage plugin manager init failed: %v", err)
	} else {
		app.StoragePlugins = storageManager
		app.PluginMarketplace = storage_plugins.NewMarketplace(config.ConfigDir(), storageManager)
	}
	app.LocalLibrary = local_library.NewManager(config.ConfigDir(), func(event local_library.LocalLibraryEvent) {
		if app.ctx != nil {
			runtime.EventsEmit(app.ctx, "local-library:event", event)
		}
	})
	return app
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// The wasm-backed AVIF encoder costs seconds to compile on first use; move
	// that out of the first photo upload.
	go image.WarmupAVIFEncoder()
	if runtime.Environment(ctx).BuildType == "dev" {
		// Dev-only pprof listener so a wedged local library manager can be
		// inspected via http://127.0.0.1:6060/debug/pprof/goroutine?debug=2
		go func() {
			if err := http.ListenAndServe("127.0.0.1:6060", nil); err != nil {
				log.Printf("pprof listener stopped: %v", err)
			}
		}()
	}
	if a.StoragePlugins != nil {
		// An unpacked plugin directory is only an explicit Wails development
		// workflow. Production and debug builds must use signed packages.
		a.StoragePlugins.SetDeveloperMode(runtime.Environment(ctx).BuildType == "dev")
	}
	a.Proxy.SetLogger(a.Logger)
	a.Auth = services.NewAuthService(a.cfg)
	a.Auth.SetProxy(a.Proxy)
	a.Photo = services.NewPhotoService(a.Proxy)
	a.Album = services.NewAlbumService(a.Proxy)
	a.Story = services.NewStoryService(a.Proxy)
	a.Blog = services.NewBlogService(a.Proxy)
	a.FilmRoll = services.NewFilmRollService(a.Proxy)
	a.Friend = services.NewFriendService(a.Proxy)
	a.Comment = services.NewCommentService(a.Proxy)
	a.Upload = services.NewUploadService(a.Proxy)
	a.Upload.SetStoragePlugins(a.StoragePlugins)
	a.Upload.SetProgressCallback(func(event services.UploadProgress) {
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "upload:progress", event)
		}
	})
	a.Storage = services.NewStorageService(a.Proxy)
	a.Settings = services.NewSettingsService(a.Proxy)
	a.EditorAi = services.NewEditorAiService(a.cfg, a.Upload)
	a.EditorAi.SetLogger(a.Logger)
	a.ModelCatalog.SetLogger(a.Logger)
	a.Overview = services.NewOverviewService(a.Proxy)
	cloudSyncCtx, cloudSyncCancel := context.WithCancel(context.Background())
	a.cloudSyncCancel = cloudSyncCancel
	go a.runLocalLibraryCloudSyncLoop(cloudSyncCtx)
	var extensionErr error
	a.AgentExtensions, extensionErr = agent_extensions.NewManager(config.ConfigDir())
	if extensionErr != nil {
		a.Logger.Error(services.LogCategorySystem, "agent_extensions_init_failed", "Agent 扩展初始化失败", extensionErr.Error())
	}

	// 加载日志
	a.Logger.Load()

	// 启动本地 AI 流式 HTTP 服务
	a.startAiHTTPServer()
	a.startAutomationServer()

	a.Logger.Info(services.LogCategorySystem, "app_start", "应用启动", "")

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
		defer cancel()
		_ = a.Usage.Report(ctx)
	}()
}

// setAiCORSHeaders allows the Wails WebView to call the local AI HTTP server.
// Pi AI uses the OpenAI JS SDK, which adds X-Stainless-* headers. The CORS
// preflight must allow those requested headers or WebView reports Connection error.
func setAiCORSHeaders(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

	requestedHeaders := strings.TrimSpace(r.Header.Get("Access-Control-Request-Headers"))
	if requestedHeaders != "" {
		w.Header().Set("Access-Control-Allow-Headers", requestedHeaders)
		w.Header().Add("Vary", "Access-Control-Request-Headers")
	} else {
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	}
}

// startAiHTTPServer 启动本地 HTTP 服务用于 AI 流式生成
func (a *App) startAiHTTPServer() {
	// 回收上次运行遗留的 streaming 脏消息
	a.EditorAi.RecoverInterruptedMessages()

	mux := http.NewServeMux()

	// OpenAI 兼容透明代理：前端共享 ai-agent 包经此访问模型，
	// 密钥解析与注入在 Go 侧完成
	mux.HandleFunc("/v1/chat/completions", func(w http.ResponseWriter, r *http.Request) {
		setAiCORSHeaders(w, r)
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		a.EditorAi.ProxyChatCompletions(w, r)
	})

	mux.HandleFunc("/ai/generate", func(w http.ResponseWriter, r *http.Request) {
		setAiCORSHeaders(w, r)
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var input services.EditorAiGenerateInput
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if _, err := a.requireAuthenticatedUserID(); err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}
		if err := a.EditorAi.GenerateImageStream(input, w); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	})

	mux.HandleFunc("/ai/persist-input-images", func(w http.ResponseWriter, r *http.Request) {
		setAiCORSHeaders(w, r)
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if _, err := a.requireAuthenticatedUserID(); err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}

		var input struct {
			ConversationID string   `json:"conversationId"`
			Images         []string `json:"images"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<20)).Decode(&input); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		images, err := a.EditorAi.PersistInputImages(input.Images, input.ConversationID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(struct {
			Images []string `json:"images"`
		}{Images: images}); err != nil {
			log.Printf("写入 AI 图片持久化响应失败: %v", err)
		}
	})

	mux.HandleFunc("/ai/input-image/", func(w http.ResponseWriter, r *http.Request) {
		setAiCORSHeaders(w, r)
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		if r.Method != "GET" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if _, err := a.requireAuthenticatedUserID(); err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}

		filename := strings.TrimPrefix(r.URL.Path, "/ai/input-image/")
		data, mimeType, err := a.EditorAi.ReadPersistedInputImage(filename)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", mimeType)
		w.Header().Set("Cache-Control", "private, max-age=86400")
		_, _ = w.Write(data)
	})

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Printf("启动 AI HTTP 服务失败: %v", err)
		return
	}
	port := listener.Addr().(*net.TCPAddr).Port
	a.EditorAi.SetHTTPPort(port)
	log.Printf("AI HTTP 服务已启动: http://127.0.0.1:%d", port)

	go func() {
		if err := http.Serve(listener, mux); err != nil && err != http.ErrServerClosed {
			log.Printf("AI HTTP 服务异常退出: %v", err)
		}
	}()
}

func (a *App) shutdown(ctx context.Context) {
	if a.automation != nil {
		a.automation.close()
	}
	if a.cloudSyncCancel != nil {
		a.cloudSyncCancel()
	}
	if a.Upload != nil {
		a.Upload.CleanupClipboardUploads()
	}
	if a.AgentExtensions != nil {
		a.AgentExtensions.StopAll()
	}
	if a.StoragePlugins != nil {
		a.StoragePlugins.StopAll()
	}
	if a.LocalLibrary != nil {
		_ = a.LocalLibrary.Close()
	}
	db.CloseLocalAI()
	db.CloseLocalDrafts()
	db.CloseLocalZine()
	db.CloseLocalDesignCanvas()
}

func (a *App) GetWindowAppearance() WindowAppearance {
	return WindowAppearance{
		ActiveStyle:     a.activeWindowStyle,
		ConfiguredStyle: config.NormalizeWindowStyle(a.cfg.UI.WindowStyle),
	}
}

func (a *App) UpdateWindowStyle(style string) (WindowAppearance, error) {
	if !config.IsValidWindowStyle(style) {
		return a.GetWindowAppearance(), errors.New("不支持的窗口风格")
	}
	previousStyle := a.cfg.UI.WindowStyle
	a.cfg.UI.WindowStyle = config.NormalizeWindowStyle(style)
	if err := a.cfg.Save(""); err != nil {
		a.cfg.UI.WindowStyle = previousStyle
		return a.GetWindowAppearance(), err
	}
	return a.GetWindowAppearance(), nil
}

// RestartApplication starts a replacement process with the persisted settings,
// then closes the current process. The restart marker lets the replacement
// bypass the single-instance handoff while the old process is still exiting.
func (a *App) RestartApplication() error {
	executable, err := os.Executable()
	if err != nil {
		return err
	}

	command := exec.Command(executable, os.Args[1:]...)
	command.Env = append(os.Environ(), "MO_GALLERY_RESTART=1")
	if err := command.Start(); err != nil {
		return err
	}

	if a.ctx != nil {
		runtime.Quit(a.ctx)
	}
	return nil
}

func (a *App) CheckForUpdates(currentVersion string, force bool) (*services.UpdateInfo, error) {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return a.Updater.Check(ctx, currentVersion, force)
}

func (a *App) DownloadUpdate() (*services.UpdateDownloadResult, error) {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return a.Updater.Download(ctx, func(progress services.UpdateDownloadProgress) {
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "app-update:progress", progress)
		}
	})
}

func (a *App) OpenDownloadedUpdate() error {
	shouldQuit, err := a.Updater.OpenDownloaded()
	if err != nil {
		return err
	}
	if shouldQuit && a.ctx != nil {
		runtime.Quit(a.ctx)
	}
	return nil
}

// ─── Auth ────────────────────────────────────────────

func (a *App) Login(serverURL, username, password string, rememberLogin bool) (*services.LoginResult, error) {
	result, err := a.Auth.Login(serverURL, username, password, rememberLogin)
	if err != nil {
		a.Logger.Error(services.LogCategoryAuth, "login_failed", "登录失败", err.Error())
		return nil, err
	}
	a.Proxy.SetServer(result.Server)
	a.Proxy.SetToken(result.Token)
	a.setAuthenticatedUser(result.User.ID)
	a.syncAllStorageSourcesToCloud()
	go a.syncLocalLibraryCloudInBackground()
	if a.Upload != nil {
		go a.Upload.RetryPendingRegistrations(context.Background())
	}
	a.Logger.Info(services.LogCategoryAuth, "login_success", "登录成功", "用户: "+username+", 服务器: "+serverURL)
	return result, nil
}

func (a *App) SetAuth(serverURL, token string) (*services.UserInfo, error) {
	endpoint, err := services.ParseLoginEndpoint(serverURL)
	if err != nil {
		return nil, err
	}
	// 前端刷新后会乐观渲染页面并与本调用并行发起业务请求。先挂起代理
	// 请求，token 写入后自动放行，避免首屏请求因缺少认证头而失败。
	a.Proxy.BeginAuthRestore()
	defer a.Proxy.EndAuthRestore()
	a.Proxy.SetServer(endpoint.BaseURL)
	a.Proxy.SetToken(token)
	a.Auth.SetProxy(a.Proxy)
	user, err := a.Auth.GetCurrentUser()
	if err != nil {
		a.Proxy.SetToken("")
		a.setAuthenticatedUser("")
		a.Logger.Warn(services.LogCategoryAuth, "restore_auth_failed", "恢复登录态失败", err.Error())
		return nil, err
	}

	a.setAuthenticatedUser(user.ID)
	// 存储源镜像是 best-effort 同步，不能阻塞登录恢复——否则刷新时每个
	// 源的网络往返都会叠加进启动 Loading 时长。
	go a.syncAllStorageSourcesToCloud()
	go a.syncLocalLibraryCloudInBackground()
	if a.Upload != nil {
		go a.Upload.RetryPendingRegistrations(context.Background())
	}
	return user, nil
}

func (a *App) ClearAuth() {
	a.Proxy.SetToken("")
	a.setAuthenticatedUser("")
}

func (a *App) setAuthenticatedUser(userID string) {
	a.authMu.Lock()
	a.authenticatedUserID = strings.TrimSpace(userID)
	a.authMu.Unlock()
}

func (a *App) requireAuthenticatedUserID() (string, error) {
	a.authMu.RLock()
	userID := a.authenticatedUserID
	a.authMu.RUnlock()
	if userID == "" {
		return "", errors.New("未登录或登录状态已失效")
	}
	return userID, nil
}

func (a *App) GetApiConfig() map[string]interface{} {
	// 解密密码
	decryptedPassword := ""
	if a.cfg.API.RememberLogin && a.cfg.API.SavedPassword != "" {
		if pwd, err := config.DecryptPassword(a.cfg.API.SavedPassword); err == nil {
			decryptedPassword = pwd
		}
	}

	return map[string]interface{}{
		"base_url":       a.cfg.API.BaseURL,
		"login_url":      a.cfg.API.LoginURL,
		"remember_login": a.cfg.API.RememberLogin,
		"saved_username": a.cfg.API.SavedUsername,
		"saved_password": decryptedPassword,
	}
}

// GetSetupState returns the persisted first-run API setup state. Secrets are
// intentionally omitted from this response.
func (a *App) GetSetupState() map[string]interface{} {
	return map[string]interface{}{
		"completed": a.cfg.UI.SetupCompleted,
		"api": map[string]interface{}{
			"base_url":            a.cfg.API.BaseURL,
			"login_url":           a.cfg.API.LoginURL,
			"password_configured": a.cfg.API.SavedPassword != "",
			"remember_login":      a.cfg.API.RememberLogin,
			"saved_username":      a.cfg.API.SavedUsername,
		},
	}
}

// CompleteSetup persists the first-run API and optional cloud login settings.
// The payload remains a map so older clients may submit their legacy database
// field without affecting the API-only cloud data path.
func (a *App) CompleteSetup(data map[string]interface{}) error {
	api, _ := data["api"].(map[string]interface{})

	if value, ok := api["login_url"].(string); ok {
		loginURL := strings.TrimRight(strings.TrimSpace(value), "/")
		endpoint, err := services.ParseLoginEndpoint(loginURL)
		if err != nil {
			return err
		}
		a.cfg.API.LoginURL = endpoint.LoginURL
		a.cfg.API.BaseURL = endpoint.BaseURL
	}
	if value, ok := api["remember_login"].(bool); ok {
		a.cfg.API.RememberLogin = value
	}
	if value, ok := api["saved_username"].(string); ok {
		a.cfg.API.SavedUsername = strings.TrimSpace(value)
	}
	if value, ok := api["password"].(string); ok {
		if !a.cfg.API.RememberLogin {
			a.cfg.API.SavedPassword = ""
		} else if value != "" {
			encrypted, err := config.EncryptPassword(value)
			if err != nil {
				return err
			}
			a.cfg.API.SavedPassword = encrypted
		}
	}

	a.cfg.UI.SetupCompleted = true
	if err := a.cfg.Save(""); err != nil {
		return err
	}
	return nil
}

// FetchURLMetadata fetches a URL, parses the HTML, and extracts
// title, description, and avatar (favicon / og:image).
func (a *App) FetchURLMetadata(rawURL string) (*FetchURLMetadataResult, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("GET", rawURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; MoGallery/1.0)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch url: %w", err)
	}
	defer resp.Body.Close()

	// Limit body to 512KB to avoid abuse
	body, err := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	result := &FetchURLMetadataResult{}
	doc, err := html.Parse(strings.NewReader(string(body)))
	if err != nil {
		return nil, fmt.Errorf("parse html: %w", err)
	}

	// Walk the DOM to extract title, meta tags, and favicon
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch n.DataAtom {
			case atom.Title:
				if n.FirstChild != nil && result.Title == "" {
					result.Title = strings.TrimSpace(n.FirstChild.Data)
				}
			case atom.Link:
				var rel, href string
				for _, attr := range n.Attr {
					if attr.Key == "rel" {
						rel = attr.Val
					}
					if attr.Key == "href" {
						href = attr.Val
					}
				}
				if (rel == "icon" || rel == "shortcut icon") && href != "" && result.Avatar == "" {
					result.Avatar = resolveURL(rawURL, href)
				}
			case atom.Meta:
				var name, property, content string
				for _, attr := range n.Attr {
					switch attr.Key {
					case "name":
						name = attr.Val
					case "property":
						property = attr.Val
					case "content":
						content = attr.Val
					}
				}
				content = strings.TrimSpace(content)
				switch {
				case strings.EqualFold(name, "description") && content != "" && result.Description == "":
					result.Description = content
				case strings.EqualFold(property, "og:title") && content != "" && result.Title == "":
					result.Title = content
				case strings.EqualFold(property, "og:description") && content != "" && result.Description == "":
					result.Description = content
				case strings.EqualFold(property, "og:image") && content != "" && result.Avatar == "":
					result.Avatar = resolveURL(rawURL, content)
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	// Trim long strings
	if len(result.Title) > 200 {
		result.Title = result.Title[:200]
	}
	if len(result.Description) > 500 {
		result.Description = result.Description[:500]
	}

	return result, nil
}

// resolveURL resolves a relative URL against a base URL.
func resolveURL(base, href string) string {
	if strings.HasPrefix(href, "http://") || strings.HasPrefix(href, "https://") {
		return href
	}
	if strings.HasPrefix(href, "//") {
		// Protocol-relative URL
		parsed, err := url.Parse(base)
		if err != nil {
			return href
		}
		return parsed.Scheme + ":" + href
	}
	baseURL, err := url.Parse(base)
	if err != nil {
		return href
	}
	resolved, err := baseURL.Parse(href)
	if err != nil {
		return href
	}
	return resolved.String()
}

// ─── Comments ────────────────────────────────────────

func (a *App) GetComments(params services.ListCommentsParams) (*services.PaginatedResponse[services.CommentDTO], error) {
	return a.Comment.List(params)
}
func (a *App) UpdateCommentStatus(id string, status string) error {
	return a.Comment.UpdateStatus(id, status)
}
func (a *App) DeleteComment(id string) error { return a.Comment.Delete(id) }

// ─── Upload ──────────────────────────────────────────

func (a *App) PrepareUpload(filePaths []string) ([]services.PreparedFile, error) {
	return a.Upload.PrepareUpload(filePaths)
}

func (a *App) PrepareClipboardUpload(fileNames, dataURLs []string) ([]services.PreparedFile, error) {
	return a.Upload.PrepareClipboardUpload(fileNames, dataURLs)
}

func localAssetIDs(ids []string) []local_library.AssetID {
	assetIDs := make([]local_library.AssetID, len(ids))
	for index, id := range ids {
		assetIDs[index] = local_library.AssetID(id)
	}
	return assetIDs
}

func (a *App) PrepareLocalAssetUpload(ids []string) ([]services.PreparedFile, error) {
	var prepared []services.PreparedFile
	err := a.LocalLibrary.WithOriginalPaths(localAssetIDs(ids), func(paths []string) error {
		var prepareErr error
		prepared, prepareErr = a.Upload.PrepareUpload(paths)
		return prepareErr
	})
	if err != nil {
		return nil, err
	}
	for index := range prepared {
		prepared[index].AssetID = ids[index]
	}
	return prepared, nil
}

func (a *App) setLocalAssetCloudLink(id string, photo *services.PhotoDTO) error {
	if photo == nil || photo.ID == "" {
		return errors.New("云端照片详情不完整")
	}
	change := local_library.CloudPhotoChange{
		ID: photo.ID, Path: photo.Path, ThumbPath: photo.ThumbPath,
		StorageSourceID: photo.StorageSourceID, StoragePluginID: photo.StoragePluginID,
		StorageURLType: photo.StorageURLType, UpdatedAt: photo.UpdatedAt,
	}
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		err = a.LocalLibrary.SetAssetCloudLink(local_library.AssetID(id), photo.ID)
		if err == nil {
			projectionErr := a.LocalLibrary.ApplyCloudPhotoChanges([]local_library.CloudPhotoChange{change}, "", false)
			if projectionErr != nil {
				// The identity link is already durable; leave it marked uploaded and
				// let the periodic cloud sync repair projection metadata.
				err = nil
			}
		}
		if err == nil {
			return nil
		}
		time.Sleep(time.Duration(attempt+1) * 50 * time.Millisecond)
	}
	return err
}

func (a *App) UploadLocalAsset(id string, settings services.UploadSettings, hash string, exifData *image.ExifData) (*services.UploadResult, error) {
	var result *services.UploadResult
	err := a.LocalLibrary.WithOriginalPaths([]local_library.AssetID{local_library.AssetID(id)}, func(paths []string) error {
		var uploadErr error
		result, uploadErr = a.Upload.UploadFile(paths[0], settings, hash, exifData)
		return uploadErr
	})
	if err != nil {
		return nil, err
	}
	if result != nil && result.Success {
		a.Logger.Info(services.LogCategoryUpload, "upload_success", "上传成功: "+filepath.Base(result.FilePath), "")
		if result.Photo == nil || result.Photo.ID == "" {
			linkErr := errors.New("云端上传成功，但服务端未返回可关联的照片 ID")
			a.Logger.Error(services.LogCategoryUpload, "local_cloud_link_failed", "云端上传成功，但本地关联写回失败", linkErr.Error())
			return result, linkErr
		}
		if linkErr := a.setLocalAssetCloudLink(id, result.Photo); linkErr != nil {
			a.Logger.Error(services.LogCategoryUpload, "local_cloud_link_failed", "云端上传成功，但本地关联写回失败", linkErr.Error())
			return result, fmt.Errorf("云端上传成功，但本地关联写回失败: %w", linkErr)
		}
	} else if result != nil && result.IsDuplicate && result.Existing != nil && result.Existing.ID != "" {
		if a.Photo == nil {
			return result, errors.New("云端照片已存在，但云端服务尚未就绪，无法写回本地关联")
		}
		existingPhoto, getErr := a.Photo.GetByID(result.Existing.ID)
		if getErr != nil {
			a.Logger.Error(services.LogCategoryUpload, "local_cloud_link_failed", "云端照片已存在，但读取云端详情失败", getErr.Error())
			return result, fmt.Errorf("云端照片已存在，但读取云端详情失败: %w", getErr)
		}
		if existingPhoto == nil || existingPhoto.ID == "" {
			return result, errors.New("云端照片已存在，但服务端未返回可关联的照片详情")
		}
		if linkErr := a.setLocalAssetCloudLink(id, existingPhoto); linkErr != nil {
			a.Logger.Error(services.LogCategoryUpload, "local_cloud_link_failed", "云端照片已存在，但本地关联写回失败", linkErr.Error())
			return result, fmt.Errorf("云端照片已存在，但本地关联写回失败: %w", linkErr)
		}
	}
	return result, nil
}

func (a *App) CheckDuplicates(hashes []string) (*services.DuplicateCheckResult, error) {
	return a.Upload.CheckDuplicates(hashes)
}
func (a *App) UploadFile(filePath string, settings services.UploadSettings, hash string, exifData *image.ExifData) (*services.UploadResult, error) {
	result, err := a.Upload.UploadFile(filePath, settings, hash, exifData)
	if err != nil {
		a.Logger.Error(services.LogCategoryUpload, "upload_failed", "上传失败: "+filepath.Base(filePath), err.Error())
	} else if result != nil && result.Success {
		a.Logger.Info(services.LogCategoryUpload, "upload_success", "上传成功: "+filepath.Base(filePath), "")
	}
	return result, err
}

// ─── File Dialog ─────────────────────────────────────

func (a *App) SelectFiles() ([]string, error) {
	files, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择照片",
		Filters: []runtime.FileFilter{
			{DisplayName: "图片文件 (*.jpg;*.jpeg;*.png;*.webp;*.avif;*.tiff;*.tif)", Pattern: "*.jpg;*.jpeg;*.png;*.webp;*.avif;*.tiff;*.tif"},
		},
	})
	if err != nil {
		return nil, err
	}
	if files == nil {
		return []string{}, nil
	}
	return files, nil
}

func (a *App) SelectFolder() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "选择文件夹"})
}

// GetFileThumbnail 读取本地文件并返回 base64 data URL（用于缩略图预览）
func (a *App) GetFileThumbnail(filePath string) (string, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}
	ext := strings.ToLower(filepath.Ext(filePath))
	mime := map[string]string{
		".jpg": "image/jpeg", ".jpeg": "image/jpeg",
		".png": "image/png", ".webp": "image/webp",
		".avif": "image/avif", ".tiff": "image/tiff", ".tif": "image/tiff",
		".bmp": "image/bmp", ".gif": "image/gif",
	}[ext]
	if mime == "" {
		mime = "application/octet-stream"
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

// ─── Settings ────────────────────────────────────────

func (a *App) GetSettings() (map[string]string, error) {
	settings, err := a.Settings.GetSettings()
	if err != nil {
		return nil, err
	}
	settings["official_site_url"] = a.cfg.Official.BaseURL
	return settings, nil
}
func (a *App) UpdateSettings(data map[string]string) (map[string]string, error) {
	remote := make(map[string]string, len(data))
	for key, value := range data {
		remote[key] = value
	}
	if value, ok := remote["official_site_url"]; ok {
		value = strings.TrimRight(strings.TrimSpace(value), "/")
		if value == "" {
			value = "http://localhost:3001"
		}
		if _, err := url.ParseRequestURI(value); err != nil {
			return nil, errors.New("官方站地址无效")
		}
		a.cfg.Official.BaseURL = value
		delete(remote, "official_site_url")
		if err := a.cfg.Save(""); err != nil {
			return nil, err
		}
	}
	result, err := a.Settings.UpdateSettings(remote)
	if result == nil {
		result = map[string]string{}
	}
	result["official_site_url"] = a.cfg.Official.BaseURL
	return result, err
}
func (a *App) FixMissingPhotos(photoIDs []string) (*services.FixMissingPhotosResult, error) {
	return a.Storage.FixMissing(photoIDs)
}
func (a *App) GenerateThumbnail(photoID string) (*services.PhotoDTO, error) {
	return a.Storage.GenerateThumbnail(photoID)
}

// ─── Linux DO OAuth ───────────────────────────────────

func (a *App) IsLinuxDoEnabled() (bool, error) {
	return a.Auth.IsLinuxDoEnabled()
}
func (a *App) GetLinuxDoBinding() (*services.LinuxDoBindingDTO, error) {
	return a.Auth.GetLinuxDoBinding()
}
func (a *App) GetLinuxDoAuthUrl() (*services.LinuxDoAuthUrlDTO, error) {
	return a.Auth.GetLinuxDoAuthUrl()
}
func (a *App) UnbindLinuxDoAccount() error {
	return a.Auth.UnbindLinuxDoAccount()
}

// ─── Editor AI ────────────────────────────────────────

func (a *App) GetAiHttpPort() int {
	return a.EditorAi.GetHTTPPort()
}

func (a *App) GetAiConfig() config.AIConfig {
	return a.cfg.AI.NormalizedCopy()
}

func (a *App) UpdateAiConfig(data config.AIConfig) error {
	data.Normalize()
	a.cfg.AI = data
	return a.cfg.Save("")
}

// GetModelCatalog 返回 models.dev 模型目录概览（模型源列表 + 缓存新鲜度状态）。
// 目录不可用时返回空列表与状态说明，由设置页提示手动填写，不作为错误上抛。
func (a *App) GetModelCatalog() services.ModelCatalogDTO {
	return a.ModelCatalog.GetCatalog(a.ctx)
}

// RefreshModelCatalog 强制刷新模型目录（忽略 TTL）。
func (a *App) RefreshModelCatalog() services.ModelCatalogDTO {
	return a.ModelCatalog.RefreshCatalog(a.ctx)
}

// LookupModelSpecs 按『可选 provider 提示 + 模型名列表』批量返回模型规格，
// 供设置页自动填入模型能力与上下文窗口（用户仍可手动覆盖）。
func (a *App) LookupModelSpecs(input services.ModelCatalogBatchLookupInput) services.ModelCatalogBatchLookupResult {
	return a.ModelCatalog.LookupModelSpecs(a.ctx, input)
}

// Local AI conversations live in the desktop profile's SQLite database and
// must remain available when the app is used without a cloud login.
const localEditorAiUserID = "desktop-local"

func (a *App) GetEditorAiConversations(scopeId string) ([]services.EditorAiConversationDTO, error) {
	return a.EditorAi.ListConversations(localEditorAiUserID, scopeId)
}
func (a *App) GetEditorAiConversationPage(scopeId string, offset int, limit int) (*services.EditorAiConversationPageDTO, error) {
	return a.EditorAi.ListConversationPage(localEditorAiUserID, scopeId, offset, limit)
}
func (a *App) CreateEditorAiConversation(input services.EditorAiConversationCreateInput) (*services.EditorAiConversationDTO, error) {
	return a.EditorAi.CreateConversation(localEditorAiUserID, input)
}
func (a *App) GetEditorAiConversation(conversationId string) (*services.EditorAiConversationWithMessagesDTO, error) {
	return a.EditorAi.GetConversation(localEditorAiUserID, conversationId)
}
func (a *App) GetEditorAiConversationMessagesPage(conversationId string, beforeCreatedAt string, beforeId string, limit int) (*services.EditorAiConversationWithMessagesDTO, error) {
	return a.EditorAi.GetConversationPage(localEditorAiUserID, conversationId, beforeCreatedAt, beforeId, limit)
}
func (a *App) UpdateEditorAiConversation(conversationId string, input services.EditorAiConversationUpdateInput) (*services.EditorAiConversationDTO, error) {
	return a.EditorAi.UpdateConversation(localEditorAiUserID, conversationId, input)
}
func (a *App) DeleteEditorAiConversation(conversationId string) error {
	return a.EditorAi.DeleteConversation(localEditorAiUserID, conversationId)
}
func (a *App) ClearEditorAiConversation(conversationId string) (*services.EditorAiConversationDTO, error) {
	return a.EditorAi.ClearConversation(localEditorAiUserID, conversationId)
}
func (a *App) AppendEditorAiMessage(input services.EditorAiMessageAppendInput) (*services.EditorAiMessageDTO, error) {
	return a.EditorAi.AppendMessage(localEditorAiUserID, input)
}
func (a *App) FinishEditorAiMessage(input services.EditorAiMessageFinishInput) (*services.EditorAiMessageDTO, error) {
	return a.EditorAi.FinishMessage(localEditorAiUserID, input)
}
func (a *App) UpdateEditorAiTaskState(input services.EditorAiTaskStateUpdateInput) (*services.EditorAiMessageDTO, error) {
	return a.EditorAi.UpdateTaskState(localEditorAiUserID, input)
}
func (a *App) GetStoryAiModels() (*services.StoryAiModelsResponseDTO, error) {
	return a.EditorAi.GetModels()
}
func (a *App) GetStoryAiProviderModels(providerID string) (*services.StoryAiModelsResponseDTO, error) {
	return a.EditorAi.GetProviderModels(providerID)
}
func (a *App) GetAiImageDataURL(messageId string) (string, error) {
	userID, err := a.requireAuthenticatedUserID()
	if err != nil {
		return "", err
	}
	return a.EditorAi.GetImageDataURL(userID, messageId)
}
func (a *App) SaveAiImageToAlbum(messageId string) (*services.PhotoDTO, error) {
	userID, err := a.requireAuthenticatedUserID()
	if err != nil {
		return nil, err
	}
	return a.EditorAi.SaveImageToAlbum(userID, messageId, a.Upload)
}
func (a *App) SaveMessageImageToAlbum(messageId string, imageURL string) (*services.PhotoDTO, error) {
	userID, err := a.requireAuthenticatedUserID()
	if err != nil {
		return nil, err
	}
	return a.EditorAi.SaveMessageImageToAlbum(userID, messageId, imageURL, a.Upload)
}

func suggestedAiImageExtension(imageURL string) string {
	if strings.HasPrefix(imageURL, "data:image/jpeg") {
		return ".jpg"
	}
	if strings.HasPrefix(imageURL, "data:image/webp") {
		return ".webp"
	}
	if strings.HasPrefix(imageURL, "data:image/gif") {
		return ".gif"
	}
	if strings.HasPrefix(imageURL, "data:image/avif") {
		return ".avif"
	}
	if strings.HasPrefix(imageURL, "data:image/png") {
		return ".png"
	}

	pathWithoutQuery := strings.SplitN(imageURL, "?", 2)[0]
	ext := strings.ToLower(filepath.Ext(pathWithoutQuery))
	switch ext {
	case ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif":
		return ext
	default:
		return ".png"
	}
}

func (a *App) DownloadMessageImageToLocal(imageURL string) (string, error) {
	defaultName := "ai-image-" + time.Now().Format("20060102-150405") + suggestedAiImageExtension(imageURL)
	filePath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "????",
		DefaultFilename: defaultName,
		Filters: []runtime.FileFilter{
			{DisplayName: "???? (*.png;*.jpg;*.jpeg;*.webp;*.gif;*.avif)", Pattern: "*.png;*.jpg;*.jpeg;*.webp;*.gif;*.avif"},
		},
	})
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(filePath) == "" {
		return "", nil
	}
	if err := a.EditorAi.DownloadMessageImageToFile(imageURL, filePath); err != nil {
		return "", err
	}
	return filePath, nil
}

func (a *App) SaveMessageImageToLocalLibrary(imageURL string, destination string) ([]local_library.ImportResult, error) {
	extension := suggestedAiImageExtension(imageURL)
	tempFile, err := os.CreateTemp("", "mo-gallery-ai-*"+extension)
	if err != nil {
		return nil, err
	}
	tempPath := tempFile.Name()
	if err := tempFile.Close(); err != nil {
		os.Remove(tempPath)
		return nil, err
	}
	defer os.Remove(tempPath)
	if err := a.EditorAi.DownloadMessageImageToFile(imageURL, tempPath); err != nil {
		return nil, err
	}
	return a.LocalLibrary.ImportFiles([]string{tempPath}, destination)
}

// DownloadCloudPhotoToLocalLibrary downloads the original image of a cloud photo
// into a local library. If libraryPath differs from the currently open session,
// the target library is opened first. The imported asset is then linked to the
// cloud photo and marked as uploaded. Progress is emitted via "download:progress"
// events so the renderer can show a download queue popup. taskID is the ID the
// renderer already created for its download queue entry; it is reused for every
// progress event so the renderer can match them. conflictPolicy decides what
// happens when the destination already has a file with the same name: "rename"
// (default) keeps both via auto-rename, "overwrite" replaces it, "skip" keeps
// the existing file and reports status "skipped".
func (a *App) DownloadCloudPhotoToLocalLibrary(taskID string, photoID string, destination string, libraryPath string, conflictPolicy string) ([]local_library.ImportResult, error) {
	if a.LocalLibrary == nil {
		return nil, errors.New("本地资源库未初始化")
	}
	if a.Photo == nil || !a.Proxy.IsReady() {
		return nil, errors.New("云端服务尚未就绪")
	}
	if strings.TrimSpace(taskID) == "" {
		taskID = photoID + "-" + time.Now().Format("20060102150405.000000000")
	}
	a.emitDownloadProgress(taskID, "fetching", 0, "", photoID, cloudPhotoTitle(nil), 0)
	photo, err := a.Photo.GetByID(photoID)
	if err != nil {
		a.emitDownloadProgress(taskID, "failed", 0, fmt.Errorf("获取云端照片失败: %w", err).Error(), photoID, "", 0)
		return nil, fmt.Errorf("获取云端照片失败: %w", err)
	}
	if photo.URL == "" {
		a.emitDownloadProgress(taskID, "failed", 0, "云端照片没有可下载的原图地址", photoID, cloudPhotoTitle(photo), 0)
		return nil, errors.New("云端照片没有可下载的原图地址")
	}
	// Resolve relative URL to absolute, using the proxy's base URL.
	downloadURL := services.ResolveUploadURL(a.Proxy.BaseURL(), photo.URL)
	// Derive the original file name from the photo's path or URL.
	originalFileName := cloudPhotoFileName(photo)
	fileSize := int64(0)
	if photo.Size != nil {
		fileSize = *photo.Size
	}
	// Download the original to a temp file.
	a.emitDownloadProgress(taskID, "downloading", 0, "", photoID, cloudPhotoTitle(photo), fileSize)
	extension := suggestedAiImageExtension(downloadURL)
	tempFile, err := os.CreateTemp("", "mo-gallery-cloud-*"+extension)
	if err != nil {
		a.emitDownloadProgress(taskID, "failed", 0, err.Error(), photoID, cloudPhotoTitle(photo), fileSize)
		return nil, err
	}
	tempPath := tempFile.Name()
	if err := tempFile.Close(); err != nil {
		os.Remove(tempPath)
		a.emitDownloadProgress(taskID, "failed", 0, err.Error(), photoID, cloudPhotoTitle(photo), fileSize)
		return nil, err
	}
	defer os.Remove(tempPath)
	if err := downloadFileWithAuth(a.ctx, downloadURL, tempPath, a.Proxy, taskID, func(read int64, total int64) {
		if total > 0 {
			a.emitDownloadProgressBytes(taskID, "downloading", int(float64(read)/float64(total)*80), "", photoID, cloudPhotoTitle(photo), total, read, total)
		}
	}); err != nil {
		a.emitDownloadProgress(taskID, "failed", 0, fmt.Errorf("下载原图失败: %w", err).Error(), photoID, cloudPhotoTitle(photo), fileSize)
		return nil, fmt.Errorf("下载原图失败: %w", err)
	}
	a.emitDownloadProgress(taskID, "importing", 85, "", photoID, cloudPhotoTitle(photo), fileSize)
	// Serialize the library-mutation section. Batch downloads start many
	// concurrent DownloadCloudPhotoToLocalLibrary calls; letting them all import,
	// cloud-link, and queue thumbnails at once (while the initial scan of a large
	// library is still walking the tree) can wedge the local library manager.
	a.localDownloadMu.Lock()
	defer a.localDownloadMu.Unlock()
	// Open the target library if it is not the current session.
	if libraryPath != "" {
		if snapshot, snapshotErr := a.LocalLibrary.Snapshot(); snapshotErr != nil || !strings.EqualFold(snapshot.RootPath, libraryPath) {
			if _, openErr := a.LocalLibrary.Open(libraryPath); openErr != nil {
				a.emitDownloadProgress(taskID, "failed", 0, fmt.Errorf("打开目标资源库失败: %w", openErr).Error(), photoID, cloudPhotoTitle(photo), fileSize)
				return nil, fmt.Errorf("打开目标资源库失败: %w", openErr)
			}
		}
	}
	result, err := a.LocalLibrary.ImportDownloadedFile(tempPath, destination, originalFileName, conflictPolicy)
	results := []local_library.ImportResult{result}
	if err != nil {
		a.emitDownloadProgress(taskID, "failed", 0, err.Error(), photoID, cloudPhotoTitle(photo), fileSize)
		return results, err
	}
	if result.Status == "skipped" {
		a.emitDownloadProgress(taskID, "completed", 100, "", photoID, cloudPhotoTitle(photo), fileSize)
		return results, nil
	}
	// Link the imported asset to the cloud photo and update cloud projection.
	if result.AssetID != "" && result.Status != "failed" {
		_ = a.LocalLibrary.SetAssetCloudLink(local_library.AssetID(result.AssetID), photoID)
		if photo.Path != nil {
			changes := []local_library.CloudPhotoChange{{
				ID:              photoID,
				Path:            photo.Path,
				ThumbPath:       photo.ThumbPath,
				StorageSourceID: photo.StorageSourceID,
				StoragePluginID: photo.StoragePluginID,
				StorageURLType:  photo.StorageURLType,
				UpdatedAt:       photo.UpdatedAt,
			}}
			_ = a.LocalLibrary.ApplyCloudPhotoChanges(changes, "", true)
		}
	}
	a.emitDownloadProgress(taskID, "completed", 100, "", photoID, cloudPhotoTitle(photo), fileSize)
	return results, nil
}

// DownloadCloudPhotoToFolder downloads the original image of a cloud photo into
// an arbitrary local folder picked by the user via the system file manager.
// Unlike DownloadCloudPhotoToLocalLibrary it does not index the file into a
// local library; it is a plain file download. On a name collision the file is
// auto-renamed ("name (1).jpg") so existing files are never overwritten.
// Progress is emitted via "download:progress" events using taskID, and the
// absolute path of the saved file is returned on success.
func (a *App) DownloadCloudPhotoToFolder(taskID string, photoID string, targetDir string) (string, error) {
	if a.Photo == nil || !a.Proxy.IsReady() {
		return "", errors.New("云端服务尚未就绪")
	}
	if strings.TrimSpace(taskID) == "" {
		taskID = photoID + "-" + time.Now().Format("20060102150405.000000000")
	}
	targetDir = filepath.Clean(strings.TrimSpace(targetDir))
	if targetDir == "" || targetDir == "." {
		return "", errors.New("目标目录无效")
	}
	a.emitDownloadProgress(taskID, "fetching", 0, "", photoID, cloudPhotoTitle(nil), 0)
	photo, err := a.Photo.GetByID(photoID)
	if err != nil {
		a.emitDownloadProgress(taskID, "failed", 0, fmt.Errorf("获取云端照片失败: %w", err).Error(), photoID, "", 0)
		return "", fmt.Errorf("获取云端照片失败: %w", err)
	}
	if photo.URL == "" {
		a.emitDownloadProgress(taskID, "failed", 0, "云端照片没有可下载的原图地址", photoID, cloudPhotoTitle(photo), 0)
		return "", errors.New("云端照片没有可下载的原图地址")
	}
	downloadURL := services.ResolveUploadURL(a.Proxy.BaseURL(), photo.URL)
	originalFileName := cloudPhotoFileName(photo)
	fileSize := int64(0)
	if photo.Size != nil {
		fileSize = *photo.Size
	}
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		a.emitDownloadProgress(taskID, "failed", 0, fmt.Errorf("创建目标目录失败: %w", err).Error(), photoID, cloudPhotoTitle(photo), fileSize)
		return "", fmt.Errorf("创建目标目录失败: %w", err)
	}
	extension := suggestedAiImageExtension(downloadURL)
	tempFile, err := os.CreateTemp(targetDir, ".mo-gallery-download-*"+extension)
	if err != nil {
		a.emitDownloadProgress(taskID, "failed", 0, fmt.Errorf("创建临时文件失败: %w", err).Error(), photoID, cloudPhotoTitle(photo), fileSize)
		return "", fmt.Errorf("创建临时文件失败: %w", err)
	}
	tempPath := tempFile.Name()
	if err := tempFile.Close(); err != nil {
		os.Remove(tempPath)
		a.emitDownloadProgress(taskID, "failed", 0, err.Error(), photoID, cloudPhotoTitle(photo), fileSize)
		return "", err
	}
	defer os.Remove(tempPath)
	a.emitDownloadProgress(taskID, "downloading", 0, "", photoID, cloudPhotoTitle(photo), fileSize)
	if err := downloadFileWithAuth(a.ctx, downloadURL, tempPath, a.Proxy, taskID, func(read int64, total int64) {
		if total > 0 {
			a.emitDownloadProgressBytes(taskID, "downloading", int(float64(read)/float64(total)*90), "", photoID, cloudPhotoTitle(photo), total, read, total)
		}
	}); err != nil {
		a.emitDownloadProgress(taskID, "failed", 0, fmt.Errorf("下载原图失败: %w", err).Error(), photoID, cloudPhotoTitle(photo), fileSize)
		return "", fmt.Errorf("下载原图失败: %w", err)
	}
	destinationPath := filepath.Join(targetDir, originalFileName)
	if _, statErr := os.Stat(destinationPath); statErr == nil {
		destinationPath = nextAvailableDownloadPath(targetDir, originalFileName)
	}
	if err := os.Rename(tempPath, destinationPath); err != nil {
		a.emitDownloadProgress(taskID, "failed", 0, fmt.Errorf("保存文件失败: %w", err).Error(), photoID, cloudPhotoTitle(photo), fileSize)
		return "", fmt.Errorf("保存文件失败: %w", err)
	}
	a.emitDownloadProgress(taskID, "completed", 100, "", photoID, cloudPhotoTitle(photo), fileSize)
	return destinationPath, nil
}

// nextAvailableDownloadPath returns a file path in dir that does not collide
// with an existing file by appending " (n)" before the extension.
func nextAvailableDownloadPath(dir string, fileName string) string {
	ext := filepath.Ext(fileName)
	name := strings.TrimSuffix(fileName, ext)
	for i := 1; ; i++ {
		candidate := filepath.Join(dir, fmt.Sprintf("%s (%d)%s", name, i, ext))
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate
		}
	}
}

// CheckCloudDownloadConflict reports whether downloading the given cloud photo
// into the destination folder of the target library would collide with an
// existing file of the same name, so the renderer can ask how to resolve it.
func (a *App) CheckCloudDownloadConflict(photoID string, destination string, libraryPath string) (bool, error) {
	if a.LocalLibrary == nil {
		return false, errors.New("本地资源库未初始化")
	}
	if a.Photo == nil {
		return false, errors.New("云端服务尚未就绪")
	}
	photo, err := a.Photo.GetByID(photoID)
	if err != nil {
		return false, fmt.Errorf("获取云端照片失败: %w", err)
	}
	if libraryPath != "" {
		if snapshot, snapshotErr := a.LocalLibrary.Snapshot(); snapshotErr != nil || !strings.EqualFold(snapshot.RootPath, libraryPath) {
			if _, openErr := a.LocalLibrary.Open(libraryPath); openErr != nil {
				return false, fmt.Errorf("打开目标资源库失败: %w", openErr)
			}
		}
	}
	return a.LocalLibrary.CheckDownloadConflict(destination, cloudPhotoFileName(photo))
}

// CheckCloudDownloadConflictByFileName checks whether importing a file named
// fileName into the destination folder of the target library would collide
// with an existing file. Unlike CheckCloudDownloadConflict it does not fetch
// the cloud photo again — the renderer already holds the photo metadata from
// the list API and derives the file name itself, so this is a local-only
// (os.Stat) check and avoids a network round-trip.
func (a *App) CheckCloudDownloadConflictByFileName(fileName string, destination string, libraryPath string) (bool, error) {
	if a.LocalLibrary == nil {
		return false, errors.New("本地资源库未初始化")
	}
	if libraryPath != "" {
		if snapshot, snapshotErr := a.LocalLibrary.Snapshot(); snapshotErr != nil || !strings.EqualFold(snapshot.RootPath, libraryPath) {
			if _, openErr := a.LocalLibrary.Open(libraryPath); openErr != nil {
				return false, fmt.Errorf("打开目标资源库失败: %w", openErr)
			}
		}
	}
	return a.LocalLibrary.CheckDownloadConflict(destination, fileName)
}

// DownloadProgress reports the current download phase to the renderer so the
// download queue popup can show real-time progress and transfer speed.
type DownloadProgress struct {
	TaskID     string `json:"taskId"`
	Phase      string `json:"phase"` // "fetching" | "downloading" | "importing" | "completed" | "failed"
	Progress   int    `json:"progress"`
	Error      string `json:"error,omitempty"`
	PhotoID    string `json:"photoId"`
	FileName   string `json:"fileName"`
	FileSize   int64  `json:"fileSize"`
	Downloaded int64  `json:"downloaded,omitempty"`
	Total      int64  `json:"total,omitempty"`
}

func (a *App) emitDownloadProgress(taskID, phase string, progress int, errMsg, photoID, fileName string, fileSize int64) {
	a.emitDownloadProgressBytes(taskID, phase, progress, errMsg, photoID, fileName, fileSize, 0, 0)
}

func (a *App) emitDownloadProgressBytes(taskID, phase string, progress int, errMsg, photoID, fileName string, fileSize, downloaded, total int64) {
	if a.ctx == nil || strings.TrimSpace(taskID) == "" {
		return
	}
	runtime.EventsEmit(a.ctx, "download:progress", DownloadProgress{
		TaskID:     taskID,
		Phase:      phase,
		Progress:   progress,
		Error:      errMsg,
		PhotoID:    photoID,
		FileName:   fileName,
		FileSize:   fileSize,
		Downloaded: downloaded,
		Total:      total,
	})
}

func cloudPhotoTitle(photo *services.PhotoDTO) string {
	if photo == nil {
		return ""
	}
	if photo.Title != "" {
		return photo.Title
	}
	return cloudPhotoFileName(photo)
}

// cloudPhotoFileName derives the original file name from the photo's storage
// path (preferred) or URL. Falls back to the photo title + extension.
func cloudPhotoFileName(photo *services.PhotoDTO) string {
	if photo.Path != nil {
		if name := filepath.Base(*photo.Path); name != "" && name != "." && name != "/" {
			return name
		}
	}
	urlPath := strings.SplitN(photo.URL, "?", 2)[0]
	urlPath = strings.SplitN(urlPath, "#", 2)[0]
	if name := filepath.Base(urlPath); name != "" && name != "." && name != "/" {
		if filepath.Ext(name) != "" {
			return name
		}
	}
	if photo.Title != "" {
		ext := suggestedAiImageExtension(photo.URL)
		return photo.Title + ext
	}
	return "photo" + suggestedAiImageExtension(photo.URL)
}

// downloadFileWithAuth downloads a file from the given URL. If the URL is on the
// proxy's base server, the auth token is attached. The onProgress callback is
// called with bytes read and total bytes (if known) as the download proceeds.
func downloadFileWithAuth(ctx context.Context, imageURL string, filePath string, proxy *services.ProxyClient, taskID string, onProgress func(read int64, total int64)) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, imageURL, nil)
	if err != nil {
		return err
	}
	baseURL := proxy.BaseURL()
	if baseURL != "" && strings.HasPrefix(imageURL, baseURL) {
		if token := proxy.Token(); token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
	}
	resp, err := (&http.Client{Timeout: 5 * time.Minute}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	total := resp.ContentLength
	out, err := os.Create(filePath)
	if err != nil {
		return err
	}
	defer out.Close()
	buf := make([]byte, 32*1024)
	var read int64
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := out.Write(buf[:n]); writeErr != nil {
				return writeErr
			}
			read += int64(n)
			if onProgress != nil {
				onProgress(read, total)
			}
		}
		if readErr != nil {
			if readErr == io.EOF {
				break
			}
			return readErr
		}
	}
	if total > 0 && read > 100*1024*1024 {
		return errors.New("原图超过 100MB 限制")
	}
	return nil
}

// ─── Overview ─────────────────────────────────────────

func (a *App) GetOverview() (*services.OverviewDTO, error) {
	if a.Proxy == nil || !a.Proxy.IsReady() {
		return nil, errors.New("登录状态未就绪，请稍后重试")
	}
	return a.Overview.GetOverview()
}

// ─── Inspiration feeds ──────────────────────────────

func (a *App) ListInspirationSubscriptions() []services.InspirationSubscription {
	if a.Inspiration == nil {
		return []services.InspirationSubscription{}
	}
	return a.Inspiration.ListSubscriptions()
}

func (a *App) SubscribeInspirationFeed(feedURL string) (*services.InspirationSubscription, error) {
	if a.Inspiration == nil {
		return nil, errors.New("灵感订阅服务未初始化")
	}
	return a.Inspiration.Subscribe(feedURL)
}

func (a *App) UnsubscribeInspirationFeed(id string) error {
	if a.Inspiration == nil {
		return errors.New("灵感订阅服务未初始化")
	}
	return a.Inspiration.Unsubscribe(id)
}

func (a *App) RefreshInspirationFeeds() ([]services.InspirationFeedItem, error) {
	if a.Inspiration == nil {
		return nil, errors.New("灵感订阅服务未初始化")
	}
	return a.Inspiration.Refresh()
}

// ─── Logger ──────────────────────────────────────────

func (a *App) GetLogConfig() map[string]interface{} {
	return map[string]interface{}{
		"enabled":     a.cfg.Log.Enabled,
		"max_entries": a.cfg.Log.MaxEntries,
	}
}

func (a *App) UpdateLogConfig(data map[string]interface{}) error {
	if v, ok := data["enabled"].(bool); ok {
		a.cfg.Log.Enabled = v
		a.Logger.SetEnabled(v)
	}
	if v, ok := data["max_entries"].(float64); ok {
		a.cfg.Log.MaxEntries = int(v)
		a.Logger.SetMaxEntries(int(v))
	}
	return a.cfg.Save("")
}

func (a *App) GetLogs(category string, level string, limit int) []services.LogEntry {
	return a.Logger.GetLogs(category, level, limit)
}

func (a *App) ClearLogs() {
	a.Logger.ClearLogs()
}

func (a *App) GetLogStats() map[string]interface{} {
	return a.Logger.GetLogStats()
}

func (a *App) GetLogDir() string {
	return a.Logger.GetLogDir()
}

func (a *App) OpenLogDir() {
	dir := a.Logger.GetLogDir()
	switch runtime.Environment(a.ctx).Platform {
	case "windows":
		exec.Command("explorer", dir).Start()
	case "darwin":
		exec.Command("open", dir).Start()
	default:
		exec.Command("xdg-open", dir).Start()
	}
}
