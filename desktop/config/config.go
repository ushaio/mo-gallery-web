package config

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

// Config 应用配置
type Config struct {
	Database DatabaseConfig `json:"database"`
	API      APIConfig      `json:"api"`
	UI       UIConfig       `json:"ui"`
	AI       AIConfig       `json:"ai"`
	Log      LogConfig      `json:"log"`
}

// AIConfig AI 服务配置
type AIConfig struct {
	BaseURL           string                      `json:"base_url,omitempty"`            // 旧版单源配置
	APIKey            string                      `json:"api_key,omitempty"`             // 旧版单源配置
	Model             string                      `json:"model,omitempty"`               // 旧版单源配置
	DefaultModel      string                      `json:"default_model"`                 // provider:model
	DefaultImageModel string                      `json:"default_image_model,omitempty"` // provider:model
	Providers         map[string]AIProviderConfig `json:"providers"`
}

// AIProviderConfig AI 模型源配置
type AIProviderConfig struct {
	BaseURL                string         `json:"base_url"`
	APIKey                 string         `json:"api_key"`
	Models                 []string       `json:"models"`
	ImageModels            []string       `json:"image_models,omitempty"`
	VisionModels           []string       `json:"vision_models,omitempty"`
	ToolModels             []string       `json:"tool_models,omitempty"`
	StructuredOutputModels []string       `json:"structured_output_models,omitempty"`
	ContextWindows         map[string]int `json:"context_windows,omitempty"`
}

// Normalize 迁移旧版单源配置并补齐默认值
func (c *AIConfig) Normalize() {
	if c.Providers == nil {
		c.Providers = map[string]AIProviderConfig{}
	}
	if len(c.Providers) == 0 && (c.BaseURL != "" || c.APIKey != "" || c.Model != "") {
		models := []string{}
		if c.Model != "" {
			models = []string{c.Model}
		}
		c.Providers["default"] = AIProviderConfig{
			BaseURL: c.BaseURL,
			APIKey:  c.APIKey,
			Models:  models,
		}
		if c.Model != "" {
			c.DefaultModel = "default:" + c.Model
		}
	}
	for providerID, provider := range c.Providers {
		provider.VisionModels = normalizeModelIDs(provider.VisionModels)
		provider.ToolModels = normalizeModelIDs(provider.ToolModels)
		provider.StructuredOutputModels = normalizeModelIDs(provider.StructuredOutputModels)
		provider.ContextWindows = normalizeContextWindows(provider.ContextWindows)
		c.Providers[providerID] = provider
	}
	providerIDs := make([]string, 0, len(c.Providers))
	for providerID := range c.Providers {
		providerIDs = append(providerIDs, providerID)
	}
	sort.Strings(providerIDs)
	if c.DefaultModel == "" {
		for _, providerID := range providerIDs {
			provider := c.Providers[providerID]
			if len(provider.Models) > 0 && provider.Models[0] != "" {
				c.DefaultModel = providerID + ":" + provider.Models[0]
				break
			}
		}
	}
	if c.DefaultImageModel == "" {
		for _, providerID := range providerIDs {
			provider := c.Providers[providerID]
			if len(provider.ImageModels) > 0 && provider.ImageModels[0] != "" {
				c.DefaultImageModel = providerID + ":" + provider.ImageModels[0]
				break
			}
		}
	}
}

func normalizeModelIDs(values []string) []string {
	normalized := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		modelID := strings.TrimSpace(value)
		if modelID == "" {
			continue
		}
		if _, exists := seen[modelID]; exists {
			continue
		}
		seen[modelID] = struct{}{}
		normalized = append(normalized, modelID)
	}
	return normalized
}

func normalizeContextWindows(values map[string]int) map[string]int {
	normalized := make(map[string]int)
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		modelID := strings.TrimSpace(key)
		value := values[key]
		if modelID == "" || value <= 0 {
			continue
		}
		// A decoded map no longer retains source order. Sorting original keys
		// makes collisions deterministic: the lexically last valid key wins.
		normalized[modelID] = value
	}
	return normalized
}

// ResolveModel 根据 provider:model 选择模型源和实际模型名
func (c AIConfig) ResolveModel(selected string) (string, AIProviderConfig, string, error) {
	if selected == "" {
		selected = c.DefaultModel
	}
	return c.resolveModel(selected, false)
}

// ResolveImageModel 根据 provider:model 选择图像模型源和实际模型名
func (c AIConfig) ResolveImageModel(selected string) (string, AIProviderConfig, string, error) {
	if selected == "" {
		selected = c.DefaultImageModel
	}
	return c.resolveModel(selected, true)
}

