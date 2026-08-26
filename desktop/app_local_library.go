package main

import (
	"context"
	"errors"
	"os/exec"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	local_library "mo-gallery-desktop/local_library"
	"mo-gallery-desktop/services"
)

// ─── Local Library ───────────────────────────────────

func (a *App) GetLocalLibraryEntryState() (map[string]interface{}, error) {
	if a.LocalLibrary == nil {
		return map[string]interface{}{"active": false, "recent": []local_library.RecentLibrary{}}, nil
	}
	recent, err := a.LocalLibrary.RecentLibraries()
	if err != nil {
		return nil, err
	}
	state := map[string]interface{}{"active": false, "recent": recent}
	if snapshot, snapshotErr := a.LocalLibrary.Snapshot(); snapshotErr == nil {
		state["active"] = true
		state["snapshot"] = snapshot
	} else if snapshot, restored, restoreErr := a.LocalLibrary.RestoreLastLibrary(); restoreErr != nil {
		var appErr *local_library.AppError
		if errors.As(restoreErr, &appErr) && appErr.Code == local_library.ErrLibraryUpgradeRequired {
			rootPath, _ := appErr.Details["path"].(string)
			currentVersion, _ := appErr.Details["currentVersion"].(int)
			targetVersion, _ := appErr.Details["targetVersion"].(int)
			state["upgrade"] = local_library.LibraryUpgradeInfo{
				RootPath:       rootPath,
				CurrentVersion: currentVersion,
				TargetVersion:  targetVersion,
				Required:       true,
			}
			return state, nil
		}
		return nil, restoreErr
	} else if restored {
		state["active"] = true
		state["snapshot"] = snapshot
		go a.syncLocalLibraryCloudInBackground()
	}
	return state, nil
}

func (a *App) SelectLocalLibraryFolder(title string) (string, error) {
	if strings.TrimSpace(title) == "" {
		title = "选择资源库文件夹"
	}
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: title})
}

func (a *App) SelectLocalLibraryImportFiles() ([]string, error) {
	files, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择要移入资源库的文件",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "照片资源 (*.jpg;*.jpeg;*.png;*.webp;*.gif;*.avif;*.heic;*.heif;*.tif;*.tiff;*.cr2;*.cr3;*.nef;*.arw;*.dng;*.raf;*.rw2)",
				Pattern:     "*.jpg;*.jpeg;*.png;*.webp;*.gif;*.avif;*.heic;*.heif;*.tif;*.tiff;*.cr2;*.cr3;*.nef;*.arw;*.dng;*.raf;*.rw2",
			},
			{DisplayName: "所有文件 (*.*)", Pattern: "*.*"},
		},
	})
	if files == nil {
		return []string{}, err
	}
	return files, err
}

func (a *App) CreateLocalLibrary(root, name string) (local_library.LibrarySnapshot, error) {
	return a.LocalLibrary.Create(root, name, false)
}

func (a *App) InitializeLocalLibrary(root, name string) (local_library.LibrarySnapshot, error) {
	return a.LocalLibrary.Create(root, name, true)
}

func (a *App) OpenLocalLibrary(root string) (local_library.LibrarySnapshot, error) {
	snapshot, err := a.LocalLibrary.Open(root)
	if err == nil {
		go a.syncLocalLibraryCloudInBackground()
	}
	return snapshot, err
}

func (a *App) syncLocalLibraryCloudInBackground() {
	if a.Photo == nil || a.LocalLibrary == nil || !a.Proxy.IsReady() {
		return
	}
	_, _ = a.SyncLocalLibraryCloud()
}

func (a *App) runLocalLibraryCloudSyncLoop(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.syncLocalLibraryCloudInBackground()
		}
	}
}

