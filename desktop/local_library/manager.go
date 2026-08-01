package local_library

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

type librarySession struct {
	ctx                 context.Context
	cancel              context.CancelFunc
	done                chan struct{}
	root                string
	manifest            Manifest
	store               *store
	lock                *libraryLock
	sessionID           string
	openedAt            time.Time
	mu                  sync.RWMutex
	state               string
	scan                ScanStatus
	scanCancel          context.CancelFunc
	scanID              string
	scanToken           string
	watcher             *fsnotify.Watcher
	watcherMu           sync.Mutex
	ignoredWatcherPaths map[string]time.Time
	recoveryRunning     bool
	dailyBackupRunning  bool
	lastActiveCount     int64
	lastMissingCount    int64
	lastTrashCount      int64
	workers             sync.WaitGroup
	derivatives         *derivativeScheduler
}

type libraryProbeStatus string

const (
	libraryProbeReady       libraryProbeStatus = "ready"
	libraryProbeUnavailable libraryProbeStatus = "unavailable"
	libraryProbeInvalid     libraryProbeStatus = "invalid"
)

type libraryProbeFunc func(root string, expectedID LibraryID) (libraryProbeStatus, error)

type watcherStartFunc func(session *librarySession) error

type Manager struct {
	mu                  sync.RWMutex
	current             *librarySession
	registry            *Registry
	preferences         *preferenceStore
	emit                func(LocalLibraryEvent)
	thumbnailSem        chan struct{}
	probeLibrary        libraryProbeFunc
	startWatch          watcherStartFunc
	recoveryInterval    time.Duration
	folderMutationMu    sync.Mutex
	assetFileMutationMu sync.RWMutex
	backupMu            sync.Mutex
	queryTokenMu        sync.Mutex
	queryTokens         map[string]queryTokenRecord
}

func NewManager(configDir string, emit func(LocalLibraryEvent)) *Manager {
	return &Manager{
		registry:         NewRegistry(configDir),
		preferences:      newPreferenceStore(configDir),
		emit:             emit,
		thumbnailSem:     make(chan struct{}, 4),
		probeLibrary:     probeLibraryIdentity,
		startWatch:       nil,
		recoveryInterval: 2 * time.Second,
		queryTokens:      make(map[string]queryTokenRecord),
	}
}

type queryTokenRecord struct {
	SessionID string
	Query     AssetQuery
	ExpiresAt time.Time
}

func (m *Manager) startSessionWatcher(session *librarySession) error {
	if m.startWatch != nil {
		return m.startWatch(session)
	}
	return m.startWatcher(session)
}

func (session *librarySession) startWorker(run func()) bool {
	session.mu.Lock()
	if session.state == "closing" || sessionClosed(session.done) || session.ctx.Err() != nil {
		session.mu.Unlock()
		return false
	}
	session.workers.Add(1)
	session.mu.Unlock()
	go func() {
		defer session.workers.Done()
		run()
	}()
	return true
}

func sessionClosed(done <-chan struct{}) bool {
	select {
	case <-done:
		return true
	default:
		return false
	}
}

func (m *Manager) RecentLibraries() ([]RecentLibrary, error) { return m.registry.List() }
func (m *Manager) RemoveRecent(path string) error            { return m.registry.Remove(path) }

func (m *Manager) RestoreLastLibrary() (LibrarySnapshot, bool, error) {
	if snapshot, err := m.Snapshot(); err == nil {
		return snapshot, true, nil
	}
	shouldRestore, err := m.registry.ShouldRestoreLast()
	if err != nil || !shouldRestore {
		return LibrarySnapshot{}, false, err
	}
	recent, err := m.registry.List()
	if err != nil {
		return LibrarySnapshot{}, false, err
	}
	for _, item := range recent {
		if !item.Available {
			continue
		}
		snapshot, openErr := m.Open(item.Path)
		if openErr == nil {
			return snapshot, true, nil
		}
	}
	return LibrarySnapshot{}, false, nil
}

func (m *Manager) ImportPreferences() (LocalLibraryPreferences, error) {
	return m.preferences.Get()
}

