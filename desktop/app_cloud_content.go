package main

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"mo-gallery-desktop/services"
	"mo-gallery-desktop/storage_plugins"
)

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
	photo, lookupErr := a.Photo.GetByID(id)
	if lookupErr != nil {
		return lookupErr
	}
	if photo.StorageRuntime == storage_plugins.RuntimeDesktopPlugin {
		if err := a.deleteDesktopPhotoObjects(photo, params); err != nil {
			a.Logger.Error(services.LogCategoryPhoto, "delete_photo_objects_failed", "删除桌面插件照片对象失败", "ID: "+id+", 错误: "+err.Error())
			return err
		}
		// The Web API owns only the metadata for Desktop plugin photos. Object
		// deletion has already been completed through the storage capability.
		params.DeleteOriginal = false
		params.DeleteThumbnail = false
	}
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
	result := &services.BatchResult{}
	webIDs := make([]string, 0, len(params.PhotoIDs))
	for _, id := range params.PhotoIDs {
		photo, err := a.Photo.GetByID(id)
		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, id+": "+err.Error())
			continue
		}
		if photo.StorageRuntime != storage_plugins.RuntimeDesktopPlugin {
			webIDs = append(webIDs, id)
			continue
		}
		if err := a.DeletePhoto(id, services.DeletePhotoParams{
			DeleteOriginal:  params.DeleteOriginal,
			DeleteThumbnail: params.DeleteThumbnail,
			Force:           params.Force,
		}); err != nil {
			result.Failed++
			result.Errors = append(result.Errors, id+": "+err.Error())
		} else {
			result.Success++
		}
	}
	if len(webIDs) > 0 {
		webResult, err := a.Photo.BatchDelete(services.BatchDeleteParams{
			PhotoIDs: webIDs, DeleteOriginal: params.DeleteOriginal,
			DeleteThumbnail: params.DeleteThumbnail, Force: params.Force,
		})
		if err != nil {
			result.Failed += len(webIDs)
			result.Errors = append(result.Errors, err.Error())
		} else if webResult != nil {
			result.Success += webResult.Success
			result.Failed += webResult.Failed
			result.Errors = append(result.Errors, webResult.Errors...)
		}
	}
	return result, nil
}

func (a *App) deleteDesktopPhotoObjects(photo *services.PhotoDTO, params services.DeletePhotoParams) error {
	if a.StoragePlugins == nil {
		return errors.New("桌面存储插件未初始化")
	}
	if !params.DeleteOriginal && !params.DeleteThumbnail {
		return nil
	}
	if photo.StorageSourceID == nil || strings.TrimSpace(*photo.StorageSourceID) == "" {
		return errors.New("桌面插件照片缺少存储源")
	}
	deleteKey := func(key string) error {
		if strings.TrimSpace(key) == "" {
			return nil
		}
		return a.StoragePlugins.Delete(context.Background(), storage_plugins.DeleteRequest{SourceID: *photo.StorageSourceID, Key: key})
	}
	if params.DeleteOriginal && photo.Path != nil && strings.TrimSpace(*photo.Path) != "" {
		if err := deleteKey(*photo.Path); err != nil {
			return fmt.Errorf("删除原图对象失败: %w", err)
		}
	} else if params.DeleteOriginal {
		return errors.New("桌面插件照片缺少原图对象路径")
	}
	if params.DeleteThumbnail {
		key := ""
		if photo.ThumbPath != nil {
			key = *photo.ThumbPath
		} else if photo.Path != nil {
			key = services.PluginThumbnailObjectKey(*photo.Path)
		}
		if strings.TrimSpace(key) == "" {
			return errors.New("桌面插件照片缺少缩略图对象 key")
		}
		if err := deleteKey(key); err != nil {
			return fmt.Errorf("删除缩略图对象失败: %w", err)
		}
	}
	return nil
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
func (a *App) ReorderFriends(items []services.ReorderFriendItem) error {
	return a.Friend.Reorder(items)
}

// FetchURLMetadataResult holds extracted metadata from a website.
type FetchURLMetadataResult struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Avatar      string `json:"avatar"`
}
