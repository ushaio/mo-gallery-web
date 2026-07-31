package local_library

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (m *Manager) UpdateAsset(id AssetID, title, notes string, rating int, color string, favorite bool) error {
	session, err := m.requireAvailableSession()
	if err != nil {
		return err
	}
	err = session.store.updateAssetMetadata(session.ctx, id, title, notes, rating, color, favorite)
	if err == nil {
		m.emitEvent("asset_updated")
	}
	return err
}

func (m *Manager) ImportFiles(paths []string, destination string) ([]ImportResult, error) {
	preferences, err := m.ImportPreferences()
	if err != nil {
		return nil, err
	}
	if !validImportMode(preferences.ImportMode) {
		return nil, newError(ErrImportModeNotConfigured, "首次导入前请选择复制到资源库或移动到资源库", nil)
	}
	session, err := m.requireAvailableSession()
	if err != nil {
		return nil, err
	}
	target, err := resolveWithinRoot(session.root, destination)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(target)
	if err != nil || !info.IsDir() {
		return nil, newError(ErrInvalidPath, "导入目标必须是资源库内文件夹", nil)
	}
	results := make([]ImportResult, 0, len(paths))
	operationID := newID()
	for _, source := range paths {
		result := ImportResult{Source: source, Status: "failed"}
		sourceAbs, absErr := filepath.Abs(source)
		if absErr != nil {
			result.Error = absErr.Error()
			results = append(results, result)
			continue
		}
		sourceInfo, statErr := os.Stat(sourceAbs)
		if statErr != nil || sourceInfo.IsDir() {
			result.Error = "当前仅支持导入文件"
			results = append(results, result)
			continue
		}
		if !isSupportedMedia(sourceAbs) {
			result.Error = "不支持的图片格式"
			results = append(results, result)
			continue
		}
		if relativeCheck, relErr := filepath.Rel(session.root, sourceAbs); relErr == nil && relativeCheck != ".." && !strings.HasPrefix(relativeCheck, ".."+string(os.PathSeparator)) {
			result.Error = "文件已经位于当前资源库内"
			results = append(results, result)
			continue
		}
		destinationPath := filepath.Join(target, filepath.Base(sourceAbs))
		if _, conflict := os.Stat(destinationPath); conflict == nil {
			result.Error = "目标已存在同名文件，资源库不会覆盖"
			results = append(results, result)
			continue
		}
		// ImportFiles indexes the managed library file directly. Ignore matching
		// watcher events so the application-managed operation is not indexed twice.
		session.ignoreWatcherPath(destinationPath, 5*time.Second)
		var transferErr error
		if preferences.ImportMode == ImportModeCopy {
			transferErr = copyFileSafely(sourceAbs, destinationPath)
		} else {
			transferErr = moveFileSafely(sourceAbs, destinationPath)
		}
		if transferErr != nil {
			result.Error = transferErr.Error()
			results = append(results, result)
			continue
		}
		relative, relErr := filepath.Rel(session.root, destinationPath)
		if relErr != nil {
			result.Error = relErr.Error()
			results = append(results, result)
			continue
		}
		reconciled, reconcileErr := m.reconcilePath(
			session.ctx,
			session,
			filepath.ToSlash(relative),
			reconcileSourceImport,
			operationID,
			"",
		)
		if reconcileErr != nil {
			result.Error = reconcileErr.Error()
			results = append(results, result)
			continue
		}
		result.Status = "imported"
		result.Destination = reconciled.RelativePath
		result.AssetID = reconciled.AssetID
		results = append(results, result)
		m.queueThumbnail(session, reconciled.AssetID)
	}
	m.emitEvent("assets_imported")
	return results, nil
}

func moveFileSafely(source, destination string) error {
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return err
	}
	if err := os.Rename(source, destination); err == nil {
		return nil
	}
	// A move across Windows volumes cannot be completed by rename. Preserve
	// move semantics by copying completely, then deleting the source.
	return copyThenRemove(source, destination)
}

