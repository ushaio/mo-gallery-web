package main

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"

	"mo-gallery-desktop/config"
)

// setupFileLogging tees standard log output into a daily file under the app
// configuration directory so runtime diagnostics survive in packaged builds
// where stderr is not attached to any console. The file stays open for the
// process lifetime; the log package serializes writes.
func setupFileLogging() {
	dir := filepath.Join(config.ConfigDir(), "logs")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return
	}
	// Keep roughly two weeks of logs; older daily files are removed on startup.
	if matches, err := filepath.Glob(filepath.Join(dir, "app-*.log")); err == nil {
		cutoff := time.Now().AddDate(0, 0, -14)
		for _, match := range matches {
			if info, err := os.Stat(match); err == nil && info.ModTime().Before(cutoff) {
				_ = os.Remove(match)
			}
		}
	}
	path := filepath.Join(dir, fmt.Sprintf("app-%s.log", time.Now().Format("20060102")))
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	log.SetOutput(io.MultiWriter(os.Stderr, file))
}
