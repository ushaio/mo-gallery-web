package image

import (
	"bytes"
	"fmt"
	stdimage "image"
	"image/jpeg"
	"image/png"
	_ "image/png"
	"log"
	"math"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	nativewebp "github.com/HugoSmits86/nativewebp"
	avifcodec "github.com/gen2brain/avif"
	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/tiff"
	_ "golang.org/x/image/webp"
)

const (
	maxCompressionDimension = 4096
	minCompressionDimension = 640
	maxCompressionPixels    = 180_000_000
)

// OriginalFitsAsRendition reports whether the source file already satisfies
// the compressed-rendition constraints (web-friendly format, size under
// maxBytes, long edge within maxCompressionDimension), so compression can be
// skipped and the original uploaded as-is. Only file headers are read.
func OriginalFitsAsRendition(sourcePath string, maxBytes int64) bool {
	switch strings.ToLower(filepath.Ext(sourcePath)) {
	case ".jpg", ".jpeg", ".png", ".webp":
	default:
		return false
	}
	info, err := os.Stat(sourcePath)
	if err != nil || info.Size() == 0 || info.Size() > maxBytes {
		return false
	}
	file, err := os.Open(sourcePath)
	if err != nil {
		return false
	}
	defer file.Close()
	config, _, err := stdimage.DecodeConfig(file)
	if err != nil {
		return false
	}
	return max(config.Width, config.Height) <= maxCompressionDimension
}

// CompressToJPEG re-encodes a photo as a lossy JPEG rendition under maxBytes.
// It replaces the lossless WebP ladder: quality is lowered before pixels are
// dropped, each resize is estimated from the previous encode's actual output
// size, and every attempt is logged with its cost.
func CompressToJPEG(sourcePath, destinationPath string, orientation int, maxBytes int64) error {
	if maxBytes <= 0 {
		return fmt.Errorf("压缩目标大小必须大于 0")
	}
	decodeStart := time.Now()
	source, err := decodeForCompression(sourcePath)
	if err != nil {
		return fmt.Errorf("无法解码图片: %w", err)
	}
	log.Printf("[compress] jpeg decode %s took %s", filepath.Base(sourcePath), time.Since(decodeStart))
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width <= 0 || height <= 0 || int64(width)*int64(height) > maxCompressionPixels {
		return fmt.Errorf("图片尺寸无效或像素数量超过限制: %dx%d", width, height)
	}

	prepareStart := time.Now()
	current := scaleBilinear(orientForCompression(source, orientation), maxCompressionDimension)
	log.Printf("[compress] jpeg prepare orientation=%d source=%dx%d took %s", orientation, width, height, time.Since(prepareStart))
	qualities := []int{85, 75, 65}
	var smallest []byte

encode:
	for round := 0; round < 3; round++ {
		for _, quality := range qualities {
			attemptStart := time.Now()
			encoded, encodeErr := encodeJPEG(current, quality)
			log.Printf("[compress] jpeg round=%d quality=%d source=%dx%d took %s output=%d bytes target=%d",
				round, quality, current.Bounds().Dx(), current.Bounds().Dy(), time.Since(attemptStart), len(encoded), maxBytes)
			if encodeErr != nil {
				return fmt.Errorf("JPEG 编码失败: %w", encodeErr)
			}
			if smallest == nil || len(encoded) < len(smallest) {
				smallest = encoded
			}
			if int64(len(encoded)) <= maxBytes {
				return os.WriteFile(destinationPath, encoded, 0o600)
			}
			if quality == qualities[len(qualities)-1] {
				currentBounds := current.Bounds()
				longEdge := max(currentBounds.Dx(), currentBounds.Dy())
				if longEdge <= minCompressionDimension {
					break encode
				}
				ratio := math.Sqrt(float64(maxBytes)/float64(len(encoded))) * 0.92
				ratio = math.Max(0.25, ratio)
				nextLongEdge := max(minCompressionDimension, int(float64(longEdge)*ratio))
				if nextLongEdge >= longEdge {
					break encode
				}
				current = scaleBilinear(current, nextLongEdge)
			}
		}
	}

	return fmt.Errorf(
		"无法将图片压缩到 %.1f MB（最小结果 %.1f MB）",
		float64(maxBytes)/(1024*1024),
		float64(len(smallest))/(1024*1024),
	)
}

