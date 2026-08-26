package local_library

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"log"
	"mime"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/evanoberholster/imagemeta"
	avifcodec "github.com/gen2brain/avif"
	heiccodec "github.com/gen2brain/heic"
	"github.com/rwcarlsen/goexif/exif"
	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/tiff"
	_ "golang.org/x/image/webp"
)

const (
	mediaHeaderBytes           = 64
	maxDecodeBytes             = 256 * 1024 * 1024
	maxRAWPreviewScanBytes     = 64 * 1024 * 1024
	maxImagePixels             = 180_000_000
	maxOriginalViewPixels      = 100_000_000
	maxOriginalViewMemoryBytes = 512 * 1024 * 1024
	maxGIFFrames               = 10_000
	maxEXIFStringBytes         = 4 * 1024
	maxEXIFJSONBytes           = 64 * 1024
	maxPreviewError            = 2 * 1024
)

var supportedExtensions = map[string]struct{}{
	".jpg": {}, ".jpeg": {}, ".png": {}, ".webp": {}, ".gif": {}, ".avif": {},
	".heic": {}, ".heif": {}, ".tif": {}, ".tiff": {}, ".cr2": {}, ".cr3": {},
	".nef": {}, ".arw": {}, ".dng": {}, ".raf": {}, ".rw2": {},
}

// ignoredFileNames are common OS-level junk files that are never indexed.
var ignoredFileNames = map[string]struct{}{
	"thumbs.db": {}, "ehthumbs.db": {}, "ehthumbs_vista.db": {},
	"desktop.ini": {}, ".ds_store": {},
}

// isIndexableFile reports whether a regular file should be indexed by the
// library. The library indexes every file so the local view can show all
// content; only hidden/system junk files are skipped.
func isIndexableFile(name string) bool {
	base := filepath.Base(filepath.Clean(name))
	if strings.HasPrefix(base, ".") || strings.HasPrefix(base, "._") {
		return false
	}
	_, ignored := ignoredFileNames[strings.ToLower(base)]
	return !ignored
}

var derivativeRenderer = renderJPEGDerivative

type exifMetadata struct {
	CameraMake     string
	CameraModel    string
	LensModel      string
	ISO            *int
	Aperture       *float64
	ShutterSeconds *float64
	FocalLengthMM  *float64
	Latitude       *float64
	Longitude      *float64
	RawJSON        string
}

func (m exifMetadata) empty() bool {
	return m.CameraMake == "" && m.CameraModel == "" && m.LensModel == "" && m.ISO == nil &&
		m.Aperture == nil && m.ShutterSeconds == nil && m.FocalLengthMM == nil &&
		m.Latitude == nil && m.Longitude == nil && m.RawJSON == ""
}

func isSupportedMedia(path string) bool {
	_, ok := supportedExtensions[strings.ToLower(filepath.Ext(path))]
	return ok
}

func formatForExtension(ext string) (string, string) {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg":
		return "jpeg", "image/jpeg"
	case ".png":
		return "png", "image/png"
	case ".webp":
		return "webp", "image/webp"
	case ".gif":
		return "gif", "image/gif"
	case ".avif":
		return "avif", "image/avif"
	case ".heic", ".heif":
		return "heif", "image/heif"
	case ".tif", ".tiff":
		return "tiff", "image/tiff"
	case ".cr2":
		return "cr2", "image/x-canon-cr2"
	case ".cr3":
		return "cr3", "image/x-canon-cr3"
	case ".nef":
		return "nef", "image/x-nikon-nef"
	case ".arw":
		return "arw", "image/x-sony-arw"
	case ".dng":
		return "dng", "image/x-adobe-dng"
	case ".raf":
		return "raf", "image/x-fuji-raf"
	case ".rw2":
		return "rw2", "image/x-panasonic-rw2"
	default:
		if detected := mime.TypeByExtension(ext); detected != "" {
			return strings.TrimPrefix(ext, "."), detected
		}
		return strings.TrimPrefix(ext, "."), "application/octet-stream"
	}
}

