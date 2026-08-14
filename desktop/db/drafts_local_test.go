package db

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestLocalDraftsPersistAcrossReconnect(t *testing.T) {
	CloseLocalDrafts()
	configDir := t.TempDir()
	t.Cleanup(CloseLocalDrafts)
	if err := ConnectLocalDrafts(configDir); err != nil {
		t.Fatalf("ConnectLocalDrafts() error = %v", err)
	}
	data := `{"id":"story_editor_story-1","storyId":"story-1","title":"Draft","content":"hello","contentJson":{"type":"doc","content":[]},"isPublished":false,"savedAt":200,"photoIds":["photo-1"]}`
	if err := SaveLocalDraft("story_editor_story-1", data); err != nil {
		t.Fatalf("SaveLocalDraft() error = %v", err)
	}
	var stored LocalDraftRecord
	if err := DraftsDB.First(&stored, "key = ?", "story_editor_story-1").Error; err != nil {
		t.Fatalf("read structured draft row: %v", err)
	}
	if stored.Content != "hello" || stored.ContentJSON == nil || *stored.ContentJSON != `{"type":"doc","content":[]}` {
		t.Fatalf("structured content columns = content %q, contentJson %#v", stored.Content, stored.ContentJSON)
	}
	var metadata map[string]json.RawMessage
	if err := json.Unmarshal([]byte(stored.MetadataJSON), &metadata); err != nil {
		t.Fatalf("decode metadata: %v", err)
	}
	if _, exists := metadata["content"]; exists {
		t.Fatal("metadata unexpectedly duplicates content")
	}
	if _, exists := metadata["contentJson"]; exists {
		t.Fatal("metadata unexpectedly duplicates contentJson")
	}
	CloseLocalDrafts()
	if err := ConnectLocalDrafts(configDir); err != nil {
		t.Fatalf("reconnect error = %v", err)
	}
	loaded, err := GetLocalDraft("story_editor_story-1")
	if err != nil {
		t.Fatalf("GetLocalDraft() error = %v", err)
	}
	var restored map[string]json.RawMessage
	if err := json.Unmarshal([]byte(loaded), &restored); err != nil {
		t.Fatalf("decode restored draft: %v", err)
	}
	if string(restored["content"]) != `"hello"` || string(restored["contentJson"]) != `{"type":"doc","content":[]}` {
		t.Fatalf("restored content = %s, contentJson = %s", restored["content"], restored["contentJson"])
	}
	keys, err := ListLocalDrafts()
	if err != nil || len(keys) != 1 || keys[0] != "story_editor_story-1" {
		t.Fatalf("keys = %#v, err = %v", keys, err)
	}
	if err := DeleteLocalDraft("story_editor_story-1"); err != nil {
		t.Fatalf("DeleteLocalDraft() error = %v", err)
	}
	if _, err := os.Stat(LocalDraftsPath(configDir)); err != nil {
		t.Fatalf("draft database not created: %v", err)
	}
}

func TestSaveLocalDraftRejectsInvalidJSON(t *testing.T) {
	CloseLocalDrafts()
	configDir := t.TempDir()
	t.Cleanup(CloseLocalDrafts)
	if err := ConnectLocalDrafts(configDir); err != nil {
		t.Fatal(err)
	}
	if err := SaveLocalDraft("key", "not-json"); err == nil {
		t.Fatal("expected invalid JSON error")
	}
}

func TestLocalDraftCloudSyncMarkerRoundTrips(t *testing.T) {
	CloseLocalDrafts()
	configDir := t.TempDir()
	t.Cleanup(CloseLocalDrafts)
	if err := ConnectLocalDrafts(configDir); err != nil {
		t.Fatal(err)
	}
	if err := SaveLocalDraft("blog_draft_blog-1", `{"id":"blog_draft_blog-1","blogId":"blog-1","title":"Draft","content":"body","cloudSynced":true}`); err != nil {
		t.Fatal(err)
	}
	var record LocalDraftRecord
	if err := DraftsDB.First(&record, "key = ?", "blog_draft_blog-1").Error; err != nil {
		t.Fatal(err)
	}
	if !record.CloudSynced {
		t.Fatal("cloud sync marker was not stored")
	}
	loaded, err := GetLocalDraft("blog_draft_blog-1")
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]json.RawMessage
	if err := json.Unmarshal([]byte(loaded), &payload); err != nil {
		t.Fatal(err)
	}
	if string(payload["cloudSynced"]) != "true" {
		t.Fatalf("cloudSynced payload = %s", payload["cloudSynced"])
	}
}

func TestOpenLocalDraftsMigratesLegacyValueTable(t *testing.T) {
	path := filepath.Join(t.TempDir(), "drafts.db")
	legacyDB, err := sql.Open("sqlite", "file:"+filepath.ToSlash(path))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := legacyDB.Exec(`CREATE TABLE LocalDraft (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt INTEGER NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	if _, err := legacyDB.Exec(`CREATE INDEX idx_LocalDraft_updated_at ON LocalDraft(updatedAt)`); err != nil {
		t.Fatal(err)
	}
	payload := `{"id":"blog_draft_blog-1","blogId":"blog-1","title":"Draft","content":"markdown","contentJson":{"type":"doc"},"category":"notes","tags":"test","isPublished":false,"savedAt":300}`
	if _, err := legacyDB.Exec(`INSERT INTO LocalDraft (key, value, updatedAt) VALUES (?, ?, ?)`, "blog_draft_blog-1", payload, 300); err != nil {
		t.Fatal(err)
	}
	_ = legacyDB.Close()

	database, err := OpenLocalDrafts(path)
	if err != nil {
		t.Fatalf("OpenLocalDrafts() migration error = %v", err)
	}
	sqlDB, _ := database.DB()
	t.Cleanup(func() { _ = sqlDB.Close() })
	if database.Migrator().HasColumn(&LocalDraftRecord{}, "value") {
		t.Fatal("legacy value column still exists after migration")
	}
	var record LocalDraftRecord
	if err := database.First(&record, "key = ?", "blog_draft_blog-1").Error; err != nil {
		t.Fatalf("read migrated draft: %v", err)
	}
	if record.Content != "markdown" || record.ContentJSON == nil || *record.ContentJSON != `{"type":"doc"}` {
		t.Fatalf("migrated content = %q, contentJson = %#v", record.Content, record.ContentJSON)
	}
}
