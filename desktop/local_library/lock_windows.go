//go:build windows

package local_library

import (
	"encoding/json"
	"errors"
	"os"

	"golang.org/x/sys/windows"
)

func tryAcquireLibraryLock(path string, payload []byte) (*os.File, error) {
	file, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, err
	}

	// Lock only the first byte so another process can still read the JSON owner
	// details when reporting a conflict.
	var overlapped windows.Overlapped
	err = windows.LockFileEx(
		windows.Handle(file.Fd()),
		windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY,
		0,
		1,
		0,
		&overlapped,
	)
	if err != nil {
		_ = file.Close()
		return nil, errors.Join(os.ErrExist, errLibraryLockBusy)
	}

	// Keep compatibility with lock markers written by older builds that did
	// not hold an OS-level lock. If that process is still alive, do not take
	// over its marker even though LockFileEx succeeds.
	if data, readErr := os.ReadFile(path); readErr == nil {
		var record lockRecord
		if json.Unmarshal(data, &record) == nil && record.PID > 0 && processOwnsLock(record) {
			_ = file.Close()
			return nil, errors.Join(os.ErrExist, errLibraryLockBusy)
		}
	}

	if err := file.Truncate(0); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return nil, err
	}
	if _, err := file.Seek(0, 0); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return nil, err
	}
	if _, err := file.Write(payload); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return nil, err
	}
	return file, nil
}
