package local_library

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

type libraryLock struct{ path string }

type lockRecord struct {
	PID       int       `json:"pid"`
	CreatedAt time.Time `json:"createdAt"`
}

func acquireLibraryLock(root string) (*libraryLock, error) {
	path := internalPath(root, "lock")
	payload, _ := json.Marshal(lockRecord{PID: os.Getpid(), CreatedAt: time.Now().UTC()})
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err == nil {
		if _, writeErr := file.Write(payload); writeErr != nil {
			file.Close()
			_ = os.Remove(path)
			return nil, writeErr
		}
		if closeErr := file.Close(); closeErr != nil {
			_ = os.Remove(path)
			return nil, closeErr
		}
		return &libraryLock{path: path}, nil
	}
	if !errors.Is(err, os.ErrExist) {
		return nil, err
	}
	data, readErr := os.ReadFile(path)
	if readErr == nil {
		var record lockRecord
		parseErr := json.Unmarshal(data, &record)
		stale := parseErr == nil && record.PID > 0 && !processOwnsLock(record)
		if parseErr != nil || record.PID <= 0 {
			// A process can terminate after creating the file but before writing the
			// record. Do not let that incomplete marker block the library forever,
			// while still giving an active writer a short grace period.
			if info, statErr := os.Stat(path); statErr == nil {
				stale = time.Since(info.ModTime()) > 5*time.Second
			}
		}
		if stale {
			stalePath := path + ".stale-" + strconv.FormatInt(time.Now().UnixMilli(), 10)
			if renameErr := os.Rename(path, stalePath); renameErr == nil {
				_ = os.Remove(stalePath)
				return acquireLibraryLock(root)
			}
		}
	}

	return nil, newError(ErrLibraryLocked, "资源库正在被另一个进程使用", map[string]any{"path": filepath.Dir(path)})
}

func (l *libraryLock) Release() error {
	if l == nil || l.path == "" {
		return nil
	}
	err := os.Remove(l.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func processOwnsLock(record lockRecord) bool {
	process, err := os.FindProcess(record.PID)
	if err != nil {
		return false
	}
	return processMatchesLock(process, record.CreatedAt)
}

func lockDebug(root string) string { return fmt.Sprintf("%s pid=%d", root, os.Getpid()) }
