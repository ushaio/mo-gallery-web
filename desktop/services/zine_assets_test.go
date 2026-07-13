package services

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGetZineImageDataURL(t *testing.T) {
	imageBytes := []byte("zine-image")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer test-token" {
			t.Fatalf("unexpected authorization header: %q", got)
		}
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(imageBytes)
	}))
	defer server.Close()

	proxy := NewProxyClient()
	proxy.SetServer(server.URL)
	proxy.SetToken("test-token")

	dataURL, err := GetZineImageDataURL(context.Background(), proxy, server.URL+"/image.png")
	if err != nil {
		t.Fatalf("GetZineImageDataURL returned error: %v", err)
	}

	const prefix = "data:image/png;base64,"
	if !strings.HasPrefix(dataURL, prefix) {
		t.Fatalf("unexpected data URL prefix: %q", dataURL)
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(dataURL, prefix))
	if err != nil {
		t.Fatalf("decode data URL: %v", err)
	}
	if string(decoded) != string(imageBytes) {
		t.Fatalf("unexpected image payload: %q", decoded)
	}
}

func TestGetZineImageDataURLRejectsNonImage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte("not an image"))
	}))
	defer server.Close()

	if _, err := GetZineImageDataURL(context.Background(), nil, server.URL); err == nil {
		t.Fatal("expected non-image response to be rejected")
	}
}