func copyFileSafely(source, destination string) error {
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return err
	}
	if _, err := os.Stat(destination); err == nil {
		return newError(ErrPathConflict, "目标已存在同名文件，资源库不会覆盖", nil)
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}

	input, err := os.Open(source)
	if err != nil {
		return err
	}

	temp := destination + ".tmp-" + newID()
	output, err := os.OpenFile(temp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		_ = input.Close()
		return err
	}

	copyErr := func() error {
		if _, err := io.Copy(output, input); err != nil {
			return err
		}
		return output.Sync()
	}()
	inputCloseErr := input.Close()
	outputCloseErr := output.Close()
	if copyErr != nil {
		_ = os.Remove(temp)
		return copyErr
	}
	if inputCloseErr != nil {
		_ = os.Remove(temp)
		return inputCloseErr
	}
	if outputCloseErr != nil {
		_ = os.Remove(temp)
		return outputCloseErr
	}
	if _, err := os.Stat(destination); err == nil {
		_ = os.Remove(temp)
		return newError(ErrPathConflict, "目标已存在同名文件，资源库不会覆盖", nil)
	} else if !errors.Is(err, os.ErrNotExist) {
		_ = os.Remove(temp)
		return err
	}
	if err := os.Rename(temp, destination); err != nil {
		_ = os.Remove(temp)
		return err
	}
	return nil
}

func copyThenRemove(source, destination string) error {
	if err := copyFileSafely(source, destination); err != nil {
		return err
	}
	if err := os.Remove(source); err != nil {
		if rollbackErr := os.Remove(destination); rollbackErr != nil {
			return fmt.Errorf("删除源文件失败: %v；撤销资源库副本也失败: %w", err, rollbackErr)
		}
		return fmt.Errorf("无法删除源文件，已撤销移入操作: %w", err)
	}
	return nil
}

func (m *Manager) TrashAssets(ids []AssetID) ([]TrashResult, error) {
	m.folderMutationMu.Lock()
	defer m.folderMutationMu.Unlock()
	m.assetFileMutationMu.Lock()
	defer m.assetFileMutationMu.Unlock()

	session, err := m.requireAvailableSession()
	if err != nil {
		return nil, err
	}
	results := make([]TrashResult, 0, len(ids))
	for _, id := range ids {
		result := TrashResult{AssetID: id, Status: "failed"}
		relative, _, status, pathErr := session.store.assetPath(session.ctx, id)
		if pathErr != nil || status != "active" {
			if pathErr != nil {
				result.Error = pathErr.Error()
			} else {
				result.Error = "资产当前不可删除"
			}
			results = append(results, result)
			continue
		}
		source, resolveErr := resolveWithinRoot(session.root, relative)
		if resolveErr != nil {
			result.Error = resolveErr.Error()
			results = append(results, result)
			continue
		}
		info, statErr := os.Stat(source)
		if statErr != nil {
			result.Error = statErr.Error()
			results = append(results, result)
			continue
		}
		trashID := newID()
		payloadRelative := filepath.ToSlash(filepath.Join("trash", trashID, "payload", filepath.Base(source)))
		destination := internalPath(session.root, filepath.FromSlash(payloadRelative))
		if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
			result.Error = err.Error()
			results = append(results, result)
			continue
		}
		if err := moveFileSafely(source, destination); err != nil {
			result.Error = err.Error()
			results = append(results, result)
			continue
		}
		_, dbErr := session.store.trashAsset(session.ctx, id, trashID, payloadRelative, info.Size())
		if dbErr != nil {
			_ = moveFileSafely(destination, source)
			result.Error = dbErr.Error()
			results = append(results, result)
			continue
		}
		result.Status = "trashed"
		results = append(results, result)
	}
	m.emitEvent("assets_trashed")
	return results, nil
}

