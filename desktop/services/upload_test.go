package services

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestUploadAiImageUsesStorageOnlyEndpointAndResolvesRelativeURL(t *testing.T) {
	var receivedFilename string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/admin/editor-ai/upload" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer desktop-token" {
			t.Errorf("Authorization = %q", r.Header.Get("Authorization"))
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			t.Errorf("FormFile() error = %v", err)
			http.Error(w, "missing file", http.StatusBadRequest)
			return
		}
		_ = file.Close()
		receivedFilename = header.Filename
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"data": map[string]string{
				"url": "/uploads/ai-images/generated.png",
				"key": "ai-images/generated.png",
			},
		})
	}))
	defer server.Close()

	imagePath := filepath.Join(t.TempDir(), "generated.png")
	if err := os.WriteFile(imagePath, []byte("image-data"), 0o600); err != nil {
		t.Fatal(err)
	}

	proxy := NewProxyClient()
	proxy.SetServer(server.URL)
	proxy.SetToken("desktop-token")
	service := NewUploadService(proxy)

	result, err := service.UploadAiImage(imagePath)
	if err != nil {
		t.Fatalf("UploadAiImage() error = %v", err)
	}
	if receivedFilename != "generated.png" {
		t.Fatalf("uploaded filename = %q", receivedFilename)
	}
	if result.URL != server.URL+"/uploads/ai-images/generated.png" {
		t.Fatalf("URL = %q", result.URL)
	}
	if result.Key != "ai-images/generated.png" {
		t.Fatalf("Key = %q", result.Key)
	}
}

func TestResolveUploadURLKeepsAbsoluteStorageURL(t *testing.T) {
	const storageURL = "https://cdn.example.com/ai-images/generated.png"
	if result := resolveUploadURL("https://gallery.example.com", storageURL); result != storageURL {
		t.Fatalf("resolveUploadURL() = %q", result)
	}
}
