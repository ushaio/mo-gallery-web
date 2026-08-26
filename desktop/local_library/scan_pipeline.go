package local_library

import (
	"context"
	"errors"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// Library initialization runs as a pipeline instead of a serial file-by-file
// loop:
//
//  1. one directory walk collects paths, sizes and modification times;
//  2. the existing index is loaded once and diffed in memory, so unchanged
//     files cost zero database writes;
//  3. changed files are inspected in parallel (decode header, EXIF, Live Photo
//     probe) and written by a single writer in batched transactions;
//  4. thumbnails are generated as part of initialization, with progress, so the
//     grid is already populated when the library opens.
//
// Step 4 matches how Eagle, Billfish and Pixcall behave: importing a folder
// finishes with previews on screen rather than a library that fills in later.
const (
	// indexWriteBatchSize is the number of inspected files committed per
	// transaction. Large enough to amortize the commit, small enough to keep
	// progress reporting responsive and memory bounded.
	indexWriteBatchSize = 256
	// scanProgressInterval throttles progress events emitted to the frontend.
	scanProgressInterval = 150 * time.Millisecond
	// thumbnailPrefetchBatch is how many asset rows the warm-up loads per query.
	thumbnailPrefetchBatch = 500
)

// thumbnailWarmItem pairs a pending thumbnail with its prefetched asset row.
type thumbnailWarmItem struct {
	ID     AssetID
	Source derivativeSource
}

type scanFileEntry struct {
	Relative string
	PathKey  string
	Absolute string
	Size     int64
	ModNS    int64
}

type scanWalkResult struct {
	Files          []scanFileEntry
	Folders        []string
	CanPruneFolder bool
}

func scanInspectWorkers() int {
	return max(2, min(runtime.GOMAXPROCS(0), 8))
}

// walkLibraryTree enumerates the library in a single pass. entry.Info() is
// served from the directory entry the OS already returned, so this does not add
// a stat syscall per file on Windows or Linux.
func walkLibraryTree(ctx context.Context, root string) (scanWalkResult, error) {
	result := scanWalkResult{CanPruneFolder: true}
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			if errors.Is(walkErr, fs.ErrPermission) {
				result.CanPruneFolder = false
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
			if path != root && strings.HasPrefix(entry.Name(), ".") {
				return filepath.SkipDir
			}
			if entry.Type()&os.ModeSymlink != 0 {
				return filepath.SkipDir
			}
			if path != root {
				if relative, relErr := filepath.Rel(root, path); relErr == nil {
					result.Folders = append(result.Folders, filepath.ToSlash(relative))
				}
			}
			return nil
		}
		if !isIndexableFile(path) {
			return nil
		}
		relative, relErr := filepath.Rel(root, path)
		if relErr != nil {
			return nil
		}
		info, infoErr := entry.Info()
		if infoErr != nil {
			return nil
		}
		normalized, key, normalizeErr := normalizeRelative(filepath.ToSlash(relative))
		if normalizeErr != nil || string(normalized) == "" {
			return nil
		}
		result.Files = append(result.Files, scanFileEntry{
			Relative: string(normalized),
			PathKey:  key,
			Absolute: path,
			Size:     info.Size(),
			ModNS:    info.ModTime().UnixNano(),
		})
		return nil
	})
	return result, err
}

type scanClassification struct {
	Changed      []scanFileEntry
	LiveProbes   []scanFileEntry
	UnchangedIDs []AssetID
	Reactivate   []AssetID
	Missing      []AssetID
	Thumbnails   []thumbnailCandidate
	UnchangedHit int64
}

// classifyScanEntries diffs the directory listing against the stored index.
func classifyScanEntries(entries []scanFileEntry, snapshot map[string]assetIndexRow) scanClassification {
	classification := scanClassification{}
	seen := make(map[string]struct{}, len(entries))
	for _, entry := range entries {
		seen[entry.PathKey] = struct{}{}
		existing, ok := snapshot[entry.PathKey]
		if !ok || existing.ByteSize != entry.Size || existing.ModifiedAtNS != entry.ModNS || existing.Availability != "active" {
			classification.Changed = append(classification.Changed, entry)
			continue
		}
		classification.UnchangedHit++
		classification.UnchangedIDs = append(classification.UnchangedIDs, existing.ID)
		if isSupportedMedia(entry.Absolute) && !isRAWExtension(filepath.Ext(entry.Absolute)) && needsThumbnail(existing) {
			format, _ := formatForExtension(filepath.Ext(entry.Absolute))
			classification.Thumbnails = append(classification.Thumbnails, thumbnailCandidate{
				ID: existing.ID, Format: format, Extension: strings.ToLower(filepath.Ext(entry.Absolute)),
			})
		}
		if !existing.LivePhotoProbed && isLivePhotoCandidate(entry.Absolute) {
			classification.LiveProbes = append(classification.LiveProbes, entry)
		}
	}
	for pathKey, row := range snapshot {
		if _, ok := seen[pathKey]; ok {
			continue
		}
		if row.Availability == "active" {
			classification.Missing = append(classification.Missing, row.ID)
		}
	}
	return classification
}