func (m *Manager) SetImportMode(mode ImportMode) (LocalLibraryPreferences, error) {
	return m.preferences.SetImportMode(mode)
}

func (m *Manager) Create(root, name string, adoptExisting bool) (LibrarySnapshot, error) {
	clean, err := cleanRoot(root)
	if err != nil {
		return LibrarySnapshot{}, err
	}
	if err := checkNoNestedLibrary(clean); err != nil {
		return LibrarySnapshot{}, err
	}
	if _, err := os.Stat(internalPath(clean, manifestFileName)); err == nil {
		return LibrarySnapshot{}, newError(ErrInvalidLibrary, "目录已经是资源库", nil)
	}
	if !adoptExisting {
		entries, readErr := os.ReadDir(clean)
		if readErr != nil {
			return LibrarySnapshot{}, readErr
		}
		visible := 0
		for _, entry := range entries {
			if !strings.EqualFold(entry.Name(), internalDirName) {
				visible++
			}
		}
		if visible > 0 {
			return LibrarySnapshot{}, newError(
				ErrInvalidLibrary,
				"所选文件夹已有内容，可以将其初始化为资源库",
				map[string]any{"entries": visible, "path": clean},
			)
		}
	}
	staging := filepath.Join(clean, ".mo-gallery-initializing-"+newID())
	if err := os.Mkdir(staging, 0o700); err != nil {
		return LibrarySnapshot{}, err
	}
	_ = os.RemoveAll(staging)
	if err := prepareLibraryStructure(clean); err != nil {
		_ = os.RemoveAll(internalPath(clean))
		return LibrarySnapshot{}, err
	}
	manifest, err := createManifest(clean, name)
	if err != nil {
		_ = os.RemoveAll(internalPath(clean))
		return LibrarySnapshot{}, err
	}
	database, err := openStore(clean)
	if err != nil {
		_ = os.RemoveAll(internalPath(clean))
		return LibrarySnapshot{}, err
	}
	_ = database.Close()
	_ = m.registry.Touch(recentFrom(manifest, clean))
	return m.Open(clean)
}

func (m *Manager) Open(root string) (LibrarySnapshot, error) {
	clean, err := cleanRoot(root)
	if err != nil {
		return LibrarySnapshot{}, err
	}
	manifest, err := readManifest(clean)
	if err != nil {
		return LibrarySnapshot{}, err
	}
	m.mu.RLock()
	current := m.current
	m.mu.RUnlock()
	if current != nil && current.root == clean {
		return m.Snapshot()
	}
	if current != nil {
		if err := m.Close(); err != nil {
			return LibrarySnapshot{}, err
		}
	}
	lock, err := acquireLibraryLock(clean)
	if err != nil {
		return LibrarySnapshot{}, err
	}
	database, err := openStore(clean)
	if err != nil {
		_ = lock.Release()
		return LibrarySnapshot{}, err
	}
	session := m.newLibrarySession(clean, manifest, database, lock)
	return m.activateLibrarySession(session)
}

func (m *Manager) newLibrarySession(root string, manifest Manifest, database *store, lock *libraryLock) *librarySession {
	ctx, cancel := context.WithCancel(context.Background())
	session := &librarySession{
		ctx:                 ctx,
		cancel:              cancel,
		done:                make(chan struct{}),
		root:                root,
		manifest:            manifest,
		store:               database,
		lock:                lock,
		sessionID:           newID(),
		openedAt:            time.Now().UTC(),
		state:               "open",
		scan:                ScanStatus{State: "idle"},
		ignoredWatcherPaths: make(map[string]time.Time),
	}
	session.derivatives = newDerivativeScheduler(session, 4, func(ctx context.Context, request derivativeRequest) derivativeResult {
		return m.generateDerivative(ctx, session, request)
	})
	if active, missing, trashed, countErr := database.counts(ctx); countErr == nil {
		session.lastActiveCount = active
		session.lastMissingCount = missing
		session.lastTrashCount = trashed
	}
	if recoveryErr := m.recoverPendingFileOperations(session); recoveryErr != nil {
		session.state = "repair_required"
		session.scan = ScanStatus{State: "failed", Error: recoveryErr.Error()}
	}
	return session
}

