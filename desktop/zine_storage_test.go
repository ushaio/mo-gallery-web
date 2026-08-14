package main

import (
	"bytes"
	"testing"
)

func TestDecodeZineAssetDataURL(t *testing.T) {
	mimeType, data, err := decodeZineAssetDataURL("data:image/png;base64,aW1hZ2U=")
	if err != nil {
		t.Fatalf("decodeZineAssetDataURL() error = %v", err)
	}
	if mimeType != "image/png" || !bytes.Equal(data, []byte("image")) {
		t.Fatalf("decoded MIME = %q, data = %q", mimeType, data)
	}
}

func TestDecodeZineAssetDataURLRejectsInvalidInput(t *testing.T) {
	for _, input := range []string{"https://example.com/image.jpg", "data:image/png,image", "data:;base64,aW1hZ2U="} {
		if _, _, err := decodeZineAssetDataURL(input); err == nil {
			t.Fatalf("decodeZineAssetDataURL(%q) unexpectedly succeeded", input)
		}
	}
}
