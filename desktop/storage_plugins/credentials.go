package storage_plugins

import (
	"fmt"
	"strings"

	agent_extensions "mo-gallery-desktop/agent_extensions"
)

type CredentialStore interface {
	Set(reference, value string) error
	Get(reference string) (string, error)
	Delete(reference string) error
}

func NewCredentialStore() CredentialStore {
	return agent_extensions.NewCredentialStore()
}

func credentialReference(sourceID, name string) string {
	return "mo-gallery-desktop/storage/" + strings.TrimSpace(sourceID) + "/" + strings.TrimSpace(name)
}

func setSourceCredentials(store CredentialStore, sourceID string, values map[string]string) (map[string]string, error) {
	refs := make(map[string]string, len(values))
	for name, value := range values {
		name = strings.TrimSpace(name)
		if name == "" {
			return nil, fmt.Errorf("credential name cannot be empty")
		}
		ref := credentialReference(sourceID, name)
		if err := store.Set(ref, value); err != nil {
			return nil, fmt.Errorf("store credential %s: %w", name, err)
		}
		refs[name] = ref
	}
	return refs, nil
}

func deleteSourceCredentials(store CredentialStore, refs map[string]string) {
	for _, ref := range refs {
		_ = store.Delete(ref)
	}
}