// SyncLocalLibraryCloud pulls the protected Photo change feed and applies only
// the cloud projection. Local files and relative_path are deliberately never
// changed by this operation.
func (a *App) SyncLocalLibraryCloud() (local_library.CloudSyncStatus, error) {
	a.cloudSyncMu.Lock()
	defer a.cloudSyncMu.Unlock()
	if a.Photo == nil || !a.Proxy.IsReady() {
		return local_library.CloudSyncStatus{}, errors.New("云端服务尚未就绪")
	}
	status, err := a.LocalLibrary.CloudSyncStatus()
	if err != nil {
		return status, err
	}
	cursor := status.Cursor
	for {
		page, fetchErr := a.Photo.Changes(cursor, 200)
		if fetchErr != nil {
			return status, fetchErr
		}
		changes := make([]local_library.CloudPhotoChange, 0, len(page.Items))
		for _, item := range page.Items {
			changes = append(changes, local_library.CloudPhotoChange{
				ID: item.ID, Path: item.Path, ThumbPath: item.ThumbPath,
				StorageSourceID: item.StorageSourceID, StoragePluginID: item.StoragePluginID,
				StorageURLType: item.StorageURLType, UpdatedAt: item.UpdatedAt, DeletedAt: item.DeletedAt,
			})
		}
		nextCursor := page.NextCursor
		if nextCursor == "" {
			nextCursor = cursor
		}
		if err := a.LocalLibrary.ApplyCloudPhotoChanges(changes, nextCursor, !page.HasMore); err != nil {
			return status, err
		}
		cursor = nextCursor
		if !page.HasMore {
			status.Cursor = cursor
			now := time.Now().UTC()
			status.LastSuccessAt = &now
			return status, nil
		}
	}
}

func (a *App) CheckLocalLibraryUpgrade(root string) (map[string]interface{}, error) {
	info, err := a.LocalLibrary.CheckUpgrade(root)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"rootPath":       info.RootPath,
		"currentVersion": info.CurrentVersion,
		"targetVersion":  info.TargetVersion,
		"required":       info.Required,
	}, nil
}

func (a *App) UpgradeLocalLibrary(root string) (map[string]interface{}, error) {
	info, err := a.LocalLibrary.Upgrade(root)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"rootPath":       info.RootPath,
		"currentVersion": info.CurrentVersion,
		"targetVersion":  info.TargetVersion,
		"required":       info.Required,
	}, nil
}

func (a *App) CloseLocalLibrary() error                   { return a.LocalLibrary.CloseManually() }
func (a *App) RemoveRecentLocalLibrary(root string) error { return a.LocalLibrary.RemoveRecent(root) }
func (a *App) GetLocalLibrarySnapshot() (local_library.LibrarySnapshot, error) {
	return a.LocalLibrary.Snapshot()
}
func (a *App) ListLocalAssets(query local_library.AssetQuery) (local_library.AssetPage, error) {
	return a.LocalLibrary.ListAssets(query)
}
func (a *App) CreateLocalAssetQueryToken(query local_library.AssetQuery) (local_library.AssetQueryToken, error) {
	return a.LocalLibrary.CreateAssetQueryToken(query)
}
func (a *App) BatchUpdateLocalAssetOrganizationByQuery(token string, update local_library.BatchAssetOrganizationUpdate) error {
	return a.LocalLibrary.BatchUpdateAssetOrganizationByQuery(token, update)
}
func (a *App) ListLocalFolders() ([]local_library.FolderDTO, error) {
	return a.LocalLibrary.ListFolders()
}
func (a *App) ListLocalLibraryTags() ([]local_library.TagDTO, error) {
	return a.LocalLibrary.ListTags()
}
func (a *App) CreateLocalLibraryTag(name, color string) (local_library.TagDTO, error) {
	return a.LocalLibrary.CreateTag(name, color)
}
func (a *App) UpdateLocalLibraryTag(id, name, color string) (local_library.TagDTO, error) {
	return a.LocalLibrary.UpdateTag(id, name, color)
}
func (a *App) DeleteLocalLibraryTag(id string) error {
	return a.LocalLibrary.DeleteTag(id)
}
func (a *App) SetLocalAssetTags(id string, tagIDs []string) error {
	return a.LocalLibrary.SetAssetTags(local_library.AssetID(id), tagIDs)
}
func (a *App) BatchUpdateLocalAssetOrganization(update local_library.BatchAssetOrganizationUpdate) error {
	return a.LocalLibrary.BatchUpdateAssetOrganization(update)
}

