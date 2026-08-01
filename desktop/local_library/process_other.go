//go:build !windows

package local_library

import (
	"os"
	"syscall"
	"time"
)

func processMatchesLock(process *os.Process, _ time.Time) bool {
	return process.Signal(syscall.Signal(0)) == nil
}
