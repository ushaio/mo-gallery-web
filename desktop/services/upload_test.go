package services

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
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

func TestPrepareUploadValidatesSupportedFormatsAndSignatures(t *testing.T) {
	service := NewUploadService(nil)
	temp := t.TempDir()

	jpegPath := filepath.Join(temp, "valid.jpg")
	jpegData := []byte{0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9}
	if err := os.WriteFile(jpegPath, jpegData, 0o600); err != nil {
		t.Fatal(err)
	}
	rawPath := filepath.Join(temp, "unsupported.nef")
	if err := os.WriteFile(rawPath, []byte("raw"), 0o600); err != nil {
		t.Fatal(err)
	}
	fakePNGPath := filepath.Join(temp, "fake.png")
	if err := os.WriteFile(fakePNGPath, []byte("not-a-png"), 0o600); err != nil {
		t.Fatal(err)
	}

	prepared, err := service.PrepareUpload([]string{jpegPath, rawPath, fakePNGPath})
	if err != nil {
		t.Fatalf("PrepareUpload() error = %v", err)
	}
	if prepared[0].Error != "" || prepared[0].Hash == "" {
		t.Fatalf("supported JPEG result = %+v", prepared[0])
	}
	if !strings.Contains(prepared[1].Error, "RAW") {
		t.Fatalf("RAW error = %q", prepared[1].Error)
	}
	if !strings.Contains(prepared[2].Error, "不匹配") {
		t.Fatalf("signature error = %q", prepared[2].Error)
	}
}

func TestUploadFileRevalidatesSourceBeforeServerConnection(t *testing.T) {
	service := NewUploadService(nil)
	path := filepath.Join(t.TempDir(), "unsupported.heic")
	if err := os.WriteFile(path, []byte("heic"), 0o600); err != nil {
		t.Fatal(err)
	}
	result, err := service.UploadFile(path, UploadSettings{}, "", nil)
	if err != nil {
		t.Fatalf("UploadFile() error = %v", err)
	}
	if result == nil || !strings.Contains(result.Error, "HEIC/HEIF") {
		t.Fatalf("UploadFile() result = %+v", result)
	}
}

func TestUploadFileReturnsPhotoFromWrappedResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/admin/photos" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer desktop-token" {
			t.Errorf("Authorization = %q", r.Header.Get("Authorization"))
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Fatalf("ParseMultipartForm() error = %v", err)
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			t.Fatalf("FormFile() error = %v", err)
		}
		_ = file.Close()

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"data": map[string]any{
				"id":    "photo-123",
				"title": "Uploaded photo",
				"url":   "/uploads/photo-123.jpg",
			},
		})
	}))
	defer server.Close()

	path := filepath.Join(t.TempDir(), "upload.jpg")
	jpegData := []byte{0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9}
	if err := os.WriteFile(path, jpegData, 0o600); err != nil {
		t.Fatal(err)
	}

	proxy := NewProxyClient()
	proxy.SetServer(server.URL)
	proxy.SetToken("desktop-token")
	service := NewUploadService(proxy)

	result, err := service.UploadFile(path, UploadSettings{}, "", nil)
	if err != nil {
		t.Fatalf("UploadFile() error = %v", err)
	}
	if result == nil || !result.Success || result.Photo == nil || result.Photo.ID != "photo-123" {
		t.Fatalf("UploadFile() result = %+v", result)
	}
}