func (c AIConfig) resolveModel(selected string, image bool) (string, AIProviderConfig, string, error) {
	if selected == "" {
		if image {
			return "", AIProviderConfig{}, "", errors.New("未配置默认图像模型")
		}
		return "", AIProviderConfig{}, "", errors.New("未配置默认 AI 模型")
	}
	providerID, model, ok := strings.Cut(selected, ":")
	if !ok || providerID == "" || model == "" {
		return "", AIProviderConfig{}, "", errors.New("AI 模型必须使用 provider:model 格式")
	}
	provider, ok := c.Providers[providerID]
	if !ok {
		return "", AIProviderConfig{}, "", fmt.Errorf("AI 模型源不存在: %s", providerID)
	}
	if provider.BaseURL == "" || provider.APIKey == "" || model == "" {
		return "", AIProviderConfig{}, "", errors.New("AI 服务未配置")
	}
	if image && !containsString(provider.ImageModels, model) {
		return "", AIProviderConfig{}, "", fmt.Errorf("图像模型未在 image_models 中配置: %s", selected)
	}
	return providerID, provider, model, nil
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

// DatabaseConfig 数据库配置
type DatabaseConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Password string `json:"password"`
	DBName   string `json:"dbname"`
	SSLMode  string `json:"sslmode"`
}

// DSN 生成 PostgreSQL 连接字符串
func (d DatabaseConfig) DSN() string {
	if d.Host == "" {
		return ""
	}
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		d.Host, d.Port, d.User, d.Password, d.DBName, d.SSLMode,
	)
}

// APIConfig 外部 API 配置
type APIConfig struct {
	BaseURL       string `json:"base_url"`       // mo-gallery-web API 地址
	JWTSecret     string `json:"jwt_secret"`     // JWT 密钥（需与 Web 端一致）
	RememberLogin bool   `json:"remember_login"` // 是否记住登录凭据
	SavedUsername string `json:"saved_username"` // 保存的用户名
	SavedPassword string `json:"saved_password"` // 保存的密码（AES-256-GCM 加密）
}

// UIConfig 界面配置
type UIConfig struct {
	Language string `json:"language"` // zh / en
	Theme    string `json:"theme"`    // light / dark / system
}

// LogConfig 日志配置
type LogConfig struct {
	Enabled    bool `json:"enabled"`     // 是否启用日志
	MaxEntries int  `json:"max_entries"` // 最大日志条数
}

// defaultConfig 返回默认配置
func defaultConfig() *Config {
	return &Config{
		Database: DatabaseConfig{
			Host:    "localhost",
			Port:    5432,
			User:    "postgres",
			DBName:  "mo_gallery",
			SSLMode: "disable",
		},
		API: APIConfig{
			BaseURL:   "http://localhost:3000",
			JWTSecret: "secretKey",
		},
		UI: UIConfig{
			Language: "zh",
			Theme:    "system",
		},
		Log: LogConfig{
			Enabled:    false,
			MaxEntries: 1000,
		},
	}
}

// configDir 返回配置文件目录
func configDir() string {
	var dir string
	switch runtime.GOOS {
	case "windows":
		dir = os.Getenv("APPDATA")
		if dir == "" {
			dir = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Roaming")
		}
		dir = filepath.Join(dir, "mo-gallery-desktop")
	case "darwin":
		dir = filepath.Join(os.Getenv("HOME"), "Library", "Application Support", "mo-gallery-desktop")
	default: // linux
		dir = filepath.Join(os.Getenv("HOME"), ".config", "mo-gallery-desktop")
	}
	return dir
}

// ConfigDir 返回应用配置目录。
func ConfigDir() string {
	return configDir()
}

// configPath 返回配置文件完整路径
func configPath() string {
	return filepath.Join(configDir(), "config.json")
}

// Load 加载配置文件。如果文件不存在则创建默认配置。
func Load(customPath string) (*Config, error) {
	path := customPath
	if path == "" {
		path = configPath()
	}

	cfg := defaultConfig()

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			// 首次运行，保存默认配置
			if saveErr := cfg.Save(path); saveErr != nil {
				return nil, fmt.Errorf("创建默认配置失败: %w", saveErr)
			}
			return cfg, nil
		}
		return nil, fmt.Errorf("读取配置文件失败: %w", err)
	}

	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("解析配置文件失败: %w", err)
	}
	cfg.AI.Normalize()

	return cfg, nil
}

// Save 保存配置到文件
func (c *Config) Save(path string) error {
	if path == "" {
		path = configPath()
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("创建配置目录失败: %w", err)
	}

	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("写入配置文件失败: %w", err)
	}

	return nil
}

// ─── 密码加密/解密 ───────────────────────────────────────────────

// getEncryptionKey 生成基于机器的加密密钥
func getEncryptionKey() []byte {
	// 使用机器特征生成密钥（hostname + 固定 salt）
	hostname, _ := os.Hostname()
	salt := "mo-gallery-desktop-v1"
	key := sha256.Sum256([]byte(hostname + salt))
	return key[:]
}

// EncryptPassword 使用 AES-256-GCM 加密密码
func EncryptPassword(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}

	key := getEncryptionKey()
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// DecryptPassword 解密密码
func DecryptPassword(encrypted string) (string, error) {
	if encrypted == "" {
		return "", nil
	}

	key := getEncryptionKey()
	ciphertext, err := base64.StdEncoding.DecodeString(encrypted)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", errors.New("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}
