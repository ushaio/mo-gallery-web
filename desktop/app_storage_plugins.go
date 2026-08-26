package main

import (
	"context"
	"errors"
	"os/exec"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"mo-gallery-desktop/services"
	"mo-gallery-desktop/storage_plugins"
	"mo-gallery-desktop/types"
)

func (a *App) GetStorageSources() ([]types.StorageSourceDTO, error) {
	if a.StoragePlugins == nil {
		return []types.StorageSourceDTO{}, nil
	}
	sources := a.StoragePlugins.ListSources()
	result := make([]types.StorageSourceDTO, 0, len(sources))
	for _, source := range sources {
		config := source.Config
		result = append(result, types.StorageSourceDTO{
			ID: source.ID, Name: source.Name, Type: source.PluginID,
			Runtime: storage_plugins.RuntimeDesktopPlugin, PluginID: source.PluginID,
			Enabled: source.Enabled, Status: source.Status, LastError: source.LastError,
			Bucket: stringPointer(config["bucket"]), Region: stringPointer(config["region"]),
			Endpoint: stringPointer(config["endpoint"]), PublicURL: stringPointer(firstConfigValue(config, "publicURL", "publicUrl")),
			BasePath: stringPointer(config["basePath"]), Branch: stringPointer(config["branch"]),
			AccessMethod: stringPointer(config["accessMethod"]),
			Config:       config, Local: true,
		})
	}
	return result, nil
}

func stringPointer(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func firstConfigValue(config map[string]string, keys ...string) string {
	for _, key := range keys {
		if value := config[key]; value != "" {
			return value
		}
	}
	return ""
}
func (a *App) GetDesktopStorageSources() []storage_plugins.SourceDTO {
	if a.StoragePlugins == nil {
		return []storage_plugins.SourceDTO{}
	}
	return a.StoragePlugins.ListSources()
}

// GetDesktopStorageSourceCredentials reads credentials only when the user
// explicitly requests them from an editing form; list responses never expose
// credential values.
func (a *App) GetDesktopStorageSourceCredentials(sourceID string) (map[string]string, error) {
	if a.StoragePlugins == nil {
		return nil, errors.New("桌面存储插件未初始化")
	}
	return a.StoragePlugins.GetSourceCredentials(sourceID)
}

func (a *App) GetDesktopStoragePlugins() []storage_plugins.PluginDescriptor {
	if a.StoragePlugins == nil {
		return []storage_plugins.PluginDescriptor{}
	}
	return a.StoragePlugins.ListPlugins()
}

func (a *App) GetDesktopSystemPlugins() []storage_plugins.PluginDescriptor {
	if a.StoragePlugins == nil {
		return []storage_plugins.PluginDescriptor{}
	}
	return a.StoragePlugins.ListSystemPlugins()
}

func (a *App) GetDesktopPluginMarketplace(force bool) (storage_plugins.MarketplaceCatalog, error) {
	if a.PluginMarketplace == nil {
		return storage_plugins.MarketplaceCatalog{}, errors.New("插件市场未初始化")
	}
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return a.PluginMarketplace.Fetch(ctx, force)
}

func (a *App) InstallDesktopMarketplacePlugin(pluginID, version string) (storage_plugins.PluginDescriptor, error) {
	if a.PluginMarketplace == nil {
		return storage_plugins.PluginDescriptor{}, errors.New("插件市场未初始化")
	}
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return a.PluginMarketplace.Install(ctx, pluginID, version)
}

func (a *App) ListDesktopSystemPluginVersions(pluginID string) ([]storage_plugins.PluginVersionDescriptor, error) {
	if a.StoragePlugins == nil {
		return []storage_plugins.PluginVersionDescriptor{}, errors.New("系统插件未初始化")
	}
	return a.StoragePlugins.ListSystemPluginVersions(pluginID)
}

func (a *App) ListDesktopStoragePluginVersions(pluginID string) ([]storage_plugins.PluginVersionDescriptor, error) {
	if a.StoragePlugins == nil {
		return []storage_plugins.PluginVersionDescriptor{}, errors.New("桌面存储插件未初始化")
	}
	return a.StoragePlugins.ListPluginVersions(pluginID)
}

func (a *App) SelectDesktopStoragePluginManifest() (string, error) {
	if a.ctx == nil {
		return "", errors.New("桌面应用尚未启动")
	}
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "选择存储插件目录"})
}

func (a *App) SelectDesktopStoragePluginPackage() (string, error) {
	if a.ctx == nil {
		return "", errors.New("桌面应用尚未启动")
	}
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:   "选择存储插件包",
		Filters: []runtime.FileFilter{{DisplayName: "Storage plugin package (*.zip)", Pattern: "*.zip"}},
	})
}

func (a *App) InstallDesktopStoragePlugin(pluginDirectory string) (storage_plugins.PluginDescriptor, error) {
	if a.StoragePlugins == nil {
		return storage_plugins.PluginDescriptor{}, errors.New("桌面存储插件未初始化")
	}
	return a.StoragePlugins.InstallPlugin(pluginDirectory)
}

