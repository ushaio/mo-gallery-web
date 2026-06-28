package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// Config 应用配置
type Config struct {
	Database DatabaseConfig `json:"database"`
	API      APIConfig      `json:"api"`
	UI       UIConfig       `json:"ui"`
	AI       AIConfig       `json:"ai"`
}

// AIConfig AI 服务配置
type AIConfig struct {
	BaseURL string `json:"base_url"` // OpenAI 兼容 API 地址
	APIKey  string `json:"api_key"`  // API 密钥
	Model   string `json:"model"`    // 默认模型
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
	BaseURL   string `json:"base_url"`   // mo-gallery-web API 地址
	JWTSecret string `json:"jwt_secret"` // JWT 密钥（需与 Web 端一致）
}

// UIConfig 界面配置
type UIConfig struct {
	Language string `json:"language"` // zh / en
	Theme    string `json:"theme"`    // light / dark / system
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
