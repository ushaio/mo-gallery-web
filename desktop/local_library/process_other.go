//go:build !windows

package local_library

import (
	"os"
	"syscall"
)

func signalProcessZero(process *os.Process) error { return process.Signal(syscall.Signal(0)) }
