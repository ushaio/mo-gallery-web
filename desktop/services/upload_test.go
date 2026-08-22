package services

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	stdimage "image"
	"image/color"
	"image/jpeg"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	desktopimage "mo-gallery-desktop/image"
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

func TestPrepareClipboardUploadPersistsAndCleansUpValidImage(t *testing.T) {
	service := NewUploadService(nil)
	pngData := []byte("\x89PNG\r\n\x1a\nclipboard-image")
	dataURL := "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngData)

	prepared, err := service.PrepareClipboardUpload([]string{"image.png"}, []string{dataURL})
	if err != nil {
		t.Fatalf("PrepareClipboardUpload() error = %v", err)
	}
	if len(prepared) != 1 || prepared[0].Error != "" || prepared[0].Hash == "" {
		t.Fatalf("PrepareClipboardUpload() result = %+v", prepared)
	}
	if prepared[0].FileName != "image.png" {
		t.Fatalf("clipboard filename = %q", prepared[0].FileName)
	}
	tempPath := prepared[0].FilePath
	if _, err := os.Stat(tempPath); err != nil {
		t.Fatalf("clipboard temp file missing: %v", err)
	}

	service.CleanupClipboardUploads()
	if _, err := os.Stat(tempPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("clipboard temp file still exists after cleanup: %v", err)
	}
}

func TestPrepareClipboardUploadRejectsUnsupportedImageType(t *testing.T) {
	service := NewUploadService(nil)
	dataURL := "data:image/gif;base64," + base64.StdEncoding.EncodeToString([]byte("GIF89a"))

	_, err := service.PrepareClipboardUpload([]string{"image.gif"}, []string{dataURL})
	if err == nil || !strings.Contains(err.Error(), "不支持") {
		t.Fatalf("PrepareClipboardUpload() error = %v", err)
	}
	service.CleanupClipboardUploads()
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

func TestUploadFileCompressesLocallyBeforeMultipartUpload(t *testing.T) {
	var receivedFilename string
	var receivedContentType string
	var receivedHeader []byte
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			t.Fatalf("ParseMultipartForm() error = %v", err)
		}
		if got := r.FormValue("compression_mode"); got != "" {
			t.Errorf("compression_mode = %q", got)
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			t.Fatalf("FormFile() error = %v", err)
		}
		defer file.Close()
		receivedFilename = header.Filename
		receivedContentType = header.Header.Get("Content-Type")
		receivedHeader = make([]byte, 12)
		if _, err := io.ReadFull(file, receivedHeader); err != nil {
			t.Fatalf("ReadFull() error = %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"data":    map[string]any{"id": "compressed-photo", "url": "/compressed.avif"},
		})
	}))
	defer server.Close()

	sourcePath := filepath.Join(t.TempDir(), "desktop-source.jpg")
	source := stdimage.NewRGBA(stdimage.Rect(0, 0, 96, 64))
	for y := 0; y < 64; y++ {
		for x := 0; x < 96; x++ {
			source.Set(x, y, color.RGBA{R: uint8(x * 2), G: uint8(y * 3), B: uint8(x + y), A: 255})
		}
	}
	var jpegData bytes.Buffer
	if err := jpeg.Encode(&jpegData, source, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(sourcePath, jpegData.Bytes(), 0o600); err != nil {
		t.Fatal(err)
	}

	proxy := NewProxyClient()
	proxy.SetServer(server.URL)
	proxy.SetToken("desktop-token")
	service := NewUploadService(proxy)
	result, err := service.UploadFile(sourcePath, UploadSettings{CompressEnabled: true}, "", &desktopimage.ExifData{Orientation: 1})
	if err != nil {
		t.Fatalf("UploadFile() error = %v", err)
	}
	if result == nil || !result.Success {
		t.Fatalf("UploadFile() result = %+v", result)
	}
	if receivedFilename != "desktop-source.avif" {
		t.Fatalf("uploaded filename = %q", receivedFilename)
	}
	if receivedContentType != "image/avif" {
		t.Fatalf("uploaded content type = %q", receivedContentType)
	}
	if len(receivedHeader) < 12 || string(receivedHeader[4:8]) != "ftyp" || string(receivedHeader[8:12]) != "avif" {
		t.Fatalf("uploaded AVIF header = %x", receivedHeader)
	}
}

