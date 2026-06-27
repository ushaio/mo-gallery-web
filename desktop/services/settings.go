package services

import (
	"fmt"

	"mo-gallery-desktop/types"
)

// SettingsService 设置管理
type SettingsService struct {
	proxy *ProxyClient
}

func NewSettingsService(proxy *ProxyClient) *SettingsService {
	return &SettingsService{proxy: proxy}
}

// GetSettings 获取所有设置
func (s *SettingsService) GetSettings() (map[string]string, error) {
	if s.proxy == nil || !s.proxy.IsReady() {
		return nil, fmt.Errorf("未连接到服务器")
	}

	var config map[string]string
	if err := s.proxy.GET("/admin/settings/", &config); err != nil {
		return nil, err
	}
	return config, nil
}

// UpdateSettings 更新设置
func (s *SettingsService) UpdateSettings(data map[string]string) (map[string]string, error) {
	if s.proxy == nil || !s.proxy.IsReady() {
		return nil, fmt.Errorf("未连接到服务器")
	}

	var config map[string]string
	if err := s.proxy.PATCH("/admin/settings/", data, &config); err != nil {
		return nil, err
	}
	return config, nil
}

// ─── StorageSource CRUD ──────────────────────────────

// GetStorageSources 获取所有存储源
func (s *SettingsService) GetStorageSources() ([]types.StorageSourceDTO, error) {
	if s.proxy == nil || !s.proxy.IsReady() {
		return nil, fmt.Errorf("未连接到服务器")
	}

	var sources []types.StorageSourceDTO
	if err := s.proxy.GET("/admin/storage-sources", &sources); err != nil {
		return nil, err
	}
	return sources, nil
}

// CreateStorageSource 创建存储源
func (s *SettingsService) CreateStorageSource(data map[string]string) (*types.StorageSourceDTO, error) {
	if s.proxy == nil || !s.proxy.IsReady() {
		return nil, fmt.Errorf("未连接到服务器")
	}

	var source types.StorageSourceDTO
	if err := s.proxy.POST("/admin/storage-sources", data, &source); err != nil {
		return nil, err
	}
	return &source, nil
}

// UpdateStorageSource 更新存储源
func (s *SettingsService) UpdateStorageSource(id string, data map[string]string) (*types.StorageSourceDTO, error) {
	if s.proxy == nil || !s.proxy.IsReady() {
		return nil, fmt.Errorf("未连接到服务器")
	}

	var source types.StorageSourceDTO
	if err := s.proxy.PATCH("/admin/storage-sources/"+id, data, &source); err != nil {
		return nil, err
	}
	return &source, nil
}

// DeleteStorageSource 删除存储源
func (s *SettingsService) DeleteStorageSource(id string) error {
	if s.proxy == nil || !s.proxy.IsReady() {
		return fmt.Errorf("未连接到服务器")
	}

	return s.proxy.DELETE("/admin/storage-sources/" + id)
}
