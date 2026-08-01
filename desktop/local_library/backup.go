package local_library

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	sqlite "modernc.org/sqlite"
)

const (
	BackupKindDaily      = "daily"
	BackupKindUpgrade    = "upgrade"
	BackupKindManual     = "manual"
	BackupKindPreRestore = "pre-restore"

	dailyBackupRetention      = 7
	upgradeBackupRetention    = 3
	preRestoreBackupRetention = 3
)

type BackupInfo struct {
	ID        string    `json:"id"`
	Kind      string    `json:"kind"`
	CreatedAt time.Time `json:"createdAt"`
	SizeBytes int64     `json:"sizeBytes"`
}

type BackupOverview struct {
	LibraryName string       `json:"libraryName"`
	LibraryRoot string       `json:"libraryRoot"`
	Backups     []BackupInfo `json:"backups"`
}

type sqliteOnlineBackuper interface {
	NewBackup(string) (*sqlite.Backup, error)
}

func createConsistentSQLiteBackup(ctx context.Context, db *sql.DB, destination string) error {
	if db == nil {
		return errors.New("database is not open")
	}
	if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
		return err
	}
	if _, err := os.Stat(destination); err == nil {
		return fmt.Errorf("backup destination already exists: %s", destination)
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	conn, err := db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	return conn.Raw(func(driverConn any) error {
		backuper, ok := driverConn.(sqliteOnlineBackuper)
		if !ok {
			return errors.New("SQLite driver does not support the online backup API")
		}
		backup, err := backuper.NewBackup(destination)
		if err != nil {
			return err
		}
		finished := false
		defer func() {
			if !finished {
				_ = backup.Finish()
			}
		}()
		for more := true; more; {
			more, err = backup.Step(128)
			if err != nil {
				return err
			}
			if more {
				select {
				case <-ctx.Done():
					return ctx.Err()
				default:
				}
			}
		}
		err = backup.Finish()
		finished = true
		return err
	})
}

func checkSQLiteIntegrity(path string, full bool) error {
	dsn := "file:" + filepath.ToSlash(path) + "?mode=ro&_pragma=busy_timeout(5000)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return err
	}
	defer db.Close()
	pragma := "PRAGMA quick_check"
	if full {
		pragma = "PRAGMA integrity_check"
	}
	rows, err := db.Query(pragma)
	if err != nil {
		return err
	}
	defer rows.Close()
	messages := make([]string, 0, 1)
	for rows.Next() {
		var message string
		if err := rows.Scan(&message); err != nil {
			return err
		}
		if !strings.EqualFold(strings.TrimSpace(message), "ok") {
			messages = append(messages, message)
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if len(messages) > 0 {
		return fmt.Errorf("SQLite integrity check failed: %s", strings.Join(messages, "; "))
	}
	return nil
}

func backupDirectory(root string) string { return internalPath(root, "backups") }

func backupFileName(kind string, createdAt time.Time) string {
	return fmt.Sprintf("%s-%s-%s.db", kind, createdAt.UTC().Format("20060102T150405.000Z"), newID())
}

func backupKindFromName(name string) string {
	for _, kind := range []string{BackupKindPreRestore, BackupKindUpgrade, BackupKindManual, BackupKindDaily} {
		if strings.HasPrefix(name, kind+"-") && strings.HasSuffix(strings.ToLower(name), ".db") {
			return kind
		}
	}
	return ""
}

func listBackupFiles(root string) ([]BackupInfo, error) {
	entries, err := os.ReadDir(backupDirectory(root))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []BackupInfo{}, nil
		}
		return nil, err
	}
	items := make([]BackupInfo, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		kind := backupKindFromName(entry.Name())
		if kind == "" {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		items = append(items, BackupInfo{
			ID:        entry.Name(),
			Kind:      kind,
			CreatedAt: info.ModTime().UTC(),
			SizeBytes: info.Size(),
		})
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].CreatedAt.Equal(items[j].CreatedAt) {
			return items[i].ID > items[j].ID
		}
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
	return items, nil
}

