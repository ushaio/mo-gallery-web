package services

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"sync"
	"time"
)

// LogLevel 日志级别
type LogLevel string

const (
	LogLevelInfo  LogLevel = "info"
	LogLevelWarn  LogLevel = "warn"
	LogLevelError LogLevel = "error"
)

// LogCategory 日志类别
type LogCategory string

const (
	LogCategoryAuth    LogCategory = "auth"    // 认证相关
	LogCategoryUpload  LogCategory = "upload"  // 上传相关
	LogCategoryPhoto   LogCategory = "photo"   // 照片操作
	LogCategoryAlbum   LogCategory = "album"   // 相册操作
	LogCategoryStory   LogCategory = "story"   // 叙事操作
	LogCategoryBlog    LogCategory = "blog"    // 博客操作
	LogCategoryStorage LogCategory = "storage" // 存储操作
	LogCategoryAI      LogCategory = "ai"      // AI 操作
	LogCategorySystem  LogCategory = "system"  // 系统操作
)

// LogEntry 日志条目
type LogEntry struct {
	ID        string      `json:"id"`
	Timestamp time.Time   `json:"timestamp"`
	Level     LogLevel    `json:"level"`
	Category  LogCategory `json:"category"`
	Action    string      `json:"action"`
	Message   string      `json:"message"`
	Details   string      `json:"details,omitempty"`
}

// Logger 日志服务
type Logger struct {
	mu        sync.Mutex
	enabled   bool
	maxEntries int
	entries   []LogEntry
	filePath  string
}

// NewLogger 创建日志服务
func NewLogger(enabled bool, maxEntries int) *Logger {
	return &Logger{
		enabled:    enabled,
		maxEntries: maxEntries,
		entries:    make([]LogEntry, 0),
		filePath:   logFilePath(),
	}
}

// logFilePath 返回日志文件路径
func logFilePath() string {
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
	default:
		dir = filepath.Join(os.Getenv("HOME"), ".config", "mo-gallery-desktop")
	}
	return filepath.Join(dir, "logs.json")
}

// GetLogDir 返回日志目录路径
func (l *Logger) GetLogDir() string {
	return filepath.Dir(l.filePath)
}

// Load 从文件加载日志
func (l *Logger) Load() error {
	l.mu.Lock()
	defer l.mu.Unlock()

	data, err := os.ReadFile(l.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("读取日志文件失败: %w", err)
	}

	if err := json.Unmarshal(data, &l.entries); err != nil {
		return fmt.Errorf("解析日志文件失败: %w", err)
	}

	return nil
}

// save 保存日志到文件（内部方法，调用前需加锁）
func (l *Logger) save() error {
	dir := filepath.Dir(l.filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("创建日志目录失败: %w", err)
	}

	data, err := json.MarshalIndent(l.entries, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化日志失败: %w", err)
	}

	if err := os.WriteFile(l.filePath, data, 0644); err != nil {
		return fmt.Errorf("写入日志文件失败: %w", err)
	}

	return nil
}

// SetEnabled 设置日志开关
func (l *Logger) SetEnabled(enabled bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.enabled = enabled
}

// SetMaxEntries 设置最大日志条数
func (l *Logger) SetMaxEntries(max int) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.maxEntries = max
	// 裁剪超出限制的日志
	if len(l.entries) > max {
		l.entries = l.entries[len(l.entries)-max:]
	}
}

// IsEnabled 是否启用
func (l *Logger) IsEnabled() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.enabled
}

// Log 记录日志
func (l *Logger) Log(level LogLevel, category LogCategory, action, message, details string) {
	l.mu.Lock()

	if !l.enabled {
		l.mu.Unlock()
		return
	}

	entry := LogEntry{
		ID:        fmt.Sprintf("%d", time.Now().UnixNano()),
		Timestamp: time.Now(),
		Level:     level,
		Category:  category,
		Action:    action,
		Message:   message,
		Details:   details,
	}

	l.entries = append(l.entries, entry)

	// 裁剪超出限制的日志
	if len(l.entries) > l.maxEntries {
		l.entries = l.entries[len(l.entries)-l.maxEntries:]
	}

	// 保存到文件
	l.save()
	l.mu.Unlock()
}

// Info 记录信息日志
func (l *Logger) Info(category LogCategory, action, message, details string) {
	l.Log(LogLevelInfo, category, action, message, details)
}

// Warn 记录警告日志
func (l *Logger) Warn(category LogCategory, action, message, details string) {
	l.Log(LogLevelWarn, category, action, message, details)
}

// Error 记录错误日志
func (l *Logger) Error(category LogCategory, action, message, details string) {
	l.Log(LogLevelError, category, action, message, details)
}

// GetLogs 获取日志列表
func (l *Logger) GetLogs(category string, level string, limit int) []LogEntry {
	l.mu.Lock()
	defer l.mu.Unlock()

	// 过滤
	filtered := make([]LogEntry, 0)
	for _, entry := range l.entries {
		if category != "" && string(entry.Category) != category {
			continue
		}
		if level != "" && string(entry.Level) != level {
			continue
		}
		filtered = append(filtered, entry)
	}

	// 按时间倒序
	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].Timestamp.After(filtered[j].Timestamp)
	})

	// 限制数量
	if limit > 0 && len(filtered) > limit {
		filtered = filtered[:limit]
	}

	return filtered
}

// ClearLogs 清空日志
func (l *Logger) ClearLogs() {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.entries = make([]LogEntry, 0)
	l.save()
}

// GetLogStats 获取日志统计
func (l *Logger) GetLogStats() map[string]interface{} {
	l.mu.Lock()
	defer l.mu.Unlock()

	stats := map[string]interface{}{
		"total":   len(l.entries),
		"enabled": l.enabled,
	}

	// 按类别统计
	categoryStats := make(map[string]int)
	levelStats := make(map[string]int)
	for _, entry := range l.entries {
		categoryStats[string(entry.Category)]++
		levelStats[string(entry.Level)]++
	}
	stats["by_category"] = categoryStats
	stats["by_level"] = levelStats

	return stats
}
