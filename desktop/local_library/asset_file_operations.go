package local_library

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	assetMoveOperationKind          = "asset_move"
	assetMoveStagePrepared          = "prepared"
	assetMoveStageDiskMoved         = "disk_moved"
	assetMoveStageDatabaseCommitted = "database_committed"
)

const assetFileOperationPlanKind = "asset_move_plan"

func assetFileOperationPlanPath(root, id string) string {
	return internalPath(root, "operations", id+".asset-plan.json")
}

func (m *Manager) PlanAssetMove(ids []AssetID, destinationFolder, conflictPolicy string) (AssetFileOperationPlan, error) {
	if conflictPolicy == "" {
		conflictPolicy = "skip"
	}
	if conflictPolicy != "skip" && conflictPolicy != "rename" {
		return AssetFileOperationPlan{}, newError(ErrInvalidPath, "不支持的冲突处理策略", map[string]any{"policy": conflictPolicy})
	}
	session, err := m.requireAvailableSession()
	if err != nil {
		return AssetFileOperationPlan{}, err
	}
	destinationFolder, err = validateAssetDestinationFolder(session, destinationFolder)
	if err != nil {
		return AssetFileOperationPlan{}, err
	}
	plan := AssetFileOperationPlan{ID: newID(), Version: 1, Kind: assetFileOperationPlanKind, DestinationFolder: destinationFolder, ConflictPolicy: conflictPolicy, CreatedAt: time.Now().UTC()}
	seen := make(map[AssetID]struct{}, len(ids))
	reserved := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		item := AssetFileOperationItem{AssetID: id}
		source, _, availability, pathErr := session.store.assetPath(session.ctx, id)
		if pathErr != nil {
			item.Warning = pathErr.Error()
			plan.Items = append(plan.Items, item)
			continue
		}
		item.Source = source
		if availability != "active" {
			item.Warning = "只有正常状态的资产可以移动"
			plan.Items = append(plan.Items, item)
			continue
		}
		name := filepath.Base(filepath.FromSlash(source))
		destination, _, destErr := destinationAssetRelative(destinationFolder, name)
		if destErr != nil {
			item.Warning = destErr.Error()
			plan.Items = append(plan.Items, item)
			continue
		}
		item.Destination = destination
		if _, statErr := os.Lstat(filepath.Join(session.root, filepath.FromSlash(destination))); statErr == nil {
			item.Conflict = true
			plan.ConflictCount++
			if conflictPolicy == "rename" {
				item.Destination = nextAvailableAssetName(session.root, destination, reserved)
			} else {
				item.Warning = "目标已存在，执行时将跳过"
			}
		} else if !errors.Is(statErr, os.ErrNotExist) {
			item.Warning = statErr.Error()
		}
		reserved[item.Destination] = struct{}{}
		if info, statErr := os.Stat(filepath.Join(session.root, filepath.FromSlash(source))); statErr == nil {
			plan.TotalBytes += info.Size()
		}
		plan.Items = append(plan.Items, item)
	}
	if err := writeJSONAtomic(assetFileOperationPlanPath(session.root, plan.ID), plan); err != nil {
		return AssetFileOperationPlan{}, err
	}
	return plan, nil
}

func nextAvailableAssetName(root, relative string, reserved map[string]struct{}) string {
	dir, name := filepath.ToSlash(filepath.Dir(filepath.FromSlash(relative))), filepath.Base(filepath.FromSlash(relative))
	ext := filepath.Ext(name)
	stem := strings.TrimSuffix(name, ext)
	for index := 1; ; index++ {
		candidateName := fmt.Sprintf("%s (%d)%s", stem, index, ext)
		candidate := candidateName
		if dir != "." && dir != "" {
			candidate = dir + "/" + candidateName
		}
		if _, ok := reserved[candidate]; ok {
			continue
		}
		if _, err := os.Lstat(filepath.Join(root, filepath.FromSlash(candidate))); errors.Is(err, os.ErrNotExist) {
			return candidate
		}
	}
}

