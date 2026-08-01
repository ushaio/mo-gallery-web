//go:build windows

package local_library

import (
	"os"
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
	return !startedAt.After(lockCreatedAt.Add(time.Second))
}
