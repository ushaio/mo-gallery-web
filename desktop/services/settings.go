package services

import (
	"fmt"
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