func (m *Manager) ExecuteAssetMovePlan(planID string) (AssetFileOperationExecution, error) {
	m.folderMutationMu.Lock()
	defer m.folderMutationMu.Unlock()
	m.assetFileMutationMu.Lock()
	defer m.assetFileMutationMu.Unlock()
	session, err := m.requireAvailableSession()
	if err != nil {
		return AssetFileOperationExecution{}, err
	}
	data, err := os.ReadFile(assetFileOperationPlanPath(session.root, planID))
	if err != nil {
		return AssetFileOperationExecution{}, err
	}
	var plan AssetFileOperationPlan
	if err := json.Unmarshal(data, &plan); err != nil || plan.ID != planID || plan.Version != 1 || plan.Kind != assetFileOperationPlanKind {
		return AssetFileOperationExecution{}, newError(ErrInvalidPath, "文件操作计划无效", nil)
	}
	execution := AssetFileOperationExecution{PlanID: plan.ID, Status: "completed", Results: make([]AssetMoveResult, 0, len(plan.Items))}
	for _, item := range plan.Items {
		result := AssetMoveResult{AssetID: item.AssetID, Source: item.Source, Destination: item.Destination, Status: "failed"}
		if item.Warning != "" && !item.Conflict {
			result.Error = item.Warning
			execution.Results = append(execution.Results, result)
			execution.Status = "partial"
			continue
		}
		destination, destinationErr := resolveWithinRoot(session.root, item.Destination)
		if destinationErr != nil {
			result.Error = destinationErr.Error()
			execution.Results = append(execution.Results, result)
			execution.Status = "partial"
			continue
		}
		if _, statErr := os.Lstat(destination); statErr == nil {
			if plan.ConflictPolicy == "skip" {
				result.Status = "skipped"
				result.Error = "目标已存在，按计划跳过"
				execution.Results = append(execution.Results, result)
				execution.Status = "partial"
				continue
			}
			item.Destination = nextAvailableAssetName(session.root, item.Destination, map[string]struct{}{})
			result.Destination = item.Destination
		} else if !errors.Is(statErr, os.ErrNotExist) {
			result.Error = statErr.Error()
			execution.Results = append(execution.Results, result)
			execution.Status = "partial"
			continue
		}
		moved, moveErr := m.moveOneAsset(session, item.AssetID, item.Source, item.Destination)
		if moveErr != nil {
			result.Error = moveErr.Error()
			execution.Status = "partial"
		} else {
			result = moved
		}
		execution.Results = append(execution.Results, result)
	}
	_ = os.Remove(assetFileOperationPlanPath(session.root, planID))
	if len(execution.Results) > 0 {
		m.emitEvent("assets_moved")
	}
	return execution, nil
}

type assetMoveOperation struct {
	ID                  string    `json:"id"`
	Kind                string    `json:"kind"`
	Stage               string    `json:"stage"`
	AssetID             AssetID   `json:"assetId"`
	SourceRelative      string    `json:"sourceRelative"`
	DestinationRelative string    `json:"destinationRelative"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`
}

func newAssetMoveOperation(assetID AssetID, sourceRelative, destinationRelative string) assetMoveOperation {
	now := time.Now().UTC()
	return assetMoveOperation{
		ID: newID(), Kind: assetMoveOperationKind, Stage: assetMoveStagePrepared,
		AssetID: assetID, SourceRelative: sourceRelative, DestinationRelative: destinationRelative,
		CreatedAt: now, UpdatedAt: now,
	}
}

func assetMoveOperationPath(root, id string) string {
	return internalPath(root, "operations", id+".asset-move.json")
}

func writeAssetMoveOperation(root string, operation assetMoveOperation) (string, error) {
	path := assetMoveOperationPath(root, operation.ID)
	return path, writeAssetMoveOperationAt(path, operation)
}

func writeAssetMoveOperationAt(path string, operation assetMoveOperation) error {
	operation.UpdatedAt = time.Now().UTC()
	return writeJSONAtomic(path, operation)
}

func readAssetMoveOperation(path string) (assetMoveOperation, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return assetMoveOperation{}, err
	}
	var operation assetMoveOperation
	if err := json.Unmarshal(data, &operation); err != nil {
		return assetMoveOperation{}, err
	}
	if operation.Kind != assetMoveOperationKind || !isOpaqueID(operation.ID) || operation.AssetID == "" {
		return assetMoveOperation{}, fmt.Errorf("invalid asset move operation")
	}
	if _, _, err := normalizeRelative(operation.SourceRelative); err != nil {
		return assetMoveOperation{}, err
	}
	if _, _, err := normalizeRelative(operation.DestinationRelative); err != nil {
		return assetMoveOperation{}, err
	}
	return operation, nil
}

func filePathExists(path string) (bool, error) {
	info, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return !info.IsDir(), nil
}

