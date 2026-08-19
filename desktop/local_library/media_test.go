package local_library

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/binary"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestDetectMediaHeaderRecognizesCommittedContainers(t *testing.T) {
	tests := []struct {
		name, ext, format, mime string
		header                  []byte
	}{
		{name: "jpeg", ext: ".jpg", format: "jpeg", mime: "image/jpeg", header: []byte{0xff, 0xd8, 0xff, 0xe0}},
		{name: "png", ext: ".png", format: "png", mime: "image/png", header: []byte("\x89PNG\r\n\x1a\n")},
		{name: "gif", ext: ".gif", format: "gif", mime: "image/gif", header: []byte("GIF89a")},
		{name: "webp", ext: ".webp", format: "webp", mime: "image/webp", header: append([]byte("RIFF\x00\x00\x00\x00WEBP"), make([]byte, 8)...)},
		{name: "tiff", ext: ".tiff", format: "tiff", mime: "image/tiff", header: []byte("II\x2a\x00\x08\x00\x00\x00\x00\x00\x00\x00")},
		{name: "cr2", ext: ".cr2", format: "cr2", mime: "image/x-canon-cr2", header: []byte("II\x2a\x00\x10\x00\x00\x00CR\x02\x00")},
		{name: "raf", ext: ".raf", format: "raf", mime: "image/x-fuji-raf", header: []byte("FUJIFILMCCD-RAW ")},
		{name: "rw2", ext: ".rw2", format: "rw2", mime: "image/x-panasonic-rw2", header: []byte("II\x55\x00\x08\x00\x00\x00")},
		{name: "avif", ext: ".avif", format: "avif", mime: "image/avif", header: isoBMFFHeader("avif")},
		{name: "heif", ext: ".heic", format: "heif", mime: "image/heif", header: isoBMFFHeader("heic")},
		{name: "cr3", ext: ".cr3", format: "cr3", mime: "image/x-canon-cr3", header: isoBMFFHeader("crx ")},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			format, mimeType, ok := detectMediaHeader(test.header, test.ext)
			if !ok || format != test.format || mimeType != test.mime {
				t.Fatalf("detectMediaHeader()=(%q,%q,%v), want (%q,%q,true)", format, mimeType, ok, test.format, test.mime)
			}
		})
	}
}

func isoBMFFHeader(brand string) []byte {
	header := make([]byte, 24)
	binary.BigEndian.PutUint32(header, uint32(len(header)))
	copy(header[4:8], "ftyp")
	copy(header[8:12], brand)
	copy(header[16:20], brand)
	return header
}

