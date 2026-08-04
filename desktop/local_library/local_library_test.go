package local_library

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNormalizeRelativeRejectsTraversalAndInternalDirectory(t *testing.T) {
	bad := []string{"../photo.jpg", "a/../photo.jpg", "C:/photo.jpg", ".mo-gallery/library.db", "a/CON.jpg", "a/trailing. /x"}
	for _, value := range bad {
		if _, _, err := normalizeRelative(value); err == nil {
			t.Fatalf("normalizeRelative(%q) accepted invalid path", value)
		}
	}
	rel, key, err := normalizeRelative(`2025\Trip\Photo.JPG`)
	if err != nil {
		t.Fatal(err)
	}
	if rel != "2025/Trip/Photo.JPG" {
		t.Fatalf("relative=%q", rel)
	}
	if key == "" {
		t.Fatal("path key is empty")
	}
}

func TestNestedLibraryDetection(t *testing.T) {
	root := t.TempDir()
	if err := prepareLibraryStructure(root); err != nil {
		t.Fatal(err)
	}
	if _, err := createManifest(root, "root"); err != nil {
		t.Fatal(err)
	}
	child := filepath.Join(root, "child")
	if err := os.MkdirAll(child, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := checkNoNestedLibrary(child); err == nil {
		t.Fatal("expected parent library to reject nested child")
	}
}

func TestCreateRejectsNonEmptyDirectory(t *testing.T) {
	root := t.TempDir()
	original := filepath.Join(root, "existing.jpg")
	writeTestJPEG(t, original)
	manager := NewManager(t.TempDir(), nil)

	_, err := manager.Create(root, "Existing Photos", false)
	if err == nil {
		t.Fatal("expected non-empty directory to require initialization")
	}
	var appErr *AppError
	if !errors.As(err, &appErr) {
		t.Fatalf("expected AppError, got %T: %v", err, err)
	}
	if appErr.Code != ErrInvalidLibrary {
		t.Fatalf("code=%q, want %q", appErr.Code, ErrInvalidLibrary)
	}
	if _, statErr := os.Stat(original); statErr != nil {
		t.Fatalf("existing file changed: %v", statErr)
	}
	if _, statErr := os.Stat(internalPath(root)); !os.IsNotExist(statErr) {
		t.Fatalf("internal directory should not be created, stat error=%v", statErr)
	}
}

func TestInitializeNonEmptyDirectoryPreservesExistingFiles(t *testing.T) {
	root := t.TempDir()
	original := filepath.Join(root, "existing.jpg")
	writeTestJPEG(t, original)
	manager := NewManager(t.TempDir(), nil)

	if _, err := manager.Create(root, "Existing Photos", true); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = manager.Close() })
	if _, err := os.Stat(original); err != nil {
		t.Fatalf("initialization moved or deleted existing file: %v", err)
	}
	if _, err := os.Stat(internalPath(root, manifestFileName)); err != nil {
		t.Fatalf("manifest missing after initialization: %v", err)
	}
}

func TestCopyThenRemoveClosesSourceBeforeDeleting(t *testing.T) {
	directory := t.TempDir()
	source := filepath.Join(directory, "source.jpg")
	destination := filepath.Join(directory, "destination.jpg")
	content := []byte("cross-volume-copy")
	if err := os.WriteFile(source, content, 0o600); err != nil {
		t.Fatal(err)
	}

	if err := copyThenRemove(source, destination); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(source); !os.IsNotExist(err) {
		t.Fatalf("source should be removed, stat error=%v", err)
	}
	copied, err := os.ReadFile(destination)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(copied, content) {
		t.Fatalf("destination content=%q, want %q", copied, content)
	}
	temporaryFiles, err := filepath.Glob(destination + ".tmp-*")
	if err != nil {
		t.Fatal(err)
	}
	if len(temporaryFiles) != 0 {
		t.Fatalf("temporary files were not cleaned up: %v", temporaryFiles)
	}
}

func TestWatcherIgnorePathExpiresAndMatchesCopyTempFile(t *testing.T) {
	session := &librarySession{ignoredWatcherPaths: make(map[string]time.Time)}
	destination := filepath.Join(t.TempDir(), "photo.jpg")
	session.ignoreWatcherPath(destination, time.Minute)
	if !session.shouldIgnoreWatcherPath(strings.ToUpper(destination)) {
		t.Fatal("expected case-insensitive destination match")
	}
	if !session.shouldIgnoreWatcherPath(destination + ".tmp-copy") {
		t.Fatal("expected cross-volume temporary copy file match")
	}
	if session.shouldIgnoreWatcherPath(filepath.Join(filepath.Dir(destination), "other.jpg")) {
		t.Fatal("unrelated path should not be ignored")
	}

	session.ignoreWatcherPath(destination, -time.Second)
	if session.shouldIgnoreWatcherPath(destination) {
		t.Fatal("expired ignored path should not match")
	}
}

func waitForLibraryState(t *testing.T, manager *Manager, expected string) LibrarySnapshot {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		snapshot, err := manager.Snapshot()
		if err == nil && snapshot.State == expected {
			return snapshot
		}
		time.Sleep(10 * time.Millisecond)
	}
	snapshot, err := manager.Snapshot()
	t.Fatalf("state=%q expected=%q snapshotErr=%v", snapshot.State, expected, err)
	return LibrarySnapshot{}
}

func TestScanSuspendsWithoutMarkingAssetsMissingAndRecovers(t *testing.T) {
	manager, root := openTestManager(t)
	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	_ = manager.PauseScan()
	writeTestJPEG(t, filepath.Join(root, "photo.jpg"))
	assetID := indexTestFile(t, manager, root, "photo.jpg")
	if snapshot, snapshotErr := manager.Snapshot(); snapshotErr != nil || snapshot.AssetCount != 1 {
		t.Fatalf("initial snapshot=%+v err=%v", snapshot, snapshotErr)
	}

	session.mu.Lock()
	session.scan = ScanStatus{State: "paused"}
	session.scanID = "finished-scan"
	session.mu.Unlock()
	manager.recoveryInterval = 100 * time.Millisecond
	manager.startWatch = func(*librarySession) error { return nil }

	var probes int
	manager.probeLibrary = func(_ string, expectedID LibraryID) (libraryProbeStatus, error) {
		probes++
		if probes == 1 {
			return libraryProbeUnavailable, errors.New("volume disconnected")
		}
		return libraryProbeReady, nil
	}

	manager.runScan(context.Background(), session, "finished-scan", "incomplete-token")
	suspended := waitForLibraryState(t, manager, "suspended")
	if suspended.MissingCount != 0 || suspended.AssetCount != 1 {
		t.Fatalf("suspended counts active=%d missing=%d", suspended.AssetCount, suspended.MissingCount)
	}
	_, _, status, err := session.store.assetPath(context.Background(), assetID)
	if err != nil {
		t.Fatal(err)
	}
	if status != "active" {
		t.Fatalf("asset status=%q; disconnected scan must not mark it missing", status)
	}
	if err := manager.StartScan(); err == nil {
		t.Fatal("expected manual scan to be rejected while suspended")
	} else {
		assertAppErrorCode(t, err, ErrLibrarySuspended)
	}

	recovered := waitForLibraryState(t, manager, "open")
	if recovered.MissingCount != 0 {
		t.Fatalf("recovered missing=%d", recovered.MissingCount)
	}
}

func TestLibraryRecoveryRejectsDifferentLibraryIdentity(t *testing.T) {
	manager, _ := openTestManager(t)
	manager.recoveryInterval = 10 * time.Millisecond
	manager.startWatch = func(*librarySession) error { return nil }
	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	manager.probeLibrary = func(_ string, _ LibraryID) (libraryProbeStatus, error) {
		return libraryProbeInvalid, errors.New("different library id")
	}
	manager.handleLibraryProbeFailure(session, libraryProbeUnavailable, errors.New("volume disconnected"))
	repair := waitForLibraryState(t, manager, "repair_required")
	if repair.Scan.State != "failed" {
		t.Fatalf("scan state=%q", repair.Scan.State)
	}
	if _, err := manager.OriginalPath(AssetID(newID())); err == nil {
		t.Fatal("expected media access to be rejected after identity mismatch")
	} else {
		assertAppErrorCode(t, err, ErrInvalidLibrary)
	}
}

func TestManagerCloseWaitsForBackgroundWorkers(t *testing.T) {
	root := t.TempDir()
	manager := NewManager(t.TempDir(), nil)
	manager.startWatch = func(*librarySession) error { return nil }
	if _, err := manager.Create(root, "Test Library", true); err != nil {
		t.Fatal(err)
	}
	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	workerStarted := make(chan struct{})
	releaseWorker := make(chan struct{})
	if !session.startWorker(func() {
		close(workerStarted)
		<-releaseWorker
	}) {
		t.Fatal("expected background worker to start")
	}
	<-workerStarted
	closeFinished := make(chan error, 1)
	go func() { closeFinished <- manager.Close() }()

	select {
	case err := <-closeFinished:
		t.Fatalf("close returned before worker exited: %v", err)
	case <-time.After(20 * time.Millisecond):
	}
	if session.startWorker(func() {}) {
		t.Fatal("closing session accepted a new worker")
	}
	close(releaseWorker)
	select {
	case err := <-closeFinished:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("close did not finish after worker exited")
	}
}

