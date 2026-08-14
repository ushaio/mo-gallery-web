package services

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"mo-gallery-desktop/image"
)

// UploadService 处理照片上传
type UploadService struct {
	proxy            *ProxyClient
	clipboardMu      sync.Mutex
	clipboardTempDir string
}

func NewUploadService(proxy *ProxyClient) *UploadService {
	return &UploadService{proxy: proxy}
}

// PreparedFile 预处理后的文件信息
type PreparedFile struct {
	AssetID  string          `json:"assetId,omitempty"`
	FilePath string          `json:"filePath"`
	FileName string          `json:"fileName"`
	FileSize int64           `json:"fileSize"`
	Hash     string          `json:"hash"`
	Exif     *image.ExifData `json:"exif,omitempty"`
	Error    string          `json:"error,omitempty"`
}

// DuplicateInfo 重复照片信息
type DuplicateInfo struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	ThumbnailURL string `json:"thumbnailUrl,omitempty"`
	URL          string `json:"url,omitempty"`
	CreatedAt    string `json:"createdAt,omitempty"`
}

// DuplicateCheckResult 去重检查结果
type DuplicateCheckResult struct {
	Duplicates    map[string]*DuplicateInfo `json:"duplicates"`
	HasDuplicates bool                      `json:"hasDuplicates"`
}

// UploadSettings 上传参数
type UploadSettings struct {
	Title             string   `json:"title"`
	Categories        []string `json:"categories"`
	StorageSourceID   string   `json:"storageSourceId"`
	StorageProvider   string   `json:"storageProvider"`
	StoragePath       string   `json:"storagePath"`
	StoragePathFull   bool     `json:"storagePathFull"`
	ShowFlag          bool     `json:"showFlag"`
	CompressEnabled   bool     `json:"compressEnabled"`
	CompressionFormat string   `json:"compressionFormat"`
	MaxSizeMB         float64  `json:"maxSizeMB"`
	StripGPS          bool     `json:"stripGPS"`
	FilmRollID        string   `json:"filmRollId"`
	OriginFlag        string   `json:"originFlag"`
}

// UploadResult 单张上传结果
type UploadResult struct {
	FilePath    string         `json:"filePath"`
	Success     bool           `json:"success"`
	Photo       *PhotoDTO      `json:"photo,omitempty"`
	Error       string         `json:"error,omitempty"`
	IsDuplicate bool           `json:"isDuplicate,omitempty"`
	Existing    *DuplicateInfo `json:"existing,omitempty"`
}

// AiImageUploadResult is a storage-only upload result. It does not create a Photo record.
type AiImageUploadResult struct {
	URL string `json:"url"`
	Key string `json:"key"`
}

// PrepareUpload 预处理文件：计算哈希 + 提取 EXIF
var supportedUploadExtensions = map[string]string{
	".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG", ".webp": "WebP",
	".avif": "AVIF", ".tif": "TIFF", ".tiff": "TIFF",
}

const maxClipboardImageBytes = 100 * 1024 * 1024

const desktopCompressedUploadMaxBytes = 4 * 1024 * 1024

var clipboardImageExtensions = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
	"image/avif": ".avif",
	"image/tiff": ".tiff",
}

func (s *UploadService) clipboardDirectory() (string, error) {
	s.clipboardMu.Lock()
	defer s.clipboardMu.Unlock()
	if s.clipboardTempDir != "" {
		return s.clipboardTempDir, nil
	}
	directory, err := os.MkdirTemp("", "mo-gallery-clipboard-")
	if err != nil {
		return "", fmt.Errorf("无法创建剪贴板图片临时目录: %w", err)
	}
	s.clipboardTempDir = directory
	return directory, nil
}