func TestInspectMediaUsesHeaderAndDecoderOverMisleadingExtension(t *testing.T) {
	path := filepath.Join(t.TempDir(), "actually-png.jpg")
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := png.Encode(file, image.NewRGBA(image.Rect(0, 0, 7, 5))); err != nil {
		_ = file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	inspected := inspectMedia(path, info)
	if inspected.Extension != ".jpg" || inspected.Format != "png" || inspected.MimeType != "image/png" {
		t.Fatalf("unexpected identification: %+v", inspected)
	}
	if inspected.Width != 7 || inspected.Height != 5 || inspected.PreviewStatus != "pending" || inspected.PreviewError != "" {
		t.Fatalf("unexpected inspection: %+v", inspected)
	}
}

func TestInspectMediaCapturesGIFAnimationWithoutDecodeAll(t *testing.T) {
	path := filepath.Join(t.TempDir(), "animated.gif")
	writeTestGIF(t, path)
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	inspected := inspectMedia(path, info)
	if inspected.Format != "gif" || inspected.Width != 2 || inspected.Height != 2 || !inspected.IsAnimated || inspected.FrameCount != 2 {
		t.Fatalf("unexpected GIF inspection: %+v", inspected)
	}
}

func TestCorruptSupportedFileStaysUnavailableAcrossReconcile(t *testing.T) {
	manager, root := openTestManager(t)
	path := filepath.Join(root, "broken.jpg")
	if err := os.WriteFile(path, []byte("not an image"), 0o600); err != nil {
		t.Fatal(err)
	}
	id, missing, err := manager.ReconcilePath("broken.jpg", reconcileSourceImport, newID())
	if err != nil || missing || id == "" {
		t.Fatalf("first reconcile id=%q missing=%v err=%v", id, missing, err)
	}
	idAgain, missing, err := manager.ReconcilePath("broken.jpg", reconcileSourceImport, newID())
	if err != nil || missing || idAgain != id {
		t.Fatalf("second reconcile id=%q missing=%v err=%v", idAgain, missing, err)
	}
	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	var status, previewError string
	if err := session.store.db.QueryRow(`SELECT preview_status,preview_error FROM assets WHERE id=?`, id).Scan(&status, &previewError); err != nil {
		t.Fatal(err)
	}
	if status != "unavailable" || previewError == "" {
		t.Fatalf("status=%q previewError=%q", status, previewError)
	}
}

func TestInspectAndPersistTypedEXIF(t *testing.T) {
	manager, root := openTestManager(t)
	path := filepath.Join(root, "exif.jpg")
	writeTestJPEGWithEXIF(t, path)
	id := indexTestFile(t, manager, root, "exif.jpg")
	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	var orientation, iso int
	var captured int64
	var makeValue, modelValue, lensValue string
	var aperture, shutter, focal float64
	err = session.store.db.QueryRow(`SELECT a.orientation,a.captured_at,e.camera_make,e.camera_model,e.lens_model,e.iso,e.aperture,e.shutter_seconds,e.focal_length_mm
        FROM assets a JOIN exif_metadata e ON e.asset_id=a.id WHERE a.id=?`, id).
		Scan(&orientation, &captured, &makeValue, &modelValue, &lensValue, &iso, &aperture, &shutter, &focal)
	if err != nil {
		t.Fatal(err)
	}
	if orientation != 6 || makeValue != "Test Make" || modelValue != "Test Model" || lensValue != "Prime Lens" || iso != 400 {
		t.Fatalf("unexpected typed EXIF: orientation=%d make=%q model=%q lens=%q iso=%d", orientation, makeValue, modelValue, lensValue, iso)
	}
	if aperture != 2.8 || shutter != 1.0/125.0 || focal != 50 {
		t.Fatalf("unexpected rational EXIF aperture=%v shutter=%v focal=%v", aperture, shutter, focal)
	}
	wantCaptured := time.Date(2026, 7, 30, 12, 34, 56, 0, time.UTC).UnixMilli()
	if captured != wantCaptured {
		t.Fatalf("captured_at=%d, want %d", captured, wantCaptured)
	}
	page, err := manager.ListAssets(AssetQuery{Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].Orientation != 6 || page.Items[0].EXIF == nil || page.Items[0].EXIF.ISO == nil || *page.Items[0].EXIF.ISO != 400 {
		t.Fatalf("unexpected asset DTO: %+v", page.Items)
	}
}

func TestRetryAssetPreviewsRecoversWorkerPanicAndKeepsAssetID(t *testing.T) {
	manager, root := openTestManager(t)
	path := filepath.Join(root, "retry.jpg")
	writeTestJPEG(t, path)
	id := indexTestFile(t, manager, root, "retry.jpg")
	originalRenderer := derivativeRenderer
	t.Cleanup(func() { derivativeRenderer = originalRenderer })
	derivativeRenderer = func(context.Context, string, string, int, int) error { panic("decoder exploded") }

	failed, err := manager.RetryAssetPreviews([]AssetID{id})
	if err != nil {
		t.Fatal(err)
	}
	if len(failed) != 1 || failed[0].AssetID != id || failed[0].Status != "failed" || !strings.Contains(failed[0].Error, "decoder exploded") {
		t.Fatalf("panic retry result=%+v", failed)
	}
	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	var status, previewError string
	if err := session.store.db.QueryRow(`SELECT preview_status,preview_error FROM assets WHERE id=?`, id).Scan(&status, &previewError); err != nil {
		t.Fatal(err)
	}
	if status != "unavailable" || !strings.Contains(previewError, "decoder exploded") {
		t.Fatalf("after panic status=%q error=%q", status, previewError)
	}

	derivativeRenderer = originalRenderer
	recovered, err := manager.RetryAssetPreviews([]AssetID{id})
	if err != nil {
		t.Fatal(err)
	}
	if len(recovered) != 1 || recovered[0].AssetID != id || recovered[0].Status != "ready" || recovered[0].Error != "" {
		t.Fatalf("recovered retry result=%+v", recovered)
	}
	if err := session.store.db.QueryRow(`SELECT preview_status,preview_error FROM assets WHERE id=?`, id).Scan(&status, &previewError); err != nil {
		t.Fatal(err)
	}
	if status != "ready" || previewError != "" {
		t.Fatalf("after recovery status=%q error=%q", status, previewError)
	}
	if _, err := os.Stat(firstDerivativeMatch(t, root, id, derivativeThumbnail)); err != nil {
		t.Fatalf("thumbnail not created: %v", err)
	}
}

func firstDerivativeMatch(t *testing.T, root string, id AssetID, variant derivativeVariant) string {
	t.Helper()
	matches, err := filepath.Glob(filepath.Join(internalPath(root, derivativeDirectory(variant)), string(id)+"-*.jpg"))
	if err != nil {
		t.Fatal(err)
	}
	if len(matches) != 1 {
		t.Fatalf("derivative matches for %s/%s = %v", id, variant, matches)
	}
	return matches[0]
}

func TestStoreMigratesPreviewErrorAndTypedEXIF(t *testing.T) {
	root := createVersionTwoTestDatabase(t)
	store, err := openStore(root)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	var version string
	if err := store.db.QueryRow(`SELECT value FROM library_meta WHERE key='schema_version'`).Scan(&version); err != nil {
		t.Fatal(err)
	}
	if version != "9" {
		t.Fatalf("schema version=%q, want 9", version)
	}
	columns, err := store.db.Query(`PRAGMA table_info(assets)`)
	if err != nil {
		t.Fatal(err)
	}
	foundPreviewError := false
	foundCloudPhotoID := false
	foundCloudURL := false
	for columns.Next() {
		var cid int
		var name, dataType string
		var notNull, primaryKey int
		var defaultValue any
		if err := columns.Scan(&cid, &name, &dataType, &notNull, &defaultValue, &primaryKey); err != nil {
			t.Fatal(err)
		}
		foundPreviewError = foundPreviewError || name == "preview_error"
		foundCloudPhotoID = foundCloudPhotoID || name == "cloud_photo_id"
		foundCloudURL = foundCloudURL || name == "cloud_url"
	}
	_ = columns.Close()
	if !foundPreviewError {
		t.Fatal("preview_error column was not added")
	}
	if !foundCloudPhotoID {
		t.Fatalf("cloud link column missing: cloud_photo_id=%v", foundCloudPhotoID)
	}
	if foundCloudURL {
		t.Fatal("obsolete cloud_url column should be removed")
	}
	var table string
	if err := store.db.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name='exif_metadata'`).Scan(&table); err != nil {
		t.Fatal(err)
	}
}

func TestStoreMigratesVersionEightCloudURLColumn(t *testing.T) {
	root := createVersionTwoTestDatabase(t)
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(internalPath(root, "library.db")))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`ALTER TABLE assets ADD COLUMN cloud_photo_id TEXT;
        ALTER TABLE assets ADD COLUMN cloud_url TEXT;
        INSERT INTO assets(id,relative_path,path_key,file_name,extension,format,mime_type,byte_size,modified_at_ns,availability,discovered_at,technical_updated_at,cloud_photo_id,cloud_url)
            VALUES('legacy-v8','legacy-v8.jpg','legacy-v8.jpg','legacy-v8.jpg','.jpg','jpeg','image/jpeg',1,1,'active',1,1,'photo-8','https://old.example/photo-8.jpg');
        UPDATE library_meta SET value='8' WHERE key='schema_version'`); err != nil {
		_ = db.Close()
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	store, err := openStore(root)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	var version string
	if err := store.db.QueryRow(`SELECT value FROM library_meta WHERE key='schema_version'`).Scan(&version); err != nil {
		t.Fatal(err)
	}
	if version != "9" {
		t.Fatalf("schema version=%q, want 9", version)
	}
	var photoID string
	if err := store.db.QueryRow(`SELECT cloud_photo_id FROM assets WHERE id='legacy-v8'`).Scan(&photoID); err != nil {
		t.Fatal(err)
	}
	if photoID != "photo-8" {
		t.Fatalf("cloud_photo_id=%q, want photo-8", photoID)
	}
	rows, err := store.db.Query(`PRAGMA table_info(assets)`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, dataType string
		var notNull, primaryKey int
		var defaultValue any
		if err := rows.Scan(&cid, &name, &dataType, &notNull, &defaultValue, &primaryKey); err != nil {
			t.Fatal(err)
		}
		if name == "cloud_url" {
			t.Fatal("obsolete cloud_url column remains after M009")
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
}

func TestStoreUseRequiresExplicitUpgrade(t *testing.T) {
	root := createVersionTwoTestDatabase(t)
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(internalPath(root, "library.db")))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`ALTER TABLE assets ADD COLUMN cloud_photo_id TEXT;
        ALTER TABLE assets ADD COLUMN cloud_url TEXT;
        UPDATE library_meta SET value='8' WHERE key='schema_version'`); err != nil {
		_ = db.Close()
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	store, err := openStoreForUse(root)
	if !isAppErrorCode(err, ErrLibraryUpgradeRequired) {
		if store != nil {
			_ = store.Close()
		}
		t.Fatalf("openStoreForUse() error = %v, want %s", err, ErrLibraryUpgradeRequired)
	}
	check, err := inspectStoreUpgrade(root)
	if err != nil {
		t.Fatal(err)
	}
	if !check.Required || check.CurrentVersion != 8 {
		t.Fatalf("upgrade check = %+v, want required v8", check)
	}
}

func createVersionTwoTestDatabase(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	if err := prepareLibraryStructure(root); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(internalPath(root, "library.db")))
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE library_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO library_meta(key,value) VALUES('schema_version','2');
        CREATE TABLE assets (
            id TEXT PRIMARY KEY, folder_id TEXT, relative_path TEXT NOT NULL, path_key TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL,
            extension TEXT NOT NULL, format TEXT NOT NULL, mime_type TEXT NOT NULL, media_kind TEXT NOT NULL DEFAULT 'image',
            byte_size INTEGER NOT NULL, modified_at_ns INTEGER NOT NULL, width INTEGER NOT NULL DEFAULT 0, height INTEGER NOT NULL DEFAULT 0,
            orientation INTEGER NOT NULL DEFAULT 1, is_animated INTEGER NOT NULL DEFAULT 0, frame_count INTEGER NOT NULL DEFAULT 1,
            availability TEXT NOT NULL DEFAULT 'active', preview_status TEXT NOT NULL DEFAULT 'pending', metadata_status TEXT NOT NULL DEFAULT 'pending',
            display_title TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', rating INTEGER NOT NULL DEFAULT 0, color_label TEXT NOT NULL DEFAULT '',
            is_favorite INTEGER NOT NULL DEFAULT 0, captured_at INTEGER, discovered_at INTEGER NOT NULL, technical_updated_at INTEGER NOT NULL,
            scan_token TEXT NOT NULL DEFAULT '', trash_entry_id TEXT
        )`)
	if err != nil {
		_ = db.Close()
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	return root
}

func writeTestJPEGWithEXIF(t *testing.T, path string) {
	t.Helper()
	var encoded bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 4, 3))
	for y := 0; y < 3; y++ {
		for x := 0; x < 4; x++ {
			img.Set(x, y, color.RGBA{R: uint8(30 + x*20), G: uint8(50 + y*20), B: 100, A: 255})
		}
	}
	if err := jpeg.Encode(&encoded, img, &jpeg.Options{Quality: 85}); err != nil {
		t.Fatal(err)
	}
	jpegBytes := encoded.Bytes()
	if len(jpegBytes) < 2 || jpegBytes[0] != 0xff || jpegBytes[1] != 0xd8 {
		t.Fatal("encoded JPEG has no SOI")
	}
	payload := append([]byte("Exif\x00\x00"), testTIFFEXIF()...)
	if len(payload)+2 > 0xffff {
		t.Fatal("test EXIF payload is too large")
	}
	segment := []byte{0xff, 0xe1, 0, 0}
	binary.BigEndian.PutUint16(segment[2:4], uint16(len(payload)+2))
	output := append([]byte{}, jpegBytes[:2]...)
	output = append(output, segment...)
	output = append(output, payload...)
	output = append(output, jpegBytes[2:]...)
	if err := os.WriteFile(path, output, 0o600); err != nil {
		t.Fatal(err)
	}
}

