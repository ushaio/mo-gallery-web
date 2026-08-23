package local_library

import (
	"os"
	"path/filepath"
	"testing"
)

// TestDetectLivePhotoRealSamples exercises the detector against real Live
// Photo / Motion Photo files when the test fixture directory is available on
// the developer's machine. The test is skipped otherwise.
func TestDetectLivePhotoRealSamples(t *testing.T) {
	const sampleDir = `E:\图片\LivePhoto`
	entries, err := os.ReadDir(sampleDir)
	if err != nil {
		t.Skipf("sample directory not available: %v", err)
	}
	count := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		ext := filepath.Ext(entry.Name())
		if ext != ".jpg" && ext != ".jpeg" {
			continue
		}
		path := filepath.Join(sampleDir, entry.Name())
		info, err := os.Stat(path)
		if err != nil {
			t.Logf("stat %s: %v", path, err)
			continue
		}
		desc, ok := detectLivePhoto(path, "jpeg", ext, info.Size())
		if !ok {
			t.Errorf("detectLivePhoto(%s) = false, want true", entry.Name())
			continue
		}
		if desc.VideoOffset <= 0 {
			t.Errorf("%s: video offset = %d, want > 0", entry.Name(), desc.VideoOffset)
		}
		if desc.VideoLength <= 0 {
			t.Errorf("%s: video length = %d, want > 0", entry.Name(), desc.VideoLength)
		}
		if desc.VideoMIME == "" {
			t.Errorf("%s: video mime is empty", entry.Name())
		}
		t.Logf("%s: offset=%d length=%d mime=%s source=%s", entry.Name(), desc.VideoOffset, desc.VideoLength, desc.VideoMIME, desc.Source)
		count++
	}
	if count == 0 {
		t.Skip("no .jpg sample files found")
	}
}