func (m *Manager) activateLibrarySession(session *librarySession) (LibrarySnapshot, error) {
	m.mu.Lock()
	m.current = session
	m.mu.Unlock()
	if err := m.registry.Touch(recentFrom(session.manifest, session.root)); err != nil {
		m.emitEvent("registry_error")
	}
	if session.state != "repair_required" {
		_ = m.startSessionWatcher(session)
		_ = m.StartScan()
	}
	return m.Snapshot()
}

func (m *Manager) Close() error {
	m.backupMu.Lock()
	defer m.backupMu.Unlock()

	m.mu.Lock()
	session := m.current
	m.current = nil
	m.mu.Unlock()
	if session == nil {
		return nil
	}
	return closeLibrarySession(session, true)
}

func (m *Manager) CloseManually() error {
	if err := m.Close(); err != nil {
		return err
	}
	return m.registry.SetManuallyClosed(true)
}

func stopLibrarySessionWorkers(session *librarySession, state string) {
	if session == nil {
		return
	}
	session.mu.Lock()
	session.state = state
	if session.scanCancel != nil {
		session.scanCancel()
	}
	watcher := session.watcher
	session.watcher = nil
	if !sessionClosed(session.done) {
		close(session.done)
	}
	if session.derivatives != nil {
		session.derivatives.close()
	}
	session.mu.Unlock()
	if watcher != nil {
		_ = watcher.Close()
	}
	session.workers.Wait()
}

func closeLibrarySession(session *librarySession, releaseLock bool) error {
	if session == nil {
		return nil
	}
	stopLibrarySessionWorkers(session, "closing")
	// Cancel the shared database context only after all database workers have
	// exited. Cancelling it while modernc SQLite is servicing a query can leave
	// an asynchronous interrupt briefly holding library.db open on Windows.
	session.cancel()
	dbErr := session.store.Close()
	if !releaseLock {
		return dbErr
	}
	lockErr := session.lock.Release()
	if dbErr != nil {
		return dbErr
	}
	return lockErr
}

func (m *Manager) currentSession() (*librarySession, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.current == nil {
		return nil, newError(ErrNoActiveLibrary, "当前没有打开的资源库", nil)
	}
	return m.current, nil
}

func (m *Manager) requireAvailableSession() (*librarySession, error) {
	session, err := m.currentSession()
	if err != nil {
		return nil, err
	}
	session.mu.RLock()
	state := session.state
	session.mu.RUnlock()
	switch state {
	case "suspended":
		return nil, newError(ErrLibrarySuspended, "library storage is unavailable; waiting for reconnection", nil)
	case "repair_required":
		return nil, newError(ErrInvalidLibrary, "library identity validation failed; close and reopen the correct library", nil)
	case "backing_up", "restoring":
		return nil, newError(ErrLibraryMaintenance, "资源库正在执行备份或恢复，请稍后再试", nil)
	default:
		return session, nil
	}
}

func (m *Manager) Snapshot() (LibrarySnapshot, error) {
	session, err := m.currentSession()
	if err != nil {
		return LibrarySnapshot{}, err
	}
	session.mu.RLock()
	state, scan := session.state, session.scan
	active, missing, trashed := session.lastActiveCount, session.lastMissingCount, session.lastTrashCount
	session.mu.RUnlock()
	if state != "suspended" && state != "backing_up" && state != "restoring" && state != "closing" {
		if nextActive, nextMissing, nextTrashed, countErr := session.store.counts(session.ctx); countErr == nil {
			active, missing, trashed = nextActive, nextMissing, nextTrashed
			session.mu.Lock()
			session.lastActiveCount = active
			session.lastMissingCount = missing
			session.lastTrashCount = trashed
			session.mu.Unlock()
		} else if state != "repair_required" {
			return LibrarySnapshot{}, countErr
		}
	}
	return LibrarySnapshot{SessionID: session.sessionID, LibraryID: session.manifest.LibraryID, Name: session.manifest.Name, RootPath: session.root, State: state, AssetCount: active, MissingCount: missing, TrashCount: trashed, Scan: scan}, nil
}

