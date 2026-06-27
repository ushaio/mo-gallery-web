package services

import (
	"errors"
	"time"
)

type AlbumService struct{ proxy *ProxyClient }

func NewAlbumService(proxy *ProxyClient) *AlbumService {
	return &AlbumService{proxy: proxy}
}

type AlbumDTO struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Description *string    `json:"description,omitempty"`
	CoverURL    *string    `json:"coverUrl,omitempty"`
	IsPublished bool       `json:"isPublished"`
	SortOrder   int        `json:"sortOrder"`
	PhotoCount  int        `json:"photoCount"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	Photos      []PhotoDTO `json:"photos,omitempty"`
}

type CreateAlbumParams struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	CoverURL    string `json:"coverUrl"`
	IsPublished bool   `json:"isPublished"`
	SortOrder   int    `json:"sortOrder"`
}

type UpdateAlbumParams struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
	CoverURL    *string `json:"coverUrl,omitempty"`
	IsPublished *bool   `json:"isPublished,omitempty"`
	SortOrder   *int    `json:"sortOrder,omitempty"`
}

func (s *AlbumService) checkReady() error {
	if s.proxy == nil || !s.proxy.IsReady() {
		return errors.New("未连接到服务器")
	}
	return nil
}

func (s *AlbumService) List() ([]AlbumDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var albums []AlbumDTO
	if err := s.proxy.GET("/admin/albums", &albums); err != nil {
		return nil, err
	}
	return albums, nil
}

func (s *AlbumService) GetByID(id string) (*AlbumDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var album AlbumDTO
	if err := s.proxy.GET("/admin/albums/"+id, &album); err != nil {
		return nil, err
	}
	return &album, nil
}

func (s *AlbumService) Create(params CreateAlbumParams) (*AlbumDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	if params.Name == "" {
		return nil, errors.New("相册名称不能为空")
	}
	var album AlbumDTO
	if err := s.proxy.POST("/admin/albums", params, &album); err != nil {
		return nil, err
	}
	return &album, nil
}

func (s *AlbumService) Update(id string, params UpdateAlbumParams) (*AlbumDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var album AlbumDTO
	if err := s.proxy.PATCH("/admin/albums/"+id, params, &album); err != nil {
		return nil, err
	}
	return &album, nil
}

func (s *AlbumService) Delete(id string) error {
	if err := s.checkReady(); err != nil {
		return err
	}
	return s.proxy.DELETE("/admin/albums/" + id)
}
