package image

import (
	"crypto/sha256"
	"fmt"
	"io"
	"os"
)

// FileHash 计算文件的 SHA-256 哈希
func FileHash(filePath string) (string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", fmt.Errorf("打开文件失败: %w", err)
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", fmt.Errorf("计算哈希失败: %w", err)
	}

	return fmt.Sprintf("%x", h.Sum(nil)), nil
}
