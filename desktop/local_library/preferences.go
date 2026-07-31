package local_library

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

type ImportMode string

const (
	ImportModeCopy ImportMode = "copy"
	ImportModeMove ImportMode = "move"
)

type LocalLibraryPreferences struct {
	ImportMode ImportMode `json:"importMode,omitempty"`
}

type preferenceStore struct {
	mu   sync.Mutex
	path string
}

func newPreferenceStore(configDir string) *preferenceStore {
	return &preferenceStore{path: filepath.Join(configDir, "local-library-settings.json")}
}

func (s *preferenceStore) Get() (LocalLibraryPreferences, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.readLocked()
}

func (s *preferenceStore) SetImportMode(mode ImportMode) (LocalLibraryPreferences, error) {
	if !validImportMode(mode) {
		return LocalLibraryPreferences{}, newError(ErrInvalidImportMode, "本地资源库导入方式必须是复制或移动", nil)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	preferences := LocalLibraryPreferences{ImportMode: mode}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return LocalLibraryPreferences{}, err
	}
	if err := writeJSONAtomic(s.path, preferences); err != nil {
		return LocalLibraryPreferences{}, err
	}
	return preferences, nil
}

func (s *preferenceStore) readLocked() (LocalLibraryPreferences, error) {
	data, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return LocalLibraryPreferences{}, nil
	}
	if err != nil {
		return LocalLibraryPreferences{}, err
	}
	var preferences LocalLibraryPreferences
	if err := json.Unmarshal(data, &preferences); err != nil {
		return LocalLibraryPreferences{}, err
	}
	if preferences.ImportMode != "" && !validImportMode(preferences.ImportMode) {
		return LocalLibraryPreferences{}, newError(ErrInvalidImportMode, "本地资源库导入设置无效，请重新选择", nil)
	}
	return preferences, nil
}

func validImportMode(mode ImportMode) bool {
	return mode == ImportModeCopy || mode == ImportModeMove
}
