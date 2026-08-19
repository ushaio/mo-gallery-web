package services

import (
	"path/filepath"
	"testing"
	"time"
)

func TestPendingRegistrationStorePersistsAndRemovesItems(t *testing.T) {
	store, err := newPendingRegistrationStore(t.TempDir())
	if err != nil {
		t.Fatalf("newPendingRegistrationStore() error = %v", err)
	}
	item := pendingRegistration{
		ID:           "registration-1",
		SourceID:     "source-1",
		OriginalKey:  "photos/original.avif",
		ThumbnailKey: "photos/.thumbnails/original.jpg",
		RegisterBody: map[string]any{"url": "https://example.test/original.avif"},
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	if err := store.put(item); err != nil {
		t.Fatalf("put() error = %v", err)
	}

	reloaded, err := newPendingRegistrationStore(filepath.Dir(store.path))
	if err != nil {
		t.Fatalf("reload store error = %v", err)
	}
	items := reloaded.list()
	if len(items) != 1 || items[0].ID != item.ID || items[0].OriginalKey != item.OriginalKey {
		t.Fatalf("reloaded items = %+v", items)
	}
	if err := reloaded.remove(item.ID); err != nil {
		t.Fatalf("remove() error = %v", err)
	}
	if got := reloaded.list(); len(got) != 0 {
		t.Fatalf("items after remove = %+v", got)
	}
}