func formatAndMIME(format string) (string, string) {
	switch format {
	case "jpg", "jpeg":
		return "jpeg", "image/jpeg"
	case "png":
		return "png", "image/png"
	case "webp":
		return "webp", "image/webp"
	case "gif":
		return "gif", "image/gif"
	case "tif", "tiff":
		return "tiff", "image/tiff"
	case "avif":
		return "avif", "image/avif"
	case "heic", "heif":
		return "heif", "image/heif"
	case "cr2":
		return "cr2", "image/x-canon-cr2"
	case "cr3":
		return "cr3", "image/x-canon-cr3"
	case "nef":
		return "nef", "image/x-nikon-nef"
	case "arw":
		return "arw", "image/x-sony-arw"
	case "dng":
		return "dng", "image/x-adobe-dng"
	case "raf":
		return "raf", "image/x-fuji-raf"
	case "rw2":
		return "rw2", "image/x-panasonic-rw2"
	default:
		return format, "application/octet-stream"
	}
}

func inspectMedia(path string, info os.FileInfo) (result indexedFile) {
	ext := strings.ToLower(filepath.Ext(path))
	candidateFormat, candidateMIME := formatForExtension(ext)
	result = indexedFile{FileName: filepath.Base(path), Extension: ext, Format: candidateFormat, MimeType: candidateMIME,
		ByteSize: info.Size(), ModifiedAtNS: info.ModTime().UnixNano(), Orientation: 1, FrameCount: 1,
		PreviewStatus: "unavailable", MetadataStatus: "partial"}
	if !isSupportedMedia(path) {
		// Non-photo files are indexed for browsing but never decoded: they
		// stay with a file-format placeholder preview.
		result.MediaKind = "file"
		result.MetadataStatus = "unavailable"
		result.PreviewError = "no decoder is available for this file type"
		return result
	}
	result.MediaKind = "image"
	defer func() {
		if recovered := recover(); recovered != nil {
			result.PreviewStatus = "unavailable"
			result.PreviewError = boundedError(fmt.Sprintf("media inspection panic: %v", recovered))
			result.MetadataStatus = "partial"
		}
	}()

	file, err := os.Open(path)
	if err != nil {
		result.PreviewError = boundedError("open media: " + err.Error())
		return result
	}
	defer file.Close()
	header := make([]byte, mediaHeaderBytes)
	headerLength, readErr := io.ReadFull(file, header)
	if readErr != nil && readErr != io.ErrUnexpectedEOF && readErr != io.EOF {
		result.PreviewError = boundedError("read media header: " + readErr.Error())
		return result
	}
	header = header[:headerLength]
	if detectedFormat, detectedMIME, ok := detectMediaHeader(header, ext); ok {
		result.Format, result.MimeType = detectedFormat, detectedMIME
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		result.PreviewError = boundedError("seek media: " + err.Error())
		return result
	}
	config, decodedFormat, decodeErr := decodeMediaConfig(path, result.Format)
	if decodeErr == nil {
		result.Format, result.MimeType = formatAndMIME(decodedFormat)
		result.Width, result.Height = config.Width, config.Height
		if err := validateDimensions(config.Width, config.Height); err != nil {
			result.PreviewError = boundedError(err.Error())
		} else {
			result.PreviewStatus, result.MetadataStatus = "pending", "ready"
		}
	} else {
		result.PreviewError = boundedError("decode metadata: " + decodeErr.Error())
	}
	if result.Format == "gif" {
		if _, err := file.Seek(0, io.SeekStart); err == nil {
			frameCount, gifErr := inspectGIFFrames(io.LimitReader(file, maxDecodeBytes))
			if gifErr != nil {
				result.PreviewStatus = "unavailable"
				result.PreviewError = boundedError("inspect GIF animation: " + gifErr.Error())
				result.MetadataStatus = "partial"
			} else {
				result.FrameCount, result.IsAnimated = frameCount, frameCount > 1
			}
		}
	}
	if supportsEXIFInspection(result.Format, ext) {
		if _, err := file.Seek(0, io.SeekStart); err == nil {
			metadata, orientation, capturedAt, exifErr := extractTypedEXIF(io.LimitReader(file, maxDecodeBytes))
			if exifErr == nil {
				result.EXIF = metadata
				if orientation >= 1 && orientation <= 8 {
					result.Orientation = orientation
				}
				result.CapturedAt = capturedAt
			}
		}
	}
	if result.PreviewStatus == "unavailable" && result.PreviewError == "" {
		result.PreviewError = "no decoder is available for this media"
	}
	return result
}