// PrepareClipboardUpload persists browser clipboard images for the lifetime of
// the app, then sends them through the same validation, hash, and EXIF pipeline
// as files selected from disk.
func (s *UploadService) PrepareClipboardUpload(fileNames, dataURLs []string) ([]PreparedFile, error) {
	if len(fileNames) == 0 || len(fileNames) != len(dataURLs) {
		return nil, errors.New("剪贴板图片数据不完整")
	}
	directory, err := s.clipboardDirectory()
	if err != nil {
		return nil, err
	}

	paths := make([]string, 0, len(dataURLs))
	displayNames := make([]string, 0, len(dataURLs))
	for index, dataURL := range dataURLs {
		header, encoded, found := strings.Cut(dataURL, ",")
		if !found || !strings.HasPrefix(header, "data:") || !strings.HasSuffix(header, ";base64") {
			return nil, fmt.Errorf("第 %d 张剪贴板图片数据无效", index+1)
		}
		mimeType := strings.ToLower(strings.TrimSuffix(strings.TrimPrefix(header, "data:"), ";base64"))
		extension, supported := clipboardImageExtensions[mimeType]
		if !supported {
			return nil, fmt.Errorf("不支持剪贴板图片格式 %s；支持 JPG、PNG、WebP、AVIF、TIFF", mimeType)
		}
		if len(encoded) > base64.StdEncoding.EncodedLen(maxClipboardImageBytes) {
			return nil, fmt.Errorf("第 %d 张剪贴板图片超过 100 MB", index+1)
		}
		data, decodeErr := base64.StdEncoding.DecodeString(encoded)
		if decodeErr != nil {
			return nil, fmt.Errorf("第 %d 张剪贴板图片解码失败", index+1)
		}
		if len(data) == 0 || len(data) > maxClipboardImageBytes {
			return nil, fmt.Errorf("第 %d 张剪贴板图片大小无效", index+1)
		}

		tempFile, createErr := os.CreateTemp(directory, "clipboard-*"+extension)
		if createErr != nil {
			return nil, fmt.Errorf("保存剪贴板图片失败: %w", createErr)
		}
		tempPath := tempFile.Name()
		if _, writeErr := tempFile.Write(data); writeErr != nil {
			_ = tempFile.Close()
			_ = os.Remove(tempPath)
			return nil, fmt.Errorf("保存剪贴板图片失败: %w", writeErr)
		}
		if closeErr := tempFile.Close(); closeErr != nil {
			_ = os.Remove(tempPath)
			return nil, fmt.Errorf("保存剪贴板图片失败: %w", closeErr)
		}
		paths = append(paths, tempPath)

		name := strings.TrimSpace(filepath.Base(fileNames[index]))
		if name == "" || name == "." {
			name = fmt.Sprintf("剪贴板图片-%d%s", index+1, extension)
		} else {
			name = strings.TrimSuffix(name, filepath.Ext(name)) + extension
		}
		displayNames = append(displayNames, name)
	}

	prepared, err := s.PrepareUpload(paths)
	if err != nil {
		return nil, err
	}
	for index := range prepared {
		prepared[index].FileName = displayNames[index]
	}
	return prepared, nil
}

func (s *UploadService) CleanupClipboardUploads() {
	s.clipboardMu.Lock()
	directory := s.clipboardTempDir
	s.clipboardTempDir = ""
	s.clipboardMu.Unlock()
	if directory != "" {
		_ = os.RemoveAll(directory)
	}
}

func validateUploadFile(filePath string) error {
	info, err := os.Stat(filePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("文件不存在")
		}
		return fmt.Errorf("无法读取文件: %w", err)
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("所选路径不是普通文件")
	}
	extension := strings.ToLower(filepath.Ext(filePath))
	format, supported := supportedUploadExtensions[extension]
	if !supported {
		return fmt.Errorf("当前上传服务不支持 %s 格式；支持 JPG、PNG、WebP、AVIF、TIFF", uploadFormatLabel(extension))
	}
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("无法打开文件: %w", err)
	}
	defer file.Close()
	header := make([]byte, 16)
	read, err := io.ReadFull(file, header)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) {
		return fmt.Errorf("无法读取文件内容: %w", err)
	}
	if !matchesUploadSignature(format, header[:read]) {
		return fmt.Errorf("文件内容与 %s 扩展名不匹配，无法上传", strings.TrimPrefix(extension, "."))
	}
	return nil
}

