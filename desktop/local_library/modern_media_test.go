package local_library

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gen2brain/heic"
)

func TestAVIFAndHEICInspectionAndDerivative(t *testing.T) {
	heic.ForceWasmMode = true
	modCache := goModuleCache(t)
	for name, source := range map[string]string{
		"sample.avif": filepath.Join(modCache, "github.com", "gen2brain", "avif@v0.6.0", "testdata", "test8.avif"),
		"sample.heic": filepath.Join(modCache, "github.com", "gen2brain", "heic@v0.7.1", "testdata", "test8.heic"),
	} {
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			target := filepath.Join(root, name)
			data, err := os.ReadFile(source)
			if err != nil {
				t.Skipf("dependency sample unavailable: %v", err)
			}
			if err := os.WriteFile(target, data, 0o600); err != nil {
				t.Fatal(err)
			}
			info, err := os.Stat(target)
			if err != nil {
				t.Fatal(err)
			}
			indexed := inspectMedia(target, info)
			if indexed.PreviewStatus != "pending" || indexed.Width <= 0 || indexed.Height <= 0 {
				t.Fatalf("indexed=%+v", indexed)
			}
			derivative := filepath.Join(root, "preview.jpg")
			if err := renderJPEGDerivative(context.Background(), target, derivative, 512, indexed.Orientation); err != nil {
				t.Fatal(err)
			}
			if _, err := decodeImageConfig(derivative); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func goModuleCache(t *testing.T) string {
	t.Helper()
	output, err := exec.Command("go", "env", "GOMODCACHE").Output()
	if err != nil {
		t.Skipf("cannot locate Go module cache: %v", err)
	}
	return filepath.Clean(string(bytes.TrimSpace(output)))
}

func TestSixRAWFormatsExtractLargestEmbeddedJPEG(t *testing.T) {
	preview := testPreviewJPEG(t, 80, 60)
	thumbnail := testPreviewJPEG(t, 8, 6)
	formats := []string{".cr2", ".cr3", ".nef", ".arw", ".dng", ".raf"}
	for _, ext := range formats {
		t.Run(ext, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "sample"+ext)
			container := append([]byte("RAW-CONTAINER-HEADER"), thumbnail...)
			container = append(container, bytes.Repeat([]byte{0}, 128)...)
			container = append(container, preview...)
			if err := os.WriteFile(path, container, 0o600); err != nil {
				t.Fatal(err)
			}
			extracted, err := extractRAWPreview(path)
			if err != nil {
				t.Fatal(err)
			}
			config, err := jpeg.DecodeConfig(bytes.NewReader(extracted))
			if err != nil {
				t.Fatal(err)
			}
			if config.Width != 80 || config.Height != 60 {
				t.Fatalf("config=%+v", config)
			}
			decoded, err := decodeImage(path)
			if err != nil {
				t.Fatal(err)
			}
			if decoded.Bounds().Dx() != 80 || decoded.Bounds().Dy() != 60 {
				t.Fatalf("bounds=%v", decoded.Bounds())
			}
			info, err := os.Stat(path)
			if err != nil {
				t.Fatal(err)
			}
			indexed := inspectMedia(path, info)
			if indexed.Format != strings.TrimPrefix(ext, ".") || indexed.MimeType == "image/jpeg" || indexed.PreviewStatus != "pending" {
				t.Fatalf("indexed=%+v", indexed)
			}
		})
	}
}

func TestRAWPreviewRejectsInvalidJPEGMarkers(t *testing.T) {
	path := filepath.Join(t.TempDir(), "broken.nef")
	if err := os.WriteFile(path, []byte{0xff, 0xd8, 0xff, 0, 1, 2, 0xff, 0xd9}, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := extractRAWPreview(path); err == nil {
		t.Fatal("expected invalid preview rejection")
	}
}

func testPreviewJPEG(t *testing.T, width, height int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x), G: uint8(y), B: 100, A: 255})
		}
	}
	var buffer bytes.Buffer
	if err := jpeg.Encode(&buffer, img, &jpeg.Options{Quality: 85}); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}
