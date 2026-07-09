package services

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
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
	FilePath    string         `json:"filePath"`
	Success     bool           `json:"success"`
	Photo       *PhotoDTO      `json:"photo,omitempty"`
	Error       string         `json:"error,omitempty"`
	IsDuplicate bool           `json:"isDuplicate,omitempty"`
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
	if settings.CompressEnabled {
		fields["compression_mode"] = "compress"
		if settings.MaxSizeMB > 0 {
			fields["max_size_mb"] = fmt.Sprintf("%.0f", settings.MaxSizeMB)
		}
	}
	if settings.StripGPS {
		fields["strip_gps"] = "true"
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
		"file": filePath,
	}

	var apiResp struct {
		Success bool     `json:"success"`
		Data    PhotoDTO `json:"data"`
		Error   string   `json:"error"`
		Message string   `json:"message"`
	}

	if err := s.proxy.POSTMultipart("/admin/photos", fields, files, &apiResp); err != nil {
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