// CompressToAVIF decodes a desktop upload, applies its EXIF orientation,
// bounds its dimensions, and iteratively encodes it below maxBytes.
func CompressToAVIF(sourcePath, destinationPath string, orientation int, maxBytes int64) error {
	if maxBytes <= 0 {
		return fmt.Errorf("压缩目标大小必须大于 0")
	}
	source, err := decodeForCompression(sourcePath)
	if err != nil {
		return fmt.Errorf("无法解码图片: %w", err)
	}
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width <= 0 || height <= 0 || int64(width)*int64(height) > maxCompressionPixels {
		return fmt.Errorf("图片尺寸无效或像素数量超过限制: %dx%d", width, height)
	}

	current := orientForCompression(source, orientation)
	current = resizeForCompression(current, maxCompressionDimension)
	qualities := []int{82, 70, 58, 46, 40}
	var smallest []byte

	for scaleRound := 0; scaleRound < 5; scaleRound++ {
		for _, quality := range qualities {
			encoded, encodeErr := encodeAVIF(current, quality)
			if encodeErr != nil {
				return fmt.Errorf("AVIF 编码失败: %w", encodeErr)
			}
			if len(smallest) == 0 || len(encoded) < len(smallest) {
				smallest = encoded
			}
			if int64(len(encoded)) <= maxBytes {
				return os.WriteFile(destinationPath, encoded, 0o600)
			}
		}

		currentBounds := current.Bounds()
		longEdge := max(currentBounds.Dx(), currentBounds.Dy())
		if longEdge <= minCompressionDimension {
			break
		}
		ratio := math.Sqrt(float64(maxBytes)/float64(len(smallest))) * 0.92
		ratio = math.Max(0.55, math.Min(0.8, ratio))
		nextLongEdge := max(minCompressionDimension, int(float64(longEdge)*ratio))
		if nextLongEdge >= longEdge {
			break
		}
		current = resizeForCompression(current, nextLongEdge)
	}

	return fmt.Errorf(
		"无法将图片压缩到 %.1f MB（最小结果 %.1f MB）",
		float64(maxBytes)/(1024*1024),
		float64(len(smallest))/(1024*1024),
	)
}

// CompressToWebP decodes a desktop upload, applies its EXIF orientation,
// bounds its dimensions, and iteratively encodes it below maxBytes. The
// encoder is pure Go and does not depend on a storage plugin or system codec.
func CompressToWebP(sourcePath, destinationPath string, orientation int, maxBytes int64) error {
	if maxBytes <= 0 {
		return fmt.Errorf("压缩目标大小必须大于 0")
	}
	decodeStart := time.Now()
	source, err := decodeForCompression(sourcePath)
	if err != nil {
		return fmt.Errorf("无法解码图片: %w", err)
	}
	log.Printf("[compress] webp decode %s took %s", filepath.Base(sourcePath), time.Since(decodeStart))
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width <= 0 || height <= 0 || int64(width)*int64(height) > maxCompressionPixels {
		return fmt.Errorf("图片尺寸无效或像素数量超过限制: %dx%d", width, height)
	}

	current := orientForCompression(source, orientation)
	current = resizeForCompression(current, maxCompressionDimension)
	levels := []nativewebp.CompressionLevel{
		nativewebp.BestCompression,
		nativewebp.DefaultCompression,
		nativewebp.BestSpeed,
	}
	var smallest []byte

	for scaleRound := 0; scaleRound < 5; scaleRound++ {
		for _, level := range levels {
			attemptStart := time.Now()
			encoded, encodeErr := encodeWebP(current, level)
			log.Printf("[compress] webp round=%d level=%v source=%dx%d took %s output=%d bytes target=%d",
				scaleRound, level, current.Bounds().Dx(), current.Bounds().Dy(), time.Since(attemptStart), len(encoded), maxBytes)
			if encodeErr != nil {
				return fmt.Errorf("WebP 编码失败: %w", encodeErr)
			}
			if len(smallest) == 0 || len(encoded) < len(smallest) {
				smallest = encoded
			}
			if int64(len(encoded)) <= maxBytes {
				return os.WriteFile(destinationPath, encoded, 0o600)
			}
		}

		currentBounds := current.Bounds()
		longEdge := max(currentBounds.Dx(), currentBounds.Dy())
		if longEdge <= minCompressionDimension {
			break
		}
		ratio := math.Sqrt(float64(maxBytes)/float64(len(smallest))) * 0.92
		ratio = math.Max(0.55, math.Min(0.8, ratio))
		nextLongEdge := max(minCompressionDimension, int(float64(longEdge)*ratio))
		if nextLongEdge >= longEdge {
			break
		}
		current = resizeForCompression(current, nextLongEdge)
	}

	return fmt.Errorf(
		"无法将图片压缩到 %.1f MB（最小结果 %.1f MB）",
		float64(maxBytes)/(1024*1024),
		float64(len(smallest))/(1024*1024),
	)
}

