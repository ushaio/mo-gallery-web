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
	mediaHeaderBytes   = 64
	maxDecodeBytes     = 256 * 1024 * 1024
	maxImagePixels     = 180_000_000
	maxGIFFrames       = 10_000
	maxEXIFStringBytes = 4 * 1024
	maxEXIFJSONBytes   = 64 * 1024
	maxPreviewError    = 2 * 1024
)

var supportedExtensions = map[string]struct{}{
	".jpg": {}, ".jpeg": {}, ".png": {}, ".webp": {}, ".gif": {}, ".avif": {},
	".heic": {}, ".heif": {}, ".tif": {}, ".tiff": {}, ".cr2": {}, ".cr3": {},
	".nef": {}, ".arw": {}, ".dng": {}, ".raf": {},
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
	if len(header) >= 12 && isTIFFHeader(header) {
		if string(header[8:12]) == "CR\x02\x00" {
			return "cr2", "image/x-canon-cr2", true
		}
		switch strings.ToLower(ext) {
		case ".dng", ".nef", ".arw":
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
	case "jpeg", "tiff", "cr2", "dng", "nef", "arw":
		return true
	}
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg", ".tif", ".tiff", ".cr2", ".dng", ".nef", ".arw":
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
	if isRAWFormat(format) {
		preview, err := extractRAWPreview(path)
		if err != nil {
			return image.Config{}, "", err
		}
		config, err := jpeg.DecodeConfig(bytes.NewReader(preview))
		return config, format, err
	}
	file, err := os.Open(path)
	if err != nil {
		return image.Config{}, "", err
	}
	defer file.Close()
	switch strings.ToLower(format) {
	case "avif":
		config, err := avifcodec.DecodeConfig(io.LimitReader(file, maxDecodeBytes))
		return config, "avif", err
	case "heic", "heif":
		config, err := heiccodec.DecodeConfig(io.LimitReader(file, maxDecodeBytes))
		return config, "heif", err
	}
	return image.DecodeConfig(io.LimitReader(file, maxDecodeBytes))
}

func decodeImageConfig(path string) (image.Config, error) {
	format, _ := formatForExtension(filepath.Ext(path))
	config, _, err := decodeMediaConfig(path, format)
	return config, err
}

func isRAWExtension(ext string) bool {
	switch strings.ToLower(ext) {
	case ".cr2", ".cr3", ".nef", ".arw", ".dng", ".raf":
		return true
	}
	return false
}

func isRAWFormat(format string) bool {
	switch strings.ToLower(format) {
	case "cr2", "cr3", "nef", "arw", "dng", "raf":
		return true
	}
	return false
}

func extractRAWPreview(path string) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	if strings.EqualFold(filepath.Ext(path), ".cr3") {
		if preview, previewErr := imagemeta.PreviewCR3(file); previewErr == nil {
			if config, configErr := jpeg.DecodeConfig(bytes.NewReader(preview)); configErr == nil && validateDimensions(config.Width, config.Height) == nil {
				if _, decodeErr := jpeg.Decode(bytes.NewReader(preview)); decodeErr == nil {
					return preview, nil
				}
			}
		}
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			return nil, err
		}
	}
	return largestEmbeddedJPEG(file, maxDecodeBytes)
}

func largestEmbeddedJPEG(reader io.Reader, limit int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("RAW exceeds preview scan limit")
	}
	var best []byte
	var bestArea int64
	for offset := 0; offset+3 < len(data); {
		start := bytes.Index(data[offset:], []byte{0xff, 0xd8, 0xff})
		if start < 0 {
			break
		}
		start += offset
		endRelative := bytes.Index(data[start+3:], []byte{0xff, 0xd9})
		if endRelative < 0 {
			break
		}
		end := start + 3 + endRelative + 2
		candidate := data[start:end]
		config, configErr := jpeg.DecodeConfig(bytes.NewReader(candidate))
		if configErr == nil && validateDimensions(config.Width, config.Height) == nil {
			if _, decodeErr := jpeg.Decode(bytes.NewReader(candidate)); decodeErr == nil {
				area := int64(config.Width) * int64(config.Height)
				if area > bestArea {
					bestArea = area
					best = append([]byte(nil), candidate...)
				}
			}
		}
		offset = start + 3
	}
	if len(best) == 0 {
		return nil, fmt.Errorf("RAW contains no decodable embedded JPEG preview")
	}
	return best, nil
}

func renderJPEGThumbnail(ctx context.Context, sourcePath, destination string, maxDimension int) error {
	return renderJPEGDerivative(ctx, sourcePath, destination, maxDimension, 1)
}

func renderJPEGDerivative(ctx context.Context, sourcePath, destination string, maxDimension, orientation int) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("thumbnail decoder panic: %v", recovered)
		}
	}()
	source, err := decodeImage(sourcePath)
	if err != nil {
		return err
	}
	source = orientedImage(source, orientation)
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if err := validateDimensions(width, height); err != nil {
		return err
	}
	targetWidth, targetHeight := width, height
	if width > maxDimension || height > maxDimension {
		if width >= height {
			targetWidth, targetHeight = maxDimension, max(1, height*maxDimension/width)
		} else {
			targetHeight, targetWidth = maxDimension, max(1, width*maxDimension/height)
		}
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}
	target := image.NewRGBA(image.Rect(0, 0, targetWidth, targetHeight))
	xdraw.CatmullRom.Scale(target, target.Bounds(), source, bounds, xdraw.Over, nil)
	if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
		return err
	}
	temp := destination + ".tmp-" + newID()
	file, err := os.Create(temp)
	if err != nil {
		return err
	}
	encodeErr := jpeg.Encode(file, target, &jpeg.Options{Quality: 88})
	closeErr := file.Close()
	if encodeErr != nil {
		_ = os.Remove(temp)
		return encodeErr
	}
	if closeErr != nil {
		_ = os.Remove(temp)
		return closeErr
	}
	if err := os.Rename(temp, destination); err != nil {
		_ = os.Remove(temp)
		return err
	}
	return nil
}

func writePlaceholderPNG(w io.Writer) error {
	return png.Encode(w, image.NewRGBA(image.Rect(0, 0, 2, 2)))
}