func TestManagerCreateScanAndReopen(t *testing.T) {
	root := t.TempDir()
	config := t.TempDir()
	manager := NewManager(config, nil)
	snapshot, err := manager.Create(root, "Test Library", true)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Name != "Test Library" {
		t.Fatalf("name=%q", snapshot.Name)
	}
	file, err := os.Create(filepath.Join(root, "photo.jpg"))
	if err != nil {
		t.Fatal(err)
	}
	_ = file.Close()
	if err := manager.StartScan(); err != nil {
		t.Fatal(err)
	}
	if err := manager.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.Open(root); err != nil {
		t.Fatal(err)
	}
	defer manager.Close()
	recent, err := manager.RecentLibraries()
	if err != nil {
		t.Fatal(err)
	}
	if len(recent) != 1 {
		t.Fatalf("recent=%d", len(recent))
	}
}

func TestRestoreLastLibraryUnlessManuallyClosed(t *testing.T) {
	root := t.TempDir()
	config := t.TempDir()
	manager := NewManager(config, nil)
	if _, err := manager.Create(root, "Restore Library", true); err != nil {
		t.Fatal(err)
	}
	if err := manager.Close(); err != nil {
		t.Fatal(err)
	}

	restarted := NewManager(config, nil)
	defer restarted.Close()
	snapshot, restored, err := restarted.RestoreLastLibrary()
	if err != nil || !restored || snapshot.Name != "Restore Library" {
		t.Fatalf("restore snapshot=%+v restored=%v err=%v", snapshot, restored, err)
	}
	if err := restarted.CloseManually(); err != nil {
		t.Fatal(err)
	}

	restartedAgain := NewManager(config, nil)
	defer restartedAgain.Close()
	if snapshot, restored, err := restartedAgain.RestoreLastLibrary(); err != nil || restored {
		t.Fatalf("manual close restored snapshot=%+v restored=%v err=%v", snapshot, restored, err)
	}
	if _, err := restartedAgain.Open(root); err != nil {
		t.Fatal(err)
	}
	if err := restartedAgain.Close(); err != nil {
		t.Fatal(err)
	}

	finalRestart := NewManager(config, nil)
	defer finalRestart.Close()
	if snapshot, restored, err := finalRestart.RestoreLastLibrary(); err != nil || !restored || snapshot.Name != "Restore Library" {
		t.Fatalf("reopened restore snapshot=%+v restored=%v err=%v", snapshot, restored, err)
	}
	_ = finalRestart.Close()
}

func writeTestJPEG(t *testing.T, path string) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	imageValue := image.NewRGBA(image.Rect(0, 0, 4, 3))
	for y := 0; y < 3; y++ {
		for x := 0; x < 4; x++ {
			imageValue.Set(x, y, color.RGBA{R: uint8(40 + x*20), G: uint8(60 + y*20), B: 100, A: 255})
		}
	}
	if err := jpeg.Encode(file, imageValue, &jpeg.Options{Quality: 85}); err != nil {
		_ = file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}

func writeTestGIF(t *testing.T, path string) {
	t.Helper()
	palette := color.Palette{color.Black, color.White}
	first := image.NewPaletted(image.Rect(0, 0, 2, 2), palette)
	second := image.NewPaletted(image.Rect(0, 0, 2, 2), palette)
	for index := range second.Pix {
		second.Pix[index] = 1
	}
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := gif.EncodeAll(file, &gif.GIF{Image: []*image.Paletted{first, second}, Delay: []int{5, 5}}); err != nil {
		_ = file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}

func openTestManager(t *testing.T) (*Manager, string) {
	t.Helper()
	root := t.TempDir()
	manager := NewManager(t.TempDir(), nil)
	if _, err := manager.Create(root, "Test Library", true); err != nil {
		t.Fatal(err)
	}
	if err := manager.PauseScan(); err != nil {
		snapshot, snapshotErr := manager.Snapshot()
		if snapshotErr != nil || (snapshot.Scan.State != "completed" && snapshot.Scan.State != "paused") {
			t.Fatalf("pause initial scan: %v snapshot=%+v snapshotErr=%v", err, snapshot, snapshotErr)
		}
	}
	t.Cleanup(func() { _ = manager.Close() })
	return manager, root
}

func waitForScanState(t *testing.T, manager *Manager, expected string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		snapshot, err := manager.Snapshot()
		if err != nil {
			t.Fatal(err)
		}
		if snapshot.Scan.State == expected {
			return
		}
		if snapshot.Scan.State == "failed" {
			t.Fatalf("scan failed: %s", snapshot.Scan.Error)
		}
		time.Sleep(10 * time.Millisecond)
	}
	snapshot, err := manager.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	t.Fatalf("scan state=%q, want %q", snapshot.Scan.State, expected)
}

func indexTestFile(t *testing.T, manager *Manager, root, relative string) AssetID {
	t.Helper()
	path := filepath.Join(root, filepath.FromSlash(relative))
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	normalized, key, err := normalizeRelative(relative)
	if err != nil {
		t.Fatal(err)
	}
	indexed := inspectMedia(path, info)
	indexed.RelativePath = string(normalized)
	indexed.PathKey = key
	indexed.FolderPath = filepath.ToSlash(filepath.Dir(string(normalized)))
	if indexed.FolderPath == "." {
		indexed.FolderPath = ""
	}
	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	id, _, err := session.store.upsertAsset(context.Background(), indexed, newID())
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func TestListAssetsCursorOnlyWhenMoreRowsExist(t *testing.T) {
	manager, root := openTestManager(t)
	for index := 0; index < 3; index++ {
		name := filepath.Join(root, "photo-"+string(rune('a'+index))+".jpg")
		writeTestJPEG(t, name)
		_ = indexTestFile(t, manager, root, filepath.Base(name))
		time.Sleep(time.Millisecond)
	}

	exact, err := manager.ListAssets(AssetQuery{Limit: 3, Sort: "name"})
	if err != nil {
		t.Fatal(err)
	}
	if len(exact.Items) != 3 || exact.NextCursor != "" {
		t.Fatalf("exact page: items=%d next=%q", len(exact.Items), exact.NextCursor)
	}

	first, err := manager.ListAssets(AssetQuery{Limit: 2, Sort: "name"})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Items) != 2 || first.NextCursor == "" {
		t.Fatalf("first page: items=%d next=%q", len(first.Items), first.NextCursor)
	}
	second, err := manager.ListAssets(AssetQuery{Limit: 2, Sort: "name", Cursor: first.NextCursor})
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Items) != 1 || second.NextCursor != "" {
		t.Fatalf("second page: items=%d next=%q", len(second.Items), second.NextCursor)
	}
}

