package local_library

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
	"unicode/utf16"
)

// FolderProperties describes the on-disk contents of a library folder.
type FolderProperties struct {
	RelativePath string    `json:"relativePath"`
	Name         string    `json:"name"`
	PhotoCount   int64     `json:"photoCount"`
	ChildCount   int64     `json:"childCount"`
	ByteSize     int64     `json:"byteSize"`
	ModifiedAt   time.Time `json:"modifiedAt"`
	IsRoot       bool      `json:"isRoot"`
}

func validateFolderName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", newError(ErrInvalidPath, "文件夹名称不能为空", nil)
	}
	if name == "." || name == ".." || strings.ContainsAny(name, `<>:"/\\|?*`) || strings.ContainsRune(name, 0) {
		return "", newError(ErrInvalidPath, "文件夹名称包含 Windows 不允许的字符", map[string]any{"name": name})
	}
	if strings.EqualFold(name, internalDirName) {
		return "", newError(ErrInvalidPath, "不能创建资源库内部目录", nil)
	}
	if _, _, err := normalizeRelative(name); err != nil {
		return "", err
	}
	return name, nil
}

func (m *Manager) CreateFolder(parentRelative, name string) (FolderDTO, error) {
	session, err := m.requireAvailableSession()
	if err != nil {
		return FolderDTO{}, err
	}
	parent, _, err := normalizeRelative(parentRelative)
	if err != nil {
		return FolderDTO{}, err
	}
	name, err = validateFolderName(name)
	if err != nil {
		return FolderDTO{}, err
	}
	relative := name
	if parent != "" {
		relative = string(parent) + "/" + name
	}
	normalized, key, err := normalizeRelative(relative)
	if err != nil {
		return FolderDTO{}, err
	}
	target, err := resolveWithinRoot(session.root, string(normalized))
	if err != nil {
		return FolderDTO{}, err
	}
	if err := validateWindowsPathLength(target); err != nil {
		return FolderDTO{}, err
	}
	if _, statErr := os.Stat(target); statErr == nil {
		return FolderDTO{}, newError(ErrPathConflict, "目标文件夹已经存在", map[string]any{"path": normalized})
	} else if !errors.Is(statErr, os.ErrNotExist) {
		return FolderDTO{}, statErr
	}

	session.ignoreWatcherPath(target, 5*time.Second)
	if err := os.Mkdir(target, 0o755); err != nil {
		return FolderDTO{}, err
	}
	if session.watcher != nil {
		// The parent-directory create event is intentionally ignored because the
		// application updates the index itself. Add the new directory explicitly
		// so later Explorer changes inside it are still observed.
		_ = session.watcher.Add(target)
	}
	if _, err := session.store.ensureFolder(session.ctx, string(normalized)); err != nil {
		_ = os.Remove(target)
		return FolderDTO{}, err
	}
	folder, err := session.store.folderByPathKey(session.ctx, key)
	if err != nil {
		_ = os.Remove(target)
		_ = session.store.deleteEmptyFolder(session.ctx, key)
		return FolderDTO{}, err
	}
	m.emitEvent("folder_created")
	return folder, nil
}

func validateWindowsPathLength(absolute string) error {
	if runtime.GOOS != "windows" {
		return nil
	}
	if len(utf16.Encode([]rune(absolute))) > 32767 {
		return newError(ErrInvalidPath, "\u76ee\u6807\u8def\u5f84\u8d85\u8fc7 Windows \u957f\u8def\u5f84\u9650\u5236", map[string]any{"path": absolute})
	}
	for _, segment := range strings.Split(filepath.Clean(absolute), string(os.PathSeparator)) {
		if len(utf16.Encode([]rune(segment))) > 255 {
			return newError(ErrInvalidPath, "\u6587\u4ef6\u5939\u540d\u79f0\u8d85\u8fc7 Windows \u6587\u4ef6\u7cfb\u7edf\u9650\u5236", map[string]any{"segment": segment})
		}
	}
	return nil
}

func preflightFolderMove(source, destination string) error {
	return filepath.WalkDir(source, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := destination
		if relative != "." {
			target = filepath.Join(destination, relative)
		}
		return validateWindowsPathLength(target)
	})
}