func detectMediaHeader(header []byte, ext string) (string, string, bool) {
	if len(header) >= 3 && header[0] == 0xff && header[1] == 0xd8 && header[2] == 0xff {
		return "jpeg", "image/jpeg", true
	}
	if len(header) >= 8 && string(header[:8]) == "\x89PNG\r\n\x1a\n" {
		return "png", "image/png", true
	}
	if len(header) >= 6 && (string(header[:6]) == "GIF87a" || string(header[:6]) == "GIF89a") {
		return "gif", "image/gif", true
	}
	if len(header) >= 12 && string(header[:4]) == "RIFF" && string(header[8:12]) == "WEBP" {
		return "webp", "image/webp", true
	}
	if len(header) >= 16 && string(header[:16]) == "FUJIFILMCCD-RAW " {
		return "raf", "image/x-fuji-raf", true
	}
	if len(header) >= 4 && string(header[:4]) == "II\x55\x00" {
		return "rw2", "image/x-panasonic-rw2", true
	}
	if len(header) >= 12 && isTIFFHeader(header) {
		if string(header[8:12]) == "CR\x02\x00" {
			return "cr2", "image/x-canon-cr2", true
		}
		switch strings.ToLower(ext) {
		case ".dng", ".nef", ".arw", ".rw2":
			format, mimeType := formatForExtension(ext)
			return format, mimeType, true
		default:
			return "tiff", "image/tiff", true
		}
	}
	if len(header) >= 12 && string(header[4:8]) == "ftyp" {
		brands := []string{string(header[8:12])}
		for offset := 16; offset+4 <= len(header); offset += 4 {
			brands = append(brands, string(header[offset:offset+4]))
		}
		for _, brand := range brands {
			if brand == "avif" || brand == "avis" {
				return "avif", "image/avif", true
			}
		}
		for _, brand := range brands {
			if brand == "crx " || brand == "cr3 " {
				return "cr3", "image/x-canon-cr3", true
			}
		}
		for _, brand := range brands {
			switch brand {
			case "heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1":
				return "heif", "image/heif", true
			}
		}
	}
	return "", "", false
}

func isTIFFHeader(header []byte) bool {
	return len(header) >= 4 && (string(header[:4]) == "II\x2a\x00" || string(header[:4]) == "MM\x00\x2a")
}

func validateDimensions(width, height int) error {
	if width <= 0 || height <= 0 {
		return fmt.Errorf("invalid image dimensions")
	}
	if int64(width)*int64(height) > maxImagePixels {
		return fmt.Errorf("image exceeds pixel safety limit")
	}
	return nil
}

func validateOriginalViewDimensions(width, height int) error {
	if err := validateDimensions(width, height); err != nil {
		return err
	}
	pixels := int64(width) * int64(height)
	if pixels > maxOriginalViewPixels {
		return fmt.Errorf("original exceeds view pixel limit")
	}
	if pixels > maxOriginalViewMemoryBytes/4 {
		return fmt.Errorf("original exceeds estimated decode memory limit")
	}
	return nil
}