func TestTrashRestoreAndPermanentDelete(t *testing.T) {
	manager, root := openTestManager(t)
	activePath := filepath.Join(root, "active.jpg")
	writeTestJPEG(t, activePath)
	activeID := indexTestFile(t, manager, root, "active.jpg")

	trashResults, err := manager.TrashAssets([]AssetID{activeID})
	if err != nil || len(trashResults) != 1 || trashResults[0].Status != "trashed" {
		t.Fatalf("trash results=%+v err=%v", trashResults, err)
	}
	session, _ := manager.currentSession()
	trashID, original, payload, err := session.store.restoreAsset(context.Background(), activeID)
	if err != nil {
		t.Fatal(err)
	}
	if original != "active.jpg" || !strings.HasPrefix(payload, "trash/"+trashID+"/payload/") {
		t.Fatalf("trash id/path mismatch: id=%q original=%q payload=%q", trashID, original, payload)
	}
	trashPath, _, err := resolveTrashPayload(root, trashID, payload)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(trashPath); err != nil {
		t.Fatalf("trash payload missing: %v", err)
	}
	if err := manager.RestoreAsset(activeID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(activePath); err != nil {
		t.Fatalf("restored file missing: %v", err)
	}

	activeDelete, err := manager.PermanentDeleteAssets([]AssetID{activeID})
	if err != nil || activeDelete[0].Status != "deleted" {
		t.Fatalf("active permanent delete=%+v err=%v", activeDelete, err)
	}
	if _, err := os.Stat(activePath); !os.IsNotExist(err) {
		t.Fatalf("active file still exists: %v", err)
	}
	if _, _, _, err := session.store.assetPath(context.Background(), activeID); err == nil {
		t.Fatal("active asset remained indexed after permanent delete")
	}

	trashedPath := filepath.Join(root, "trashed.jpg")
	writeTestJPEG(t, trashedPath)
	trashedID := indexTestFile(t, manager, root, "trashed.jpg")
	if _, err := manager.TrashAssets([]AssetID{trashedID}); err != nil {
		t.Fatal(err)
	}
	trashID, _, payload, err = session.store.restoreAsset(context.Background(), trashedID)
	if err != nil {
		t.Fatal(err)
	}
	trashPath, trashDir, err := resolveTrashPayload(root, trashID, payload)
	if err != nil {
		t.Fatal(err)
	}
	trashedDelete, err := manager.PermanentDeleteAssets([]AssetID{trashedID})
	if err != nil || trashedDelete[0].Status != "deleted" {
		t.Fatalf("trashed permanent delete=%+v err=%v", trashedDelete, err)
	}
	if _, err := os.Stat(trashPath); !os.IsNotExist(err) {
		t.Fatalf("trash payload still exists: %v", err)
	}
	if _, err := os.Stat(trashDir); !os.IsNotExist(err) {
		t.Fatalf("trash entry directory still exists: %v", err)
	}
}

func TestGIFThumbnailAndPreviewHandler(t *testing.T) {
	manager, root := openTestManager(t)
	gifPath := filepath.Join(root, "animated.gif")
	writeTestGIF(t, gifPath)
	id := indexTestFile(t, manager, root, "animated.gif")
	snapshot, err := manager.Snapshot()
	if err != nil {
		t.Fatal(err)
	}

	thumbnailRequest := httptest.NewRequest(http.MethodGet, withDerivativeVersion(t, manager, "/__local-library/thumbnail/"+string(id)+"?session="+snapshot.SessionID), nil)
	thumbnailResponse := httptest.NewRecorder()
	manager.AssetHandler().ServeHTTP(thumbnailResponse, thumbnailRequest)
	if thumbnailResponse.Code != http.StatusOK || thumbnailResponse.Header().Get("Content-Type") != "image/jpeg" {
		t.Fatalf("thumbnail status=%d content-type=%q body=%q", thumbnailResponse.Code, thumbnailResponse.Header().Get("Content-Type"), thumbnailResponse.Body.String())
	}
	if !bytes.HasPrefix(thumbnailResponse.Body.Bytes(), []byte{0xff, 0xd8}) {
		t.Fatal("thumbnail is not JPEG data")
	}

	previewRequest := httptest.NewRequest(http.MethodGet, withDerivativeVersion(t, manager, "/__local-library/preview/"+string(id)+"?session="+snapshot.SessionID), nil)
	previewResponse := httptest.NewRecorder()
	manager.AssetHandler().ServeHTTP(previewResponse, previewRequest)
	if previewResponse.Code != http.StatusOK || previewResponse.Header().Get("Content-Type") != "image/gif" {
		t.Fatalf("preview status=%d content-type=%q", previewResponse.Code, previewResponse.Header().Get("Content-Type"))
	}
	if !bytes.HasPrefix(previewResponse.Body.Bytes(), []byte("GIF")) {
		t.Fatal("preview is not GIF data")
	}

	staleRequest := httptest.NewRequest(http.MethodGet, "/__local-library/original/"+string(id)+"?session=stale", nil)
	staleResponse := httptest.NewRecorder()
	manager.AssetHandler().ServeHTTP(staleResponse, staleRequest)
	if staleResponse.Code != http.StatusNotFound {
		t.Fatalf("stale session status=%d", staleResponse.Code)
	}
	fakeRequest := httptest.NewRequest(http.MethodGet, "/__local-library/original/not-an-id?session="+snapshot.SessionID, nil)
	fakeResponse := httptest.NewRecorder()
	manager.AssetHandler().ServeHTTP(fakeResponse, fakeRequest)
	if fakeResponse.Code != http.StatusNotFound {
		t.Fatalf("fake id status=%d", fakeResponse.Code)
	}
}

func TestResolveTrashPayloadRejectsTraversalAndMismatchedEntry(t *testing.T) {
	root := t.TempDir()
	trashID := newID()
	bad := []string{
		"../../outside.jpg",
		"trash/" + newID() + "/payload/photo.jpg",
		"trash/" + trashID + "/payload/../photo.jpg",
		"trash/" + trashID + "/payload/subdir/photo.jpg",
	}
	for _, value := range bad {
		if _, _, err := resolveTrashPayload(root, trashID, value); err == nil {
			t.Fatalf("resolveTrashPayload accepted %q", value)
		}
	}
}

func assertAppErrorCode(t *testing.T, err error, code ErrorCode) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected %s error", code)
	}
	var appErr *AppError
	if !errors.As(err, &appErr) {
		t.Fatalf("expected AppError, got %T: %v", err, err)
	}
	if appErr.Code != code {
		t.Fatalf("error code=%q, want %q", appErr.Code, code)
	}
}

func findFolderByRelative(folders []FolderDTO, relative string) (FolderDTO, bool) {
	for _, folder := range folders {
		if folder.RelativePath == relative {
			return folder, true
		}
	}
	return FolderDTO{}, false
}

func TestCreateFolderIndexesEmptyFolderAndValidatesName(t *testing.T) {
	manager, root := openTestManager(t)

	created, err := manager.CreateFolder("", "  2025  ")
	if err != nil {
		t.Fatal(err)
	}
	if created.RelativePath != "2025" || created.Name != "2025" || created.ParentID != nil {
		t.Fatalf("unexpected root folder: %+v", created)
	}
	if info, statErr := os.Stat(filepath.Join(root, "2025")); statErr != nil || !info.IsDir() {
		t.Fatalf("created folder missing: info=%v err=%v", info, statErr)
	}

	child, err := manager.CreateFolder("2025", "Trip")
	if err != nil {
		t.Fatal(err)
	}
	if child.RelativePath != "2025/Trip" || child.ParentID == nil || *child.ParentID != created.ID {
		t.Fatalf("unexpected child folder: %+v", child)
	}
	folders, err := manager.ListFolders()
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := findFolderByRelative(folders, "2025"); !ok {
		t.Fatal("empty root folder was not indexed")
	}
	if _, ok := findFolderByRelative(folders, "2025/Trip"); !ok {
		t.Fatal("empty child folder was not indexed")
	}

	_, err = manager.CreateFolder("", "2025")
	assertAppErrorCode(t, err, ErrPathConflict)
	for _, name := range []string{"", "CON", "bad:name", ".mo-gallery", "trailing."} {
		_, err = manager.CreateFolder("", name)
		assertAppErrorCode(t, err, ErrInvalidPath)
	}
}

func TestScanSynchronizesExternalFolderChanges(t *testing.T) {
	manager, root := openTestManager(t)
	externalEmpty := filepath.Join(root, "External", "Empty")
	if err := os.MkdirAll(externalEmpty, 0o755); err != nil {
		t.Fatal(err)
	}
	writeTestJPEG(t, filepath.Join(root, "External", "photo.jpg"))

	if err := manager.StartScan(); err != nil {
		t.Fatal(err)
	}
	waitForScanState(t, manager, "completed")
	folders, err := manager.ListFolders()
	if err != nil {
		t.Fatal(err)
	}
	if _, found := findFolderByRelative(folders, "External/Empty"); !found {
		t.Fatal("externally created empty folder was not indexed")
	}

	if err := os.RemoveAll(filepath.Join(root, "External")); err != nil {
		t.Fatal(err)
	}
	if err := manager.StartScan(); err != nil {
		t.Fatal(err)
	}
	waitForScanState(t, manager, "completed")
	folders, err = manager.ListFolders()
	if err != nil {
		t.Fatal(err)
	}
	if _, found := findFolderByRelative(folders, "External"); found {
		t.Fatal("externally deleted folder remained in the folder index")
	}

	page, err := manager.ListAssets(AssetQuery{Availability: "missing", Limit: 20})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].RelativePath != "External/photo.jpg" {
		t.Fatalf("missing asset was not retained after external folder deletion: %+v", page.Items)
	}
}

