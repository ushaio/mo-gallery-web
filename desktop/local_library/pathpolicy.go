package local_library

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const internalDirName = ".mo-gallery"
const manifestFileName = "library.json"

var windowsReserved = map[string]struct{}{
	"CON": {}, "PRN": {}, "AUX": {}, "NUL": {},
	"COM1": {}, "COM2": {}, "COM3": {}, "COM4": {}, "COM5": {}, "COM6": {}, "COM7": {}, "COM8": {}, "COM9": {},
	"LPT1": {}, "LPT2": {}, "LPT3": {}, "LPT4": {}, "LPT5": {}, "LPT6": {}, "LPT7": {}, "LPT8": {}, "LPT9": {},
}

func newID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%s-%s-%s-%s-%s", hex.EncodeToString(b[0:4]), hex.EncodeToString(b[4:6]), hex.EncodeToString(b[6:8]), hex.EncodeToString(b[8:10]), hex.EncodeToString(b[10:16]))
}

func cleanRoot(root string) (string, error) {
	root = strings.TrimSpace(root)
	if root == "" {
		return "", newError(ErrInvalidPath, "资源库路径不能为空", nil)
	}
	absolute, err := filepath.Abs(root)
	if err != nil {
		return "", newError(ErrInvalidPath, "无法解析资源库路径", map[string]any{"cause": err.Error()})
	}
	absolute = filepath.Clean(absolute)
	info, err := os.Stat(absolute)
	if err != nil {
		return "", newError(ErrInvalidPath, "资源库目录不可访问", map[string]any{"path": absolute, "cause": err.Error()})
	}
	if !info.IsDir() {
		return "", newError(ErrInvalidPath, "资源库路径必须是文件夹", map[string]any{"path": absolute})
	}
	if evaluated, evalErr := filepath.EvalSymlinks(absolute); evalErr == nil {
		absolute = evaluated
	}
	return absolute, nil
}

func normalizeRelative(relative string) (RelativePath, string, error) {
	relative = strings.ReplaceAll(strings.TrimSpace(relative), "\\", "/")
	if relative == "" || relative == "." {
		return RelativePath(""), "", nil
	}
	if strings.HasPrefix(relative, "/") || filepath.IsAbs(relative) || strings.ContainsRune(relative, 0) {
		return "", "", newError(ErrInvalidPath, "路径必须是资源库内相对路径", nil)
	}
	parts := strings.Split(relative, "/")
	clean := make([]string, 0, len(parts))
	for _, part := range parts {
		if part == "" || part == "." || part == ".." {
			return "", "", newError(ErrInvalidPath, "路径包含非法片段", map[string]any{"path": relative})
		}
		if strings.EqualFold(part, internalDirName) {
			return "", "", newError(ErrInvalidPath, "不能访问资源库内部目录", nil)
		}
		if strings.HasSuffix(part, " ") || strings.HasSuffix(part, ".") {
			return "", "", newError(ErrInvalidPath, "Windows 路径不能以空格或点结尾", map[string]any{"segment": part})
		}
		base := strings.ToUpper(strings.SplitN(part, ".", 2)[0])
		if _, reserved := windowsReserved[base]; reserved {
			return "", "", newError(ErrInvalidPath, "路径包含 Windows 保留名称", map[string]any{"segment": part})
		}
		clean = append(clean, part)
	}
	normalized := strings.Join(clean, "/")
	key := normalized
	if runtime.GOOS == "windows" {
		key = strings.ToLower(normalized)
	}
	return RelativePath(normalized), key, nil
}

func resolveWithinRoot(root string, relative string) (string, error) {
	rel, _, err := normalizeRelative(relative)
	if err != nil {
		return "", err
	}
	target := filepath.Join(root, filepath.FromSlash(string(rel)))
	targetAbs, err := filepath.Abs(target)
	if err != nil {
		return "", err
	}
	rootVolume := filepath.VolumeName(root)
	targetVolume := filepath.VolumeName(targetAbs)
	if !strings.EqualFold(rootVolume, targetVolume) {
		return "", newError(ErrInvalidPath, "目标路径不在资源库卷内", nil)
	}
	relativeCheck, err := filepath.Rel(root, targetAbs)
	if err != nil || relativeCheck == ".." || strings.HasPrefix(relativeCheck, ".."+string(os.PathSeparator)) {
		return "", newError(ErrInvalidPath, "目标路径越出资源库", nil)
	}
	if evaluated, evalErr := filepath.EvalSymlinks(targetAbs); evalErr == nil {
		evaluatedCheck, relErr := filepath.Rel(root, evaluated)
		if relErr != nil || evaluatedCheck == ".." || strings.HasPrefix(evaluatedCheck, ".."+string(os.PathSeparator)) {
			return "", newError(ErrInvalidPath, "resolved path escapes the library root", nil)
		}
		targetAbs = evaluated
	}
	return targetAbs, nil
}

func isOpaqueID(value string) bool {
	if len(value) != 36 {
		return false
	}
	for index, char := range value {
		if index == 8 || index == 13 || index == 18 || index == 23 {
			if char != '-' {
				return false
			}
			continue
		}
		if !((char >= '0' && char <= '9') || (char >= 'a' && char <= 'f') || (char >= 'A' && char <= 'F')) {
			return false
		}
	}
	return true
}

func resolveTrashPayload(root, trashID, relative string) (string, string, error) {
	if !isOpaqueID(trashID) {
		return "", "", newError(ErrInvalidPath, "\u56de\u6536\u7ad9\u6761\u76ee\u6807\u8bc6\u65e0\u6548", nil)
	}
	relative = strings.ReplaceAll(strings.TrimSpace(relative), "\\", "/")
	parts := strings.Split(relative, "/")
	if len(parts) != 4 || parts[0] != "trash" || parts[1] != trashID || parts[2] != "payload" {
		return "", "", newError(ErrInvalidPath, "\u56de\u6536\u7ad9\u5185\u90e8\u8def\u5f84\u65e0\u6548", nil)
	}
	fileName, _, err := normalizeRelative(parts[3])
	if err != nil || fileName == "" || strings.Contains(string(fileName), "/") {
		return "", "", newError(ErrInvalidPath, "\u56de\u6536\u7ad9\u6587\u4ef6\u540d\u65e0\u6548", nil)
	}
	entryDir := internalPath(root, "trash", trashID)
	return filepath.Join(entryDir, "payload", filepath.FromSlash(string(fileName))), entryDir, nil
}

func checkNoNestedLibrary(root string) error {
	current := filepath.Dir(root)
	for {
		if _, err := os.Stat(filepath.Join(current, internalDirName, manifestFileName)); err == nil {
			return newError(ErrNestedLibrary, "父路径已经包含资源库，不能创建嵌套资源库", map[string]any{"parent": current})
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		current = parent
	}
	stop := fmt.Errorf("nested library found")
	var nested string
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if path == root {
			return nil
		}
		if d.IsDir() && strings.EqualFold(d.Name(), internalDirName) {
			if _, statErr := os.Stat(filepath.Join(path, manifestFileName)); statErr == nil {
				nested = filepath.Dir(path)
				return stop
			}
			return filepath.SkipDir
		}
		if d.Type()&os.ModeSymlink != 0 && d.IsDir() {
			return filepath.SkipDir
		}
		return nil
	})
	if nested != "" {
		return newError(ErrNestedLibrary, "目录中已存在资源库，不能形成嵌套资源库", map[string]any{"child": nested})
	}
	return nil
}
