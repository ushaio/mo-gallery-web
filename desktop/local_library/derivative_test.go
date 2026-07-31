package local_library

import (
	"bytes"
	"container/heap"
	"context"
	"database/sql"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestDerivativeCacheKeyIncludesAssetContentVariantAndVersions(t *testing.T) {
	base := derivativeCacheKey("asset-a", 100, 200, derivativeThumbnail)
	cases := []string{
		derivativeCacheKey("asset-b", 100, 200, derivativeThumbnail),
		derivativeCacheKey("asset-a", 101, 200, derivativeThumbnail),
		derivativeCacheKey("asset-a", 100, 201, derivativeThumbnail),
		derivativeCacheKey("asset-a", 100, 200, derivativePreview),
	}
	for _, candidate := range cases {
		if candidate == base {
			t.Fatalf("cache key collision: %q", candidate)
		}
	}
}

func TestDerivativeQueueOrdersSelectedVisibleBackground(t *testing.T) {
	queue := derivativeQueue{}
	heap.Init(&queue)
	heap.Push(&queue, &derivativeFlight{request: derivativeRequest{priority: derivativePriorityBackground}, index: -1, order: 1})
	heap.Push(&queue, &derivativeFlight{request: derivativeRequest{priority: derivativePrioritySelected}, index: -1, order: 2})
	heap.Push(&queue, &derivativeFlight{request: derivativeRequest{priority: derivativePriorityVisible}, index: -1, order: 3})
	want := []derivativePriority{derivativePrioritySelected, derivativePriorityVisible, derivativePriorityBackground}
	for _, priority := range want {
		flight := heap.Pop(&queue).(*derivativeFlight)
		if flight.request.priority != priority {
			t.Fatalf("priority=%d, want %d", flight.request.priority, priority)
		}
	}
}

func TestDerivativeSchedulerPromotesQueuedFlight(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	session := &librarySession{ctx: ctx, done: make(chan struct{}), state: "open"}
	started := make(chan string, 3)
	releaseFirst := make(chan struct{})
	scheduler := newDerivativeScheduler(session, 1, func(_ context.Context, request derivativeRequest) derivativeResult {
		started <- request.cacheKey
		if request.cacheKey == "blocking" {
			<-releaseFirst
		}
		return derivativeResult{status: "ready"}
	})
	defer func() {
		scheduler.close()
		cancel()
		session.workers.Wait()
	}()

	scheduler.submit(context.Background(), derivativeRequest{cacheKey: "blocking", priority: derivativePrioritySelected}, false)
	if got := <-started; got != "blocking" {
		t.Fatalf("first started=%q", got)
	}
	scheduler.submit(context.Background(), derivativeRequest{cacheKey: "promoted", priority: derivativePriorityBackground}, false)
	scheduler.submit(context.Background(), derivativeRequest{cacheKey: "visible", priority: derivativePriorityVisible}, false)
	scheduler.submit(context.Background(), derivativeRequest{cacheKey: "promoted", priority: derivativePrioritySelected}, false)
	close(releaseFirst)

	if got := <-started; got != "promoted" {
		t.Fatalf("second started=%q, want promoted", got)
	}
	if got := <-started; got != "visible" {
		t.Fatalf("third started=%q, want visible", got)
	}
}

func TestDerivativeSchedulerSingleflightDeduplicatesCacheKey(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	session := &librarySession{ctx: ctx, done: make(chan struct{}), state: "open"}
	var calls atomic.Int32
	release := make(chan struct{})
	scheduler := newDerivativeScheduler(session, 2, func(context.Context, derivativeRequest) derivativeResult {
		calls.Add(1)
		<-release
		return derivativeResult{status: "ready"}
	})
	session.derivatives = scheduler
	defer func() {
		scheduler.close()
		cancel()
		session.workers.Wait()
	}()
	request := derivativeRequest{assetID: "asset-a", variant: derivativePreview, priority: derivativePriorityVisible, cacheKey: "same-key"}
	var wait sync.WaitGroup
	wait.Add(2)
	results := make(chan derivativeResult, 2)
	go func() {
		defer wait.Done()
		results <- scheduler.submit(context.Background(), request, true)
	}()
	deadline := time.Now().Add(time.Second)
	for calls.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	go func() {
		defer wait.Done()
		results <- scheduler.submit(context.Background(), request, true)
	}()
	// Keep the first renderer blocked long enough for the second caller to join
	// the existing flight. A later request after completion is expected to run again.
	time.Sleep(10 * time.Millisecond)
	close(release)
	wait.Wait()
	close(results)
	if calls.Load() != 1 {
		t.Fatalf("renderer calls=%d, want 1", calls.Load())
	}
	for result := range results {
		if result.status != "ready" || result.err != nil {
			t.Fatalf("result=%+v", result)
		}
	}
}

func TestDerivativeHandlerGeneratesVersionedVariantsAndClearsOnlyPreview(t *testing.T) {
	manager, root := openTestManager(t)
	path := filepath.Join(root, "large.jpg")
	writeSizedJPEG(t, path, 2600, 1300)
	id := indexTestFile(t, manager, root, "large.jpg")
	snapshot, err := manager.Snapshot()
	if err != nil {
		t.Fatal(err)
	}

	thumbnailResponse := serveLocalAsset(t, manager, "/__local-library/thumbnail/"+string(id)+"?session="+snapshot.SessionID)
	previewResponse := serveLocalAsset(t, manager, "/__local-library/preview/"+string(id)+"?session="+snapshot.SessionID)
	thumbnailConfig, _, err := image.DecodeConfig(bytes.NewReader(thumbnailResponse))
	if err != nil {
		t.Fatal(err)
	}
	previewConfig, _, err := image.DecodeConfig(bytes.NewReader(previewResponse))
	if err != nil {
		t.Fatal(err)
	}
	if thumbnailConfig.Width != thumbnailMaxDimension || thumbnailConfig.Height != 256 {
		t.Fatalf("thumbnail dimensions=%dx%d", thumbnailConfig.Width, thumbnailConfig.Height)
	}
	if previewConfig.Width != previewMaxDimension || previewConfig.Height != 1024 {
		t.Fatalf("preview dimensions=%dx%d", previewConfig.Width, previewConfig.Height)
	}

	thumbnailPath := firstDerivativeMatch(t, root, id, derivativeThumbnail)
	previewPath := firstDerivativeMatch(t, root, id, derivativePreview)
	if filepath.Base(thumbnailPath) == string(id)+".jpg" || filepath.Base(previewPath) == string(id)+".jpg" {
		t.Fatal("derivative filename is not versioned")
	}

	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	assertDerivativeRow(t, session, id, derivativeThumbnail, thumbnailMaxDimension)
	assertDerivativeRow(t, session, id, derivativePreview, previewMaxDimension)

	if err := manager.ClearPreviewCache(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(previewPath); !os.IsNotExist(err) {
		t.Fatalf("preview cache still exists: %v", err)
	}
	if _, err := os.Stat(thumbnailPath); err != nil {
		t.Fatalf("thumbnail should be retained: %v", err)
	}
	if _, err := session.store.derivativeRecord(context.Background(), id, derivativePreview); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("preview derivative row should be removed, got %v", err)
	}
	assertDerivativeRow(t, session, id, derivativeThumbnail, thumbnailMaxDimension)
}

func TestDerivativeSourceChangeUsesNewKeysAndRemovesStaleFiles(t *testing.T) {
	manager, root := openTestManager(t)
	path := filepath.Join(root, "changed.jpg")
	writeSizedJPEG(t, path, 1200, 600)
	id := indexTestFile(t, manager, root, "changed.jpg")
	snapshot, err := manager.Snapshot()
	if err != nil {
		t.Fatal(err)
	}

	serveLocalAsset(t, manager, "/__local-library/thumbnail/"+string(id)+"?session="+snapshot.SessionID)
	serveLocalAsset(t, manager, "/__local-library/preview/"+string(id)+"?session="+snapshot.SessionID)
	oldThumbnail := firstDerivativeMatch(t, root, id, derivativeThumbnail)
	oldPreview := firstDerivativeMatch(t, root, id, derivativePreview)

	writeSizedJPEG(t, path, 1400, 700)
	changedAt := time.Now().Add(2 * time.Second)
	if err := os.Chtimes(path, changedAt, changedAt); err != nil {
		t.Fatal(err)
	}
	reconciledID, missing, err := manager.ReconcilePath("changed.jpg", reconcileSourceWatcher, newID())
	if err != nil {
		t.Fatal(err)
	}
	if missing || reconciledID != id {
		t.Fatalf("reconciled id=%q missing=%v, want id=%q", reconciledID, missing, id)
	}

	serveLocalAsset(t, manager, "/__local-library/thumbnail/"+string(id)+"?session="+snapshot.SessionID)
	newThumbnail := firstDerivativeMatch(t, root, id, derivativeThumbnail)
	if sameFilePath(oldThumbnail, newThumbnail) {
		t.Fatal("thumbnail cache key did not change after source modification")
	}
	if _, err := os.Stat(oldThumbnail); !os.IsNotExist(err) {
		t.Fatalf("stale thumbnail still exists: %v", err)
	}

	serveLocalAsset(t, manager, "/__local-library/preview/"+string(id)+"?session="+snapshot.SessionID)
	newPreview := firstDerivativeMatch(t, root, id, derivativePreview)
	if sameFilePath(oldPreview, newPreview) {
		t.Fatal("preview cache key did not change after source modification")
	}
	if _, err := os.Stat(oldPreview); !os.IsNotExist(err) {
		t.Fatalf("stale preview still exists: %v", err)
	}
}

func TestRenderJPEGDerivativeCleansTempFileWhenFinalPathCannotBeReplaced(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "source.jpg")
	writeSizedJPEG(t, source, 20, 10)
	destination := filepath.Join(root, "blocked.jpg")
	if err := os.Mkdir(destination, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(destination, "keep"), []byte("occupied"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := renderJPEGDerivative(context.Background(), source, destination, 512, 1); err == nil {
		t.Fatal("expected final-path replacement failure")
	}
	temps, err := filepath.Glob(destination + ".tmp-*")
	if err != nil {
		t.Fatal(err)
	}
	if len(temps) != 0 {
		t.Fatalf("temporary derivative files were not cleaned: %v", temps)
	}
}

func TestRenderJPEGDerivativeAppliesOrientation(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "source.jpg")
	writeSizedJPEG(t, source, 3, 2)
	destination := filepath.Join(root, "rotated.jpg")
	if err := renderJPEGDerivative(context.Background(), source, destination, 512, 6); err != nil {
		t.Fatal(err)
	}
	config, err := decodeImageConfig(destination)
	if err != nil {
		t.Fatal(err)
	}
	if config.Width != 2 || config.Height != 3 {
		t.Fatalf("rotated dimensions=%dx%d, want 2x3", config.Width, config.Height)
	}
}

func writeSizedJPEG(t *testing.T, path string, width, height int) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	value := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			value.Set(x, y, color.RGBA{R: uint8(x % 255), G: uint8(y % 255), B: 80, A: 255})
		}
	}
	if err := jpeg.Encode(file, value, &jpeg.Options{Quality: 80}); err != nil {
		_ = file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}