func (a *App) ListLocalLibraryCollectionGroups() ([]local_library.CollectionGroupDTO, error) {
	return a.LocalLibrary.ListCollectionGroups()
}
func (a *App) UpdateLocalLibraryCollectionGroup(id string, parentID *string, name string, position int) (local_library.CollectionGroupDTO, error) {
	return a.LocalLibrary.UpdateCollectionGroup(id, parentID, name, position)
}
func (a *App) DeleteLocalLibraryCollectionGroup(id string, deleteContents bool) error {
	return a.LocalLibrary.DeleteCollectionGroup(id, deleteContents)
}
func (a *App) ListLocalLibraryCollections() ([]local_library.CollectionDTO, error) {
	return a.LocalLibrary.ListCollections()
}
func (a *App) CreateLocalLibraryCollection(groupID *string, name, notes string) (local_library.CollectionDTO, error) {
	return a.LocalLibrary.CreateCollection(groupID, name, notes)
}
func (a *App) UpdateLocalLibraryCollection(id string, groupID *string, name, notes string, position int) (local_library.CollectionDTO, error) {
	return a.LocalLibrary.UpdateCollection(id, groupID, name, notes, position)
}
func (a *App) DeleteLocalLibraryCollection(id string) error {
	return a.LocalLibrary.DeleteCollection(id)
}
func (a *App) SetLocalAssetCollections(id string, collectionIDs []string) error {
	return a.LocalLibrary.SetAssetCollections(local_library.AssetID(id), collectionIDs)
}
func (a *App) CreateLocalLibraryFolder(parentRelative, name string) (local_library.FolderDTO, error) {
	return a.LocalLibrary.CreateFolder(parentRelative, name)
}
func (a *App) MoveLocalLibraryFolder(relative, destinationParent, topLevelName string) (local_library.FolderDTO, error) {
	return a.LocalLibrary.MoveFolder(relative, destinationParent, topLevelName)
}
func (a *App) PlanLocalLibraryFolderMove(relative, destinationParent, topLevelName, conflictPolicy string) (local_library.FolderFileOperationPlan, error) {
	return a.LocalLibrary.PlanFolderMove(relative, destinationParent, topLevelName, conflictPolicy)
}
func (a *App) ExecuteLocalLibraryFolderMovePlan(planID string) (local_library.FolderFileOperationExecution, error) {
	return a.LocalLibrary.ExecuteFolderMovePlan(planID)
}
func (a *App) GetLocalLibraryFolderProperties(relative string) (local_library.FolderProperties, error) {
	return a.LocalLibrary.GetFolderProperties(relative)
}
func (a *App) PreviewLocalLibraryFolderDeletion(relative string) (local_library.FolderDeletionPreview, error) {
	return a.LocalLibrary.PreviewFolderDeletion(relative)
}
func (a *App) DeleteLocalLibraryFolder(relative string) error {
	return a.LocalLibrary.DeleteFolder(relative)
}
func (a *App) PermanentDeleteActiveLocalLibraryFolder(relative string) error {
	return a.LocalLibrary.PermanentDeleteActiveFolder(relative)
}
func (a *App) ListLocalLibraryTrashedFolders() ([]local_library.FolderTrashEntry, error) {
	return a.LocalLibrary.ListTrashedFolders()
}
func (a *App) RestoreLocalLibraryFolder(trashID, destinationParent, topLevelName string) error {
	return a.LocalLibrary.RestoreFolder(trashID, destinationParent, topLevelName)
}
func (a *App) PermanentDeleteLocalLibraryFolder(trashID string) error {
	return a.LocalLibrary.PermanentDeleteFolder(trashID)
}
func (a *App) StartLocalLibraryScan() error  { return a.LocalLibrary.StartScan() }
func (a *App) PauseLocalLibraryScan() error  { return a.LocalLibrary.PauseScan() }
func (a *App) ResumeLocalLibraryScan() error { return a.LocalLibrary.ResumeScan() }
func (a *App) CancelLocalLibraryScan() error { return a.LocalLibrary.CancelScan() }
func (a *App) ClearLocalLibraryPreviewCache() error {
	return a.LocalLibrary.ClearPreviewCache()
}
func (a *App) RebuildLocalLibraryThumbnails(mode string) (int64, error) {
	return a.LocalLibrary.RebuildThumbnails(mode)
}
func (a *App) GetLocalLibraryCacheStats() (local_library.LocalLibraryCacheStats, error) {
	return a.LocalLibrary.CacheStats()
}
func (a *App) GetLocalLibraryBackups() (local_library.BackupOverview, error) {
	return a.LocalLibrary.BackupOverview()
}
func (a *App) CreateLocalLibraryBackup() (local_library.BackupInfo, error) {
	return a.LocalLibrary.CreateManualBackup()
}
func (a *App) RestoreLocalLibraryBackup(id string) (local_library.LibrarySnapshot, error) {
	return a.LocalLibrary.RestoreBackup(id)
}
func (a *App) GetLocalLibraryPreferences() (local_library.LocalLibraryPreferences, error) {
	return a.LocalLibrary.ImportPreferences()
}

