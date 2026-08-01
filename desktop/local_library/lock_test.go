package local_library

import (
	"os"
	"testing"
	"time"
)

func TestAcquireLibraryLockReclaimsOldIncompleteRecord(t *testing.T) {
	root := t.TempDir()
	if err := prepareLibraryStructure(root); err != nil {
		t.Fatal(err)
	}

	path := internalPath(root, "lock")
	if err := os.WriteFile(path, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-10 * time.Second)
	if err := os.Chtimes(path, old, old); err != nil {
		t.Fatal(err)
	}

	lock, err := acquireLibraryLock(root)
	if err != nil {
		t.Fatalf("expected incomplete stale lock to be reclaimed: %v", err)
	}
	if err := lock.Release(); err != nil {
		t.Fatal(err)
	}
}