func inspectGIFFrames(reader io.Reader) (int, error) {
	buffered := bufio.NewReader(reader)
	header := make([]byte, 13)
	if _, err := io.ReadFull(buffered, header); err != nil {
		return 0, err
	}
	if string(header[:6]) != "GIF87a" && string(header[:6]) != "GIF89a" {
		return 0, fmt.Errorf("invalid GIF signature")
	}
	if header[10]&0x80 != 0 {
		if _, err := io.CopyN(io.Discard, buffered, int64(3*(1<<((header[10]&0x07)+1)))); err != nil {
			return 0, err
		}
	}
	frames := 0
	for {
		marker, err := buffered.ReadByte()
		if err != nil {
			return 0, err
		}
		switch marker {
		case 0x3b:
			if frames == 0 {
				return 0, fmt.Errorf("GIF has no image frames")
			}
			return frames, nil
		case 0x21:
			if _, err := buffered.ReadByte(); err != nil {
				return 0, err
			}
			if err := skipGIFSubBlocks(buffered); err != nil {
				return 0, err
			}
		case 0x2c:
			descriptor := make([]byte, 9)
			if _, err := io.ReadFull(buffered, descriptor); err != nil {
				return 0, err
			}
			if descriptor[8]&0x80 != 0 {
				if _, err := io.CopyN(io.Discard, buffered, int64(3*(1<<((descriptor[8]&0x07)+1)))); err != nil {
					return 0, err
				}
			}
			if _, err := buffered.ReadByte(); err != nil {
				return 0, err
			}
			if err := skipGIFSubBlocks(buffered); err != nil {
				return 0, err
			}
			frames++
			if frames > maxGIFFrames {
				return 0, fmt.Errorf("GIF exceeds frame safety limit")
			}
		default:
			return 0, fmt.Errorf("invalid GIF block marker 0x%02x", marker)
		}
	}
}

func skipGIFSubBlocks(reader *bufio.Reader) error {
	for {
		size, err := reader.ReadByte()
		if err != nil {
			return err
		}
		if size == 0 {
			return nil
		}
		if _, err := io.CopyN(io.Discard, reader, int64(size)); err != nil {
			return err
		}
	}
}

func supportsEXIFInspection(format, ext string) bool {
	switch format {
	case "jpeg", "tiff", "cr2", "dng", "nef", "arw", "rw2":
		return true
	}
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg", ".tif", ".tiff", ".cr2", ".dng", ".nef", ".arw", ".rw2":
		return true
	}
	return false
}

func extractTypedEXIF(reader io.Reader) (exifMetadata, int, *time.Time, error) {
	x, err := exif.Decode(reader)
	if err != nil {
		return exifMetadata{}, 1, nil, err
	}
	metadata := exifMetadata{CameraMake: exifString(x, exif.Make), CameraModel: exifString(x, exif.Model), LensModel: exifString(x, exif.LensModel)}
	metadata.ISO, metadata.Aperture = exifInt(x, exif.ISOSpeedRatings), exifRational(x, exif.FNumber)
	metadata.ShutterSeconds, metadata.FocalLengthMM = exifRational(x, exif.ExposureTime), exifRational(x, exif.FocalLength)
	if latitude, longitude, gpsErr := x.LatLong(); gpsErr == nil {
		metadata.Latitude, metadata.Longitude = &latitude, &longitude
	}
	orientation := 1
	if value := exifInt(x, exif.Orientation); value != nil && *value >= 1 && *value <= 8 {
		orientation = *value
	}
	raw := map[string]string{}
	for _, field := range []exif.FieldName{exif.Make, exif.Model, exif.LensModel, exif.FocalLength, exif.FNumber, exif.ExposureTime, exif.ISOSpeedRatings, exif.DateTimeOriginal, exif.Orientation, exif.Software} {
		if tag, getErr := x.Get(field); getErr == nil {
			raw[string(field)] = boundedString(tag.String(), maxEXIFStringBytes)
		}
	}
	if payload, marshalErr := json.Marshal(raw); marshalErr == nil && len(payload) <= maxEXIFJSONBytes && len(raw) > 0 {
		metadata.RawJSON = string(payload)
	}
	return metadata, orientation, exifTime(x), nil
}