func moveActiveDirectory(source, destination string) error {
	if filepath.Clean(source) == filepath.Clean(destination) {
		return nil
	}
	if runtime.GOOS == "windows" && strings.EqualFold(filepath.Clean(source), filepath.Clean(destination)) {
		temporary := source + ".mo-gallery-move-" + newID()
		if err := os.Rename(source, temporary); err != nil {
			return err
		}
		if err := os.Rename(temporary, destination); err != nil {
			_ = os.Rename(temporary, source)
			return err
		}
		return nil
	}
	return moveDirectorySafely(source, destination)
}

func (m *Manager) MoveFolder(relative, destinationParent, topLevelName string) (FolderDTO, error) {
	m.folderMutationMu.Lock()
	defer m.folderMutationMu.Unlock()
	m.assetFileMutationMu.Lock()
	defer m.assetFileMutationMu.Unlock()

	session, err := m.requireAvailableSession()
	if err != nil {
		return FolderDTO{}, err
	}
	sourceRelative, sourceKey, err := normalizeRelative(relative)
	if err != nil {
		return FolderDTO{}, err
	}
	if sourceRelative == "" {
		return FolderDTO{}, newError(ErrInvalidPath, "\u4e0d\u80fd\u79fb\u52a8\u8d44\u6e90\u5e93\u6839\u76ee\u5f55", nil)
	}
	folder, err := session.store.folderByPathKey(session.ctx, sourceKey)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return FolderDTO{}, newError(ErrInvalidPath, "\u6587\u4ef6\u5939\u5c1a\u672a\u8fdb\u5165\u8d44\u6e90\u5e93\u7d22\u5f15", map[string]any{"path": sourceRelative})
		}
		return FolderDTO{}, err
	}
	parent, parentKey, err := normalizeRelative(destinationParent)
	if err != nil {
		return FolderDTO{}, err
	}
	if parentKey == sourceKey || strings.HasPrefix(parentKey, sourceKey+"/") {
		return FolderDTO{}, newError(ErrInvalidPath, "\u4e0d\u80fd\u5c06\u6587\u4ef6\u5939\u79fb\u5165\u81ea\u8eab\u6216\u5176\u5b50\u6587\u4ef6\u5939", map[string]any{"path": parent})
	}
	topLevelName, err = validateFolderName(topLevelName)
	if err != nil {
		return FolderDTO{}, err
	}
	newRoot := topLevelName
	if parent != "" {
		newRoot = string(parent) + "/" + topLevelName
	}
	destinationRelative, destinationKey, err := normalizeRelative(newRoot)
	if err != nil {
		return FolderDTO{}, err
	}
	if string(sourceRelative) == string(destinationRelative) {
		return folder, nil
	}

	parentPath, err := resolveWithinRoot(session.root, string(parent))
	if err != nil {
		return FolderDTO{}, err
	}
	parentInfo, err := os.Stat(parentPath)
	if errors.Is(err, os.ErrNotExist) {
		return FolderDTO{}, newError(ErrInvalidPath, "\u76ee\u6807\u4f4d\u7f6e\u4e0d\u5b58\u5728", map[string]any{"parent": parent})
	}
	if err != nil {
		return FolderDTO{}, err
	}
	if !parentInfo.IsDir() {
		return FolderDTO{}, newError(ErrInvalidPath, "\u76ee\u6807\u4f4d\u7f6e\u4e0d\u662f\u6587\u4ef6\u5939", map[string]any{"parent": parent})
	}
	var parentID *string
	if parent != "" {
		parentFolder, err := session.store.folderByPathKey(session.ctx, parentKey)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return FolderDTO{}, newError(ErrInvalidPath, "\u76ee\u6807\u4f4d\u7f6e\u5c1a\u672a\u8fdb\u5165\u8d44\u6e90\u5e93\u7d22\u5f15", map[string]any{"parent": parent})
			}
			return FolderDTO{}, err
		}
		parentID = &parentFolder.ID
	}

	source, err := resolveWithinRoot(session.root, string(sourceRelative))
	if err != nil {
		return FolderDTO{}, err
	}
	sourceInfo, err := os.Stat(source)
	if errors.Is(err, os.ErrNotExist) {
		return FolderDTO{}, newError(ErrInvalidPath, "\u6587\u4ef6\u5939\u5df2\u7ecf\u4e0d\u5b58\u5728", map[string]any{"path": sourceRelative})
	}
	if err != nil {
		return FolderDTO{}, err
	}
	if !sourceInfo.IsDir() {
		return FolderDTO{}, newError(ErrInvalidPath, "\u6e90\u8def\u5f84\u4e0d\u662f\u6587\u4ef6\u5939", map[string]any{"path": sourceRelative})
	}
	destination, err := resolveWithinRoot(session.root, string(destinationRelative))
	if err != nil {
		return FolderDTO{}, err
	}
	caseOnlyRename := runtime.GOOS == "windows" && sourceKey == destinationKey
	if _, err := os.Lstat(destination); err == nil && !caseOnlyRename {
		return FolderDTO{}, newError(ErrPathConflict, "\u76ee\u6807\u4f4d\u7f6e\u5df2\u5b58\u5728\u540c\u540d\u6587\u4ef6\u5939\uff0c\u8d44\u6e90\u5e93\u4e0d\u4f1a\u8986\u76d6", map[string]any{"path": destinationRelative})
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return FolderDTO{}, err
	}
	if err := preflightFolderMove(source, destination); err != nil {
		return FolderDTO{}, err
	}

	operation := newFolderMoveOperation(folder.ID, string(sourceRelative), string(destinationRelative), string(parent), topLevelName)
	operationPath, err := writeFolderMoveOperation(session.root, operation)
	if err != nil {
		return FolderDTO{}, err
	}
	removeOperation := false
	defer func() {
		if removeOperation {
			_ = os.Remove(operationPath)
		}
	}()

	session.ignoreWatcherPath(source, 15*time.Second)
	session.ignoreWatcherPath(destination, 15*time.Second)
	session.removeWatcherTree(source)
	move := func() error {
		if caseOnlyRename {
			temporary := source + ".mo-gallery-move-" + newID()
			if err := os.Rename(source, temporary); err != nil {
				return err
			}
			if err := os.Rename(temporary, destination); err != nil {
				_ = os.Rename(temporary, source)
				return err
			}
			return nil
		}
		return moveActiveDirectory(source, destination)
	}
	if err := move(); err != nil {
		removeOperation = true
		_ = m.startSessionWatcher(session)
		return FolderDTO{}, err
	}
	operation.Stage = folderMoveStageDiskMoved
	if err := writeFolderMoveOperationAt(operationPath, operation); err != nil {
		if rollbackErr := moveActiveDirectory(destination, source); rollbackErr != nil {
			m.markRepairRequired(session, "folder move intent update failed and disk rollback failed")
			return FolderDTO{}, newError(ErrInvalidLibrary, "\u6587\u4ef6\u5939\u5df2\u79fb\u52a8\uff0c\u4f46\u64cd\u4f5c\u8bb0\u5f55\u66f4\u65b0\u5931\u8d25\u4e14\u65e0\u6cd5\u81ea\u52a8\u64a4\u9500", map[string]any{"cause": err.Error(), "rollback": rollbackErr.Error()})
		}
		removeOperation = true
		_ = m.startSessionWatcher(session)
		return FolderDTO{}, err
	}
	updated, err := session.store.finishMoveActiveFolder(session.ctx, folder.ID, string(sourceRelative), string(destinationRelative), parentID)
	if err != nil {
		if rollbackErr := moveActiveDirectory(destination, source); rollbackErr != nil {
			m.markRepairRequired(session, "folder moved on disk but index update and rollback failed")
			return FolderDTO{}, newError(ErrInvalidLibrary, "\u6587\u4ef6\u5939\u5df2\u79fb\u52a8\uff0c\u4f46\u7d22\u5f15\u63d0\u4ea4\u5931\u8d25\u4e14\u65e0\u6cd5\u81ea\u52a8\u64a4\u9500", map[string]any{"cause": err.Error(), "rollback": rollbackErr.Error()})
		}
		removeOperation = true
		_ = m.startSessionWatcher(session)
		return FolderDTO{}, err
	}
	operation.Stage = folderMoveStageDatabaseCommitted
	_ = writeFolderMoveOperationAt(operationPath, operation)
	removeOperation = true
	_ = m.startSessionWatcher(session)
	m.emitEvent("folder_moved")
	return updated, nil
}

