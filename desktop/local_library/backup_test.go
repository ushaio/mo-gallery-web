package local_library

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func waitForBackups(t *testing.T, root string, predicate func([]BackupInfo) bool) []BackupInfo {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		items, err := listBackupFiles(root)
		if err != nil {
			t.Fatal(err)
		}
		if predicate(items) {
			return items
		}
		time.Sleep(20 * time.Millisecond)
	}
	items, err := listBackupFiles(root)
	if err != nil {
		t.Fatal(err)
	}
	t.Fatalf("backup condition was not met: %+v", items)
	return nil
}

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

func TestDailyBackupRunsOnceAfterFirstDataChange(t *testing.T) {
	manager, root := openTestManager(t)
	path := filepath.Join(root, "photo.jpg")
	writeTestJPEG(t, path)
	id := indexTestFile(t, manager, root, "photo.jpg")

	if err := manager.UpdateAsset(id, "First change", "", 0, "", false); err != nil {
		t.Fatal(err)
	}
	items := waitForBackups(t, root, func(items []BackupInfo) bool {
		return countBackupsByKind(items, BackupKindDaily) == 1
	})
	if countBackupsByKind(items, BackupKindDaily) != 1 {
		t.Fatalf("daily backups=%+v", items)
	}

	if err := manager.UpdateAsset(id, "Second change", "", 0, "", false); err != nil {
		t.Fatal(err)
	}
	time.Sleep(100 * time.Millisecond)
	items, err := listBackupFiles(root)
	if err != nil {
		t.Fatal(err)
	}
	if got := countBackupsByKind(items, BackupKindDaily); got != 1 {
		t.Fatalf("daily backups=%d, want 1: %+v", got, items)
	}
}

func TestDailyBackupRunsAgainAfterLibraryIsReopened(t *testing.T) {
	manager, root := openTestManager(t)
	path := filepath.Join(root, "photo.jpg")
	writeTestJPEG(t, path)
	id := indexTestFile(t, manager, root, "photo.jpg")
	if err := manager.UpdateAsset(id, "First session", "", 0, "", false); err != nil {
		t.Fatal(err)
	}
	waitForBackups(t, root, func(items []BackupInfo) bool {
		return countBackupsByKind(items, BackupKindDaily) == 1
	})

	if err := manager.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.Open(root); err != nil {
		t.Fatal(err)
	}
	if err := manager.PauseScan(); err != nil {
		snapshot, snapshotErr := manager.Snapshot()
		if snapshotErr != nil || (snapshot.Scan.State != "completed" && snapshot.Scan.State != "paused") {
			t.Fatalf("pause reopened scan: %v snapshot=%+v snapshotErr=%v", err, snapshot, snapshotErr)
		}
	}
	if err := manager.UpdateAsset(id, "Second session", "", 0, "", false); err != nil {
		t.Fatal(err)
	}
	waitForBackups(t, root, func(items []BackupInfo) bool {
		return countBackupsByKind(items, BackupKindDaily) == 2
	})
}

func TestDailyBackupRetentionKeepsLatestSeven(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(backupDirectory(root), 0o700); err != nil {
		t.Fatal(err)
	}
	for index := 0; index < dailyBackupRetention+2; index++ {
		id := backupFileName(BackupKindDaily, time.Now().Add(time.Duration(index)*time.Second))
		path := filepath.Join(backupDirectory(root), id)
		if err := os.WriteFile(path, []byte{byte(index)}, 0o600); err != nil {
			t.Fatal(err)
		}
		stamp := time.Now().Add(time.Duration(index) * time.Second)
		if err := os.Chtimes(path, stamp, stamp); err != nil {
			t.Fatal(err)
		}
	}
	if err := pruneBackups(root, BackupKindDaily, dailyBackupRetention); err != nil {
		t.Fatal(err)
	}
	items, err := listBackupFiles(root)
	if err != nil {
		t.Fatal(err)
	}
	if got := countBackupsByKind(items, BackupKindDaily); got != dailyBackupRetention {
		t.Fatalf("daily backups=%d, want %d", got, dailyBackupRetention)
	}
}

func TestTriggerDailyBackupOnlyForDataChanges(t *testing.T) {
	for _, kind := range []string{"asset_updated", "organization_updated", "assets_imported", "folder_moved"} {
		if !triggersDailyBackup(kind) {
			t.Fatalf("event %q should trigger a daily backup", kind)
		}
	}
	for _, kind := range []string{"scan_progress", "scan_completed", "library_reconciled", "backup_completed", "asset_preview_updated"} {
		if triggersDailyBackup(kind) {
			t.Fatalf("event %q should not trigger a daily backup", kind)
		}
	}
}

func TestOpenStoreCreatesUpgradeBackupBeforeMigration(t *testing.T) {
	root := createVersionTwoTestDatabase(t)
	store, err := openStore(root)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	items, err := listBackupFiles(root)
	if err != nil {
		t.Fatal(err)
	}
	if countBackupsByKind(items, BackupKindUpgrade) != 1 {
		t.Fatalf("upgrade backups=%+v", items)
	}
	var version string
	if err := store.db.QueryRow(`SELECT value FROM library_meta WHERE key='schema_version'`).Scan(&version); err != nil {
		t.Fatal(err)
	}
	if version != "8" {
		t.Fatalf("schema version=%q, want 8", version)
	}
}

func TestOpenStoreStopsMigrationWhenUpgradeBackupFails(t *testing.T) {
	root := createVersionTwoTestDatabase(t)
	original := createUpgradeBackup
	createUpgradeBackup = func(context.Context, string, *sql.DB) error {
		return errors.New("injected backup failure")
	}
	t.Cleanup(func() { createUpgradeBackup = original })

	if _, err := openStore(root); err == nil || !strings.Contains(err.Error(), "create pre-upgrade backup") {
		t.Fatalf("openStore error=%v", err)
	}
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(internalPath(root, "library.db")))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var version string
	if err := db.QueryRow(`SELECT value FROM library_meta WHERE key='schema_version'`).Scan(&version); err != nil {
		t.Fatal(err)
	}
	if version != "2" {
		t.Fatalf("schema version=%q, want migration to remain blocked at 2", version)
	}
}

func TestOpenStoreRestoresUpgradeBackupWhenMigrationFails(t *testing.T) {
	root := createVersionTwoTestDatabase(t)
	_, err := openStoreWithMigration(root, func(store *store) error {
		if _, err := store.db.Exec(`UPDATE library_meta SET value='broken' WHERE key='schema_version'`); err != nil {
			return err
		}
		return errors.New("injected migration failure")
	})
	if err == nil || !strings.Contains(err.Error(), "injected migration failure") {
		t.Fatalf("openStoreWithMigration error=%v", err)
	}
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(internalPath(root, "library.db")))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var version string
	if err := db.QueryRow(`SELECT value FROM library_meta WHERE key='schema_version'`).Scan(&version); err != nil {
		t.Fatal(err)
	}
	if version != "2" {
		t.Fatalf("schema version=%q, want restored version 2", version)
	}
}

func countBackupsByKind(items []BackupInfo, kind string) int {
	count := 0
	for _, item := range items {
		if item.Kind == kind {
			count++
		}
	}
	return count
}