func exifString(x *exif.Exif, field exif.FieldName) string {
	tag, err := x.Get(field)
	if err != nil {
		return ""
	}
	value, err := tag.StringVal()
	if err != nil {
		return ""
	}
	return boundedString(strings.TrimSpace(value), maxEXIFStringBytes)
}
func exifInt(x *exif.Exif, field exif.FieldName) *int {
	tag, err := x.Get(field)
	if err != nil {
		return nil
	}
	value, err := tag.Int(0)
	if err != nil {
		return nil
	}
	return &value
}
func exifRational(x *exif.Exif, field exif.FieldName) *float64 {
	tag, err := x.Get(field)
	if err != nil {
		return nil
	}
	numerator, denominator, err := tag.Rat2(0)
	if err != nil || denominator == 0 {
		return nil
	}
	value := float64(numerator) / float64(denominator)
	return &value
}
func exifTime(x *exif.Exif) *time.Time {
	for _, field := range []exif.FieldName{exif.DateTimeOriginal, exif.DateTimeDigitized, exif.DateTime} {
		tag, err := x.Get(field)
		if err != nil {
			continue
		}
		value, err := tag.StringVal()
		if err != nil {
			continue
		}
		parsed, err := time.Parse("2006:01:02 15:04:05", strings.TrimSpace(value))
		if err == nil {
			parsed = parsed.UTC()
			return &parsed
		}
	}
	return nil
}
func boundedString(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	value = value[:limit]
	for !utf8.ValidString(value) && len(value) > 0 {
		value = value[:len(value)-1]
	}
	return value
}
func boundedError(value string) string { return boundedString(value, maxPreviewError) }

type dominantColorBucket struct {
	count   int
	r, g, b uint64
}

func extractDominantColors(source image.Image, count int) []string {
	if source == nil || count <= 0 {
		return nil
	}
	bounds := source.Bounds()
	step := 1
	for bounds.Dx()/step > 200 || bounds.Dy()/step > 200 {
		step++
	}
	buckets := make(map[uint16]*dominantColorBucket)
	for y := bounds.Min.Y; y < bounds.Max.Y; y += step {
		for x := bounds.Min.X; x < bounds.Max.X; x += step {
			pixel := color.NRGBAModel.Convert(source.At(x, y)).(color.NRGBA)
			if pixel.A < 125 || (pixel.R > 250 && pixel.G > 250 && pixel.B > 250) {
				continue
			}
			key := uint16(pixel.R>>4)<<8 | uint16(pixel.G>>4)<<4 | uint16(pixel.B>>4)
			bucket := buckets[key]
			if bucket == nil {
				bucket = &dominantColorBucket{}
				buckets[key] = bucket
			}
			bucket.count++
			bucket.r += uint64(pixel.R)
			bucket.g += uint64(pixel.G)
			bucket.b += uint64(pixel.B)
		}
	}
	values := make([]dominantColorBucket, 0, len(buckets))
	for _, bucket := range buckets {
		values = append(values, *bucket)
	}
	sort.Slice(values, func(i, j int) bool { return values[i].count > values[j].count })
	if len(values) > count {
		values = values[:count]
	}
	result := make([]string, 0, len(values))
	for _, bucket := range values {
		result = append(result, fmt.Sprintf("#%02x%02x%02x", bucket.r/uint64(bucket.count), bucket.g/uint64(bucket.count), bucket.b/uint64(bucket.count)))
	}
	return result
}

