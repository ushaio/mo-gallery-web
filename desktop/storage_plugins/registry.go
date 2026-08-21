package storage_plugins

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const registryFileName = "storage-plugin-sources.json"

type registry struct {
	Sources []Source `json:"sources"`
}

type sourceRegistry struct {
	mu          sync.Mutex
	path        string
	sources     map[string]Source
	credentials CredentialStore
}

func newSourceRegistry(configDir string, credentials CredentialStore) (*sourceRegistry, error) {
	if strings.TrimSpace(configDir) == "" {
		return nil, errors.New("storage plugin config directory is required")
	}
	if credentials == nil {
		return nil, errors.New("storage plugin credential store is required")
	}
	r := &sourceRegistry{
		path:        filepath.Join(configDir, registryFileName),
		sources:     make(map[string]Source),
		credentials: credentials,
	}
	if err := r.load(); err != nil {
		return nil, err
	}
	return r, nil
}

func (r *sourceRegistry) load() error {
	data, err := os.ReadFile(r.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read storage plugin sources: %w", err)
	}
	var snapshot registry
	if err := json.Unmarshal(data, &snapshot); err != nil {
		return fmt.Errorf("decode storage plugin sources: %w", err)
	}
	for _, source := range snapshot.Sources {
		if source.ID != "" {
			if source.Config == nil {
				source.Config = map[string]string{}
			}
			if source.CredentialRefs == nil {
				source.CredentialRefs = map[string]string{}
			}
			r.sources[source.ID] = source
		}
	}
	return nil
}

func (r *sourceRegistry) saveLocked() error {
	if err := os.MkdirAll(filepath.Dir(r.path), 0o700); err != nil {
		return fmt.Errorf("create storage plugin config directory: %w", err)
	}
	ids := make([]string, 0, len(r.sources))
	for id := range r.sources {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	snapshot := registry{Sources: make([]Source, 0, len(ids))}
	for _, id := range ids {
		snapshot.Sources = append(snapshot.Sources, r.sources[id])
	}
	data, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return fmt.Errorf("encode storage plugin sources: %w", err)
	}
	tmp := r.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return fmt.Errorf("write storage plugin sources: %w", err)
	}
	if err := os.Rename(tmp, r.path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("commit storage plugin sources: %w", err)
	}
	return nil
}

func (r *sourceRegistry) list() []Source {
	r.mu.Lock()
	defer r.mu.Unlock()
	ids := make([]string, 0, len(r.sources))
	for id := range r.sources {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	result := make([]Source, 0, len(ids))
	for _, id := range ids {
		result = append(result, cloneSource(r.sources[id]))
	}
	return result
}

func (r *sourceRegistry) get(id string) (Source, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	source, ok := r.sources[id]
	return cloneSource(source), ok
}

func (r *sourceRegistry) upsert(input SourceInput) (Source, error) {
	name := strings.TrimSpace(input.Name)
	pluginID := strings.TrimSpace(input.PluginID)
	if name == "" || pluginID == "" {
		return Source{}, errors.New("storage source name and pluginId are required")
	}
	id := strings.TrimSpace(input.ID)
	if id == "" {
		id, _ = randomID()
	}
	now := time.Now().UTC()
	r.mu.Lock()
	defer r.mu.Unlock()
	previous := r.sources[id]
	createdAt := previous.CreatedAt
	if createdAt.IsZero() {
		createdAt = now
	}
	refs := previous.CredentialRefs
	if refs == nil {
		refs = map[string]string{}
	}
	if len(input.Credentials) > 0 {
		newRefs, err := setSourceCredentials(r.credentials, id, input.Credentials)
		if err != nil {
			return Source{}, err
		}
		for key, ref := range newRefs {
			refs[key] = ref
		}
	}
	source := Source{
		ID: id, Name: name, PluginID: pluginID, PluginVersion: previous.PluginVersion,
		Config: cloneStringMap(input.Config), CredentialRefs: refs,
		Command: strings.TrimSpace(input.Command), Args: append([]string(nil), input.Args...),
		Enabled: input.Enabled, Status: "", LastError: "",
		CreatedAt: createdAt, UpdatedAt: now,
	}
	if !input.Enabled && previous.ID == "" {
		source.Enabled = true
	}
	r.sources[id] = source
	if err := r.saveLocked(); err != nil {
		return Source{}, err
	}
	return cloneSource(source), nil
}

func (r *sourceRegistry) remove(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	source, ok := r.sources[id]
	if !ok {
		return os.ErrNotExist
	}
	delete(r.sources, id)
	deleteSourceCredentials(r.credentials, source.CredentialRefs)
	return r.saveLocked()
}

func (r *sourceRegistry) updateStatus(id, status, lastError string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	source, ok := r.sources[id]
	if !ok {
		return
	}
	source.Status = status
	source.LastError = lastError
	source.UpdatedAt = time.Now().UTC()
	r.sources[id] = source
	_ = r.saveLocked()
}

func (r *sourceRegistry) updatePluginVersion(id, version string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	source, ok := r.sources[id]
	if !ok || strings.TrimSpace(version) == "" {
		return
	}
	source.PluginVersion = version
	source.UpdatedAt = time.Now().UTC()
	r.sources[id] = source
	_ = r.saveLocked()
}

func cloneSource(source Source) Source {
	source.Config = cloneStringMap(source.Config)
	source.CredentialRefs = cloneStringMap(source.CredentialRefs)
	source.Args = append([]string(nil), source.Args...)
	return source
}

func cloneStringMap(values map[string]string) map[string]string {
	if values == nil {
		return nil
	}
	clone := make(map[string]string, len(values))
	for key, value := range values {
		clone[key] = value
	}
	return clone
}

func randomID() (string, error) {
	file, err := os.CreateTemp("", "mo-gallery-storage-source-")
	if err != nil {
		return "", err
	}
	name := filepath.Base(file.Name())
	_ = file.Close()
	_ = os.Remove(file.Name())
	return strings.TrimPrefix(name, "mo-gallery-storage-source-"), nil
}