func (m *Manager) GetFolderProperties(relative string) (FolderProperties, error) {
	session, err := m.requireAvailableSession()
	if err != nil {
		return FolderProperties{}, err
	}
	normalized, _, err := normalizeRelative(relative)
	if err != nil {
		return FolderProperties{}, err
	}
	target, err := resolveWithinRoot(session.root, string(normalized))
	if err != nil {
		return FolderProperties{}, err
	}
	info, err := os.Stat(target)
	if err != nil {
		return FolderProperties{}, err
	}
	if !info.IsDir() {
		return FolderProperties{}, newError(ErrInvalidPath, "目标不是文件夹", nil)
	}
	result := FolderProperties{
		RelativePath: string(normalized),
		Name:         info.Name(),
		ModifiedAt:   info.ModTime(),
		IsRoot:       normalized == "",
	}
	if result.IsRoot {
		result.Name = session.manifest.Name
	}

	err = filepath.WalkDir(target, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == target {
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.IsDir() {
			if strings.EqualFold(entry.Name(), internalDirName) {
				return filepath.SkipDir
			}
			result.ChildCount++
			return nil
		}
		fileInfo, infoErr := entry.Info()
		if infoErr != nil {
			return infoErr
		}
		result.ByteSize += fileInfo.Size()
		if isSupportedMedia(path) {
			result.PhotoCount++
		}
		return nil
	})
	if err != nil {
		return FolderProperties{}, err
	}
	return result, nil
}

