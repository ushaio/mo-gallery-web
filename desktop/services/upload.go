package services

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"mo-gallery-desktop/config"
	"mo-gallery-desktop/image"
	"mo-gallery-desktop/storage_plugins"
)

// UploadService 处理照片上传
type UploadService struct {
	proxy                *ProxyClient
	storagePlugins       *storage_plugins.Manager
	pendingRegistrations *pendingRegistrationStore
	pendingRetryMu       sync.Mutex
	clipboardMu          sync.Mutex
	clipboardTempDir     string
	progressMu           sync.Mutex
	progressFn           func(UploadProgress)
}

// UploadProgress reports the current upload phase to the renderer so the upload
// queue can show the real "compressing" vs "uploading" state instead of a
// simulated timer. During the "uploading" phase Uploaded/Total carry the bytes
// actually sent to the storage plugin so the popup can show a live speed.
type UploadProgress struct {
	TaskID   string `json:"taskId"`
	Phase    string `json:"phase"` // "compressing" | "uploading"
	Progress int    `json:"progress"`
	Error    string `json:"error,omitempty"`
	Uploaded int64  `json:"uploaded,omitempty"`
	Total    int64  `json:"total,omitempty"`
}

// SetProgressCallback wires the upload phase reporter to the renderer event bus.
func (s *UploadService) SetProgressCallback(fn func(UploadProgress)) {
	s.progressMu.Lock()
	defer s.progressMu.Unlock()
	s.progressFn = fn
}

func (s *UploadService) emitProgress(taskID, phase string, progress int, errMsg string) {
	s.emitProgressBytes(taskID, phase, progress, errMsg, 0, 0)
}

func (s *UploadService) emitProgressBytes(taskID, phase string, progress int, errMsg string, uploaded, total int64) {
	if strings.TrimSpace(taskID) == "" {
		return
	}
	s.progressMu.Lock()
	fn := s.progressFn
	s.progressMu.Unlock()
	if fn != nil {
		fn(UploadProgress{TaskID: taskID, Phase: phase, Progress: progress, Error: errMsg, Uploaded: uploaded, Total: total})
	}
}

// uploadPercent maps the bytes sent to a 0..95 progress value; the final 100 is
// set by the renderer when the upload actually completes.
func uploadPercent(done, total int64) int {
	if total <= 0 {
		return 5
	}
	p := int(float64(done) / float64(total) * 95)
	if p < 0 {
		return 0
	}
	if p > 95 {
		return 95
	}
	return p
}

func NewUploadService(proxy *ProxyClient) *UploadService {
	service := &UploadService{proxy: proxy}
	if store, err := newPendingRegistrationStore(config.ConfigDir()); err == nil {
		service.pendingRegistrations = store
	}
	return service
}