func validateAssetFileName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", newError(ErrInvalidPath, "\u6587\u4ef6\u540d\u4e0d\u80fd\u4e3a\u7a7a", nil)
	}
	if strings.ContainsAny(name, `<>:"/\\|?*`) || strings.ContainsRune(name, 0) {
		return "", newError(ErrInvalidPath, "\u6587\u4ef6\u540d\u5305\u542b Windows \u4e0d\u5141\u8bb8\u7684\u5b57\u7b26", map[string]any{"name": name})
	}
	normalized, _, err := normalizeRelative(name)
	if err != nil {
		return "", err
	}
	if normalized == "" || strings.Contains(string(normalized), "/") {
		return "", newError(ErrInvalidPath, "\u6587\u4ef6\u540d\u5fc5\u987b\u662f\u5355\u4e2a\u6587\u4ef6\u540d", map[string]any{"name": name})
	}
	if !isSupportedMedia(name) {
		return "", newError(ErrUnsupportedFile, "\u6587\u4ef6\u6269\u5c55\u4e0d\u53d7\u652f\u6301", map[string]any{"name": name})
	}
	return name, nil
}

func destinationAssetRelative(folder, fileName string) (string, string, error) {
	folderRelative, _, err := normalizeRelative(folder)
	if err != nil {
		return "", "", err
	}
	fileName, err = validateAssetFileName(fileName)
	if err != nil {
		return "", "", err
	}
	relative := fileName
	if folderRelative != "" {
		relative = string(folderRelative) + "/" + fileName
	}
	normalized, key, err := normalizeRelative(relative)
	return string(normalized), key, err
}

func validateAssetDestinationFolder(session *librarySession, relative string) (string, error) {
	normalized, key, err := normalizeRelative(relative)
	if err != nil {
		return "", err
	}
	absolute, err := resolveWithinRoot(session.root, string(normalized))
	if err != nil {
		return "", err
	}
	info, err := os.Stat(absolute)
	if errors.Is(err, os.ErrNotExist) {
		return "", newError(ErrInvalidPath, "\u76ee\u6807\u6587\u4ef6\u5939\u4e0d\u5b58\u5728", map[string]any{"path": normalized})
	}
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", newError(ErrInvalidPath, "\u76ee\u6807\u8def\u5f84\u4e0d\u662f\u6587\u4ef6\u5939", map[string]any{"path": normalized})
	}
	if normalized != "" {
		_, err := session.store.folderByPathKey(session.ctx, key)
		if errors.Is(err, sql.ErrNoRows) {
			return "", newError(ErrInvalidPath, "\u76ee\u6807\u6587\u4ef6\u5939\u4e0d\u662f\u8d44\u6e90\u5e93\u6587\u4ef6\u5939", map[string]any{"path": normalized})
		}
		if err != nil {
			return "", err
		}
	}
	return string(normalized), nil
}

func moveActiveFile(source, destination string, caseOnlyRename bool) error {
	if filepath.Clean(source) == filepath.Clean(destination) {
		return nil
	}
	if caseOnlyRename || (runtime.GOOS == "windows" && strings.EqualFold(filepath.Clean(source), filepath.Clean(destination))) {
		temporary := source + ".mo-gallery-move-" + newID()
		if err := renameFileNoReplace(source, temporary); err != nil {
			return err
		}
		if err := renameFileNoReplace(temporary, destination); err != nil {
			_ = renameFileNoReplace(temporary, source)
			return err
		}
		return nil
	}
	return renameFileNoReplace(source, destination)
}

// RenameAsset changes the real file name and keeps the existing asset record and organization data.
func (m *Manager) RenameAsset(id AssetID, fileName string) (AssetMoveResult, error) {
	m.folderMutationMu.Lock()
	defer m.folderMutationMu.Unlock()
	m.assetFileMutationMu.Lock()
	defer m.assetFileMutationMu.Unlock()

	session, err := m.requireAvailableSession()
	if err != nil {
		return AssetMoveResult{}, err
	}
	sourceRelative, _, availability, err := session.store.assetPath(session.ctx, id)
	if err != nil {
		return AssetMoveResult{}, err
	}
	if availability != "active" {
		return AssetMoveResult{}, newError(ErrInvalidPath, "\u53ea\u6709\u6b63\u5e38\u72b6\u6001\u7684\u7167\u7247\u53ef\u4ee5\u91cd\u547d\u540d", map[string]any{"assetId": id, "availability": availability})
	}
	folder := filepath.ToSlash(filepath.Dir(sourceRelative))
	if folder == "." {
		folder = ""
	}
	destinationRelative, _, err := destinationAssetRelative(folder, fileName)
	if err != nil {
		return AssetMoveResult{}, err
	}
	result, err := m.moveOneAsset(session, id, sourceRelative, destinationRelative)
	if err == nil {
		m.emitEvent("asset_renamed")
	}
	return result, err
}