func (m *Manager) PreviewFolderDeletion(relative string) (FolderDeletionPreview, error) {
	session, err := m.requireAvailableSession()
	if err != nil {
		return FolderDeletionPreview{}, err
	}
	normalized, key, err := normalizeRelative(relative)
	if err != nil {
		return FolderDeletionPreview{}, err
	}
	if normalized == "" {
		return FolderDeletionPreview{}, newError(ErrInvalidPath, "不能删除资源库根目录", nil)
	}
	target, err := resolveWithinRoot(session.root, string(normalized))
	if err != nil {
		return FolderDeletionPreview{}, err
	}
	info, err := os.Stat(target)
	if errors.Is(err, os.ErrNotExist) {
		return FolderDeletionPreview{}, newError(ErrInvalidPath, "文件夹已经不存在", map[string]any{"path": normalized})
	}
	if err != nil {
		return FolderDeletionPreview{}, err
	}
	if !info.IsDir() {
		return FolderDeletionPreview{}, newError(ErrInvalidPath, "目标不是文件夹", nil)
	}
	if _, err := session.store.folderByPathKey(session.ctx, key); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return FolderDeletionPreview{}, newError(ErrInvalidPath, "文件夹已经不存在", nil)
		}
		return FolderDeletionPreview{}, err
	}
	managedPaths, err := session.store.activeAssetPathsBelow(session.ctx, key)
	if err != nil {
		return FolderDeletionPreview{}, err
	}
	preview := FolderDeletionPreview{RelativePath: string(normalized), Name: info.Name()}
	err = filepath.WalkDir(target, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			preview.DirectoryCount++
			return nil
		}
		fileInfo, err := entry.Info()
		if err != nil {
			return err
		}
		preview.TotalBytes += fileInfo.Size()
		relativePath, err := filepath.Rel(session.root, path)
		if err != nil {
			return err
		}
		_, pathKey, err := normalizeRelative(filepath.ToSlash(relativePath))
		if err != nil {
			return err
		}
		if _, managed := managedPaths[pathKey]; managed {
			preview.ManagedAssetCount++
		} else {
			preview.OtherFileCount++
		}
		return nil
	})
	if err != nil {
		return FolderDeletionPreview{}, err
	}
	return preview, nil
}