func decodeImage(path string) (image.Image, error) {
	ext := filepath.Ext(path)
	if isRAWExtension(ext) {
		preview, err := extractRAWPreview(path)
		if err != nil {
			return nil, err
		}
		return jpeg.Decode(bytes.NewReader(preview))
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	format, _ := formatForExtension(ext)
	header := make([]byte, mediaHeaderBytes)
	headerLength, readErr := io.ReadFull(file, header)
	if readErr != nil && readErr != io.ErrUnexpectedEOF && readErr != io.EOF {
		return nil, readErr
	}
	if detectedFormat, _, ok := detectMediaHeader(header[:headerLength], ext); ok {
		format = detectedFormat
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}
	switch strings.ToLower(format) {
	case "avif":
		return avifcodec.Decode(io.LimitReader(file, maxDecodeBytes))
	case "heic", "heif":
		return heiccodec.Decode(io.LimitReader(file, maxDecodeBytes))
	}
	source, _, err := image.Decode(io.LimitReader(file, maxDecodeBytes))
	return source, err
}

func decodeMediaConfig(path, format string) (image.Config, string, error) {
	return decodeMediaConfigContext(context.Background(), path, format)
}

func decodeMediaConfigContext(ctx context.Context, path, format string) (image.Config, string, error) {
	if isRAWFormat(format) {
		preview, err := extractRAWPreviewContext(ctx, path)
		if err != nil {
			return image.Config{}, "", err
		}
		config, err := jpeg.DecodeConfig(contextBoundReader{ctx: ctx, reader: bytes.NewReader(preview)})
		return config, format, err
	}
	file, err := os.Open(path)
	if err != nil {
		return image.Config{}, "", err
	}
	defer file.Close()
	return decodeMediaConfigReaderContext(ctx, file, format)
}

func decodeMediaConfigReaderContext(ctx context.Context, source io.Reader, format string) (image.Config, string, error) {
	if err := ctx.Err(); err != nil {
		return image.Config{}, "", err
	}
	reader := contextBoundReader{ctx: ctx, reader: source}
	switch strings.ToLower(format) {
	case "avif":
		config, err := avifcodec.DecodeConfig(io.LimitReader(reader, maxDecodeBytes))
		return config, "avif", err
	case "heic", "heif":
		config, err := heiccodec.DecodeConfig(io.LimitReader(reader, maxDecodeBytes))
		return config, "heif", err
	}
	return image.DecodeConfig(io.LimitReader(reader, maxDecodeBytes))
}

func decodeImageConfig(path string) (image.Config, error) {
	format, _ := formatForExtension(filepath.Ext(path))
	config, _, err := decodeMediaConfig(path, format)
	return config, err
}

func isRAWExtension(ext string) bool {
	switch strings.ToLower(ext) {
	case ".cr2", ".cr3", ".nef", ".arw", ".dng", ".raf", ".rw2":
		return true
	}
	return false
}

func isRAWFormat(format string) bool {
	switch strings.ToLower(format) {
	case "cr2", "cr3", "nef", "arw", "dng", "raf", "rw2":
		return true
	}
	return false
}

func extractRAWPreview(path string) ([]byte, error) {
	return extractRAWPreviewContext(context.Background(), path)
}

func extractRAWPreviewContext(ctx context.Context, path string) ([]byte, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	if strings.EqualFold(filepath.Ext(path), ".cr3") {
		if preview, previewErr := imagemeta.PreviewCR3(file); previewErr == nil {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			default:
			}
			if config, configErr := jpeg.DecodeConfig(bytes.NewReader(preview)); configErr == nil && validateDimensions(config.Width, config.Height) == nil {
				return preview, nil
			}
		}
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			return nil, err
		}
	}
	return largestEmbeddedJPEGWithValidatorContext(ctx, file, maxRAWPreviewScanBytes, validateDimensions)
}

type contextBoundReader struct {
	ctx    context.Context
	reader io.Reader
}

func (reader contextBoundReader) Read(buffer []byte) (int, error) {
	select {
	case <-reader.ctx.Done():
		return 0, reader.ctx.Err()
	default:
		return reader.reader.Read(buffer)
	}
}

func largestEmbeddedJPEG(reader io.Reader, limit int64) ([]byte, error) {
	return largestEmbeddedJPEGWithValidatorContext(context.Background(), reader, limit, validateDimensions)
}