func uploadFormatLabel(extension string) string {
	if extension == "" {
		return "无扩展名文件"
	}
	extension = strings.ToUpper(strings.TrimPrefix(extension, "."))
	switch extension {
	case "CR2", "CR3", "NEF", "ARW", "DNG", "RAF", "RW2":
		return "RAW"
	case "HEIC", "HEIF":
		return "HEIC/HEIF"
	default:
		return extension
	}
}

func matchesUploadSignature(format string, header []byte) bool {
	switch format {
	case "JPEG":
		return len(header) >= 3 && header[0] == 0xff && header[1] == 0xd8 && header[2] == 0xff
	case "PNG":
		return len(header) >= 8 && string(header[:8]) == "\x89PNG\r\n\x1a\n"
	case "WebP":
		return len(header) >= 12 && string(header[:4]) == "RIFF" && string(header[8:12]) == "WEBP"
	case "AVIF":
		if len(header) < 12 || string(header[4:8]) != "ftyp" {
			return false
		}
		brand := string(header[8:12])
		return brand == "avif" || brand == "avis"
	case "TIFF":
		return len(header) >= 4 && (string(header[:4]) == "II*\x00" || string(header[:4]) == "MM\x00*")
	default:
		return false
	}
}

func (s *UploadService) PrepareUpload(filePaths []string) ([]PreparedFile, error) {
	results := make([]PreparedFile, len(filePaths))

	for i, fp := range filePaths {
		pf := PreparedFile{
			FilePath: fp,
			FileName: filepath.Base(fp),
		}

		if err := validateUploadFile(fp); err != nil {
			pf.Error = err.Error()
			results[i] = pf
			continue
		}
		info, err := os.Stat(fp)
		if err != nil {
			pf.Error = "无法读取文件: " + err.Error()
			results[i] = pf
			continue
		}
		pf.FileSize = info.Size()

		// SHA-256 哈希
		hash, err := fileHash(fp)
		if err != nil {
			pf.Error = "计算哈希失败: " + err.Error()
			results[i] = pf
			continue
		}
		pf.Hash = hash

		// EXIF 提取
		exifData, err := image.ExtractExif(fp)
		if err != nil {
			pf.Exif = &image.ExifData{}
		} else {
			pf.Exif = exifData
		}

		results[i] = pf
	}

	return results, nil
}