func TestGetFolderPropertiesExcludesInternalDirectory(t *testing.T) {
	manager, root := openTestManager(t)
	if _, err := manager.CreateFolder("", "2025"); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.CreateFolder("2025", "Trip"); err != nil {
		t.Fatal(err)
	}
	writeTestJPEG(t, filepath.Join(root, "2025", "cover.jpg"))
	writeTestJPEG(t, filepath.Join(root, "2025", "Trip", "photo.jpg"))
	if err := os.WriteFile(filepath.Join(root, "2025", "notes.txt"), []byte("notes"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "2025", internalDirName, "nested"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeTestJPEG(t, filepath.Join(root, "2025", internalDirName, "hidden.jpg"))

	properties, err := manager.GetFolderProperties("2025")
	if err != nil {
		t.Fatal(err)
	}
	if properties.IsRoot || properties.Name != "2025" || properties.RelativePath != "2025" {
		t.Fatalf("unexpected properties identity: %+v", properties)
	}
	if properties.PhotoCount != 2 {
		t.Fatalf("photo count=%d, want 2", properties.PhotoCount)
	}
	if properties.ChildCount != 1 {
		t.Fatalf("child count=%d, want 1", properties.ChildCount)
	}
	if properties.ByteSize <= 0 {
		t.Fatalf("byte size=%d, want positive", properties.ByteSize)
	}

	rootProperties, err := manager.GetFolderProperties("")
	if err != nil {
		t.Fatal(err)
	}
	if !rootProperties.IsRoot || rootProperties.Name != "Test Library" {
		t.Fatalf("unexpected root properties: %+v", rootProperties)
	}
	if rootProperties.PhotoCount != 2 {
		t.Fatalf("root photo count=%d, want 2", rootProperties.PhotoCount)
	}
	if rootProperties.ChildCount != 2 {
		t.Fatalf("root child count=%d, want 2", rootProperties.ChildCount)
	}
}

func TestDeleteFolderTrashesAndRestoresWholeDirectoryTree(t *testing.T) {
	manager, root := openTestManager(t)
	if _, err := manager.CreateFolder("", "Parent"); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.CreateFolder("Parent", "Child"); err != nil {
		t.Fatal(err)
	}
	managedPath := filepath.Join(root, "Parent", "Child", "managed.jpg")
	writeTestJPEG(t, managedPath)
	managedID := indexTestFile(t, manager, root, "Parent/Child/managed.jpg")
	otherPath := filepath.Join(root, "Parent", "notes.txt")
	if err := os.WriteFile(otherPath, []byte("notes"), 0o600); err != nil {
		t.Fatal(err)
	}
	hiddenPath := filepath.Join(root, "Parent", ".hidden")
	if err := os.WriteFile(hiddenPath, []byte("hidden"), 0o600); err != nil {
		t.Fatal(err)
	}

	preview, err := manager.PreviewFolderDeletion("Parent")
	if err != nil {
		t.Fatal(err)
	}
	if preview.ManagedAssetCount != 1 || preview.OtherFileCount != 2 || preview.DirectoryCount != 2 {
		t.Fatalf("unexpected preview: %+v", preview)
	}
	if preview.TotalBytes <= 0 {
		t.Fatalf("preview size=%d", preview.TotalBytes)
	}
	if err := manager.DeleteFolder("Parent"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "Parent")); !os.IsNotExist(err) {
		t.Fatalf("source tree still exists: %v", err)
	}
	folders, err := manager.ListFolders()
	if err != nil {
		t.Fatal(err)
	}
	if _, found := findFolderByRelative(folders, "Parent"); found {
		t.Fatal("trashed folder remained in active folder list")
	}
	session, _ := manager.currentSession()
	if _, _, status, err := session.store.assetPath(context.Background(), managedID); err != nil || status != "trashed" {
		t.Fatalf("managed asset status=%q err=%v", status, err)
	}
	entries, err := manager.ListTrashedFolders()
	if err != nil || len(entries) != 1 {
		t.Fatalf("folder trash entries=%+v err=%v", entries, err)
	}
	if entries[0].ManagedAssetCount != 1 || entries[0].OtherFileCount != 2 || entries[0].DirectoryCount != 2 {
		t.Fatalf("unexpected trash entry: %+v", entries[0])
	}
	if err := manager.RestoreAsset(managedID); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{managedPath, otherPath, hiddenPath} {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("restored tree is missing %q: %v", path, err)
		}
	}
	if _, _, status, err := session.store.assetPath(context.Background(), managedID); err != nil || status != "active" {
		t.Fatalf("restored asset status=%q err=%v", status, err)
	}
	folders, err = manager.ListFolders()
	if err != nil {
		t.Fatal(err)
	}
	if _, found := findFolderByRelative(folders, "Parent/Child"); !found {
		t.Fatal("restored child folder missing from active index")
	}
}

func TestRestoreFolderSupportsAlternateParentAndRejectsConflict(t *testing.T) {
	manager, root := openTestManager(t)
	if _, err := manager.CreateFolder("", "Source"); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.CreateFolder("", "Destination"); err != nil {
		t.Fatal(err)
	}
	writeTestJPEG(t, filepath.Join(root, "Source", "photo.jpg"))
	id := indexTestFile(t, manager, root, "Source/photo.jpg")
	if err := manager.DeleteFolder("Source"); err != nil {
		t.Fatal(err)
	}
	entries, err := manager.ListTrashedFolders()
	if err != nil || len(entries) != 1 {
		t.Fatalf("entries=%+v err=%v", entries, err)
	}
	conflict := filepath.Join(root, "Destination", "Restored")
	if err := os.Mkdir(conflict, 0o755); err != nil {
		t.Fatal(err)
	}
	err = manager.RestoreFolder(entries[0].ID, "Destination", "Restored")
	assertAppErrorCode(t, err, ErrPathConflict)
	if err := os.Remove(conflict); err != nil {
		t.Fatal(err)
	}
	if err := manager.RestoreFolder(entries[0].ID, "Destination", "Restored"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "Destination", "Restored", "photo.jpg")); err != nil {
		t.Fatal(err)
	}
	session, _ := manager.currentSession()
	relative, _, status, err := session.store.assetPath(context.Background(), id)
	if err != nil || relative != "Destination/Restored/photo.jpg" || status != "active" {
		t.Fatalf("restored asset relative=%q status=%q err=%v", relative, status, err)
	}
}

