package services

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"io"
	"math/rand"
	"os"
	"path/filepath"
	"strings"

	"mo-gallery-desktop/image"
	"mo-gallery-desktop/storage"
	"mo-gallery-desktop/types"
)

// UploadService 处理照片上传
type UploadService struct {
	proxy   *ProxyClient
	factory *storage.ProviderFactory
}

func NewUploadService(proxy *ProxyClient) *UploadService {
	return &UploadService{
		proxy:   proxy,
		factory: &storage.ProviderFactory{},
	}
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

// UploadFile 上传照片：Go 处理文件 → 上传到存储 → Web API 入库
func (s *UploadService) UploadFile(filePath string, settings UploadSettings, hash string, exifData *image.ExifData) (*UploadResult, error) {
	result := &UploadResult{FilePath: filePath}

	if s.proxy == nil || !s.proxy.IsReady() {
		result.Error = "未连接到服务器"
		return result, nil
	}

	// ── 1. 读取文件 ────────────────────────────────────
	fileData, err := os.ReadFile(filePath)
	if err != nil {
		result.Error = "读取文件失败: " + err.Error()
		return result, nil
	}

	// ── 2. 获取存储配置 ────────────────────────────────
	storageCfg, err := s.getStorageConfig(settings.StorageSourceID, settings.StorageProvider)
	if err != nil {
		result.Error = "获取存储配置失败: " + err.Error()
		return result, nil
	}

	// ── 3. 生成文件名 ──────────────────────────────────
	ext := filepath.Ext(filePath)
	randomName := generateRandomName()
	filename := randomName + ext
	thumbnailFilename := "thumb-" + randomName + ".avif"

	// 构造存储 key
	storageKey := filename
	_ = thumbnailFilename // TODO: 缩略图单独上传
	if settings.StoragePath != "" {
		storageKey = strings.Trim(settings.StoragePath, "/") + "/" + filename
	}

	// ── 4. 上传原始文件到存储 ──────────────────────────
	provider, err := s.factory.Create(*storageCfg)
	if err != nil {
		result.Error = "创建存储提供者失败: " + err.Error()
		return result, nil
	}

	contentType := detectContentType(ext)
	photoURL, err := provider.Upload(storageKey, bytes.NewReader(fileData), contentType)
	if err != nil {
		result.Error = "上传文件失败: " + err.Error()
		return result, nil
	}

	// ── 5. 上传缩略图 ──────────────────────────────────
	thumbnailURL := ""
	// 简单缩略图：直接用原图 URL（Web 端后续可生成 AVIF 缩略图）
	// TODO: Go 端生成缩略图后再上传
	thumbnailURL = photoURL

	// ── 6. 调用 Web API 注册入库 ───────────────────────
	title := settings.Title
	if title == "" {
		title = filepath.Base(filePath)
	}

	// 获取图片尺寸
	width, height := getImageDimensions(fileData)

	registerBody := map[string]interface{}{
		"title":           title,
		"url":             photoURL,
		"thumbnailUrl":    thumbnailURL,
		"storageProvider": storageCfg.Type,
		"storageSourceId": settings.StorageSourceID,
		"storageKey":      storageKey,
		"width":           width,
		"height":          height,
		"size":            len(fileData),
		"fileHash":        hash,
		"showFlag":        settings.ShowFlag,
		"originFlag":      settings.OriginFlag,
		"filmRollId":      settings.FilmRollID,
	}

	if len(settings.Categories) > 0 {
		registerBody["category"] = strings.Join(settings.Categories, ",")
	}

	// EXIF 数据
	if exifData != nil {
		registerBody["exif"] = map[string]interface{}{
			"cameraMake":   exifData.CameraMake,
			"cameraModel":  exifData.CameraModel,
			"lensModel":    exifData.LensModel,
			"focalLength":  exifData.FocalLength,
			"aperture":     exifData.Aperture,
			"shutterSpeed": exifData.ShutterSpeed,
			"iso":          exifData.ISO,
			"takenAt":      exifData.TakenAt,
			"orientation":  exifData.Orientation,
			"software":     exifData.Software,
			"gps":          exifData.GPS,
			"raw":          exifData.Raw,
		}
	}

	// 发送到 Web API
	var apiResp struct {
		Success bool      `json:"success"`
		Data    PhotoDTO  `json:"data"`
		Error   string    `json:"error"`
		Message string    `json:"message"`
	}

	if err := s.proxy.POST("/admin/photos/register", registerBody, &apiResp); err != nil {
		// 上传成功但入库失败 — 文件已在存储中，但数据库没有记录
		result.Error = "入库失败: " + err.Error()
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

// getStorageConfig 获取存储配置
func (s *UploadService) getStorageConfig(sourceID, provider string) (*storage.Config, error) {
	if sourceID != "" {
		// 通过 storage source ID 获取配置
		var sources []types.StorageSourceDTO
		if err := s.proxy.GET("/admin/storage-sources", &sources); err != nil {
			return nil, err
		}
		for _, src := range sources {
			if src.ID == sourceID {
				return s.sourceToConfig(&src), nil
			}
		}
		return nil, fmt.Errorf("存储源 %s 不存在", sourceID)
	}

	// 通过 settings 获取默认配置
	settings, err := s.getSettings()
	if err != nil {
		return nil, err
	}

	cfg := &storage.Config{
		Type: settings["storage_provider"],
	}

	if cfg.Type == "" {
		cfg.Type = "local"
	}

	// 填充 S3/GitHub 配置
	cfg.Endpoint = settings["s3_endpoint"]
	cfg.Region = settings["s3_region"]
	cfg.AccessKey = settings["s3_access_key_id"]
	cfg.SecretKey = settings["s3_secret_access_key"]
	cfg.Bucket = settings["s3_bucket"]
	cfg.PublicURL = settings["s3_public_url"]
	cfg.BasePath = settings["s3_path"]
	cfg.Token = settings["github_token"]
	cfg.Repo = settings["github_repo"]
	cfg.Branch = settings["github_branch"]
	cfg.AccessMethod = settings["github_access_method"]
	cfg.PagesURL = settings["github_pages_url"]

	return cfg, nil
}

func (s *UploadService) sourceToConfig(src *types.StorageSourceDTO) *storage.Config {
	cfg := &storage.Config{
		Type: src.Type,
	}
	if src.AccessKey != nil {
		cfg.AccessKey = *src.AccessKey
	}
	if src.SecretKey != nil {
		cfg.SecretKey = *src.SecretKey
	}
	if src.Bucket != nil {
		cfg.Bucket = *src.Bucket
	}
	if src.Region != nil {
		cfg.Region = *src.Region
	}
	if src.Endpoint != nil {
		cfg.Endpoint = *src.Endpoint
	}
	if src.PublicURL != nil {
		cfg.PublicURL = *src.PublicURL
	}
	if src.BasePath != nil {
		cfg.BasePath = *src.BasePath
	}
	if src.Branch != nil {
		cfg.Branch = *src.Branch
	}
	if src.AccessMethod != nil {
		cfg.AccessMethod = *src.AccessMethod
	}
	// GitHub: accessKey 存储的是 token
	if src.Type == "github" && src.AccessKey != nil {
		cfg.Token = *src.AccessKey
	}
	return cfg
}

func (s *UploadService) getSettings() (map[string]string, error) {
	var config map[string]string
	if err := s.proxy.GET("/admin/settings/", &config); err != nil {
		return nil, err
	}
	return config, nil
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

func generateRandomName() string {
	const chars = "0123456789abcdef"
	b := make([]byte, 32)
	for i := range b {
		b[i] = chars[rand.Intn(16)]
	}
	return string(b)
}

func detectContentType(ext string) string {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".avif":
		return "image/avif"
	case ".gif":
		return "image/gif"
	case ".tiff", ".tif":
		return "image/tiff"
	case ".bmp":
		return "image/bmp"
	default:
		return "application/octet-stream"
	}
}

// getImageDimensions 简单获取图片尺寸（JPEG/PNG header 解析）
func getImageDimensions(data []byte) (int, int) {
	if len(data) < 24 {
		return 0, 0
	}

	// PNG
	if data[0] == 0x89 && data[1] == 0x50 {
		w := int(data[16])<<24 | int(data[17])<<16 | int(data[18])<<8 | int(data[19])
		h := int(data[20])<<24 | int(data[21])<<16 | int(data[22])<<8 | int(data[23])
		return w, h
	}

	// JPEG — 需要解析 SOF marker
	if data[0] == 0xFF && data[1] == 0xD8 {
		i := 2
		for i < len(data)-1 {
			if data[i] != 0xFF {
				i++
				continue
			}
			marker := data[i+1]
			if marker == 0xC0 || marker == 0xC2 {
				if i+9 < len(data) {
					h := int(data[i+5])<<8 | int(data[i+6])
					w := int(data[i+7])<<8 | int(data[i+8])
					return w, h
				}
			}
			if i+3 < len(data) {
				length := int(data[i+2])<<8 | int(data[i+3])
				i += 2 + length
			} else {
				break
			}
		}
	}

	return 0, 0
}