func (m *Manager) PermanentDeleteAssets(ids []AssetID) ([]TrashResult, error) {
	m.folderMutationMu.Lock()
	defer m.folderMutationMu.Unlock()
	m.assetFileMutationMu.Lock()
	defer m.assetFileMutationMu.Unlock()

	session, err := m.requireAvailableSession()
	if err != nil {
		return nil, err
	}
	results := make([]TrashResult, 0, len(ids))
	processedFolderEntries := make(map[string]error)
	for _, id := range ids {
		result := TrashResult{AssetID: id, Status: "failed"}
		availability, relative, trashID, payload, infoErr := session.store.permanentDeleteInfo(session.ctx, id)
		if infoErr != nil {
			result.Error = infoErr.Error()
			results = append(results, result)
			continue
		}
		if availability == "trashed" && trashID != "" {
			entryKind, kindErr := session.store.trashEntryKind(session.ctx, trashID)
			if kindErr != nil {
				result.Error = kindErr.Error()
				results = append(results, result)
				continue
			}
			if entryKind == "folder" {
				deleteErr, processed := processedFolderEntries[trashID]
				if !processed {
					deleteErr = m.permanentDeleteFolderUnlocked(trashID)
					processedFolderEntries[trashID] = deleteErr
				}
				if deleteErr != nil {
					result.Error = deleteErr.Error()
				} else {
					result.Status = "deleted"
				}
				results = append(results, result)
				continue
			}
		}
		var target, trashEntryDir string
		if availability == "trashed" && payload != "" {
			target, trashEntryDir, err = resolveTrashPayload(session.root, trashID, payload)
			if err != nil {
				result.Error = err.Error()
				results = append(results, result)
				continue
			}
		} else {
			target, err = resolveWithinRoot(session.root, relative)
			if err != nil {
				result.Error = err.Error()
				results = append(results, result)
				continue
			}
		}
		if removeErr := os.Remove(target); removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
			result.Error = removeErr.Error()
			results = append(results, result)
			continue
		}
		if deleteErr := session.store.finishPermanentDelete(session.ctx, id); deleteErr != nil {
			result.Error = deleteErr.Error()
			results = append(results, result)
			continue
		}
		removeAssetDerivativeFiles(session.root, id)
		if trashEntryDir != "" {
			_ = os.RemoveAll(trashEntryDir)
		}
		result.Status = "deleted"
		results = append(results, result)
	}
	m.emitEvent("assets_permanently_deleted")
	return results, nil
}

func (m *Manager) RestoreAsset(id AssetID) error {
	m.folderMutationMu.Lock()
	defer m.folderMutationMu.Unlock()
	m.assetFileMutationMu.Lock()
	defer m.assetFileMutationMu.Unlock()

	session, err := m.requireAvailableSession()
	if err != nil {
		return err
	}
	trashEntryID, entryKind, err := session.store.trashEntryKindForAsset(session.ctx, id)
	if err != nil {
		return err
	}
	if entryKind == "folder" {
		return m.restoreFolderUnlocked(trashEntryID, "", "")
	}
	trashID, original, payload, err := session.store.restoreAsset(session.ctx, id)
	if err != nil {
		return err
	}
	source, trashEntryDir, err := resolveTrashPayload(session.root, trashID, payload)
	if err != nil {
		return err
	}
	destination, err := resolveWithinRoot(session.root, original)
	if err != nil {
		return err
	}
	if _, conflict := os.Stat(destination); conflict == nil {
		return newError(ErrPathConflict, "原位置已存在同名文件，不能覆盖", map[string]any{"path": original})
	}
	if err := moveFileSafely(source, destination); err != nil {
		return err
	}
	if err := session.store.finishRestore(session.ctx, id, trashID); err != nil {
		_ = moveFileSafely(destination, source)
		return err
	}
	_ = os.RemoveAll(trashEntryDir)
	m.emitEvent("asset_restored")
	return nil
}