func resolveBackupPath(root, id string) (string, error) {
	if id == "" || filepath.Base(id) != id || backupKindFromName(id) == "" {
		return "", newError(ErrBackupInvalid, "备份标识无效", nil)
	}
	path := filepath.Join(backupDirectory(root), id)
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() {
		return "", newError(ErrBackupNotFound, "备份文件不存在", map[string]any{"backupId": id})
	}
	return path, nil
}

func latestBackupByKind(root, kind string) (BackupInfo, error) {
	items, err := listBackupFiles(root)
	if err != nil {
		return BackupInfo{}, err
	}
	for _, item := range items {
		if item.Kind == kind {
			return item, nil
		}
	}
	return BackupInfo{}, newError(ErrBackupNotFound, "backup file not found", map[string]any{"kind": kind})
}

func restoreLatestBackupFile(root, kind, databasePath string) error {
	backup, err := latestBackupByKind(root, kind)
	if err != nil {
		return err
	}
	backupPath := filepath.Join(backupDirectory(root), backup.ID)
	if err := checkSQLiteIntegrity(backupPath, true); err != nil {
		return err
	}
	temporaryPath := databasePath + ".migration-rollback-" + newID() + ".tmp"
	_ = os.Remove(temporaryPath)
	if err := copyFile(backupPath, temporaryPath); err != nil {
		return err
	}
	defer os.Remove(temporaryPath)
	_ = os.Remove(databasePath + "-wal")
	_ = os.Remove(databasePath + "-shm")
	if err := os.Remove(databasePath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return os.Rename(temporaryPath, databasePath)
}

func createBackupFile(ctx context.Context, root, kind string, db *sql.DB) (BackupInfo, error) {
	now := time.Now().UTC()
	name := backupFileName(kind, now)
	finalPath := filepath.Join(backupDirectory(root), name)
	temporaryPath := finalPath + ".tmp"
	_ = os.Remove(temporaryPath)
	if err := createConsistentSQLiteBackup(ctx, db, temporaryPath); err != nil {
		_ = os.Remove(temporaryPath)
		return BackupInfo{}, err
	}
	if err := checkSQLiteIntegrity(temporaryPath, false); err != nil {
		_ = os.Remove(temporaryPath)
		return BackupInfo{}, err
	}
	if err := os.Rename(temporaryPath, finalPath); err != nil {
		_ = os.Remove(temporaryPath)
		return BackupInfo{}, err
	}
	info, err := os.Stat(finalPath)
	if err != nil {
		return BackupInfo{}, err
	}
	return BackupInfo{ID: name, Kind: kind, CreatedAt: info.ModTime().UTC(), SizeBytes: info.Size()}, nil
}

func pruneBackups(root, kind string, keep int) error {
	if keep < 0 {
		return nil
	}
	items, err := listBackupFiles(root)
	if err != nil {
		return err
	}
	matched := make([]BackupInfo, 0, len(items))
	for _, item := range items {
		if item.Kind == kind {
			matched = append(matched, item)
		}
	}
	if len(matched) <= keep {
		return nil
	}
	for _, item := range matched[keep:] {
		if err := os.Remove(filepath.Join(backupDirectory(root), item.ID)); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return nil
}

func hasDailyBackupSince(root string, since time.Time) (bool, error) {
	items, err := listBackupFiles(root)
	if err != nil {
		return false, err
	}
	for _, item := range items {
		if item.Kind == BackupKindDaily && !item.CreatedAt.Before(since) {
			return true, nil
		}
	}
	return false, nil
}

func (m *Manager) scheduleDailyBackup(session *librarySession) {
	if session == nil {
		return
	}
	session.mu.Lock()
	if session.dailyBackupRunning || session.state != "open" || session.ctx.Err() != nil {
		session.mu.Unlock()
		return
	}
	session.dailyBackupRunning = true
	session.mu.Unlock()

	go m.runDailyBackup(session)
}

func (m *Manager) runDailyBackup(session *librarySession) {
	defer func() {
		session.mu.Lock()
		session.dailyBackupRunning = false
		session.mu.Unlock()
	}()

	m.backupMu.Lock()
	defer m.backupMu.Unlock()

	m.mu.RLock()
	current := m.current
	m.mu.RUnlock()
	if current != session {
		return
	}
	session.mu.RLock()
	available := session.state == "open" && session.ctx.Err() == nil
	session.mu.RUnlock()
	if !available {
		return
	}
	exists, err := hasDailyBackupSince(session.root, session.openedAt)
	if err == nil && exists {
		return
	}
	if err == nil {
		_, err = createBackupFile(context.Background(), session.root, BackupKindDaily, session.store.db)
	}
	if err == nil {
		err = pruneBackups(session.root, BackupKindDaily, dailyBackupRetention)
	}
	if err != nil {
		m.emitSessionEvent(session, "daily_backup_failed")
		return
	}
	m.emitSessionEvent(session, "daily_backup_completed")
}

func copyFile(source, destination string) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
		return err
	}
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	copied := false
	defer func() {
		_ = output.Close()
		if !copied {
			_ = os.Remove(destination)
		}
	}()
	if _, err := io.Copy(output, input); err != nil {
		return err
	}
	if err := output.Sync(); err != nil {
		return err
	}
	if err := output.Close(); err != nil {
		return err
	}
	copied = true
	return nil
}