// needsThumbnail reports whether an unchanged asset still needs a grid
// thumbnail. Assets recorded as permanently unavailable are skipped so a corrupt
// file cannot stall every later initialization; RetryAssetPreviews handles them
// on demand.
func needsThumbnail(row assetIndexRow) bool {
	switch row.PreviewStatus {
	case "pending", "generating":
		return true
	case "ready":
		return !row.HasColors
	default:
		return false
	}
}

// inspectScanEntries inspects changed files in parallel and streams the results
// to a single database writer that commits them in batches. ctx aborts the
// pipeline between files; dbCtx carries the statements so a cancellation never
// interrupts an in-flight transaction.
func (m *Manager) inspectScanEntries(
	ctx context.Context,
	dbCtx context.Context,
	session *librarySession,
	entries []scanFileEntry,
	folderIDs map[string]*string,
	scanToken string,
	progress func(processed int64),
) ([]assetWriteResult, bool, error) {
	if len(entries) == 0 {
		return nil, false, nil
	}
	workers := scanInspectWorkers()
	queue := make(chan scanFileEntry, workers*4)
	inspected := make(chan indexedFile, workers*4)

	var walkers sync.WaitGroup
	for range workers {
		walkers.Add(1)
		go func() {
			defer walkers.Done()
			for entry := range queue {
				if ctx.Err() != nil {
					return
				}
				file := inspectScanEntry(entry)
				select {
				case inspected <- file:
				case <-ctx.Done():
					return
				}
			}
		}()
	}
	go func() {
		defer close(queue)
		for _, entry := range entries {
			select {
			case queue <- entry:
			case <-ctx.Done():
				return
			}
		}
	}()
	go func() {
		walkers.Wait()
		close(inspected)
	}()

	results := make([]assetWriteResult, 0, len(entries))
	batch := make([]indexedFile, 0, indexWriteBatchSize)
	created := false
	var processed int64
	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		written, err := session.store.writeIndexedFiles(dbCtx, batch, folderIDs, scanToken)
		if err != nil {
			return err
		}
		for _, result := range written {
			if result.Created {
				created = true
			}
		}
		results = append(results, written...)
		batch = batch[:0]
		return nil
	}
	for file := range inspected {
		batch = append(batch, file)
		processed++
		if len(batch) >= indexWriteBatchSize {
			if err := flush(); err != nil {
				return nil, created, err
			}
			if progress != nil {
				progress(processed)
			}
		}
		if ctx.Err() != nil {
			return nil, created, ctx.Err()
		}
	}
	if err := flush(); err != nil {
		return nil, created, err
	}
	if progress != nil {
		progress(processed)
	}
	return results, created, nil
}

func inspectScanEntry(entry scanFileEntry) indexedFile {
	info := scanEntryInfo{entry: entry}
	file := inspectMedia(entry.Absolute, info)
	file.RelativePath = entry.Relative
	file.PathKey = entry.PathKey
	file.FolderPath = filepath.ToSlash(filepath.Dir(entry.Relative))
	if file.FolderPath == "." {
		file.FolderPath = ""
	}
	if desc, ok := detectLivePhotoQuick(entry.Absolute, file.Format, file.Extension, entry.Size); ok {
		file.LivePhoto = desc
		file.MediaKind = "live-photo"
	}
	return file
}

// scanEntryInfo adapts the walk result to os.FileInfo so inspectMedia does not
// need a second stat call per file.
type scanEntryInfo struct {
	entry scanFileEntry
}

func (info scanEntryInfo) Name() string       { return filepath.Base(info.entry.Absolute) }
func (info scanEntryInfo) Size() int64        { return info.entry.Size }
func (info scanEntryInfo) Mode() os.FileMode  { return 0 }
func (info scanEntryInfo) ModTime() time.Time { return time.Unix(0, info.entry.ModNS) }
func (info scanEntryInfo) IsDir() bool        { return false }
func (info scanEntryInfo) Sys() any           { return nil }

