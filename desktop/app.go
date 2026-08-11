package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	agent_extensions "mo-gallery-desktop/agent_extensions"
	"mo-gallery-desktop/config"
	"mo-gallery-desktop/db"
	"mo-gallery-desktop/image"
	local_library "mo-gallery-desktop/local_library"
	"mo-gallery-desktop/services"
	"mo-gallery-desktop/types"
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
	Logger              *services.Logger
	ZineOperationLogger *services.ZineOperationLogger
	Overview            *services.OverviewService
	LocalLibrary        *local_library.Manager
	AgentExtensions     *agent_extensions.Manager
}

func NewApp(cfg *config.Config) *App {
	app := &App{
		cfg:                 cfg,
		activeWindowStyle:   config.NormalizeWindowStyle(cfg.UI.WindowStyle),
		Proxy:               services.NewProxyClient(),
		Logger:              services.NewLogger(cfg.Log.Enabled, cfg.Log.MaxEntries),
		ZineOperationLogger: services.NewZineOperationLogger(config.ConfigDir()),
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
	a.Storage = services.NewStorageService(a.Proxy)
	a.Settings = services.NewSettingsService(a.Proxy)
	a.EditorAi = services.NewEditorAiService(a.cfg, a.Upload)
	a.EditorAi.SetLogger(a.Logger)
	a.Overview = services.NewOverviewService()
	var extensionErr error
	a.AgentExtensions, extensionErr = agent_extensions.NewManager(config.ConfigDir())
	if extensionErr != nil {
		a.Logger.Error(services.LogCategorySystem, "agent_extensions_init_failed", "Agent 扩展初始化失败", extensionErr.Error())
	}

	// 加载日志
	a.Logger.Load()

	// 启动本地 AI 流式 HTTP 服务
	a.startAiHTTPServer()

	a.Logger.Info(services.LogCategorySystem, "app_start", "应用启动", "")
}

// setAiCORSHeaders allows the Wails WebView to call the local AI HTTP server.
// Pi AI uses the OpenAI JS SDK, which adds X-Stainless-* headers. The CORS
// preflight must allow those requested headers or WebView reports Connection error.
func setAiCORSHeaders(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")

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
	if a.AgentExtensions != nil {
		a.AgentExtensions.StopAll()
	}
	if a.LocalLibrary != nil {
		_ = a.LocalLibrary.Close()
	}
	db.Close()
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

// ─── Auth ────────────────────────────────────────────

func (a *App) Login(serverURL, username, password, jwtSecret string, rememberLogin bool) (*services.LoginResult, error) {
	result, err := a.Auth.Login(serverURL, username, password, jwtSecret, rememberLogin)
	if err != nil {
		a.Logger.Error(services.LogCategoryAuth, "login_failed", "登录失败", err.Error())
		return nil, err
	}
	a.Proxy.SetServer(result.Server)
	a.Proxy.SetToken(result.Token)
	a.setAuthenticatedUser(result.User.ID)
	a.Logger.Info(services.LogCategoryAuth, "login_success", "登录成功", "用户: "+username+", 服务器: "+serverURL)
	return result, nil
}

func (a *App) SetAuth(serverURL, token string) (*services.UserInfo, error) {
	user, err := a.Auth.ValidateToken(token)
	if err != nil {
		a.Proxy.SetToken("")
		a.setAuthenticatedUser("")
		a.Logger.Warn(services.LogCategoryAuth, "restore_auth_failed", "恢复登录态失败", err.Error())
		return nil, err
	}

	a.Proxy.SetServer(serverURL)
	a.Proxy.SetToken(token)
	a.setAuthenticatedUser(user.ID)
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

func (a *App) ValidateToken(token string) (*services.UserInfo, error) {
	return a.Auth.ValidateToken(token)
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
		"jwt_secret":     a.cfg.API.JWTSecret,
		"remember_login": a.cfg.API.RememberLogin,
		"saved_username": a.cfg.API.SavedUsername,
		"saved_password": decryptedPassword,
	}
}

// GetSetupState returns the persisted first-run setup state and safe-to-edit
// connection fields. Passwords are intentionally omitted from this response.
func (a *App) GetSetupState() map[string]interface{} {
	return map[string]interface{}{
		"completed": a.cfg.UI.SetupCompleted,
		"database": map[string]interface{}{
			"host":                a.cfg.Database.Host,
			"port":                a.cfg.Database.Port,
			"user":                a.cfg.Database.User,
			"password_configured": a.cfg.Database.Password != "",
			"dbname":              a.cfg.Database.DBName,
			"sslmode":             a.cfg.Database.SSLMode,
		},
		"api": map[string]interface{}{
			"base_url":            a.cfg.API.BaseURL,
			"login_url":           a.cfg.API.LoginURL,
			"jwt_secret":          "",
			"jwt_configured":      a.cfg.API.JWTSecret != "",
			"password_configured": a.cfg.API.SavedPassword != "",
			"remember_login":      a.cfg.API.RememberLogin,
			"saved_username":      a.cfg.API.SavedUsername,
		},
	}
}

// TestDatabaseConnection verifies setup values without changing the active
// database connection or persisting the submitted configuration.
func (a *App) TestDatabaseConnection(data map[string]interface{}) error {
	databaseConfig := a.cfg.Database
	if value, ok := data["host"].(string); ok {
		databaseConfig.Host = strings.TrimSpace(value)
	}
	if value, ok := data["port"].(float64); ok {
		databaseConfig.Port = int(value)
	}
	if value, ok := data["user"].(string); ok {
		databaseConfig.User = strings.TrimSpace(value)
	}
	if value, ok := data["password"].(string); ok && value != "" {
		databaseConfig.Password = value
	}
	if value, ok := data["dbname"].(string); ok {
		databaseConfig.DBName = strings.TrimSpace(value)
	}
	if value, ok := data["sslmode"].(string); ok {
		databaseConfig.SSLMode = strings.TrimSpace(value)
	}

	if databaseConfig.Host == "" || databaseConfig.User == "" || databaseConfig.DBName == "" {
		return errors.New("请完整填写数据库主机、用户名和数据库名")
	}
	if databaseConfig.Port <= 0 || databaseConfig.Port > 65535 {
		return errors.New("数据库端口必须在 1 到 65535 之间")
	}
	if databaseConfig.SSLMode == "" {
		databaseConfig.SSLMode = "disable"
	}
	if err := db.TestConnection(databaseConfig.DSN()); err != nil {
		return fmt.Errorf("数据库连接验证失败: %w", err)
	}
	return nil
}

// CompleteSetup persists the first-run database and optional cloud login
// settings. The payload is a map to keep the Wails bridge backwards-compatible
// with generated bindings while allowing older config files to be upgraded.
func (a *App) CompleteSetup(data map[string]interface{}) error {
	database, _ := data["database"].(map[string]interface{})
	api, _ := data["api"].(map[string]interface{})
	offlineOnly, _ := data["offline_only"].(bool)

	if value, ok := database["host"].(string); ok {
		a.cfg.Database.Host = strings.TrimSpace(value)
	}
	if value, ok := database["port"].(float64); ok && value > 0 {
		a.cfg.Database.Port = int(value)
	}
	if value, ok := database["user"].(string); ok {
		a.cfg.Database.User = strings.TrimSpace(value)
	}
	if value, ok := database["password"].(string); ok && value != "" {
		a.cfg.Database.Password = value
	}
	if value, ok := database["dbname"].(string); ok {
		a.cfg.Database.DBName = strings.TrimSpace(value)
	}
	if value, ok := database["sslmode"].(string); ok {
		a.cfg.Database.SSLMode = strings.TrimSpace(value)
	}

	if value, ok := api["base_url"].(string); ok {
		a.cfg.API.BaseURL = strings.TrimRight(strings.TrimSpace(value), "/")
	}
	if value, ok := api["login_url"].(string); ok {
		a.cfg.API.LoginURL = strings.TrimRight(strings.TrimSpace(value), "/")
	}
	if value, ok := api["jwt_secret"].(string); ok && strings.TrimSpace(value) != "" {
		a.cfg.API.JWTSecret = strings.TrimSpace(value)
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
	if !offlineOnly && a.cfg.Database.DSN() != "" {
		db.Close()
		if err := db.Connect(a.cfg.Database.DSN()); err != nil && a.Logger != nil {
			a.Logger.Warn(services.LogCategorySystem, "setup_database_unavailable", "数据库暂时不可用，继续使用离线功能", err.Error())
		}
	}
	return nil
}

// ─── Photos ──────────────────────────────────────────

func (a *App) GetPhotos(params services.ListPhotosParams) (*services.PaginatedResponse[services.PhotoDTO], error) {
	return a.Photo.List(params)
}
func (a *App) GetPhoto(id string) (*services.PhotoDTO, error) {
	return a.Photo.GetByID(id)
}
func (a *App) UpdatePhoto(id string, params services.UpdatePhotoParams) (*services.PhotoDTO, error) {
	return a.Photo.Update(id, params)
}
func (a *App) DeletePhoto(id string, params services.DeletePhotoParams) error {
	err := a.Photo.Delete(id, params)
	if err != nil {
		a.Logger.Error(services.LogCategoryPhoto, "delete_photo_failed", "删除照片失败", "ID: "+id+", 错误: "+err.Error())
	} else {
		a.Logger.Info(services.LogCategoryPhoto, "delete_photo", "删除照片", "ID: "+id)
	}
	return err
}
func (a *App) ToggleFeatured(id string) (*services.PhotoDTO, error) {
	return a.Photo.ToggleFeatured(id)
}
func (a *App) ToggleShowFlag(id string) (*services.PhotoDTO, error) {
	return a.Photo.ToggleShowFlag(id)
}
func (a *App) BatchDeletePhotos(params services.BatchDeleteParams) (*services.BatchResult, error) {
	return a.Photo.BatchDelete(params)
}
func (a *App) BatchUpdateShowFlag(photoIDs []string, showFlag bool) (*services.BatchResult, error) {
	return a.Photo.BatchUpdateShowFlag(photoIDs, showFlag)
}
func (a *App) GetAllPhotos() ([]services.PhotoDTO, error) {
	return a.Photo.ListAll()
}
func (a *App) GetCategories() ([]string, error) {
	return a.Photo.GetCategories()
}
func (a *App) GetCameras() ([]services.CameraDTO, error) {
	return a.Photo.GetCameras()
}
func (a *App) GetLenses() ([]services.LensDTO, error) {
	return a.Photo.GetLenses()
}

// ─── Albums ──────────────────────────────────────────

func (a *App) GetAlbums() ([]services.AlbumDTO, error)        { return a.Album.List() }
func (a *App) GetAlbum(id string) (*services.AlbumDTO, error) { return a.Album.GetByID(id) }
func (a *App) CreateAlbum(params services.CreateAlbumParams) (*services.AlbumDTO, error) {
	return a.Album.Create(params)
}
func (a *App) UpdateAlbum(id string, params services.UpdateAlbumParams) (*services.AlbumDTO, error) {
	return a.Album.Update(id, params)
}
func (a *App) DeleteAlbum(id string) error { return a.Album.Delete(id) }
func (a *App) AddPhotosToAlbum(id string, photoIDs []string) (*services.AlbumDTO, error) {
	return a.Album.AddPhotos(id, photoIDs)
}
func (a *App) RemovePhotoFromAlbum(albumID, photoID string) (*services.AlbumDTO, error) {
	return a.Album.RemovePhoto(albumID, photoID)
}
func (a *App) SetAlbumCover(albumID, photoID string) (*services.AlbumDTO, error) {
	return a.Album.SetCover(albumID, photoID)
}

// ─── Stories ─────────────────────────────────────────

func (a *App) GetStories() ([]services.StoryDTO, error)       { return a.Story.List() }
func (a *App) GetStory(id string) (*services.StoryDTO, error) { return a.Story.GetByID(id) }
func (a *App) CreateStory(params services.CreateStoryParams) (*services.StoryDTO, error) {
	result, err := a.Story.Create(params)
	if err != nil {
		a.Logger.Error(services.LogCategoryStory, "create_story_failed", "创建叙事失败", err.Error())
	} else {
		a.Logger.Info(services.LogCategoryStory, "create_story", "创建叙事: "+params.Title, "")
	}
	return result, err
}
func (a *App) UpdateStory(id string, params services.UpdateStoryParams) (*services.StoryDTO, error) {
	result, err := a.Story.Update(id, params)
	if err != nil {
		a.Logger.Error(services.LogCategoryStory, "update_story_failed", "更新叙事失败", "ID: "+id+", 错误: "+err.Error())
	} else {
		a.Logger.Info(services.LogCategoryStory, "update_story", "更新叙事", "ID: "+id)
	}
	return result, err
}
func (a *App) DeleteStory(id string) error {
	err := a.Story.Delete(id)
	if err != nil {
		a.Logger.Error(services.LogCategoryStory, "delete_story_failed", "删除叙事失败", "ID: "+id+", 错误: "+err.Error())
	} else {
		a.Logger.Info(services.LogCategoryStory, "delete_story", "删除叙事", "ID: "+id)
	}
	return err
}
func (a *App) AddStoryPhoto(storyID, photoID string) error {
	return a.Story.AddStoryPhoto(storyID, photoID)
}
func (a *App) RemoveStoryPhoto(storyID, photoID string) error {
	return a.Story.RemoveStoryPhoto(storyID, photoID)
}
func (a *App) ReorderStoryPhotos(storyID string, photoIDs []string) (*services.StoryDTO, error) {
	return a.Story.ReorderPhotos(storyID, photoIDs)
}

// ─── Blogs ───────────────────────────────────────────

func (a *App) GetBlogs() ([]services.BlogDTO, error)        { return a.Blog.List() }
func (a *App) GetBlog(id string) (*services.BlogDTO, error) { return a.Blog.GetByID(id) }
func (a *App) CreateBlog(params services.CreateBlogParams) (*services.BlogDTO, error) {
	result, err := a.Blog.Create(params)
	if err != nil {
		a.Logger.Error(services.LogCategoryBlog, "create_blog_failed", "创建博客失败", err.Error())
	} else {
		a.Logger.Info(services.LogCategoryBlog, "create_blog", "创建博客: "+params.Title, "")
	}
	return result, err
}
func (a *App) UpdateBlog(id string, params services.UpdateBlogParams) (*services.BlogDTO, error) {
	result, err := a.Blog.Update(id, params)
	if err != nil {
		a.Logger.Error(services.LogCategoryBlog, "update_blog_failed", "更新博客失败", "ID: "+id+", 错误: "+err.Error())
	} else {
		a.Logger.Info(services.LogCategoryBlog, "update_blog", "更新博客", "ID: "+id)
	}
	return result, err
}
func (a *App) DeleteBlog(id string) error {
	err := a.Blog.Delete(id)
	if err != nil {
		a.Logger.Error(services.LogCategoryBlog, "delete_blog_failed", "删除博客失败", "ID: "+id+", 错误: "+err.Error())
	} else {
		a.Logger.Info(services.LogCategoryBlog, "delete_blog", "删除博客", "ID: "+id)
	}
	return err
}

// ─── Film Rolls ──────────────────────────────────────

func (a *App) GetFilmRolls() ([]services.FilmRollDTO, error)        { return a.FilmRoll.List() }
func (a *App) GetFilmRoll(id string) (*services.FilmRollDTO, error) { return a.FilmRoll.GetByID(id) }
func (a *App) CreateFilmRoll(params services.CreateFilmRollParams) (*services.FilmRollDTO, error) {
	return a.FilmRoll.Create(params)
}
func (a *App) UpdateFilmRoll(id string, params services.UpdateFilmRollParams) (*services.FilmRollDTO, error) {
	return a.FilmRoll.Update(id, params)
}
func (a *App) DeleteFilmRoll(id string) error { return a.FilmRoll.Delete(id) }
func (a *App) AddPhotosToFilmRoll(id string, photoIDs []string) (*services.FilmRollDTO, error) {
	return a.FilmRoll.AddPhotos(id, photoIDs)
}
func (a *App) RemovePhotoFromFilmRoll(rollID, photoID string) (*services.FilmRollDTO, error) {
	return a.FilmRoll.RemovePhoto(rollID, photoID)
}
func (a *App) ReorderFilmRollFrames(id string) (*services.FilmRollDTO, error) {
	return a.FilmRoll.ReorderFrames(id)
}
func (a *App) SetFilmRollFrameOrder(id string, filmPhotoIDs []string) (*services.FilmRollDTO, error) {
	return a.FilmRoll.SetFrameOrder(id, filmPhotoIDs)
}

// ─── Friends ─────────────────────────────────────────

func (a *App) GetFriends() ([]services.FriendDTO, error) { return a.Friend.List() }
func (a *App) CreateFriend(params services.CreateFriendParams) (*services.FriendDTO, error) {
	return a.Friend.Create(params)
}
func (a *App) UpdateFriend(id string, params services.UpdateFriendParams) (*services.FriendDTO, error) {
	return a.Friend.Update(id, params)
}
func (a *App) DeleteFriend(id string) error { return a.Friend.Delete(id) }

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

func (a *App) setLocalAssetCloudLink(id, photoID, cloudURL string) error {
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		err = a.LocalLibrary.SetAssetCloudLink(local_library.AssetID(id), photoID, cloudURL)
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
		if linkErr := a.setLocalAssetCloudLink(id, result.Photo.ID, result.Photo.URL); linkErr != nil {
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
		if linkErr := a.setLocalAssetCloudLink(id, existingPhoto.ID, existingPhoto.URL); linkErr != nil {
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

func (a *App) GetSettings() (map[string]string, error) { return a.Settings.GetSettings() }
func (a *App) UpdateSettings(data map[string]string) (map[string]string, error) {
	return a.Settings.UpdateSettings(data)
}
func (a *App) GetStorageSources() ([]types.StorageSourceDTO, error) {
	return a.Settings.GetStorageSources()
}
func (a *App) CreateStorageSource(data map[string]string) (*types.StorageSourceDTO, error) {
	return a.Settings.CreateStorageSource(data)
}
func (a *App) UpdateStorageSource(id string, data map[string]string) (*types.StorageSourceDTO, error) {
	return a.Settings.UpdateStorageSource(id, data)
}
func (a *App) DeleteStorageSource(id string) error { return a.Settings.DeleteStorageSource(id) }

// ─── Storage Scan/Cleanup ─────────────────────────────

func (a *App) ScanStorage(params services.StorageScanParams) (*services.StorageScanResult, error) {
	return a.Storage.Scan(params)
}
func (a *App) CleanupStorage(keys []string, provider string) (*services.StorageCleanupResult, error) {
	return a.Storage.Cleanup(keys, provider)
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

func (a *App) GetEditorAiConversations(scopeId string) ([]services.EditorAiConversationDTO, error) {
	userID, err := a.requireAuthenticatedUserID()
	if err != nil {
		return nil, err
	}
	return a.EditorAi.ListConversations(userID, scopeId)
}
func (a *App) GetEditorAiConversationPage(scopeId string, offset int, limit int) (*services.EditorAiConversationPageDTO, error) {
	userID, err := a.requireAuthenticatedUserID()
	if err != nil {
		return nil, err
	}
	return a.EditorAi.ListConversationPage(userID, scopeId, offset, limit)
}
func (a *App) CreateEditorAiConversation(input services.EditorAiConversationCreateInput) (*services.EditorAiConversationDTO, error) {
	userID, err := a.requireAuthenticatedUserID()
	if err != nil {
		return nil, err
	}
	return a.EditorAi.CreateConversation(userID, input)
}
func (a *App) GetEditorAiConversation(conversationId string) (*services.EditorAiConversationWithMessagesDTO, error) {
	userID, err := a.requireAuthenticatedUserID()
	if err != nil {
		return nil, err
	}
	return a.EditorAi.GetConversation(userID, conversationId)
}
func (a *App) GetEditorAiConversationMessagesPage(conversationId string, beforeCreatedAt string, beforeId string, limit int) (*services.EditorAiConversationWithMessagesDTO, error) {
	userID, err := a.requireAuthenticatedUserID()
	if err != nil {
		return nil, err
	}
	return a.EditorAi.GetConversationPage(userID, conversationId, beforeCreatedAt, beforeId, limit)
}
func (a *App) UpdateEditorAiConversation(conversationId string, input services.EditorAiConversationUpdateInput) (*services.EditorAiConversationDTO, error) {
	userID, err := a.requireAuthenticatedUserID()
	if err != nil {
		return nil, err
	}
	return a.EditorAi.UpdateConversation(userID, conversationId, input)
}
func (a *App) DeleteEditorAiConversation(conversationId string) error {
	userID, err := a.requireAuthenticatedUserID()
	if err != nil {
		return err
	}
	return a.EditorAi.DeleteConversation(userID, conversationId)
}
func (a *App) ClearEditorAiConversation(conversationId string) (*services.EditorAiConversationDTO, error) {
	userID, err := a.requireAuthenticatedUserID()
	if err != nil {
		return nil, err
	}
	return a.EditorAi.ClearConversation(userID, conversationId)
}
func (a *App) AppendEditorAiMessage(input services.EditorAiMessageAppendInput) (*services.EditorAiMessageDTO, error) {
	userID, err := a.requireAuthenticatedUserID()
	if err != nil {
		return nil, err
	}
	return a.EditorAi.AppendMessage(userID, input)
}
func (a *App) FinishEditorAiMessage(input services.EditorAiMessageFinishInput) (*services.EditorAiMessageDTO, error) {
	userID, err := a.requireAuthenticatedUserID()
	if err != nil {
		return nil, err
	}
	return a.EditorAi.FinishMessage(userID, input)
}
func (a *App) UpdateEditorAiTaskState(input services.EditorAiTaskStateUpdateInput) (*services.EditorAiMessageDTO, error) {
	userID, err := a.requireAuthenticatedUserID()
	if err != nil {
		return nil, err
	}
	return a.EditorAi.UpdateTaskState(userID, input)
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

// ─── Zine ─────────────────────────────────────────────

// GetZineCJKFontInfo 返回 PDF 导出可用的系统中文字体（字体文件本身由
// AssetServer 的 /__zine/cjk-font 路由提供）
func (a *App) GetZineCJKFontInfo() services.ZineCJKFontInfo {
	return services.ResolveZineCJKFont()
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

// ─── Overview ─────────────────────────────────────────

func (a *App) GetOverview() (*services.OverviewDTO, error) {
	if a.Proxy == nil || !a.Proxy.IsReady() {
		return nil, errors.New("登录状态未就绪，请稍后重试")
	}
	return a.Overview.GetOverview()
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

// ─── Local Library ───────────────────────────────────

func (a *App) GetLocalLibraryEntryState() (map[string]interface{}, error) {
	if a.LocalLibrary == nil {
		return map[string]interface{}{"active": false, "recent": []local_library.RecentLibrary{}}, nil
	}
	recent, err := a.LocalLibrary.RecentLibraries()
	if err != nil {
		return nil, err
	}
	state := map[string]interface{}{"active": false, "recent": recent}
	if snapshot, snapshotErr := a.LocalLibrary.Snapshot(); snapshotErr == nil {
		state["active"] = true
		state["snapshot"] = snapshot
	} else if snapshot, restored, restoreErr := a.LocalLibrary.RestoreLastLibrary(); restoreErr != nil {
		return nil, restoreErr
	} else if restored {
		state["active"] = true
		state["snapshot"] = snapshot
	}
	return state, nil
}

func (a *App) SelectLocalLibraryFolder(title string) (string, error) {
	if strings.TrimSpace(title) == "" {
		title = "选择资源库文件夹"
	}
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: title})
}

func (a *App) SelectLocalLibraryImportFiles() ([]string, error) {
	files, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择要移入资源库的文件",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "照片资源 (*.jpg;*.jpeg;*.png;*.webp;*.gif;*.avif;*.heic;*.heif;*.tif;*.tiff;*.cr2;*.cr3;*.nef;*.arw;*.dng;*.raf;*.rw2)",
				Pattern:     "*.jpg;*.jpeg;*.png;*.webp;*.gif;*.avif;*.heic;*.heif;*.tif;*.tiff;*.cr2;*.cr3;*.nef;*.arw;*.dng;*.raf;*.rw2",
			},
			{DisplayName: "所有文件 (*.*)", Pattern: "*.*"},
		},
	})
	if files == nil {
		return []string{}, err
	}
	return files, err
}

func (a *App) CreateLocalLibrary(root, name string) (local_library.LibrarySnapshot, error) {
	return a.LocalLibrary.Create(root, name, false)
}

func (a *App) InitializeLocalLibrary(root, name string) (local_library.LibrarySnapshot, error) {
	return a.LocalLibrary.Create(root, name, true)
}

func (a *App) OpenLocalLibrary(root string) (local_library.LibrarySnapshot, error) {
	return a.LocalLibrary.Open(root)
}

func (a *App) CloseLocalLibrary() error                   { return a.LocalLibrary.CloseManually() }
func (a *App) RemoveRecentLocalLibrary(root string) error { return a.LocalLibrary.RemoveRecent(root) }
func (a *App) GetLocalLibrarySnapshot() (local_library.LibrarySnapshot, error) {
	return a.LocalLibrary.Snapshot()
}
func (a *App) ListLocalAssets(query local_library.AssetQuery) (local_library.AssetPage, error) {
	return a.LocalLibrary.ListAssets(query)
}
func (a *App) CreateLocalAssetQueryToken(query local_library.AssetQuery) (local_library.AssetQueryToken, error) {
	return a.LocalLibrary.CreateAssetQueryToken(query)
}
func (a *App) BatchUpdateLocalAssetOrganizationByQuery(token string, update local_library.BatchAssetOrganizationUpdate) error {
	return a.LocalLibrary.BatchUpdateAssetOrganizationByQuery(token, update)
}
func (a *App) ListLocalFolders() ([]local_library.FolderDTO, error) {
	return a.LocalLibrary.ListFolders()
}
func (a *App) ListLocalLibraryTags() ([]local_library.TagDTO, error) {
	return a.LocalLibrary.ListTags()
}
func (a *App) CreateLocalLibraryTag(name, color string) (local_library.TagDTO, error) {
	return a.LocalLibrary.CreateTag(name, color)
}
func (a *App) UpdateLocalLibraryTag(id, name, color string) (local_library.TagDTO, error) {
	return a.LocalLibrary.UpdateTag(id, name, color)
}
func (a *App) DeleteLocalLibraryTag(id string) error {
	return a.LocalLibrary.DeleteTag(id)
}
func (a *App) SetLocalAssetTags(id string, tagIDs []string) error {
	return a.LocalLibrary.SetAssetTags(local_library.AssetID(id), tagIDs)
}
func (a *App) BatchUpdateLocalAssetOrganization(update local_library.BatchAssetOrganizationUpdate) error {
	return a.LocalLibrary.BatchUpdateAssetOrganization(update)
}

func (a *App) ListLocalLibraryCollectionGroups() ([]local_library.CollectionGroupDTO, error) {
	return a.LocalLibrary.ListCollectionGroups()
}
func (a *App) UpdateLocalLibraryCollectionGroup(id string, parentID *string, name string, position int) (local_library.CollectionGroupDTO, error) {
	return a.LocalLibrary.UpdateCollectionGroup(id, parentID, name, position)
}
func (a *App) DeleteLocalLibraryCollectionGroup(id string, deleteContents bool) error {
	return a.LocalLibrary.DeleteCollectionGroup(id, deleteContents)
}
func (a *App) ListLocalLibraryCollections() ([]local_library.CollectionDTO, error) {
	return a.LocalLibrary.ListCollections()
}
func (a *App) CreateLocalLibraryCollection(groupID *string, name, notes string) (local_library.CollectionDTO, error) {
	return a.LocalLibrary.CreateCollection(groupID, name, notes)
}
func (a *App) UpdateLocalLibraryCollection(id string, groupID *string, name, notes string, position int) (local_library.CollectionDTO, error) {
	return a.LocalLibrary.UpdateCollection(id, groupID, name, notes, position)
}
func (a *App) DeleteLocalLibraryCollection(id string) error {
	return a.LocalLibrary.DeleteCollection(id)
}
func (a *App) SetLocalAssetCollections(id string, collectionIDs []string) error {
	return a.LocalLibrary.SetAssetCollections(local_library.AssetID(id), collectionIDs)
}
func (a *App) CreateLocalLibraryFolder(parentRelative, name string) (local_library.FolderDTO, error) {
	return a.LocalLibrary.CreateFolder(parentRelative, name)
}
func (a *App) MoveLocalLibraryFolder(relative, destinationParent, topLevelName string) (local_library.FolderDTO, error) {
	return a.LocalLibrary.MoveFolder(relative, destinationParent, topLevelName)
}
func (a *App) PlanLocalLibraryFolderMove(relative, destinationParent, topLevelName, conflictPolicy string) (local_library.FolderFileOperationPlan, error) {
	return a.LocalLibrary.PlanFolderMove(relative, destinationParent, topLevelName, conflictPolicy)
}
func (a *App) ExecuteLocalLibraryFolderMovePlan(planID string) (local_library.FolderFileOperationExecution, error) {
	return a.LocalLibrary.ExecuteFolderMovePlan(planID)
}
func (a *App) GetLocalLibraryFolderProperties(relative string) (local_library.FolderProperties, error) {
	return a.LocalLibrary.GetFolderProperties(relative)
}
func (a *App) PreviewLocalLibraryFolderDeletion(relative string) (local_library.FolderDeletionPreview, error) {
	return a.LocalLibrary.PreviewFolderDeletion(relative)
}
func (a *App) DeleteLocalLibraryFolder(relative string) error {
	return a.LocalLibrary.DeleteFolder(relative)
}
func (a *App) PermanentDeleteActiveLocalLibraryFolder(relative string) error {
	return a.LocalLibrary.PermanentDeleteActiveFolder(relative)
}
func (a *App) ListLocalLibraryTrashedFolders() ([]local_library.FolderTrashEntry, error) {
	return a.LocalLibrary.ListTrashedFolders()
}
func (a *App) RestoreLocalLibraryFolder(trashID, destinationParent, topLevelName string) error {
	return a.LocalLibrary.RestoreFolder(trashID, destinationParent, topLevelName)
}
func (a *App) PermanentDeleteLocalLibraryFolder(trashID string) error {
	return a.LocalLibrary.PermanentDeleteFolder(trashID)
}
func (a *App) StartLocalLibraryScan() error  { return a.LocalLibrary.StartScan() }
func (a *App) PauseLocalLibraryScan() error  { return a.LocalLibrary.PauseScan() }
func (a *App) ResumeLocalLibraryScan() error { return a.LocalLibrary.ResumeScan() }
func (a *App) CancelLocalLibraryScan() error { return a.LocalLibrary.CancelScan() }
func (a *App) ClearLocalLibraryPreviewCache() error {
	return a.LocalLibrary.ClearPreviewCache()
}
func (a *App) GetLocalLibraryCacheStats() (local_library.LocalLibraryCacheStats, error) {
	return a.LocalLibrary.CacheStats()
}
func (a *App) GetLocalLibraryBackups() (local_library.BackupOverview, error) {
	return a.LocalLibrary.BackupOverview()
}
func (a *App) CreateLocalLibraryBackup() (local_library.BackupInfo, error) {
	return a.LocalLibrary.CreateManualBackup()
}
func (a *App) RestoreLocalLibraryBackup(id string) (local_library.LibrarySnapshot, error) {
	return a.LocalLibrary.RestoreBackup(id)
}
func (a *App) GetLocalLibraryPreferences() (local_library.LocalLibraryPreferences, error) {
	return a.LocalLibrary.ImportPreferences()
}

func (a *App) SetLocalLibraryImportMode(mode string) (local_library.LocalLibraryPreferences, error) {
	return a.LocalLibrary.SetImportMode(local_library.ImportMode(mode))
}

func (a *App) ImportLocalLibraryFiles(paths []string, destination string) ([]local_library.ImportResult, error) {
	return a.LocalLibrary.ImportFiles(paths, destination)
}
func (a *App) UpdateLocalAsset(id, title, notes string, rating int, color string, favorite bool) error {
	return a.LocalLibrary.UpdateAsset(local_library.AssetID(id), title, notes, rating, color, favorite)
}
func (a *App) SetLocalAssetCloudLink(id, photoID, cloudURL string) error {
	return a.LocalLibrary.SetAssetCloudLink(local_library.AssetID(id), photoID, cloudURL)
}
func (a *App) ClearLocalAssetCloudLink(id string) error {
	return a.LocalLibrary.ClearAssetCloudLink(local_library.AssetID(id))
}
func (a *App) DeleteLocalAssetCloud(id string, force bool) error {
	photoID, _, err := a.LocalLibrary.AssetCloudLink(local_library.AssetID(id))
	if err != nil {
		return err
	}
	if photoID == "" {
		return a.LocalLibrary.ClearAssetCloudLink(local_library.AssetID(id))
	}
	if a.Photo == nil {
		return errors.New("云端服务尚未就绪")
	}
	if err := a.Photo.Delete(photoID, services.DeletePhotoParams{DeleteOriginal: true, DeleteThumbnail: true, Force: force}); err != nil {
		return err
	}
	return a.LocalLibrary.ClearAssetCloudLink(local_library.AssetID(id))
}
func (a *App) DeleteLocalAssetCloudAndLocal(id string, force bool) error {
	if err := a.DeleteLocalAssetCloud(id, force); err != nil {
		return err
	}
	results, err := a.LocalLibrary.PermanentDeleteAssets([]local_library.AssetID{local_library.AssetID(id)})
	if err != nil {
		return err
	}
	if len(results) == 0 {
		return errors.New("本地照片删除未返回结果")
	}
	if results[0].Status != "deleted" {
		if results[0].Error != "" {
			return errors.New(results[0].Error)
		}
		return errors.New("本地照片删除失败")
	}
	return nil
}
func (a *App) RenameLocalAsset(id, fileName string) (local_library.AssetMoveResult, error) {
	return a.LocalLibrary.RenameAsset(local_library.AssetID(id), fileName)
}
func (a *App) MoveLocalAssets(ids []string, destinationFolder string) ([]local_library.AssetMoveResult, error) {
	assetIDs := make([]local_library.AssetID, len(ids))
	for index, id := range ids {
		assetIDs[index] = local_library.AssetID(id)
	}
	return a.LocalLibrary.MoveAssets(assetIDs, destinationFolder)
}
func (a *App) PlanLocalAssetMove(ids []string, destinationFolder, conflictPolicy string) (local_library.AssetFileOperationPlan, error) {
	assetIDs := make([]local_library.AssetID, len(ids))
	for index, id := range ids {
		assetIDs[index] = local_library.AssetID(id)
	}
	return a.LocalLibrary.PlanAssetMove(assetIDs, destinationFolder, conflictPolicy)
}
func (a *App) ExecuteLocalAssetMovePlan(planID string) (local_library.AssetFileOperationExecution, error) {
	return a.LocalLibrary.ExecuteAssetMovePlan(planID)
}
func (a *App) TrashLocalAssets(ids []string) ([]local_library.TrashResult, error) {
	assetIDs := make([]local_library.AssetID, len(ids))
	for index, id := range ids {
		assetIDs[index] = local_library.AssetID(id)
	}
	return a.LocalLibrary.TrashAssets(assetIDs)
}
func (a *App) PermanentDeleteLocalAssets(ids []string) ([]local_library.TrashResult, error) {
	assetIDs := make([]local_library.AssetID, len(ids))
	for index, id := range ids {
		assetIDs[index] = local_library.AssetID(id)
	}
	return a.LocalLibrary.PermanentDeleteAssets(assetIDs)
}
func (a *App) RestoreLocalAsset(id string) error {
	return a.LocalLibrary.RestoreAsset(local_library.AssetID(id))
}

func (a *App) GetLocalAssetOriginalPaths(ids []string) ([]string, error) {
	assetIDs := make([]local_library.AssetID, len(ids))
	for index, id := range ids {
		assetIDs[index] = local_library.AssetID(id)
	}
	return a.LocalLibrary.OriginalPaths(assetIDs)
}

func (a *App) CopyLocalAssetsToClipboard(ids []string, cut bool) error {
	assetIDs := make([]local_library.AssetID, len(ids))
	for index, id := range ids {
		assetIDs[index] = local_library.AssetID(id)
	}
	return a.LocalLibrary.CopyAssetsToClipboard(assetIDs, cut)
}

func (a *App) RecheckMissingLocalAssets(ids []string) ([]local_library.AssetMaintenanceResult, error) {
	assetIDs := make([]local_library.AssetID, len(ids))
	for index, id := range ids {
		assetIDs[index] = local_library.AssetID(id)
	}
	return a.LocalLibrary.RecheckMissingAssets(assetIDs)
}

func (a *App) RetryLocalAssetPreviews(ids []string) ([]local_library.AssetMaintenanceResult, error) {
	assetIDs := make([]local_library.AssetID, len(ids))
	for index, id := range ids {
		assetIDs[index] = local_library.AssetID(id)
	}
	return a.LocalLibrary.RetryAssetPreviews(assetIDs)
}

func (a *App) RemoveMissingLocalAssets(ids []string) ([]local_library.AssetMaintenanceResult, error) {
	assetIDs := make([]local_library.AssetID, len(ids))
	for index, id := range ids {
		assetIDs[index] = local_library.AssetID(id)
	}
	return a.LocalLibrary.RemoveMissingAssets(assetIDs)
}

func (a *App) OpenLocalAssetInDefaultApp(id string) error {
	path, err := a.LocalLibrary.OriginalPath(local_library.AssetID(id))
	if err != nil {
		return err
	}
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", path).Start()
}

func (a *App) OpenLocalAssetInFileManager(id string) error {
	path, err := a.LocalLibrary.OriginalPath(local_library.AssetID(id))
	if err != nil {
		return err
	}
	return exec.Command("explorer.exe", "/select,"+path).Start()
}

func (a *App) OpenLocalLibraryFolderInFileManager(relative string) error {
	path, err := a.LocalLibrary.FolderPath(relative)
	if err != nil {
		return err
	}
	return exec.Command("explorer.exe", path).Start()
}
