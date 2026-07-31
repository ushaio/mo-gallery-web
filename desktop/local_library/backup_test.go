package local_library

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestManualBackupAndRestorePreservesOrganizationData(t *testing.T) {
	manager, root := openTestManager(t)
	path := filepath.Join(root, "photo.jpg")
	writeTestJPEG(t, path)
	id := indexTestFile(t, manager, root, "photo.jpg")
	if err := manager.UpdateAsset(id, "Before backup", "kept notes", 4, "blue", true); err != nil {
		t.Fatal(err)
	}

	backup, err := manager.CreateManualBackup()
	if err != nil {
		t.Fatal(err)
	}
	if backup.Kind != BackupKindManual || backup.ID == "" || backup.SizeBytes <= 0 {
		t.Fatalf("unexpected backup: %+v", backup)
	}
	if _, err := os.Stat(filepath.Join(backupDirectory(root), backup.ID)); err != nil {
		t.Fatalf("backup file missing: %v", err)
	}

	if err := manager.UpdateAsset(id, "After backup", "changed notes", 1, "red", false); err != nil {
		t.Fatal(err)
	}
	snapshot, err := manager.RestoreBackup(backup.ID)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.SessionID == "" || snapshot.State != "open" {
		t.Fatalf("unexpected restored snapshot: %+v", snapshot)
	}

	page, err := manager.ListAssets(AssetQuery{Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 {
		t.Fatalf("restored items=%d, want 1", len(page.Items))
	}
	asset := page.Items[0]
	if asset.ID != id || asset.DisplayTitle != "Before backup" || asset.Notes != "kept notes" || asset.Rating != 4 || asset.ColorLabel != "blue" || !asset.IsFavorite {
		t.Fatalf("restored organization data mismatch: %+v", asset)
	}

	overview, err := manager.BackupOverview()
	if err != nil {
		t.Fatal(err)
	}
	if len(overview.Backups) < 2 {
		t.Fatalf("backups=%+v, want manual and pre-restore backups", overview.Backups)
	}
	if overview.Backups[0].Kind != BackupKindPreRestore {
		t.Fatalf("latest backup kind=%q, want %q", overview.Backups[0].Kind, BackupKindPreRestore)
	}
}

func TestRestoreBackupRejectsInvalidIdentifier(t *testing.T) {
	manager, _ := openTestManager(t)
	_, err := manager.RestoreBackup("../library.db")
	assertAppErrorCode(t, err, ErrBackupInvalid)
}

func TestRestoreBackupRejectsCorruptedDatabaseWithoutClosingLibrary(t *testing.T) {
	manager, root := openTestManager(t)
	path := filepath.Join(root, "photo.jpg")
	writeTestJPEG(t, path)
	id := indexTestFile(t, manager, root, "photo.jpg")

	backupID := backupFileName(BackupKindManual, time.Now())
	if err := os.MkdirAll(backupDirectory(root), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(backupDirectory(root), backupID), []byte("not a sqlite database"), 0o600); err != nil {
		t.Fatal(err)
	}

	_, err := manager.RestoreBackup(backupID)
	assertAppErrorCode(t, err, ErrBackupInvalid)

	page, err := manager.ListAssets(AssetQuery{Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != id {
		t.Fatalf("active library changed after rejected restore: %+v", page.Items)
	}
}
