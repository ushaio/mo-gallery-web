package local_library

func (m *Manager) OriginalPaths(ids []AssetID) ([]string, error) {
	m.assetFileMutationMu.RLock()
	defer m.assetFileMutationMu.RUnlock()
	return m.originalPathsUnlocked(ids)
}

func (m *Manager) CopyAssetsToClipboard(ids []AssetID, cut bool) error {
	paths, err := m.OriginalPaths(ids)
	if err != nil {
		return err
	}
	return setFileClipboard(paths, cut)
}