func (a *App) InstallDesktopSystemPlugin(pluginDirectory string) (storage_plugins.PluginDescriptor, error) {
	if a.StoragePlugins == nil {
		return storage_plugins.PluginDescriptor{}, errors.New("系统插件未初始化")
	}
	return a.StoragePlugins.InstallSystemPlugin(pluginDirectory)
}

func (a *App) InstallDesktopStoragePluginPackage(packagePath string) (storage_plugins.PluginDescriptor, error) {
	if a.StoragePlugins == nil {
		return storage_plugins.PluginDescriptor{}, errors.New("桌面存储插件未初始化")
	}
	return a.StoragePlugins.InstallPluginPackage(packagePath)
}

func (a *App) InstallDesktopSystemPluginPackage(packagePath string) (storage_plugins.PluginDescriptor, error) {
	if a.StoragePlugins == nil {
		return storage_plugins.PluginDescriptor{}, errors.New("系统插件未初始化")
	}
	return a.StoragePlugins.InstallSystemPluginPackage(packagePath)
}

func (a *App) RollbackDesktopStoragePlugin(pluginID, version string) error {
	if a.StoragePlugins == nil {
		return errors.New("桌面存储插件未初始化")
	}
	return a.StoragePlugins.RollbackPlugin(pluginID, version)
}

func (a *App) RollbackDesktopSystemPlugin(pluginID, version string) error {
	if a.StoragePlugins == nil {
		return errors.New("系统插件未初始化")
	}
	return a.StoragePlugins.RollbackSystemPlugin(pluginID, version)
}

func (a *App) UninstallDesktopStoragePlugin(pluginID string) error {
	if a.StoragePlugins == nil {
		return errors.New("桌面存储插件未初始化")
	}
	return a.StoragePlugins.UninstallPlugin(pluginID)
}

func (a *App) UninstallDesktopSystemPlugin(pluginID string) error {
	if a.StoragePlugins == nil {
		return errors.New("系统插件未初始化")
	}
	return a.StoragePlugins.UninstallSystemPlugin(pluginID)
}

func (a *App) OpenDesktopStoragePluginLocation(pluginID string) error {
	if a.StoragePlugins == nil {
		return errors.New("桌面存储插件未初始化")
	}
	location, err := a.StoragePlugins.PluginLocation(pluginID)
	if err != nil {
		return err
	}
	switch runtime.Environment(a.ctx).Platform {
	case "windows":
		return exec.Command("explorer", location).Start()
	case "darwin":
		return exec.Command("open", location).Start()
	default:
		return exec.Command("xdg-open", location).Start()
	}
}

func (a *App) OpenDesktopSystemPluginLocation(pluginID string) error {
	return a.OpenDesktopStoragePluginLocation(pluginID)
}

func (a *App) CreateDesktopStorageSource(input storage_plugins.SourceInput) (storage_plugins.SourceDTO, error) {
	if a.StoragePlugins == nil {
		return storage_plugins.SourceDTO{}, errors.New("桌面存储插件未初始化")
	}
	source, err := a.StoragePlugins.CreateSource(input)
	if err != nil {
		return storage_plugins.SourceDTO{}, err
	}
	a.syncStorageSourceToCloud(source, false)
	return source, nil
}

func (a *App) UpdateDesktopStorageSource(input storage_plugins.SourceInput) (storage_plugins.SourceDTO, error) {
	if a.StoragePlugins == nil {
		return storage_plugins.SourceDTO{}, errors.New("桌面存储插件未初始化")
	}
	source, err := a.StoragePlugins.UpdateSource(input)
	if err != nil {
		return storage_plugins.SourceDTO{}, err
	}
	a.syncStorageSourceToCloud(source, false)
	return source, nil
}

func (a *App) SetDesktopStorageSourceEnabled(id string, enabled bool) (storage_plugins.SourceDTO, error) {
	if a.StoragePlugins == nil {
		return storage_plugins.SourceDTO{}, errors.New("桌面存储插件未初始化")
	}
	return a.StoragePlugins.SetSourceEnabled(id, enabled)
}

func (a *App) DeleteDesktopStorageSource(id string) error {
	if a.StoragePlugins == nil {
		return errors.New("桌面存储插件未初始化")
	}
	if err := a.StoragePlugins.DeleteSource(id); err != nil {
		return err
	}
	a.syncStorageSourceToCloud(storage_plugins.SourceDTO{ID: id}, true)
	return nil
}

func (a *App) TestDesktopStorageSource(sourceID string) (storage_plugins.HealthResult, error) {
	if a.StoragePlugins == nil {
		return storage_plugins.HealthResult{Status: "error"}, errors.New("桌面存储插件未初始化")
	}
	return a.StoragePlugins.TestSource(context.Background(), sourceID)
}

// ─── Storage Scan/Cleanup ─────────────────────────────

func (a *App) ScanStorage(params services.StorageScanParams) (*services.StorageScanResult, error) {
	return a.Storage.Scan(params)
}
func (a *App) CleanupStorage(keys []string, provider string) (*services.StorageCleanupResult, error) {
	return a.Storage.Cleanup(keys, provider)
}
