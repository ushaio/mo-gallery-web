//go:build windows

package local_library

import (
	"golang.org/x/sys/windows"
	"os"
)

func signalProcessZero(process *os.Process) error {
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(process.Pid))
	if err != nil {
		return err
	}
	return windows.CloseHandle(handle)
}
