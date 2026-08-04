//go:build windows

package local_library

import (
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows"
)

func openVerifiedWithinRoot(root, path string) (*os.File, error) {
	return openVerifiedWithinDirectory(root, path, true)
}

func openVerifiedWithinInternalDirectory(root, path string) (*os.File, error) {
	return openVerifiedWithinDirectory(root, path, false)
}

func openVerifiedWithinDirectory(root, path string, rejectInternal bool) (*os.File, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	finalPath, err := finalPathFromHandle(file)
	if err != nil {
		file.Close()
		return nil, err
	}
	if err := validateOpenedPathWithinRoot(root, finalPath, rejectInternal); err != nil {
		file.Close()
		return nil, err
	}
	return file, nil
}

func finalPathFromHandle(file *os.File) (string, error) {
	buffer := make([]uint16, 512)
	for {
		length, err := windows.GetFinalPathNameByHandle(windows.Handle(file.Fd()), &buffer[0], uint32(len(buffer)), 0)
		if err != nil {
			return "", err
		}
		if length < uint32(len(buffer)) {
			path := windows.UTF16ToString(buffer[:length])
			if strings.HasPrefix(path, `\\?\UNC\`) {
				return `\\` + strings.TrimPrefix(path, `\\?\UNC\`), nil
			}
			return strings.TrimPrefix(path, `\\?\`), nil
		}
		buffer = make([]uint16, length+1)
	}
}

func validateOpenedPathWithinRoot(root, path string, rejectInternal bool) error {
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return err
	}
	pathAbs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	if !strings.EqualFold(filepath.VolumeName(rootAbs), filepath.VolumeName(pathAbs)) {
		return newError(ErrInvalidPath, "opened asset is outside the library volume", nil)
	}
	relative, err := filepath.Rel(rootAbs, pathAbs)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(os.PathSeparator)) {
		return newError(ErrInvalidPath, "opened asset escapes the library root", nil)
	}
	first := strings.Split(filepath.ToSlash(relative), "/")[0]
	if rejectInternal && strings.EqualFold(first, internalDirName) {
		return newError(ErrInvalidPath, "opened asset resolves to the library internal directory", nil)
	}
	return nil
}
