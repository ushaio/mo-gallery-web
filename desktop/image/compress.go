package image

import (
	"bytes"
	"fmt"
	stdimage "image"
	_ "image/jpeg"
	_ "image/png"
	"math"
	"os"
	"path/filepath"
	"strings"

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

func orientForCompression(source stdimage.Image, orientation int) stdimage.Image {
	if orientation < 2 || orientation > 8 {
		return source
	}
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	outputWidth, outputHeight := width, height
	if orientation >= 5 {
		outputWidth, outputHeight = height, width
	}
	target := stdimage.NewNRGBA(stdimage.Rect(0, 0, outputWidth, outputHeight))
	for y := 0; y < outputHeight; y++ {
		for x := 0; x < outputWidth; x++ {
			sx, sy := x, y
			switch orientation {
			case 2:
				sx = width - 1 - x
			case 3:
				sx, sy = width-1-x, height-1-y
			case 4:
				sy = height - 1 - y
			case 5:
				sx, sy = y, x
			case 6:
				sx, sy = y, height-1-x
			case 7:
				sx, sy = width-1-y, height-1-x
			case 8:
				sx, sy = width-1-y, x
			}
			target.Set(x, y, source.At(bounds.Min.X+sx, bounds.Min.Y+sy))
		}
	}
	return target
}
