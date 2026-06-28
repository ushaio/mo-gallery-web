package services

import (
	"errors"
	"net/url"
)

type StorageService struct{ proxy *ProxyClient }

func NewStorageService(proxy *ProxyClient) *StorageService {
	return &StorageService{proxy: proxy}
}

type StorageScanParams struct {
	Provider string `json:"provider"`
	Status   string `json:"status,omitempty"`
	Search   string `json:"search,omitempty"`
}

type StorageFileDTO struct {
	Key          string `json:"key"`
	URL          string `json:"url"`
	Size         int64  `json:"size"`
	LastModified string `json:"lastModified"`
	Status       string `json:"status"`
	PhotoID      string `json:"photoId,omitempty"`
	PhotoTitle   string `json:"photoTitle,omitempty"`
	MissingType  string `json:"missingType,omitempty"`
	HasThumb     bool   `json:"hasThumb,omitempty"`
}

type StorageScanStats struct {
	Total            int `json:"total"`
	Linked           int `json:"linked"`
	Orphan           int `json:"orphan"`
	Missing          int `json:"missing"`
	MissingOriginal  int `json:"missingOriginal"`
	MissingThumbnail int `json:"missingThumbnail"`
}

type StorageScanResult struct {
	Files []StorageFileDTO `json:"files"`
	Stats StorageScanStats `json:"stats"`
}

type StorageCleanupResult struct {
	Deleted int      `json:"deleted"`
	Failed  int      `json:"failed"`
	Errors  []string `json:"errors"`
}

type FixMissingPhotosResult struct {
	Deleted int `json:"deleted"`
}

func (s *StorageService) checkReady() error {
	if s.proxy == nil || !s.proxy.IsReady() {
		return errors.New("未连接到服务器")
	}
	return nil
}

func (s *StorageService) Scan(params StorageScanParams) (*StorageScanResult, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	provider := params.Provider
	if provider == "" {
		provider = "local"
	}

	q := url.Values{}
	q.Set("provider", provider)
	if params.Status != "" {
		q.Set("status", params.Status)
	}
	if params.Search != "" {
		q.Set("search", params.Search)
	}

	var result StorageScanResult
	if err := s.proxy.GET("/admin/storage/scan?"+q.Encode(), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (s *StorageService) Cleanup(keys []string, provider string) (*StorageCleanupResult, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	if provider == "" {
		provider = "local"
	}

	var result StorageCleanupResult
	if err := s.proxy.POST("/admin/storage/cleanup", map[string]interface{}{
		"keys":     keys,
		"provider": provider,
	}, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (s *StorageService) FixMissing(photoIDs []string) (*FixMissingPhotosResult, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}

	var result FixMissingPhotosResult
	if err := s.proxy.POST("/admin/storage/fix-missing", map[string]interface{}{
		"photoIds": photoIDs,
	}, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (s *StorageService) GenerateThumbnail(photoID string) (*PhotoDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}

	var photo PhotoDTO
	if err := s.proxy.POST("/admin/photos/"+url.PathEscape(photoID)+"/generate-thumbnail", nil, &photo); err != nil {
		return nil, err
	}
	return &photo, nil
}
