package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"time"
)

type PhotoService struct{ proxy *ProxyClient }

func NewPhotoService(proxy *ProxyClient) *PhotoService {
	return &PhotoService{proxy: proxy}
}

type PhotoDTO struct {
	ID              string     `json:"id"`
	Title           string     `json:"title"`
	URL             string     `json:"url"`
	ThumbnailURL    *string    `json:"thumbnailUrl,omitempty"`
	OriginFlag      string     `json:"originFlag"`
	StorageProvider string     `json:"storageProvider"`
	StorageSourceID *string    `json:"storageSourceId,omitempty"`
	StorageKey      *string    `json:"storageKey,omitempty"`
	Width           int        `json:"width"`
	Height          int        `json:"height"`
	Size            *int64     `json:"size,omitempty"`
	IsFeatured      bool       `json:"isFeatured"`
	ShowFlag        bool       `json:"showFlag"`
	DominantColors  json.RawMessage `json:"dominantColors,omitempty"`
	FileHash        *string    `json:"fileHash,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
	CameraID        *string    `json:"cameraId,omitempty"`
	LensID          *string    `json:"lensId,omitempty"`
	Camera          *CameraDTO `json:"camera,omitempty"`
	Lens            *LensDTO   `json:"lens,omitempty"`
	CameraMake      *string    `json:"cameraMake,omitempty"`
	CameraModel     *string    `json:"cameraModel,omitempty"`
	LensModel       *string    `json:"lensModel,omitempty"`
	FocalLength     *string    `json:"focalLength,omitempty"`
	Aperture        *string    `json:"aperture,omitempty"`
	ShutterSpeed    *string    `json:"shutterSpeed,omitempty"`
	ISO             *int       `json:"iso,omitempty"`
	TakenAt         *time.Time `json:"takenAt,omitempty"`
	Orientation     *int       `json:"orientation,omitempty"`
	Software        *string    `json:"software,omitempty"`
	GPS             *string    `json:"gps,omitempty"`
	Category        string     `json:"category"`
	PhotoType       string     `json:"photoType"`
	FilmRollID      *string    `json:"filmRollId,omitempty"`
	FilmRollName    *string    `json:"filmRollName,omitempty"`
}

type CameraDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type LensDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type ListPhotosParams struct {
	Category  string  `json:"category"`
	AlbumID   string  `json:"albumId"`
	CameraID  string  `json:"cameraId"`
	LensID    string  `json:"lensId"`
	Search    string  `json:"search"`
	PhotoType *string `json:"photoType"`
	Channel   *string `json:"channel"`
	Featured  *bool   `json:"featured"`
	ShowFlag  *bool   `json:"showFlag"`
	SortBy    string  `json:"sortBy"`
	SortOrder string  `json:"sortOrder"`
	Page      int     `json:"page"`
	PageSize  int     `json:"pageSize"`
}

type UpdatePhotoParams struct {
	Title      *string    `json:"title,omitempty"`
	IsFeatured *bool      `json:"isFeatured,omitempty"`
	ShowFlag   *bool      `json:"showFlag,omitempty"`
	TakenAt    *time.Time `json:"takenAt,omitempty"`
	Category   *string    `json:"category,omitempty"`
}

type DeletePhotoParams struct {
	DeleteOriginal  bool `json:"deleteOriginal"`
	DeleteThumbnail bool `json:"deleteThumbnail"`
	Force           bool `json:"force"`
}

type BatchDeleteParams struct {
	PhotoIDs        []string `json:"photoIds"`
	DeleteOriginal  bool     `json:"deleteOriginal"`
	DeleteThumbnail bool     `json:"deleteThumbnail"`
	Force           bool     `json:"force"`
}

type BatchResult struct {
	Success int      `json:"success"`
	Failed  int      `json:"failed"`
	Errors  []string `json:"errors,omitempty"`
}

func (s *PhotoService) checkReady() error {
	if s.proxy == nil || !s.proxy.IsReady() {
		return errors.New("未连接到服务器")
	}
	return nil
}

func (s *PhotoService) List(params ListPhotosParams) (*PaginatedResponse[PhotoDTO], error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	if params.Page <= 0 {
		params.Page = 1
	}
	if params.PageSize <= 0 {
		params.PageSize = 50
	}

	q := url.Values{}
	if params.Category != "" && params.Category != "全部" {
		q.Set("category", params.Category)
	}
	q.Set("page", fmt.Sprintf("%d", params.Page))
	q.Set("pageSize", fmt.Sprintf("%d", params.PageSize))

	var photos []PhotoDTO
	var meta PaginationMeta
	if err := s.proxy.GETWithMeta("/admin/photos?"+q.Encode(), &photos, &meta); err != nil {
		return nil, err
	}
	return &PaginatedResponse[PhotoDTO]{Data: photos, Meta: meta}, nil
}

func (s *PhotoService) GetByID(id string) (*PhotoDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var photo PhotoDTO
	if err := s.proxy.GET("/admin/photos/"+id, &photo); err != nil {
		return nil, err
	}
	return &photo, nil
}

func (s *PhotoService) Update(id string, params UpdatePhotoParams) (*PhotoDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var photo PhotoDTO
	if err := s.proxy.PATCH("/admin/photos/"+id, params, &photo); err != nil {
		return nil, err
	}
	return &photo, nil
}

func (s *PhotoService) Delete(id string, params DeletePhotoParams) error {
	if err := s.checkReady(); err != nil {
		return err
	}
	q := fmt.Sprintf("?deleteOriginal=%v&deleteThumbnail=%v&force=%v",
		params.DeleteOriginal, params.DeleteThumbnail, params.Force)
	return s.proxy.DELETE("/admin/photos/" + id + q)
}

func (s *PhotoService) ToggleFeatured(id string) (*PhotoDTO, error) {
	photo, err := s.GetByID(id)
	if err != nil {
		return nil, err
	}
	newVal := !photo.IsFeatured
	return s.Update(id, UpdatePhotoParams{IsFeatured: &newVal})
}

func (s *PhotoService) ToggleShowFlag(id string) (*PhotoDTO, error) {
	photo, err := s.GetByID(id)
	if err != nil {
		return nil, err
	}
	newVal := !photo.ShowFlag
	return s.Update(id, UpdatePhotoParams{ShowFlag: &newVal})
}

func (s *PhotoService) BatchDelete(params BatchDeleteParams) (*BatchResult, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var result BatchResult
	if err := s.proxy.POST("/admin/photos/batch-delete", params, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (s *PhotoService) BatchUpdateShowFlag(photoIDs []string, showFlag bool) (*BatchResult, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var result BatchResult
	if err := s.proxy.POST("/admin/photos/batch-update-show-flag",
		map[string]interface{}{"photoIds": photoIDs, "showFlag": showFlag}, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (s *PhotoService) GetCategories() ([]string, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var categories []string
	if err := s.proxy.GET("/categories", &categories); err != nil {
		return nil, err
	}
	return categories, nil
}