func TestUploadChecksumMatchesTransformedUploadPath(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "source.jpg")
	uploadPath := filepath.Join(dir, "compressed.avif")
	if err := os.WriteFile(sourcePath, []byte("original-bytes"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(uploadPath, []byte("compressed-bytes"), 0o600); err != nil {
		t.Fatal(err)
	}
	sourceHash, err := fileHash(sourcePath)
	if err != nil {
		t.Fatal(err)
	}
	uploadHash, err := fileHash(uploadPath)
	if err != nil {
		t.Fatal(err)
	}

	// Same path reuses the source hash without re-reading the file.
	if got := uploadChecksum(sourceHash, sourcePath, sourcePath); got != sourceHash {
		t.Fatalf("same-path checksum = %q, want %q", got, sourceHash)
	}
	// Transformed path must hash the actual uploaded bytes, not the source.
	if got := uploadChecksum(sourceHash, sourcePath, uploadPath); got != uploadHash {
		t.Fatalf("transformed checksum = %q, want %q", got, uploadHash)
	}
	// Unreadable upload path falls back to the source hash rather than erroring.
	if got := uploadChecksum(sourceHash, sourcePath, filepath.Join(dir, "missing.avif")); got != sourceHash {
		t.Fatalf("fallback checksum = %q, want %q", got, sourceHash)
	}
}

func TestUploadFileCompressesWebPLocallyBeforeMultipartUpload(t *testing.T) {
	var receivedFilename string
	var receivedContentType string
	var receivedHeader []byte
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			t.Fatalf("ParseMultipartForm() error = %v", err)
		}
		if got := r.FormValue("compression_mode"); got != "" {
			t.Errorf("compression_mode = %q", got)
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			t.Fatalf("FormFile() error = %v", err)
		}
		defer file.Close()
		receivedFilename = header.Filename
		receivedContentType = header.Header.Get("Content-Type")
		receivedHeader = make([]byte, 12)
		if _, err := io.ReadFull(file, receivedHeader); err != nil {
			t.Fatalf("ReadFull() error = %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"data":    map[string]any{"id": "webp-photo", "url": "/compressed.webp"},
		})
	}))
	defer server.Close()

	sourcePath := filepath.Join(t.TempDir(), "desktop-source.jpg")
	source := stdimage.NewRGBA(stdimage.Rect(0, 0, 96, 64))
	for y := 0; y < 64; y++ {
		for x := 0; x < 96; x++ {
			source.Set(x, y, color.RGBA{R: uint8(x * 2), G: uint8(y * 3), B: uint8(x + y), A: 255})
		}
	}
	var jpegData bytes.Buffer
	if err := jpeg.Encode(&jpegData, source, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(sourcePath, jpegData.Bytes(), 0o600); err != nil {
		t.Fatal(err)
	}

	proxy := NewProxyClient()
	proxy.SetServer(server.URL)
	proxy.SetToken("desktop-token")
	service := NewUploadService(proxy)
	result, err := service.UploadFile(sourcePath, UploadSettings{
		CompressEnabled:   true,
		CompressionFormat: "webp",
		MaxSizeMB:         3.5,
	}, "", nil)
	if err != nil {
		t.Fatalf("UploadFile() error = %v", err)
	}
	if result == nil || !result.Success || result.Photo == nil || result.Photo.ID != "webp-photo" {
		t.Fatalf("UploadFile() result = %+v", result)
	}
	if receivedFilename != "desktop-source.webp" {
		t.Fatalf("uploaded filename = %q", receivedFilename)
	}
	if receivedContentType != "image/webp" {
		t.Fatalf("uploaded content type = %q", receivedContentType)
	}
	if len(receivedHeader) < 12 || string(receivedHeader[:4]) != "RIFF" || string(receivedHeader[8:12]) != "WEBP" {
		t.Fatalf("uploaded WebP header = %x", receivedHeader)
	}
}