// probeLivePhotoBackfill probes files indexed before Live Photo support existed.
// Each file is probed at most once across all scans.
func (m *Manager) probeLivePhotoBackfill(ctx context.Context, dbCtx context.Context, session *librarySession, entries []scanFileEntry, snapshot map[string]assetIndexRow) error {
	if len(entries) == 0 {
		return nil
	}
	workers := scanInspectWorkers()
	queue := make(chan scanFileEntry, workers*2)
	probed := make(chan livePhotoWrite, workers*2)
	var group sync.WaitGroup
	for range workers {
		group.Add(1)
		go func() {
			defer group.Done()
			for entry := range queue {
				if ctx.Err() != nil {
					return
				}
				row, ok := snapshot[entry.PathKey]
				if !ok {
					continue
				}
				extension := filepath.Ext(entry.Absolute)
				candidateFormat, _ := formatForExtension(extension)
				desc, _ := detectLivePhoto(entry.Absolute, candidateFormat, extension, entry.Size)
				select {
				case probed <- livePhotoWrite{ID: row.ID, Desc: desc}:
				case <-ctx.Done():
					return
				}
			}
		}()
	}
	go func() {
		defer close(queue)
		for _, entry := range entries {
			select {
			case queue <- entry:
			case <-ctx.Done():
				return
			}
		}
	}()
	go func() {
		group.Wait()
		close(probed)
	}()
	batch := make([]livePhotoWrite, 0, indexWriteBatchSize)
	for write := range probed {
		batch = append(batch, write)
		if len(batch) >= indexWriteBatchSize {
			if err := session.store.updateLivePhotos(dbCtx, batch); err != nil {
				return err
			}
			batch = batch[:0]
		}
	}
	return session.store.updateLivePhotos(dbCtx, batch)
}

