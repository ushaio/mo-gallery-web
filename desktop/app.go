package main

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"mo-gallery-desktop/config"
	"mo-gallery-desktop/db"
	"mo-gallery-desktop/image"
	"mo-gallery-desktop/services"
	"mo-gallery-desktop/types"
)

type App struct {
	ctx     context.Context
	cfg     *config.Config
	Proxy   *services.ProxyClient
	Auth    *services.AuthService
	Photo   *services.PhotoService
	Album   *services.AlbumService
	Story   *services.StoryService
	Blog    *services.BlogService
	FilmRoll *services.FilmRollService
	Friend  *services.FriendService
	Comment *services.CommentService
	Upload  *services.UploadService
	Settings *services.SettingsService
}

func NewApp(cfg *config.Config) *App {
	return &App{
		cfg:   cfg,
		Proxy: services.NewProxyClient(),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.Auth = services.NewAuthService(a.cfg)
	a.Photo = services.NewPhotoService(a.Proxy)
	a.Album = services.NewAlbumService(a.Proxy)
	a.Story = services.NewStoryService(a.Proxy)
	a.Blog = services.NewBlogService(a.Proxy)
	a.FilmRoll = services.NewFilmRollService(a.Proxy)
	a.Friend = services.NewFriendService(a.Proxy)
	a.Comment = services.NewCommentService(a.Proxy)
	a.Upload = services.NewUploadService(a.Proxy)
	a.Settings = services.NewSettingsService(a.Proxy)
}

func (a *App) shutdown(ctx context.Context) {
	db.Close()
}

// ─── Auth ────────────────────────────────────────────

func (a *App) Login(serverURL, username, password string) (*services.LoginResult, error) {
	result, err := a.Auth.Login(serverURL, username, password)
	if err != nil {
		return nil, err
	}
	a.Proxy.SetServer(result.Server)
	a.Proxy.SetToken(result.Token)
	return result, nil
}

func (a *App) SetAuth(serverURL, token string) {
	a.Proxy.SetServer(serverURL)
	a.Proxy.SetToken(token)
}

func (a *App) ValidateToken(token string) (*services.UserInfo, error) {
	return a.Auth.ValidateToken(token)
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
	return a.Photo.Delete(id, params)
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
func (a *App) GetCategories() ([]string, error) {
	return a.Photo.GetCategories()
}

// ─── Albums ──────────────────────────────────────────

func (a *App) GetAlbums() ([]services.AlbumDTO, error) { return a.Album.List() }
func (a *App) GetAlbum(id string) (*services.AlbumDTO, error) { return a.Album.GetByID(id) }
func (a *App) CreateAlbum(params services.CreateAlbumParams) (*services.AlbumDTO, error) { return a.Album.Create(params) }
func (a *App) UpdateAlbum(id string, params services.UpdateAlbumParams) (*services.AlbumDTO, error) { return a.Album.Update(id, params) }
func (a *App) DeleteAlbum(id string) error { return a.Album.Delete(id) }

// ─── Stories ─────────────────────────────────────────

func (a *App) GetStories() ([]services.StoryDTO, error) { return a.Story.List() }
func (a *App) GetStory(id string) (*services.StoryDTO, error) { return a.Story.GetByID(id) }
func (a *App) CreateStory(params services.CreateStoryParams) (*services.StoryDTO, error) { return a.Story.Create(params) }
func (a *App) UpdateStory(id string, params services.UpdateStoryParams) (*services.StoryDTO, error) { return a.Story.Update(id, params) }
func (a *App) DeleteStory(id string) error { return a.Story.Delete(id) }
func (a *App) AddStoryPhoto(storyID, photoID string) error { return a.Story.AddStoryPhoto(storyID, photoID) }
func (a *App) RemoveStoryPhoto(storyID, photoID string) error { return a.Story.RemoveStoryPhoto(storyID, photoID) }
func (a *App) ReorderStoryPhotos(storyID string, photoIDs []string) (*services.StoryDTO, error) { return a.Story.ReorderPhotos(storyID, photoIDs) }

// ─── Blogs ───────────────────────────────────────────

func (a *App) GetBlogs() ([]services.BlogDTO, error) { return a.Blog.List() }
func (a *App) GetBlog(id string) (*services.BlogDTO, error) { return a.Blog.GetByID(id) }
func (a *App) CreateBlog(params services.CreateBlogParams) (*services.BlogDTO, error) { return a.Blog.Create(params) }
func (a *App) UpdateBlog(id string, params services.UpdateBlogParams) (*services.BlogDTO, error) { return a.Blog.Update(id, params) }
func (a *App) DeleteBlog(id string) error { return a.Blog.Delete(id) }

// ─── Film Rolls ──────────────────────────────────────

func (a *App) GetFilmRolls() ([]services.FilmRollDTO, error) { return a.FilmRoll.List() }
func (a *App) GetFilmRoll(id string) (*services.FilmRollDTO, error) { return a.FilmRoll.GetByID(id) }
func (a *App) CreateFilmRoll(params services.CreateFilmRollParams) (*services.FilmRollDTO, error) { return a.FilmRoll.Create(params) }
func (a *App) UpdateFilmRoll(id string, params services.UpdateFilmRollParams) (*services.FilmRollDTO, error) { return a.FilmRoll.Update(id, params) }
func (a *App) DeleteFilmRoll(id string) error { return a.FilmRoll.Delete(id) }

// ─── Friends ─────────────────────────────────────────

func (a *App) GetFriends() ([]services.FriendDTO, error) { return a.Friend.List() }
func (a *App) CreateFriend(params services.CreateFriendParams) (*services.FriendDTO, error) { return a.Friend.Create(params) }
func (a *App) UpdateFriend(id string, params services.UpdateFriendParams) (*services.FriendDTO, error) { return a.Friend.Update(id, params) }
func (a *App) DeleteFriend(id string) error { return a.Friend.Delete(id) }

// ─── Comments ────────────────────────────────────────

func (a *App) GetComments(params services.ListCommentsParams) (*services.PaginatedResponse[services.CommentDTO], error) {
	return a.Comment.List(params)
}
func (a *App) UpdateCommentStatus(id string, status string) error { return a.Comment.UpdateStatus(id, status) }
func (a *App) DeleteComment(id string) error { return a.Comment.Delete(id) }

// ─── Upload ──────────────────────────────────────────

func (a *App) PrepareUpload(filePaths []string) ([]services.PreparedFile, error) {
	return a.Upload.PrepareUpload(filePaths)
}
func (a *App) CheckDuplicates(hashes []string) (*services.DuplicateCheckResult, error) {
	return a.Upload.CheckDuplicates(hashes)
}
func (a *App) UploadFile(filePath string, settings services.UploadSettings, hash string, exifData *image.ExifData) (*services.UploadResult, error) {
	return a.Upload.UploadFile(filePath, settings, hash, exifData)
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

// ─── Settings ────────────────────────────────────────

func (a *App) GetSettings() (map[string]string, error) { return a.Settings.GetSettings() }
func (a *App) UpdateSettings(data map[string]string) (map[string]string, error) { return a.Settings.UpdateSettings(data) }
func (a *App) GetStorageSources() ([]types.StorageSourceDTO, error) { return a.Settings.GetStorageSources() }
func (a *App) CreateStorageSource(data map[string]string) (*types.StorageSourceDTO, error) { return a.Settings.CreateStorageSource(data) }
func (a *App) UpdateStorageSource(id string, data map[string]string) (*types.StorageSourceDTO, error) { return a.Settings.UpdateStorageSource(id, data) }
func (a *App) DeleteStorageSource(id string) error { return a.Settings.DeleteStorageSource(id) }