func (m *Manager) ListAssets(query AssetQuery) (AssetPage, error) {
	session, err := m.currentSession()
	if err != nil {
		return AssetPage{}, err
	}
	session.mu.RLock()
	scan := session.scan
	session.mu.RUnlock()
	return session.store.listAssets(session.ctx, query, session.sessionID, scan)
}
func (m *Manager) ListFolders() ([]FolderDTO, error) {
	session, err := m.currentSession()
	if err != nil {
		return nil, err
	}
	return session.store.listFolders(session.ctx)
}

func (m *Manager) StartScan() error {
	session, err := m.currentSession()
	if err != nil {
		return err
	}
	session.mu.Lock()
	if session.state == "closing" || sessionClosed(session.done) || session.ctx.Err() != nil {
		session.mu.Unlock()
		return newError(ErrNoActiveLibrary, "library is closing", nil)
	}
	if session.state == "suspended" {
		session.mu.Unlock()
		return newError(ErrLibrarySuspended, "library storage is unavailable; waiting for reconnection", nil)
	}
	if session.state == "repair_required" {
		session.mu.Unlock()
		return newError(ErrInvalidLibrary, "library identity validation failed; close and reopen the correct library", nil)
	}
	if session.scan.State == "running" {
		session.mu.Unlock()
		return nil
	}
	scanCtx, cancel := context.WithCancel(session.ctx)
	scanID := newID()
	scanToken := newID()
	session.scanCancel = cancel
	session.scanID = scanID
	session.scanToken = scanToken
	now := time.Now().UTC()
	session.scan = ScanStatus{State: "running", StartedAt: &now}
	session.workers.Add(1)
	session.mu.Unlock()
	go func() {
		defer session.workers.Done()
		m.runScan(scanCtx, session, scanID, scanToken)
	}()
	return nil
}

func (m *Manager) PauseScan() error {
	session, err := m.currentSession()
	if err != nil {
		return err
	}
	session.mu.Lock()
	if session.scan.State != "running" {
		session.mu.Unlock()
		return newError(ErrScanState, "当前扫描未在运行", nil)
	}
	cancel := session.scanCancel
	session.scan.State = "paused"
	session.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	m.emitEvent("scan_paused")
	return nil
}

func (m *Manager) ResumeScan() error { return m.StartScan() }

func (m *Manager) CancelScan() error {
	session, err := m.currentSession()
	if err != nil {
		return err
	}
	session.mu.Lock()
	cancel := session.scanCancel
	session.scan.State = "cancelled"
	session.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	m.emitEvent("scan_cancelled")
	return nil
}

func (session *librarySession) upsertAssetForOperation(ctx context.Context, file indexedFile) (AssetID, bool, error) {
	return session.upsertAssetForOperationWithToken(ctx, file, "")
}

func (session *librarySession) upsertAssetForOperationWithToken(ctx context.Context, file indexedFile, operationID string) (AssetID, bool, error) {
	// Keep the read lock through the upsert. A finishing scan takes the write
	// lock before markUnseenMissing, so it cannot mark an application-managed
	// change missing between token selection and the database write.
	session.mu.RLock()
	defer session.mu.RUnlock()
	token := operationID
	if session.scan.State == "running" && session.scanToken != "" {
		token = session.scanToken
	}
	if token == "" {
		token = newID()
	}
	return session.store.upsertAsset(ctx, file, token)
}

func (session *librarySession) upsertAssetForScan(ctx context.Context, file indexedFile, scanID, token string) (AssetID, bool, error) {
	// The scan identity check and upsert must remain under the same read lock.
	// Scan completion takes the write lock before marking unseen rows missing.
	session.mu.RLock()
	defer session.mu.RUnlock()
	if session.scanID != scanID {
		return "", false, context.Canceled
	}
	return session.store.upsertAsset(ctx, file, token)
}

func (session *librarySession) touchUnchangedAssetForScan(ctx context.Context, pathKey string, byteSize, modifiedAtNS int64, scanID, token string) (*unchangedAsset, error) {
	session.mu.RLock()
	defer session.mu.RUnlock()
	if session.scanID != scanID {
		return nil, context.Canceled
	}
	return session.store.touchUnchangedAsset(ctx, pathKey, byteSize, modifiedAtNS, token)
}