func (m *Manager) runScan(ctx context.Context, session *librarySession, scanID, token string) {
	m.folderMutationMu.Lock()
	defer m.folderMutationMu.Unlock()
	scanStartedAt := time.Now()
	startedAtMS := time.Now().UnixMilli()
	// Database statements run on a context that cannot be cancelled: pausing or
	// cancelling a scan must stop the pipeline between statements, never
	// interrupt one. The modernc SQLite driver services a cancellation with an
	// asynchronous interrupt, which can leave library.db briefly open on Windows
	// and makes closing the library fail. Cancellation is still observed
	// promptly because every loop checks ctx between items.
	dbCtx := context.WithoutCancel(session.ctx)

	discoveryStartedAt := time.Now()
	walk, walkErr := walkLibraryTree(ctx, session.root)
	if errors.Is(walkErr, context.Canceled) {
		m.markScanPaused(session, scanID)
		return
	}
	if walkErr != nil {
		m.failScan(session, scanID, walkErr)
		return
	}
	total := int64(len(walk.Files))
	log.Printf("[local-library] scan discovery root=%s files=%d folders=%d elapsed=%s",
		session.root, total, len(walk.Folders), time.Since(discoveryStartedAt).Round(time.Millisecond))

	session.mu.Lock()
	if session.scanID == scanID {
		session.scan.Phase = "indexing"
		session.scan.Total = &total
		session.scan.Current = 0
		session.scan.ThumbnailCurrent = 0
		session.scan.ThumbnailTotal = nil
	}
	session.mu.Unlock()
	m.emitSessionEvent(session, "scan_progress")

	indexingStartedAt := time.Now()
	snapshot, err := session.store.indexSnapshot(dbCtx)
	if err != nil {
		m.failScanOrProbe(session, scanID, err)
		return
	}
	folders, err := session.store.folderSnapshot(dbCtx)
	if err != nil {
		m.failScanOrProbe(session, scanID, err)
		return
	}
	classification := classifyScanEntries(walk.Files, snapshot)

	folderIDs, err := session.store.ensureFolders(dbCtx, walk.Folders)
	if err != nil {
		m.failScanOrProbe(session, scanID, err)
		return
	}

	// Unchanged files are already active and indexed; report them immediately so
	// the progress bar reflects the work that was skipped.
	var lastEmit time.Time
	setProgress := func(current int64, path string) {
		session.mu.Lock()
		if session.scanID == scanID {
			session.scan.Current = current
			if path != "" {
				session.scan.LastPath = path
			}
		}
		session.mu.Unlock()
		if time.Since(lastEmit) >= scanProgressInterval {
			lastEmit = time.Now()
			m.emitSessionEvent(session, "scan_progress")
		}
	}
	setProgress(classification.UnchangedHit, "")

	written, created, err := m.inspectScanEntries(ctx, dbCtx, session, classification.Changed, folderIDs, token, func(processed int64) {
		last := ""
		if index := int(processed) - 1; index >= 0 && index < len(classification.Changed) {
			last = classification.Changed[index].Relative
		}
		setProgress(classification.UnchangedHit+processed, last)
	})
	if errors.Is(err, context.Canceled) {
		m.markScanPaused(session, scanID)
		return
	}
	if err != nil {
		m.failScanOrProbe(session, scanID, err)
		return
	}
	if err := m.probeLivePhotoBackfill(ctx, dbCtx, session, classification.LiveProbes, snapshot); err != nil {
		if errors.Is(err, context.Canceled) {
			m.markScanPaused(session, scanID)
			return
		}
		m.failScanOrProbe(session, scanID, err)
		return
	}
	log.Printf("[local-library] scan indexing root=%s files=%d changed=%d unchanged=%d elapsed=%s",
		session.root, total, len(classification.Changed), classification.UnchangedHit, time.Since(indexingStartedAt).Round(time.Millisecond))

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
	session.mu.Unlock()

	changed := created
	missingCount, err := session.store.markAssetsMissing(dbCtx, classification.Missing, token, startedAtMS)
	if err != nil {
		m.failScanOrProbe(session, scanID, err)
		return
	}
	changed = changed || missingCount > 0
	if walk.CanPruneFolder {
		stale := make([]string, 0)
		walkedKeys := make(map[string]struct{}, len(walk.Folders))
		for _, relative := range walk.Folders {
			if _, key, keyErr := normalizeRelative(relative); keyErr == nil {
				walkedKeys[key] = struct{}{}
			}
		}
		for pathKey, folder := range folders {
			if _, ok := walkedKeys[pathKey]; !ok {
				stale = append(stale, folder.ID)
			}
		}
		deleted, pruneErr := session.store.pruneFolders(dbCtx, stale)
		if pruneErr != nil {
			m.failScanOrProbe(session, scanID, pruneErr)
			return
		}
		changed = changed || deleted > 0
	}
	if err := session.store.flushAssetSearch(dbCtx); err != nil {
		m.failScanOrProbe(session, scanID, err)
		return
	}

	// Collect the assets that still need a grid thumbnail. Newly indexed files
	// come from the write results; unchanged files that never got a thumbnail
	// come from the diff.
	pending := classification.Thumbnails
	for _, result := range written {
		if !result.NeedsPreview || isRAWFormat(result.Format) || isRAWExtension(result.Extension) {
			continue
		}
		pending = append(pending, thumbnailCandidate{ID: result.ID, Format: result.Format, Extension: result.Extension})
	}
	m.runThumbnailPhase(ctx, dbCtx, session, scanID, pending)

	now := time.Now().UTC()
	session.mu.Lock()
	if session.scanID != scanID {
		session.mu.Unlock()
		return
	}
	session.state = "open"
	session.scan.Phase = ""
	session.scan.State = "completed"
	session.scan.FinishedAt = &now
	session.scan.Current = total
	session.scan.Error = ""
	session.mu.Unlock()
	if active, missing, trashed, countErr := session.store.counts(session.ctx); countErr == nil {
		session.mu.Lock()
		session.lastActiveCount = active
		session.lastMissingCount = missing
		session.lastTrashCount = trashed
		session.mu.Unlock()
	}
	log.Printf("[local-library] scan completed root=%s files=%d elapsed=%s", session.root, total, time.Since(scanStartedAt).Round(time.Millisecond))
	m.emitSessionEvent(session, "scan_completed")
	if changed {
		m.scheduleDailyBackup(session)
	}
	session.startWorker(func() { m.sweepOrphanDerivativeFiles(session) })
}

