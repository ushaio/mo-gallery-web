package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

const pendingRegistrationFileName = "pending-storage-registrations.json"

type pendingRegistration struct {
	ID           string         `json:"id"`
	SourceID     string         `json:"sourceId"`
	OriginalKey  string         `json:"originalKey"`
	ThumbnailKey string         `json:"thumbnailKey"`
	RegisterBody map[string]any `json:"registerBody"`
	Attempts     int            `json:"attempts"`
	LastError    string         `json:"lastError,omitempty"`
	CreatedAt    time.Time      `json:"createdAt"`
	UpdatedAt    time.Time      `json:"updatedAt"`
}

type pendingRegistrationStore struct {
	mu    sync.Mutex
	path  string
	items map[string]pendingRegistration
}

func newPendingRegistrationStore(configDir string) (*pendingRegistrationStore, error) {
	if configDir == "" {
		return nil, errors.New("pending registration config directory is required")
	}
	store := &pendingRegistrationStore{
		path:  filepath.Join(configDir, pendingRegistrationFileName),
		items: make(map[string]pendingRegistration),
	}
	if err := store.load(); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *pendingRegistrationStore) load() error {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read pending registrations: %w", err)
	}
	var snapshot []pendingRegistration
	if err := json.Unmarshal(data, &snapshot); err != nil {
		return fmt.Errorf("decode pending registrations: %w", err)
	}
	for _, item := range snapshot {
		if item.ID != "" && item.SourceID != "" && item.OriginalKey != "" && item.RegisterBody != nil {
			s.items[item.ID] = item
		}
	}
	return nil
}

func (s *pendingRegistrationStore) saveLocked() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return fmt.Errorf("create pending registration directory: %w", err)
	}
	ids := make([]string, 0, len(s.items))
	for id := range s.items {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	snapshot := make([]pendingRegistration, 0, len(ids))
	for _, id := range ids {
		snapshot = append(snapshot, s.items[id])
	}
	data, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return fmt.Errorf("encode pending registrations: %w", err)
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return fmt.Errorf("write pending registrations: %w", err)
	}
	if err := os.Rename(tmp, s.path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("commit pending registrations: %w", err)
	}
	return nil
}

func (s *pendingRegistrationStore) list() []pendingRegistration {
	s.mu.Lock()
	defer s.mu.Unlock()
	items := make([]pendingRegistration, 0, len(s.items))
	for _, item := range s.items {
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt.Before(items[j].CreatedAt) })
	return items
}

func (s *pendingRegistrationStore) put(item pendingRegistration) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.items[item.ID] = item
	return s.saveLocked()
}

func (s *pendingRegistrationStore) update(item pendingRegistration) error {
	return s.put(item)
}

func (s *pendingRegistrationStore) remove(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.items, id)
	return s.saveLocked()
}
