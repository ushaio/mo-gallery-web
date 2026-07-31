//go:build !windows

package local_library

import "fmt"

func setFileClipboard(_ []string, _ bool) error {
	return fmt.Errorf("当前平台暂不支持文件剪贴板")
}