// runThumbnailPhase generates the outstanding grid thumbnails before the scan
// reports completion, so an initialized library opens with a populated grid.
// Cancelling the scan degrades to background generation instead of losing work.
func (m *Manager) runThumbnailPhase(ctx context.Context, dbCtx context.Context, session *librarySession, scanID string, pending []thumbnailCandidate) {
	if len(pending) == 0 {
		return
	}
	total := int64(len(pending))
	session.mu.Lock()
	if session.scanID != scanID {
		session.mu.Unlock()
		return
	}
	session.scan.Phase = "thumbnails"
	session.scan.ThumbnailTotal = &total
	session.scan.ThumbnailCurrent = 0
	session.mu.Unlock()
	session.bulkThumbnails.Store(true)
	defer session.bulkThumbnails.Store(false)
	m.emitSessionEvent(session, "scan_progress")

	startedAt := time.Now()
	var done int64
	var doneMu sync.Mutex
	var lastEmit time.Time
	report := func() {
		doneMu.Lock()
		current := done
		shouldEmit := time.Since(lastEmit) >= scanProgressInterval || current == total
		if shouldEmit {
			lastEmit = time.Now()
		}
		doneMu.Unlock()
		session.mu.Lock()
		if session.scanID == scanID {
			session.scan.ThumbnailCurrent = current
		}
		session.mu.Unlock()
		if shouldEmit {
			m.emitSessionEvent(session, "scan_progress")
		}
	}

	queue := make(chan thumbnailWarmItem)
	workers := scanInspectWorkers()
	var group sync.WaitGroup
	for range workers {
		group.Add(1)
		go func() {
			defer group.Done()
			for item := range queue {
				if ctx.Err() != nil || sessionClosed(session.done) {
					return
				}
				m.warmDerivative(ctx, session, item.ID, item.Source)
				doneMu.Lock()
				done++
				doneMu.Unlock()
				report()
			}
		}()
	}
	remaining := len(pending)
dispatch:
	for start := 0; start < len(pending); start += thumbnailPrefetchBatch {
		end := min(start+thumbnailPrefetchBatch, len(pending))
		chunk := pending[start:end]
		ids := make([]AssetID, 0, len(chunk))
		for _, candidate := range chunk {
			ids = append(ids, candidate.ID)
		}
		sources, sourceErr := session.store.derivativeSources(dbCtx, ids)
		if sourceErr != nil {
			remaining = len(pending) - start
			break dispatch
		}
		for index, candidate := range chunk {
			source, ok := sources[candidate.ID]
			if !ok || source.Availability != "active" {
				doneMu.Lock()
				done++
				doneMu.Unlock()
				report()
				continue
			}
			select {
			case queue <- thumbnailWarmItem{ID: candidate.ID, Source: source}:
				remaining = len(pending) - start - index - 1
			case <-ctx.Done():
				remaining = len(pending) - start - index
				break dispatch
			case <-session.done:
				remaining = len(pending) - start - index
				break dispatch
			}
		}
	}
	close(queue)
	group.Wait()
	// Flush the coalesced preview/derivative writes so the grid sees ready
	// thumbnails as soon as the overlay closes.
	session.derivatives.flushWrites(dbCtx)
	log.Printf("[local-library] scan thumbnails root=%s generated=%d skipped=%d elapsed=%s",
		session.root, total-int64(remaining), remaining, time.Since(startedAt).Round(time.Millisecond))
	if remaining > 0 {
		// The scan was cancelled or the library is closing: hand the rest to the
		// background scheduler so no thumbnail is lost.
		leftovers := pending[len(pending)-remaining:]
		session.startWorker(func() {
			for _, candidate := range leftovers {
				if sessionClosed(session.done) || session.ctx.Err() != nil {
					return
				}
				m.queueThumbnailCandidate(session, candidate)
			}
		})
	}
	session.mu.Lock()
	if session.scanID == scanID {
		session.scan.Phase = ""
		session.scan.ThumbnailCurrent = total - int64(remaining)
	}
	session.mu.Unlock()
}

func (m *Manager) markScanPaused(session *librarySession, scanID string) {
	session.mu.Lock()
	if session.scanID == scanID && session.scan.State == "running" {
		session.scan.State = "paused"
	}
	session.mu.Unlock()
}

func (m *Manager) failScan(session *librarySession, scanID string, cause error) {
	session.mu.Lock()
	isCurrent := session.scanID == scanID
	if isCurrent {
		session.scan.State = "failed"
		session.scan.Error = cause.Error()
	}
	session.mu.Unlock()
	if isCurrent {
		m.emitSessionEvent(session, "scan_failed")
	}
}

// failScanOrProbe reports a scan failure unless the library itself became
// unavailable, in which case the session moves to suspended/repair handling.
func (m *Manager) failScanOrProbe(session *librarySession, scanID string, cause error) {
	if errors.Is(cause, context.Canceled) {
		m.markScanPaused(session, scanID)
		return
	}
	probe, probeErr := m.probeLibrary(session.root, session.manifest.LibraryID)
	if probe != libraryProbeReady {
		m.handleLibraryProbeFailure(session, probe, probeErr)
		return
	}
	m.failScan(session, scanID, cause)
}