// StripMetadata re-encodes an image after applying its orientation. The
// standard encoders do not copy EXIF blocks, so GPS and other private tags are
// removed before a plugin receives the file. Unsupported source formats fall
// back to a clean JPEG rather than silently preserving metadata.
func StripMetadata(sourcePath, destinationPath string, orientation int) error {
	source, err := decodeForCompression(sourcePath)
	if err != nil {
		return fmt.Errorf("无法解码图片: %w", err)
	}
	source = orientForCompression(source, orientation)
	file, err := os.Create(destinationPath)
	if err != nil {
		return err
	}
	closeWithError := func(writeErr error) error {
		closeErr := file.Close()
		if writeErr != nil {
			_ = os.Remove(destinationPath)
			return writeErr
		}
		if closeErr != nil {
			_ = os.Remove(destinationPath)
			return closeErr
		}
		return nil
	}
	switch strings.ToLower(filepath.Ext(destinationPath)) {
	case ".png":
		return closeWithError(png.Encode(file, source))
	case ".avif":
		encoded, encodeErr := encodeAVIF(source, 90)
		if encodeErr == nil {
			_, encodeErr = file.Write(encoded)
		}
		return closeWithError(encodeErr)
	default:
		return closeWithError(jpeg.Encode(file, source, &jpeg.Options{Quality: 95}))
	}
}

func decodeForCompression(sourcePath string) (stdimage.Image, error) {
	file, err := os.Open(sourcePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	if strings.EqualFold(filepath.Ext(sourcePath), ".avif") {
		return avifcodec.Decode(file, avifcodec.Options{AutoRotate: true})
	}
	decoded, _, err := stdimage.Decode(file)
	return decoded, err
}

// ReadDimensions returns the image dimensions, reading only the file header
// when the format supports it. AVIF is not registered with the standard
// decoder and falls back to a full decode.
func ReadDimensions(sourcePath string) (int, int, error) {
	file, err := os.Open(sourcePath)
	if err != nil {
		return 0, 0, err
	}
	defer file.Close()
	config, _, err := stdimage.DecodeConfig(file)
	if err == nil {
		return config.Width, config.Height, nil
	}
	decoded, decodeErr := decodeForCompression(sourcePath)
	if decodeErr != nil {
		return 0, 0, decodeErr
	}
	bounds := decoded.Bounds()
	return bounds.Dx(), bounds.Dy(), nil
}

// GenerateThumbnailAVIF creates a temporary, orientation-corrected AVIF
// rendition for a remote storage plugin upload. AVIF thumbnails are much
// smaller than JPEG at the same visual quality, which matters for gallery grids.
func GenerateThumbnailAVIF(sourcePath string, orientation int) (string, error) {
	decoded, err := decodeForCompression(sourcePath)
	if err != nil {
		return "", err
	}
	decoded = orientForCompression(decoded, orientation)
	decoded = scaleBilinear(decoded, 512)
	thumbEncodeStart := time.Now()
	encoded, err := encodeAVIF(decoded, 86)
	if err != nil {
		return "", err
	}
	log.Printf("[compress] thumbnail-avif encode 512px took %s output=%d bytes", time.Since(thumbEncodeStart), len(encoded))
	file, err := os.CreateTemp("", "mo-gallery-thumbnail-*.avif")
	if err != nil {
		return "", err
	}
	path := file.Name()
	defer func() {
		if err != nil {
			_ = file.Close()
			_ = os.Remove(path)
		}
	}()
	if _, writeErr := file.Write(encoded); writeErr != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return "", writeErr
	}
	if closeErr := file.Close(); closeErr != nil {
		_ = os.Remove(path)
		return "", closeErr
	}
	return path, nil
}

var avifWarmup sync.Once

// WarmupAVIFEncoder pre-compiles the wasm-backed AVIF encoder. The first
// encode in a process otherwise pays a multi-second wazero compilation, which
// would land inside the first photo upload. Safe to call concurrently; run it
// in a background goroutine during startup.
func WarmupAVIFEncoder() {
	avifWarmup.Do(func() {
		_, _ = encodeAVIF(stdimage.NewNRGBA(stdimage.Rect(0, 0, 1, 1)), 86)
	})
}

