package local_library

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// livePhotoDescriptor describes the embedded motion video segment of a Live
// Photo / Motion Photo file. These files are a primary still image (JPEG/HEIC)
// with a video stream appended at the end. The descriptor carries enough
// information to locate and serve the video bytes without re-parsing the file
// on every request.
type livePhotoDescriptor struct {
	// VideoOffset is the byte offset within the source file where the embedded
	// video begins.
	VideoOffset int64
	// VideoLength is the number of bytes belonging to the video segment. When
	// zero, the video extends to EOF.
	VideoLength int64
	// VideoMIME is the MIME type of the embedded video (e.g. "video/mp4").
	VideoMIME string
	// Source identifies the flavor that produced this descriptor so the
	// extractor can be re-run only when the source flavor matches.
	Source string
}

// supportedMotionPhotoExtensions lists image extensions that may carry an
// embedded motion-video segment.
var supportedMotionPhotoExtensions = map[string]struct{}{
	".jpg": {}, ".jpeg": {}, ".heic": {}, ".heif": {},
}

// isLivePhotoCandidate reports whether a file path is worth probing for an
// embedded motion-video segment. Used as a cheap pre-filter so the backfill
// path in reconcileKnownFile only opens files that could plausibly be Live
// Photos.
func isLivePhotoCandidate(path string) bool {
	_, ok := supportedMotionPhotoExtensions[strings.ToLower(filepath.Ext(path))]
	return ok
}

// detectLivePhoto inspects a still image file for an embedded motion-video
// segment and returns a descriptor when one is present. The function only
// reads metadata (XMP / APP segments / trailing micro-video directory) and
// never extracts the video bytes; extraction happens lazily on first request.
func detectLivePhoto(path, format, ext string, totalSize int64) (livePhotoDescriptor, bool) {
	return detectLivePhotoWithTrailingScan(path, format, ext, totalSize, true)
}

// detectLivePhotoQuick checks only image metadata. The trailing ftyp scan is
// intentionally omitted during the initial library walk because it can read
// several megabytes from every ordinary JPEG before proving it is not a Live
// Photo. Unchanged assets are fully probed by the backfill path on a later scan.
func detectLivePhotoQuick(path, format, ext string, totalSize int64) (livePhotoDescriptor, bool) {
	return detectLivePhotoWithTrailingScan(path, format, ext, totalSize, false)
}

func detectLivePhotoWithTrailingScan(path, format, ext string, totalSize int64, scanTrailing bool) (livePhotoDescriptor, bool) {
	if _, ok := supportedMotionPhotoExtensions[ext]; !ok && format != "jpeg" && format != "heif" {
		return livePhotoDescriptor{}, false
	}

	file, err := os.Open(path)
	if err != nil {
		return livePhotoDescriptor{}, false
	}
	defer file.Close()

	if desc, ok := detectMotionPhotoXMP(file, totalSize); ok {
		return desc, true
	}
	if !scanTrailing {
		return livePhotoDescriptor{}, false
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return livePhotoDescriptor{}, false
	}
	if desc, ok := detectEmbeddedMP4BySignature(file, totalSize); ok {
		return desc, true
	}

	return livePhotoDescriptor{}, false
}

// detectMotionPhotoXMP parses JPEG APP1 XMP segments (and the equivalent HEIC
// item payload) looking for the Google/Android MotionPhoto container. The XMP
// carries an explicit directory of embedded items with their byte lengths,
// which is the most reliable signal that a still image carries a paired video.
func detectMotionPhotoXMP(file *os.File, totalSize int64) (livePhotoDescriptor, bool) {
	xmpData, err := readXMPFromJPEG(file)
	if err != nil || len(xmpData) == 0 {
		return livePhotoDescriptor{}, false
	}
	text := string(xmpData)

	// Fast path: only run the XML parse when the file advertises a motion
	// photo. This avoids the cost of unmarshalling XMP for every JPEG.
	if !strings.Contains(text, "MotionPhoto") &&
		!strings.Contains(text, "Container:Directory") &&
		!strings.Contains(text, "live.subVideo") {
		return livePhotoDescriptor{}, false
	}

	if desc, ok := parseMotionPhotoXMPContainer(text, totalSize); ok {
		return desc, true
	}

	// Google's older schema stores the video length in an attribute rather
	// than the container directory.
	if videoLength := extractXMPIntAttribute(text, "OpCamera:VideoLength"); videoLength > 0 {
		offset := totalSize - videoLength
		if offset > 0 {
			return livePhotoDescriptor{
				VideoOffset: offset,
				VideoLength: videoLength,
				VideoMIME:   "video/mp4",
				Source:      "xmp-oplus",
			}, true
		}
	}

	return livePhotoDescriptor{}, false
}