func largestEmbeddedJPEGWithValidator(reader io.Reader, limit int64, validate func(int, int) error) ([]byte, error) {
	return largestEmbeddedJPEGWithValidatorContext(context.Background(), reader, limit, validate)
}

func largestEmbeddedJPEGWithValidatorContext(ctx context.Context, reader io.Reader, limit int64, validate func(int, int) error) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(contextBoundReader{ctx: ctx, reader: reader}, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("RAW exceeds preview scan limit")
	}
	var best []byte
	var bestArea int64
	for offset := 0; offset+3 < len(data); {
		start, findErr := findBytesContext(ctx, data, offset, []byte{0xff, 0xd8, 0xff})
		if findErr != nil {
			return nil, findErr
		}
		if start < 0 {
			break
		}
		endMarker, findErr := findBytesContext(ctx, data, start+3, []byte{0xff, 0xd9})
		if findErr != nil {
			return nil, findErr
		}
		if endMarker < 0 {
			break
		}
		candidate := data[start : endMarker+2]
		config, configErr := jpeg.DecodeConfig(contextBoundReader{ctx: ctx, reader: bytes.NewReader(candidate)})
		if ctxErr := ctx.Err(); ctxErr != nil {
			return nil, ctxErr
		}
		if configErr == nil && validate(config.Width, config.Height) == nil {
			area := int64(config.Width) * int64(config.Height)
			if area > bestArea {
				bestArea = area
				best = candidate
			}
		}
		offset = start + 3
	}
	if ctxErr := ctx.Err(); ctxErr != nil {
		return nil, ctxErr
	}
	if len(best) == 0 {
		return nil, fmt.Errorf("RAW contains no decodable embedded JPEG preview")
	}
	return best, nil
}

func findBytesContext(ctx context.Context, data []byte, offset int, needle []byte) (int, error) {
	const scanChunkBytes = 64 * 1024
	for offset+len(needle) <= len(data) {
		if err := ctx.Err(); err != nil {
			return -1, err
		}
		end := min(len(data), offset+scanChunkBytes+len(needle)-1)
		if index := bytes.Index(data[offset:end], needle); index >= 0 {
			return offset + index, nil
		}
		if end == len(data) {
			break
		}
		offset += scanChunkBytes
	}
	return -1, nil
}

func renderJPEGThumbnail(ctx context.Context, sourcePath, destination string, maxDimension int) error {
	_, err := renderJPEGDerivative(ctx, sourcePath, destination, maxDimension, 1)
	return err
}

// derivativeRender describes a generated derivative. Returning the geometry and
// the dominant colours avoids re-reading and re-decoding the file that was just
// written: the previous implementation decoded the destination twice (once for
// its dimensions, once in a goroutine for the colours) for every asset.
type derivativeRender struct {
	Width    int
	Height   int
	ByteSize int64
	Colors   []string
}