func (m *Manager) resolveAssetRequest(ctx context.Context, sessionID string, id AssetID, kind, requestedCacheKey string) (string, string, error) {
	if !isOpaqueID(string(id)) {
		return "", "", newError(ErrAssetNotFound, "\u8d44\u4ea7\u6807\u8bc6\u65e0\u6548", nil)
	}
	session, err := m.requireAvailableSession()
	if err != nil {
		return "", "", err
	}
	if session.ctx.Err() != nil || sessionClosed(session.done) {
		return "", "", newError(ErrAssetNotFound, "library session is closed", nil)
	}
	if session.sessionID != sessionID {
		return "", "", newError(ErrAssetNotFound, "资源库会话已失效", nil)
	}
	relative, mimeType, status, err := session.store.assetPath(ctx, id)
	if err != nil {
		return "", "", err
	}
	if status != "active" {
		return "", "", newError(ErrAssetNotFound, "资产当前不可用", nil)
	}
	if kind == "thumbnail" || kind == "preview" {
		variant, priority := derivativeThumbnail, derivativePriorityVisible
		if kind == "preview" {
			variant, priority = derivativePreview, derivativePrioritySelected
		}
		source, sourceErr := session.store.derivativeSource(ctx, id)
		if sourceErr != nil {
			return "", "", sourceErr
		}
		expectedCacheKey := derivativeCacheKey(id, source.ModifiedAtNS, source.ByteSize, variant)
		if requestedCacheKey == "" || requestedCacheKey != expectedCacheKey {
			return "", "", newError(ErrAssetNotFound, "asset cache key is missing or stale", nil)
		}
		if kind == "preview" && mimeType == "image/gif" {
			original, resolveErr := resolveWithinRoot(session.root, relative)
			return original, mimeType, resolveErr
		}
		result, requestErr := m.requestDerivative(ctx, session, id, variant, priority, true)
		if requestErr != nil {
			return "", "", requestErr
		}
		return result.path, result.mime, nil
	}
	original, err := resolveWithinRoot(session.root, relative)
	return original, mimeType, err
}

func (m *Manager) AssetHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		path := strings.TrimPrefix(r.URL.Path, "/__local-library/")
		parts := strings.Split(path, "/")
		if len(parts) != 2 {
			http.NotFound(w, r)
			return
		}
		kind, id := parts[0], AssetID(parts[1])
		if kind != "thumbnail" && kind != "preview" && kind != "original" {
			http.NotFound(w, r)
			return
		}
		resolved, mimeType, err := m.resolveAssetRequest(r.Context(), r.URL.Query().Get("session"), id, kind, r.URL.Query().Get("v"))
		if err != nil {
			http.Error(w, "asset unavailable", http.StatusNotFound)
			return
		}
		if mimeType == "" {
			mimeType = mime.TypeByExtension(filepath.Ext(resolved))
		}
		if mimeType != "" {
			w.Header().Set("Content-Type", mimeType)
		}
		if kind == "original" {
			w.Header().Set("Cache-Control", "no-store")
		} else {
			w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
		}
		file, err := os.Open(resolved)
		if err != nil {
			http.Error(w, "asset unavailable", http.StatusNotFound)
			return
		}
		defer file.Close()
		info, err := file.Stat()
		if err != nil || !info.Mode().IsRegular() {
			http.Error(w, "asset unavailable", http.StatusNotFound)
			return
		}
		http.ServeContent(w, r, filepath.Base(resolved), info.ModTime(), contextReadSeeker{ctx: r.Context(), ReadSeeker: file})
	})
}

type contextReadSeeker struct {
	ctx context.Context
	io.ReadSeeker
}

func (reader contextReadSeeker) Read(buffer []byte) (int, error) {
	select {
	case <-reader.ctx.Done():
		return 0, reader.ctx.Err()
	default:
		return reader.ReadSeeker.Read(buffer)
	}
}

// RecheckMissingAssets verifies the original paths and restores the same asset records when files return.
func (m *Manager) RecheckMissingAssets(ids []AssetID) ([]AssetMaintenanceResult, error) {
	session, err := m.requireAvailableSession()
	if err != nil {
		return nil, err
	}
	results := make([]AssetMaintenanceResult, 0, len(ids))
	operationID := newID()
	for _, id := range ids {
		result := AssetMaintenanceResult{AssetID: id, Status: "failed"}
		relative, _, status, pathErr := session.store.assetPath(session.ctx, id)
		if pathErr != nil {
			result.Error = pathErr.Error()
			results = append(results, result)
			continue
		}
		if status != "missing" {
			result.Error = newError(ErrPathConflict, "仅失联资产可以执行此操作", map[string]any{"assetId": id}).Error()
			results = append(results, result)
			continue
		}
		reconciled, reconcileErr := m.reconcilePath(
			session.ctx,
			session,
			relative,
			reconcileSourceRecheck,
			operationID,
			"",
		)
		if reconcileErr != nil {
			result.Error = reconcileErr.Error()
			results = append(results, result)
			continue
		}
		if reconciled.Missing {
			result.Status = "still_missing"
			results = append(results, result)
			continue
		}
		if reconciled.AssetID != id {
			result.Error = newError(ErrPathConflict, "恢复后的资产记录不一致", map[string]any{"assetId": id, "restoredAssetId": reconciled.AssetID}).Error()
			results = append(results, result)
			continue
		}
		result.Status = "restored"
		results = append(results, result)
		m.queueThumbnail(session, id)
	}
	m.emitEvent("missing_assets_rechecked")
	return results, nil
}

