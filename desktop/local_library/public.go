package local_library

import (
	"os"
)

func (m *Manager) originalPathUnlocked(id AssetID) (string, error) {
	session, err := m.requireAvailableSession()
	if err != nil {
		return "", err
	}
	if !isOpaqueID(string(id)) {
		return "", newError(ErrAssetNotFound, "资产标识无效", nil)
	}
	relative, _, status, err := session.store.assetPath(session.ctx, id)
	if err != nil {
		return "", err
	}
	if status != "active" {
		return "", newError(ErrAssetNotFound, "资产当前不可用", map[string]any{"availability": status})
	}
	path, err := resolveWithinRoot(session.root, relative)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", newError(ErrAssetNotFound, "资产原文件不存在，请先重新检查资源库", map[string]any{"path": relative})
		}
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", newError(ErrAssetNotFound, "资产原路径不是普通文件", map[string]any{"path": relative})
	}
	return path, nil
}

func (m *Manager) originalPathsUnlocked(ids []AssetID) ([]string, error) {
	paths := make([]string, 0, len(ids))
	for _, id := range ids {
		path, err := m.originalPathUnlocked(id)
		if err != nil {
			return nil, err
		}
		paths = append(paths, path)
	}
	return paths, nil
}

func (m *Manager) OriginalPath(id AssetID) (string, error) {
	m.assetFileMutationMu.RLock()
	defer m.assetFileMutationMu.RUnlock()
	return m.originalPathUnlocked(id)
}

// WithOriginalPaths prevents application-managed move, rename, trash and restore
// commands while the caller reads the selected active files. Multiple readers may
// proceed concurrently. External filesystem changes still surface as read/stat errors.
func (m *Manager) WithOriginalPaths(ids []AssetID, use func([]string) error) error {
	m.assetFileMutationMu.RLock()
	defer m.assetFileMutationMu.RUnlock()
	paths, err := m.originalPathsUnlocked(ids)
	if err != nil {
		return err
	}
	return use(paths)
}