func encodeAVIF(source stdimage.Image, quality int) ([]byte, error) {
	var output bytes.Buffer
	err := avifcodec.Encode(&output, source, avifcodec.Options{
		Quality:           quality,
		QualityAlpha:      quality,
		Speed:             8,
		ChromaSubsampling: stdimage.YCbCrSubsampleRatio420,
	})
	return output.Bytes(), err
}

func encodeWebP(source stdimage.Image, level nativewebp.CompressionLevel) ([]byte, error) {
	var output bytes.Buffer
	err := nativewebp.Encode(&output, source, &nativewebp.Options{
		CompressionLevel: level,
	})
	return output.Bytes(), err
}

func encodeJPEG(source stdimage.Image, quality int) ([]byte, error) {
	var output bytes.Buffer
	err := jpeg.Encode(&output, source, &jpeg.Options{Quality: quality})
	return output.Bytes(), err
}

// scaleBilinear downscales with ApproxBiLinear, which is roughly an order of
// magnitude faster than CatmullRom at photo sizes with a negligible visual
// difference for distribution renditions.
func scaleBilinear(source stdimage.Image, maxDimension int) stdimage.Image {
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width <= maxDimension && height <= maxDimension {
		return source
	}
	targetWidth, targetHeight := width, height
	if width >= height {
		targetWidth = maxDimension
		targetHeight = max(1, height*maxDimension/width)
	} else {
		targetHeight = maxDimension
		targetWidth = max(1, width*maxDimension/height)
	}
	target := stdimage.NewNRGBA(stdimage.Rect(0, 0, targetWidth, targetHeight))
	xdraw.ApproxBiLinear.Scale(target, target.Bounds(), source, bounds, xdraw.Over, nil)
	return target
}

func resizeForCompression(source stdimage.Image, maxDimension int) stdimage.Image {
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width <= maxDimension && height <= maxDimension {
		return source
	}
	targetWidth, targetHeight := width, height
	if width >= height {
		targetWidth = maxDimension
		targetHeight = max(1, height*maxDimension/width)
	} else {
		targetHeight = maxDimension
		targetWidth = max(1, width*maxDimension/height)
	}
	target := stdimage.NewNRGBA(stdimage.Rect(0, 0, targetWidth, targetHeight))
	xdraw.CatmullRom.Scale(target, target.Bounds(), source, bounds, xdraw.Over, nil)
	return target
}

// orientForCompression returns an orientation-corrected copy. It rewrites raw
// NRGBA pixel data instead of per-pixel At/Set, which costs seconds at photo
// sizes because every At() re-converts YCbCr through the color interface.
func orientForCompression(source stdimage.Image, orientation int) stdimage.Image {
	if orientation < 2 || orientation > 8 {
		return source
	}
	return orientNRGBA(asNRGBA(source), orientation)
}

// asNRGBA converts through a fast row-based resample pass; a same-size copy
// through ApproxBiLinear is much cheaper than per-pixel color conversion.
func asNRGBA(source stdimage.Image) *stdimage.NRGBA {
	if nrgba, ok := source.(*stdimage.NRGBA); ok {
		return nrgba
	}
	bounds := source.Bounds()
	target := stdimage.NewNRGBA(stdimage.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	xdraw.ApproxBiLinear.Scale(target, target.Bounds(), source, bounds, xdraw.Over, nil)
	return target
}

func orientNRGBA(src *stdimage.NRGBA, orientation int) *stdimage.NRGBA {
	bounds := src.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	outWidth, outHeight := width, height
	if orientation >= 5 {
		outWidth, outHeight = height, width
	}
	target := stdimage.NewNRGBA(stdimage.Rect(0, 0, outWidth, outHeight))
	for y := 0; y < outHeight; y++ {
		for x := 0; x < outWidth; x++ {
			var sx, sy int
			switch orientation {
			case 2:
				sx, sy = width-1-x, y
			case 3:
				sx, sy = width-1-x, height-1-y
			case 4:
				sx, sy = x, height-1-y
			case 5:
				sx, sy = y, x
			case 6:
				sx, sy = y, height-1-x
			case 7:
				sx, sy = width-1-y, height-1-x
			case 8:
				sx, sy = width-1-y, x
			}
			si := src.PixOffset(bounds.Min.X+sx, bounds.Min.Y+sy)
			di := target.PixOffset(x, y)
			copy(target.Pix[di:di+4], src.Pix[si:si+4])
		}
	}
	return target
}
