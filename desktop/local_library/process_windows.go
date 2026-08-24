//go:build windows

package local_library

import (
	"os"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/sys/windows"
)

func processMatchesLock(process *os.Process, lockCreatedAt time.Time) bool {
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(process.Pid))
	if err != nil {
		return false
	}
	defer windows.CloseHandle(handle)

	var creationTime windows.Filetime
	var exitTime windows.Filetime
	var kernelTime windows.Filetime
	var userTime windows.Filetime
	if err := windows.GetProcessTimes(handle, &creationTime, &exitTime, &kernelTime, &userTime); err != nil {
		return false
	}

	startedAt := time.Unix(0, creationTime.Nanoseconds()).UTC()
	// The process that created the marker must have started before the marker.
	// PIDs are reused on Windows, so checking only whether a PID exists can
	// mistake an unrelated newer process for the lock owner.
	if startedAt.After(lockCreatedAt.Add(time.Second)) {
		return false
	}

	// A reused PID can still belong to an unrelated long-running process. The
	// lock is only considered owned when that process is the same executable as
	// this MO Gallery instance.
	currentPath, currentErr := os.Executable()
	if currentErr != nil {
		return false
	}
	currentPath, currentErr = filepath.Abs(currentPath)
	if currentErr != nil {
		return false
	}
	ownerPath, ownerErr := processImagePath(handle)
	if ownerErr != nil {
		return false
	}
	return strings.EqualFold(filepath.Clean(currentPath), filepath.Clean(ownerPath))
}

func processImagePath(handle windows.Handle) (string, error) {
	buffer := make([]uint16, 32*1024)
	size := uint32(len(buffer))
	if err := windows.QueryFullProcessImageName(handle, 0, &buffer[0], &size); err != nil {
		return "", err
	}
	return windows.UTF16ToString(buffer[:size]), nil
}