// parseMotionPhotoXMPContainer walks the XMP text looking for
// Container:Item elements with an Item:Mime of a motion video. The RDF/XML
// schema used by Google/Android wraps items in rdf:Seq/rdf:li elements whose
// parseType="Resource" makes them awkward to unmarshal with a single struct,
// so a lightweight regex-free scan is used instead: locate every
// "Container:Item" occurrence and harvest its Mime/Semantic/Length attributes.
func parseMotionPhotoXMPContainer(text string, totalSize int64) (livePhotoDescriptor, bool) {
	const itemMarker = "Container:Item"
	search := text
	for {
		idx := strings.Index(search, itemMarker)
		if idx < 0 {
			break
		}
		rest := search[idx:]
		end := strings.Index(rest, "/>")
		if end < 0 {
			end = strings.Index(rest, ">")
		}
		if end < 0 {
			break
		}
		element := rest[:end]
		search = rest[end:]

		mime := extractAttribute(element, "Item:Mime")
		semantic := extractAttribute(element, "Item:Semantic")
		if isMotionVideoMime(mime) || isMotionVideoSemantic(semantic) {
			lengthStr := extractAttribute(element, "Item:Length")
			length := parseInt64(lengthStr)
			if length <= 0 {
				continue
			}
			offset := totalSize - length
			if offset <= 0 {
				continue
			}
			return livePhotoDescriptor{
				VideoOffset: offset,
				VideoLength: length,
				VideoMIME:   defaultMotionVideoMIME(mime),
				Source:      "xmp",
			}, true
		}
	}
	return livePhotoDescriptor{}, false
}

// extractAttribute reads a "Ns:Attr=\"value\"" attribute from a raw XML element
// string, tolerating whitespace and both quote styles.
func extractAttribute(element, qualified string) string {
	idx := strings.Index(element, qualified)
	if idx < 0 {
		return ""
	}
	tail := element[idx+len(qualified):]
	eq := strings.Index(tail, "=")
	if eq < 0 {
		return ""
	}
	tail = strings.TrimLeft(tail[eq+1:], " \t\r\n")
	if len(tail) == 0 {
		return ""
	}
	quote := byte('"')
	if tail[0] == '\'' {
		quote = '\''
	}
	tail = tail[1:]
	end := strings.IndexByte(tail, quote)
	if end < 0 {
		return ""
	}
	return strings.TrimSpace(tail[:end])
}

func parseInt64(value string) int64 {
	var n int64
	for _, r := range value {
		if r < '0' || r > '9' {
			return 0
		}
		n = n*10 + int64(r-'0')
	}
	return n
}

// extractXMPIntAttribute reads a "Namespace:Attr" attribute from raw XMP text
// and returns its integer value (or zero when absent / non-numeric).
func extractXMPIntAttribute(text, qualified string) int64 {
	return parseInt64(extractAttribute(text, qualified))
}

// detectEmbeddedMP4BySignature scans the file for an MP4 'ftyp' box signature
// and treats the first occurrence as the start of the embedded video segment.
// This is the fallback path for vendors (e.g. certain Xiaomi builds) that
// append a micro-video directory but do not emit the XMP MotionPhoto block.
func detectEmbeddedMP4BySignature(file *os.File, totalSize int64) (livePhotoDescriptor, bool) {
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return livePhotoDescriptor{}, false
	}
	const scanChunk = 256 * 1024
	const maxScanBytes = 8 * 1024 * 1024
	buffer := make([]byte, scanChunk+8)
	var position int64
	for position < maxScanBytes {
		read, err := file.ReadAt(buffer, position)
		if read < 8 {
			break
		}
		limit := read - 8
		for index := 0; index <= limit; index++ {
			if isFTYP(buffer[index : index+8]) {
				boxSize := int64(binary.BigEndian.Uint32(buffer[index : index+4]))
				offset := position + int64(index)
				if offset <= 0 || offset >= totalSize {
					continue
				}
				length := totalSize - offset
				if boxSize > 8 && boxSize <= length {
					length = boxSize
				}
				if length < 16 {
					continue
				}
				return livePhotoDescriptor{
					VideoOffset: offset,
					VideoLength: length,
					VideoMIME:   "video/mp4",
					Source:      "ftyp-scan",
				}, true
			}
		}
		position += int64(limit)
		if err == io.EOF {
			break
		}
		if err != nil {
			break
		}
	}
	return livePhotoDescriptor{}, false
}

func isFTYP(sample []byte) bool {
	return len(sample) >= 8 &&
		sample[4] == 'f' && sample[5] == 't' && sample[6] == 'y' && sample[7] == 'p'
}

func isMotionVideoMime(mime string) bool {
	switch strings.ToLower(strings.TrimSpace(mime)) {
	case "video/mp4", "video/quicktime", "video/3gpp", "video/mov":
		return true
	}
	return false
}

