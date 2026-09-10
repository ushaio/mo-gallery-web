package db

import (
	"os"
	"path/filepath"
)

// ensureDBDir 确保 db 子目录存在。
func ensureDBDir(configDir string) error {
	return os.MkdirAll(filepath.Join(configDir, "db"), 0o700)
}

// localDBPath 返回 configDir/db 子目录下的本地数据库文件路径。
func localDBPath(configDir, name string) string {
	return filepath.Join(configDir, "db", name)
}
