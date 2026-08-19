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

func TestAcquireLibraryLockCanBeReacquiredAfterRelease(t *testing.T) {
	root := t.TempDir()
	if err := prepareLibraryStructure(root); err != nil {
		t.Fatal(err)
	}

	first, err := acquireLibraryLock(root)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := acquireLibraryLock(root); err == nil {
		t.Fatal("expected a second owner to be rejected")
	}
	if err := first.Release(); err != nil {
		t.Fatal(err)
	}

	second, err := acquireLibraryLock(root)
	if err != nil {
		t.Fatalf("expected lock to be reacquired after release: %v", err)
	}
	if err := second.Release(); err != nil {
		t.Fatal(err)
	}
}