func (m *Manager) runScan(ctx context.Context, session *librarySession, scanID, token string) {
	m.folderMutationMu.Lock()
	defer m.folderMutationMu.Unlock()
	var count int64
	changed := false
	folderPaths := make([]string, 0)
	canPruneFolders := true
	lastEvent := time.Now()
	err := filepath.WalkDir(session.root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			if errors.Is(walkErr, fs.ErrPermission) {
				canPruneFolders = false
				return nil
			}
			return walkErr
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		if entry.IsDir() {
			if path != session.root && strings.EqualFold(entry.Name(), internalDirName) {
				return filepath.SkipDir
			}
			if entry.Type()&os.ModeSymlink != 0 {
				return filepath.SkipDir
			}
			if path != session.root {
				relative, relErr := filepath.Rel(session.root, path)
				if relErr == nil {
					folderPaths = append(folderPaths, filepath.ToSlash(relative))
				}
			}
			return nil
		}
		if !isSupportedMedia(path) {
			return nil
		}
		relative, err := filepath.Rel(session.root, path)
		if err != nil {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return nil
		}
		reconciled, err := m.reconcileKnownFile(
			ctx,
			session,
			filepath.ToSlash(relative),
			path,
			info,
			reconcileSourceScan,
			token,
			scanID,
		)
		if err != nil {
			return err
		}
		count++
		changed = changed || reconciled.Created
		if reconciled.NeedsPreview {
			m.queueThumbnail(session, reconciled.AssetID)
		}
		session.mu.Lock()
		isCurrent := session.scanID == scanID
		if isCurrent {
			session.scan.Current = count
			session.scan.LastPath = filepath.ToSlash(relative)
		}
		session.mu.Unlock()
		if !isCurrent {
			return context.Canceled
		}
		if time.Since(lastEvent) > 200*time.Millisecond {
			m.emitSessionEvent(session, "scan_progress")
			lastEvent = time.Now()
		}
		return nil
	})
	if errors.Is(err, context.Canceled) {
		session.mu.Lock()
		if session.scanID == scanID && session.scan.State == "running" {
			session.scan.State = "paused"
		}
		session.mu.Unlock()
		return
	}
	if err != nil {
		probe, probeErr := m.probeLibrary(session.root, session.manifest.LibraryID)
		if probe != libraryProbeReady {
			m.handleLibraryProbeFailure(session, probe, probeErr)
			return
		}
		session.mu.Lock()
		isCurrent := session.scanID == scanID
		if isCurrent {
			session.scan.State = "failed"
			session.scan.Error = err.Error()
		}
		session.mu.Unlock()
		if isCurrent {
			m.emitSessionEvent(session, "scan_failed")
		}
		return
	}
	session.mu.Lock()
	if session.scanID != scanID {
		session.mu.Unlock()
		return
	}
	probe, probeErr := m.probeLibrary(session.root, session.manifest.LibraryID)
	if probe != libraryProbeReady {
		session.mu.Unlock()
		m.handleLibraryProbeFailure(session, probe, probeErr)
		return
	}
	scanChanged, finishErr := session.store.finishScan(session.ctx, token, folderPaths, canPruneFolders)
	if finishErr != nil {
		session.scan.State = "failed"
		session.scan.Error = finishErr.Error()
		session.mu.Unlock()
		m.emitSessionEvent(session, "scan_failed")
		return
	}
	changed = changed || scanChanged
	now := time.Now().UTC()
	session.state = "open"
	session.scan.State = "completed"
	session.scan.FinishedAt = &now
	session.scan.Current = count
	session.scan.Error = ""
	session.mu.Unlock()
	if active, missing, trashed, countErr := session.store.counts(session.ctx); countErr == nil {
		session.mu.Lock()
		session.lastActiveCount = active
		session.lastMissingCount = missing
		session.lastTrashCount = trashed
		session.mu.Unlock()
	}
	m.emitSessionEvent(session, "scan_completed")
	if changed {
		m.scheduleDailyBackup(session)
	}

}

