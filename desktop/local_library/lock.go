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
		if json.Unmarshal(data, &record) == nil && record.PID > 0 && !processExists(record.PID) {
			stale := path + ".stale-" + strconv.FormatInt(time.Now().UnixMilli(), 10)
			if renameErr := os.Rename(path, stale); renameErr == nil {
				_ = os.Remove(stale)
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

func processExists(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	if err := signalProcessZero(process); err != nil {
		return false
	}
	return true
}

func lockDebug(root string) string { return fmt.Sprintf("%s pid=%d", root, os.Getpid()) }
