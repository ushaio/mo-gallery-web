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

type libraryLock struct {
	path string
	file *os.File
}

type lockRecord struct {
	PID       int       `json:"pid"`
	CreatedAt time.Time `json:"createdAt"`
}

var errLibraryLockBusy = errors.New("library lock is busy")

func acquireLibraryLock(root string) (*libraryLock, error) {
	path := internalPath(root, "lock")
	payload, _ := json.Marshal(lockRecord{PID: os.Getpid(), CreatedAt: time.Now().UTC()})
	file, err := tryAcquireLibraryLock(path, payload)
	if err == nil {
		return &libraryLock{path: path, file: file}, nil
	}
	if !errors.Is(err, os.ErrExist) && !errors.Is(err, errLibraryLockBusy) {
		return nil, err
	}
	data, readErr := os.ReadFile(path)
	if readErr == nil && !errors.Is(err, errLibraryLockBusy) {
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

	details := map[string]any{"path": filepath.Dir(path)}
	if readErr == nil {
		var record lockRecord
		if json.Unmarshal(data, &record) == nil && record.PID > 0 {
			details["ownerPid"] = record.PID
			details["ownerCreatedAt"] = record.CreatedAt
		}
	}
	return nil, newError(ErrLibraryLocked, "资源库正在被另一个 MO Gallery 进程使用。请关闭该实例后重试。", details)
}

func (l *libraryLock) Release() error {
	if l == nil || l.path == "" {
		return nil
	}
	closeErr := error(nil)
	if l.file != nil {
		closeErr = l.file.Close()
		l.file = nil
	}
	err := os.Remove(l.path)
	if errors.Is(err, os.ErrNotExist) {
		err = nil
	}
	if closeErr != nil {
		return closeErr
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