func (a *App) SetLocalLibraryImportMode(mode string) (local_library.LocalLibraryPreferences, error) {
	return a.LocalLibrary.SetImportMode(local_library.ImportMode(mode))
}

func (a *App) ImportLocalLibraryFiles(paths []string, destination string) ([]local_library.ImportResult, error) {
	return a.LocalLibrary.ImportFiles(paths, destination)
}
func (a *App) UpdateLocalAsset(id, title, notes string, rating int, color string, favorite bool) error {
	return a.LocalLibrary.UpdateAsset(local_library.AssetID(id), title, notes, rating, color, favorite)
}
func (a *App) SetLocalAssetCloudLink(id, photoID, cloudURL string) error {
	_ = cloudURL // Cloud URLs are derived from storage metadata and are never persisted.
	if a.Photo == nil {
		return errors.New("云端服务尚未就绪")
	}
	photo, err := a.Photo.GetByID(photoID)
	if err != nil {
		// Keep the local upload state correct even when the detail endpoint is
		// temporarily unavailable; cloud projection sync will fill metadata.
		return a.LocalLibrary.SetAssetCloudLink(local_library.AssetID(id), photoID)
	}
	return a.setLocalAssetCloudLink(id, photo)
}
func (a *App) ClearLocalAssetCloudLink(id string) error {
	return a.LocalLibrary.ClearAssetCloudLink(local_library.AssetID(id))
}
func (a *App) DeleteLocalAssetCloud(id string, force bool) error {
	photoID, err := a.LocalLibrary.AssetCloudLink(local_library.AssetID(id))
	if err != nil {
		return err
	}
	if photoID == "" {
		return a.LocalLibrary.ClearAssetCloudLink(local_library.AssetID(id))
	}
	if a.Photo == nil {
		return errors.New("云端服务尚未就绪")
	}
	if err := a.Photo.Delete(photoID, services.DeletePhotoParams{DeleteOriginal: true, DeleteThumbnail: true, Force: force}); err != nil {
		return err
	}
	return a.LocalLibrary.ClearAssetCloudLink(local_library.AssetID(id))
}
func (a *App) DeleteLocalAssetCloudAndLocal(id string, force bool) error {
	if err := a.DeleteLocalAssetCloud(id, force); err != nil {
		return err
	}
	results, err := a.LocalLibrary.PermanentDeleteAssets([]local_library.AssetID{local_library.AssetID(id)})
	if err != nil {
		return err
	}
	if len(results) == 0 {
		return errors.New("本地照片删除未返回结果")
	}
	if results[0].Status != "deleted" {
		if results[0].Error != "" {
			return errors.New(results[0].Error)
		}
		return errors.New("本地照片删除失败")
	}
	return nil
}
func (a *App) RenameLocalAsset(id, fileName string) (local_library.AssetMoveResult, error) {
	return a.LocalLibrary.RenameAsset(local_library.AssetID(id), fileName)
}
func (a *App) MoveLocalAssets(ids []string, destinationFolder string) ([]local_library.AssetMoveResult, error) {
	assetIDs := make([]local_library.AssetID, len(ids))
	for index, id := range ids {
		assetIDs[index] = local_library.AssetID(id)
	}
	return a.LocalLibrary.MoveAssets(assetIDs, destinationFolder)
}
func (a *App) PlanLocalAssetMove(ids []string, destinationFolder, conflictPolicy string) (local_library.AssetFileOperationPlan, error) {
	assetIDs := make([]local_library.AssetID, len(ids))
	for index, id := range ids {
		assetIDs[index] = local_library.AssetID(id)
	}
	return a.LocalLibrary.PlanAssetMove(assetIDs, destinationFolder, conflictPolicy)
}
func (a *App) ExecuteLocalAssetMovePlan(planID string) (local_library.AssetFileOperationExecution, error) {
	return a.LocalLibrary.ExecuteAssetMovePlan(planID)
}
func (a *App) TrashLocalAssets(ids []string) ([]local_library.TrashResult, error) {
	assetIDs := make([]local_library.AssetID, len(ids))
	for index, id := range ids {
		assetIDs[index] = local_library.AssetID(id)
	}
	return a.LocalLibrary.TrashAssets(assetIDs)
}
func (a *App) PermanentDeleteLocalAssets(ids []string) ([]local_library.TrashResult, error) {
	assetIDs := make([]local_library.AssetID, len(ids))
	for index, id := range ids {
		assetIDs[index] = local_library.AssetID(id)
	}
	return a.LocalLibrary.PermanentDeleteAssets(assetIDs)
}
func (a *App) RestoreLocalAsset(id string) error {
	return a.LocalLibrary.RestoreAsset(local_library.AssetID(id))
}

