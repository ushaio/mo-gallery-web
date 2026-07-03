package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"mo-gallery-desktop/config"
	"mo-gallery-desktop/db"
	"mo-gallery-desktop/image"
	"mo-gallery-desktop/services"
	"mo-gallery-desktop/types"
)

type App struct {
	ctx      context.Context
	cfg      *config.Config
	Proxy    *services.ProxyClient
	Auth     *services.AuthService
	Photo    *services.PhotoService
	Album    *services.AlbumService
	Story    *services.StoryService
	Blog     *services.BlogService
	FilmRoll *services.FilmRollService
	Friend   *services.FriendService
	Comment  *services.CommentService
	Upload   *services.UploadService
	Storage  *services.StorageService
	Settings *services.SettingsService
	EditorAi *services.EditorAiService
	Logger   *services.Logger
	Overview *services.OverviewService
}

func NewApp(cfg *config.Config) *App {
	return &App{
		cfg:    cfg,
		Proxy:  services.NewProxyClient(),
		Logger: services.NewLogger(cfg.Log.Enabled, cfg.Log.MaxEntries),
	}
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
	a.EditorAi = services.NewEditorAiService(a.cfg)
	a.Overview = services.NewOverviewService()

	// 加载日志
	a.Logger.Load()

	// 启动本地 AI 流式 HTTP 服务
	a.startAiHTTPServer()

	a.Logger.Info(services.LogCategorySystem, "app_start", "应用启动", "")
}

// startAiHTTPServer 启动本地 HTTP 服务用于 AI 流式生成
func (a *App) startAiHTTPServer() {
	mux := http.NewServeMux()
	mux.HandleFunc("/ai/generate", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
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

		if err := a.EditorAi.GenerateStream(input, w); err != nil {
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
	db.Close()
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
	a.Logger.Info(services.LogCategoryAuth, "login_success", "登录成功", "用户: "+username+", 服务器: "+serverURL)
	return result, nil
}

func (a *App) SetAuth(serverURL, token string) (*services.UserInfo, error) {
	user, err := a.Auth.ValidateToken(token)
	if err != nil {
		a.Proxy.SetToken("")
		a.Logger.Warn(services.LogCategoryAuth, "restore_auth_failed", "恢复登录态失败", err.Error())
		return nil, err
	}

	a.Proxy.SetServer(serverURL)
	a.Proxy.SetToken(token)
	return user, nil
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
		"jwt_secret":     a.cfg.API.JWTSecret,
		"remember_login": a.cfg.API.RememberLogin,
		"saved_username": a.cfg.API.SavedUsername,
		"saved_password": decryptedPassword,
	}
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
	files, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择照片",
		Filters: []runtime.FileFilter{
			{DisplayName: "图片文件 (*.jpg;*.jpeg;*.png;*.webp;*.avif;*.tiff;*.bmp)", Pattern: "*.jpg;*.jpeg;*.png;*.webp;*.avif;*.tiff;*.tif;*.bmp"},
		},
	})
	if err != nil {
		return nil, err
	}
	if files == "" {
		return []string{}, nil
	}
	return []string{files}, nil
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
	a.cfg.AI.Normalize()
	return a.cfg.AI
}

func (a *App) UpdateAiConfig(data config.AIConfig) error {
	data.Normalize()
	a.cfg.AI = data
	return a.cfg.Save("")
}

func (a *App) GetEditorAiConversations(scopeId string) ([]services.EditorAiConversationDTO, error) {
	return a.EditorAi.ListConversations(scopeId)
}
func (a *App) CreateEditorAiConversation(input services.EditorAiConversationCreateInput) (*services.EditorAiConversationDTO, error) {
	return a.EditorAi.CreateConversation(input)
}
func (a *App) GetEditorAiConversation(conversationId string) (*services.EditorAiConversationWithMessagesDTO, error) {
	return a.EditorAi.GetConversation(conversationId)
}
func (a *App) UpdateEditorAiConversation(conversationId string, input services.EditorAiConversationUpdateInput) (*services.EditorAiConversationDTO, error) {
	return a.EditorAi.UpdateConversation(conversationId, input)
}
func (a *App) DeleteEditorAiConversation(conversationId string) error {
	return a.EditorAi.DeleteConversation(conversationId)
}
func (a *App) ClearEditorAiConversation(conversationId string) (*services.EditorAiConversationDTO, error) {
	return a.EditorAi.ClearConversation(conversationId)
}
func (a *App) GetStoryAiModels() (*services.StoryAiModelsResponseDTO, error) {
	return a.EditorAi.GetModels()
}
func (a *App) GetStoryAiProviderModels(providerID string) (*services.StoryAiModelsResponseDTO, error) {
	return a.EditorAi.GetProviderModels(providerID)
}
func (a *App) GetAiImageDataURL(messageId string) (string, error) {
	return a.EditorAi.GetImageDataURL(messageId)
}
func (a *App) SaveAiImageToAlbum(messageId string) (*services.PhotoDTO, error) {
	return a.EditorAi.SaveImageToAlbum(messageId, a.Upload)
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