func (s *UploadService) SetStoragePlugins(manager *storage_plugins.Manager) {
	s.storagePlugins = manager
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
	TaskID            string   `json:"taskId,omitempty"`
	Title             string   `json:"title"`
	Categories        []string `json:"categories"`
	StorageRuntime    string   `json:"storageRuntime"`
	StoragePluginID   string   `json:"storagePluginId"`
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

// UploadFile uploads through the local Desktop plugin path; the legacy Web
// path remains available only for non-plugin callers.
func (s *UploadService) UploadFile(filePath string, settings UploadSettings, hash string, exifData *image.ExifData) (*UploadResult, error) {
	result := &UploadResult{FilePath: filePath}

	if err := validateUploadFile(filePath); err != nil {
		result.Error = err.Error()
		return result, nil
	}

	uploadPath := filePath
	compressionFormat := strings.ToLower(settings.CompressionFormat)
	if compressionFormat != "webp" {
		compressionFormat = "avif"
	}
	if settings.CompressEnabled {
		s.emitProgress(settings.TaskID, "compressing", 0, "")
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
		extension := "." + compressionFormat
		uploadPath = filepath.Join(tempDir, baseName+extension)
		orientation := 1
		if exifData != nil && exifData.Orientation > 0 {
			orientation = exifData.Orientation
		}
		var compressErr error
		if compressionFormat == "webp" {
			compressErr = image.CompressToWebP(filePath, uploadPath, orientation, targetBytes)
		} else {
			compressErr = image.CompressToAVIF(filePath, uploadPath, orientation, targetBytes)
		}
		if compressErr != nil {
			result.Error = "本地压缩失败: " + compressErr.Error()
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
	if settings.StorageRuntime == storage_plugins.RuntimeDesktopPlugin {
		return s.uploadWithStoragePlugin(filePath, uploadPath, settings, hash, exifData)
	}
	if s.proxy == nil || !s.proxy.IsReady() {
		result.Error = "未连接到服务器"
		return result, nil
	}
	// Retry durable registration work before creating another remote object.
	// A transient API outage must not turn one upload into multiple objects.
	s.RetryPendingRegistrations(context.Background())

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

func (s *UploadService) uploadWithStoragePlugin(sourcePath, uploadPath string, settings UploadSettings, hash string, exifData *image.ExifData) (*UploadResult, error) {
	result := &UploadResult{FilePath: sourcePath}
	if s.storagePlugins == nil {
		result.Error = "桌面存储插件未初始化"
		return result, nil
	}
	if strings.TrimSpace(settings.StorageSourceID) == "" {
		result.Error = "桌面存储源不能为空"
		return result, nil
	}
	s.RetryPendingRegistrations(context.Background())
	if strings.TrimSpace(settings.StoragePluginID) == "" {
		settings.StoragePluginID = s.storagePlugins.PluginID(settings.StorageSourceID)
	}
	if strings.TrimSpace(settings.StoragePluginID) == "" {
		result.Error = "桌面存储插件标识不能为空"
		return result, nil
	}
	// Both Desktop compressors emit fresh files without source metadata, so no
	// second re-encode is needed when compression is enabled. This keeps WebP
	// output as WebP while still stripping GPS from uncompressed uploads.
	if settings.StripGPS && !settings.CompressEnabled {
		tempDir, err := os.MkdirTemp("", "mo-gallery-upload-sanitized-")
		if err != nil {
			result.Error = "创建隐私处理目录失败: " + err.Error()
			return result, nil
		}
		defer os.RemoveAll(tempDir)
		extension := strings.ToLower(filepath.Ext(uploadPath))
		if extension != ".jpg" && extension != ".jpeg" && extension != ".png" && extension != ".avif" {
			extension = ".jpg"
		}
		sanitizedPath := filepath.Join(tempDir, strings.TrimSuffix(filepath.Base(uploadPath), filepath.Ext(uploadPath))+extension)
		if err := image.StripMetadata(uploadPath, sanitizedPath, exifOrientation(exifData)); err != nil {
			result.Error = "清理照片隐私元数据失败: " + err.Error()
			return result, nil
		}
		uploadPath = sanitizedPath
	}

	if strings.TrimSpace(hash) == "" {
		if computedHash, hashErr := fileHash(sourcePath); hashErr == nil {
			hash = computedHash
		}
	}
	baseName := pluginObjectKey(uploadPath, hash)
	contentType := contentTypeForPath(uploadPath)
	s.emitProgress(settings.TaskID, "uploading", 5, "")
	originalSize := int64(0)
	if info, statErr := os.Stat(uploadPath); statErr == nil {
		originalSize = info.Size()
	}
	object, err := s.storagePlugins.Put(context.Background(), storage_plugins.PutRequest{
		SourceID:       settings.StorageSourceID,
		Key:            baseName,
		Path:           settings.StoragePath,
		UseFullPath:    settings.StoragePathFull,
		FilePath:       uploadPath,
		ContentType:    contentType,
		Checksum:       uploadChecksum(hash, sourcePath, uploadPath),
		IdempotencyKey: strings.TrimSpace(hash) + ":" + settings.StorageSourceID,
		Progress: func(done, total int64) {
			s.emitProgressBytes(settings.TaskID, "uploading", uploadPercent(done, total), "", done, total)
		},
	})
	if err != nil {
		result.Error = "插件上传原图失败: " + err.Error()
		return result, nil
	}
	if object.URLType != "public" {
		_ = s.storagePlugins.Delete(context.Background(), storage_plugins.DeleteRequest{SourceID: settings.StorageSourceID, Key: object.Key})
		result.Error = "桌面存储插件必须返回稳定的 public URL，不能登记临时或签名 URL"
		return result, nil
	}

	thumbnailPath, err := image.GenerateThumbnailAVIF(uploadPath, exifOrientation(exifData))
	if err != nil {
		_ = s.storagePlugins.Delete(context.Background(), storage_plugins.DeleteRequest{SourceID: settings.StorageSourceID, Key: object.Key})
		result.Error = "生成缩略图失败: " + err.Error()
		return result, nil
	}
	defer os.Remove(thumbnailPath)
	thumbnailKey := thumbnailObjectKey(object.Key)
	thumbnailSize := int64(0)
	if info, statErr := os.Stat(thumbnailPath); statErr == nil {
		thumbnailSize = info.Size()
	}
	// Report cumulative bytes across both objects so the popup speed counter
	// stays monotonic (original, then original + thumbnail).
	uploadedBase := originalSize
	uploadedTotal := originalSize + thumbnailSize
	thumbnail, thumbErr := s.storagePlugins.Put(context.Background(), storage_plugins.PutRequest{
		SourceID:       settings.StorageSourceID,
		Key:            thumbnailKey,
		UseFullPath:    true,
		FilePath:       thumbnailPath,
		ContentType:    "image/avif",
		Checksum:       "",
		IdempotencyKey: strings.TrimSpace(hash) + ":thumbnail:" + settings.StorageSourceID,
		Progress: func(done, total int64) {
			s.emitProgressBytes(settings.TaskID, "uploading", uploadPercent(uploadedBase+done, uploadedTotal), "", uploadedBase+done, uploadedTotal)
		},
	})
	if thumbErr != nil {
		_ = s.storagePlugins.Delete(context.Background(), storage_plugins.DeleteRequest{SourceID: settings.StorageSourceID, Key: object.Key})
		result.Error = "插件上传缩略图失败: " + thumbErr.Error()
		return result, nil
	}
	if thumbnail.URLType != "public" {
		_ = s.storagePlugins.Delete(context.Background(), storage_plugins.DeleteRequest{SourceID: settings.StorageSourceID, Key: object.Key})
		_ = s.storagePlugins.Delete(context.Background(), storage_plugins.DeleteRequest{SourceID: settings.StorageSourceID, Key: thumbnail.Key})
		result.Error = "桌面存储插件必须为缩略图返回稳定的 public URL，不能登记临时或签名 URL"
		return result, nil
	}

	width, height, dimensionErr := image.ReadDimensions(uploadPath)
	if dimensionErr != nil {
		_ = s.storagePlugins.Delete(context.Background(), storage_plugins.DeleteRequest{SourceID: settings.StorageSourceID, Key: object.Key})
		_ = s.storagePlugins.Delete(context.Background(), storage_plugins.DeleteRequest{SourceID: settings.StorageSourceID, Key: thumbnail.Key})
		result.Error = "读取图片尺寸失败: " + dimensionErr.Error()
		return result, nil
	}
	title := settings.Title
	if title == "" {
		title = filepath.Base(sourcePath)
	}
	originFlag := settings.OriginFlag
	if originFlag == "" {
		originFlag = "desktop"
	}
	registerExif := cloneExifData(exifData)
	if settings.StripGPS && registerExif != nil {
		registerExif.GPS = nil
	}
	register := map[string]any{
		"title":               title,
		"path":                object.Key,
		"thumbPath":           thumbnail.Key,
		"storageProvider":     firstNonEmpty(settings.StorageProvider, settings.StoragePluginID),
		"storageRuntime":      storage_plugins.RuntimeDesktopPlugin,
		"storagePluginId":     settings.StoragePluginID,
		"storageSourceId":     settings.StorageSourceID,
		"storageUrlType":      object.URLType,
		"storageUrlExpiresAt": formatTime(object.ExpiresAt),
		"width":               width,
		"height":              height,
		"size":                object.Size,
		"fileHash":            hash,
		"showFlag":            settings.ShowFlag,
		"originFlag":          originFlag,
		"category":            strings.Join(settings.Categories, ","),
		"filmRollId":          nullableString(settings.FilmRollID),
		"exif":                registerExif,
	}
	if s.proxy == nil || !s.proxy.IsReady() {
		if s.pendingRegistrations != nil {
			item := pendingRegistration{
				ID: pendingRegistrationID(), SourceID: settings.StorageSourceID,
				OriginalKey: object.Key, ThumbnailKey: thumbnail.Key,
				RegisterBody: register, CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(),
			}
			if queueErr := s.pendingRegistrations.put(item); queueErr == nil {
				result.Error = "照片已上传，等待服务器连接后登记"
				return result, nil
			}
		}
		_ = s.cleanupPluginObjects(settings.StorageSourceID, object.Key, thumbnail.Key)
		result.Error = "照片登记失败：未连接到服务器"
		return result, nil
	}
	var photo PhotoDTO
	if err := s.proxy.POST("/admin/photos/register", register, &photo); err != nil {
		if apiErr := new(APIError); errors.As(err, &apiErr) && apiErr.Code == "DUPLICATE_PHOTO" {
			_ = s.cleanupPluginObjects(settings.StorageSourceID, object.Key, thumbnail.Key)
			result.IsDuplicate = true
			result.Existing = &DuplicateInfo{ID: apiErr.ExistingPhotoID, Title: apiErr.Message}
			return result, nil
		}
		if s.pendingRegistrations != nil {
			item := pendingRegistration{
				ID:           pendingRegistrationID(),
				SourceID:     settings.StorageSourceID,
				OriginalKey:  object.Key,
				ThumbnailKey: thumbnail.Key,
				RegisterBody: register,
				CreatedAt:    time.Now().UTC(),
				UpdatedAt:    time.Now().UTC(),
			}
			if queueErr := s.pendingRegistrations.put(item); queueErr != nil {
				result.Error = "登记照片失败，且保存补偿任务失败: " + queueErr.Error()
				return result, nil
			}
			result.Error = "登记照片失败，已保留上传对象并等待重试: " + err.Error()
			return result, nil
		}
		_ = s.cleanupPluginObjects(settings.StorageSourceID, object.Key, thumbnail.Key)
		result.Error = "登记照片失败: " + err.Error()
		return result, nil
	}
	if photo.ID == "" {
		if s.pendingRegistrations != nil {
			item := pendingRegistration{
				ID:           pendingRegistrationID(),
				SourceID:     settings.StorageSourceID,
				OriginalKey:  object.Key,
				ThumbnailKey: thumbnail.Key,
				RegisterBody: register,
				CreatedAt:    time.Now().UTC(),
				UpdatedAt:    time.Now().UTC(),
			}
			if queueErr := s.pendingRegistrations.put(item); queueErr == nil {
				result.Error = "登记照片未返回 ID，已保留上传对象并等待重试"
				return result, nil
			}
		}
		_ = s.cleanupPluginObjects(settings.StorageSourceID, object.Key, thumbnail.Key)
		result.Error = "登记照片失败：服务端未返回照片信息"
		return result, nil
	}
	result.Success = true
	result.Photo = &photo
	return result, nil
}

// RetryPendingRegistrations retries registrations whose objects were uploaded
// successfully but whose database request failed. It intentionally leaves
// non-retryable-looking failures queued until the user or a later run can
// inspect them; deleting remote objects here could lose a successful upload.
func (s *UploadService) RetryPendingRegistrations(ctx context.Context) {
	_ = ctx // ProxyClient currently exposes request-scoped timeouts internally.
	s.pendingRetryMu.Lock()
	defer s.pendingRetryMu.Unlock()
	if s.pendingRegistrations == nil || s.proxy == nil || !s.proxy.IsReady() || s.storagePlugins == nil {
		return
	}
	for _, item := range s.pendingRegistrations.list() {
		var photo PhotoDTO
		err := s.proxy.POST("/admin/photos/register", item.RegisterBody, &photo)
		if err == nil && photo.ID != "" {
			_ = s.pendingRegistrations.remove(item.ID)
			continue
		}
		if apiErr := new(APIError); errors.As(err, &apiErr) && apiErr.Code == "DUPLICATE_PHOTO" {
			_ = s.cleanupPluginObjects(item.SourceID, item.OriginalKey, item.ThumbnailKey)
			_ = s.pendingRegistrations.remove(item.ID)
			continue
		}
		item.Attempts++
		item.UpdatedAt = time.Now().UTC()
		if err != nil {
			item.LastError = err.Error()
		} else {
			item.LastError = "registration response did not include a photo id"
		}
		_ = s.pendingRegistrations.update(item)
	}
}

func (s *UploadService) cleanupPluginObjects(sourceID, originalKey, thumbnailKey string) error {
	if s.storagePlugins == nil {
		return nil
	}
	var firstErr error
	for _, key := range []string{originalKey, thumbnailKey} {
		if strings.TrimSpace(key) == "" {
			continue
		}
		if err := s.storagePlugins.Delete(context.Background(), storage_plugins.DeleteRequest{SourceID: sourceID, Key: key}); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func pendingRegistrationID() string {
	return fmt.Sprintf("registration-%d", time.Now().UnixNano())
}

func exifOrientation(data *image.ExifData) int {
	if data != nil && data.Orientation > 0 {
		return data.Orientation
	}
	return 1
}

func cloneExifData(data *image.ExifData) *image.ExifData {
	if data == nil {
		return nil
	}
	clone := *data
	if data.GPS != nil {
		gps := *data.GPS
		clone.GPS = &gps
	}
	return &clone
}

func contentTypeForPath(filePath string) string {
	switch strings.ToLower(filepath.Ext(filePath)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".avif":
		return "image/avif"
	case ".tif", ".tiff":
		return "image/tiff"
	default:
		return "application/octet-stream"
	}
}

func pluginObjectKey(filePath, hash string) string {
	baseName := filepath.Base(filePath)
	extension := filepath.Ext(baseName)
	stem := strings.TrimSuffix(baseName, extension)
	suffix := strings.TrimSpace(hash)
	if len(suffix) > 16 {
		suffix = suffix[:16]
	}
	if suffix == "" {
		suffix = fmt.Sprintf("%x", time.Now().UnixNano())
	}
	return stem + "-" + suffix + extension
}

func thumbnailObjectKey(key string) string {
	directory := path.Dir(key)
	name := strings.TrimSuffix(path.Base(key), path.Ext(key)) + ".avif"
	if directory == "." {
		return path.Join(".thumbnails", name)
	}
	return path.Join(directory, ".thumbnails", name)
}

// PluginThumbnailObjectKey is shared by the Desktop deletion flow so it uses
// the same object ownership convention as the upload path.
func PluginThumbnailObjectKey(key string) string { return thumbnailObjectKey(key) }

func formatTime(value *time.Time) string {
	if value == nil {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}

func nullableString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
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
	return ResolveUploadURL(baseURL, rawURL)
}

// ResolveUploadURL resolves a relative upload URL against the given base URL.
func ResolveUploadURL(baseURL string, rawURL string) string {
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

// uploadChecksum returns the SHA-256 checksum of the exact bytes streamed to the
// provider. The S3 API validates this against the received body, so when
// compression or GPS stripping rewrites the file (uploadPath != sourcePath) the
// source hash no longer matches and must be recomputed from the upload path.
func uploadChecksum(sourceHash, sourcePath, uploadPath string) string {
	if uploadPath == sourcePath {
		return strings.TrimSpace(sourceHash)
	}
	if computed, err := fileHash(uploadPath); err == nil {
		return computed
	}
	return strings.TrimSpace(sourceHash)
}