func (m *Manager) emitEvent(kind string) {
	session, err := m.currentSession()
	if err != nil {
		return
	}
	m.emitSessionEvent(session, kind)
}

func (m *Manager) emitSessionEvent(session *librarySession, kind string) {
	if triggersDailyBackup(kind) {
		m.scheduleDailyBackup(session)
	}
	if m.emit == nil || session == nil {
		return
	}
	session.mu.RLock()
	state := LibraryEventState{
		State:        session.state,
		AssetCount:   session.lastActiveCount,
		MissingCount: session.lastMissingCount,
		TrashCount:   session.lastTrashCount,
		Scan:         session.scan,
	}
	sessionID := session.sessionID
	session.mu.RUnlock()
	m.emit(LocalLibraryEvent{SessionID: sessionID, Kind: kind, State: &state})
}

func triggersDailyBackup(kind string) bool {
	switch kind {
	case "asset_updated", "organization_updated", "assets_imported", "assets_trashed",
		"assets_permanently_deleted", "asset_restored", "missing_assets_removed",
		"asset_renamed", "assets_moved", "folder_created", "folder_moved",
		"folder_trashed", "folder_restored", "folder_permanently_deleted":
		return true
	default:
		return false
	}
}

func (m *Manager) emitPreviewStatus(session *librarySession, id AssetID, status string) {
	if m.emit == nil {
		return
	}
	m.emit(LocalLibraryEvent{
		SessionID:     session.sessionID,
		Kind:          "asset_preview_updated",
		AssetID:       id,
		PreviewStatus: status,
	})
}

func probeLibraryIdentity(root string, expectedID LibraryID) (libraryProbeStatus, error) {
	manifest, err := readManifest(root)
	if err != nil {
		var appErr *AppError
		if errors.As(err, &appErr) && appErr.Code == ErrInvalidLibrary {
			if _, statErr := os.Stat(root); statErr != nil {
				return libraryProbeUnavailable, statErr
			}
			return libraryProbeInvalid, err
		}
		return libraryProbeUnavailable, err
	}
	if manifest.LibraryID != expectedID {
		return libraryProbeInvalid, newError(ErrInvalidLibrary, "reconnected path is not the original library", map[string]any{
			"expectedLibraryId": expectedID,
			"actualLibraryId":   manifest.LibraryID,
		})
	}
	return libraryProbeReady, nil
}

func (m *Manager) handleLibraryProbeFailure(session *librarySession, status libraryProbeStatus, cause error) {
	session.mu.Lock()
	if session.state == "closing" || session.ctx.Err() != nil {
		session.mu.Unlock()
		return
	}
	if session.scanCancel != nil {
		session.scanCancel()
	}
	session.scanCancel = nil
	if status == libraryProbeInvalid {
		session.state = "repair_required"
		session.recoveryRunning = false
		session.scan.State = "failed"
		if cause != nil {
			session.scan.Error = cause.Error()
		} else {
			session.scan.Error = "library identity validation failed"
		}
		session.mu.Unlock()
		if session.watcher != nil {
			_ = session.watcher.Close()
		}
		m.emitSessionEvent(session, "library_identity_mismatch")
		return
	}
	alreadySuspended := session.state == "suspended"
	session.state = "suspended"
	session.scan.State = "suspended"
	if cause != nil {
		session.scan.Error = cause.Error()
	} else {
		session.scan.Error = "library storage is unavailable"
	}
	shouldRecover := !session.recoveryRunning
	if shouldRecover {
		session.recoveryRunning = true
		session.workers.Add(1)
	}
	watcher := session.watcher
	session.watcher = nil
	session.mu.Unlock()
	if watcher != nil {
		_ = watcher.Close()
	}
	if !alreadySuspended {
		m.emitSessionEvent(session, "library_suspended")
	}
	if shouldRecover {
		go func() {
			defer session.workers.Done()
			m.waitForLibraryRecovery(session)
		}()
	}
}