func TestPermanentDeleteFolderRemovesWholeTrashEntry(t *testing.T) {
	manager, root := openTestManager(t)
	if _, err := manager.CreateFolder("", "DeleteMe"); err != nil {
		t.Fatal(err)
	}
	writeTestJPEG(t, filepath.Join(root, "DeleteMe", "photo.jpg"))
	id := indexTestFile(t, manager, root, "DeleteMe/photo.jpg")
	if err := os.WriteFile(filepath.Join(root, "DeleteMe", "other.bin"), []byte("other"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := manager.DeleteFolder("DeleteMe"); err != nil {
		t.Fatal(err)
	}
	entries, err := manager.ListTrashedFolders()
	if err != nil || len(entries) != 1 {
		t.Fatalf("entries=%+v err=%v", entries, err)
	}
	session, _ := manager.currentSession()
	record, err := session.store.folderTrashRecord(context.Background(), entries[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	payload, trashDir, err := resolveTrashPayload(root, record.ID, record.PayloadRelativePath)
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.PermanentDeleteFolder(entries[0].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(payload); !os.IsNotExist(err) {
		t.Fatalf("payload still exists: %v", err)
	}
	if _, err := os.Stat(trashDir); !os.IsNotExist(err) {
		t.Fatalf("trash entry directory still exists: %v", err)
	}
	if _, _, _, err := session.store.assetPath(context.Background(), id); err == nil {
		t.Fatal("permanently deleted folder asset remained indexed")
	}
	entries, err = manager.ListTrashedFolders()
	if err != nil || len(entries) != 0 {
		t.Fatalf("trash entries after permanent delete=%+v err=%v", entries, err)
	}
}

func TestMoveFolderRenamesSubtreeAndPreservesIDsAndOrganization(t *testing.T) {
	manager, root := openTestManager(t)
	parent, err := manager.CreateFolder("", "Source")
	if err != nil {
		t.Fatal(err)
	}
	child, err := manager.CreateFolder("Source", "Child")
	if err != nil {
		t.Fatal(err)
	}
	writeTestJPEG(t, filepath.Join(root, "Source", "Child", "photo.jpg"))
	assetID := indexTestFile(t, manager, root, "Source/Child/photo.jpg")
	if err := manager.UpdateAsset(assetID, "Keep title", "Keep notes", 5, "green", true); err != nil {
		t.Fatal(err)
	}
	session, _ := manager.currentSession()
	if _, err := session.store.db.Exec(`INSERT INTO tags(id,name,name_key,color,created_at) VALUES('tag-1','Travel','travel','',1)`); err != nil {
		t.Fatal(err)
	}
	if _, err := session.store.db.Exec(`INSERT INTO asset_tags(asset_id,tag_id) VALUES(?, 'tag-1')`, assetID); err != nil {
		t.Fatal(err)
	}
	if _, err := session.store.db.Exec(`INSERT INTO collections(id,name,notes,position,created_at,updated_at) VALUES('collection-1','Trips','',0,1,1)`); err != nil {
		t.Fatal(err)
	}
	if _, err := session.store.db.Exec(`INSERT INTO collection_assets(collection_id,asset_id,added_at) VALUES('collection-1',?,1)`, assetID); err != nil {
		t.Fatal(err)
	}

	moved, err := manager.MoveFolder("Source", "", "Renamed")
	if err != nil {
		t.Fatal(err)
	}
	if moved.ID != parent.ID || moved.RelativePath != "Renamed" || moved.Name != "Renamed" {
		t.Fatalf("moved folder=%+v original=%+v", moved, parent)
	}
	folders, err := manager.ListFolders()
	if err != nil {
		t.Fatal(err)
	}
	renamedChild, found := findFolderByRelative(folders, "Renamed/Child")
	if !found || renamedChild.ID != child.ID {
		t.Fatalf("renamed child=%+v found=%v original=%+v", renamedChild, found, child)
	}
	if _, err := os.Stat(filepath.Join(root, "Renamed", "Child", "photo.jpg")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "Source")); !os.IsNotExist(err) {
		t.Fatalf("old source still exists: %v", err)
	}
	relative, _, status, err := session.store.assetPath(context.Background(), assetID)
	if err != nil || relative != "Renamed/Child/photo.jpg" || status != "active" {
		t.Fatalf("asset relative=%q status=%q err=%v", relative, status, err)
	}
	var title, notes, color string
	var rating, favorite, tagCount, collectionCount int
	if err := session.store.db.QueryRow(`SELECT display_title,notes,rating,color_label,is_favorite FROM assets WHERE id=?`, assetID).Scan(&title, &notes, &rating, &color, &favorite); err != nil {
		t.Fatal(err)
	}
	if err := session.store.db.QueryRow(`SELECT COUNT(*) FROM asset_tags WHERE asset_id=?`, assetID).Scan(&tagCount); err != nil {
		t.Fatal(err)
	}
	if err := session.store.db.QueryRow(`SELECT COUNT(*) FROM collection_assets WHERE asset_id=?`, assetID).Scan(&collectionCount); err != nil {
		t.Fatal(err)
	}
	if title != "Keep title" || notes != "Keep notes" || rating != 5 || color != "green" || favorite != 1 || tagCount != 1 || collectionCount != 1 {
		t.Fatalf("metadata changed title=%q notes=%q rating=%d color=%q favorite=%d tags=%d collections=%d", title, notes, rating, color, favorite, tagCount, collectionCount)
	}
}

func TestMoveFolderChangesParentAndPreservesDescendantPaths(t *testing.T) {
	manager, root := openTestManager(t)
	if _, err := manager.CreateFolder("", "Source"); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.CreateFolder("Source", "Child"); err != nil {
		t.Fatal(err)
	}
	destination, err := manager.CreateFolder("", "Destination")
	if err != nil {
		t.Fatal(err)
	}
	writeTestJPEG(t, filepath.Join(root, "Source", "Child", "photo.jpg"))
	assetID := indexTestFile(t, manager, root, "Source/Child/photo.jpg")

	moved, err := manager.MoveFolder("Source", "Destination", "Moved")
	if err != nil {
		t.Fatal(err)
	}
	if moved.RelativePath != "Destination/Moved" || moved.ParentID == nil || *moved.ParentID != destination.ID {
		t.Fatalf("moved folder=%+v destination=%+v", moved, destination)
	}
	session, _ := manager.currentSession()
	relative, _, status, err := session.store.assetPath(context.Background(), assetID)
	if err != nil || relative != "Destination/Moved/Child/photo.jpg" || status != "active" {
		t.Fatalf("asset relative=%q status=%q err=%v", relative, status, err)
	}
}

func TestMoveFolderRejectsConflictDescendantAndRoot(t *testing.T) {
	manager, root := openTestManager(t)
	if _, err := manager.CreateFolder("", "Source"); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.CreateFolder("Source", "Child"); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.CreateFolder("", "Destination"); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.CreateFolder("Destination", "Source"); err != nil {
		t.Fatal(err)
	}

	_, err := manager.MoveFolder("Source", "Destination", "Source")
	assertAppErrorCode(t, err, ErrPathConflict)
	if _, err := os.Stat(filepath.Join(root, "Source")); err != nil {
		t.Fatal(err)
	}
	_, err = manager.MoveFolder("Source", "Source/Child", "Nested")
	assertAppErrorCode(t, err, ErrInvalidPath)
	_, err = manager.MoveFolder("", "Destination", "Root")
	assertAppErrorCode(t, err, ErrInvalidPath)
}

func TestRecoverFolderMoveOperationRollsBackDiskMove(t *testing.T) {
	manager, root := openTestManager(t)
	folder, err := manager.CreateFolder("", "Source")
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Close(); err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(root, "Source")
	destination := filepath.Join(root, "Renamed")
	if err := os.Rename(source, destination); err != nil {
		t.Fatal(err)
	}
	operation := newFolderMoveOperation(folder.ID, "Source", "Renamed", "", "Renamed")
	operation.Stage = folderMoveStageDiskMoved
	if _, err := writeFolderMoveOperation(root, operation); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.Open(root); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(source); err != nil {
		t.Fatalf("source was not restored: %v", err)
	}
	if _, err := os.Stat(destination); !os.IsNotExist(err) {
		t.Fatalf("destination still exists: %v", err)
	}
	if _, err := os.Stat(folderMoveOperationPath(root, operation.ID)); !os.IsNotExist(err) {
		t.Fatalf("operation record still exists: %v", err)
	}
}

func TestDeleteFolderRejectsRoot(t *testing.T) {
	manager, _ := openTestManager(t)
	_, err := manager.PreviewFolderDeletion("")
	assertAppErrorCode(t, err, ErrInvalidPath)
	assertAppErrorCode(t, manager.DeleteFolder(""), ErrInvalidPath)
}

func TestRecheckMissingAssetsRestoresSameRecordAndMetadata(t *testing.T) {
	manager, root := openTestManager(t)
	relative := "2025/trip.jpg"
	path := filepath.Join(root, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	writeTestJPEG(t, path)
	id := indexTestFile(t, manager, root, relative)
	if err := manager.UpdateAsset(id, "Trip title", "Keep these notes", 4, "blue", true); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := session.store.markUnseenMissing(context.Background(), newID()); err != nil {
		t.Fatal(err)
	}

	stillMissing, err := manager.RecheckMissingAssets([]AssetID{id})
	if err != nil {
		t.Fatal(err)
	}
	if len(stillMissing) != 1 || stillMissing[0].Status != "still_missing" {
		t.Fatalf("still-missing results=%+v", stillMissing)
	}

	session.ignoreWatcherPath(path, time.Minute)
	writeTestJPEG(t, path)
	restored, err := manager.RecheckMissingAssets([]AssetID{id})
	if err != nil {
		t.Fatal(err)
	}
	if len(restored) != 1 || restored[0].Status != "restored" || restored[0].AssetID != id {
		t.Fatalf("restore results=%+v", restored)
	}
	page, err := manager.ListAssets(AssetQuery{Availability: "active", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 {
		t.Fatalf("active items=%d, want 1", len(page.Items))
	}
	asset := page.Items[0]
	if asset.ID != id {
		t.Fatalf("restored id=%q, want %q", asset.ID, id)
	}
	if asset.DisplayTitle != "Trip title" || asset.Notes != "Keep these notes" || asset.Rating != 4 || asset.ColorLabel != "blue" || !asset.IsFavorite {
		t.Fatalf("restored metadata was not retained: %+v", asset)
	}
}

func TestRemoveMissingAssetsOnlyRemovesStaleIndexAndCaches(t *testing.T) {
	manager, root := openTestManager(t)
	path := filepath.Join(root, "missing.jpg")
	writeTestJPEG(t, path)
	id := indexTestFile(t, manager, root, "missing.jpg")
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := session.store.markUnseenMissing(context.Background(), newID()); err != nil {
		t.Fatal(err)
	}
	thumbnail := internalPath(root, "thumbnails", string(id)+".jpg")
	preview := internalPath(root, "previews", string(id)+".jpg")
	if err := os.WriteFile(thumbnail, []byte("thumbnail"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(preview, []byte("preview"), 0o600); err != nil {
		t.Fatal(err)
	}

	results, err := manager.RemoveMissingAssets([]AssetID{id})
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Status != "removed" {
		t.Fatalf("remove results=%+v", results)
	}
	if _, _, _, err := session.store.assetPath(context.Background(), id); err == nil {
		t.Fatal("missing asset record still exists")
	}
	for _, cachePath := range []string{thumbnail, preview} {
		if _, err := os.Stat(cachePath); !os.IsNotExist(err) {
			t.Fatalf("cache %q still exists, stat error=%v", cachePath, err)
		}
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("remove-missing unexpectedly created or retained source file: %v", err)
	}
}

func TestRemoveMissingAssetsRejectsReturnedAndNonMissingFiles(t *testing.T) {
	manager, root := openTestManager(t)
	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}

	returnedPath := filepath.Join(root, "returned.jpg")
	writeTestJPEG(t, returnedPath)
	returnedID := indexTestFile(t, manager, root, "returned.jpg")
	if err := os.Remove(returnedPath); err != nil {
		t.Fatal(err)
	}
	if _, err := session.store.markUnseenMissing(context.Background(), newID()); err != nil {
		t.Fatal(err)
	}
	session.ignoreWatcherPath(returnedPath, time.Minute)
	writeTestJPEG(t, returnedPath)
	returnedResults, err := manager.RemoveMissingAssets([]AssetID{returnedID})
	if err != nil {
		t.Fatal(err)
	}
	if len(returnedResults) != 1 || returnedResults[0].Status != "failed" || returnedResults[0].Error == "" {
		t.Fatalf("returned-file results=%+v", returnedResults)
	}
	if _, err := os.Stat(returnedPath); err != nil {
		t.Fatalf("returned source file changed: %v", err)
	}
	if _, _, status, err := session.store.assetPath(context.Background(), returnedID); err != nil || status != "missing" {
		t.Fatalf("returned record status=%q err=%v", status, err)
	}

	activePath := filepath.Join(root, "active.jpg")
	writeTestJPEG(t, activePath)
	activeID := indexTestFile(t, manager, root, "active.jpg")
	activeResults, err := manager.RemoveMissingAssets([]AssetID{activeID})
	if err != nil {
		t.Fatal(err)
	}
	if len(activeResults) != 1 || activeResults[0].Status != "failed" {
		t.Fatalf("active results=%+v", activeResults)
	}
	if _, err := os.Stat(activePath); err != nil {
		t.Fatalf("active source file changed: %v", err)
	}

	trashedPath := filepath.Join(root, "trashed.jpg")
	writeTestJPEG(t, trashedPath)
	trashedID := indexTestFile(t, manager, root, "trashed.jpg")
	trashResults, err := manager.TrashAssets([]AssetID{trashedID})
	if err != nil || len(trashResults) != 1 || trashResults[0].Status != "trashed" {
		t.Fatalf("trash results=%+v err=%v", trashResults, err)
	}
	trashedResults, err := manager.RemoveMissingAssets([]AssetID{trashedID})
	if err != nil {
		t.Fatal(err)
	}
	if len(trashedResults) != 1 || trashedResults[0].Status != "failed" {
		t.Fatalf("trashed results=%+v", trashedResults)
	}
	if _, _, status, err := session.store.assetPath(context.Background(), trashedID); err != nil || status != "trashed" {
		t.Fatalf("trashed record status=%q err=%v", status, err)
	}
}

func TestOperationReconcileUsesRunningScanToken(t *testing.T) {
	manager, root := openTestManager(t)
	path := filepath.Join(root, "during-scan.jpg")
	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	session.ignoreWatcherPath(path, time.Minute)
	writeTestJPEG(t, path)
	const scanToken = "test-running-scan-token"
	session.mu.Lock()
	session.scan.State = "running"
	session.scanID = "test-running-scan"
	session.scanToken = scanToken
	session.mu.Unlock()

	id, missing, err := manager.ReconcilePath("during-scan.jpg", reconcileSourceImport, "separate-operation-token")
	if err != nil {
		t.Fatal(err)
	}
	if id == "" || missing {
		t.Fatalf("id=%q missing=%v", id, missing)
	}
	if _, err := session.store.markUnseenMissing(context.Background(), scanToken); err != nil {
		t.Fatal(err)
	}
	_, _, status, err := session.store.assetPath(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	if status != "active" {
		t.Fatalf("operation asset status=%q, want active", status)
	}
}

func TestTagAndCollectionOrganizationLifecycle(t *testing.T) {
	manager, root := openTestManager(t)
	writeTestJPEG(t, filepath.Join(root, "organized.jpg"))
	assetID := indexTestFile(t, manager, root, "organized.jpg")

	tag, err := manager.CreateTag("  Travel  ", "blue")
	if err != nil {
		t.Fatal(err)
	}
	if tag.Name != "Travel" || tag.AssetCount != 0 {
		t.Fatalf("tag=%+v", tag)
	}
	if _, err := manager.CreateTag("travel", ""); err == nil {
		t.Fatal("expected case-insensitive duplicate tag rejection")
	}
	if err := manager.SetAssetTags(assetID, []string{tag.ID, tag.ID}); err != nil {
		t.Fatal(err)
	}

	group, err := manager.CreateCollectionGroup(nil, "Clients")
	if err != nil {
		t.Fatal(err)
	}
	child, err := manager.CreateCollectionGroup(&group.ID, "Acme")
	if err != nil {
		t.Fatal(err)
	}
	collection, err := manager.CreateCollection(&child.ID, "Final selects", "Deliverables")
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.SetAssetCollections(assetID, []string{collection.ID}); err != nil {
		t.Fatal(err)
	}

	page, err := manager.ListAssets(AssetQuery{Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || len(page.Items[0].Tags) != 1 || page.Items[0].Tags[0].ID != tag.ID {
		t.Fatalf("asset tags=%+v", page.Items)
	}
	if len(page.Items[0].Collections) != 1 || page.Items[0].Collections[0].ID != collection.ID {
		t.Fatalf("asset collections=%+v", page.Items[0].Collections)
	}
	for _, query := range []AssetQuery{
		{Limit: 10, Search: "Travel"},
		{Limit: 10, Search: "Final selects"},
		{Limit: 10, TagIDs: []string{tag.ID}},
		{Limit: 10, CollectionIDs: []string{collection.ID}},
	} {
		filtered, err := manager.ListAssets(query)
		if err != nil {
			t.Fatal(err)
		}
		if len(filtered.Items) != 1 || filtered.Items[0].ID != assetID {
			t.Fatalf("query=%+v items=%+v", query, filtered.Items)
		}
	}

	if err := manager.DeleteCollectionGroup(group.ID, false); err == nil {
		t.Fatal("expected non-empty collection group deletion to require confirmation")
	}
	if _, err := manager.UpdateCollectionGroup(group.ID, &child.ID, group.Name, group.Position); err == nil {
		t.Fatal("expected collection group cycle rejection")
	}
	if err := manager.DeleteTag(tag.ID); err != nil {
		t.Fatal(err)
	}
	if err := manager.DeleteCollectionGroup(group.ID, true); err != nil {
		t.Fatal(err)
	}
	var tagRelations, collectionRelations, assets int
	session, _ := manager.currentSession()
	if err := session.store.db.QueryRow(`SELECT COUNT(*) FROM asset_tags WHERE asset_id=?`, assetID).Scan(&tagRelations); err != nil {
		t.Fatal(err)
	}
	if err := session.store.db.QueryRow(`SELECT COUNT(*) FROM collection_assets WHERE asset_id=?`, assetID).Scan(&collectionRelations); err != nil {
		t.Fatal(err)
	}
	if err := session.store.db.QueryRow(`SELECT COUNT(*) FROM assets WHERE id=?`, assetID).Scan(&assets); err != nil {
		t.Fatal(err)
	}
	if tagRelations != 0 || collectionRelations != 0 || assets != 1 {
		t.Fatalf("tagRelations=%d collectionRelations=%d assets=%d", tagRelations, collectionRelations, assets)
	}
}

func TestSetAssetOrganizationIsTransactional(t *testing.T) {
	manager, root := openTestManager(t)
	writeTestJPEG(t, filepath.Join(root, "transaction.jpg"))
	assetID := indexTestFile(t, manager, root, "transaction.jpg")
	tag, err := manager.CreateTag("Keep", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.SetAssetTags(assetID, []string{tag.ID}); err != nil {
		t.Fatal(err)
	}
	if err := manager.SetAssetTags(assetID, []string{"missing-tag"}); err == nil {
		t.Fatal("expected missing tag rejection")
	}
	page, err := manager.ListAssets(AssetQuery{Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || len(page.Items[0].Tags) != 1 || page.Items[0].Tags[0].ID != tag.ID {
		t.Fatalf("failed update changed existing relationship: %+v", page.Items)
	}
}

func TestBatchUpdateAssetOrganizationIsAtomic(t *testing.T) {
	manager, root := openTestManager(t)
	for _, name := range []string{"one.jpg", "two.jpg"} {
		writeTestJPEG(t, filepath.Join(root, name))
	}
	first := indexTestFile(t, manager, root, "one.jpg")
	second := indexTestFile(t, manager, root, "two.jpg")
	tag, err := manager.CreateTag("Batch tag", "blue")
	if err != nil {
		t.Fatal(err)
	}
	collection, err := manager.CreateCollection(nil, "Batch collection", "")
	if err != nil {
		t.Fatal(err)
	}
	rating := 4
	color := "purple"
	favorite := true
	if err := manager.BatchUpdateAssetOrganization(BatchAssetOrganizationUpdate{
		AssetIDs:         []AssetID{first, second, first},
		Rating:           &rating,
		ColorLabel:       &color,
		IsFavorite:       &favorite,
		AddTagIDs:        []string{tag.ID},
		AddCollectionIDs: []string{collection.ID},
	}); err != nil {
		t.Fatal(err)
	}
	page, err := manager.ListAssets(AssetQuery{Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 {
		t.Fatalf("items=%+v", page.Items)
	}
	for _, item := range page.Items {
		if item.Rating != rating || item.ColorLabel != color || !item.IsFavorite || len(item.Tags) != 1 || item.Tags[0].ID != tag.ID || len(item.Collections) != 1 || item.Collections[0].ID != collection.ID {
			t.Fatalf("batch update missing on %+v", item)
		}
	}

	clearColor := ""
	favorite = false
	if err := manager.BatchUpdateAssetOrganization(BatchAssetOrganizationUpdate{
		AssetIDs:            []AssetID{first, second},
		ColorLabel:          &clearColor,
		IsFavorite:          &favorite,
		RemoveTagIDs:        []string{tag.ID},
		RemoveCollectionIDs: []string{collection.ID},
	}); err != nil {
		t.Fatal(err)
	}
	page, err = manager.ListAssets(AssetQuery{Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range page.Items {
		if item.ColorLabel != "" || item.IsFavorite || len(item.Tags) != 0 || len(item.Collections) != 0 {
			t.Fatalf("batch removal missing on %+v", item)
		}
	}

	if err := manager.BatchUpdateAssetOrganization(BatchAssetOrganizationUpdate{
		AssetIDs:  []AssetID{first, AssetID("missing-asset")},
		Rating:    &rating,
		AddTagIDs: []string{tag.ID},
	}); err == nil {
		t.Fatal("expected missing asset to reject the whole batch")
	}
	page, err = manager.ListAssets(AssetQuery{Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range page.Items {
		if len(item.Tags) != 0 {
			t.Fatalf("failed batch changed relationships: %+v", item.Tags)
		}
	}
}

func TestListAssetsStructuredFiltersAndSort(t *testing.T) {
	manager, root := openTestManager(t)
	names := []string{"alpha.jpg", "bravo.jpg", "charlie.jpg"}
	ids := make([]AssetID, 0, len(names))
	for _, name := range names {
		writeTestJPEG(t, filepath.Join(root, name))
		ids = append(ids, indexTestFile(t, manager, root, name))
	}
	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	type metadata struct {
		rating, favorite, width, height, iso          int
		color, format, preview, makeName, model, lens string
		captured, discovered                          int64
		aperture, focal                               float64
	}
	rows := []metadata{
		{5, 1, 4000, 3000, 100, "red", "JPEG", "ready", "Canon", "Alpha", "Prime 35", 1_000, 10_000, 1.8, 35},
		{3, 0, 3000, 4000, 400, "blue", "PNG", "failed", "Nikon", "Beta", "Zoom 85", 2_000, 20_000, 4, 85},
		{1, 1, 2000, 2000, 800, "green", "GIF", "pending", "Sony", "Gamma", "Wide 24", 3_000, 30_000, 8, 24},
	}
	for index, item := range rows {
		if _, err := session.store.db.Exec(`UPDATE assets SET rating=?,color_label=?,is_favorite=?,format=?,preview_status=?,captured_at=?,discovered_at=?,width=?,height=? WHERE id=?`,
			item.rating, item.color, item.favorite, item.format, item.preview, item.captured, item.discovered, item.width, item.height, ids[index]); err != nil {
			t.Fatal(err)
		}
		if _, err := session.store.db.Exec(`INSERT INTO exif_metadata(asset_id,camera_make,camera_model,lens_model,iso,aperture,focal_length_mm) VALUES(?,?,?,?,?,?,?)`,
			ids[index], item.makeName, item.model, item.lens, item.iso, item.aperture, item.focal); err != nil {
			t.Fatal(err)
		}
	}

	assertIDs := func(query AssetQuery, want ...AssetID) {
		t.Helper()
		query.Limit = 20
		page, err := manager.ListAssets(query)
		if err != nil {
			t.Fatal(err)
		}
		if page.Total != int64(len(want)) || len(page.Items) != len(want) {
			t.Fatalf("query=%+v total=%d items=%+v want=%v", query, page.Total, page.Items, want)
		}
		got := make(map[AssetID]bool, len(page.Items))
		for _, item := range page.Items {
			got[item.ID] = true
		}
		for _, id := range want {
			if !got[id] {
				t.Fatalf("query=%+v missing id=%s in %+v", query, id, page.Items)
			}
		}
	}

	minRating, maxRating := 3, 5
	capturedFrom, capturedTo := int64(1_500), int64(2_500)
	discoveredFrom, discoveredTo := int64(15_000), int64(25_000)
	isoMin, isoMax := 200, 500
	apertureMin, apertureMax := 3.5, 4.5
	focalMin, focalMax := 80.0, 90.0
	widthMin, widthMax, heightMin, heightMax := 2500, 3500, 3500, 4500

	assertIDs(AssetQuery{RatingMin: &minRating, RatingMax: &maxRating}, ids[0], ids[1])
	assertIDs(AssetQuery{ColorLabels: []string{"red", "blue"}}, ids[0], ids[1])
	assertIDs(AssetQuery{Formats: []string{"jpeg", "PNG", "jpeg"}}, ids[0], ids[1])
	assertIDs(AssetQuery{PreviewStatuses: []string{"ready", "failed"}}, ids[0], ids[1])
	assertIDs(AssetQuery{CapturedFromMS: &capturedFrom, CapturedToMS: &capturedTo}, ids[1])
	assertIDs(AssetQuery{DiscoveredFromMS: &discoveredFrom, DiscoveredToMS: &discoveredTo}, ids[1])
	assertIDs(AssetQuery{CameraMakes: []string{"CANON", "nikon"}}, ids[0], ids[1])
	assertIDs(AssetQuery{CameraModels: []string{"alpha", "beta"}}, ids[0], ids[1])
	assertIDs(AssetQuery{LensModels: []string{"prime 35", "zoom 85"}}, ids[0], ids[1])
	assertIDs(AssetQuery{ISOMin: &isoMin, ISOMax: &isoMax}, ids[1])
	assertIDs(AssetQuery{ApertureMin: &apertureMin, ApertureMax: &apertureMax}, ids[1])
	assertIDs(AssetQuery{FocalLengthMin: &focalMin, FocalLengthMax: &focalMax}, ids[1])
	assertIDs(AssetQuery{Orientation: "landscape"}, ids[0])
	assertIDs(AssetQuery{Orientation: "portrait"}, ids[1])
	assertIDs(AssetQuery{Orientation: "square"}, ids[2])
	assertIDs(AssetQuery{WidthMin: &widthMin, WidthMax: &widthMax, HeightMin: &heightMin, HeightMax: &heightMax}, ids[1])
	assertIDs(AssetQuery{
		RatingMin: &minRating, ColorLabels: []string{"red", "blue"}, Formats: []string{"jpeg", "png"},
		CameraMakes: []string{"canon", "nikon"}, Orientation: "landscape",
	}, ids[0])

	firstPage, err := manager.ListAssets(AssetQuery{Limit: 2, Sort: "captured", SortDirection: "asc"})
	if err != nil {
		t.Fatal(err)
	}
	if firstPage.Total != 3 || len(firstPage.Items) != 2 || firstPage.Items[0].ID != ids[0] || firstPage.Items[1].ID != ids[1] || firstPage.NextCursor == "" {
		t.Fatalf("unexpected ascending first page: %+v", firstPage)
	}
	secondPage, err := manager.ListAssets(AssetQuery{Limit: 2, Sort: "captured", SortDirection: "asc", Cursor: firstPage.NextCursor})
	if err != nil {
		t.Fatal(err)
	}
	if secondPage.Total != 3 || len(secondPage.Items) != 1 || secondPage.Items[0].ID != ids[2] || secondPage.NextCursor != "" {
		t.Fatalf("unexpected ascending second page: %+v", secondPage)
	}
	descending, err := manager.ListAssets(AssetQuery{Limit: 3, Sort: "captured", SortDirection: "desc"})
	if err != nil {
		t.Fatal(err)
	}
	if len(descending.Items) != 3 || descending.Items[0].ID != ids[2] || descending.Items[2].ID != ids[0] {
		t.Fatalf("unexpected descending order: %+v", descending.Items)
	}
}

func TestListAssetsDirectFolderOnly(t *testing.T) {
	manager, root := openTestManager(t)
	for _, relative := range []string{"root.jpg", "Trips/direct.jpg", "Trips/Child/nested.jpg"} {
		path := filepath.Join(root, filepath.FromSlash(relative))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		writeTestJPEG(t, path)
		indexTestFile(t, manager, root, relative)
	}

	page, err := manager.ListAssets(AssetQuery{Folder: "Trips", DirectFolderOnly: true, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].RelativePath != "Trips/direct.jpg" {
		t.Fatalf("expected only direct folder asset, got %+v", page.Items)
	}

	page, err = manager.ListAssets(AssetQuery{DirectFolderOnly: true, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].RelativePath != "root.jpg" {
		t.Fatalf("expected only root asset, got %+v", page.Items)
	}
}

func TestListAssetsRejectsInvalidStructuredFilters(t *testing.T) {
	manager, _ := openTestManager(t)
	invalidRating := 6
	for _, query := range []AssetQuery{
		{RatingMin: &invalidRating},
		{RatingMax: &invalidRating},
		{Orientation: "diagonal"},
		{SortDirection: "sideways"},
	} {
		if _, err := manager.ListAssets(query); err == nil {
			t.Fatalf("expected query to fail: %+v", query)
		}
	}
}

func TestRenameAssetMovesRealFileAndPreservesAssetData(t *testing.T) {
	manager, root := openTestManager(t)
	if _, err := manager.CreateFolder("", "Photos"); err != nil {
		t.Fatal(err)
	}
	writeTestJPEG(t, filepath.Join(root, "Photos", "before.jpg"))
	assetID := indexTestFile(t, manager, root, "Photos/before.jpg")
	if err := manager.UpdateAsset(assetID, "Keep title", "Keep notes", 5, "green", true); err != nil {
		t.Fatal(err)
	}
	tag, err := manager.CreateTag("Keep tag", "blue")
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.SetAssetTags(assetID, []string{tag.ID}); err != nil {
		t.Fatal(err)
	}
	collection, err := manager.CreateCollection(nil, "Keep collection", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.SetAssetCollections(assetID, []string{collection.ID}); err != nil {
		t.Fatal(err)
	}

	result, err := manager.RenameAsset(assetID, "after.jpeg")
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "moved" || result.Source != "Photos/before.jpg" || result.Destination != "Photos/after.jpeg" {
		t.Fatalf("result=%+v", result)
	}
	if _, err := os.Stat(filepath.Join(root, "Photos", "before.jpg")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("source still exists or stat failed: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "Photos", "after.jpeg")); err != nil {
		t.Fatal(err)
	}
	session, _ := manager.currentSession()
	var relative, fileName, extension, title, notes, color string
	var rating, favorite, tagCount, collectionCount int
	if err := session.store.db.QueryRow(`SELECT relative_path,file_name,extension,display_title,notes,rating,color_label,is_favorite,
		(SELECT COUNT(*) FROM asset_tags WHERE asset_id=assets.id),(SELECT COUNT(*) FROM collection_assets WHERE asset_id=assets.id)
		FROM assets WHERE id=?`, assetID).Scan(&relative, &fileName, &extension, &title, &notes, &rating, &color, &favorite, &tagCount, &collectionCount); err != nil {
		t.Fatal(err)
	}
	if relative != "Photos/after.jpeg" || fileName != "after.jpeg" || extension != ".jpeg" || title != "Keep title" || notes != "Keep notes" || rating != 5 || color != "green" || favorite != 1 || tagCount != 1 || collectionCount != 1 {
		t.Fatalf("asset data changed: relative=%q file=%q ext=%q title=%q notes=%q rating=%d color=%q favorite=%d tags=%d collections=%d", relative, fileName, extension, title, notes, rating, color, favorite, tagCount, collectionCount)
	}
}

func TestMoveAssetsMovesMultipleFilesAndKeepsIDs(t *testing.T) {
	manager, root := openTestManager(t)
	if _, err := manager.CreateFolder("", "Source"); err != nil {
		t.Fatal(err)
	}
	destination, err := manager.CreateFolder("", "Destination")
	if err != nil {
		t.Fatal(err)
	}
	writeTestJPEG(t, filepath.Join(root, "Source", "one.jpg"))
	writeTestJPEG(t, filepath.Join(root, "Source", "two.jpg"))
	one := indexTestFile(t, manager, root, "Source/one.jpg")
	two := indexTestFile(t, manager, root, "Source/two.jpg")

	results, err := manager.MoveAssets([]AssetID{one, two}, "Destination")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 2 || results[0].Status != "moved" || results[1].Status != "moved" {
		t.Fatalf("results=%+v", results)
	}
	session, _ := manager.currentSession()
	for id, expected := range map[AssetID]string{one: "Destination/one.jpg", two: "Destination/two.jpg"} {
		relative, _, status, err := session.store.assetPath(context.Background(), id)
		if err != nil || relative != expected || status != "active" {
			t.Fatalf("id=%s relative=%q status=%q err=%v", id, relative, status, err)
		}
		if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(expected))); err != nil {
			t.Fatal(err)
		}
	}
	var count int
	if err := session.store.db.QueryRow(`SELECT COUNT(*) FROM assets WHERE folder_id=? AND availability='active'`, destination.ID).Scan(&count); err != nil || count != 2 {
		t.Fatalf("destination assets=%d err=%v", count, err)
	}
}

func TestAssetMoveRejectsConflictInvalidNameAndUnavailableAssets(t *testing.T) {
	manager, root := openTestManager(t)
	if _, err := manager.CreateFolder("", "Destination"); err != nil {
		t.Fatal(err)
	}
	writeTestJPEG(t, filepath.Join(root, "source.jpg"))
	writeTestJPEG(t, filepath.Join(root, "Destination", "source.jpg"))
	sourceID := indexTestFile(t, manager, root, "source.jpg")
	_ = indexTestFile(t, manager, root, "Destination/source.jpg")

	results, err := manager.MoveAssets([]AssetID{sourceID}, "Destination")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Status != "failed" {
		t.Fatalf("results=%+v", results)
	}
	if !strings.Contains(results[0].Error, string(ErrPathConflict)) {
		t.Fatalf("expected conflict result, got %+v", results[0])
	}
	if _, err := manager.RenameAsset(sourceID, "../bad.jpg"); err == nil {
		t.Fatal("expected invalid file name")
	} else {
		assertAppErrorCode(t, err, ErrInvalidPath)
	}
	if _, err := manager.RenameAsset(sourceID, "not-media.txt"); err != nil {
		t.Fatalf("expected arbitrary extension rename to succeed: %v", err)
	}
	if _, err := manager.MoveAssets([]AssetID{sourceID}, "Missing folder"); err == nil {
		t.Fatal("expected invalid destination")
	} else {
		assertAppErrorCode(t, err, ErrInvalidPath)
	}

	session, _ := manager.currentSession()
	if _, err := session.store.db.Exec(`UPDATE assets SET availability='missing' WHERE id=?`, sourceID); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.RenameAsset(sourceID, "renamed.jpg"); err == nil {
		t.Fatal("expected missing asset rename to fail")
	}
	if _, err := session.store.db.Exec(`UPDATE assets SET availability='trashed' WHERE id=?`, sourceID); err != nil {
		t.Fatal(err)
	}
	results, err = manager.MoveAssets([]AssetID{sourceID}, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Status != "failed" {
		t.Fatalf("trashed result=%+v", results)
	}
}

func TestAssetMoveRollsBackDiskWhenDatabaseCommitFails(t *testing.T) {
	manager, root := openTestManager(t)
	writeTestJPEG(t, filepath.Join(root, "before.jpg"))
	assetID := indexTestFile(t, manager, root, "before.jpg")
	session, _ := manager.currentSession()
	if err := session.store.db.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.RenameAsset(assetID, "after.jpg"); err == nil {
		t.Fatal("expected database failure")
	}
	if _, err := os.Stat(filepath.Join(root, "before.jpg")); err != nil {
		t.Fatalf("source was not rolled back: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "after.jpg")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("destination remained after rollback: %v", err)
	}
}

func TestRecoverAssetMoveOperationRollsBackDiskMove(t *testing.T) {
	manager, root := openTestManager(t)
	writeTestJPEG(t, filepath.Join(root, "before.jpg"))
	assetID := indexTestFile(t, manager, root, "before.jpg")
	if err := manager.Close(); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(filepath.Join(root, "before.jpg"), filepath.Join(root, "after.jpg")); err != nil {
		t.Fatal(err)
	}
	operation := newAssetMoveOperation(assetID, "before.jpg", "after.jpg")
	operation.Stage = assetMoveStageDiskMoved
	operationPath, err := writeAssetMoveOperation(root, operation)
	if err != nil {
		t.Fatal(err)
	}
	manager.startWatch = func(*librarySession) error { return nil }
	if _, err := manager.Open(root); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "before.jpg")); err != nil {
		t.Fatalf("source was not recovered: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "after.jpg")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("destination remained after recovery: %v", err)
	}
	if _, err := os.Stat(operationPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("operation record remained: %v", err)
	}
}

func TestOriginalPathRequiresActiveExistingFile(t *testing.T) {
	manager, root := openTestManager(t)
	path := filepath.Join(root, "upload.jpg")
	writeTestJPEG(t, path)
	assetID := indexTestFile(t, manager, root, "upload.jpg")

	resolved, err := manager.OriginalPath(assetID)
	if err != nil {
		t.Fatalf("OriginalPath() error = %v", err)
	}
	resolvedInfo, resolvedErr := os.Stat(resolved)
	wantedInfo, wantedErr := os.Stat(path)
	if resolvedErr != nil || wantedErr != nil || !os.SameFile(resolvedInfo, wantedInfo) {
		t.Fatalf("OriginalPath() = %q, want same file as %q", resolved, path)
	}

	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.OriginalPath(assetID); !isAppErrorCode(err, ErrAssetNotFound) {
		t.Fatalf("missing OriginalPath() error = %v", err)
	}
	if _, err := manager.OriginalPath(AssetID("not-an-opaque-id")); !isAppErrorCode(err, ErrAssetNotFound) {
		t.Fatalf("invalid OriginalPath() error = %v", err)
	}
}

func TestWithOriginalPathsBlocksRenameUntilUseCompletes(t *testing.T) {
	manager, root := openTestManager(t)
	path := filepath.Join(root, "upload.jpg")
	writeTestJPEG(t, path)
	assetID := indexTestFile(t, manager, root, "upload.jpg")

	entered := make(chan struct{})
	release := make(chan struct{})
	useDone := make(chan error, 1)
	go func() {
		useDone <- manager.WithOriginalPaths([]AssetID{assetID}, func(paths []string) error {
			if len(paths) != 1 || filepath.Base(paths[0]) != "upload.jpg" {
				return errors.New("unexpected original paths")
			}
			close(entered)
			<-release
			return nil
		})
	}()
	select {
	case <-entered:
	case err := <-useDone:
		t.Fatalf("WithOriginalPaths() returned before entering callback: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("WithOriginalPaths() did not enter callback")
	}

	renameDone := make(chan error, 1)
	go func() {
		_, err := manager.RenameAsset(assetID, "renamed.jpg")
		renameDone <- err
	}()
	select {
	case err := <-renameDone:
		t.Fatalf("RenameAsset() completed while original path was in use: %v", err)
	case <-time.After(100 * time.Millisecond):
	}
	close(release)
	if err := <-useDone; err != nil {
		t.Fatalf("WithOriginalPaths() error = %v", err)
	}
	if err := <-renameDone; err != nil {
		t.Fatalf("RenameAsset() error = %v", err)
	}
}

func isAppErrorCode(err error, code ErrorCode) bool {
	var appErr *AppError
	return errors.As(err, &appErr) && appErr.Code == code
}
