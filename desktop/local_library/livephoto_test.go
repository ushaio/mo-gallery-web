package local_library

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/jpeg"
	"os"
	"path/filepath"
	"testing"
)

// minimalMotionPhotoJPEG builds a JPEG carrying the Google/Android MotionPhoto
// XMP block, followed by a fake MP4 payload. The XMP directory advertises a
// video/mp4 item whose length matches the trailing bytes, mirroring real
// Motion Photo files produced by Pixel / OPPO / Xiaomi cameras.
func minimalMotionPhotoJPEG(t *testing.T, path string, videoPayload []byte) {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 12, 8))
	var jpegBuf bytes.Buffer
	if err := jpeg.Encode(&jpegBuf, img, &jpeg.Options{Quality: 60}); err != nil {
		t.Fatalf("encode jpeg: %v", err)
	}
	xmp := `<?xpacket begin="\xef\xbb\xbf" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description
      xmlns:GCamera="http://ns.google.com/photos/1.0/camera/"
      xmlns:Container="http://ns.google.com/photos/1.0/container/"
      xmlns:Item="http://ns.google.com/photos/1.0/container/item/"
      GCamera:MotionPhoto="1">
      <Container:Directory>
        <rdf:Seq>
          <rdf:li rdf:parseType="Resource">
            <Container:Item Item:Mime="image/jpeg" Item:Semantic="Primary" Item:Length="0" Item:Padding="0"/>
          </rdf:li>
          <rdf:li rdf:parseType="Resource">
            <Container:Item Item:Mime="video/mp4" Item:Semantic="MotionPhoto" Item:Length="` + itoa(len(videoPayload)) + `" Item:Padding="0"/>
          </rdf:li>
        </rdf:Seq>
      </Container:Directory>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`

	out, err := os.Create(path)
	if err != nil {
		t.Fatalf("create file: %v", err)
	}
	defer out.Close()
	if err := writeJPEGWithXMP(out, jpegBuf.Bytes(), []byte(xmp)); err != nil {
		t.Fatalf("write motion photo jpeg: %v", err)
	}
	if _, err := out.Write(videoPayload); err != nil {
		t.Fatalf("write video payload: %v", err)
	}
}

// writeJPEGWithXMP re-encodes a JPEG payload (the raw SOI..EOI bytes) and
// injects an APP1 XMP segment immediately after the SOI marker so the XMP
// appears before the image data.
func writeJPEGWithXMP(out *os.File, jpegPayload, xmp []byte) error {
	if len(jpegPayload) < 2 || jpegPayload[0] != 0xff || jpegPayload[1] != 0xd8 {
		return errInvalidJPEG
	}
	if _, err := out.Write(jpegPayload[:2]); err != nil {
		return err
	}
	namespace := "http://ns.adobe.com/xap/1.0/\x00"
	payload := append([]byte(namespace), xmp...)
	segment := make([]byte, 2+len(payload))
	binary.BigEndian.PutUint16(segment[:2], uint16(2+len(payload)))
	copy(segment[2:], payload)
	if _, err := out.Write([]byte{0xff, 0xe1}); err != nil {
		return err
	}
	if _, err := out.Write(segment); err != nil {
		return err
	}
	_, err := out.Write(jpegPayload[2:])
	return err
}

var errInvalidJPEG = errString("invalid jpeg payload")

type errString string

func (e errString) Error() string { return string(e) }

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	digits := []byte{}
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}
	return string(digits)
}

func TestDetectLivePhotoMotionPhotoXMP(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "motion.jpg")
	video := bytes.Repeat([]byte{0x00, 0x00, 0x00, 0x20, 'f', 't', 'y', 'p'}, 32)
	minimalMotionPhotoJPEG(t, path, video)
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	desc, ok := detectLivePhoto(path, "jpeg", ".jpg", info.Size())
	if !ok {
		t.Fatalf("expected detectLivePhoto to find embedded video")
	}
	if desc.VideoOffset <= 0 {
		t.Fatalf("expected positive video offset, got %d", desc.VideoOffset)
	}
	expectedLength := int64(len(video))
	if desc.VideoLength != expectedLength {
		t.Fatalf("video length=%d, want %d", desc.VideoLength, expectedLength)
	}
	if desc.VideoMIME != "video/mp4" {
		t.Fatalf("video mime=%q, want video/mp4", desc.VideoMIME)
	}
	if desc.Source != "xmp" {
		t.Fatalf("source=%q, want xmp", desc.Source)
	}
}

func TestDetectLivePhotoFtypFallback(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "plain-motion.jpg")
	img := image.NewRGBA(image.Rect(0, 0, 10, 6))
	var jpegBuf bytes.Buffer
	if err := jpeg.Encode(&jpegBuf, img, &jpeg.Options{Quality: 50}); err != nil {
		t.Fatal(err)
	}
	video := []byte{0x00, 0x00, 0x00, 0x18, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0x00, 0x00, 0x00, 0x10, 'm', 'o', 'o', 'v', 0, 0, 0, 0}
	if err := os.WriteFile(path, append(jpegBuf.Bytes(), video...), 0o644); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	desc, ok := detectLivePhoto(path, "jpeg", ".jpg", info.Size())
	if !ok {
		t.Fatalf("expected detectLivePhoto to find embedded video via ftyp signature")
	}
	if desc.VideoOffset <= 0 {
		t.Fatalf("expected positive video offset, got %d", desc.VideoOffset)
	}
	if desc.VideoMIME != "video/mp4" {
		t.Fatalf("video mime=%q, want video/mp4", desc.VideoMIME)
	}
}

func TestDetectLivePhotoReturnsFalseForPlainJPEG(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "plain.jpg")
	img := image.NewRGBA(image.Rect(0, 0, 8, 8))
	var jpegBuf bytes.Buffer
	if err := jpeg.Encode(&jpegBuf, img, &jpeg.Options{Quality: 50}); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, jpegBuf.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	_, ok := detectLivePhoto(path, "jpeg", ".jpg", info.Size())
	if ok {
		t.Fatalf("expected no live photo for a plain JPEG")
	}
}

func TestExtractLivePhotoVideoWritesBytes(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "motion.jpg")
	video := bytes.Repeat([]byte{0xAB}, 256)
	minimalMotionPhotoJPEG(t, path, video)
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	desc, ok := detectLivePhoto(path, "jpeg", ".jpg", info.Size())
	if !ok {
		t.Fatalf("expected detectLivePhoto to find embedded video")
	}
	destination := filepath.Join(dir, "livephoto", "extracted.mp4")
	if err := extractLivePhotoVideo(path, desc, destination); err != nil {
		t.Fatalf("extractLivePhotoVideo: %v", err)
	}
	extracted, err := os.ReadFile(destination)
	if err != nil {
		t.Fatal(err)
	}
	if len(extracted) != len(video) {
		t.Fatalf("extracted length=%d, want %d", len(extracted), len(video))
	}
	for index := range extracted {
		if extracted[index] != video[index] {
			t.Fatalf("byte mismatch at %d: got %x, want %x", index, extracted[index], video[index])
		}
	}
}

