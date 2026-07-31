package local_library

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAssetHandlerValidatesCacheKeyAndHTTPStreamingSemantics(t *testing.T) {
	manager, root := openTestManager(t)
	path := filepath.Join(root, "range.jpg")
	writeTestJPEG(t, path)
	id := indexTestFile(t, manager, root, "range.jpg")
	snapshot, err := manager.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	source, err := session.store.derivativeSource(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	thumbnailKey := derivativeCacheKey(id, source.ModifiedAtNS, source.ByteSize, derivativeThumbnail)

	for _, requestPath := range []string{
		"/__local-library/thumbnail/" + string(id) + "?session=" + snapshot.SessionID,
		"/__local-library/thumbnail/" + string(id) + "?session=" + snapshot.SessionID + "&v=stale",
	} {
		response := httptest.NewRecorder()
		manager.AssetHandler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, requestPath, nil))
		if response.Code != http.StatusNotFound {
			t.Fatalf("stale/missing key status=%d for %q", response.Code, requestPath)
		}
	}

	thumbnailResponse := httptest.NewRecorder()
	thumbnailRequest := httptest.NewRequest(http.MethodGet, "/__local-library/thumbnail/"+string(id)+"?session="+snapshot.SessionID+"&v="+thumbnailKey, nil)
	manager.AssetHandler().ServeHTTP(thumbnailResponse, thumbnailRequest)
	if thumbnailResponse.Code != http.StatusOK {
		t.Fatalf("thumbnail status=%d body=%q", thumbnailResponse.Code, thumbnailResponse.Body.String())
	}
	if got := thumbnailResponse.Header().Get("Content-Type"); got != "image/jpeg" {
		t.Fatalf("thumbnail content type=%q", got)
	}
	if got := thumbnailResponse.Header().Get("Cache-Control"); got != "private, max-age=31536000, immutable" {
		t.Fatalf("thumbnail cache control=%q", got)
	}

	originalResponse := httptest.NewRecorder()
	originalRequest := httptest.NewRequest(http.MethodGet, "/__local-library/original/"+string(id)+"?session="+snapshot.SessionID, nil)
	originalRequest.Header.Set("Range", "bytes=0-1")
	manager.AssetHandler().ServeHTTP(originalResponse, originalRequest)
	if originalResponse.Code != http.StatusPartialContent {
		t.Fatalf("range status=%d body=%q", originalResponse.Code, originalResponse.Body.String())
	}
	if originalResponse.Body.Len() != 2 {
		t.Fatalf("range bytes=%d, want 2", originalResponse.Body.Len())
	}
	if got := originalResponse.Header().Get("Content-Range"); !strings.HasPrefix(got, "bytes 0-1/") {
		t.Fatalf("content range=%q", got)
	}
	if got := originalResponse.Header().Get("Accept-Ranges"); got != "bytes" {
		t.Fatalf("accept ranges=%q", got)
	}
	if got := originalResponse.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("original cache control=%q", got)
	}

	headResponse := httptest.NewRecorder()
	manager.AssetHandler().ServeHTTP(headResponse, httptest.NewRequest(http.MethodHead, "/__local-library/original/"+string(id)+"?session="+snapshot.SessionID, nil))
	if headResponse.Code != http.StatusOK || headResponse.Body.Len() != 0 {
		t.Fatalf("HEAD status=%d body bytes=%d", headResponse.Code, headResponse.Body.Len())
	}

	methodResponse := httptest.NewRecorder()
	manager.AssetHandler().ServeHTTP(methodResponse, httptest.NewRequest(http.MethodPost, "/__local-library/original/"+string(id)+"?session="+snapshot.SessionID, nil))
	if methodResponse.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST status=%d", methodResponse.Code)
	}
}

func TestAssetHandlerRejectsTraversalInternalPathsAndSymlinkEscape(t *testing.T) {
	manager, root := openTestManager(t)
	path := filepath.Join(root, "safe.jpg")
	writeTestJPEG(t, path)
	id := indexTestFile(t, manager, root, "safe.jpg")
	snapshot, err := manager.Snapshot()
	if err != nil {
		t.Fatal(err)
	}

	traversalResponse := httptest.NewRecorder()
	manager.AssetHandler().ServeHTTP(traversalResponse, httptest.NewRequest(http.MethodGet, "/__local-library/original/"+string(id)+"/../library.db?session="+snapshot.SessionID, nil))
	if traversalResponse.Code != http.StatusNotFound {
		t.Fatalf("traversal status=%d", traversalResponse.Code)
	}

	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := session.store.db.Exec(`UPDATE assets SET relative_path='.mo-gallery/library.db' WHERE id=?`, id); err != nil {
		t.Fatal(err)
	}
	internalResponse := httptest.NewRecorder()
	manager.AssetHandler().ServeHTTP(internalResponse, httptest.NewRequest(http.MethodGet, "/__local-library/original/"+string(id)+"?session="+snapshot.SessionID, nil))
	if internalResponse.Code != http.StatusNotFound {
		t.Fatalf("internal path status=%d", internalResponse.Code)
	}
	if _, err := session.store.db.Exec(`UPDATE assets SET relative_path='safe.jpg' WHERE id=?`, id); err != nil {
		t.Fatal(err)
	}

	outside := filepath.Join(t.TempDir(), "outside.jpg")
	writeTestJPEG(t, outside)
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, path); err != nil {
		t.Skipf("symlink creation unavailable: %v", err)
	}
	linkResponse := httptest.NewRecorder()
	manager.AssetHandler().ServeHTTP(linkResponse, httptest.NewRequest(http.MethodGet, "/__local-library/original/"+string(id)+"?session="+snapshot.SessionID, nil))
	if linkResponse.Code != http.StatusNotFound {
		t.Fatalf("symlink escape status=%d", linkResponse.Code)
	}
}

func TestAssetHandlerInvalidatesOldSessionAfterLibrarySwitch(t *testing.T) {
	manager, firstRoot := openTestManager(t)
	path := filepath.Join(firstRoot, "first.jpg")
	writeTestJPEG(t, path)
	id := indexTestFile(t, manager, firstRoot, "first.jpg")
	firstSnapshot, err := manager.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	oldURL := "/__local-library/original/" + string(id) + "?session=" + firstSnapshot.SessionID

	secondRoot := t.TempDir()
	if _, err := manager.Create(secondRoot, "Second Library", true); err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	manager.AssetHandler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, oldURL, nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("old session status=%d", response.Code)
	}
}
