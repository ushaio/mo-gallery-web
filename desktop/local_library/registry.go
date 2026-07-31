package local_library

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

type registryFile struct {
	Libraries []RecentLibrary `json:"libraries"`
}

type Registry struct {
	mu   sync.Mutex
	path string
}

func NewRegistry(configDir string) *Registry {
	return &Registry{path: filepath.Join(configDir, "local-libraries.json")}
}

func (r *Registry) List() ([]RecentLibrary, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	items, err := r.readLocked()
	if err != nil {
		return nil, err
	}
	for index := range items {
		_, statErr := os.Stat(items[index].Path)
		items[index].Available = statErr == nil
		if statErr != nil {
			items[index].Reason = "路径不可用"
		} else {
			items[index].Reason = ""
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].LastOpenedAt.After(items[j].LastOpenedAt) })
	return items, nil
}

func (r *Registry) Touch(item RecentLibrary) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	items, err := r.readLocked()
	if err != nil {
		return err
	}
	next := []RecentLibrary{item}
	for _, existing := range items {
		if existing.LibraryID == item.LibraryID || filepath.Clean(existing.Path) == filepath.Clean(item.Path) {
			continue
		}
		next = append(next, existing)
	}
	if len(next) > 20 {
		next = next[:20]
	}
	return r.writeLocked(next)
}

func (r *Registry) Remove(path string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	items, err := r.readLocked()
	if err != nil {
		return err
	}
	next := items[:0]
	for _, item := range items {
		if filepath.Clean(item.Path) != filepath.Clean(path) {
			next = append(next, item)
		}
	}
	return r.writeLocked(next)
}

func (r *Registry) readLocked() ([]RecentLibrary, error) {
	data, err := os.ReadFile(r.path)
	if errors.Is(err, os.ErrNotExist) {
		return []RecentLibrary{}, nil
	}
	if err != nil {
		return nil, err
	}
	var file registryFile
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, err
	}
	return file.Libraries, nil
}

func (r *Registry) writeLocked(items []RecentLibrary) error {
	if err := os.MkdirAll(filepath.Dir(r.path), 0o700); err != nil {
		return err
	}
	return writeJSONAtomic(r.path, registryFile{Libraries: items})
}

func recentFrom(manifest Manifest, root string) RecentLibrary {
	return RecentLibrary{LibraryID: manifest.LibraryID, Name: manifest.Name, Path: root, LastOpenedAt: time.Now().UTC(), Available: true}
}