func (m *Manager) BackupOverview() (BackupOverview, error) {
	session, err := m.currentSession()
	if err != nil {
		return BackupOverview{}, err
	}
	items, err := listBackupFiles(session.root)
	if err != nil {
		return BackupOverview{}, err
	}
	return BackupOverview{
		LibraryName: session.manifest.Name,
		LibraryRoot: session.root,
		Backups:     items,
	}, nil
}

func (m *Manager) CreateManualBackup() (BackupInfo, error) {
	m.backupMu.Lock()
	defer m.backupMu.Unlock()

	session, err := m.requireAvailableSession()
	if err != nil {
		return BackupInfo{}, err
	}
	session.mu.Lock()
	previousState := session.state
	session.state = "backing_up"
	session.mu.Unlock()
	m.emitSessionEvent(session, "backup_started")

	backup, backupErr := createBackupFile(context.Background(), session.root, BackupKindManual, session.store.db)
	session.mu.Lock()
	if session.state == "backing_up" {
		session.state = previousState
	}
	session.mu.Unlock()
	if backupErr != nil {
		m.emitSessionEvent(session, "backup_failed")
		return BackupInfo{}, backupErr
	}
	m.emitSessionEvent(session, "backup_completed")
	return backup, nil
}

func (m *Manager) RestoreBackup(id string) (LibrarySnapshot, error) {
	m.backupMu.Lock()
	defer m.backupMu.Unlock()

	session, err := m.requireAvailableSession()
	if err != nil {
		return LibrarySnapshot{}, err
	}
	backupPath, err := resolveBackupPath(session.root, id)
	if err != nil {
		return LibrarySnapshot{}, err
	}
	if err := checkSQLiteIntegrity(backupPath, true); err != nil {
		return LibrarySnapshot{}, newError(ErrBackupInvalid, "备份数据库完整性检查失败", map[string]any{
			"backupId": id,
			"cause":    err.Error(),
		})
	}

	session.mu.Lock()
	session.state = "restoring"
	session.mu.Unlock()
	m.emitSessionEvent(session, "restore_started")

	_, err = createBackupFile(context.Background(), session.root, BackupKindPreRestore, session.store.db)
	if err != nil {
		session.mu.Lock()
		session.state = "open"
		session.mu.Unlock()
		m.emitSessionEvent(session, "restore_failed")
		return LibrarySnapshot{}, fmt.Errorf("create pre-restore backup: %w", err)
	}
	if err := pruneBackups(session.root, BackupKindPreRestore, preRestoreBackupRetention); err != nil {
		session.mu.Lock()
		session.state = "open"
		session.mu.Unlock()
		m.emitSessionEvent(session, "restore_failed")
		return LibrarySnapshot{}, fmt.Errorf("prune pre-restore backups: %w", err)
	}

	databasePath := internalPath(session.root, "library.db")
	stagedPath := databasePath + ".restore-" + newID() + ".tmp"
	if err := copyFile(backupPath, stagedPath); err != nil {
		session.mu.Lock()
		session.state = "open"
		session.mu.Unlock()
		m.emitSessionEvent(session, "restore_failed")
		return LibrarySnapshot{}, fmt.Errorf("stage backup database: %w", err)
	}
	defer os.Remove(stagedPath)
	if err := checkSQLiteIntegrity(stagedPath, true); err != nil {
		session.mu.Lock()
		session.state = "open"
		session.mu.Unlock()
		m.emitSessionEvent(session, "restore_failed")
		return LibrarySnapshot{}, newError(ErrBackupInvalid, "暂存备份数据库完整性检查失败", map[string]any{
			"backupId": id,
			"cause":    err.Error(),
		})
	}

	stopLibrarySessionWorkers(session, "restoring")
	session.cancel()
	if err := session.store.Close(); err != nil {
		return m.recoverAfterFailedRestore(session, databasePath, "", fmt.Errorf("close current database: %w", err))
	}
	_ = os.Remove(databasePath + "-wal")
	_ = os.Remove(databasePath + "-shm")

	previousPath := databasePath + ".pre-restore-" + newID()
	if err := os.Rename(databasePath, previousPath); err != nil {
		return m.recoverAfterFailedRestore(session, databasePath, "", fmt.Errorf("preserve current database: %w", err))
	}
	if err := os.Rename(stagedPath, databasePath); err != nil {
		return m.recoverAfterFailedRestore(session, databasePath, previousPath, fmt.Errorf("activate restored database: %w", err))
	}

	database, err := openStore(session.root)
	if err != nil {
		_ = os.Remove(databasePath)
		return m.recoverAfterFailedRestore(session, databasePath, previousPath, fmt.Errorf("open restored database: %w", err))
	}
	replacement := m.newLibrarySession(session.root, session.manifest, database, session.lock)
	snapshot, activateErr := m.activateLibrarySession(replacement)
	if activateErr != nil {
		m.clearCurrentSession(replacement)
		_ = closeLibrarySession(replacement, false)
		_ = os.Remove(databasePath)
		return m.recoverAfterFailedRestore(session, databasePath, previousPath, fmt.Errorf("activate restored library: %w", activateErr))
	}
	_ = os.Remove(previousPath)
	m.emitSessionEvent(replacement, "restore_completed")
	return snapshot, nil
}

