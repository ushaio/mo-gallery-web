package local_library

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestWaitForStableFileWaitsForSizeAndMtimeToStopChanging(t *testing.T) {
	path := filepath.Join(t.TempDir(), "growing.jpg")
	if err := os.WriteFile(path, []byte("first"), 0o600); err != nil {
		t.Fatal(err)
	}

	writeDone := make(chan error, 1)
	go func() {
		time.Sleep(30 * time.Millisecond)
		writeDone <- os.WriteFile(path, []byte("second-write-is-larger"), 0o600)
	}()

	started := time.Now()
	info, err := waitForStableFile(context.Background(), path, 50*time.Millisecond, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if err := <-writeDone; err != nil {
		t.Fatal(err)
	}
	if info.Size() != int64(len("second-write-is-larger")) {
		t.Fatalf("stable size=%d", info.Size())
	}
	if elapsed := time.Since(started); elapsed < 90*time.Millisecond {
		t.Fatalf("returned before a complete stable interval: %s", elapsed)
	}
}

func TestWaitForStableFileStopsWhenContextIsCancelled(t *testing.T) {
	path := filepath.Join(t.TempDir(), "photo.jpg")
	if err := os.WriteFile(path, []byte("content"), 0o600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := waitForStableFile(ctx, path, time.Second, 2*time.Second)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error=%v, want context.Canceled", err)
	}
}

func TestReconcilePathCreatesAndOverwritesSameAssetWithoutLosingMetadata(t *testing.T) {
	manager, root := openTestManager(t)
	relative := "2026/photo.jpg"
	path := filepath.Join(root, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	session.ignoreWatcherPath(path, time.Minute)
	writeTestJPEG(t, path)

	id, missing, err := manager.ReconcilePath(relative, reconcileSourceWatcher, "create-operation")
	if err != nil {
		t.Fatal(err)
	}
	if id == "" || missing {
		t.Fatalf("id=%q missing=%v", id, missing)
	}
	if err := manager.UpdateAsset(id, "Retained title", "Retained notes", 5, "green", true); err != nil {
		t.Fatal(err)
	}

	originalInfo, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write([]byte("technical-change")); err != nil {
		_ = file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	changedTime := originalInfo.ModTime().Add(2 * time.Second)
	if err := os.Chtimes(path, changedTime, changedTime); err != nil {
		t.Fatal(err)
	}

	overwrittenID, missing, err := manager.ReconcilePath(relative, reconcileSourceWatcher, "overwrite-operation")
	if err != nil {
		t.Fatal(err)
	}
	if overwrittenID != id || missing {
		t.Fatalf("overwritten id=%q original=%q missing=%v", overwrittenID, id, missing)
	}
	page, err := manager.ListAssets(AssetQuery{Availability: "active", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 {
		t.Fatalf("active items=%d", len(page.Items))
	}
	asset := page.Items[0]
	if asset.ID != id || asset.DisplayTitle != "Retained title" || asset.Notes != "Retained notes" || asset.Rating != 5 || asset.ColorLabel != "green" || !asset.IsFavorite {
		t.Fatalf("asset metadata changed after overwrite: %+v", asset)
	}
	if asset.ByteSize <= originalInfo.Size() || asset.ModifiedAtNS != changedTime.UnixNano() {
		t.Fatalf("technical fields were not refreshed: size=%d mtime=%d", asset.ByteSize, asset.ModifiedAtNS)
	}
}

func TestReconcilePathMarksOnlyDeletedPathMissing(t *testing.T) {
	manager, root := openTestManager(t)
	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	for _, relative := range []string{"one.jpg", "two.jpg"} {
		path := filepath.Join(root, relative)
		session.ignoreWatcherPath(path, time.Minute)
		writeTestJPEG(t, path)
		if _, _, err := manager.ReconcilePath(relative, reconcileSourceWatcher, "create-"+relative); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Remove(filepath.Join(root, "one.jpg")); err != nil {
		t.Fatal(err)
	}
	id, missing, err := manager.ReconcilePath("one.jpg", reconcileSourceWatcher, "delete-one")
	if err != nil {
		t.Fatal(err)
	}
	if id == "" || !missing {
		t.Fatalf("id=%q missing=%v", id, missing)
	}
	active, err := manager.ListAssets(AssetQuery{Availability: "active", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	missingPage, err := manager.ListAssets(AssetQuery{Availability: "missing", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(active.Items) != 1 || active.Items[0].RelativePath != "two.jpg" {
		t.Fatalf("active assets=%+v", active.Items)
	}
	if len(missingPage.Items) != 1 || missingPage.Items[0].RelativePath != "one.jpg" {
		t.Fatalf("missing assets=%+v", missingPage.Items)
	}
}

func TestImportFilesMovesUsingConfiguredMode(t *testing.T) {
	manager, _ := openTestManager(t)
	if _, err := manager.SetImportMode(ImportModeMove); err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(t.TempDir(), "imported.jpg")
	writeTestJPEG(t, source)

	results, err := manager.ImportFiles([]string{source}, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Status != "imported" || results[0].AssetID == "" || results[0].Destination != "imported.jpg" {
		t.Fatalf("import results=%+v", results)
	}
	if _, err := os.Stat(source); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("source should have moved into the library: %v", err)
	}
	page, err := manager.ListAssets(AssetQuery{Availability: "active", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != results[0].AssetID || page.Items[0].RelativePath != "imported.jpg" {
		t.Fatalf("imported assets=%+v", page.Items)
	}
}

func TestImportFilesRequiresConfiguredMode(t *testing.T) {
	manager, _ := openTestManager(t)
	source := filepath.Join(t.TempDir(), "not-imported.jpg")
	writeTestJPEG(t, source)

	_, err := manager.ImportFiles([]string{source}, "")
	var appErr *AppError
	if !errors.As(err, &appErr) || appErr.Code != ErrImportModeNotConfigured {
		t.Fatalf("expected import mode error, got %v", err)
	}
	if _, err := os.Stat(source); err != nil {
		t.Fatalf("cancelled/unconfigured import must preserve source: %v", err)
	}
}

func TestImportFilesCopiesUsingConfiguredMode(t *testing.T) {
	manager, root := openTestManager(t)
	if _, err := manager.SetImportMode(ImportModeCopy); err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(t.TempDir(), "copied.jpg")
	writeTestJPEG(t, source)

	results, err := manager.ImportFiles([]string{source}, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Status != "imported" {
		t.Fatalf("import results=%+v", results)
	}
	if _, err := os.Stat(source); err != nil {
		t.Fatalf("copy import must preserve source: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "copied.jpg")); err != nil {
		t.Fatalf("copy import must create managed file: %v", err)
	}
}

func TestWatcherReconcilesFileCreateAndDeleteWithoutManualScan(t *testing.T) {
	manager, root := openTestManager(t)
	path := filepath.Join(root, "watched.jpg")
	writeTestJPEG(t, path)

	waitForAssetCounts(t, manager, 1, 0)
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	waitForAssetCounts(t, manager, 0, 1)
}

func waitForAssetCounts(t *testing.T, manager *Manager, active, missing int64) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		snapshot, err := manager.Snapshot()
		if err == nil && snapshot.AssetCount == active && snapshot.MissingCount == missing {
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	snapshot, err := manager.Snapshot()
	t.Fatalf("counts active=%d missing=%d, want active=%d missing=%d err=%v", snapshot.AssetCount, snapshot.MissingCount, active, missing, err)
}
