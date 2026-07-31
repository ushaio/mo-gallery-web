package local_library

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	folderMoveOperationKind          = "folder_move"
	folderMoveStagePrepared          = "prepared"
	folderMoveStageDiskMoved         = "disk_moved"
	folderMoveStageDatabaseCommitted = "database_committed"
)

type folderMoveOperation struct {
	ID                  string    `json:"id"`
	Kind                string    `json:"kind"`
	Stage               string    `json:"stage"`
	FolderID            string    `json:"folderId"`
	SourceRelative      string    `json:"sourceRelative"`
	DestinationRelative string    `json:"destinationRelative"`
	DestinationParent   string    `json:"destinationParent"`
	TopLevelName        string    `json:"topLevelName"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`
}

func newFolderMoveOperation(folderID, sourceRelative, destinationRelative, destinationParent, topLevelName string) folderMoveOperation {
	now := time.Now().UTC()
	return folderMoveOperation{
		ID: newID(), Kind: folderMoveOperationKind, Stage: folderMoveStagePrepared,
		FolderID: folderID, SourceRelative: sourceRelative, DestinationRelative: destinationRelative,
		DestinationParent: destinationParent, TopLevelName: topLevelName, CreatedAt: now, UpdatedAt: now,
	}
}

func folderMoveOperationPath(root, id string) string {
	return internalPath(root, "operations", id+".folder-move.json")
}

func writeFolderMoveOperation(root string, operation folderMoveOperation) (string, error) {
	path := folderMoveOperationPath(root, operation.ID)
	return path, writeFolderMoveOperationAt(path, operation)
}

func writeFolderMoveOperationAt(path string, operation folderMoveOperation) error {
	operation.UpdatedAt = time.Now().UTC()
	return writeJSONAtomic(path, operation)
}

func readFolderMoveOperation(path string) (folderMoveOperation, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return folderMoveOperation{}, err
	}
	var operation folderMoveOperation
	if err := json.Unmarshal(data, &operation); err != nil {
		return folderMoveOperation{}, err
	}
	if operation.Kind != folderMoveOperationKind || !isOpaqueID(operation.ID) || operation.FolderID == "" {
		return folderMoveOperation{}, fmt.Errorf("invalid folder move operation")
	}
	return operation, nil
}

func folderPathExists(path string) (bool, error) {
	info, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return info.IsDir(), nil
}

func (m *Manager) recoverFolderMoveOperations(session *librarySession) error {
	directory := internalPath(session.root, "operations")
	entries, err := os.ReadDir(directory)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".folder-move.json") {
			continue
		}
		path := filepath.Join(directory, entry.Name())
		operation, err := readFolderMoveOperation(path)
		if err != nil {
			return newError(ErrInvalidLibrary, "\u8d44\u6e90\u5e93\u64cd\u4f5c\u8bb0\u5f55\u5df2\u635f\u574f", map[string]any{"path": path, "cause": err.Error()})
		}
		source, err := resolveWithinRoot(session.root, operation.SourceRelative)
		if err != nil {
			return err
		}
		destination, err := resolveWithinRoot(session.root, operation.DestinationRelative)
		if err != nil {
			return err
		}
		sourceExists, err := folderPathExists(source)
		if err != nil {
			return err
		}
		destinationExists, err := folderPathExists(destination)
		if err != nil {
			return err
		}
		_, sourceKey, _ := normalizeRelative(operation.SourceRelative)
		_, destinationKey, _ := normalizeRelative(operation.DestinationRelative)
		sourceFolder, sourceErr := session.store.folderByPathKey(session.ctx, sourceKey)
		destinationFolder, destinationErr := session.store.folderByPathKey(session.ctx, destinationKey)

		switch operation.Stage {
		case folderMoveStagePrepared:
			if sourceExists && !destinationExists && sourceErr == nil && sourceFolder.ID == operation.FolderID {
				_ = os.Remove(path)
				continue
			}
			if !sourceExists && destinationExists && sourceErr == nil && sourceFolder.ID == operation.FolderID {
				if err := moveActiveDirectory(destination, source); err == nil {
					_ = os.Remove(path)
					continue
				}
			}
		case folderMoveStageDiskMoved:
			if !sourceExists && destinationExists && destinationErr == nil && destinationFolder.ID == operation.FolderID {
				_ = os.Remove(path)
				continue
			}
			if !sourceExists && destinationExists && sourceErr == nil && sourceFolder.ID == operation.FolderID {
				if err := moveActiveDirectory(destination, source); err == nil {
					_ = os.Remove(path)
					continue
				}
			}
		case folderMoveStageDatabaseCommitted:
			if !sourceExists && destinationExists && destinationErr == nil && destinationFolder.ID == operation.FolderID {
				_ = os.Remove(path)
				continue
			}
		}
		return newError(ErrInvalidLibrary, "\u672a\u5b8c\u6210\u7684\u6587\u4ef6\u5939\u64cd\u4f5c\u65e0\u6cd5\u81ea\u52a8\u6062\u590d", map[string]any{"operationId": operation.ID, "stage": operation.Stage})
	}
	return nil
}

func (m *Manager) markRepairRequired(session *librarySession, reason string) {
	session.mu.Lock()
	session.state = "repair_required"
	session.scan.State = "failed"
	session.scan.Error = reason
	watcher := session.watcher
	session.watcher = nil
	session.mu.Unlock()
	if watcher != nil {
		_ = watcher.Close()
	}
	m.emitEvent("library_repair_required")
}
