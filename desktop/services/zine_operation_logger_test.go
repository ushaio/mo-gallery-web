package services

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestZineOperationLoggerAppendsJSONLines(t *testing.T) {
	logger := NewZineOperationLogger(t.TempDir())
	lines := []string{
		`{"event":"asset_replaced","slotId":"slot-1"}`,
		`{"event":"frame_drag_start","slotId":"slot-1"}`,
	}
	if err := logger.Append(lines); err != nil {
		t.Fatalf("Append() error = %v", err)
	}
	if filepath.Base(filepath.Dir(logger.FilePath())) != "log-zine" {
		t.Fatalf("FilePath() directory = %q", filepath.Dir(logger.FilePath()))
	}

	file, err := os.Open(logger.FilePath())
	if err != nil {
		t.Fatalf("open log: %v", err)
	}
	defer file.Close()

	count := 0
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		if !json.Valid(scanner.Bytes()) {
			t.Fatalf("invalid JSON line: %q", scanner.Text())
		}
		count++
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("scan log: %v", err)
	}
	if count != len(lines) {
		t.Fatalf("line count = %d, want %d", count, len(lines))
	}
}

func TestZineOperationLoggerRejectsInvalidJSON(t *testing.T) {
	logger := NewZineOperationLogger(t.TempDir())
	if err := logger.Append([]string{"not-json"}); err == nil {
		t.Fatal("Append() accepted invalid JSON")
	}
}