func testTIFFEXIF() []byte {
	const ifd0Entries = 4
	ifd0Size := 2 + ifd0Entries*12 + 4
	makeValue := []byte("Test Make\x00")
	modelValue := []byte("Test Model\x00")
	makeOffset := 8 + ifd0Size
	modelOffset := makeOffset + len(makeValue)
	exifOffset := modelOffset + len(modelValue)
	if exifOffset%2 != 0 {
		exifOffset++
	}
	const exifEntries = 6
	exifSize := 2 + exifEntries*12 + 4
	dateValue := []byte("2026:07:30 12:34:56\x00")
	lensValue := []byte("Prime Lens\x00")
	dataOffset := exifOffset + exifSize
	dateOffset := dataOffset
	lensOffset := dateOffset + len(dateValue)
	exposureOffset := lensOffset + len(lensValue)
	fNumberOffset := exposureOffset + 8
	focalOffset := fNumberOffset + 8
	data := make([]byte, focalOffset+8)
	copy(data[:2], "II")
	binary.LittleEndian.PutUint16(data[2:4], 42)
	binary.LittleEndian.PutUint32(data[4:8], 8)
	binary.LittleEndian.PutUint16(data[8:10], ifd0Entries)
	putIFDEntry(data[10:22], 0x010f, 2, uint32(len(makeValue)), uint32(makeOffset))
	putIFDEntry(data[22:34], 0x0110, 2, uint32(len(modelValue)), uint32(modelOffset))
	putIFDEntry(data[34:46], 0x0112, 3, 1, 6)
	putIFDEntry(data[46:58], 0x8769, 4, 1, uint32(exifOffset))
	copy(data[makeOffset:], makeValue)
	copy(data[modelOffset:], modelValue)
	binary.LittleEndian.PutUint16(data[exifOffset:exifOffset+2], exifEntries)
	entry := exifOffset + 2
	putIFDEntry(data[entry:entry+12], 0x829a, 5, 1, uint32(exposureOffset))
	entry += 12
	putIFDEntry(data[entry:entry+12], 0x829d, 5, 1, uint32(fNumberOffset))
	entry += 12
	putIFDEntry(data[entry:entry+12], 0x8827, 3, 1, 400)
	entry += 12
	putIFDEntry(data[entry:entry+12], 0x9003, 2, uint32(len(dateValue)), uint32(dateOffset))
	entry += 12
	putIFDEntry(data[entry:entry+12], 0x920a, 5, 1, uint32(focalOffset))
	entry += 12
	putIFDEntry(data[entry:entry+12], 0xa434, 2, uint32(len(lensValue)), uint32(lensOffset))
	copy(data[dateOffset:], dateValue)
	copy(data[lensOffset:], lensValue)
	putRational(data[exposureOffset:exposureOffset+8], 1, 125)
	putRational(data[fNumberOffset:fNumberOffset+8], 28, 10)
	putRational(data[focalOffset:focalOffset+8], 50, 1)
	return data
}

func putIFDEntry(target []byte, tag, fieldType uint16, count, value uint32) {
	binary.LittleEndian.PutUint16(target[0:2], tag)
	binary.LittleEndian.PutUint16(target[2:4], fieldType)
	binary.LittleEndian.PutUint32(target[4:8], count)
	if fieldType == 3 && count == 1 {
		binary.LittleEndian.PutUint16(target[8:10], uint16(value))
		return
	}
	binary.LittleEndian.PutUint32(target[8:12], value)
}

func putRational(target []byte, numerator, denominator uint32) {
	binary.LittleEndian.PutUint32(target[0:4], numerator)
	binary.LittleEndian.PutUint32(target[4:8], denominator)
}

var _ = errors.Is