func isMotionVideoSemantic(semantic string) bool {
	switch strings.ToLower(strings.TrimSpace(semantic)) {
	case "motionphoto", "motion", "video", "livephoto":
		return true
	}
	return false
}

func defaultMotionVideoMIME(mime string) string {
	mime = strings.ToLower(strings.TrimSpace(mime))
	if mime == "" {
		return "video/mp4"
	}
	return mime
}

// readXMPFromJPEG extracts the XMP packet from a JPEG's APP1 segments. A JPEG
// may carry multiple APP1 segments (Exif + XMP); only the XMP payload is
// returned. The reader is expected to be positioned at the start of the file.
func readXMPFromJPEG(file *os.File) ([]byte, error) {
	header := make([]byte, 2)
	if _, err := io.ReadFull(file, header); err != nil {
		return nil, err
	}
	if header[0] != 0xff || header[1] != 0xd8 {
		return nil, errors.New("not a JPEG")
	}
	for {
		marker := make([]byte, 2)
		if _, err := io.ReadFull(file, marker); err != nil {
			return nil, err
		}
		if marker[0] != 0xff {
			return nil, errors.New("invalid JPEG marker")
		}
		// SOS marks the start of the scan data; no further APP segments.
		if marker[1] == 0xda {
			return nil, nil
		}
		lengthBytes := make([]byte, 2)
		if _, err := io.ReadFull(file, lengthBytes); err != nil {
			return nil, err
		}
		segmentLength := int(binary.BigEndian.Uint16(lengthBytes))
		if segmentLength < 2 {
			return nil, errors.New("invalid JPEG segment length")
		}
		// APP1 = 0xffe1
		if marker[1] == 0xe1 {
			payload := make([]byte, segmentLength-2)
			if _, err := io.ReadFull(file, payload); err != nil {
				return nil, err
			}
			if xmp, ok := extractXMPFromAPP1(payload); ok {
				return xmp, nil
			}
			continue
		}
		// Skip other markers (APPn, COM, DQT, etc.)
		if _, err := io.CopyN(io.Discard, file, int64(segmentLength-2)); err != nil {
			return nil, err
		}
	}
}

// extractXMPFromAPP1 returns the XMP payload when an APP1 segment starts with
// the "http://ns.adobe.com/xap/1.0/" namespace signature.
func extractXMPFromAPP1(payload []byte) ([]byte, bool) {
	const xmpNamespace = "http://ns.adobe.com/xap/1.0/"
	if len(payload) < len(xmpNamespace)+1 {
		return nil, false
	}
	if string(payload[:len(xmpNamespace)]) != xmpNamespace {
		return nil, false
	}
	xmp := payload[len(xmpNamespace)+1:]
	return xmp, true
}

// extractLivePhotoVideo writes the embedded video segment described by desc to
// destination. The source file is read only within [offset, offset+length).
func extractLivePhotoVideo(sourcePath string, desc livePhotoDescriptor, destination string) error {
	if desc.VideoOffset <= 0 {
		return errors.New("invalid live photo video offset")
	}
	file, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer file.Close()
	if _, err := file.Seek(desc.VideoOffset, io.SeekStart); err != nil {
		return err
	}
	length := desc.VideoLength
	if length <= 0 {
		info, statErr := file.Stat()
		if statErr != nil {
			return statErr
		}
		length = info.Size() - desc.VideoOffset
	}
	if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
		return err
	}
	temp := destination + ".tmp-" + newID()
	out, err := os.Create(temp)
	if err != nil {
		return err
	}
	if _, err := io.CopyN(out, file, length); err != nil {
		_ = out.Close()
		_ = os.Remove(temp)
		return err
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(temp)
		return err
	}
	if err := os.Rename(temp, destination); err != nil {
		_ = os.Remove(temp)
		return err
	}
	return nil
}

// livePhotoVideoFileName returns the cache-relative file name for an extracted
// live photo video. The modified time and size act as a content version so a
// stale extract is never served after the source changes.
func livePhotoVideoFileName(id AssetID, modifiedAtNS, byteSize int64) string {
	return fmt.Sprintf("%s-%x-%x.mp4", string(id), modifiedAtNS, byteSize)
}

// IsLivePhotoFile reports whether the given file path contains an embedded
// motion-video segment (Live Photo / Motion Photo). It is a convenience
// wrapper around detectLivePhoto for use outside the local_library package.
func IsLivePhotoFile(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	if _, ok := supportedMotionPhotoExtensions[ext]; !ok {
		return false
	}
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	format, _ := formatForExtension(ext)
	_, ok := detectLivePhoto(path, format, ext, info.Size())
	return ok
}