// RetryAssetPreviews re-inspects media and retries thumbnail generation on the same asset records.
func (m *Manager) RetryAssetPreviews(ids []AssetID) ([]AssetMaintenanceResult, error) {
	session, err := m.requireAvailableSession()
	if err != nil {
		return nil, err
	}
	results := make([]AssetMaintenanceResult, 0, len(ids))
	operationID := newID()
	for _, id := range ids {
		result := AssetMaintenanceResult{AssetID: id, Status: "failed"}
		relative, _, availability, pathErr := session.store.assetPath(session.ctx, id)
		if pathErr != nil {
			result.Error = pathErr.Error()
			results = append(results, result)
			continue
		}
		if availability != "active" {
			result.Error = newError(ErrPathConflict, "only active assets can retry previews", map[string]any{"assetId": id}).Error()
			results = append(results, result)
			continue
		}
		reconciled, reconcileErr := m.reconcilePath(session.ctx, session, relative, reconcileSourceRetry, operationID, "")
		if reconcileErr != nil {
			result.Error = reconcileErr.Error()
			results = append(results, result)
			continue
		}
		if reconciled.Missing {
			result.Status = "missing"
			results = append(results, result)
			continue
		}
		if reconciled.AssetID != id {
			result.Error = newError(ErrPathConflict, "preview retry resolved to a different asset", map[string]any{"assetId": id, "resolvedAssetId": reconciled.AssetID}).Error()
			results = append(results, result)
			continue
		}
		status, previewErr := m.ensureThumbnail(session, id)
		if previewErr != nil {
			result.Error = previewErr.Error()
			results = append(results, result)
			continue
		}
		result.Status = status
		results = append(results, result)
	}
	m.emitEvent("asset_previews_retried")
	return results, nil
}

// RemoveMissingAssets removes only stale index records. It never deletes a file from disk.
func (m *Manager) RemoveMissingAssets(ids []AssetID) ([]AssetMaintenanceResult, error) {
	session, err := m.requireAvailableSession()
	if err != nil {
		return nil, err
	}
	results := make([]AssetMaintenanceResult, 0, len(ids))
	for _, id := range ids {
		result := AssetMaintenanceResult{AssetID: id, Status: "failed"}
		relative, _, status, pathErr := session.store.assetPath(session.ctx, id)
		if pathErr != nil {
			result.Error = pathErr.Error()
			results = append(results, result)
			continue
		}
		if status != "missing" {
			result.Error = newError(ErrPathConflict, "仅失联资产可以执行此操作", map[string]any{"assetId": id}).Error()
			results = append(results, result)
			continue
		}
		target, resolveErr := resolveWithinRoot(session.root, relative)
		if resolveErr != nil {
			result.Error = resolveErr.Error()
			results = append(results, result)
			continue
		}
		if _, statErr := os.Stat(target); statErr == nil {
			result.Error = newError(ErrPathConflict, "原文件已经出现，请先重新检查", map[string]any{"path": relative}).Error()
			results = append(results, result)
			continue
		} else if !errors.Is(statErr, os.ErrNotExist) {
			result.Error = statErr.Error()
			results = append(results, result)
			continue
		}
		if removeErr := session.store.removeMissingAsset(session.ctx, id); removeErr != nil {
			result.Error = removeErr.Error()
			results = append(results, result)
			continue
		}
		removeAssetDerivativeFiles(session.root, id)
		result.Status = "removed"
		results = append(results, result)
	}
	m.emitEvent("missing_assets_removed")
	return results, nil
}