// CheckDuplicates 批量检查重复
func (s *UploadService) CheckDuplicates(hashes []string) (*DuplicateCheckResult, error) {
	if s.proxy == nil || !s.proxy.IsReady() {
		return nil, fmt.Errorf("未连接到服务器")
	}

	body := map[string]interface{}{
		"fileHashes": hashes,
	}

	var result DuplicateCheckResult
	if err := s.proxy.POST("/admin/photos/check-duplicate", body, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// UploadFile 上传照片：发送文件到 Web API，由服务端处理存储+入库
func (s *UploadService) UploadFile(filePath string, settings UploadSettings, hash string, exifData *image.ExifData) (*UploadResult, error) {
	result := &UploadResult{FilePath: filePath}

	if err := validateUploadFile(filePath); err != nil {
		result.Error = err.Error()
		return result, nil
	}

	if s.proxy == nil || !s.proxy.IsReady() {
		result.Error = "未连接到服务器"
		return result, nil
	}

	uploadPath := filePath
	compressionFormat := strings.ToLower(settings.CompressionFormat)
	if compressionFormat != "webp" {
		compressionFormat = "avif"
	}
	if settings.CompressEnabled && compressionFormat == "avif" {
		targetBytes := int64(desktopCompressedUploadMaxBytes)
		if settings.MaxSizeMB > 0 {
			requestedBytes := int64(settings.MaxSizeMB * 1024 * 1024)
			if requestedBytes < targetBytes {
				targetBytes = requestedBytes
			}
		}
		tempDir, err := os.MkdirTemp("", "mo-gallery-upload-")
		if err != nil {
			result.Error = "创建本地压缩目录失败: " + err.Error()
			return result, nil
		}
		defer os.RemoveAll(tempDir)
		baseName := strings.TrimSuffix(filepath.Base(filePath), filepath.Ext(filePath))
		uploadPath = filepath.Join(tempDir, baseName+".avif")
		orientation := 1
		if exifData != nil && exifData.Orientation > 0 {
			orientation = exifData.Orientation
		}
		if err := image.CompressToAVIF(filePath, uploadPath, orientation, targetBytes); err != nil {
			result.Error = "本地压缩失败: " + err.Error()
			return result, nil
		}
	}

	// ── 构造表单字段 ───────────────────────────────────
	title := settings.Title
	if title == "" {
		title = filepath.Base(filePath)
	}

	originFlag := settings.OriginFlag
	if originFlag == "" {
		originFlag = "desktop"
	}
	fields := map[string]string{
		"title":       title,
		"origin_flag": originFlag,
	}

	if len(settings.Categories) > 0 {
		fields["category"] = strings.Join(settings.Categories, ",")
	}
	if settings.StorageSourceID != "" {
		fields["storage_source_id"] = settings.StorageSourceID
	}
	if settings.StorageProvider != "" {
		fields["storage_provider"] = settings.StorageProvider
	}
	if settings.StoragePath != "" {
		fields["storage_path"] = settings.StoragePath
	}
	if settings.StoragePathFull {
		fields["storage_path_full"] = "true"
	}
	if hash != "" {
		fields["file_hash"] = hash
	}
	if settings.FilmRollID != "" {
		fields["film_roll_id"] = settings.FilmRollID
	}
	if !settings.ShowFlag {
		fields["show_flag"] = "false"
	}
	if settings.StripGPS {
		fields["strip_gps"] = "true"
	}
	if settings.CompressEnabled && compressionFormat == "webp" {
		fields["compression_mode"] = "compress"
		fields["compression_format"] = "webp"
		if settings.MaxSizeMB > 0 {
			fields["max_size_mb"] = strconv.FormatFloat(settings.MaxSizeMB, 'f', -1, 64)
		}
	}

	// EXIF 数据序列化为 JSON 字符串。字段名与服务端 parseExifJson 对齐
	// （镜头字段是 lens 而非 lensModel；gps 是 JSON 字符串；takenAt 使用
	// EXIF 日期格式，与服务端 parseExifDate 一致）。没有任何有效字段时
	// 不发送 exif_json，让服务端直接从上传的文件中提取 EXIF。
	if exifData != nil {
		if exifJSON := buildExifJSON(exifData); exifJSON != "" {
			fields["exif_json"] = exifJSON
		}
	}

	// ── 发送文件到 Web API ─────────────────────────────
	files := map[string]string{
		"file": uploadPath,
	}

	// POSTMultipart already unwraps the Web API's { data: ... } envelope.
	// Decode the inner photo directly so the desktop queue receives its ID.
	var photo PhotoDTO
	if err := s.proxy.POSTMultipart("/admin/photos", fields, files, &photo); err != nil {
		// 服务端结构化错误：409 去重走友好分支，其余取可读 message
		var apiErr *APIError
		if errors.As(err, &apiErr) {
			if apiErr.Code == "DUPLICATE_PHOTO" {
				result.IsDuplicate = true
				result.Existing = &DuplicateInfo{ID: apiErr.ExistingPhotoID, Title: apiErr.Message}
				return result, nil
			}
			result.Error = apiErr.Error()
			return result, nil
		}
		result.Error = "上传失败: " + err.Error()
		return result, nil
	}

	if photo.ID == "" {
		result.Error = "上传失败：服务端未返回照片信息"
		return result, nil
	}

	result.Success = true
	result.Photo = &photo
	return result, nil
}

// UploadAiImage uploads an AI-generated image to shared storage without creating
// a Photo record. Saving it to an album remains a separate user action.
func (s *UploadService) UploadAiImage(filePath string) (*AiImageUploadResult, error) {
	if s.proxy == nil || !s.proxy.IsReady() {
		return nil, errors.New("未连接到服务器")
	}
	if _, err := os.Stat(filePath); err != nil {
		return nil, fmt.Errorf("图片文件不存在: %w", err)
	}

	var result AiImageUploadResult
	if err := s.proxy.POSTMultipart(
		"/admin/editor-ai/upload",
		nil,
		map[string]string{"file": filePath},
		&result,
	); err != nil {
		return nil, fmt.Errorf("上传 AI 图片失败: %w", err)
	}
	if result.URL == "" || result.Key == "" {
		return nil, errors.New("上传 AI 图片失败: 服务端未返回图片地址")
	}
	result.URL = resolveUploadURL(s.proxy.baseURL, result.URL)
	return &result, nil
}

func resolveUploadURL(baseURL string, rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.IsAbs() || baseURL == "" {
		return rawURL
	}
	base, err := url.Parse(strings.TrimRight(baseURL, "/") + "/")
	if err != nil {
		return rawURL
	}
	return base.ResolveReference(parsed).String()
}

// ─── 辅助方法 ────────────────────────────────────────

// exifTimeLayout 服务端 parseExifDate 接受的 EXIF 日期格式
const exifTimeLayout = "2006:01:02 15:04:05"

// buildExifJSON 将 ExifData 序列化为服务端 parseExifJson 接受的 JSON。
// 只包含有值的字段；全部为空时返回 ""（调用方应跳过 exif_json，
// 让服务端从文件缓冲区提取）。
func buildExifJSON(exifData *image.ExifData) string {
	payload := map[string]interface{}{}
	if exifData.CameraMake != "" {
		payload["cameraMake"] = exifData.CameraMake
	}
	if exifData.CameraModel != "" {
		payload["cameraModel"] = exifData.CameraModel
	}
	if exifData.LensModel != "" {
		payload["lens"] = exifData.LensModel
	}
	if exifData.FocalLength != "" {
		payload["focalLength"] = exifData.FocalLength
	}
	if exifData.Aperture != "" {
		payload["aperture"] = exifData.Aperture
	}
	if exifData.ShutterSpeed != "" {
		payload["shutterSpeed"] = exifData.ShutterSpeed
	}
	if exifData.ISO > 0 {
		payload["iso"] = exifData.ISO
	}
	if exifData.TakenAt != nil {
		payload["takenAt"] = exifData.TakenAt.Format(exifTimeLayout)
	}
	if exifData.Orientation > 0 {
		payload["orientation"] = exifData.Orientation
	}
	if exifData.Software != "" {
		payload["software"] = exifData.Software
	}
	if exifData.GPS != nil {
		if gpsBytes, err := json.Marshal(exifData.GPS); err == nil {
			payload["gps"] = string(gpsBytes)
		}
	}
	if len(payload) == 0 {
		return ""
	}

	// exifRaw 与 web 端 extractExifToJson 的结构保持一致，供详情展示使用
	payload["exifRaw"] = buildExifRawJSON(exifData)

	data, err := json.Marshal(payload)
	if err != nil {
		return ""
	}
	return string(data)
}

// buildExifRawJSON 生成与服务端 extractExifData 相同结构的 exifRaw JSON
func buildExifRawJSON(exifData *image.ExifData) string {
	raw := map[string]interface{}{
		"camera": map[string]interface{}{
			"make":  exifData.CameraMake,
			"model": exifData.CameraModel,
			"lens":  exifData.LensModel,
		},
		"settings": map[string]interface{}{
			"focalLength":  exifData.FocalLength,
			"aperture":     exifData.Aperture,
			"shutterSpeed": exifData.ShutterSpeed,
			"iso":          exifData.ISO,
		},
		"image": map[string]interface{}{
			"orientation": exifData.Orientation,
		},
		"other": map[string]interface{}{
			"software": exifData.Software,
		},
	}
	data, err := json.Marshal(raw)
	if err != nil {
		return ""
	}
	return string(data)
}

func fileHash(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", h.Sum(nil)), nil
}