// MoveAssets moves selected real files into one existing real folder. Each item has its own result.
func (m *Manager) MoveAssets(ids []AssetID, destinationFolder string) ([]AssetMoveResult, error) {
	m.folderMutationMu.Lock()
	defer m.folderMutationMu.Unlock()
	m.assetFileMutationMu.Lock()
	defer m.assetFileMutationMu.Unlock()

	session, err := m.requireAvailableSession()
	if err != nil {
		return nil, err
	}
	destinationFolder, err = validateAssetDestinationFolder(session, destinationFolder)
	if err != nil {
		return nil, err
	}
	results := make([]AssetMoveResult, 0, len(ids))
	seen := make(map[AssetID]struct{}, len(ids))
	for _, id := range ids {
		if _, duplicate := seen[id]; duplicate {
			continue
		}
		seen[id] = struct{}{}
		result := AssetMoveResult{AssetID: id, Status: "failed"}
		sourceRelative, _, availability, pathErr := session.store.assetPath(session.ctx, id)
		if pathErr != nil {
			result.Error = pathErr.Error()
			results = append(results, result)
			continue
		}
		result.Source = sourceRelative
		if availability != "active" {
			result.Error = newError(ErrInvalidPath, "\u53ea\u6709\u6b63\u5e38\u72b6\u6001\u7684\u7167\u7247\u53ef\u4ee5\u79fb\u52a8", map[string]any{"assetId": id, "availability": availability}).Error()
			results = append(results, result)
			continue
		}
		destinationRelative, _, destinationErr := destinationAssetRelative(destinationFolder, filepath.Base(filepath.FromSlash(sourceRelative)))
		if destinationErr != nil {
			result.Error = destinationErr.Error()
			results = append(results, result)
			continue
		}
		moved, moveErr := m.moveOneAsset(session, id, sourceRelative, destinationRelative)
		if moveErr != nil {
			result.Destination = destinationRelative
			result.Error = moveErr.Error()
			results = append(results, result)
			continue
		}
		results = append(results, moved)
	}
	if len(results) > 0 {
		m.emitEvent("assets_moved")
	}
	return results, nil
}

func (m *Manager) moveOneAsset(session *librarySession, id AssetID, sourceRelative, destinationRelative string) (AssetMoveResult, error) {
	result := AssetMoveResult{AssetID: id, Source: sourceRelative, Destination: destinationRelative, Status: "failed"}
	sourceNormalized, sourceKey, err := normalizeRelative(sourceRelative)
	if err != nil {
		return result, err
	}
	destinationNormalized, destinationKey, err := normalizeRelative(destinationRelative)
	if err != nil {
		return result, err
	}
	if sourceNormalized == destinationNormalized {
		result.Status = "unchanged"
		return result, nil
	}

	source, err := resolveWithinRoot(session.root, string(sourceNormalized))
	if err != nil {
		return result, err
	}
	destination, err := resolveWithinRoot(session.root, string(destinationNormalized))
	if err != nil {
		return result, err
	}
	if err := validateWindowsPathLength(destination); err != nil {
		return result, err
	}
	info, err := os.Stat(source)
	if errors.Is(err, os.ErrNotExist) {
		return result, newError(ErrInvalidPath, "\u539f\u6587\u4ef6\u4e0d\u5b58\u5728", map[string]any{"path": sourceNormalized})
	}
	if err != nil {
		return result, err
	}
	if info.IsDir() {
		return result, newError(ErrInvalidPath, "\u539f\u8def\u5f84\u4e0d\u662f\u6587\u4ef6", map[string]any{"path": sourceNormalized})
	}
	caseOnlyRename := runtime.GOOS == "windows" && sourceKey == destinationKey
	if _, err := os.Lstat(destination); err == nil && !caseOnlyRename {
		return result, newError(ErrPathConflict, "\u76ee\u6807\u6587\u4ef6\u5df2\u5b58\u5728\uff0c\u4e0d\u4f1a\u8986\u76d6", map[string]any{"path": destinationNormalized})
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return result, err
	}
	if err := session.store.validateAssetMove(session.ctx, id, sourceKey, destinationKey); err != nil {
		return result, err
	}

	operation := newAssetMoveOperation(id, string(sourceNormalized), string(destinationNormalized))
	operationPath, err := writeAssetMoveOperation(session.root, operation)
	if err != nil {
		return result, err
	}
	removeOperation := false
	defer func() {
		if removeOperation {
			_ = os.Remove(operationPath)
		}
	}()

	session.ignoreWatcherPath(source, 15*time.Second)
	session.ignoreWatcherPath(destination, 15*time.Second)
	if err := moveActiveFile(source, destination, caseOnlyRename); err != nil {
		removeOperation = true
		return result, err
	}
	operation.Stage = assetMoveStageDiskMoved
	if err := writeAssetMoveOperationAt(operationPath, operation); err != nil {
		if rollbackErr := moveActiveFile(destination, source, caseOnlyRename); rollbackErr != nil {
			m.markRepairRequired(session, "asset move intent update failed and disk rollback failed")
			return result, newError(ErrInvalidLibrary, "\u6570\u636e\u5e93\u63d0\u4ea4\u5931\u8d25\uff0c\u78c1\u76d8\u56de\u6eda\u4e5f\u5931\u8d25", map[string]any{"cause": err.Error(), "rollback": rollbackErr.Error()})
		}
		removeOperation = true
		return result, err
	}
	if err := session.store.finishMoveActiveAsset(session.ctx, id, string(sourceNormalized), string(destinationNormalized)); err != nil {
		if rollbackErr := moveActiveFile(destination, source, caseOnlyRename); rollbackErr != nil {
			m.markRepairRequired(session, "asset moved on disk but index update and rollback failed")
			return result, newError(ErrInvalidLibrary, "\u6570\u636e\u5e93\u63d0\u4ea4\u5931\u8d25\uff0c\u78c1\u76d8\u56de\u6eda\u5931\u8d25", map[string]any{"cause": err.Error(), "rollback": rollbackErr.Error()})
		}
		removeOperation = true
		return result, err
	}
	operation.Stage = assetMoveStageDatabaseCommitted
	_ = writeAssetMoveOperationAt(operationPath, operation)
	removeOperation = true
	result.Status = "moved"
	return result, nil
}

