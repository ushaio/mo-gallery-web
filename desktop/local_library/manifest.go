package local_library

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

const (
	manifestFormat  = "mo-gallery-local-library"
	manifestVersion = 1
)

func internalPath(root string, parts ...string) string {
	all := append([]string{root, internalDirName}, parts...)
	return filepath.Join(all...)
}

func writeJSONAtomic(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	temp := path + ".tmp-" + newID()
	if err := os.WriteFile(temp, data, 0o600); err != nil {
		return err
	}
	if err := os.Rename(temp, path); err != nil {
		_ = os.Remove(temp)
		return err
	}
	return nil
}

func createManifest(root, name string) (Manifest, error) {
	if stringsTrim(name) == "" {
		name = filepath.Base(root)
	}
	manifest := Manifest{
		Format:            manifestFormat,
		FormatVersion:     manifestVersion,
		LibraryID:         LibraryID(newID()),
		Name:              stringsTrim(name),
		CreatedAt:         time.Now().UTC(),
		CreatedBy:         "MO Gallery Desktop",
		MinimumAppVersion: "0.7.0-beta",
	}
	if err := writeJSONAtomic(internalPath(root, manifestFileName), manifest); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func stringsTrim(value string) string {
	for len(value) > 0 && (value[0] == ' ' || value[0] == '\t' || value[0] == '\r' || value[0] == '\n') {
		value = value[1:]
	}
	for len(value) > 0 {
		last := value[len(value)-1]
		if last != ' ' && last != '\t' && last != '\r' && last != '\n' {
			break
		}
		value = value[:len(value)-1]
	}
	return value
}

func readManifest(root string) (Manifest, error) {
	path := internalPath(root, manifestFileName)
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Manifest{}, newError(ErrInvalidLibrary, "所选目录不是有效资源库", map[string]any{"path": root})
		}
		return Manifest{}, err
	}
	var manifest Manifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return Manifest{}, newError(ErrInvalidLibrary, "资源库清单已损坏", map[string]any{"cause": err.Error()})
	}
	if manifest.Format != manifestFormat || manifest.FormatVersion != manifestVersion || manifest.LibraryID == "" {
		return Manifest{}, newError(ErrInvalidLibrary, "资源库格式不兼容", map[string]any{"format": manifest.Format, "version": manifest.FormatVersion})
	}
	return manifest, nil
}

func prepareLibraryStructure(root string) error {
	directories := []string{
		internalPath(root), internalPath(root, "operations"), internalPath(root, "thumbnails"),
		internalPath(root, "previews"), internalPath(root, "trash"), internalPath(root, "backups"),
	}
	for _, dir := range directories {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return fmt.Errorf("create %s: %w", dir, err)
		}
	}
	return nil
}