func (a *App) GetLocalAssetOriginalPaths(ids []string) ([]string, error) {
	assetIDs := make([]local_library.AssetID, len(ids))
	for index, id := range ids {
		assetIDs[index] = local_library.AssetID(id)
	}
	return a.LocalLibrary.OriginalPaths(assetIDs)
}

func (a *App) CopyLocalAssetsToClipboard(ids []string, cut bool) error {
	assetIDs := make([]local_library.AssetID, len(ids))
	for index, id := range ids {
		assetIDs[index] = local_library.AssetID(id)
	}
	return a.LocalLibrary.CopyAssetsToClipboard(assetIDs, cut)
}

func (a *App) RecheckMissingLocalAssets(ids []string) ([]local_library.AssetMaintenanceResult, error) {
	assetIDs := make([]local_library.AssetID, len(ids))
	for index, id := range ids {
		assetIDs[index] = local_library.AssetID(id)
	}
	return a.LocalLibrary.RecheckMissingAssets(assetIDs)
}

func (a *App) RetryLocalAssetPreviews(ids []string) ([]local_library.AssetMaintenanceResult, error) {
	assetIDs := make([]local_library.AssetID, len(ids))
	for index, id := range ids {
		assetIDs[index] = local_library.AssetID(id)
	}
	return a.LocalLibrary.RetryAssetPreviews(assetIDs)
}

func (a *App) RemoveMissingLocalAssets(ids []string) ([]local_library.AssetMaintenanceResult, error) {
	assetIDs := make([]local_library.AssetID, len(ids))
	for index, id := range ids {
		assetIDs[index] = local_library.AssetID(id)
	}
	return a.LocalLibrary.RemoveMissingAssets(assetIDs)
}

func (a *App) OpenLocalAssetInDefaultApp(id string) error {
	path, err := a.LocalLibrary.OriginalPath(local_library.AssetID(id))
	if err != nil {
		return err
	}
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", path).Start()
}

func (a *App) OpenLocalAssetInFileManager(id string) error {
	path, err := a.LocalLibrary.OriginalPath(local_library.AssetID(id))
	if err != nil {
		return err
	}
	return exec.Command("explorer.exe", "/select,"+path).Start()
}

func (a *App) OpenLocalLibraryFolderInFileManager(relative string) error {
	path, err := a.LocalLibrary.FolderPath(relative)
	if err != nil {
		return err
	}
	return exec.Command("explorer.exe", path).Start()
}