func (m *Manager) trashFolder(relative string) (string, error) {
	m.folderMutationMu.Lock()
	defer m.folderMutationMu.Unlock()
	m.assetFileMutationMu.Lock()
	defer m.assetFileMutationMu.Unlock()

	session, err := m.requireAvailableSession()
	if err != nil {
		return "", err
	}
	preview, err := m.PreviewFolderDeletion(relative)
	if err != nil {
		return "", err
	}
	normalized, key, err := normalizeRelative(preview.RelativePath)
	if err != nil {
		return "", err
	}
	folder, err := session.store.folderByPathKey(session.ctx, key)
	if err != nil {
		return "", err
	}
	source, err := resolveWithinRoot(session.root, string(normalized))
	if err != nil {
		return "", err
	}
	trashID := newID()
	payloadRelative := filepath.ToSlash(filepath.Join("trash", trashID, "payload", filepath.Base(source)))
	destination, _, err := resolveTrashPayload(session.root, trashID, payloadRelative)
	if err != nil {
		return "", err
	}
	session.ignoreWatcherPath(source, 10*time.Second)
	session.removeWatcherTree(source)
	if err := moveDirectorySafely(source, destination); err != nil {
		_ = m.startSessionWatcher(session)
		return "", err
	}
	if err := session.store.trashFolder(session.ctx, folder.ID, key, trashID, string(normalized), payloadRelative, preview); err != nil {
		if rollbackErr := moveDirectorySafely(destination, source); rollbackErr != nil {
			_ = m.startSessionWatcher(session)
			return "", newError(ErrInvalidLibrary, "文件夹已移动，但索引提交失败且无法自动撤销", map[string]any{"cause": err.Error(), "rollback": rollbackErr.Error(), "trashId": trashID})
		}
		_ = m.startSessionWatcher(session)
		return "", err
	}
	_ = m.startSessionWatcher(session)
	m.emitEvent("folder_trashed")
	return trashID, nil
}

func (m *Manager) DeleteFolder(relative string) error {
	_, err := m.trashFolder(relative)
	return err
}

func (m *Manager) PermanentDeleteActiveFolder(relative string) error {
	trashID, err := m.trashFolder(relative)
	if err != nil {
		return err
	}
	if err := m.PermanentDeleteFolder(trashID); err != nil {
		return newError(ErrInvalidLibrary, "文件夹已进入资源库回收站，但永久删除失败", map[string]any{"cause": err.Error(), "trashId": trashID})
	}
	return nil
}

func moveDirectorySafely(source, destination string) error {
	info, err := os.Stat(source)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return newError(ErrInvalidPath, "目标不是文件夹", map[string]any{"path": source})
	}
	if _, err := os.Lstat(destination); err == nil {
		return newError(ErrPathConflict, "目标位置已存在同名文件夹，资源库不会覆盖", map[string]any{"path": destination})
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
		return err
	}
	if err := os.Rename(source, destination); err != nil {
		return err
	}
	return nil
}

func (m *Manager) ListTrashedFolders() ([]FolderTrashEntry, error) {
	session, err := m.requireAvailableSession()
	if err != nil {
		return nil, err
	}
	return session.store.listFolderTrash(session.ctx)
}

func (m *Manager) RestoreFolder(trashID, destinationParent, topLevelName string) error {
	m.folderMutationMu.Lock()
	defer m.folderMutationMu.Unlock()
	m.assetFileMutationMu.Lock()
	defer m.assetFileMutationMu.Unlock()
	return m.restoreFolderUnlocked(trashID, destinationParent, topLevelName)
}