func (m *Manager) waitForLibraryRecovery(session *librarySession) {
	ticker := time.NewTicker(m.recoveryInterval)
	defer ticker.Stop()
	for {
		select {
		case <-session.done:
			session.mu.Lock()
			session.recoveryRunning = false
			session.mu.Unlock()
			return
		case <-ticker.C:
			status, err := m.probeLibrary(session.root, session.manifest.LibraryID)
			switch status {
			case libraryProbeUnavailable:
				continue
			case libraryProbeInvalid:
				m.handleLibraryProbeFailure(session, status, err)
				return
			case libraryProbeReady:
				session.mu.Lock()
				if session.state != "suspended" {
					session.recoveryRunning = false
					session.mu.Unlock()
					return
				}
				session.state = "open"
				session.recoveryRunning = false
				session.scan = ScanStatus{State: "idle"}
				session.mu.Unlock()
				if watcherErr := m.startSessionWatcher(session); watcherErr != nil {
					m.handleLibraryProbeFailure(session, libraryProbeUnavailable, watcherErr)
					return
				}
				m.emitSessionEvent(session, "library_reconnected")
				_ = m.StartScan()
				return
			}
		}
	}
}

func normalizeWatcherPath(path string) string {
	return strings.ToLower(filepath.Clean(path))
}

func (session *librarySession) ignoreWatcherPath(path string, ttl time.Duration) {
	if path == "" {
		return
	}
	session.watcherMu.Lock()
	defer session.watcherMu.Unlock()
	if session.ignoredWatcherPaths == nil {
		session.ignoredWatcherPaths = make(map[string]time.Time)
	}
	session.ignoredWatcherPaths[normalizeWatcherPath(path)] = time.Now().Add(ttl)
}

func (session *librarySession) removeWatcherTree(root string) {
	session.mu.RLock()
	watcher := session.watcher
	session.mu.RUnlock()
	if watcher == nil {
		return
	}
	paths := []string{}
	_ = filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err == nil && entry.IsDir() {
			paths = append(paths, path)
		}
		return nil
	})
	for index := len(paths) - 1; index >= 0; index-- {
		_ = watcher.Remove(paths[index])
	}
}

func (session *librarySession) shouldIgnoreWatcherPath(path string) bool {
	now := time.Now()
	key := normalizeWatcherPath(path)
	session.watcherMu.Lock()
	defer session.watcherMu.Unlock()
	for ignored, expiresAt := range session.ignoredWatcherPaths {
		if now.After(expiresAt) {
			delete(session.ignoredWatcherPaths, ignored)
			continue
		}
		if key == ignored || strings.HasPrefix(key, ignored+".tmp-") {
			return true
		}
	}
	return false
}

func watcherRelativePath(root, absolutePath string) (string, error) {
	relative, err := filepath.Rel(root, absolutePath)
	if err != nil {
		return "", err
	}
	normalized, _, err := normalizeRelative(filepath.ToSlash(relative))
	if err != nil {
		return "", err
	}
	if string(normalized) == "" {
		return "", newError(ErrInvalidPath, "watcher event does not identify a library file", nil)
	}
	return string(normalized), nil
}

func watcherPathIsInternal(root, path string) bool {
	relative, err := filepath.Rel(root, path)
	if err != nil {
		return false
	}
	parts := strings.Split(filepath.ToSlash(relative), "/")
	return len(parts) > 0 && strings.EqualFold(parts[0], internalDirName)
}

