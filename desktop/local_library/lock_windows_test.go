//go:build windows

package local_library

import (
	"encoding/json"
	"errors"
	"os"
	"testing"
	"time"
)

func TestAcquireLibraryLockReclaimsReusedWindowsPID(t *testing.T) {
	root := t.TempDir()
	if err := prepareLibraryStructure(root); err != nil {
		t.Fatal(err)
	}

	path := internalPath(root, "lock")
	data, err := json.Marshal(lockRecord{PID: os.Getpid(), CreatedAt: time.Unix(0, 0).UTC()})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}

	lock, err := acquireLibraryLock(root)
	if err != nil {
		t.Fatalf("expected stale lock with reused PID to be reclaimed: %v", err)
	}
	if err := lock.Release(); err != nil {
		t.Fatal(err)
	}
}

func TestAcquireLibraryLockKeepsCurrentWindowsOwner(t *testing.T) {
	root := t.TempDir()
	if err := prepareLibraryStructure(root); err != nil {
		t.Fatal(err)
	}

	path := internalPath(root, "lock")
	data, err := json.Marshal(lockRecord{PID: os.Getpid(), CreatedAt: time.Now().UTC()})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}

	_, err = acquireLibraryLock(root)
	var appErr *AppError
	if !errors.As(err, &appErr) || appErr.Code != ErrLibraryLocked {
		t.Fatalf("expected active owner to keep lock, got %v", err)
	}
	if ownerPID, ok := appErr.Details["ownerPid"].(int); !ok || ownerPID != os.Getpid() {
		t.Fatalf("expected lock owner pid %d, got %#v", os.Getpid(), appErr.Details["ownerPid"])
	}
	if _, ok := appErr.Details["ownerCreatedAt"].(time.Time); !ok {
		t.Fatalf("expected lock creation time, got %#v", appErr.Details["ownerCreatedAt"])
	}
}