func (m *Manager) restoreFolderUnlocked(trashID, destinationParent, topLevelName string) error {
	session, err := m.requireAvailableSession()
	if err != nil {
		return err
	}
	record, err := session.store.folderTrashRecord(session.ctx, trashID)
	if err != nil {
		return err
	}
	original, _, err := normalizeRelative(record.OriginalPath)
	if err != nil {
		return err
	}
	if destinationParent == "" && topLevelName == "" {
		destinationParent = filepath.ToSlash(filepath.Dir(string(original)))
		if destinationParent == "." {
			destinationParent = ""
		}
		topLevelName = filepath.Base(filepath.FromSlash(string(original)))
	}
	parent, parentKey, err := normalizeRelative(destinationParent)
	if err != nil {
		return err
	}
	topLevelName, err = validateFolderName(topLevelName)
	if err != nil {
		return err
	}
	newRoot := topLevelName
	if parent != "" {
		newRoot = string(parent) + "/" + topLevelName
	}
	newRootNormalized, _, err := normalizeRelative(newRoot)
	if err != nil {
		return err
	}
	parentPath, err := resolveWithinRoot(session.root, string(parent))
	if err != nil {
		return err
	}
	parentInfo, err := os.Stat(parentPath)
	if errors.Is(err, os.ErrNotExist) {
		return newError(ErrInvalidPath, "恢复位置不存在，请选择资源库内的其他文件夹", map[string]any{"parent": parent})
	}
	if err != nil {
		return err
	}
	if !parentInfo.IsDir() {
		return newError(ErrInvalidPath, "恢复位置不是文件夹", nil)
	}
	var parentID *string
	if parent != "" {
		parentFolder, err := session.store.folderByPathKey(session.ctx, parentKey)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return newError(ErrInvalidPath, "恢复位置尚未进入资源库索引", map[string]any{"parent": parent})
			}
			return err
		}
		parentID = &parentFolder.ID
	}
	source, trashEntryDir, err := resolveTrashPayload(session.root, record.ID, record.PayloadRelativePath)
	if err != nil {
		return err
	}
	destination, err := resolveWithinRoot(session.root, string(newRootNormalized))
	if err != nil {
		return err
	}
	if _, err := os.Lstat(destination); err == nil {
		return newError(ErrPathConflict, "恢复位置已存在同名文件夹，资源库不会覆盖", map[string]any{"path": newRootNormalized})
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	session.ignoreWatcherPath(destination, 10*time.Second)
	if err := moveDirectorySafely(source, destination); err != nil {
		return err
	}
	if err := session.store.finishRestoreFolder(session.ctx, record, string(newRootNormalized), parentID); err != nil {
		if rollbackErr := moveDirectorySafely(destination, source); rollbackErr != nil {
			return newError(ErrInvalidLibrary, "文件夹已恢复到磁盘，但索引提交失败且无法自动撤销", map[string]any{"cause": err.Error(), "rollback": rollbackErr.Error(), "trashId": trashID})
		}
		return err
	}
	_ = os.RemoveAll(trashEntryDir)
	m.emitEvent("folder_restored")
	return nil
}

func (m *Manager) PermanentDeleteFolder(trashID string) error {
	m.folderMutationMu.Lock()
	defer m.folderMutationMu.Unlock()
	m.assetFileMutationMu.Lock()
	defer m.assetFileMutationMu.Unlock()
	return m.permanentDeleteFolderUnlocked(trashID)
}

func (m *Manager) permanentDeleteFolderUnlocked(trashID string) error {
	session, err := m.requireAvailableSession()
	if err != nil {
		return err
	}
	record, err := session.store.folderTrashRecord(session.ctx, trashID)
	if err != nil {
		return err
	}
	assetIDs, err := session.store.assetIDsForTrashEntry(session.ctx, trashID)
	if err != nil {
		return err
	}
	payload, trashEntryDir, err := resolveTrashPayload(session.root, record.ID, record.PayloadRelativePath)
	if err != nil {
		return err
	}
	if err := os.RemoveAll(payload); err != nil {
		return err
	}
	if err := session.store.finishPermanentDeleteFolder(session.ctx, record); err != nil {
		return newError(ErrInvalidLibrary, "文件夹内容已永久删除，但索引清理失败，需要修复资源库", map[string]any{"cause": err.Error(), "trashId": trashID})
	}
	for _, id := range assetIDs {
		removeAssetDerivativeFiles(session.root, id)
	}
	_ = os.RemoveAll(trashEntryDir)
	m.emitEvent("folder_permanently_deleted")
	return nil
}