func renderJPEGDerivative(ctx context.Context, sourcePath, destination string, maxDimension, orientation int) (rendered derivativeRender, err error) {
	startedAt := time.Now()
	decodeStartedAt := startedAt
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("thumbnail decoder panic: %v", recovered)
		}
	}()
	source, err := decodeImage(sourcePath)
	if err != nil {
		return derivativeRender{}, err
	}
	decodeElapsed := time.Since(decodeStartedAt)
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if err := validateDimensions(width, height); err != nil {
		return derivativeRender{}, err
	}
	// Compute the post-orientation dimensions without materializing a rotated
	// full-size copy. EXIF orientations >= 5 transpose (swap) width and height;
	// the remaining orientations only mirror or rotate 180° and preserve the
	// aspect ratio.
	orientedWidth, orientedHeight := width, height
	if orientation >= 5 {
		orientedWidth, orientedHeight = height, width
	}
	targetWidth, targetHeight := orientedWidth, orientedHeight
	if orientedWidth > maxDimension || orientedHeight > maxDimension {
		if orientedWidth >= orientedHeight {
			targetWidth, targetHeight = maxDimension, max(1, orientedHeight*maxDimension/orientedWidth)
		} else {
			targetHeight, targetWidth = maxDimension, max(1, orientedWidth*maxDimension/orientedHeight)
		}
	}
	select {
	case <-ctx.Done():
		return derivativeRender{}, ctx.Err()
	default:
	}
	// Resize the unrotated source to the pre-orientation size first, then apply
	// the EXIF orientation to the small result. Orienting the full-resolution
	// source before scaling performs an O(width*height) per-pixel copy that is
	// as expensive as the decode itself for typical multi-megapixel photos, so
	// defer it until after the downscale. Bilinear filtering is also cheaper
	// than Catmull-Rom while staying suitable for a 512px browsing preview.
	resizeStartedAt := time.Now()
	preWidth, preHeight := targetWidth, targetHeight
	if orientation >= 5 {
		preWidth, preHeight = targetHeight, targetWidth
	}
	resized := image.NewRGBA(image.Rect(0, 0, preWidth, preHeight))
	// ApproxBiLinear is ~60x faster than BiLinear when downscaling a decoded
	// *image.YCbCr, because BiLinear re-runs chroma interpolation and color
	// conversion per sampled pixel while ApproxBiLinear uses an accelerated
	// path. The approximation is visually negligible for a 512px grid
	// thumbnail, so reserve exact BiLinear for the much larger preview variant.
	scaler := xdraw.Scaler(xdraw.BiLinear)
	if maxDimension <= thumbnailMaxDimension {
		scaler = xdraw.ApproxBiLinear
	}
	scaler.Scale(resized, resized.Bounds(), source, bounds, xdraw.Over, nil)
	resizeElapsed := time.Since(resizeStartedAt)
	orientStartedAt := time.Now()
	target := orientedImage(resized, orientation)
	orientElapsed := time.Since(orientStartedAt)
	// The dominant colours are sampled from the downscaled image that is already
	// in memory, so the palette costs a few hundred microseconds instead of a
	// second decode pass per asset.
	var colors []string
	if maxDimension <= thumbnailMaxDimension {
		colors = extractDominantColors(target, 5)
	}
	if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
		return derivativeRender{}, err
	}
	temp := destination + ".tmp-" + newID()
	file, err := os.Create(temp)
	if err != nil {
		return derivativeRender{}, err
	}
	encodeStartedAt := time.Now()
	encodeErr := jpeg.Encode(file, target, &jpeg.Options{Quality: 88})
	encodeElapsed := time.Since(encodeStartedAt)
	closeErr := file.Close()
	if encodeErr != nil {
		_ = os.Remove(temp)
		return derivativeRender{}, encodeErr
	}
	if closeErr != nil {
		_ = os.Remove(temp)
		return derivativeRender{}, closeErr
	}
	written := int64(0)
	if info, statErr := os.Stat(temp); statErr == nil {
		written = info.Size()
	}
	if err := os.Rename(temp, destination); err != nil {
		_ = os.Remove(temp)
		return derivativeRender{}, err
	}
	if elapsed := time.Since(startedAt); elapsed >= 500*time.Millisecond {
		log.Printf("[local-library] derivative slow source=%s total=%s decode=%s orient=%s resize=%s encode=%s", filepath.Base(sourcePath), elapsed.Round(time.Millisecond), decodeElapsed.Round(time.Millisecond), orientElapsed.Round(time.Millisecond), resizeElapsed.Round(time.Millisecond), encodeElapsed.Round(time.Millisecond))
	}
	targetBounds := target.Bounds()
	return derivativeRender{Width: targetBounds.Dx(), Height: targetBounds.Dy(), ByteSize: written, Colors: colors}, nil
}

func writePlaceholderPNG(w io.Writer) error {
	return png.Encode(w, image.NewRGBA(image.Rect(0, 0, 2, 2)))
}
