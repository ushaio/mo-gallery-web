package local_library

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

func TestApplyCloudPhotoChangesIsIdempotentAndPreservesLocalPath(t *testing.T) {
	root := t.TempDir()
	if err := prepareLibraryStructure(root); err != nil {
		t.Fatal(err)
	}
	store, err := openStore(root)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	localPath := filepath.ToSlash("local/trip/photo.jpg")
	if _, err := store.db.Exec(`INSERT INTO assets(
		id,relative_path,path_key,file_name,extension,format,mime_type,byte_size,
		modified_at_ns,availability,discovered_at,technical_updated_at,cloud_photo_id
	) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		"asset-1", localPath, "local/trip/photo.jpg", "photo.jpg", ".jpg", "jpeg", "image/jpeg", 10,
		1, "active", 1, 1, "photo-1"); err != nil {
		t.Fatal(err)
	}

	newer := time.Date(2026, 8, 19, 10, 30, 0, 0, time.UTC)
	cloudPath := "cloud/2026/photo.jpg"
	thumbPath := "cloud/2026/thumb-photo.avif"
	sourceID := "source-1"
	if err := store.applyCloudPhotoChanges(context.Background(), []CloudPhotoChange{{
		ID: "photo-1", Path: &cloudPath, ThumbPath: &thumbPath, StorageSourceID: &sourceID,
		StorageURLType: "public", UpdatedAt: newer,
	}}, "cursor-1", true); err != nil {
		t.Fatal(err)
	}

	olderPath := "cloud/stale.jpg"
	if err := store.applyCloudPhotoChanges(context.Background(), []CloudPhotoChange{{
		ID: "photo-1", Path: &olderPath, StorageURLType: "public", UpdatedAt: newer.Add(-time.Minute),
	}}, "cursor-2", false); err != nil {
		t.Fatal(err)
	}

	var gotLocalPath, gotCloudPath, gotState string
	if err := store.db.QueryRow(`SELECT relative_path,cloud_path,cloud_sync_state FROM assets WHERE id='asset-1'`).Scan(&gotLocalPath, &gotCloudPath, &gotState); err != nil {
		t.Fatal(err)
	}
	if gotLocalPath != localPath || gotCloudPath != cloudPath || gotState != CloudSyncStateSynced {
		t.Fatalf("projection=(local=%q cloud=%q state=%q)", gotLocalPath, gotCloudPath, gotState)
	}

	deletedAt := newer.Add(time.Minute)
	if err := store.applyCloudPhotoChanges(context.Background(), []CloudPhotoChange{{
		ID: "photo-1", StorageURLType: "public", UpdatedAt: deletedAt, DeletedAt: &deletedAt,
	}}, "cursor-3", true); err != nil {
		t.Fatal(err)
	}
	if err := store.db.QueryRow(`SELECT relative_path,cloud_path,cloud_sync_state FROM assets WHERE id='asset-1'`).Scan(&gotLocalPath, &gotCloudPath, &gotState); err != nil {
		t.Fatal(err)
	}
	if gotLocalPath != localPath || gotCloudPath != cloudPath || gotState != CloudSyncStateDeletedRemote {
		t.Fatalf("deleted projection=(local=%q cloud=%q state=%q)", gotLocalPath, gotCloudPath, gotState)
	}
	status, err := store.cloudSyncStatus(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if status.Cursor != "cursor-3" || status.LastSuccessAt == nil {
		t.Fatalf("sync status=%+v", status)
	}
}