func (m *Manager) recoverPendingFileOperations(session *librarySession) error {
	if err := m.recoverFolderMoveOperations(session); err != nil {
		return err
	}
	return m.recoverAssetMoveOperations(session)
}

func (m *Manager) recoverAssetMoveOperations(session *librarySession) error {
	directory := internalPath(session.root, "operations")
	entries, err := os.ReadDir(directory)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".asset-move.json") {
			continue
		}
		path := filepath.Join(directory, entry.Name())
		operation, err := readAssetMoveOperation(path)
		if err != nil {
			return newError(ErrInvalidLibrary, "\u65e0\u6cd5\u8bfb\u53d6\u6587\u4ef6\u64cd\u4f5c\u8bb0\u5f55", map[string]any{"path": path, "cause": err.Error()})
		}
		source, err := resolveWithinRoot(session.root, operation.SourceRelative)
		if err != nil {
			return err
		}
		destination, err := resolveWithinRoot(session.root, operation.DestinationRelative)
		if err != nil {
			return err
		}
		sourceExists, err := filePathExists(source)
		if err != nil {
			return err
		}
		destinationExists, err := filePathExists(destination)
		if err != nil {
			return err
		}
		relative, _, availability, assetErr := session.store.assetPath(session.ctx, operation.AssetID)
		atSource := assetErr == nil && availability == "active" && relative == operation.SourceRelative
		atDestination := assetErr == nil && availability == "active" && relative == operation.DestinationRelative

		switch operation.Stage {
		case assetMoveStagePrepared:
			if sourceExists && !destinationExists && atSource {
				_ = os.Remove(path)
				continue
			}
			if !sourceExists && destinationExists && atSource {
				if err := moveActiveFile(destination, source, false); err == nil {
					_ = os.Remove(path)
					continue
				}
			}
		case assetMoveStageDiskMoved:
			if !sourceExists && destinationExists && atDestination {
				_ = os.Remove(path)
				continue
			}
			if !sourceExists && destinationExists && atSource {
				if err := moveActiveFile(destination, source, false); err == nil {
					_ = os.Remove(path)
					continue
				}
			}
		case assetMoveStageDatabaseCommitted:
			if !sourceExists && destinationExists && atDestination {
				_ = os.Remove(path)
				continue
			}
		}
		return newError(ErrInvalidLibrary, "\u6587\u4ef6\u64cd\u4f5c\u8bb0\u5f55\u5904\u4e8e\u672a\u77e5\u72b6\u6001", map[string]any{"operationId": operation.ID, "stage": operation.Stage})
	}
	return nil
}