func (m *Manager) startWatcher(session *librarySession) error {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	watchedDirectories := make(map[string]struct{})
	addRecursive := func() error {
		return filepath.WalkDir(session.root, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if !d.IsDir() {
				return nil
			}
			if path != session.root && strings.EqualFold(d.Name(), internalDirName) {
				return filepath.SkipDir
			}
			if d.Type()&os.ModeSymlink != 0 {
				return filepath.SkipDir
			}
			key := normalizeWatcherPath(path)
			if _, exists := watchedDirectories[key]; exists {
				return nil
			}
			if err := watcher.Add(path); err != nil {
				return err
			}
			watchedDirectories[key] = struct{}{}
			return nil
		})
	}
	if err := addRecursive(); err != nil {
		_ = watcher.Close()
		return err
	}

	session.mu.Lock()
	if session.state == "closing" || sessionClosed(session.done) || session.ctx.Err() != nil {
		session.mu.Unlock()
		_ = watcher.Close()
		return context.Canceled
	}
	previousWatcher := session.watcher
	session.watcher = watcher
	session.workers.Add(1)
	session.mu.Unlock()
	if previousWatcher != nil {
		_ = previousWatcher.Close()
	}

	go func() {
		defer session.workers.Done()
		var timer *time.Timer
		var timerC <-chan time.Time
		pendingPaths := make(map[string]struct{})
		needsFullScan := false
		stopTimer := func() {
			if timer == nil {
				return
			}
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			timerC = nil
		}
		defer stopTimer()
		trigger := func() {
			if timer == nil {
				timer = time.NewTimer(700 * time.Millisecond)
			} else {
				stopTimer()
				timer.Reset(700 * time.Millisecond)
			}
			timerC = timer.C
		}
		queueEvent := func(event fsnotify.Event) {
			if event.Op&(fsnotify.Create|fsnotify.Write|fsnotify.Remove|fsnotify.Rename) == 0 {
				return
			}
			if watcherPathIsInternal(session.root, event.Name) || session.shouldIgnoreWatcherPath(event.Name) {
				return
			}

			pathKey := normalizeWatcherPath(event.Name)
			_, wasDirectory := watchedDirectories[pathKey]
			if wasDirectory {
				needsFullScan = true
				delete(watchedDirectories, pathKey)
				for watched := range watchedDirectories {
					if strings.HasPrefix(watched, pathKey+string(os.PathSeparator)) {
						delete(watchedDirectories, watched)
					}
				}
				trigger()
				return
			}

			if info, statErr := os.Stat(event.Name); statErr == nil && info.IsDir() {
				needsFullScan = true
				trigger()
				return
			} else if statErr != nil && !errors.Is(statErr, os.ErrNotExist) {
				needsFullScan = true
				trigger()
				return
			}

			if !isSupportedMedia(event.Name) {
				// A removed or renamed path can no longer be statted, so an
				// unsupported suffix may represent a directory and its subtree.
				// Fall back to a full scan rather than silently losing descendants.
				if event.Op&(fsnotify.Remove|fsnotify.Rename) != 0 {
					needsFullScan = true
					trigger()
				}
				return
			}
			relative, relErr := watcherRelativePath(session.root, event.Name)
			if relErr != nil {
				needsFullScan = true
			} else {
				pendingPaths[relative] = struct{}{}
			}
			trigger()
		}
		flush := func() {
			if needsFullScan {
				needsFullScan = false
				clear(pendingPaths)
				_ = addRecursive()
				_ = m.StartScan()
				return
			}
			operationID := newID()
			changed := false
			for relative := range pendingPaths {
				delete(pendingPaths, relative)
				reconciled, reconcileErr := m.reconcilePath(
					session.ctx,
					session,
					relative,
					reconcileSourceWatcher,
					operationID,
					"",
				)
				if reconcileErr != nil {
					if !errors.Is(reconcileErr, context.Canceled) {
						needsFullScan = true
					}
					continue
				}
				if reconciled.Missing && reconciled.AssetID == "" {
					// The missing path was not an indexed asset. It may have been a
					// directory whose subtree needs reconciliation.
					needsFullScan = true
					continue
				}
				if reconciled.NeedsPreview {
					m.queueThumbnail(session, reconciled.AssetID)
				}
				changed = changed || reconciled.Created || reconciled.Missing
			}
			if needsFullScan {
				needsFullScan = false
				_ = addRecursive()
				_ = m.StartScan()
				return
			}
			m.emitSessionEvent(session, "library_reconciled")
			if changed {
				m.scheduleDailyBackup(session)
			}
		}

		for {
			select {
			case <-session.done:
				return
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}
				queueEvent(event)
			case _, ok := <-watcher.Errors:
				if !ok {
					return
				}
				needsFullScan = true
				trigger()
			case <-timerC:
				timerC = nil
				flush()
			}
		}
	}()
	return nil
}
