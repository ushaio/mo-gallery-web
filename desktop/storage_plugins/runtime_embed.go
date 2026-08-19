package storage_plugins

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// runtimeAssets is populated by the release build preparation step. Keeping
// the directory in the Go package means Wails packages the selected runtime
// inside the application binary instead of relying on a side-loaded file.
// The checked-in .gitkeep leaves ordinary local/test builds usable; those
// builds simply report that the bundled runtime is unavailable.
//
//go:embed all:runtime_assets
var runtimeAssets embed.FS

const embeddedRuntimeManifestPath = "runtime_assets/runtime-manifest.json"

func materializeEmbeddedRuntime(configDir string) (string, error) {
	manifestData, err := fs.ReadFile(runtimeAssets, embeddedRuntimeManifestPath)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return "", nil
		}
		return "", err
	}
	if len(manifestData) == 0 || strings.TrimSpace(configDir) == "" {
		return "", nil
	}

	digest := sha256.Sum256(manifestData)
	root := filepath.Join(configDir, "runtime-bundles", "node-"+hex.EncodeToString(digest[:8]))
	if info, statErr := os.Stat(filepath.Join(root, "runtime-manifest.json")); statErr == nil && !info.IsDir() {
		return root, nil
	}

	parent := filepath.Dir(root)
	if err := os.MkdirAll(parent, 0o700); err != nil {
		return "", err
	}
	stage, err := os.MkdirTemp(parent, ".node-runtime-")
	if err != nil {
		return "", err
	}
	keep := false
	defer func() {
		if !keep {
			_ = os.RemoveAll(stage)
		}
	}()

	err = fs.WalkDir(runtimeAssets, "runtime_assets", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == "runtime_assets" || entry.Name() == ".gitkeep" {
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return errors.New("embedded Node runtime cannot contain symbolic links")
		}
		relative := strings.TrimPrefix(path, "runtime_assets/")
		target, targetErr := resolvePackagePath(stage, relative)
		if targetErr != nil {
			return targetErr
		}
		if entry.IsDir() {
			return os.MkdirAll(target, 0o700)
		}
		data, readErr := fs.ReadFile(runtimeAssets, path)
		if readErr != nil {
			return readErr
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
			return err
		}
		return os.WriteFile(target, data, 0o700)
	})
	if err != nil {
		return "", err
	}
	if err := os.Rename(stage, root); err != nil {
		if info, statErr := os.Stat(filepath.Join(root, "runtime-manifest.json")); statErr == nil && !info.IsDir() {
			return root, nil
		}
		return "", err
	}
	keep = true
	return root, nil
}