func serveLocalAsset(t *testing.T, manager *Manager, path string) []byte {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, withDerivativeVersion(t, manager, path), nil)
	response := httptest.NewRecorder()
	manager.AssetHandler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("asset status=%d body=%q", response.Code, response.Body.String())
	}
	return response.Body.Bytes()
}

func withDerivativeVersion(t *testing.T, manager *Manager, requestPath string) string {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, requestPath, nil)
	parts := strings.Split(strings.TrimPrefix(request.URL.Path, "/__local-library/"), "/")
	if len(parts) != 2 || (parts[0] != "thumbnail" && parts[0] != "preview") {
		return requestPath
	}
	variant := derivativeThumbnail
	if parts[0] == "preview" {
		variant = derivativePreview
	}
	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	id := AssetID(parts[1])
	source, err := session.store.derivativeSource(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	query := request.URL.Query()
	query.Set("v", derivativeCacheKey(id, source.ModifiedAtNS, source.ByteSize, variant))
	request.URL.RawQuery = query.Encode()
	return request.URL.String()
}

func assertDerivativeRow(t *testing.T, session *librarySession, id AssetID, variant derivativeVariant, maxDimension int) {
	t.Helper()
	var cacheKey, contentVersion, decoderVersion, status, derivativeError string
	var storedMaxDimension, width, height int
	var byteSize int64
	err := session.store.db.QueryRowContext(context.Background(), `SELECT cache_key,content_version,decoder_version,max_dimension,width,height,byte_size,status,error
		FROM asset_derivatives WHERE asset_id=? AND variant=?`, id, variant).
		Scan(&cacheKey, &contentVersion, &decoderVersion, &storedMaxDimension, &width, &height, &byteSize, &status, &derivativeError)
	if err != nil {
		t.Fatal(err)
	}
	if cacheKey == "" || contentVersion != derivativeContentVersion || decoderVersion != derivativeDecoderVersion {
		t.Fatalf("invalid derivative versions: key=%q content=%q decoder=%q", cacheKey, contentVersion, decoderVersion)
	}
	if storedMaxDimension != maxDimension || width < 1 || height < 1 || width > maxDimension || height > maxDimension || byteSize < 1 {
		t.Fatalf("invalid derivative dimensions/size: max=%d dimensions=%dx%d bytes=%d", storedMaxDimension, width, height, byteSize)
	}
	if status != "ready" || derivativeError != "" {
		t.Fatalf("invalid derivative status=%q error=%q", status, derivativeError)
	}
}