func (m *Manager) recoverAfterFailedRestore(session *librarySession, databasePath, previousPath string, cause error) (LibrarySnapshot, error) {
	if previousPath != "" {
		_ = os.Remove(databasePath)
		if err := os.Rename(previousPath, databasePath); err != nil {
			m.abandonRestoreSession(session)
			return LibrarySnapshot{}, fmt.Errorf("%v; restore original database: %w", cause, err)
		}
	}
	database, err := openStore(session.root)
	if err != nil {
		m.abandonRestoreSession(session)
		return LibrarySnapshot{}, fmt.Errorf("%v; reopen original database: %w", cause, err)
	}
	replacement := m.newLibrarySession(session.root, session.manifest, database, session.lock)
	if _, err := m.activateLibrarySession(replacement); err != nil {
		m.clearCurrentSession(replacement)
		_ = closeLibrarySession(replacement, false)
		_ = session.lock.Release()
		return LibrarySnapshot{}, fmt.Errorf("%v; reactivate original library: %w", cause, err)
	}
	m.emitSessionEvent(replacement, "restore_failed")
	return LibrarySnapshot{}, cause
}

func (m *Manager) clearCurrentSession(session *librarySession) {
	m.mu.Lock()
	if m.current == session {
		m.current = nil
	}
	m.mu.Unlock()
}

func (m *Manager) abandonRestoreSession(session *librarySession) {
	m.clearCurrentSession(session)
	_ = session.lock.Release()
}
