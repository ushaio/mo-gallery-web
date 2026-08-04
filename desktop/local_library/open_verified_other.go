//go:build !windows

package local_library

import (
	"os"
	"path/filepath"
	"strings"
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
	evaluated, err := filepath.EvalSymlinks(path)
	if err != nil {
		file.Close()
		return nil, err
	}
	if err := validateOpenedPathWithinRoot(root, evaluated, rejectInternal); err != nil {
		file.Close()
		return nil, err
	}
	openedInfo, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, err
	}
	resolvedInfo, err := os.Stat(evaluated)
	if err != nil || !os.SameFile(openedInfo, resolvedInfo) {
		file.Close()
		return nil, newError(ErrInvalidPath, "opened asset changed during validation", nil)
	}
	return file, nil
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
