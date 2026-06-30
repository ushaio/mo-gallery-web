package services

import (
	"crypto/sha256"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"mo-gallery-desktop/image"
)

// UploadService 处理照片上传
type UploadService struct {
	proxy *ProxyClient
}

func NewUploadService(proxy *ProxyClient) *UploadService {
	return &UploadService{proxy: proxy}
}

// PreparedFile 预处理后的文件信息
type PreparedFile struct {
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
	Title           string   `json:"title"`
	Categories      []string `json:"categories"`
	StorageSourceID string   `json:"storageSourceId"`
	StorageProvider string   `json:"storageProvider"`
	StoragePath     string   `json:"storagePath"`
	StoragePathFull bool     `json:"storagePathFull"`
	ShowFlag        bool     `json:"showFlag"`
	CompressEnabled bool     `json:"compressEnabled"`
	MaxSizeMB       float64  `json:"maxSizeMB"`
	StripGPS        bool     `json:"stripGPS"`
	FilmRollID      string   `json:"filmRollId"`
	OriginFlag      string   `json:"originFlag"`
}

// UploadResult 单张上传结果
type UploadResult struct {
	FilePath    string    `json:"filePath"`
	Success     bool      `json:"success"`
	Photo       *PhotoDTO `json:"photo,omitempty"`
	Error       string    `json:"error,omitempty"`
	IsDuplicate bool      `json:"isDuplicate,omitempty"`
	Existing    *DuplicateInfo `json:"existing,omitempty"`
}

// PrepareUpload 预处理文件：计算哈希 + 提取 EXIF
func (s *UploadService) PrepareUpload(filePaths []string) ([]PreparedFile, error) {
	results := make([]PreparedFile, len(filePaths))

	for i, fp := range filePaths {
		pf := PreparedFile{
			FilePath: fp,
			FileName: filepath.Base(fp),
		}

		// 文件大小
		info, err := os.Stat(fp)
		if err != nil {
			pf.Error = "文件不存在"
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

	if s.proxy == nil || !s.proxy.IsReady() {
		result.Error = "未连接到服务器"
		return result, nil
	}

	// ── 构造表单字段 ───────────────────────────────────
	title := settings.Title
	if title == "" {
		title = filepath.Base(filePath)
	}

	fields := map[string]string{
		"title":      title,
		"origin_flag": "desktop",
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
	if settings.CompressEnabled {
		fields["compression_mode"] = "compress"
		if settings.MaxSizeMB > 0 {
			fields["max_size_mb"] = fmt.Sprintf("%.0f", settings.MaxSizeMB)
		}
	}
	if settings.StripGPS {
		fields["strip_gps"] = "true"
	}

	// EXIF 数据序列化为 JSON 字符串
	if exifData != nil {
		exifJSON := fmt.Sprintf(`{"cameraMake":%q,"cameraModel":%q,"lensModel":%q,"focalLength":%q,"aperture":%q,"shutterSpeed":%q,"iso":%d,"takenAt":%q,"orientation":%d,"software":%q,"gps":%q}`,
			exifData.CameraMake, exifData.CameraModel, exifData.LensModel,
			exifData.FocalLength, exifData.Aperture, exifData.ShutterSpeed,
			exifData.ISO, exifData.TakenAt, exifData.Orientation,
			exifData.Software, exifData.GPS)
		fields["exif_json"] = exifJSON
	}

	// ── 发送文件到 Web API ─────────────────────────────
	files := map[string]string{
		"file": filePath,
	}

	var apiResp struct {
		Success bool      `json:"success"`
		Data    PhotoDTO  `json:"data"`
		Error   string    `json:"error"`
		Message string    `json:"message"`
	}

	if err := s.proxy.POSTMultipart("/admin/photos", fields, files, &apiResp); err != nil {
		result.Error = "上传失败: " + err.Error()
		return result, nil
	}

	if apiResp.Error != "" {
		if apiResp.Error == "DUPLICATE_PHOTO" {
			result.IsDuplicate = true
			result.Existing = &DuplicateInfo{Title: apiResp.Message}
			return result, nil
		}
		result.Error = apiResp.Message
		return result, nil
	}

	result.Success = true
	result.Photo = &apiResp.Data
	return result, nil
}

// ─── 辅助方法 ────────────────────────────────────────

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

