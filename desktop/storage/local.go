package storage

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// LocalProvider 本地文件系统存储
type LocalProvider struct {
	basePath string
}

func NewLocalProvider(basePath string) *LocalProvider {
	return &LocalProvider{basePath: basePath}
}

// Upload 复制文件到本地存储目录，返回相对 URL 路径
func (p *LocalProvider) Upload(key string, data io.Reader, contentType string) (string, error) {
	// 构造目标路径
	targetPath := filepath.Join(p.basePath, key)
	targetPath = filepath.FromSlash(targetPath)

	// 确保目录存在
	dir := filepath.Dir(targetPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("创建目录失败: %w", err)
	}

	// 写入文件
	f, err := os.Create(targetPath)
	if err != nil {
		return "", fmt.Errorf("创建文件失败: %w", err)
	}
	defer f.Close()

	if _, err := io.Copy(f, data); err != nil {
		return "", fmt.Errorf("写入文件失败: %w", err)
	}

	// 返回 URL 路径（正斜杠）
	urlPath := "/" + strings.ReplaceAll(filepath.ToSlash(key), "\\", "/")
	return urlPath, nil
}

// Delete 删除本地文件
func (p *LocalProvider) Delete(key string) error {
	targetPath := filepath.Join(p.basePath, key)
	return os.Remove(targetPath)
}
