package local_library

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"time"
)

const (
	reconcileSourceScan    = "scan"
	reconcileSourceWatcher = "watcher"
	reconcileSourceImport  = "import"
	reconcileSourceRecheck = "recheck"
	reconcileSourceRetry   = "preview_retry"
)

var errFileNotStable = errors.New("file is still changing")

type reconcileResult struct {
	AssetID      AssetID
	RelativePath string
	Created      bool
	Missing      bool
	NeedsPreview bool
}

// ReconcilePath indexes one library-relative path through the same pipeline used
// by scans, watcher events, imports, and missing-file rechecks. operationID is
// used as the discovery token so application-managed changes can safely finish
// alongside a running scan without being marked missing.
func (m *Manager) ReconcilePath(relativePath, source, operationID string) (AssetID, bool, error) {
	session, err := m.requireAvailableSession()
	if err != nil {
		return "", false, err
	}
	result, err := m.reconcilePath(session.ctx, session, relativePath, source, operationID, "")
	return result.AssetID, result.Missing, err
}

func (m *Manager) reconcilePath(
	ctx context.Context,
	session *librarySession,
	relativePath string,
	source string,
	operationID string,
	scanID string,
) (reconcileResult, error) {
	normalized, _, err := normalizeRelative(relativePath)
	if err != nil {
		return reconcileResult{}, err
	}
	if string(normalized) == "" {
		return reconcileResult{}, newError(ErrInvalidPath, "a library-relative media path is required", nil)
	}
	target, err := resolveWithinRoot(session.root, string(normalized))
	if err != nil {
		return reconcileResult{}, err
	}
	info, statErr := os.Stat(target)
	if errors.Is(statErr, os.ErrNotExist) {
		_, key, normalizeErr := normalizeRelative(string(normalized))
		if normalizeErr != nil {
			return reconcileResult{}, normalizeErr
		}
		id, _, markErr := session.store.markAssetMissingPath(ctx, key)
		if markErr != nil {
			return reconcileResult{}, markErr
		}
		return reconcileResult{AssetID: id, RelativePath: string(normalized), Missing: true}, nil
	}
	if statErr != nil {
		return reconcileResult{}, statErr
	}
	if info.IsDir() || !isSupportedMedia(target) {
		return reconcileResult{}, newError(ErrUnsupportedFile, "path is not a supported media file", map[string]any{"path": normalized})
	}
	if source != reconcileSourceScan {
		info, err = waitForStableFile(ctx, target, 60*time.Millisecond, 600*time.Millisecond)
		if err != nil {
			return reconcileResult{}, err
		}
	}
	return m.reconcileKnownFile(ctx, session, string(normalized), target, info, source, operationID, scanID)
}

func (m *Manager) reconcileKnownFile(
	ctx context.Context,
	session *librarySession,
	relativePath string,
	absolutePath string,
	info os.FileInfo,
	source string,
	operationID string,
	scanID string,
) (reconcileResult, error) {
	normalized, key, err := normalizeRelative(relativePath)
	if err != nil {
		return reconcileResult{}, err
	}
	if string(normalized) == "" {
		return reconcileResult{}, newError(ErrInvalidPath, "a library-relative media path is required", nil)
	}
	if info.IsDir() || !isSupportedMedia(absolutePath) {
		return reconcileResult{}, newError(ErrUnsupportedFile, "path is not a supported media file", map[string]any{"path": normalized})
	}
	if source == reconcileSourceScan {
		unchanged, unchangedErr := session.touchUnchangedAssetForScan(ctx, key, info.Size(), info.ModTime().UnixNano(), scanID, operationID)
		if unchangedErr != nil {
			return reconcileResult{}, unchangedErr
		}
		if unchanged != nil {
			return reconcileResult{
				AssetID: unchanged.ID, RelativePath: string(normalized),
				NeedsPreview: unchanged.PreviewStatus != "ready" || unchanged.DominantColors == "" || unchanged.DominantColors == "[]",
			}, nil
		}
	}

	file := inspectMedia(absolutePath, info)
	file.RelativePath = string(normalized)
	file.PathKey = key
	file.FolderPath = filepath.ToSlash(filepath.Dir(string(normalized)))
	if file.FolderPath == "." {
		file.FolderPath = ""
	}

	var id AssetID
	var created bool
	if source == reconcileSourceScan {
		id, created, err = session.upsertAssetForScan(ctx, file, scanID, operationID)
	} else {
		id, created, err = session.upsertAssetForOperationWithToken(ctx, file, operationID)
	}
	if err != nil {
		return reconcileResult{}, err
	}
	return reconcileResult{
		AssetID:      id,
		RelativePath: string(normalized),
		Created:      created,
		NeedsPreview: file.PreviewStatus == "pending",
	}, nil
}

func waitForStableFile(ctx context.Context, path string, interval, maxWait time.Duration) (os.FileInfo, error) {
	previous, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	deadline := time.Now().Add(maxWait)
	timer := time.NewTimer(interval)
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-timer.C:
		}

		current, err := os.Stat(path)
		if err != nil {
			return nil, err
		}
		if current.Size() == previous.Size() && current.ModTime().Equal(previous.ModTime()) {
			return current, nil
		}
		if time.Now().After(deadline) {
			return current, errFileNotStable
		}
		previous = current
		timer.Reset(interval)
	}
}
