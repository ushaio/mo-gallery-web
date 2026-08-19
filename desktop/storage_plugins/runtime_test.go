package storage_plugins

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCleanupTransfersRemovesInterruptedDownload(t *testing.T) {
	destination := filepath.Join(t.TempDir(), "download.bin")
	runtime := &pluginRuntime{
		transfers: make(map[string]transfer),
		closed:    make(chan struct{}),
	}

	handle, err := runtime.registerDownloadTransfer(destination)
	if err != nil {
		t.Fatal(err)
	}
	item := runtime.transfers[handle.ID]
	if _, err := os.Stat(item.temporary); err != nil {
		t.Fatalf("temporary transfer file was not created: %v", err)
	}

	runtime.cleanupTransfers()

	if _, err := os.Stat(item.temporary); !os.IsNotExist(err) {
		t.Fatalf("temporary transfer file still exists: %v", err)
	}
	if _, err := os.Stat(destination); !os.IsNotExist(err) {
		t.Fatalf("destination was changed after interrupted transfer: %v", err)
	}
	if len(runtime.transfers) != 0 {
		t.Fatalf("transfers were not cleared: %#v", runtime.transfers)
	}
}
