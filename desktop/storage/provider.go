package storage

import (
	"fmt"
	"io"
)

// Provider 存储提供者接口
type Provider interface {
	// Upload 上传文件，返回公开访问 URL
	Upload(key string, data io.Reader, contentType string) (string, error)
	// Delete 删除文件
	Delete(key string) error
}

// ProviderFactory 根据配置创建存储提供者
type ProviderFactory struct{}

type Config struct {
	Type         string // local, s3, github
	BasePath     string
	// S3
	Endpoint  string
	Region    string
	AccessKey string
	SecretKey string
	Bucket    string
	PublicURL string
	// GitHub
	Token      string
	Repo       string // owner/repo
	Branch     string
	AccessMethod string // raw, jsdelivr, pages
	PagesURL   string
}

func (f *ProviderFactory) Create(cfg Config) (Provider, error) {
	switch cfg.Type {
	case "local":
		return NewLocalProvider(cfg.BasePath), nil
	case "s3":
		return NewS3Provider(cfg)
	case "github":
		return NewGitHubProvider(cfg)
	default:
		return nil, fmt.Errorf("unsupported storage type: %s", cfg.Type)
	}
}
