package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	maxZineLogBatchSize = 100
	maxZineLogLineSize  = 64 * 1024
)

// ZineOperationLogger appends bounded frontend diagnostic events to one file per app session.
type ZineOperationLogger struct {
	mu       sync.Mutex
	filePath string
}

func NewZineOperationLogger(configDir string) *ZineOperationLogger {
	name := fmt.Sprintf("zine-%s-%d.jsonl", time.Now().Format("20060102-150405"), os.Getpid())
	return &ZineOperationLogger{filePath: filepath.Join(configDir, "log-zine", name)}
}

func (l *ZineOperationLogger) FilePath() string {
	return l.filePath
}

func (l *ZineOperationLogger) Append(lines []string) error {
	if len(lines) == 0 {
		return nil
	}
	if len(lines) > maxZineLogBatchSize {
		return fmt.Errorf("zine log batch exceeds %d entries", maxZineLogBatchSize)
	}

	var buffer bytes.Buffer
	for _, line := range lines {
		if len(line) == 0 || len(line) > maxZineLogLineSize || !json.Valid([]byte(line)) {
			return fmt.Errorf("invalid zine log entry")
		}
		buffer.WriteString(line)
		buffer.WriteByte('\n')
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	if err := os.MkdirAll(filepath.Dir(l.filePath), 0o700); err != nil {
		return fmt.Errorf("create zine log directory: %w", err)
	}
	file, err := os.OpenFile(l.filePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("open zine log file: %w", err)
	}
	defer file.Close()

	if _, err := file.Write(buffer.Bytes()); err != nil {
		return fmt.Errorf("append zine log: %w", err)
	}
	return nil
}
